/**
 * Warband — the walkable WAR ROOM. A local, offline scene (the engine `World` in
 * `war` mode: heroes only, no combat) that replaces the flat host-setup grid: you
 * pick your run's opening boss by walking up to its effigy, choose single-fight
 * vs gauntlet by stepping into a portal, and commit by walking into the host
 * portal to raise your banner. Mirrors RewardScene — wraps a World, steps it, and
 * projects the room's stations into the RenderState for the real renderer. No
 * networking: the host action is relayed by the React layer exactly as the flat
 * "Create Room" button was.
 */
import { World } from '../../engine/world/world';
import { SIM_DT, ARENA_W } from '../../engine/core/constants';
import { dist } from '../../engine/core/torus';
import { MONSTER_IDS, MONSTERS } from '../../engine/content/monsters';
import type {
  BossTier,
  ClassId,
  GameEvent,
  InputCommand,
  MonsterId,
  RenderState,
  StationKind,
  StationView,
  Vec2,
} from '../../engine/core/types';

/** Synthetic peer id for the local war-room hero (never hits the network). */
const LOCAL_PEER = 'local:war';

/** Seconds to dwell to pick a boss / tier / run mode (cheap, reversible). */
export const WAR_SELECT_DWELL_S = 0.3;
/** Seconds to dwell in the host portal before it fires (a deliberate commit). */
export const WAR_HOST_DWELL_S = 0.8;

const ZERO_INPUT: InputCommand = {
  seq: 0,
  move: { x: 0, y: 0 },
  aim: { x: 0, y: -1 },
  buttons: { basic: false, a1: false, a2: false, a3: false, revive: false },
};

// --- Room geometry (world units; hero spawns at (800, 780)) ------------------
const TIER_GATE_Y = 360;
const BOSS_ROW_Y = 510;
const SINGLE_PORTAL: Vec2 = { x: 470, y: 660 };
const GAUNTLET_PORTAL: Vec2 = { x: 1130, y: 660 };
const HOST_PORTAL: Vec2 = { x: ARENA_W / 2, y: 880 };
const GATE_RADIUS = 30;
const GATE_TRIGGER = 52;
const EFFIGY_RADIUS = 30;
const EFFIGY_TRIGGER = 44;
const PORTAL_RADIUS = 46;
const PORTAL_TRIGGER = 84;

// Run-mode MODIFIER toggles: ON/OFF pedestals in a row along the bottom, flanking
// the host portal. Placed at y=820 so the whole row clears the run-mode portals
// (y=660): the 160u vertical gap already exceeds any adjacent trigger sum, so the
// only horizontal constraint is the host portal (x=800, r84) — toggle centres stay
// clear of it — and each other (spacing 190 ≫ 2·TOGGLE_TRIGGER, so no ring touches).
// Left pair = ungated (compose with any run); right pair = gauntlet-only.
const TOGGLE_ROW_Y = 820;
const TOGGLE_RADIUS = 30;
const TOGGLE_TRIGGER = 46;
interface ToggleSpec {
  kind: StationKind;
  x: number;
  label: string;
  color: number;
  /** Only meaningful for a gauntlet — greyed out + inert for a single fight. */
  gauntletOnly: boolean;
}
const TOGGLE_SPECS: readonly ToggleSpec[] = [
  { kind: 'chaosforge', x: 430, label: '⚗️ Chaos Forge', color: 0x3fd0c0, gauntletOnly: false },
  { kind: 'chaosdraft', x: 620, label: '🎲 Chaos Draft', color: 0xd85ac0, gauntletOnly: false },
  { kind: 'hardcore', x: 980, label: '💀 Hardcore', color: 0xd9463e, gauntletOnly: true },
  { kind: 'daily', x: 1170, label: '☀️ Run of the Day', color: 0xf2c14e, gauntletOnly: true },
];
/** Toggle kinds that only apply to a gauntlet (sealed for a single fight). */
const GAUNTLET_ONLY_TOGGLES = new Set<StationKind>(
  TOGGLE_SPECS.filter((t) => t.gauntletOnly).map((t) => t.kind),
);

const TIERS: readonly BossTier[] = ['easy', 'medium', 'hard'];
const TIER_LABEL: Record<BossTier, string> = { easy: 'EASY', medium: 'MEDIUM', hard: 'HARD' };
const TIER_COLOR: Record<BossTier, number> = {
  easy: 0x5bbf7a,
  medium: 0xf2c14e,
  hard: 0xd9463e,
};

/** Every pickable boss of a difficulty tier, in declaration order. */
function bossesOfTier(tier: BossTier): MonsterId[] {
  return MONSTER_IDS.filter((id) => MONSTERS[id].tier === tier);
}

