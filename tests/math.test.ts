import { describe, it, expect } from 'vitest';
import type { Vec2 } from '../src/engine/types';
import {
  vec,
  clone,
  add,
  sub,
  scale,
  dot,
  lenSq,
  len,
  normalize,
  withLength,
  clampLength,
  dist,
  distSq,
  lerp,
  lerpVec,
  clamp,
  angleOf,
  fromAngle,
  angleDelta,
  Rng,
  pointInCircle,
  pointInCone,
  pointInLine,
  pointInSegment,
} from '../src/engine/math';

/** Assert a Vec2 close to (x, y); toBeCloseTo tolerates signed zero / FP noise. */
function expectVec(v: Vec2, x: number, y: number, precision = 9): void {
  expect(v.x).toBeCloseTo(x, precision);
  expect(v.y).toBeCloseTo(y, precision);
}

const TAU = Math.PI * 2;

describe('vec / clone', () => {
  it('vec builds a plain {x,y}', () => {
    const v = vec(1, 2);
    expect(v.x).toBe(1);
    expect(v.y).toBe(2);
  });

  it('clone copies values into a fresh object', () => {
    const a = vec(3, 4);
    const c = clone(a);
    expectVec(c, 3, 4);
    expect(c).not.toBe(a); // distinct reference
  });

  it('clone does not alias the source', () => {
    const a = vec(3, 4);
    const c = clone(a);
    c.x = 99;
    expect(a.x).toBe(3);
  });
});

describe('add / sub / scale', () => {
  it('add sums components', () => {
    expectVec(add(vec(1, 2), vec(3, 4)), 4, 6);
  });

  it('add with negatives', () => {
    expectVec(add(vec(1, 2), vec(-3, -5)), -2, -3);
  });

  it('sub subtracts components', () => {
    expectVec(sub(vec(4, 6), vec(1, 2)), 3, 4);
  });

  it('sub of equal vectors is zero', () => {
    expectVec(sub(vec(5, -5), vec(5, -5)), 0, 0);
  });

  it('scale multiplies both components', () => {
    expectVec(scale(vec(2, 3), 2), 4, 6);
  });

  it('scale by zero yields zero vector', () => {
    expectVec(scale(vec(2, 3), 0), 0, 0);
  });

  it('scale by a negative factor flips direction', () => {
    expectVec(scale(vec(2, -3), -2), -4, 6);
  });
});

describe('dot', () => {
  it('computes the dot product', () => {
    expect(dot(vec(1, 2), vec(3, 4))).toBeCloseTo(11);
  });

  it('perpendicular vectors dot to zero', () => {
    expect(dot(vec(1, 0), vec(0, 1))).toBeCloseTo(0);
  });

  it('anti-parallel vectors dot negative', () => {
    expect(dot(vec(1, 0), vec(-2, 0))).toBeCloseTo(-2);
  });
});

describe('lenSq / len', () => {
  it('lenSq is the squared magnitude', () => {
    expect(lenSq(vec(3, 4))).toBeCloseTo(25);
  });

  it('len is the magnitude', () => {
    expect(len(vec(3, 4))).toBeCloseTo(5);
  });

  it('len of the zero vector is zero', () => {
    expect(len(vec(0, 0))).toBeCloseTo(0);
    expect(lenSq(vec(0, 0))).toBeCloseTo(0);
  });

  it('len of a negative-component vector', () => {
    expect(len(vec(-3, -4))).toBeCloseTo(5);
  });
});

describe('normalize', () => {
  it('scales a vector to unit length', () => {
    expectVec(normalize(vec(3, 4)), 0.6, 0.8);
    expect(len(normalize(vec(3, 4)))).toBeCloseTo(1);
  });

  it('returns zero for the zero vector (below 1e-9 threshold)', () => {
    expectVec(normalize(vec(0, 0)), 0, 0);
  });

  it('returns zero for a sub-threshold tiny vector', () => {
    expectVec(normalize(vec(1e-10, 0)), 0, 0);
  });

  it('normalizes a vector just above the threshold', () => {
    // len 1e-8 >= 1e-9, so it takes the normal branch.
    expectVec(normalize(vec(1e-8, 0)), 1, 0);
  });

  it('preserves direction for a negative vector', () => {
    expectVec(normalize(vec(-3, -4)), -0.6, -0.8);
  });
});

