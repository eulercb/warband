/**
 * Warband — 2-bone IK unit tests (render/rig/math/ik).
 *
 * The joint solver is the crux of every articulated limb, so pin its invariants:
 * a reachable target keeps both bone lengths, an out-of-reach target clamps
 * cleanly (no NaN), a degenerate target is stable, and `bendRef` deterministically
 * flips which side the knee/elbow lands on.
 */
import { describe, it, expect } from 'vitest';
import { solveTwoBone } from '../src/render/rig/math/ik';
import type { Vec2 } from '../src/render/rig/math/vec';

const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
const finite = (p: Vec2): boolean => Number.isFinite(p.x) && Number.isFinite(p.y);

describe('solveTwoBone', () => {
  it('preserves both bone lengths for a reachable target', () => {
    const root = { x: 0, y: 0 };
    const target = { x: 1.6, y: 0 }; // well inside l1+l2 = 2
    const l1 = 1;
    const l2 = 1;
    const joint = solveTwoBone(root, target, l1, l2, { x: 0, y: 100 });
    expect(dist(root, joint)).toBeCloseTo(l1, 5);
    expect(dist(joint, target)).toBeCloseTo(l2, 5);
  });

  it('bends off the straight line for a bent solution', () => {
    const root = { x: 0, y: 0 };
    const target = { x: 1.6, y: 0 };
    const joint = solveTwoBone(root, target, 1, 1, { x: 0, y: 100 });
    // The joint must leave the root→target axis (y === 0) or it would be straight.
    expect(Math.abs(joint.y)).toBeGreaterThan(0.1);
  });

  it('clamps an unreachable target without NaN and points toward it', () => {
    const root = { x: 0, y: 0 };
    const target = { x: 10, y: 0 }; // far beyond l1+l2 = 2
    const joint = solveTwoBone(root, target, 1, 1, { x: 0, y: 100 });
    expect(finite(joint)).toBe(true);
    // Fully extended toward the target: root→joint ≈ l1, roughly along +x.
    expect(dist(root, joint)).toBeCloseTo(1, 3);
    expect(joint.x).toBeGreaterThan(0.9);
    expect(Math.abs(joint.y)).toBeLessThan(0.05);
  });

  it('stays finite for a degenerate (near-zero) target distance', () => {
    const root = { x: 5, y: 5 };
    const joint = solveTwoBone(root, { x: 5, y: 5 }, 1, 1, { x: 0, y: 0 });
    expect(finite(joint)).toBe(true);
  });

  it('stays finite when the target is closer than the bone-length difference', () => {
    const root = { x: 0, y: 0 };
    // |l1 - l2| = 2, target only 0.2 away — inside the fold radius.
    const joint = solveTwoBone(root, { x: 0.2, y: 0 }, 3, 1, { x: 0, y: 100 });
    expect(finite(joint)).toBe(true);
  });

  it('places the joint on the side away from bendRef, and flips with it', () => {
    const root = { x: 0, y: 0 };
    const target = { x: 1.6, y: 0 };
    const below = solveTwoBone(root, target, 1, 1, { x: 0.8, y: 100 }); // ref below → knee up
    const above = solveTwoBone(root, target, 1, 1, { x: 0.8, y: -100 }); // ref above → knee down
    expect(Math.sign(below.y)).toBe(-1);
    expect(Math.sign(above.y)).toBe(1);
    // Same magnitude, opposite side.
    expect(below.y).toBeCloseTo(-above.y, 6);
  });
});
