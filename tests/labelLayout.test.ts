import { describe, it, expect } from 'vitest';
import { topBandFade, staggerOffset } from '../src/render/pipeline/labelLayout';

describe('topBandFade (item 78: world labels fade under the top HUD band)', () => {
  it('is fully opaque at or below the band', () => {
    expect(topBandFade(90, 90)).toBe(1);
    expect(topBandFade(200, 90)).toBe(1);
  });

  it('fades linearly toward the top edge', () => {
    expect(topBandFade(45, 90)).toBeCloseTo(0.5, 6);
    expect(topBandFade(9, 90)).toBeCloseTo(0.1, 6);
  });

  it('is fully transparent at (or above) the very top edge', () => {
    expect(topBandFade(0, 90)).toBe(0);
    expect(topBandFade(-30, 90)).toBe(0); // anchored off the top of the viewport
  });

  it('a non-positive band disables the fade', () => {
    expect(topBandFade(10, 0)).toBe(1);
    expect(topBandFade(10, -5)).toBe(1);
  });
});

describe('staggerOffset (item 78: neighbouring relic/effigy labels stagger rows)', () => {
  it('leaves even props on the base row and lifts odd props by a row', () => {
    expect(staggerOffset(0, 16)).toBe(0);
    expect(staggerOffset(1, 16)).toBe(16);
    expect(staggerOffset(2, 16)).toBe(0);
    expect(staggerOffset(3, 16)).toBe(16);
  });

  it('so any two adjacent labels always sit on different rows', () => {
    for (let i = 0; i < 8; i++) {
      expect(staggerOffset(i, 16)).not.toBe(staggerOffset(i + 1, 16));
    }
  });

  it('is robust to odd inputs (negative / fractional indices)', () => {
    expect(staggerOffset(-1, 16)).toBe(16);
    expect(staggerOffset(2.9, 16)).toBe(0);
  });
});
