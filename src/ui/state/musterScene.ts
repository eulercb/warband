/**
 * Warband — the walkable MUSTER HALL. A small local scene (the engine `World` in
 * `war` mode: heroes only, no combat) layered behind the lobby panel: step onto
 * the muster rune to ready up, and — if you host — onto the war-horn to start the
 * fight. Mirrors WarScene: it wraps a World, steps it, and projects the hall's
 * stations into the RenderState. No networking of its own — readiness relays
 * through setReady and the start through startFight, exactly as the panel buttons
 * do. A station stays "armed" after firing until the hero steps off it, so simply
 * standing on the rune can't flip-flop readiness.
 */
import { World } from '../../engine/world/world';
import { SIM_DT, CLASS_COLORS } from '../../engine/core/constants';
import { CLASS_IDS, CLASSES } from '../../engine/content/classes';
import { dist } from '../../engine/core/torus';
import type {
  ClassId,
  GameEvent,
  InputCommand,
  RenderState,
  StationKind,
  StationView,
  Vec2,
} from '../../engine/core/types';

const LOCAL_PEER = 'local:muster';

/** Seconds to dwell on the rune (ready) / war-horn (start) before it fires. */
export const MUSTER_DWELL_S = 0.4;
export const START_DWELL_S = 0.7;
/** Dwell to add a bot from a class effigy (item 1) — a quick, repeatable tap. */
export const ADDBOT_DWELL_S = 0.4;

// item 1: a top-of-hall row of class effigies (host only). Placed above the rune /
// war-horn (right column) and clear of the left-docked lobby panel, within the
// torus-safe band above the y=780 spawn (see rewardScene's geometry note).
const BOT_ROW_Y = 330;
const BOT_ROW_X0 = 480;
const BOT_ROW_X1 = 1260;
const BOT_EFFIGY_RADIUS = 28;
const BOT_EFFIGY_TRIGGER = 46;

const ZERO_INPUT: InputCommand = {
  seq: 0,
  move: { x: 0, y: 0 },
  aim: { x: 0, y: -1 },
  buttons: { basic: false, a1: false, a2: false, a3: false, revive: false },
};

// Placed right-of-centre so the left-docked lobby panel never covers them.
const RUNE_POS: Vec2 = { x: 1150, y: 620 };
const HORN_POS: Vec2 = { x: 1150, y: 440 };
const PORTAL_RADIUS = 46;
const PORTAL_TRIGGER = 88;

export interface MusterTrigger {
  kind: StationKind;
  /** For an 'addbot' effigy: the ClassId of the bot to add (item 1). */
  refId?: string;
}

interface MusterStation {
  id: number;
  kind: StationKind;
  pos: Vec2;
  radius: number;
  triggerRadius: number;
  label: string;
  color: number;
  dwell: number;
  /** Selection payload — the ClassId for an 'addbot' effigy (item 1). */
  refId?: string;
}

export class MusterScene {
  private world: World;
  private lastMs = 0;
  private acc = 0;
  private input: InputCommand = ZERO_INPUT;
  private pendingEvents: GameEvent[] = [];

  private readonly name: string;
  private classId: ClassId;
  private ready = false;
  private canStart = false;
  /** item 1: the warband is full — the add-bot effigies grey out. */
  private partyFull = false;

  private readonly stations: MusterStation[] = [];
  private dwellId: number | null = null;
  private dwellS = 0;
  /** A station that just fired; skipped until the hero steps off it. */
  private armedId: number | null = null;
  private pendingTriggers: MusterTrigger[] = [];

  constructor(name: string, classId: ClassId, isHost: boolean) {
    this.name = name;
    this.classId = classId;
    this.world = this.build(null);
    this.stations.push({
      id: 1,
      kind: 'muster',
      pos: { ...RUNE_POS },
      radius: PORTAL_RADIUS,
      triggerRadius: PORTAL_TRIGGER,
      label: 'MUSTER — READY UP',
      color: 0x5bbf7a,
      dwell: MUSTER_DWELL_S,
    });
    if (isHost) {
      this.stations.push({
        id: 2,
        kind: 'start',
        pos: { ...HORN_POS },
        radius: PORTAL_RADIUS,
        triggerRadius: PORTAL_TRIGGER,
        label: 'SOUND THE WAR-HORN',
        color: 0xf2c14e,
        dwell: START_DWELL_S,
      });
      this.layoutBotEffigies();
    }
  }

