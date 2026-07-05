/**
 * Warband — toroidal (wrap-around) world geometry. PURE TS.
 *
 * The arena is a torus: walk off one edge and you reappear on the opposite edge,
 * so the party can march in one direction forever and the same ground rolls back
 * around. To keep combat correct across the seam, every position comparison here
 * measures the SHORTEST path on the torus (wrapping by ±ARENA_W / ±ARENA_H).
 *
 * These are deliberately drop-in replacements for the Euclidean `sub` / `dist` /
 * `distSq` / point-in-shape helpers from math.ts: the simulation imports them
 * under the SAME names, so the hot combat call sites become toroidal without any
 * per-site changes. Rendering keeps using the plain Euclidean math on canonical
 * positions (plus a nearest-copy trick in the camera).
 */
import type { Vec2 } from './types';
import { ARENA_W, ARENA_H } from './constants';
import {
  pointInCircle as euclidPointInCircle,
  pointInCone as euclidPointInCone,
  pointInSegment as euclidPointInSegment,
} from './math';

/** Wrap a single coordinate into [0, size). */
export function wrapCoord(v: number, size: number): number {
  const m = v % size;
  return m < 0 ? m + size : m;
}

/** Wrap a position into the canonical [0,W) × [0,H) tile. */
export function wrapPos(p: Vec2): Vec2 {
  return { x: wrapCoord(p.x, ARENA_W), y: wrapCoord(p.y, ARENA_H) };
}

/**
 * Shortest signed delta `a - b` on the torus (matches math.sub(a, b) = a - b,
 * so callers doing `sub(target.pos, self.pos)` get the direction to the target
 * the short way around).
 */
export function sub(a: Vec2, b: Vec2): Vec2 {
  let dx = a.x - b.x;
  let dy = a.y - b.y;
  if (dx > ARENA_W / 2) dx -= ARENA_W;
  else if (dx < -ARENA_W / 2) dx += ARENA_W;
  if (dy > ARENA_H / 2) dy -= ARENA_H;
  else if (dy < -ARENA_H / 2) dy += ARENA_H;
  return { x: dx, y: dy };
}

export function distSq(a: Vec2, b: Vec2): number {
  const d = sub(a, b);
  return d.x * d.x + d.y * d.y;
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.sqrt(distSq(a, b));
}

/**
 * The copy of `p` nearest `ref` across the torus. Feed this to a Euclidean hit
 * test / renderer so a point that is "just across the seam" is treated as close.
 */
export function nearestCopy(p: Vec2, ref: Vec2): Vec2 {
  const d = sub(p, ref); // shortest ref -> p
  return { x: ref.x + d.x, y: ref.y + d.y };
}

// --- Toroidal wrappers around the Euclidean hit tests (same signatures) ------

export function pointInCircle(
  point: Vec2,
  center: Vec2,
  radius: number,
  targetRadius = 0,
): boolean {
  return euclidPointInCircle(nearestCopy(point, center), center, radius, targetRadius);
}

export function pointInCone(
  point: Vec2,
  origin: Vec2,
  angle: number,
  range: number,
  halfAngle: number,
  targetRadius = 0,
): boolean {
  return euclidPointInCone(
    nearestCopy(point, origin),
    origin,
    angle,
    range,
    halfAngle,
    targetRadius,
  );
}

export function pointInSegment(
  point: Vec2,
  a: Vec2,
  b: Vec2,
  halfWidth: number,
  targetRadius = 0,
): boolean {
  // Normalise both the point and the far endpoint toward the segment start so a
  // charge/beam/projectile that crosses the seam still tests correctly.
  return euclidPointInSegment(nearestCopy(point, a), a, nearestCopy(b, a), halfWidth, targetRadius);
}
