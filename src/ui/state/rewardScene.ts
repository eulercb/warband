/**
 * Warband — the walkable REWARD ROOM. A tiny, local, offline scene (the real
 * engine `World` in `reward` mode: heroes only, no boss, no hazards) used for the
 * diegetic between-boss upgrade phase. Relic pickups lie on the floor — walk over
 * one to claim its boon — and a descent VORTEX opens once you've claimed your
 * boons; walk into it to ready up for the next boss.
 *
 * Mirrors `Playground`: it wraps a `World`, steps it at the fixed sim rate, and
 * returns the frame's `RenderState` (augmented with the room's relic + vortex
 * views) for the real renderer. The relic CONTENT (which upgrade each relic
 * grants) is a UI concern passed in as offers; the engine world stays content-
 * agnostic. No networking — picks are relayed by the React layer exactly as the
 * flat upgrade screen did (chooseUpgrade / chooseCharUpgrade / setNextReady).
 */
import { World } from '../../engine/world/world';
import { SIM_DT, ARENA_W } from '../../engine/core/constants';
import { dist } from '../../engine/core/torus';
import type {
  ClassId,
  GameEvent,
  InputCommand,
  LootKind,
  LootView,
  RenderState,
  Vec2,
  VortexView,
} from '../../engine/core/types';

/** Synthetic peer id for the local reward-room hero (never hits the network). */
const LOCAL_PEER = 'local:reward';

/** Seconds the hero must dwell on a relic before it is claimed (anti-misgrab). */
export const CLAIM_DWELL_S = 0.4;

/**
 * Seconds the hero must stand inside the OPEN vortex before descending. A commit
 * dwell (not instant on-enter) so a hero can't accidentally clip the ring and
 * fire an irreversible advance — and so stepping in reads as "charging up".
 */
export const DESCENT_DWELL_S = 0.7;

const ZERO_INPUT: InputCommand = {
  seq: 0,
  move: { x: 0, y: 0 },
  aim: { x: 0, y: -1 },
  buttons: { basic: false, a1: false, a2: false, a3: false, revive: false },
};

// --- Room geometry (world units; arena is ARENA_W x ARENA_H = 1600 x 1000) ----
// The hero spawns at y = ARENA_H - 220 = 780 (see World.spawnPlayers). Every
// interactable must stay within ARENA_H/2 (500) of that spawn UP the arena, or
// the torus nearest-copy projection would flip it to the far (bottom) edge and
// the room would render inside-out. Vortex 400 / relics 560 / hero 780 gives a
// clean bottom-to-top march: spawn → relics → vortex, no wrap flip.
const VORTEX_POS: Vec2 = { x: ARENA_W / 2, y: 400 };
const VORTEX_RADIUS = 48;
const VORTEX_ACTIVE_RADIUS = 96;
const RELIC_RADIUS = 24;
const RELIC_PICKUP_RADIUS = 52;
/** Hero within this radius of a relic can READ it (drives the inspector chip). */
const RELIC_READ_RADIUS = 150;
/** Relics sit on this row (between the hero's spawn and the vortex). */
const RELIC_ROW_Y = 560;

/** One rolled upgrade offer placed on the floor as a relic. */
export interface RewardOffer {
  /** Upgrade id relayed on claim (UpgradeId or char-upgrade id). */
  id: string;
  /** Short caption drawn under the relic (icon + name). */
  label: string;
  /** Full description shown in the inspector when the hero is near. */
  desc: string;
}

export interface RewardOffers {
  generic: RewardOffer[];
  char: RewardOffer[];
}

/** Internal relic model (view + the offer it carries + claim bookkeeping). */
interface Relic {
  id: number;
  kind: LootKind;
  pos: Vec2;
  offer: RewardOffer;
  claimed: boolean;
  locked: boolean;
}

/** A relic the hero can currently read (for the inspector chip). */
export interface RelicFocus {
  kind: LootKind;
  offer: RewardOffer;
  claimed: boolean;
  locked: boolean;
  /** Dwell progress 0..1 toward claiming (0 unless actively being claimed). */
  dwell: number;
}

