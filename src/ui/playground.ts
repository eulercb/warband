/**
 * Warband — the walkable MENU PLAYGROUND. A tiny, local, offline practice sim:
 * the real engine `World` in `practice` mode (a respawning training dummy, no
 * hazards, interaction totems), stepped at the fixed sim rate and rendered with
 * the real renderer. No networking anywhere — this is what you land in the
 * moment the app opens, so the game teaches itself before any menu is read.
 */
import { World } from '../engine/world';
import { SIM_DT } from '../engine/constants';
import type { ClassId, GameEvent, InputCommand, RenderState, TotemView } from '../engine/types';

/** Synthetic peer id for the local playground hero (never hits the network). */
const LOCAL_PEER = 'local:hero';

const ZERO_INPUT: InputCommand = {
  seq: 0,
  move: { x: 0, y: 0 },
  aim: { x: 1, y: 0 },
  buttons: { basic: false, a1: false, a2: false, a3: false, revive: false },
};

export class Playground {
  private world: World;
  private lastMs = 0;
  private acc = 0;
  private input: InputCommand = ZERO_INPUT;
  private name: string;
  private classId: ClassId;

  constructor(name: string, classId: ClassId) {
    this.name = name;
    this.classId = classId;
    this.world = this.build(null);
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
  frame(nowMs: number): RenderState {
    if (this.lastMs === 0) this.lastMs = nowMs;
    this.acc += Math.min((nowMs - this.lastMs) / 1000, 0.25);
    this.lastMs = nowMs;
    const inputs = new Map([[LOCAL_PEER, this.input]]);
    while (this.acc >= SIM_DT) {
      this.world.step(SIM_DT, inputs);
      this.pendingEvents.push(...this.world.events);
      this.acc -= SIM_DT;
    }
    const state = this.world.toRenderState(this.localPlayerId);
    state.events = this.pendingEvents;
    this.pendingEvents = [];
    return state;
  }

  /** The totem the hero currently stands on, or null. */
  activeTotem(): TotemView | null {
    return this.world.totemViews(this.localPlayerId).find((t) => t.active) ?? null;
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
