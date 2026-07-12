/**
 * Warband — dynamic-light manager tests.
 *
 * The pure light logic: scoring + culling to the frame budget, ttl expiry,
 * add/remove/clear, and packing survivors into the shared uniform arrays through
 * an injected projector (world → shader space). No GPU — the `UniformGroup`s are
 * plain data containers, so this runs in the default Node env.
 */
import { describe, it, expect } from 'vitest';
import {
  LightManager,
  scoreLight,
  selectLights,
  DEFAULT_MAX_LIGHTS,
  type Light,
  type ProjectedLight,
} from '../src/render/lighting/light';

const mk = (over: Partial<Light> = {}): Light => ({
  x: 0,
  y: 0,
  z: 40,
  radius: 100,
  r: 1,
  g: 1,
  b: 1,
  intensity: 1,
  ...over,
});

/** Identity projector: shader space == world space (for assertion simplicity). */
const identity = (l: Light): ProjectedLight => ({ x: l.x, y: l.y, z: l.z, radius: l.radius });

describe('scoreLight', () => {
  it('is the full intensity at the focus and half at the radius', () => {
    const l = mk({ intensity: 2, radius: 100 });
    expect(scoreLight(l, 0, 0)).toBeCloseTo(2, 5); // dist 0 → 2 / (1 + 0)
    expect(scoreLight({ ...l, x: 100 }, 0, 0)).toBeCloseTo(1, 5); // dist == radius → half
  });

  it('favours a wider-radius light at the same distance', () => {
    const near = mk({ x: 120, radius: 100, intensity: 1 });
    const wide = mk({ x: 120, radius: 400, intensity: 1 });
    expect(scoreLight(wide, 0, 0)).toBeGreaterThan(scoreLight(near, 0, 0));
  });

  it('never divides by zero for a zero-radius light', () => {
    expect(Number.isFinite(scoreLight(mk({ radius: 0, x: 5 }), 0, 0))).toBe(true);
  });
});

describe('selectLights', () => {
  const focus = { x: 0, y: 0 };

  it('returns a copy of the input when under budget', () => {
    const lights = [mk(), mk({ x: 10 })];
    const out = selectLights(lights, focus, 8);
    expect(out).toHaveLength(2);
    expect(out).not.toBe(lights);
  });

  it('keeps the strongest lights when over budget', () => {
    const lights = [
      mk({ x: 1000, intensity: 0.1 }), // far + dim → culled
      mk({ x: 0, intensity: 3 }), // bright + near → kept
      mk({ x: 5, intensity: 2 }), // near → kept
    ];
    const out = selectLights(lights, focus, 2);
    expect(out).toHaveLength(2);
    expect(out).toContain(lights[1]);
    expect(out).toContain(lights[2]);
    expect(out).not.toContain(lights[0]);
  });

  it('restores add-order among survivors (stable slots)', () => {
    const a = mk({ x: 0, intensity: 3 });
    const b = mk({ x: 5, intensity: 2 });
    const out = selectLights([a, b], focus, 2);
    expect(out[0]).toBe(a);
    expect(out[1]).toBe(b);
  });

  it('breaks ties by original index (earlier-added wins)', () => {
    // Two identical-score lights, budget 1 → the earlier one survives.
    const first = mk({ x: 50, intensity: 1 });
    const second = mk({ x: 50, intensity: 1 });
    const out = selectLights([first, second], focus, 1);
    expect(out).toEqual([first]);
  });
});

describe('LightManager: membership', () => {
  it('add returns the light and tracks size; remove + clear shrink it', () => {
    const m = new LightManager();
    const a = m.add(mk());
    const b = m.add(mk({ x: 10 }));
    expect(a).toBeDefined();
    expect(m.size).toBe(2);

    m.remove(b); // removes the LAST element (no swap needed)
    expect(m.size).toBe(1);

    m.remove(a); // removes the sole remaining light
    expect(m.size).toBe(0);

    m.add(a);
    m.add(b);
    m.remove(a); // removes a mid-array (swap-pop moves b into slot 0)
    expect(m.size).toBe(1);

    m.remove(mk()); // removing an unknown light is a no-op
    expect(m.size).toBe(1);

    m.add(b); // b is now present twice — irrelevant to the API contract
    m.clear();
    expect(m.size).toBe(0);
  });

  it('defaults its budget to DEFAULT_MAX_LIGHTS and sizes the packed arrays', () => {
    const m = new LightManager();
    expect(m.maxLights).toBe(DEFAULT_MAX_LIGHTS);
    expect(m.packedPosR).toHaveLength(DEFAULT_MAX_LIGHTS * 4);
    expect(m.packedColI).toHaveLength(DEFAULT_MAX_LIGHTS * 4);
  });
});

