import { describe, it, expect } from 'vitest';
import { computeScaling, addCount, zoneCount } from '../src/engine/content/scaling';

describe('scaling', () => {
  it('hp multiplier for n=1..4', () => {
    expect(computeScaling(1).hpMultiplier).toBeCloseTo(1.0);
    expect(computeScaling(2).hpMultiplier).toBeCloseTo(1.75);
    expect(computeScaling(3).hpMultiplier).toBeCloseTo(2.5);
    expect(computeScaling(4).hpMultiplier).toBeCloseTo(3.25);
  });

  it('boss damage multiplier for n=1..4', () => {
    expect(computeScaling(1).bossDamageMult).toBeCloseTo(1.0);
    expect(computeScaling(2).bossDamageMult).toBeCloseTo(1.12);
    expect(computeScaling(3).bossDamageMult).toBeCloseTo(1.24);
    expect(computeScaling(4).bossDamageMult).toBeCloseTo(1.36);
  });

  it('troll regen multiplier for n=1..4', () => {
    expect(computeScaling(1).trollRegenMult).toBeCloseTo(1.0);
    expect(computeScaling(2).trollRegenMult).toBeCloseTo(1.5);
    expect(computeScaling(3).trollRegenMult).toBeCloseTo(2.0);
    expect(computeScaling(4).trollRegenMult).toBeCloseTo(2.5);
  });

  it('clamps out-of-range player counts', () => {
    expect(computeScaling(0).playerCount).toBe(1);
    expect(computeScaling(9).playerCount).toBe(4);
  });

  it('add and zone counts scale with n', () => {
    expect(addCount(1)).toBe(2);
    expect(addCount(4)).toBe(3);
    expect(zoneCount(1)).toBe(1);
    expect(zoneCount(4)).toBe(2);
  });
});