/** Snapshot of what the room has been claimed so far (for HUD / gating). */
export interface RewardProgress {
  claimedGeneric: number;
  totalGeneric: number;
  claimedChar: number;
  totalChar: number;
  /** Every offered kind has been resolved (claimed, or that kind had no offers). */
  allClaimed: boolean;
}

export class RewardScene {
  private world: World;
  private lastMs = 0;
  private acc = 0;
  private input: InputCommand = ZERO_INPUT;
  private readonly relics: Relic[] = [];
  private pendingEvents: GameEvent[] = [];

  /** Relic the hero is actively dwelling on, and how long (seconds). */
  private dwellId: number | null = null;
  private dwellS = 0;
  /** Seconds the hero has stood continuously inside the OPEN vortex. */
  private vortexDwellS = 0;
  /** Claims not yet drained by the UI (each maps to a chooseUpgrade call). */
  private pendingClaims: Array<{ kind: LootKind; offer: RewardOffer }> = [];

  private nextId = 1;

  constructor(
    name: string,
    classId: ClassId,
    offers: RewardOffers,
    baseScore = 0,
    /**
     * The hero's EARNED loadout so far (item 13): their subclass skills and extra
     * classes, so the reward-room hero shows the same sub1/sub2 + Swap buttons the
     * fight does. Absent for a plain (no-subclass, single-class) hero.
     */
    loadout: { subSkills?: string[]; extraClasses?: ClassId[] } = {},
  ) {
    this.world = new World({
      monsterId: 'dummy', // required by World init; no boss spawns in reward mode
      seed: (Math.random() * 2 ** 31) | 0,
      players: [
        {
          peerId: LOCAL_PEER,
          name: name || 'Hero',
          classId,
          baseScore,
          subSkills: loadout.subSkills,
          extraClasses: loadout.extraClasses,
        },
      ],
      scene: 'reward',
    });
    this.layoutRelics(offers);
  }

  get localPlayerId(): number | null {
    return this.world.playerIdByPeer(LOCAL_PEER);
  }

  /** Latest sampled local input (held state; the sim edge-detects presses). */
  setInput(cmd: InputCommand): void {
    this.input = cmd;
  }

  /**
   * Advance the sim to `nowMs` (fixed-timestep accumulator, same shape as the
   * playground), process relic pickups, and return the frame's render state with
   * the room's relic + vortex views attached. `frozen` (an overlay is up) holds
   * the interaction clocks so nothing claims or descends behind a menu.
   */
  frame(nowMs: number, frozen = false): RenderState {
    if (this.lastMs === 0) this.lastMs = nowMs;
    const dt = Math.min((nowMs - this.lastMs) / 1000, 0.25);
    this.acc += dt;
    this.lastMs = nowMs;
    const inputs = new Map([[LOCAL_PEER, this.input]]);
    while (this.acc >= SIM_DT) {
      this.world.step(SIM_DT, inputs);
      this.pendingEvents.push(...this.world.events);
      this.acc -= SIM_DT;
    }
    // Dwell-to-claim + descent-charge run on the render clock (like the
    // playground's totems), so they stay smooth regardless of how many sim
    // steps a frame ran. While an overlay is up, both are held frozen.
    const step = frozen ? 0 : Math.max(0, dt);
    this.updateDwell(step);
    this.updateVortexDwell(step);

    const state = this.world.toRenderState(this.localPlayerId);
    state.events = this.pendingEvents;
    this.pendingEvents = [];
    state.loot = this.relics.map((r) => this.lootView(r));
    state.vortex = this.vortexView();
    return state;
  }

  /** Accumulate (or reset) the descent charge while the hero stands in the vortex. */
  private updateVortexDwell(dt: number): void {
    if (this.insideOpenVortex()) this.vortexDwellS += dt;
    else this.vortexDwellS = 0;
  }

  /** The local hero's current world position, or null before the first frame. */
  private heroPos(): Vec2 | null {
    const p = this.world.players[0];
    return p ? p.pos : null;
  }

