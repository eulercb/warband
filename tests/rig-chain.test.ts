/**
 * Warband — follow-chain unit tests (render/rig/math/chain).
 *
 * Pins the distance constraint: with ease = 1 one pass makes every segment sit
 * exactly `spacing` from its predecessor; with ease < 1 it converges toward that
 * over iterations; and the head anchor is always honoured (segment 0 is measured
 * from the head, not from the origin).
 */
import { describe, it, expect } from 'vitest';
import { updateChain, makeChain } from '../src/render/rig/math/chain';
import type { Vec2 } from '../src/render/rig/math/vec';

const gap = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

describe('updateChain', () => {
  it('sets every segment to exactly `spacing` in one pass when ease = 1', () => {
    const head = { x: 0, y: 0 };
    const points: Vec2[] = [
      { x: 5, y: 3 },
      { x: 20, y: -8 },
      { x: 33, y: 25 },
    ];
    updateChain(points, head, 10, 1);
    expect(gap(head, points[0])).toBeCloseTo(10, 6);
    expect(gap(points[0], points[1])).toBeCloseTo(10, 6);
    expect(gap(points[1], points[2])).toBeCloseTo(10, 6);
  });

  it('honours the head anchor: point 0 is measured from the head', () => {
    const head = { x: 100, y: 100 };
    const points: Vec2[] = [{ x: 130, y: 100 }];
    updateChain(points, head, 12, 1);
    expect(gap(head, points[0])).toBeCloseTo(12, 6);
    // Still on the +x side of the head (direction preserved).
    expect(points[0].x).toBeGreaterThan(head.x);
    expect(points[0].y).toBeCloseTo(100, 6);
  });

  it('converges toward the constraint over iterations when ease < 1', () => {
    const head = { x: 0, y: 0 };
    const points: Vec2[] = [
      { x: 40, y: 0 },
      { x: 90, y: 0 },
    ];
    const err = (): number =>
      Math.abs(gap(head, points[0]) - 10) + Math.abs(gap(points[0], points[1]) - 10);
    const before = err();
    for (let i = 0; i < 60; i++) updateChain(points, head, 10, 0.35);
    const after = err();
    expect(after).toBeLessThan(before);
    expect(after).toBeCloseTo(0, 2); // effectively converged
  });

  it('makeChain lays out a straight, correctly-spaced chain', () => {
    const head = { x: 0, y: 0 };
    const chain = makeChain(head, { x: 1, y: 0 }, 4, 7);
    expect(chain).toHaveLength(4);
    expect(gap(head, chain[0])).toBeCloseTo(7, 6);
    for (let i = 1; i < chain.length; i++) {
      expect(gap(chain[i - 1], chain[i])).toBeCloseTo(7, 6);
    }
  });
});