describe('withLength', () => {
  it('rescales to the target length', () => {
    expectVec(withLength(vec(3, 4), 10), 6, 8);
    expect(len(withLength(vec(3, 4), 10))).toBeCloseTo(10);
  });

  it('returns zero for the zero vector', () => {
    expectVec(withLength(vec(0, 0), 10), 0, 0);
  });

  it('returns zero for a sub-threshold vector', () => {
    expectVec(withLength(vec(1e-12, 1e-12), 5), 0, 0);
  });

  it('target of zero yields the zero vector', () => {
    expectVec(withLength(vec(3, 4), 0), 0, 0);
  });

  it('negative target flips the direction', () => {
    expectVec(withLength(vec(3, 4), -5), -3, -4);
  });
});

describe('clampLength', () => {
  it('leaves a vector shorter than max unchanged', () => {
    expectVec(clampLength(vec(3, 4), 10), 3, 4);
  });

  it('leaves a vector exactly at max unchanged (<= boundary)', () => {
    expectVec(clampLength(vec(3, 4), 5), 3, 4);
  });

  it('shortens a vector longer than max to exactly max', () => {
    // len 5, max 2.5 -> scale 0.5
    const r = clampLength(vec(3, 4), 2.5);
    expectVec(r, 1.5, 2);
    expect(len(r)).toBeCloseTo(2.5);
  });

  it('returns a copy, not the same reference', () => {
    const a = vec(3, 4);
    expect(clampLength(a, 10)).not.toBe(a);
    expect(clampLength(a, 1)).not.toBe(a);
  });

  it('zero vector with a negative max hits the tiny-length guard', () => {
    // 0 <= -1 is false, so the || l < 1e-9 branch is what returns the copy.
    expectVec(clampLength(vec(0, 0), -1), 0, 0);
  });
});

describe('dist / distSq', () => {
  it('dist is the distance between points', () => {
    expect(dist(vec(0, 0), vec(3, 4))).toBeCloseTo(5);
  });

  it('distSq is the squared distance', () => {
    expect(distSq(vec(0, 0), vec(3, 4))).toBeCloseTo(25);
  });

  it('is symmetric and works with offsets', () => {
    expect(dist(vec(1, 2), vec(4, 6))).toBeCloseTo(5);
    expect(dist(vec(4, 6), vec(1, 2))).toBeCloseTo(5);
  });

  it('distance to itself is zero', () => {
    expect(dist(vec(7, -3), vec(7, -3))).toBeCloseTo(0);
    expect(distSq(vec(7, -3), vec(7, -3))).toBeCloseTo(0);
  });
});

describe('lerp / lerpVec', () => {
  it('interpolates at the endpoints and midpoint', () => {
    expect(lerp(0, 10, 0)).toBeCloseTo(0);
    expect(lerp(0, 10, 1)).toBeCloseTo(10);
    expect(lerp(0, 10, 0.5)).toBeCloseTo(5);
  });

  it('does not clamp t (extrapolates)', () => {
    expect(lerp(0, 10, 2)).toBeCloseTo(20);
    expect(lerp(0, 10, -1)).toBeCloseTo(-10);
  });

  it('works with non-zero start', () => {
    expect(lerp(10, 20, 0.25)).toBeCloseTo(12.5);
  });

  it('lerpVec interpolates each component', () => {
    expectVec(lerpVec(vec(0, 0), vec(10, 20), 0.5), 5, 10);
    expectVec(lerpVec(vec(2, 4), vec(6, 8), 0), 2, 4);
    expectVec(lerpVec(vec(2, 4), vec(6, 8), 1), 6, 8);
  });
});