  /** Distance from the hero to a point on the (wrapping) arena, or Infinity. */
  private heroDist(pos: Vec2): number {
    const hp = this.heroPos();
    return hp ? dist(hp, pos) : Infinity;
  }

  // -------------------------------------------------------------------------
  // Relic layout + claim logic
  // -------------------------------------------------------------------------

  private layoutRelics(offers: RewardOffers): void {
    // Generic boons cluster left-of-centre, class boons right-of-centre, both on
    // a shallow arc the hero walks up through on the way to the vortex.
    this.placeSet(offers.generic, 'generic', ARENA_W * 0.34);
    this.placeSet(offers.char, 'char', ARENA_W * 0.66);
  }

  private placeSet(set: RewardOffer[], kind: LootKind, centerX: number): void {
    const n = set.length;
    if (n === 0) return;
    const spread = Math.min(260, 90 * (n - 1)); // total width of the cluster
    const startX = centerX - spread / 2;
    set.forEach((offer, i) => {
      const x = n === 1 ? centerX : startX + (spread * i) / (n - 1);
      // Gentle arc: the middle relics sit slightly forward (toward the hero).
      const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1; // -1..1
      const y = RELIC_ROW_Y + 46 * (t * t) - 23;
      this.relics.push({
        id: this.nextId++,
        kind,
        pos: { x, y },
        offer,
        claimed: false,
        locked: false,
      });
    });
  }

  /** Advance the dwell-to-claim on whichever unclaimed relic the hero stands on. */
  private updateDwell(dt: number): void {
    const target = this.claimableUnder();
    if (!target) {
      this.dwellId = null;
      this.dwellS = 0;
      return;
    }
    if (this.dwellId !== target.id) {
      this.dwellId = target.id;
      this.dwellS = 0;
    }
    this.dwellS += dt;
    if (this.dwellS >= CLAIM_DWELL_S) this.claim(target);
  }

  /** The nearest unclaimed, unlocked relic within pickup range, or null. */
  private claimableUnder(): Relic | null {
    let best: Relic | null = null;
    let bestD = RELIC_PICKUP_RADIUS;
    for (const r of this.relics) {
      if (r.claimed || r.locked) continue;
      const d = this.heroDist(r.pos);
      if (d <= bestD) {
        bestD = d;
        best = r;
      }
    }
    return best;
  }

  private claim(relic: Relic): void {
    relic.claimed = true;
    // One boon per kind: lock the rest of this kind so it can't be re-picked
    // (mirrors the host's one-generic-one-character cap per interstitial).
    for (const r of this.relics) {
      if (r.kind === relic.kind && r !== relic && !r.claimed) r.locked = true;
    }
    this.dwellId = null;
    this.dwellS = 0;
    this.pendingClaims.push({ kind: relic.kind, offer: relic.offer });
  }

  /**
   * Claim a specific relic from OUTSIDE the walk-over flow (the accessible list
   * view). Keeps the diegetic scene in sync — the relic pops, its siblings lock,
   * and the vortex can open — without re-emitting a pending claim (the caller
   * already relayed the pick). No-op if that offer was already claimed/locked.
   */
  markClaimed(kind: LootKind, offerId: string): void {
    const relic = this.relics.find(
      (r) => r.kind === kind && r.offer.id === offerId && !r.claimed && !r.locked,
    );
    if (!relic) return;
    relic.claimed = true;
    for (const r of this.relics) {
      if (r.kind === relic.kind && r !== relic && !r.claimed) r.locked = true;
    }
    this.dwellId = null;
    this.dwellS = 0;
  }

  /**
   * Drain relic claims that happened since the last call. The UI relays each one
   * (chooseUpgrade for 'generic', chooseCharUpgrade for 'char').
   */
  takeClaims(): Array<{ kind: LootKind; offer: RewardOffer }> {
    if (this.pendingClaims.length === 0) return [];
    const out = this.pendingClaims;
    this.pendingClaims = [];
    return out;
  }

