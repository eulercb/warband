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
import { SIM_DT } from '../../engine/core/constants';
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
}

export class MusterScene {
  private world: World;
  private lastMs = 0;
  private acc = 0;
  private input: InputCommand = ZERO_INPUT;
  private pendingEvents: GameEvent[] = [];

  private ready = false;
  private canStart = false;

  private readonly stations: MusterStation[] = [];
  private dwellId: number | null = null;
  private dwellS = 0;
  /** A station that just fired; skipped until the hero steps off it. */
  private armedId: number | null = null;
  private pendingTriggers: MusterTrigger[] = [];

  constructor(name: string, classId: ClassId, isHost: boolean) {
    this.world = new World({
      monsterId: 'dummy',
      seed: (Math.random() * 2 ** 31) | 0,
      players: [{ peerId: LOCAL_PEER, name: name || 'Hero', classId }],
      scene: 'war',
    });
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
    }
  }

  get localPlayerId(): number | null {
    return this.world.playerIdByPeer(LOCAL_PEER);
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

  /** The station the hero is committing to (nearest within trigger), or null. */
  private stationUnder(): MusterStation | null {
    const hp = this.heroPos();
    if (!hp) return null;
    // Clear the armed latch once the hero has stepped fully off it.
    if (this.armedId != null) {
      const armed = this.stations.find((s) => s.id === this.armedId);
      if (!armed || dist(hp, armed.pos) > armed.triggerRadius) this.armedId = null;
    }
    let best: MusterStation | null = null;
    let bestFrac = 1;
    for (const s of this.stations) {
      if (s.id === this.armedId) continue;
      if (s.kind === 'start' && !this.canStart) continue; // war-horn sealed until ready
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
      this.pendingTriggers.push({ kind: target.kind });
    }
  }

  private stationView(s: MusterStation): StationView {
    const hp = this.heroPos();
    const near = hp != null && dist(hp, s.pos) <= s.triggerRadius;
    const channel = this.dwellId === s.id ? Math.min(1, this.dwellS / s.dwell) : 0;
    const selected = s.kind === 'muster' ? this.ready : false;
    const disabled = s.kind === 'start' && !this.canStart;
    let label = s.label;
    if (s.kind === 'muster') label = this.ready ? 'READY ✓ — STAND DOWN' : 'MUSTER — READY UP';
    else if (s.kind === 'start') label = disabled ? 'WAITING FOR THE BAND' : 'SOUND THE WAR-HORN';
    return {
      id: s.id,
      kind: s.kind,
      pos: { ...s.pos },
      radius: s.radius,
      triggerRadius: s.triggerRadius,
      label,
      color: s.color,
      portal: true,
      selected,
      disabled,
      active: near && !disabled,
      channel,
    };
  }
}