describe('clamp', () => {
  it('returns the value when inside the range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('clamps to the low bound', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('clamps to the high bound', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('bounds are inclusive', () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it('works with negative ranges', () => {
    expect(clamp(-7, -10, -1)).toBe(-7);
    expect(clamp(-20, -10, -1)).toBe(-10);
    expect(clamp(5, -10, -1)).toBe(-1);
  });
});

describe('angleOf', () => {
  it('returns axis angles', () => {
    expect(angleOf(vec(1, 0))).toBeCloseTo(0);
    expect(angleOf(vec(0, 1))).toBeCloseTo(Math.PI / 2);
    expect(angleOf(vec(-1, 0))).toBeCloseTo(Math.PI);
    expect(angleOf(vec(0, -1))).toBeCloseTo(-Math.PI / 2);
  });

  it('returns diagonal angles', () => {
    expect(angleOf(vec(1, 1))).toBeCloseTo(Math.PI / 4);
  });

  it('zero vector maps to 0', () => {
    expect(angleOf(vec(0, 0))).toBeCloseTo(0);
  });
});

describe('fromAngle', () => {
  it('unit vector along the axes (default length 1)', () => {
    expectVec(fromAngle(0), 1, 0);
    expectVec(fromAngle(Math.PI / 2), 0, 1);
    expectVec(fromAngle(Math.PI), -1, 0);
    expectVec(fromAngle(-Math.PI / 2), 0, -1);
  });

  it('scales by the length argument', () => {
    expectVec(fromAngle(0, 5), 5, 0);
    expectVec(fromAngle(Math.PI / 2, 3), 0, 3);
  });

  it('round-trips with angleOf', () => {
    expect(angleOf(fromAngle(0.7))).toBeCloseTo(0.7);
    expect(len(fromAngle(1.2, 4))).toBeCloseTo(4);
  });
});

describe('angleDelta', () => {
  it('small differences pass through unchanged', () => {
    expect(angleDelta(0.5, 0)).toBeCloseTo(0.5);
    expect(angleDelta(-0.5, 0)).toBeCloseTo(-0.5);
    expect(angleDelta(0, 0)).toBeCloseTo(0);
  });

  it('subtracts a full turn when d > PI', () => {
    // (4 - 0) = 4 > PI  ->  4 - 2PI
    expect(angleDelta(4, 0)).toBeCloseTo(4 - TAU);
  });

  it('adds a full turn when d < -PI', () => {
    // (0 - 4) = -4 < -PI  ->  -4 + 2PI
    expect(angleDelta(0, 4)).toBeCloseTo(-4 + TAU);
  });

  it('the upper bound PI is inclusive (returned as-is)', () => {
    expect(angleDelta(Math.PI, 0)).toBeCloseTo(Math.PI);
  });

  it('wraps values a full turn apart to zero', () => {
    expect(angleDelta(Math.PI, -Math.PI)).toBeCloseTo(0);
  });

  it('reduces large angles via the modulo first', () => {
    // (10 - 3) = 7; 7 % 2PI == 7 - 2PI ~= 0.71681, within range
    expect(angleDelta(10, 3)).toBeCloseTo(7 - TAU);
    // (3 - 10) = -7; -7 % 2PI == 2PI - 7 ~= -0.71681
    expect(angleDelta(3, 10)).toBeCloseTo(TAU - 7);
  });

  it('is (approximately) antisymmetric for non-boundary inputs', () => {
    expect(angleDelta(1.2, 0.3)).toBeCloseTo(0.9);
    expect(angleDelta(0.3, 1.2)).toBeCloseTo(-0.9);
  });
});

