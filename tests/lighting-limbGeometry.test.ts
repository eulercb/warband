/**
 * Warband — limb quad-strip extrusion tests (render/lighting/limbGeometry).
 *
 * Pure geometry that feeds the `limb` shader variant: an `n`-point centre-line is
 * extruded ±perpendicular into a 2·n vertex strip. These pin the static layout
 * (`makeStrip`: UVs, cross-limb sign, indices) and the per-frame extrude
 * (`extrudeStrip`: endpoint perpendiculars, width-preserving miters, the
 * left/right symmetry the shader's ±perp normal relies on, and NaN-free handling
 * of degenerate zero-length segments). Values are derived by hand from the source.
 */
import { describe, it, expect } from 'vitest';
import { makeStrip, extrudeStrip } from '../src/render/lighting/limbGeometry';
import type { Vec2 } from '../src/render/rig/math/vec';

const SQRT1_2 = Math.SQRT1_2; // 1/√2 ≈ 0.70710678

/** Read vertex `i`'s [x,y] from a vec2 buffer, normalising −0 → +0 (a perpendicular
 * like (−0, 1) is arithmetically identical to (0, 1); only `toEqual` distinguishes). */
const vert = (buf: Float32Array, i: number): [number, number] => [
  buf[i * 2] + 0,
  buf[i * 2 + 1] + 0,
];

describe('makeStrip', () => {
  it('allocates 2·n vertices and 6·(n−1) indices', () => {
    const s = makeStrip(3);
    expect(s.points).toBe(3);
    expect(s.positions).toHaveLength(12); // 2·3 verts × 2
    expect(s.uvs).toHaveLength(12);
    expect(s.perp).toHaveLength(12);
    expect(s.v).toHaveLength(6); // one float per vertex
    expect(s.indices).toHaveLength(12); // 2 segments × 6
  });

  it('a single-point strip has no segments (draws nothing)', () => {
    const s = makeStrip(1);
    expect(s.positions).toHaveLength(4);
    expect(s.indices).toHaveLength(0);
  });

  it('bakes the cross-limb sign: left vertices +1, right vertices −1', () => {
    const s = makeStrip(3);
    expect(Array.from(s.v)).toEqual([1, -1, 1, -1, 1, -1]);
  });

  it('lays UVs as along-limb t (x) × cross 0/1 (y)', () => {
    const s = makeStrip(3);
    // point 0 t=0, point 1 t=0.5, point 2 t=1; left y=0, right y=1.
    expect(Array.from(s.uvs)).toEqual([0, 0, 0, 1, 0.5, 0, 0.5, 1, 1, 0, 1, 1]);
  });

  it('emits two triangles per segment referencing the strip corners', () => {
    const s = makeStrip(3);
    // seg 0: (L0,R0,R1)+(L0,R1,L1); seg 1: (L1,R1,R2)+(L1,R2,L2).
    expect(Array.from(s.indices)).toEqual([0, 1, 3, 0, 3, 2, 2, 3, 5, 2, 5, 4]);
  });

  it('indices only ever reference existing vertices', () => {
    for (const n of [2, 4, 7]) {
      const s = makeStrip(n);
      const max = Math.max(...s.indices);
      expect(max).toBeLessThan(2 * n);
    }
  });
});

describe('extrudeStrip — straight limb', () => {
  it('extrudes ±perp by the half-width; left/right straddle the centre-line', () => {
    const s = makeStrip(3);
    const pts: Vec2[] = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 4, y: 0 },
    ];
    extrudeStrip(s, pts, [0.5, 0.5, 0.5]);
    // dir = +x → perp = (0,1). Left = centre + (0,hw), right = centre − (0,hw).
    expect(vert(s.positions, 0)).toEqual([0, 0.5]); // L0
    expect(vert(s.positions, 1)).toEqual([0, -0.5]); // R0
    expect(vert(s.positions, 2)).toEqual([2, 0.5]); // L1
    expect(vert(s.positions, 3)).toEqual([2, -0.5]); // R1
    expect(vert(s.positions, 4)).toEqual([4, 0.5]); // L2
    expect(vert(s.positions, 5)).toEqual([4, -0.5]); // R2
    // aPerp is the +perp direction, identical for both vertices of a point.
    for (let i = 0; i < 6; i++) expect(vert(s.perp, i)).toEqual([0, 1]);
  });

  it('tapers width per point', () => {
    const s = makeStrip(2);
    const pts: Vec2[] = [
      { x: 0, y: 0 },
      { x: 0, y: 3 },
    ];
    extrudeStrip(s, pts, [1, 0]); // full at root, pinched to a point at the tip
    // dir = +y → perp = (−1,0). Root straddles ±1 in x; tip collapses to the point.
    expect(vert(s.positions, 0)).toEqual([-1, 0]);
    expect(vert(s.positions, 1)).toEqual([1, 0]);
    expect(vert(s.positions, 2)).toEqual([0, 3]);
    expect(vert(s.positions, 3)).toEqual([0, 3]);
  });
});

