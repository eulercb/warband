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

/** Seconds the hero must dwell on a shop item before it is bought (item 2). */
export const BUY_DWELL_S = 0.45;

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

// item 2 / item 3: the walk-up coin shop. Buyable stalls sit on a row BELOW the
// hero's spawn (y=780). item 3 moved them off the spawn→relics→vortex path: the
// upgrade relics and descent vortex are UP the arena, so heading for them used to
// force the hero across the shop row (a mis-selection trap). Now the shop is behind
// the spawn — a deliberate turn back down — and a dwell + moving-guard still means
// walking through never buys. 80u below spawn is well inside the half-arena torus
// budget, so the stalls never nearest-copy flip to the far edge.
const SHOP_ROW_Y = 860;
const SHOP_PICKUP_RADIUS = 52;
const SHOP_READ_RADIUS = 150;

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

/** One ephemeral-shop perk placed on the floor as a buyable stall (item 2). */
export interface ShopOffer {
  /** EphemeralId relayed on buy. */
  id: string;
  /** Short caption drawn under the stall (icon + name + cost). */
  label: string;
  /** Full description (for the inspector). */
  desc: string;
  /** Coin cost — the scene gates the buy on the hero's mirrored coins. */
  cost: number;
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

/** Internal shop-stall model (view + the ephemeral offer it sells) (item 2). */
interface ShopItem {
  id: number;
  pos: Vec2;
  offer: ShopOffer;
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

/** A shop stall the hero can currently read (for the inspector chip) (item 3). */
export interface ShopFocus {
  offer: ShopOffer;
  /** Affordable right now (coins ≥ cost and not sold out)? */
  affordable: boolean;
  /** Already bought — a single-buy passive the hero owns? */
  soldOut: boolean;
  /** Dwell progress 0..1 toward buying (0 unless actively dwelling on it). */
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
  private readonly shopItems: ShopItem[] = [];
  private pendingEvents: GameEvent[] = [];

  /** Relic the hero is actively dwelling on, and how long (seconds). */
  private dwellId: number | null = null;
  private dwellS = 0;
  /** Seconds the hero has stood continuously inside the OPEN vortex. */
  private vortexDwellS = 0;
  /** Claims not yet drained by the UI (each maps to a chooseUpgrade call). */
  private pendingClaims: Array<{ kind: LootKind; offer: RewardOffer }> = [];

  // item 2: walk-up coin shop bookkeeping. Coins + sold-out state are mirrored in
  // from the store each frame; a shop stall fires (armed-latch, so re-buyable after
  // stepping off) once dwelt on, gated on affordability.
  private coins = 0;
  private soldOut = new Set<string>();
  private shopDwellId: number | null = null;
  private shopDwellS = 0;
  private shopArmedId: number | null = null;
  private pendingBuys: ShopOffer[] = [];

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
    /** item 2: the ephemeral-shop perks to lay out as buyable stalls (may be empty). */
    shop: ShopOffer[] = [],
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
    this.layoutShop(shop);
  }

  /** Lay the shop stalls in a row below the spawn, off the up-arena path (item 3). */
  private layoutShop(shop: ShopOffer[]): void {
    const n = shop.length;
    if (n === 0) return;
    const spread = Math.min(760, 130 * (n - 1));
    const startX = ARENA_W / 2 - spread / 2;
    shop.forEach((offer, i) => {
      const x = n === 1 ? ARENA_W / 2 : startX + (spread * i) / (n - 1);
      this.shopItems.push({ id: this.nextId++, pos: { x, y: SHOP_ROW_Y }, offer });
    });
  }

