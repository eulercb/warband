/**
 * Warband — render camera.
 *
 * Maps world-space (the fixed ARENA_W x ARENA_H arena) to screen pixels with a
 * uniform, letterboxed fit, and owns a decaying screen-shake energy that the
 * renderer bakes into the root container each frame.
 *
 *   screen = world * scale + offset
 */
import type { Vec2 } from '../engine/types';

/** Maximum accumulated shake energy (in screen pixels of jitter amplitude). */
const MAX_SHAKE = 24;
/** Exponential decay rate of shake energy, per second. */
const SHAKE_DECAY = 7;

export class Camera {
  /** Uniform world->screen scale factor. */
  scale = 1;
  /** Screen-space translation applied after scaling (letterbox centering). */
  offset: Vec2 = { x: 0, y: 0 };
  /** Current per-frame shake jitter; the renderer applies it to the root container. */
  shakeOffset: Vec2 = { x: 0, y: 0 };

  private readonly arenaW: number;
  private readonly arenaH: number;
  private viewW = 0;
  private viewH = 0;
  private shakeEnergy = 0;

  constructor(arenaW: number, arenaH: number) {
    this.arenaW = arenaW;
    this.arenaH = arenaH;
  }

  /**
   * Recompute scale + offset for a new viewport size. Uniform scale keeps the
   * arena aspect ratio; the arena is centered (letterboxed) in the view.
   */
  fit(viewW: number, viewH: number): void {
    this.viewW = viewW;
    this.viewH = viewH;
    const s = Math.min(viewW / this.arenaW, viewH / this.arenaH);
    this.scale = s;
    this.offset = {
      x: (viewW - this.arenaW * s) / 2,
      y: (viewH - this.arenaH * s) / 2,
    };
  }

  worldToScreen(v: Vec2): Vec2 {
    return {
      x: v.x * this.scale + this.offset.x,
      y: v.y * this.scale + this.offset.y,
    };
  }

  screenToWorld(v: Vec2): Vec2 {
    return {
      x: (v.x - this.offset.x) / this.scale,
      y: (v.y - this.offset.y) / this.scale,
    };
  }

  /** Add shake energy (clamped). Bigger events add more. */
  addShake(intensity: number): void {
    this.shakeEnergy = Math.min(MAX_SHAKE, this.shakeEnergy + intensity);
  }

  /**
   * Decay shake energy exponentially and set `shakeOffset` to a fresh random
   * jitter within the current energy. Call once per rendered frame.
   */
  update(dtMs: number): void {
    const dt = dtMs / 1000;
    this.shakeEnergy *= Math.exp(-SHAKE_DECAY * dt);
    if (this.shakeEnergy < 0.08) {
      this.shakeEnergy = 0;
      this.shakeOffset.x = 0;
      this.shakeOffset.y = 0;
      return;
    }
    const angle = Math.random() * Math.PI * 2;
    const mag = this.shakeEnergy * Math.random();
    this.shakeOffset.x = Math.cos(angle) * mag;
    this.shakeOffset.y = Math.sin(angle) * mag;
  }

  /** Current viewport size last passed to `fit`. */
  get viewSize(): Vec2 {
    return { x: this.viewW, y: this.viewH };
  }
}