describe('extrudeStrip — miter at a bend', () => {
  const s = makeStrip(3);
  const pts: Vec2[] = [
    { x: 0, y: 0 },
    { x: 1, y: 0 }, // right-angle joint
    { x: 1, y: 1 },
  ];
  extrudeStrip(s, pts, [0.5, 0.5, 0.5]);

  it('widens the joint offset by 1/cos(½·bend) so the tube keeps its width', () => {
    // At the 90° joint the left edge lies on both segment offset lines: (1−hw, hw).
    expect(vert(s.positions, 2)[0]).toBeCloseTo(0.5, 6);
    expect(vert(s.positions, 2)[1]).toBeCloseTo(0.5, 6);
    expect(vert(s.positions, 3)[0]).toBeCloseTo(1.5, 6);
    expect(vert(s.positions, 3)[1]).toBeCloseTo(-0.5, 6);
    // The miter perpendicular is the (normalised) bisector.
    expect(vert(s.perp, 2)[0]).toBeCloseTo(-SQRT1_2, 6);
    expect(vert(s.perp, 2)[1]).toBeCloseTo(SQRT1_2, 6);
  });

  it('keeps endpoints on their single adjacent segment perpendicular', () => {
    expect(vert(s.perp, 0)).toEqual([0, 1]); // seg0 dir +x → perp (0,1)
    expect(vert(s.perp, 4)[0]).toBeCloseTo(-1, 6); // seg1 dir +y → perp (−1,0)
    expect(vert(s.perp, 4)[1]).toBeCloseTo(0, 6);
  });
});

describe('extrudeStrip — invariants & robustness', () => {
  it('left/right vertices are always symmetric about the centre-line point', () => {
    const s = makeStrip(4);
    const pts: Vec2[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0.5 },
      { x: 2.2, y: 1.4 },
      { x: 2.5, y: 3 },
    ];
    extrudeStrip(s, pts, [0.4, 0.3, 0.2, 0.05]);
    for (let i = 0; i < pts.length; i++) {
      const [lx, ly] = vert(s.positions, 2 * i);
      const [rx, ry] = vert(s.positions, 2 * i + 1);
      expect((lx + rx) / 2).toBeCloseTo(pts[i].x, 6);
      expect((ly + ry) / 2).toBeCloseTo(pts[i].y, 6);
    }
  });

  it('emits unit-length perpendiculars everywhere', () => {
    const s = makeStrip(4);
    const pts: Vec2[] = [
      { x: 0, y: 0 },
      { x: 3, y: 0.2 },
      { x: 3.5, y: 2 },
      { x: 2, y: 3 },
    ];
    extrudeStrip(s, pts, [0.5, 0.5, 0.5, 0.5]);
    for (let i = 0; i < 8; i++) {
      const [px, py] = vert(s.perp, i);
      expect(Math.hypot(px, py)).toBeCloseTo(1, 6);
    }
  });

  it('clamps the miter on a sharp fold-back instead of exploding', () => {
    const s = makeStrip(3);
    // ~170° reversal: bisector is tiny, so an un-clamped miter would blow up.
    const pts: Vec2[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0.02, y: 0.001 },
    ];
    extrudeStrip(s, pts, [0.5, 0.5, 0.5]);
    const [lx, ly] = vert(s.positions, 2);
    const spread = Math.hypot(lx - pts[1].x, ly - pts[1].y);
    expect(Number.isFinite(spread)).toBe(true);
    expect(spread).toBeLessThanOrEqual(0.5 * 4 + 1e-6); // MAX_MITER × hw
  });

  it('falls back to a segment perpendicular on an exact 180° fold-back', () => {
    const s = makeStrip(3);
    // Out-and-back: the bisector is exactly zero, so the miter would be undefined.
    const pts: Vec2[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 0 },
    ];
    extrudeStrip(s, pts, [0.5, 0.5, 0.5]);
    // Joint perp collapses to the incoming segment's perp (0,1); vertices stay finite.
    expect(vert(s.perp, 2)).toEqual([0, 1]);
    expect(vert(s.positions, 2)).toEqual([1, 0.5]);
    expect(vert(s.positions, 3)).toEqual([1, -0.5]);
  });

  it('never produces NaN on a zero-length (repeated-point) segment', () => {
    const s = makeStrip(3);
    const pts: Vec2[] = [
      { x: 1, y: 1 },
      { x: 1, y: 1 }, // duplicate → zero-length incoming/outgoing segment
      { x: 2, y: 1 },
    ];
    extrudeStrip(s, pts, [0.5, 0.5, 0.5]);
    for (const value of s.positions) expect(Number.isNaN(value)).toBe(false);
    for (const value of s.perp) expect(Number.isNaN(value)).toBe(false);
  });
});