describe('Rng', () => {
  it('produces the pinned mulberry32 sequence for seed 1', () => {
    const r = new Rng(1);
    expect(r.next()).toBeCloseTo(0.627073940588161, 12);
    expect(r.next()).toBeCloseTo(0.002735721180215, 12);
    expect(r.next()).toBeCloseTo(0.527447039959952, 12);
    expect(r.next()).toBeCloseTo(0.981050967471674, 12);
    expect(r.next()).toBeCloseTo(0.968377898214385, 12);
  });

  it('seed 0 is coerced to 1 (0 >>> 0 || 1)', () => {
    // Same sequence as seed 1.
    expect(new Rng(0).next()).toBeCloseTo(0.627073940588161, 12);
  });

  it('handles a negative seed via >>> 0', () => {
    // -1 >>> 0 === 4294967295
    expect(new Rng(-1).next()).toBeCloseTo(0.896422614110634, 12);
  });

  it('is deterministic: same seed -> identical sequence', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    const seqA = [a.next(), a.next(), a.next()];
    const seqB = [b.next(), b.next(), b.next()];
    expect(seqA).toEqual(seqB); // bit-identical computation
  });

  it('next() stays within [0, 1)', () => {
    const r = new Rng(999);
    let min = 1;
    let max = 0;
    for (let i = 0; i < 10000; i++) {
      const v = r.next();
      if (v < min) min = v;
      if (v > max) max = v;
    }
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThan(1);
  });

  it('range maps into [lo, hi)', () => {
    // seed 42 first next() = 0.601103751920164
    expect(new Rng(42).range(10, 20)).toBeCloseTo(16.01103751920164, 9);
  });

  it('range respects bounds over many draws', () => {
    const r = new Rng(3);
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 10000; i++) {
      const v = r.range(-2, 8);
      if (v < min) min = v;
      if (v > max) max = v;
    }
    expect(min).toBeGreaterThanOrEqual(-2);
    expect(max).toBeLessThan(8);
  });

  it('int is inclusive on both ends and always integral', () => {
    // seed 42: floor(1 + 0.60110... * 6) = floor(4.6066) = 4
    expect(new Rng(42).int(1, 6)).toBe(4);

    const r = new Rng(7);
    const vals: number[] = [];
    for (let i = 0; i < 10000; i++) vals.push(r.int(1, 6));
    expect(vals.every((v) => Number.isInteger(v) && v >= 1 && v <= 6)).toBe(true);
    expect(vals).toContain(1); // lo inclusive
    expect(vals).toContain(6); // hi inclusive
  });

  it('pick selects a deterministic element', () => {
    // seed 42: floor(0.60110 * 4) = floor(2.404) = 2 -> 'c'
    expect(new Rng(42).pick(['a', 'b', 'c', 'd'])).toBe('c');
  });

  it('pick always returns index 0 for a single-element array', () => {
    expect(new Rng(1).pick(['only'])).toBe('only');
    expect(new Rng(9999).pick(['only'])).toBe('only');
  });

  it('pick on an empty array yields undefined', () => {
    expect(new Rng(1).pick<number>([])).toBeUndefined();
  });
});

describe('pointInCircle', () => {
  it('point strictly inside is a hit', () => {
    expect(pointInCircle(vec(1, 0), vec(0, 0), 3)).toBe(true);
  });

  it('point on the boundary is a hit (<= radius)', () => {
    expect(pointInCircle(vec(3, 0), vec(0, 0), 3)).toBe(true);
  });

  it('point outside is a miss', () => {
    expect(pointInCircle(vec(4, 0), vec(0, 0), 3)).toBe(false);
  });

  it('targetRadius widens the circle', () => {
    // dist 4, radius 3 + target 1 = 4 -> exactly on the expanded edge
    expect(pointInCircle(vec(4, 0), vec(0, 0), 3, 1)).toBe(true);
    expect(pointInCircle(vec(4, 0), vec(0, 0), 3, 0.5)).toBe(false);
  });

  it('respects a non-origin center', () => {
    expect(pointInCircle(vec(5, 5), vec(5, 4), 1)).toBe(true);
    expect(pointInCircle(vec(5, 6.5), vec(5, 4), 1)).toBe(false);
  });
});

