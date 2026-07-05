/**
 * Warband — render camera.
 *
 * A follow camera for the toroidal (wrap-around) arena. It centers on a world
 * point (`center`, the smoothed average of the party) at a fixed zoom, and
 * projects world → screen. Because the world wraps, `worldToScreen` draws each
 * entity at the copy NEAREST the camera center (so the boss/party never jump to
 * the far edge); static tiled layers (ground, terrain, obstacles) instead use
 * `toScreen` directly at explicit ±ARENA offsets so they repeat across the view.
 *
 * It also owns a decaying screen-shake energy the renderer bakes into the root
 * container each frame.
 */
import type { Vec2 } from '../engine/types';
import { nearestCopy, wrapPos } from '../engine/torus';
import { lerp } from '../engine/math';

/** Maximum accumulated shake energy (in screen pixels of jitter amplitude). */
const MAX_SHAKE = 24;
/** Exponential decay rate of shake energy, per second. */
const SHAKE_DECAY = 7;
/**
 * How much to zoom in past a whole-arena letterbox fit. >1 shows only a window
 * of the world so there is room for the camera to follow the party and for the
 * ground to visibly scroll and wrap.
 */
const ZOOM = 1.5;
/** Camera follow smoothing (higher = snappier); per second. */
const FOLLOW_RATE = 6;

export class Camera {
  /** World point the view is centered on (follows the party). */
  center: Vec2;
  /** Uniform world->screen scale factor. */
  scale = 1;
  /** Screen-space point the `center` maps to (viewport middle). */
  screenCenter: Vec2 = { x: 0, y: 0 };
  /** Current per-frame shake jitter; the renderer applies it to the root container. */
  shakeOffset: Vec2 = { x: 0, y: 0 };

  private readonly arenaW: number;
  private readonly arenaH: number;
  private viewW = 0;
  private viewH = 0;
  private shakeEnergy = 0;
  private seeded = false;

  constructor(arenaW: number, arenaH: number) {
    this.arenaW = arenaW;
    this.arenaH = arenaH;
    this.center = { x: arenaW / 2, y: arenaH / 2 };
  }

  /**
   * Recompute scale + screen center for a new viewport size (zoomed-in follow).
   *
   * Uses a COVER fit (`max`, not `min`) so the visible world span never exceeds
   * the arena in either axis. That guarantees no on-screen point is more than
   * half an arena from the camera center, so `worldToScreen`'s nearest-copy never
   * flips a visible entity to the wrong side — which a portrait / ultrawide
   * viewport would otherwise do, since only the tiled ground layers repeat.
   */
  fit(viewW: number, viewH: number): void {
    this.viewW = viewW;
    this.viewH = viewH;
    const coverScale = Math.max(viewW / this.arenaW, viewH / this.arenaH);
    this.scale = coverScale * ZOOM;
    this.screenCenter = { x: viewW / 2, y: viewH / 2 };
  }

  /** Smoothly follow a world target (the party average) across the torus. */
  follow(target: Vec2, dtMs: number): void {
    if (!this.seeded) {
      this.center = wrapPos(target);
      this.seeded = true;
      return;
    }
    const k = 1 - Math.exp((-FOLLOW_RATE * dtMs) / 1000);
    const near = nearestCopy(target, this.center); // shortest path across the seam
    this.center = wrapPos({
      x: lerp(this.center.x, near.x, k),
      y: lerp(this.center.y, near.y, k),
    });
  }

  /** Raw center-relative projection (no wrap) — used for tiled static layers. */
  toScreen(v: Vec2): Vec2 {
    return {
      x: (v.x - this.center.x) * this.scale + this.screenCenter.x,
      y: (v.y - this.center.y) * this.scale + this.screenCenter.y,
    };
  }

  /** Project a world point, drawing it at the torus copy nearest the camera. */
  worldToScreen(v: Vec2): Vec2 {
    return this.toScreen(nearestCopy(v, this.center));
  }

  /** Inverse of `worldToScreen` (wrapped back into the canonical tile). */
  screenToWorld(v: Vec2): Vec2 {
    return wrapPos({
      x: (v.x - this.screenCenter.x) / this.scale + this.center.x,
      y: (v.y - this.screenCenter.y) / this.scale + this.center.y,
    });
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
