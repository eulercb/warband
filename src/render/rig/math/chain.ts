/**
 * Warband — distance-constrained follow chain (spine / tail).
 *
 * PURE + unit-tested. Pulls each point to sit `spacing` from its predecessor,
 * anchored at `head`. `ease` < 1 adds lag so the chain follows the head with a
 * sinuous delay instead of snapping rigidly. `points[0]` is nearest the head.
 * Callers add a lateral sine at DRAW time for slither; the constraint itself
 * stays clean so it can't drift.
 */
import type { Vec2 } from './vec';

/**
 * Distance-constrain `points` behind `head`. With `ease === 1` every point lands
 * exactly `spacing` from its predecessor in a single pass; with `ease < 1` it
 * eases a fraction of the way there, converging over successive frames. Mutates
 * `points`.
 */
export function updateChain(points: Vec2[], head: Vec2, spacing: number, ease = 1): void {
  let prev = head;
  for (const pt of points) {
    const dx = pt.x - prev.x;
    const dy = pt.y - prev.y;
    const d = Math.hypot(dx, dy) || 1e-4;
    const tx = prev.x + (dx / d) * spacing;
    const ty = prev.y + (dy / d) * spacing;
    pt.x += (tx - pt.x) * ease;
    pt.y += (ty - pt.y) * ease;
    prev = pt;
  }
}

/** Build a straight chain of `n` points trailing `head` along `dir` at `spacing`. */
export function makeChain(head: Vec2, dir: Vec2, n: number, spacing: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 1; i <= n; i++) {
    out.push({ x: head.x + dir.x * spacing * i, y: head.y + dir.y * spacing * i });
  }
  return out;
}
