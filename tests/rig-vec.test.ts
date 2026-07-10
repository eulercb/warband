import { describe, it, expect } from 'vitest';
import {
  v,
  vadd,
  vsub,
  vscale,
  vlen,
  vdist,
  vnorm,
  fromAngle,
  vrot,
  vperp,
  vlerp,
} from '../src/render/rig/math/vec';

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 9);

describe('rig/math/vec', () => {
  it('v constructs a plain point', () => {
    expect(v(3, -4)).toEqual({ x: 3, y: -4 });
  });

  it('vadd / vsub combine componentwise', () => {
    expect(vadd(v(1, 2), v(3, 4))).toEqual({ x: 4, y: 6 });
    expect(vsub(v(1, 2), v(3, 4))).toEqual({ x: -2, y: -2 });
  });

  it('vscale multiplies both components', () => {
    expect(vscale(v(2, -3), 2.5)).toEqual({ x: 5, y: -7.5 });
  });

  it('vlen / vdist use Euclidean distance', () => {
    expect(vlen(v(3, 4))).toBe(5);
    expect(vdist(v(1, 1), v(4, 5))).toBe(5);
  });

  it('vnorm returns a unit vector', () => {
    const n = vnorm(v(3, 4));
    close(n.x, 0.6);
    close(n.y, 0.8);
    close(vlen(n), 1);
  });

  it('vnorm returns zero for a (near) zero-length input', () => {
    expect(vnorm(v(0, 0))).toEqual({ x: 0, y: 0 });
    expect(vnorm(v(1e-12, 1e-12))).toEqual({ x: 0, y: 0 });
  });

  it('fromAngle places a point on the circle of the given radius', () => {
    const p = fromAngle(0, 5);
    close(p.x, 5);
    close(p.y, 0);
    const q = fromAngle(Math.PI / 2, 2);
    close(q.x, 0);
    close(q.y, 2);
    // Default length is 1 (unit circle).
    close(vlen(fromAngle(1.234)), 1);
  });

  it('vrot rotates in screen space (y-down, CCW positive)', () => {
    const r = vrot(v(1, 0), Math.PI / 2);
    close(r.x, 0);
    close(r.y, 1);
    // Rotation preserves length.
    close(vlen(vrot(v(3, 4), 0.7)), 5);
  });

  it('vperp is the 90° CCW perpendicular', () => {
    // (use closeness so a signed zero from `-a.y` doesn't fail toEqual)
    close(vperp(v(1, 0)).x, 0);
    close(vperp(v(1, 0)).y, 1);
    close(vperp(v(0, 1)).x, -1);
    close(vperp(v(0, 1)).y, 0);
    // Perpendicular has zero dot product with the original.
    const a = v(2, -5);
    const p = vperp(a);
    close(a.x * p.x + a.y * p.y, 0);
  });

  it('vlerp interpolates endpoints and midpoint', () => {
    expect(vlerp(v(0, 0), v(10, 20), 0)).toEqual({ x: 0, y: 0 });
    expect(vlerp(v(0, 0), v(10, 20), 1)).toEqual({ x: 10, y: 20 });
    expect(vlerp(v(0, 0), v(10, 20), 0.5)).toEqual({ x: 5, y: 10 });
  });
});