/** A trigger drained by the UI to relay a selection / action. */
export interface WarTrigger {
  kind: StationKind;
  refId?: string;
}

interface WarStation {
  id: number;
  kind: StationKind;
  pos: Vec2;
  refId?: string;
  radius: number;
  triggerRadius: number;
  label?: string;
  color?: number;
  portal?: boolean;
  /** Dwell required before this station commits. */
  dwell: number;
}

export class WarScene {
  private world: World;
  private lastMs = 0;
  private acc = 0;
  private input: InputCommand = ZERO_INPUT;
  private pendingEvents: GameEvent[] = [];

  private monsterId: MonsterId;
  private gauntlet: boolean;
  private activeTier: BossTier;

  // Run-mode modifier toggle states, mirrored from the store (setters below) and
  // flipped in place on a walk-commit. `dailySeed` reflects seedMode === 'daily'
  // (the walkable station only toggles daily ↔ random; 'custom' stays List-view only).
  private hardcore = false;
  private chaosForge = false;
  private dailySeed = false;
  private randomKits = false;

  private stations: WarStation[] = [];
  private dwellId: number | null = null;
  private dwellS = 0;
  /** A station that just fired; skipped until the hero steps off it (so the
   * host portal can't hands-free re-fire every dwell while you stand on it). */
  private armedId: number | null = null;
  private pendingTriggers: WarTrigger[] = [];
  private nextId = 1;

  constructor(name: string, classId: ClassId, monsterId: MonsterId, gauntlet: boolean) {
    this.monsterId = monsterId;
    this.gauntlet = gauntlet;
    this.activeTier = MONSTERS[monsterId]?.tier ?? 'easy';
    this.world = new World({
      monsterId: 'dummy', // required by World init; no boss spawns in a scene world
      seed: (Math.random() * 2 ** 31) | 0,
      players: [{ peerId: LOCAL_PEER, name: name || 'Hero', classId }],
      scene: 'war',
    });
    this.rebuild();
  }

  get localPlayerId(): number | null {
    return this.world.playerIdByPeer(LOCAL_PEER);
  }

  setInput(cmd: InputCommand): void {
    this.input = cmd;
  }

  /** Mirror the store's boss pick so the selected effigy stays lit. */
  setMonster(id: MonsterId): void {
    this.monsterId = id;
  }

  /** Mirror the store's run mode so the right portal stays lit. */
  setGauntlet(on: boolean): void {
    this.gauntlet = on;
  }

  /** Mirror the store's Hardcore flag so its toggle stays lit (List-view sync). */
  setHardcore(on: boolean): void {
    this.hardcore = on;
  }

  /** Mirror the store's Chaos Forge flag so its toggle stays lit (List-view sync). */
  setChaosForge(on: boolean): void {
    this.chaosForge = on;
  }

  /** Mirror whether the store's seed mode is 'daily' so the Run-of-the-Day toggle
   *  stays lit (List-view sync; a 'custom' seed reads as off here). */
  setSeedDaily(on: boolean): void {
    this.dailySeed = on;
  }