  // -------------------------------------------------------------------------
  // Queries for the UI (proximity / progress / vortex)
  // -------------------------------------------------------------------------

  /** Claimed/total tally per kind, and whether every offered kind is resolved. */
  progress(): RewardProgress {
    const gen = this.relics.filter((r) => r.kind === 'generic');
    const chr = this.relics.filter((r) => r.kind === 'char');
    const claimedGeneric = gen.filter((r) => r.claimed).length;
    const claimedChar = chr.filter((r) => r.claimed).length;
    // A kind with no offers is auto-satisfied so the room can never soft-lock.
    const genDone = gen.length === 0 || claimedGeneric > 0;
    const chrDone = chr.length === 0 || claimedChar > 0;
    return {
      claimedGeneric,
      totalGeneric: gen.length,
      claimedChar,
      totalChar: chr.length,
      allClaimed: genDone && chrDone,
    };
  }

  /** Is the descent vortex open (every boon claimed)? */
  vortexOpen(): boolean {
    return this.progress().allClaimed;
  }

  /** Is the hero physically inside the OPEN vortex right now? */
  private insideOpenVortex(): boolean {
    return this.vortexOpen() && this.heroDist(VORTEX_POS) <= VORTEX_ACTIVE_RADIUS;
  }

  /** Is the hero standing inside the OPEN vortex right now (drives the pull FX)? */
  standingInVortex(): boolean {
    return this.insideOpenVortex();
  }

  /** Descent charge 0..1 — how long the hero has stood in the open vortex. */
  descentCharge(): number {
    return Math.min(1, this.vortexDwellS / DESCENT_DWELL_S);
  }

  /**
   * Has the hero committed to descending? True once they have stood inside the
   * open vortex past the descent dwell — a deliberate commit so a stray clip of
   * the ring can't fire the irreversible advance.
   */
  readyToDescend(): boolean {
    return this.insideOpenVortex() && this.vortexDwellS >= DESCENT_DWELL_S;
  }

  /** The relic the hero can currently read (nearest within read range), or null. */
  focus(): RelicFocus | null {
    let best: Relic | null = null;
    let bestD = RELIC_READ_RADIUS;
    for (const r of this.relics) {
      const d = this.heroDist(r.pos);
      if (d <= bestD) {
        bestD = d;
        best = r;
      }
    }
    if (!best) return null;
    const dwell = this.dwellId === best.id ? Math.min(1, this.dwellS / CLAIM_DWELL_S) : 0;
    return {
      kind: best.kind,
      offer: best.offer,
      claimed: best.claimed,
      locked: best.locked,
      dwell,
    };
  }

  // -------------------------------------------------------------------------
  // View projection
  // -------------------------------------------------------------------------

  private lootView(r: Relic): LootView {
    const focused = this.dwellId === r.id;
    return {
      id: r.id,
      kind: r.kind,
      pos: { ...r.pos },
      radius: RELIC_RADIUS,
      pickupRadius: RELIC_PICKUP_RADIUS,
      claimed: r.claimed,
      locked: r.locked,
      active: !r.claimed && !r.locked && (focused || this.heroDist(r.pos) <= RELIC_READ_RADIUS),
      label: r.offer.label,
    };
  }

  private vortexView(): VortexView {
    const p = this.progress();
    const kinds = (p.totalGeneric > 0 ? 1 : 0) + (p.totalChar > 0 ? 1 : 0);
    const done =
      (p.totalGeneric > 0 && p.claimedGeneric > 0 ? 1 : 0) +
      (p.totalChar > 0 && p.claimedChar > 0 ? 1 : 0);
    const charge = kinds === 0 ? 1 : done / kinds;
    const open = p.allClaimed;
    return {
      id: 0,
      pos: { ...VORTEX_POS },
      radius: VORTEX_RADIUS,
      activeRadius: VORTEX_ACTIVE_RADIUS,
      charge,
      open,
      standing: open && this.heroDist(VORTEX_POS) <= VORTEX_ACTIVE_RADIUS,
    };
  }
}
