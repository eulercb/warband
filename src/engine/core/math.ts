/**
 * Warband — pure math helpers: Vec2 ops, RNG, and geometric hit tests
 * (circle / cone / line) used by all combat resolution.
 */
import type { Vec2 } from './types';

export const vec = (x: number, y: number): Vec2 => ({ x, y });
export const clone = (a: Vec2): Vec2 => ({ x: a.x, y: a.y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;

export const lenSq = (a: Vec2): number => a.x * a.x + a.y * a.y;
export const len = (a: Vec2): number => Math.sqrt(lenSq(a));

export function normalize(a: Vec2): Vec2 {
  const l = len(a);
  if (l < 1e-9) return { x: 0, y: 0 };
  return { x: a.x / l, y: a.y / l };
}

export function withLength(a: Vec2, target: number): Vec2 {
  const l = len(a);
  if (l < 1e-9) return { x: 0, y: 0 };
  const s = target / l;
  return { x: a.x * s, y: a.y * s };
}

export function clampLength(a: Vec2, max: number): Vec2 {
  const l = len(a);
  if (l <= max || l < 1e-9) return { x: a.x, y: a.y };
  const s = max / l;
  return { x: a.x * s, y: a.y * s };
}

export const dist = (a: Vec2, b: Vec2): number => len(sub(a, b));
export const distSq = (a: Vec2, b: Vec2): number => lenSq(sub(a, b));

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpVec(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function angleOf(a: Vec2): number {
  return Math.atan2(a.y, a.x);
}

export function fromAngle(rad: number, length = 1): Vec2 {
  return { x: Math.cos(rad) * length, y: Math.sin(rad) * length };
}

/** Smallest signed angular difference a-b in (-PI, PI]. */
export function angleDelta(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// ---------------------------------------------------------------------------
// Seeded RNG (mulberry32). Deterministic; only the host runs it.
// ---------------------------------------------------------------------------

/**
 * Deterministically fold a list of integers into a non-zero 32-bit seed
 * (FNV-1a-ish, order-sensitive). Used to derive every per-run / per-fight /
 * per-reward RNG stream from one master seed, so a whole gauntlet — boss set,
 * affixes, terrain AND between-boss reward offers — is reproducible from a single
 * shared seed (the seed-mode + run-of-the-day features).
 */
export function mixSeed(...vals: number[]): number {
  let h = 0x811c9dc5;
  for (const v of vals) {
    h ^= v | 0;
    h = Math.imul(h, 0x01000193);
    h ^= h >>> 15;
  }
  return h >>> 0 || 1;
}

export class Rng {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0 || 1;
  }
  /** float in [0,1) */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(lo: number, hi: number): number {
    return lo + this.next() * (hi - lo);
  }
  int(loInclusive: number, hiInclusive: number): number {
    return Math.floor(this.range(loInclusive, hiInclusive + 1));
  }
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

// ---------------------------------------------------------------------------
// Hit tests. Each returns whether `point` (with optional target radius) is
// inside the shape.
// ---------------------------------------------------------------------------

/** Circle: point within `radius` of `center` (target radius added). */
export function pointInCircle(
  point: Vec2,
  center: Vec2,
  radius: number,
  targetRadius = 0,
): boolean {
  return distSq(point, center) <= (radius + targetRadius) * (radius + targetRadius);
}

/**
 * Cone: apex at `origin`, facing `angle` (radians), reaching `range`, with
 * `halfAngle` half-width. `targetRadius` expands both range and angular width.
 */
export function pointInCone(
  point: Vec2,
  origin: Vec2,
  angle: number,
  range: number,
  halfAngle: number,
  targetRadius = 0,
): boolean {
  const d = sub(point, origin);
  const distance = len(d);
  if (distance > range + targetRadius) return false;
  if (distance < 1e-6) return true; // standing on the apex
  const pointAngle = Math.atan2(d.y, d.x);
  // Extra angular slack so a fat target on the cone edge still counts.
  const slack = distance > 1e-6 ? Math.asin(Math.min(1, targetRadius / distance)) : 0;
  return Math.abs(angleDelta(pointAngle, angle)) <= halfAngle + slack;
}

/**
 * Line / capsule: segment from `start` in `angle` for `length`, with half-width
 * `halfWidth`. `targetRadius` expands the width. Used for charges / beams.
 */
export function pointInLine(
  point: Vec2,
  start: Vec2,
  angle: number,
  length: number,
  halfWidth: number,
  targetRadius = 0,
): boolean {
  const dir = fromAngle(angle);
  const rel = sub(point, start);
  const along = dot(rel, dir); // projection onto the line direction
  if (along < -targetRadius || along > length + targetRadius) return false;
  // perpendicular distance
  const perp = Math.abs(rel.x * -dir.y + rel.y * dir.x);
  return perp <= halfWidth + targetRadius;
}

/** Point-to-point line capsule between two explicit endpoints. */
export function pointInSegment(
  point: Vec2,
  a: Vec2,
  b: Vec2,
  halfWidth: number,
  targetRadius = 0,
): boolean {
  const ab = sub(b, a);
  const abLen = len(ab);
  if (abLen < 1e-6) return pointInCircle(point, a, halfWidth, targetRadius);
  const dir = { x: ab.x / abLen, y: ab.y / abLen };
  const rel = sub(point, a);
  const along = clamp(dot(rel, dir), 0, abLen);
  const closest = { x: a.x + dir.x * along, y: a.y + dir.y * along };
  return pointInCircle(point, closest, halfWidth, targetRadius);
}