describe('pointInCone', () => {
  const origin = vec(0, 0);

  it('point along the facing axis within range is a hit', () => {
    expect(pointInCone(vec(5, 0), origin, 0, 10, Math.PI / 4)).toBe(true);
  });

  it('point beyond range is a miss', () => {
    expect(pointInCone(vec(20, 0), origin, 0, 10, Math.PI / 4)).toBe(false);
  });

  it('range boundary is inclusive', () => {
    expect(pointInCone(vec(10, 0), origin, 0, 10, Math.PI / 4)).toBe(true);
    expect(pointInCone(vec(10.001, 0), origin, 0, 10, Math.PI / 4)).toBe(false);
  });

  it('point outside the angular half-width is a miss', () => {
    // straight up: angle PI/2 vs half-angle PI/4
    expect(pointInCone(vec(0, 5), origin, 0, 10, Math.PI / 4)).toBe(false);
  });

  it('point exactly on the apex is always a hit', () => {
    expect(pointInCone(origin, origin, 0, 10, 0.01)).toBe(true);
    // even a wildly off facing still hits at the apex
    expect(pointInCone(vec(2, 3), vec(2, 3), Math.PI, 5, 0.001)).toBe(true);
  });

  it('a point extremely close to the apex takes the apex branch', () => {
    expect(pointInCone(vec(1e-8, 0), origin, Math.PI, 10, 0.001)).toBe(true);
  });

  it('a point at exactly distance 1e-6 uses the zero-slack path', () => {
    // len(1e-6, 0) === 1e-6 exactly, so `distance < 1e-6` is false (no apex
    // return) yet `distance > 1e-6` is also false -> slack ternary takes `: 0`.
    // On-axis (angle 0) it is still a hit.
    expect(pointInCone(vec(1e-6, 0), origin, 0, 10, 0.001)).toBe(true);
  });

  it('targetRadius extends the effective range', () => {
    expect(pointInCone(vec(10.5, 0), origin, 0, 10, 0.1, 1)).toBe(true);
    expect(pointInCone(vec(11.5, 0), origin, 0, 10, 0.1, 1)).toBe(false);
  });

  it('targetRadius adds angular slack (normal asin path)', () => {
    const ang = 0.35;
    const p = vec(Math.cos(ang) * 5, Math.sin(ang) * 5);
    // half-angle 0.2 < 0.35 -> miss without slack
    expect(pointInCone(p, origin, 0, 100, 0.2)).toBe(false);
    // slack = asin(1/5) = 0.2014, so 0.2 + 0.2014 = 0.4014 >= 0.35 -> hit
    expect(pointInCone(p, origin, 0, 100, 0.2, 1)).toBe(true);
  });

  it('angular slack clamps targetRadius/distance to 1 (asin domain)', () => {
    // point at 90 deg, half-angle 45 deg. targetRadius 10 > distance 5 -> ratio
    // clamps to 1 -> slack = asin(1) = PI/2, so PI/4 + PI/2 covers PI/2.
    expect(pointInCone(vec(0, 5), origin, 0, 100, Math.PI / 4)).toBe(false);
    expect(pointInCone(vec(0, 5), origin, 0, 100, Math.PI / 4, 10)).toBe(true);
  });

  it('honours a non-zero facing angle', () => {
    // facing straight up (PI/2); point straight up is centered in the cone.
    expect(pointInCone(vec(0, 5), origin, Math.PI / 2, 10, Math.PI / 6)).toBe(true);
    // point to the right is outside a narrow upward cone.
    expect(pointInCone(vec(5, 0), origin, Math.PI / 2, 10, Math.PI / 6)).toBe(false);
  });
});

