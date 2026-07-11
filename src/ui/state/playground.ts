/**
 * Warband — the walkable MENU PLAYGROUND. A tiny, local, offline practice sim:
 * the real engine `World` in `practice` mode (a respawning training dummy, no
 * hazards, interaction totems), stepped at the fixed sim rate and rendered with
 * the real renderer. No networking anywhere — this is what you land in the
 * moment the app opens, so the game teaches itself before any menu is read.
 *
 * The playground also lays out diegetic STATIONS — walkable menu objects that
 * replace flat controls. Today: a row of class effigies (walk onto one to become
 * that hero). Stations are harness-owned (non-solid) and survive a class swap's
 * world rebuild, so the selection ring never resets under the hero's feet.
 */
import { World } from '../../engine/world/world';
import { SIM_DT, ARENA_W, CLASS_COLORS } from '../../engine/core/constants';
import { CLASS_IDS, CLASSES } from '../../engine/content/classes';
import { dist } from '../../engine/core/torus';
import type {
  ClassId,
  GameEvent,
  InputCommand,
  RenderState,
  StationView,
  TotemView,
  Vec2,
} from '../../engine/core/types';

/** Synthetic peer id for the local playground hero (never hits the network). */
const LOCAL_PEER = 'local:hero';

/** Seconds the hero must dwell on a class effigy before swapping (avoids a
 * world rebuild every frame while walking through the row). */
export const STATION_DWELL_S = 0.3;

const ZERO_INPUT: InputCommand = {
  seq: 0,
  move: { x: 0, y: 0 },
  aim: { x: 1, y: 0 },
  buttons: { basic: false, a1: false, a2: false, a3: false, revive: false },
};

/** A trigger drained by the UI when the hero commits to a station. */
export interface StationTrigger {
  kind: StationView['kind'];
  refId?: string;
}

/** Internal class-effigy model (position + which class it grants). */
interface Station {
  id: number;
  kind: StationView['kind'];
  pos: Vec2;
  refId: string;
  radius: number;
  triggerRadius: number;
  label: string;
  color: number;
}

// --- Class-effigy row geometry (world units; arena 1600 x 1000) --------------
const EFFIGY_RADIUS = 26;
const EFFIGY_TRIGGER_RADIUS = 46;
/** The effigies stand on a shallow arc between the hero's spawn and centre. */
const EFFIGY_ROW_Y = 660;

export class Playground {
  private world: World;
  private lastMs = 0;
  private acc = 0;
  private input: InputCommand = ZERO_INPUT;
  private name: string;
  private classId: ClassId;

  /** Class effigies (built once; survive class-swap world rebuilds). */
  private readonly stations: Station[] = [];
  private stationDwellId: number | null = null;
  private stationDwellS = 0;
  private pendingTriggers: StationTrigger[] = [];

  constructor(name: string, classId: ClassId) {
    this.name = name;
    this.classId = classId;
    this.world = this.build(null);
    this.layoutEffigies();
  }

  /** Lay out one class effigy per class in a shallow arc the hero walks along. */
  private layoutEffigies(): void {
    const n = CLASS_IDS.length;
    const spread = ARENA_W * 0.52;
    const startX = ARENA_W / 2 - spread / 2;
    CLASS_IDS.forEach((id, i) => {
      const x = startX + (spread * i) / (n - 1);
      const t = (i / (n - 1)) * 2 - 1; // -1..1 across the row
      const y = EFFIGY_ROW_Y + 40 * (t * t) - 20; // gentle forward-bowed arc
      this.stations.push({
        id: 1000 + i, // distinct from world entity ids
        kind: 'class',
        pos: { x, y },
        refId: id,
        radius: EFFIGY_RADIUS,
        triggerRadius: EFFIGY_TRIGGER_RADIUS,
        label: CLASSES[id].name,
        color: CLASS_COLORS[id] ?? 0xffffff,
      });
    });
  }

  get localPlayerId(): number | null {
    return this.world.playerIdByPeer(LOCAL_PEER);
  }

