/**
 * Warband — tiny Vec2 helpers for the rig runtime.
 *
 * PURE: no PixiJS, no DOM. Re-exports the engine's `Vec2` shape so a rig point
 * is the same structural type as an engine position, and adds the handful of
 * screen-space vector ops the rig math (IK / gait / chain) and runtime need.
 * Kept separate from `engine/math.ts` so the rig module has no engine coupling
 * beyond the type and stays independently unit-testable.
 */
export type { Vec2 } from '../../../engine/core/types';
import type { Vec2 } from '../../../engine/core/types';

export const v = (x: number, y: number): Vec2 => ({ x, y });

export const vadd = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const vsub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const vscale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });

export const vlen = (a: Vec2): number => Math.hypot(a.x, a.y);
export const vdist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Unit vector, or the zero vector when `a` is (near) zero length. */
export function vnorm(a: Vec2): Vec2 {
  const l = Math.hypot(a.x, a.y);
  if (l < 1e-9) return { x: 0, y: 0 };
  return { x: a.x / l, y: a.y / l };
}

/** Point on the unit circle at `rad`, scaled to `length`. */
export const fromAngle = (rad: number, length = 1): Vec2 => ({
  x: Math.cos(rad) * length,
  y: Math.sin(rad) * length,
});

/** Rotate `a` by `rad` (screen space, y-down). */
export function vrot(a: Vec2, rad: number): Vec2 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
}

/** Perpendicular (90° CCW in screen space). */
export const vperp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });

export const vlerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