describe('LightManager: update (expire, cull, pack, upload)', () => {
  it('expires ttl lights as time passes and leaves persistent ones', () => {
    const m = new LightManager(4);
    m.add(mk({ ttl: 0.05 }));
    m.add(mk()); // persistent
    m.update(0.03, { x: 0, y: 0 }, identity);
    expect(m.size).toBe(2); // 0.05 - 0.03 = 0.02 still alive
    m.update(0.03, { x: 0, y: 0 }, identity);
    expect(m.size).toBe(1); // ttl elapsed → only the persistent light remains
  });

  it('expires a ttl light sitting in the last slot (no-swap path)', () => {
    const m = new LightManager(4);
    m.add(mk()); // persistent, slot 0
    m.add(mk({ ttl: 0.02 })); // timed, LAST slot
    m.update(0.05, { x: 0, y: 0 }, identity);
    expect(m.size).toBe(1);
  });

  it('does not advance ttls when dtSec is 0 (repack only)', () => {
    const m = new LightManager(4);
    m.add(mk({ ttl: 0.001 }));
    m.update(0, { x: 0, y: 0 }, identity);
    expect(m.size).toBe(1);
  });

  it('packs the projected survivors and zeroes the unused tail', () => {
    const m = new LightManager(2);
    m.add(mk({ x: 3, y: 4, z: 20, radius: 80, r: 0.2, g: 0.4, b: 0.6, intensity: 1.5 }));
    // Double every coordinate in the projector to prove it is applied.
    m.update(0, { x: 0, y: 0 }, (l) => ({
      x: l.x * 2,
      y: l.y * 2,
      z: l.z * 2,
      radius: l.radius * 2,
    }));

    const posR = m.packedPosR;
    const colI = m.packedColI;
    expect(Array.from(posR.slice(0, 4))).toEqual([6, 8, 40, 160]);
    expect(Array.from(colI.slice(0, 4))).toEqual([
      expect.closeTo(0.2, 5),
      expect.closeTo(0.4, 5),
      expect.closeTo(0.6, 5),
      expect.closeTo(1.5, 5),
    ]);
    // Unused slot 1 is zeroed.
    expect(Array.from(posR.slice(4, 8))).toEqual([0, 0, 0, 0]);
    expect(Array.from(colI.slice(4, 8))).toEqual([0, 0, 0, 0]);
    expect(m.lightsGroup.uniforms.uLightCount).toBe(1);
  });

  it('publishes a light count clamped to the budget', () => {
    const m = new LightManager(2);
    m.add(mk({ x: 0, intensity: 3 }));
    m.add(mk({ x: 5, intensity: 2 }));
    m.add(mk({ x: 9999, intensity: 0.01 })); // culled
    m.update(0, { x: 0, y: 0 }, identity);
    expect(m.lightsGroup.uniforms.uLightCount).toBe(2);
  });
});

describe('LightManager: environment dial', () => {
  it('setAmbient writes the env group', () => {
    const m = new LightManager();
    m.setAmbient(0.1, 0.2, 0.3);
    const amb = m.envGroup.uniforms.uAmbient as Float32Array;
    expect(Array.from(amb)).toEqual([
      expect.closeTo(0.1, 5),
      expect.closeTo(0.2, 5),
      expect.closeTo(0.3, 5),
    ]);
  });

  it('setKeyLight normalizes the direction, sets colour + amount', () => {
    const m = new LightManager();
    m.setKeyLight({ x: 0, y: 0, z: 2 }, [0.9, 0.8, 0.7], 0.5);
    const dir = m.envGroup.uniforms.uKeyDir as Float32Array;
    expect(Math.hypot(dir[0], dir[1], dir[2])).toBeCloseTo(1, 5); // unit length
    expect(dir[2]).toBeCloseTo(1, 5);
    expect(m.envGroup.uniforms.uKeyAmount).toBe(0.5);
    const col = m.envGroup.uniforms.uKeyColor as Float32Array;
    expect(Array.from(col)).toEqual([
      expect.closeTo(0.9, 5),
      expect.closeTo(0.8, 5),
      expect.closeTo(0.7, 5),
    ]);
  });

  it('leaves the key direction unchanged when given a zero vector', () => {
    const m = new LightManager();
    const before = Array.from(m.envGroup.uniforms.uKeyDir as Float32Array);
    m.setKeyLight({ x: 0, y: 0, z: 0 }, [1, 1, 1], 1);
    const after = Array.from(m.envGroup.uniforms.uKeyDir as Float32Array);
    expect(after).toEqual(before); // normalize3 no-ops on a zero vector
  });
});
