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
import type { Vec2 } from '../../engine/core/types';
import { nearestCopy, wrapPos } from '../../engine/core/torus';
import { lerp } from '../../engine/core/math';

/** Maximum accumulated shake energy (in screen pixels of jitter amplitude). */
const MAX_SHAKE = 24;

/**
 * Global accessibility switch for screen shake. When off, `addShake` is inert for
 * every camera (menus, fights, reward room), so no view ever jolts. Toggled from
 * the app store (setScreenShake) and persisted; defaults on. Kept module-level so
 * a single call covers all the renderers without threading the flag through each.
 */
let shakeEnabled = true;
export function setShakeEnabled(on: boolean): void {
  shakeEnabled = on;
}
export function isShakeEnabled(): boolean {
  return shakeEnabled;
}
/** Exponential decay rate of shake energy, per second. */
const SHAKE_DECAY = 7;
/**
 * Zoom band, as a multiplier over a whole-arena COVER fit. `ZOOM_MAX` (tight)
 * is the default framing when everyone is bunched up; the camera zooms OUT when
 * the party (and boss) spread apart so nobody drops off the edge into "nowhere".
 *
 * The zoom-out FLOOR is per-viewport (see `fit`), not a fixed 1.0. A square-ish
 * (arena-aspect) viewport floors at exactly cover (1.0) — so no on-screen point
 * is more than half an arena from centre and the torus nearest-copy projection
 * stays exact. A strongly non-square viewport (a portrait phone, an ultrawide)
 * is allowed to loosen BELOW cover so a spread party+boss stays framed instead
 * of hiding off the narrow axis; the loosening is capped by `OVERSCAN_MAX` so the
 * loose axis never shows more than that multiple of the arena (bounding the wrap
 * artifact — on a torus a far entity simply draws via its nearer copy anyway).
 */
const ZOOM_MAX = 1.5;
/** Loosest cover-relative zoom floor for an arena-aspect viewport. */
const ZOOM_MIN = 1.0;
/** Max arena multiples the loose viewport axis may show at full zoom-out. */
const OVERSCAN_MAX = 2.5;
/** Camera follow smoothing (higher = snappier); per second. */
const FOLLOW_RATE = 6;
/** Zoom smoothing (per second) so the framing eases in/out, never snaps. */
const ZOOM_RATE = 3;
/** Extra world-unit breathing room kept around the framed group. */
const FRAME_MARGIN = 120;

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
  /** Whole-arena cover scale (zoom == 1). Final scale = coverScale * zoom. */
  private coverScale = 1;
  /** Loosest zoom this viewport allows (≤ 1); aspect-aware, set in `fit`. */
  private minZoom = ZOOM_MIN;
  /** Current + target zoom multiplier over the cover fit (smoothed each frame). */
  private zoom = ZOOM_MAX;
  private targetZoom = ZOOM_MAX;

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
    const rw = viewW / this.arenaW;
    const rh = viewH / this.arenaH;
    this.coverScale = Math.max(rw, rh);
    // Per-viewport zoom-out floor. `contain / cover` (= min ratio / max ratio) is
    // the zoom at which the arena just fills the TIGHT axis — 1.0 for an arena-
    // aspect viewport, < 1 for a non-square one, letting it loosen below cover to
    // frame a spread group. Bound the loosening by OVERSCAN_MAX (`1 / OVERSCAN` is
    // the zoom at which the loose axis shows OVERSCAN× the arena) and never above
    // cover (1.0), so we only ever ADD headroom on non-square viewports.
    const containOverCover = Math.min(rw, rh) / this.coverScale;
    this.minZoom = Math.min(ZOOM_MIN, Math.max(containOverCover, 1 / OVERSCAN_MAX));
    this.scale = this.coverScale * this.zoom;
    this.screenCenter = { x: viewW / 2, y: viewH / 2 };
  }

  /**
   * Choose a target zoom that keeps a group of world points (radius `halfSpan`
   * around the camera centre) comfortably on screen. Zooms out when the party +
   * boss spread apart, back in when they regroup — clamped to [ZOOM_MIN, ZOOM_MAX]
   * so it never loosens past a whole-arena cover fit (torus invariant).
   */
  frameGroup(halfSpan: number): void {
    const span = Math.max(1, halfSpan + FRAME_MARGIN);
    const halfView = Math.min(this.viewW, this.viewH) / 2;
    // zoom such that visible half-extent (halfView / (coverScale*zoom)) >= span.
    const desired = halfView / (this.coverScale * span);
    // Clamp into the per-viewport band: `minZoom` (aspect-aware) up to ZOOM_MAX.
    this.targetZoom = Math.max(this.minZoom, Math.min(ZOOM_MAX, desired));
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

  /** Add shake energy (clamped). Bigger events add more. Inert when the
   * accessibility toggle has disabled screen shake. */
  addShake(intensity: number): void {
    if (!shakeEnabled) return;
    this.shakeEnergy = Math.min(MAX_SHAKE, this.shakeEnergy + intensity);
  }

  /**
   * Decay shake energy exponentially and set `shakeOffset` to a fresh random
   * jitter within the current energy. Call once per rendered frame.
   */
  update(dtMs: number): void {
    const dt = dtMs / 1000;
    // Ease the zoom toward its target, then refresh the world->screen scale.
    const kz = 1 - Math.exp(-ZOOM_RATE * dt);
    this.zoom = lerp(this.zoom, this.targetZoom, kz);
    this.scale = this.coverScale * this.zoom;

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