  /** Swap the hero's class in place (rebuilds the world, keeps the position). */
  setClass(classId: ClassId): void {
    if (classId === this.classId) return;
    this.classId = classId;
    const prev = this.world.players[0];
    const keep = prev ? { x: prev.pos.x, y: prev.pos.y } : null;
    this.world = this.build(keep);
  }

  setName(name: string): void {
    this.name = name;
    const p = this.world.players[0];
    if (p) p.name = name;
  }

  /** Latest sampled local input (held state; the sim edge-detects presses). */
  setInput(cmd: InputCommand): void {
    this.input = cmd;
  }

  /** Events accumulated across steps, drained once per rendered frame — the
   * same pattern as Host.drainEvents. Without this, frames that run 0 steps
   * (render runs faster than the 20Hz sim) would replay the last step's
   * events, duplicating FX/SFX, and frames that run 2+ steps would drop some. */
  private pendingEvents: GameEvent[] = [];

  /**
   * Advance the sim to `nowMs` (fixed-timestep accumulator, same shape as the
   * host loop) and return the frame's render state — totems included, events
   * exactly-once.
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
    // Class-effigy dwell runs on the render clock (like the reward relics); an
    // open overlay holds it frozen so nothing swaps behind a menu.
    this.updateStationDwell(frozen ? 0 : Math.max(0, dt));
    const state = this.world.toRenderState(this.localPlayerId);
    state.events = this.pendingEvents;
    this.pendingEvents = [];
    state.stations = this.stations.map((s) => this.stationView(s));
    return state;
  }

  /** The totem the hero currently stands on, or null. */
  activeTotem(): TotemView | null {
    return this.world.totemViews(this.localPlayerId).find((t) => t.active) ?? null;
  }

  private heroPos(): Vec2 | null {
    const p = this.world.players[0];
    return p ? p.pos : null;
  }

  /** Advance the class-effigy dwell; queue a swap once the hero holds their pick. */
  private updateStationDwell(dt: number): void {
    const target = this.effigyUnder();
    if (!target) {
      this.stationDwellId = null;
      this.stationDwellS = 0;
      return;
    }
    if (this.stationDwellId !== target.id) {
      this.stationDwellId = target.id;
      this.stationDwellS = 0;
    }
    this.stationDwellS += dt;
    if (this.stationDwellS >= STATION_DWELL_S) {
      this.stationDwellId = null;
      this.stationDwellS = 0;
      this.pendingTriggers.push({ kind: target.kind, refId: target.refId });
    }
  }

  /** The class effigy the hero stands on whose class differs from the current one. */
  private effigyUnder(): Station | null {
    const hp = this.heroPos();
    if (!hp) return null;
    let best: Station | null = null;
    let bestD = EFFIGY_TRIGGER_RADIUS;
    for (const s of this.stations) {
      if (s.refId === this.classId) continue; // already this hero
      const d = dist(hp, s.pos);
      if (d <= bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  /** Drain station commitments since the last call (UI relays each selection). */
  takeStationTriggers(): StationTrigger[] {
    if (this.pendingTriggers.length === 0) return [];
    const out = this.pendingTriggers;
    this.pendingTriggers = [];
    return out;
  }

  private stationView(s: Station): StationView {
    const hp = this.heroPos();
    const near = hp != null && dist(hp, s.pos) <= s.triggerRadius;
    const channel =
      this.stationDwellId === s.id ? Math.min(1, this.stationDwellS / STATION_DWELL_S) : 0;
    return {
      id: s.id,
      kind: s.kind,
      pos: { ...s.pos },
      radius: s.radius,
      triggerRadius: s.triggerRadius,
      refId: s.refId,
      label: s.label,
      color: s.color,
      selected: s.refId === this.classId,
      active: near,
      channel,
    };
  }

  private build(keepPos: { x: number; y: number } | null): World {
    const w = new World({
      monsterId: 'dummy',
      seed: (Math.random() * 2 ** 31) | 0,
      players: [{ peerId: LOCAL_PEER, name: this.name || 'Hero', classId: this.classId }],
      practice: true,
    });
    if (keepPos && w.players[0]) w.players[0].pos = keepPos;
    return w;
  }
}