describe('pointInLine', () => {
  const start = vec(0, 0);

  it('point on the segment axis within length is a hit', () => {
    expect(pointInLine(vec(5, 0), start, 0, 10, 1)).toBe(true);
  });

  it('point behind the start is a miss', () => {
    expect(pointInLine(vec(-1, 0), start, 0, 10, 1)).toBe(false);
  });

  it('point beyond the end is a miss', () => {
    expect(pointInLine(vec(11, 0), start, 0, 10, 1)).toBe(false);
  });

  it('point too far to the side (perp) is a miss', () => {
    expect(pointInLine(vec(5, 2), start, 0, 10, 1)).toBe(false);
  });

  it('perpendicular half-width boundary is inclusive', () => {
    expect(pointInLine(vec(5, 1), start, 0, 10, 1)).toBe(true);
  });

  it('targetRadius widens the half-width', () => {
    expect(pointInLine(vec(5, 1.5), start, 0, 10, 1, 0.5)).toBe(true);
    expect(pointInLine(vec(5, 1.6), start, 0, 10, 1, 0.5)).toBe(false);
  });

  it('targetRadius extends the along-axis span at both ends', () => {
    // start side: along -0.5, targetRadius 0.5 -> -0.5 < -0.5 is false -> pass
    expect(pointInLine(vec(-0.5, 0), start, 0, 10, 1, 0.5)).toBe(true);
    // end side: along 10.4 <= 10.5 -> pass; 10.6 > 10.5 -> miss
    expect(pointInLine(vec(10.4, 0), start, 0, 10, 1, 0.5)).toBe(true);
    expect(pointInLine(vec(10.6, 0), start, 0, 10, 1, 0.5)).toBe(false);
  });

  it('works along a non-axis-aligned direction', () => {
    // facing +y; a point offset sideways in x is outside the narrow band.
    expect(pointInLine(vec(0, 5), start, Math.PI / 2, 10, 1)).toBe(true);
    expect(pointInLine(vec(2, 5), start, Math.PI / 2, 10, 1)).toBe(false);
  });
});

describe('pointInSegment', () => {
  const a = vec(0, 0);
  const b = vec(10, 0);

  it('point near the middle of the segment is a hit', () => {
    expect(pointInSegment(vec(5, 0.5), a, b, 1)).toBe(true);
  });

  it('point too far from the segment is a miss', () => {
    expect(pointInSegment(vec(5, 2), a, b, 1)).toBe(false);
  });

  it('clamps to the start endpoint for points before it', () => {
    // closest point clamps to a=(0,0); dist 5 > 1 -> miss
    expect(pointInSegment(vec(-5, 0), a, b, 1)).toBe(false);
    // just before the start but within half-width of the endpoint -> hit
    expect(pointInSegment(vec(-0.5, 0), a, b, 1)).toBe(true);
  });

  it('clamps to the end endpoint for points past it', () => {
    expect(pointInSegment(vec(15, 0), a, b, 1)).toBe(false);
    expect(pointInSegment(vec(10.5, 0), a, b, 1)).toBe(true);
  });

  it('targetRadius widens the capsule', () => {
    expect(pointInSegment(vec(5, 1.5), a, b, 1, 0.5)).toBe(true);
    expect(pointInSegment(vec(5, 1.6), a, b, 1, 0.5)).toBe(false);
  });

  it('degenerate segment (a == b) falls back to a circle test', () => {
    const p = vec(0, 0);
    expect(pointInSegment(vec(0.5, 0), p, p, 1)).toBe(true);
    expect(pointInSegment(vec(2, 0), p, p, 1)).toBe(false);
    // circle fallback still honours targetRadius
    expect(pointInSegment(vec(1.4, 0), p, p, 1, 0.5)).toBe(true);
  });

  it('works for a diagonal segment', () => {
    const s = vec(0, 0);
    const e = vec(6, 8); // length 10
    // midpoint (3,4) lies exactly on the line
    expect(pointInSegment(vec(3, 4), s, e, 1)).toBe(true);
    // clearly off to the side
    expect(pointInSegment(vec(0, 5), s, e, 1)).toBe(false);
  });
});