  /**
   * Mirror the store's coin purse + which stalls are sold out (single-buy passives
   * already owned) so the walk-up shop gates buys exactly like the List view (item 2).
   */
  setShopState(coins: number, soldOut: readonly string[]): void {
    this.coins = coins;
    this.soldOut = new Set(soldOut);
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
    this.updateShopDwell(step); // item 2

    const state = this.world.toRenderState(this.localPlayerId);
    state.events = this.pendingEvents;
    this.pendingEvents = [];
    state.loot = [
      ...this.relics.map((r) => this.lootView(r)),
      ...this.shopItems.map((s) => this.shopView(s)), // item 2
    ];
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
  // Walk-up coin shop (item 2) — dwell to buy, armed-latch so it's re-buyable,
  // gated on affordability + sold-out state mirrored from the store.
  // -------------------------------------------------------------------------

  /** The nearest AFFORDABLE, not-sold-out stall under the hero (not armed), or null. */
  private buyableUnder(): ShopItem | null {
    let best: ShopItem | null = null;
    let bestD = SHOP_PICKUP_RADIUS;
    for (const s of this.shopItems) {
      if (s.id === this.shopArmedId) continue;
      if (this.soldOut.has(s.offer.id) || this.coins < s.offer.cost) continue;
      const d = this.heroDist(s.pos);
      if (d <= bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  /** Clear the armed latch once the hero has stepped fully off the bought stall. */
  private clearShopArmed(): void {
    if (this.shopArmedId == null) return;
    const armed = this.shopItems.find((s) => s.id === this.shopArmedId);
    if (!armed || this.heroDist(armed.pos) > SHOP_PICKUP_RADIUS) this.shopArmedId = null;
  }

  /** Advance the dwell-to-buy on the stall the hero stands on (moving = no buy). */
  private updateShopDwell(dt: number): void {
    this.clearShopArmed();
    const moving = Math.hypot(this.input.move.x, this.input.move.y) > 0.35;
    const target = moving ? null : this.buyableUnder();
    if (!target) {
      this.shopDwellId = null;
      this.shopDwellS = 0;
      return;
    }
    if (this.shopDwellId !== target.id) {
      this.shopDwellId = target.id;
      this.shopDwellS = 0;
    }
    this.shopDwellS += dt;
    if (this.shopDwellS >= BUY_DWELL_S) {
      this.shopDwellId = null;
      this.shopDwellS = 0;
      this.shopArmedId = target.id; // don't re-buy until the hero steps off
      this.pendingBuys.push(target.offer);
    }
  }

  /** Drain shop buys since the last call (each maps to a buyEphemeral call). */
  takeShopBuys(): ShopOffer[] {
    if (this.pendingBuys.length === 0) return [];
    const out = this.pendingBuys;
    this.pendingBuys = [];
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

  /**
   * Is the descent vortex open? ALWAYS true (item 11): the walkable room must never
   * soft-lock progression, so a player can step into the vortex and descend to the
   * next boss even if they chose to skip a pick. The `charge` visual (see
   * `vortexView`) still fills as boons are claimed, but claiming is never a gate on
   * descent — matching the accessible List-view "ready" button, which likewise never
   * required a claim.
   */
  vortexOpen(): boolean {
    return true;
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

  /**
   * The shop stall the hero can currently read (nearest within read range), or null
   * (item 3). Mirrors focus() over the stalls so the walkable room can surface an
   * item's name / desc / cost without opening the List view — on gamepad too, since
   * "focus" here is hero proximity, not DOM focus. Carries affordability / sold-out /
   * dwell so the chip can echo exactly what the buy interaction will do.
   */
  shopFocus(): ShopFocus | null {
    let best: ShopItem | null = null;
    let bestD = SHOP_READ_RADIUS;
    for (const s of this.shopItems) {
      const d = this.heroDist(s.pos);
      if (d <= bestD) {
        bestD = d;
        best = s;
      }
    }
    if (!best) return null;
    const soldOut = this.soldOut.has(best.offer.id);
    const affordable = !soldOut && this.coins >= best.offer.cost;
    const dwell = this.shopDwellId === best.id ? Math.min(1, this.shopDwellS / BUY_DWELL_S) : 0;
    return { offer: best.offer, affordable, soldOut, dwell };
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

  /** item 2: a shop stall projected as a loot view — dims (locked) when the hero
   *  can't afford it or it's sold out, glows when affordable + near. */
  private shopView(s: ShopItem): LootView {
    const affordable = this.coins >= s.offer.cost && !this.soldOut.has(s.offer.id);
    const focused = this.shopDwellId === s.id;
    return {
      id: s.id,
      kind: 'shop',
      pos: { ...s.pos },
      radius: RELIC_RADIUS,
      pickupRadius: SHOP_PICKUP_RADIUS,
      claimed: false,
      locked: !affordable,
      active: affordable && (focused || this.heroDist(s.pos) <= SHOP_READ_RADIUS),
      label: s.offer.label,
    };
  }

  private vortexView(): VortexView {
    const p = this.progress();
    const kinds = (p.totalGeneric > 0 ? 1 : 0) + (p.totalChar > 0 ? 1 : 0);
    const done =
      (p.totalGeneric > 0 && p.claimedGeneric > 0 ? 1 : 0) +
      (p.totalChar > 0 && p.claimedChar > 0 ? 1 : 0);
    // The vortex is ALWAYS open (item 11) so the room can never soft-lock; `charge`
    // still reflects how many boons have been claimed so the ring visibly intensifies
    // as you pick, without ever gating the descent.
    const charge = kinds === 0 ? 1 : done / kinds;
    const open = true;
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