  /** Mirror the store's Chaos Draft flag so its toggle stays lit (List-view sync). */
  setRandomKits(on: boolean): void {
    this.randomKits = on;
  }

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
    this.updateDwell(frozen ? 0 : Math.max(0, dt));
    const state = this.world.toRenderState(this.localPlayerId);
    state.events = this.pendingEvents;
    this.pendingEvents = [];
    state.stations = this.stations.map((s) => this.stationView(s));
    return state;
  }

  /** Drain selection/action commitments since the last call. */
  takeTriggers(): WarTrigger[] {
    if (this.pendingTriggers.length === 0) return [];
    const out = this.pendingTriggers;
    this.pendingTriggers = [];
    return out;
  }

  /** The boss the hero is reading (nearest effigy within its trigger), or null. */
  focusBoss(): MonsterId | null {
    const hp = this.heroPos();
    if (!hp) return null;
    let best: WarStation | null = null;
    let bestD = EFFIGY_TRIGGER;
    for (const s of this.stations) {
      if (s.kind !== 'boss' || !s.refId) continue;
      const d = dist(hp, s.pos);
      if (d <= bestD) {
        bestD = d;
        best = s;
      }
    }
    return (best?.refId as MonsterId) ?? null;
  }

  // -------------------------------------------------------------------------
  // Layout
  // -------------------------------------------------------------------------

  private heroPos(): Vec2 | null {
    const p = this.world.players[0];
    return p ? p.pos : null;
  }

  /** (Re)build every station for the current active tier. */
  private rebuild(): void {
    this.stations = [];
    this.nextId = 1;
    // Tier gates.
    TIERS.forEach((tier, i) => {
      this.stations.push({
        id: this.nextId++,
        kind: 'tier',
        pos: { x: ARENA_W / 2 + (i - 1) * 210, y: TIER_GATE_Y },
        refId: tier,
        radius: GATE_RADIUS,
        triggerRadius: GATE_TRIGGER,
        label: TIER_LABEL[tier],
        color: TIER_COLOR[tier],
        dwell: WAR_SELECT_DWELL_S,
      });
    });
    // Boss effigies for the active tier, in a shallow arc.
    const bosses = bossesOfTier(this.activeTier);
    const n = bosses.length;
    const spread = ARENA_W * 0.62;
    const startX = ARENA_W / 2 - spread / 2;
    bosses.forEach((id, i) => {
      const x = n === 1 ? ARENA_W / 2 : startX + (spread * i) / (n - 1);
      const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
      const y = BOSS_ROW_Y + 40 * (t * t) - 20;
      this.stations.push({
        id: this.nextId++,
        kind: 'boss',
        pos: { x, y },
        refId: id,
        radius: EFFIGY_RADIUS,
        triggerRadius: EFFIGY_TRIGGER,
        label: MONSTERS[id].name,
        color: MONSTERS[id].color,
        dwell: WAR_SELECT_DWELL_S,
      });
    });
    // Run-mode portals.
    this.stations.push({
      id: this.nextId++,
      kind: 'single',
      pos: { ...SINGLE_PORTAL },
      radius: PORTAL_RADIUS,
      triggerRadius: PORTAL_TRIGGER,
      label: 'SINGLE FIGHT',
      color: 0x4a90d9,
      portal: true,
      dwell: WAR_SELECT_DWELL_S,
    });
    this.stations.push({
      id: this.nextId++,
      kind: 'gauntlet',
      pos: { ...GAUNTLET_PORTAL },
      radius: PORTAL_RADIUS,
      triggerRadius: PORTAL_TRIGGER,
      label: 'GAUNTLET RUN',
      color: 0x9c5cf0,
      portal: true,
      dwell: WAR_SELECT_DWELL_S,
    });
    // Host portal — the commit.
    this.stations.push({
      id: this.nextId++,
      kind: 'host',
      pos: { ...HOST_PORTAL },
      radius: PORTAL_RADIUS,
      triggerRadius: PORTAL_TRIGGER,
      label: 'RAISE YOUR BANNER',
      color: 0xf2c14e,
      portal: true,
      dwell: WAR_HOST_DWELL_S,
    });
    // Run-mode modifier toggles (ON/OFF pedestals flanking the host portal).
    for (const t of TOGGLE_SPECS) {
      this.stations.push({
        id: this.nextId++,
        kind: t.kind,
        pos: { x: t.x, y: TOGGLE_ROW_Y },
        radius: TOGGLE_RADIUS,
        triggerRadius: TOGGLE_TRIGGER,
        label: t.label,
        color: t.color,
        dwell: WAR_SELECT_DWELL_S,
      });
    }
  }

  /** Whether a modifier toggle is inert right now (a gauntlet-only one with the
   *  run set to a single fight). Mirrors the war-horn's "sealed until ready" gate. */
  private toggleDisabled(kind: StationKind): boolean {
    return GAUNTLET_ONLY_TOGGLES.has(kind) && !this.gauntlet;
  }

  /** Current ON/OFF state a modifier toggle reflects, for its lit look. */
  private toggleOn(kind: StationKind): boolean {
    switch (kind) {
      case 'hardcore':
        return this.hardcore;
      case 'chaosforge':
        return this.chaosForge;
      case 'daily':
        return this.dailySeed;
      case 'chaosdraft':
        return this.randomKits;
      default:
        return false;
    }
  }

  // -------------------------------------------------------------------------
  // Interaction
  // -------------------------------------------------------------------------

  /** Clear the armed latch once the hero has stepped fully off that station.
   * Runs every frame (even while moving), so a hero can loop off-and-back
   * without a stationary frame and still re-arm. */
  private clearArmedLatch(): void {
    if (this.armedId == null) return;
    const hp = this.heroPos();
    if (!hp) return;
    const armed = this.stations.find((s) => s.id === this.armedId);
    if (!armed || dist(hp, armed.pos) > armed.triggerRadius) this.armedId = null;
  }

  /** The station the hero is committing to (nearest within its trigger), or null. */
  private stationUnder(): WarStation | null {
    const hp = this.heroPos();
    if (!hp) return null;
    let best: WarStation | null = null;
    let bestFrac = 1;
    for (const s of this.stations) {
      if (s.id === this.armedId) continue; // fired this visit — wait for step-off
      // Skip stations already reflecting the current state (no-op selections).
      if (s.kind === 'tier' && s.refId === this.activeTier) continue;
      if (s.kind === 'boss' && s.refId === this.monsterId) continue;
      if (s.kind === 'single' && !this.gauntlet) continue;
      if (s.kind === 'gauntlet' && this.gauntlet) continue;
      if (this.toggleDisabled(s.kind)) continue; // gauntlet-only toggle, sealed for a single fight
      const d = dist(hp, s.pos);
      if (d > s.triggerRadius) continue;
      const frac = d / s.triggerRadius;
      if (frac <= bestFrac) {
        bestFrac = frac;
        best = s;
      }
    }
    return best;
  }

  private updateDwell(dt: number): void {
    this.clearArmedLatch(); // re-arm even while traversing off the station
    // Selection needs the hero to slow to a stop ON a station — otherwise walking
    // THROUGH the effigy row (each trigger takes longer to cross than the dwell)
    // would auto-pick everything you pass. Ease off the stick to commit.
    const moving = Math.hypot(this.input.move.x, this.input.move.y) > 0.35;
    const target = moving ? null : this.stationUnder();
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
    if (this.dwellS >= target.dwell) {
      this.dwellId = null;
      this.dwellS = 0;
      this.armedId = target.id; // fire once per visit; re-arm on step-off
      this.commit(target);
    }
  }

  private commit(s: WarStation): void {
    if (s.kind === 'tier' && s.refId) {
      // Tier switch is internal: swap the gallery, keep the boss pick.
      this.activeTier = s.refId as BossTier;
      this.rebuild();
      return;
    }
    if (s.kind === 'boss' && s.refId) {
      this.monsterId = s.refId as MonsterId;
      this.pendingTriggers.push({ kind: 'boss', refId: s.refId });
      return;
    }
    if (s.kind === 'single') {
      this.gauntlet = false;
      this.pendingTriggers.push({ kind: 'single' });
      return;
    }
    if (s.kind === 'gauntlet') {
      this.gauntlet = true;
      this.pendingTriggers.push({ kind: 'gauntlet' });
      return;
    }
    // Modifier toggles: flip the mirrored state in place (so the lit look updates
    // this frame, like single/gauntlet) and relay a trigger the UI maps to the
    // matching store setter. Guarded already in stationUnder for gauntlet-only ones.
    if (s.kind === 'hardcore') {
      this.hardcore = !this.hardcore;
      this.pendingTriggers.push({ kind: 'hardcore' });
      return;
    }
    if (s.kind === 'chaosforge') {
      this.chaosForge = !this.chaosForge;
      this.pendingTriggers.push({ kind: 'chaosforge' });
      return;
    }
    if (s.kind === 'daily') {
      this.dailySeed = !this.dailySeed;
      this.pendingTriggers.push({ kind: 'daily' });
      return;
    }
    if (s.kind === 'chaosdraft') {
      this.randomKits = !this.randomKits;
      this.pendingTriggers.push({ kind: 'chaosdraft' });
      return;
    }
    if (s.kind === 'host') {
      this.pendingTriggers.push({ kind: 'host' });
    }
  }

  // -------------------------------------------------------------------------
  // View
  // -------------------------------------------------------------------------

  private stationView(s: WarStation): StationView {
    const hp = this.heroPos();
    const near = hp != null && dist(hp, s.pos) <= s.triggerRadius;
    const channel = this.dwellId === s.id ? Math.min(1, this.dwellS / s.dwell) : 0;
    const disabled = this.toggleDisabled(s.kind);
    let selected: boolean;
    if (s.kind === 'tier') selected = s.refId === this.activeTier;
    else if (s.kind === 'boss') selected = s.refId === this.monsterId;
    else if (s.kind === 'single') selected = !this.gauntlet;
    else if (s.kind === 'gauntlet') selected = this.gauntlet;
    // A modifier toggle lights only when it is both ON and actually applies (a
    // gauntlet-only one reads as off — and greyed — while the run is a single fight).
    else selected = this.toggleOn(s.kind) && !disabled;
    // Gauntlet-only toggles say why they're sealed while single-fight is chosen.
    const label = disabled ? `${s.label} — gauntlet only` : s.label;
    return {
      id: s.id,
      kind: s.kind,
      pos: { ...s.pos },
      radius: s.radius,
      triggerRadius: s.triggerRadius,
      refId: s.refId,
      label,
      color: s.color,
      portal: s.portal,
      selected,
      disabled,
      active: near && !disabled,
      channel,
    };
  }
}
