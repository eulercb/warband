/**
 * Warband — 2-bone inverse kinematics (law of cosines).
 *
 * PURE + unit-tested. Given a limb root, a target, and two bone lengths, returns
 * the single joint (knee / elbow) position. `bendRef` disambiguates the two
 * mathematically valid solutions: the joint is always placed on the side of the
 * root→target line AWAY from `bendRef`. Pass the body centre so a leg's knee
 * splays outward, or a fixed reference so a biped's knee bends a consistent way.
 */
import type { Vec2 } from './vec';

/**
 * 2-bone IK. Returns the joint for a limb from `root` to `target` with bone
 * lengths `l1` (root→joint) and `l2` (joint→target). `bendRef` is a point the
 * joint bends AWAY from. Clamps so the limb is never fully straight (stable, no
 * snapping) and never NaN for an out-of-reach or degenerate target.
 */
export function solveTwoBone(
  root: Vec2,
  target: Vec2,
  l1: number,
  l2: number,
  bendRef: Vec2,
): Vec2 {
  const dx = target.x - root.x;
  const dy = target.y - root.y;
  const dist = Math.hypot(dx, dy) || 1e-4;
  // Clamp the effective reach so the target is always strictly inside l1+l2
  // (never fully straight) and no closer than |l1-l2| (never fully folded).
  const d = Math.min(Math.max(dist, Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3);
  const a = (d * d + l1 * l1 - l2 * l2) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const nx = dx / dist;
  const ny = dy / dist;
  const bx = root.x + nx * a;
  const by = root.y + ny * a;
  // Perpendicular to the root→target direction.
  const px = -ny;
  const py = nx;
  // Bend away from `bendRef`: pick the perpendicular sign whose half-plane the
  // midpoint sits in relative to the reference point.
  const mx = (root.x + target.x) / 2 - bendRef.x;
  const my = (root.y + target.y) / 2 - bendRef.y;
  const sign = px * mx + py * my >= 0 ? 1 : -1;
  return { x: bx + px * h * sign, y: by + py * h * sign };
}
