/**
 * Warband — per-device light-budget tier tests (#46).
 *
 * The tier decision (`pickMaxLights`) is pure — no GPU, no globals — so it is
 * exhaustively unit-tested here, the lighting module's standing convention. The
 * impure probe (`probeDeviceCaps`) is covered for its defensive contract only:
 * it must read the GL uniform cap when present and degrade to the safe floor
 * (never throw) for a missing / malformed / throwing context.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  pickMaxLights,
  probeDeviceCaps,
  DESKTOP_MAX_LIGHTS,
  UNIFORM_VECTORS_FOR_16,
  type DeviceCaps,
} from '../src/render/lighting/deviceTier';
import { DEFAULT_MAX_LIGHTS } from '../src/render/lighting/light';

const caps = (over: Partial<DeviceCaps> = {}): DeviceCaps => ({
  isMobile: false,
  maxFragmentUniformVectors: 1024, // any real WebGL2 desktop
  ...over,
});

describe('lighting tier constants', () => {
  it('desktop budget is double the mobile floor', () => {
    expect(DEFAULT_MAX_LIGHTS).toBe(8);
    expect(DESKTOP_MAX_LIGHTS).toBe(16);
    expect(DESKTOP_MAX_LIGHTS).toBe(DEFAULT_MAX_LIGHTS * 2);
  });

  it('the uniform-vector gate leaves generous headroom over the 32 the arrays need', () => {
    // 2 light arrays × 16 vec4 = 32 vectors; the gate demands comfortably more.
    expect(UNIFORM_VECTORS_FOR_16).toBeGreaterThanOrEqual(2 * DESKTOP_MAX_LIGHTS);
    // ...yet stays well under the GLSL ES 3.00 guaranteed minimum of 224.
    expect(UNIFORM_VECTORS_FOR_16).toBeLessThan(224);
  });
});

describe('pickMaxLights', () => {
  it('gives a capable desktop the 16-light variant', () => {
    expect(pickMaxLights(caps())).toBe(DESKTOP_MAX_LIGHTS);
  });

  it('keeps the 8-light floor on mobile regardless of GL headroom', () => {
    expect(pickMaxLights(caps({ isMobile: true }))).toBe(DEFAULT_MAX_LIGHTS);
    expect(pickMaxLights(caps({ isMobile: true, maxFragmentUniformVectors: 4096 }))).toBe(
      DEFAULT_MAX_LIGHTS,
    );
  });

  it('keeps the floor on a desktop context too constrained for the wider arrays', () => {
    expect(pickMaxLights(caps({ maxFragmentUniformVectors: UNIFORM_VECTORS_FOR_16 - 1 }))).toBe(
      DEFAULT_MAX_LIGHTS,
    );
    expect(pickMaxLights(caps({ maxFragmentUniformVectors: 0 }))).toBe(DEFAULT_MAX_LIGHTS);
  });

  it('promotes exactly at the uniform-vector threshold (inclusive)', () => {
    expect(pickMaxLights(caps({ maxFragmentUniformVectors: UNIFORM_VECTORS_FOR_16 }))).toBe(
      DESKTOP_MAX_LIGHTS,
    );
    expect(pickMaxLights(caps({ maxFragmentUniformVectors: UNIFORM_VECTORS_FOR_16 - 1 }))).toBe(
      DEFAULT_MAX_LIGHTS,
    );
  });
});

describe('probeDeviceCaps (defensive)', () => {
  it('reads MAX_FRAGMENT_UNIFORM_VECTORS from a live-shaped context', () => {
    const PNAME = 0x8dfd; // the real GL enum value; the stub just echoes it back
    const gl = {
      MAX_FRAGMENT_UNIFORM_VECTORS: PNAME,
      getParameter: (p: number) => (p === PNAME ? 256 : 0),
    };
    expect(probeDeviceCaps(gl).maxFragmentUniformVectors).toBe(256);
  });

  it('degrades to 0 vectors (→ the floor) when there is no context', () => {
    const c = probeDeviceCaps(null);
    expect(c.maxFragmentUniformVectors).toBe(0);
    expect(typeof c.isMobile).toBe('boolean');
    // With no reported headroom a non-mobile host still falls back to the floor.
    expect(pickMaxLights({ isMobile: false, maxFragmentUniformVectors: 0 })).toBe(
      DEFAULT_MAX_LIGHTS,
    );
  });

  it('degrades to 0 vectors for a malformed context (no getParameter)', () => {
    expect(probeDeviceCaps({}).maxFragmentUniformVectors).toBe(0);
    expect(probeDeviceCaps({ getParameter: 42 }).maxFragmentUniformVectors).toBe(0);
  });

  it('never throws when getParameter throws or returns a non-number', () => {
    const thrower = {
      MAX_FRAGMENT_UNIFORM_VECTORS: 1,
      getParameter: () => {
        throw new Error('context lost');
      },
    };
    expect(probeDeviceCaps(thrower).maxFragmentUniformVectors).toBe(0);
    const nan = { MAX_FRAGMENT_UNIFORM_VECTORS: 1, getParameter: () => Number.NaN };
    expect(probeDeviceCaps(nan).maxFragmentUniformVectors).toBe(0);
    const str = { MAX_FRAGMENT_UNIFORM_VECTORS: 1, getParameter: () => 'lots' };
    expect(probeDeviceCaps(str).maxFragmentUniformVectors).toBe(0);
  });
});

describe('probeDeviceCaps — mobile detection', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('flags a phone by its user-agent token', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit Mobile Safari',
    });
    expect(probeDeviceCaps(null).isMobile).toBe(true);
  });

  it('flags an iPadOS-as-desktop device by coarse pointer + genuine multi-touch', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/17 Safari',
      maxTouchPoints: 5,
    });
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    expect(probeDeviceCaps(null).isMobile).toBe(true);
  });

  it('treats a plain desktop (fine pointer, no touch) as non-mobile', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome Safari',
      maxTouchPoints: 0,
    });
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(probeDeviceCaps(null).isMobile).toBe(false);
  });

  it('does not flag a coarse-pointer device that lacks real multi-touch', () => {
    // Coarse pointer but only a single touch point → not a phone/tablet.
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome Safari',
      maxTouchPoints: 1,
    });
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    expect(probeDeviceCaps(null).isMobile).toBe(false);
  });

  it('handles a missing user-agent and a headless-shaped navigator', () => {
    vi.stubGlobal('navigator', {}); // no userAgent, no maxTouchPoints
    vi.stubGlobal('matchMedia', undefined);
    expect(probeDeviceCaps(null).isMobile).toBe(false);
  });

  it('is non-mobile when there is no navigator at all', () => {
    vi.stubGlobal('navigator', undefined);
    expect(probeDeviceCaps(null).isMobile).toBe(false);
  });
});
