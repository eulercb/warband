/**
 * Chaos Forge — SHOP synthesis (docs/CHAOS_FORGE.md §7). The one content family
 * procgen never touched. Forge re-prices and re-flavours each item per run,
 * preserving functional identity (id / kind / hardcore gate / applied magnitude)
 * so the desc stays accurate and buys never disagree.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { ephemeralVariant, getEphemeral, EPHEMERAL, EPHEMERAL_IDS } from '../src/engine/content/ephemeral';
import { setForgeSeed } from '../src/engine/content/forge';

afterEach(() => setForgeSeed(null));

describe('ephemeralVariant', () => {
  it('is deterministic, re-prices in a band, re-flavours the name, keeps identity', () => {
    for (const id of EPHEMERAL_IDS) {
      const base = EPHEMERAL[id];
      const a = ephemeralVariant(42, base);
      expect(a).toEqual(ephemeralVariant(42, base)); // deterministic
      expect(a.id).toBe(base.id);
      expect(a.kind).toBe(base.kind);
      expect(a.hardcoreOnly).toBe(base.hardcoreOnly);
      expect(a.desc).toBe(base.desc); // magnitude preserved → the desc stays true
      expect(a.cost).toBeGreaterThanOrEqual(1);
      expect(Math.abs(a.cost - base.cost)).toBeLessThanOrEqual(3);
      expect(a.name.length).toBeGreaterThan(0);
    }
  });

  it('varies price and name across seeds', () => {
    const costs = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => ephemeralVariant(s, EPHEMERAL.damage).cost));
    const names = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => ephemeralVariant(s, EPHEMERAL.damage).name));
    expect(costs.size).toBeGreaterThan(1);
    expect(names.size).toBeGreaterThan(1);
  });
});

describe('getEphemeral routing', () => {
  it('serves a variant while Forge is active, canonical when off', () => {
    expect(getEphemeral('speed')).toBe(EPHEMERAL.speed);
    setForgeSeed(7);
    const v = getEphemeral('speed');
    expect(v).not.toBe(EPHEMERAL.speed);
    expect(v.id).toBe('speed');
    expect(getEphemeral('speed')).toBe(v); // cached
    setForgeSeed(null);
    expect(getEphemeral('speed')).toBe(EPHEMERAL.speed);
  });

  it('every item prices + flavours coherently under Forge, host/client agree', () => {
    setForgeSeed(2024);
    for (const id of EPHEMERAL_IDS) {
      const v = getEphemeral(id);
      expect(v.cost).toBeGreaterThanOrEqual(1);
      expect(v.name.length).toBeGreaterThan(0);
      // Deriving again from the same active seed is identical (a peer buying agrees).
      expect(getEphemeral(id).cost).toBe(v.cost);
    }
  });
});