  /** item 1: a row of class effigies (host only) — walk onto one to add a bot of
   *  that class. Mirrors the menu playground's class effigies. */
  private layoutBotEffigies(): void {
    const n = CLASS_IDS.length;
    CLASS_IDS.forEach((id, i) => {
      const x = BOT_ROW_X0 + ((BOT_ROW_X1 - BOT_ROW_X0) * i) / (n - 1);
      const t = (i / (n - 1)) * 2 - 1; // -1..1 across the row
      const y = BOT_ROW_Y + 34 * (t * t) - 17; // gentle forward-bowed arc
      this.stations.push({
        id: 100 + i, // clear of the rune/horn (1,2) and world entity ids
        kind: 'addbot',
        pos: { x, y },
        refId: id,
        radius: BOT_EFFIGY_RADIUS,
        triggerRadius: BOT_EFFIGY_TRIGGER,
        label: `+ ${CLASSES[id].name}`,
        color: CLASS_COLORS[id] ?? 0xffffff,
        dwell: ADDBOT_DWELL_S,
      });
    });
  }

  private build(keepPos: Vec2 | null): World {
    const w = new World({
      monsterId: 'dummy',
      seed: (Math.random() * 2 ** 31) | 0,
      players: [{ peerId: LOCAL_PEER, name: this.name || 'Hero', classId: this.classId }],
      scene: 'war',
    });
    if (keepPos && w.players[0]) w.players[0].pos = keepPos;
    return w;
  }

  get localPlayerId(): number | null {
    return this.world.playerIdByPeer(LOCAL_PEER);
  }

  /** Swap the hero's class in place (rebuilds the world, keeps the position). */
  setClass(classId: ClassId): void {
    if (classId === this.classId) return;
    this.classId = classId;
    const prev = this.world.players[0];
    this.world = this.build(prev ? { x: prev.pos.x, y: prev.pos.y } : null);
  }

  setInput(cmd: InputCommand): void {
    this.input = cmd;
  }

  /** Mirror the store's readiness so the rune stays lit while ready. */
  setReady(on: boolean): void {
    this.ready = on;
  }

  /** Mirror whether the host may start (the war-horn greys out until then). */
  setCanStart(on: boolean): void {
    this.canStart = on;
  }

  /** item 1: mirror whether the warband is full (add-bot effigies grey out). */
  setPartyFull(on: boolean): void {
    this.partyFull = on;
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

  takeTriggers(): MusterTrigger[] {
    if (this.pendingTriggers.length === 0) return [];
    const out = this.pendingTriggers;
    this.pendingTriggers = [];
    return out;
  }

  private heroPos(): Vec2 | null {
    const p = this.world.players[0];
    return p ? p.pos : null;
  }

  /** Clear the armed latch once the hero has stepped fully off it. Runs every
   * frame (even while moving) so looping off-and-back re-arms the rune. */
  private clearArmedLatch(): void {
    if (this.armedId == null) return;
    const hp = this.heroPos();
    if (!hp) return;
    const armed = this.stations.find((s) => s.id === this.armedId);
    if (!armed || dist(hp, armed.pos) > armed.triggerRadius) this.armedId = null;
  }

  /** The station the hero is committing to (nearest within trigger), or null. */
  private stationUnder(): MusterStation | null {
    const hp = this.heroPos();
    if (!hp) return null;
    let best: MusterStation | null = null;
    let bestFrac = 1;
    for (const s of this.stations) {
      if (s.id === this.armedId) continue;
      if (s.kind === 'start' && !this.canStart) continue; // war-horn sealed until ready
      if (s.kind === 'addbot' && this.partyFull) continue; // item 1: no room for more bots
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
    this.clearArmedLatch(); // re-arm even while traversing off the rune/horn
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
      this.armedId = target.id; // don't re-fire until the hero steps off
      this.pendingTriggers.push({ kind: target.kind, refId: target.refId });
    }
  }

  private stationView(s: MusterStation): StationView {
    const hp = this.heroPos();
    const near = hp != null && dist(hp, s.pos) <= s.triggerRadius;
    const channel = this.dwellId === s.id ? Math.min(1, this.dwellS / s.dwell) : 0;
    const selected = s.kind === 'muster' ? this.ready : false;
    const disabled =
      (s.kind === 'start' && !this.canStart) || (s.kind === 'addbot' && this.partyFull);
    let label = s.label;
    if (s.kind === 'muster') label = this.ready ? 'READY ✓ — STAND DOWN' : 'MUSTER — READY UP';
    else if (s.kind === 'start') label = disabled ? 'WAITING FOR THE BAND' : 'SOUND THE WAR-HORN';
    else if (s.kind === 'addbot') label = disabled ? 'BAND FULL' : s.label;
    return {
      id: s.id,
      kind: s.kind,
      pos: { ...s.pos },
      radius: s.radius,
      triggerRadius: s.triggerRadius,
      refId: s.refId,
      label,
      color: s.color,
      // The rune / war-horn are walk-INTO portals; the bot effigies are pedestals.
      portal: s.kind !== 'addbot',
      selected,
      disabled,
      active: near && !disabled,
      channel,
    };
  }
}
