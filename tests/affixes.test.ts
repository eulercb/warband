/**
 * Warband — boss affix registry + seeded roll policy (content/affixes.ts).
 * These are pure functions, so no World is needed — drive them with a standalone
 * Rng and assert on the returned affix lists.
 */
import { describe, it, expect } from 'vitest';
import { Rng } from '../src/engine/core/math';
import {
  AFFIXES,
  AFFIX_IDS,
  MAX_AFFIXES,
  affixBudget,
  affixPrefix,
  affixAuraColor,
  hasAffix,
  isAffixId,
  getAffix,
  rollAffixes,
} from '../src/engine/content/affixes';
import type { AffixId, BossTier } from '../src/engine/core/types';

const TIERS: BossTier[] = ['easy', 'medium', 'hard'];

describe('affix registry', () => {
  it('every affix is well-formed', () => {
    for (const id of AFFIX_IDS) {
      const def = AFFIXES[id];
      expect(def.id).toBe(id);
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.blurb.length).toBeGreaterThan(0);
      expect(def.weight).toBeGreaterThan(0);
      expect(def.tiers.length).toBeGreaterThan(0);
      // colour is a packed 0xRRGGBB int
      expect(def.color).toBeGreaterThanOrEqual(0);
      expect(def.color).toBeLessThanOrEqual(0xffffff);
    }
  });

  it('exposes the expected named affixes', () => {
    for (const id of [
      'vampiric',
      'frenzied',
      'splitting',
      'volatile',
      'molten',
      'warding',
      'accelerating',
      'teleporting',
      'overcharged',
      'barbed',
    ] as AffixId[]) {
      expect(AFFIX_IDS).toContain(id);
    }
  });

  it('isAffixId / getAffix / helpers behave', () => {
    expect(isAffixId('vampiric')).toBe(true);
    expect(isAffixId('nonsense')).toBe(false);
    expect(isAffixId(42)).toBe(false);
    expect(getAffix('frenzied').name).toBe('Frenzied');
    expect(hasAffix({ affixes: ['molten', 'barbed'] }, 'barbed')).toBe(true);
    expect(hasAffix({ affixes: ['molten'] }, 'barbed')).toBe(false);
    expect(hasAffix({}, 'barbed')).toBe(false);
    expect(affixAuraColor(['vampiric'])).toBe(AFFIXES.vampiric.color);
    expect(affixAuraColor([])).toBeNull();
    expect(affixAuraColor(undefined)).toBeNull();
    expect(affixPrefix(['vampiric', 'frenzied'])).toBe('Vampiric Frenzied');
    expect(affixPrefix([])).toBe('');
  });
});

describe('affix budget', () => {
  it("a fresh party's opening boss carries none", () => {
    expect(affixBudget(0, 0)).toBe(0);
  });

  it('ramps through a run and hardens each endless cycle, capped', () => {
    expect(affixBudget(0, 1)).toBe(1); // second encounter
    expect(affixBudget(0, 3)).toBe(2); // deep in the run
    expect(affixBudget(1, 0)).toBe(1); // endless opener still gets one
    expect(affixBudget(2, 3)).toBe(MAX_AFFIXES); // caps at MAX
    expect(affixBudget(9, 4)).toBe(MAX_AFFIXES);
  });
});

describe('rollAffixes', () => {
  it('returns nothing for the clean opener', () => {
    expect(rollAffixes('easy', 0, 0, new Rng(1))).toEqual([]);
  });

  it('is deterministic for a given seed + context', () => {
    const a = rollAffixes('hard', 1, 3, new Rng(1234));
    const b = rollAffixes('hard', 1, 3, new Rng(1234));
    expect(a).toEqual(b);
  });

  it('respects the budget and returns distinct affixes', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const tier of TIERS) {
        for (const [cycle, slot] of [
          [0, 1],
          [0, 3],
          [1, 2],
          [2, 4],
        ]) {
          const got = rollAffixes(tier, cycle, slot, new Rng(seed));
          expect(got.length).toBe(affixBudget(cycle, slot));
          expect(new Set(got).size).toBe(got.length); // no duplicates
        }
      }
    }
  });

  it('only rolls affixes legal for the boss tier', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const easy = rollAffixes('easy', 2, 4, new Rng(seed));
      for (const id of easy) {
        expect(AFFIXES[id].tiers).toContain('easy');
      }
    }
  });

  it('caps at MAX_AFFIXES even when the pool is large', () => {
    const got = rollAffixes('hard', 5, 4, new Rng(7));
    expect(got.length).toBeLessThanOrEqual(MAX_AFFIXES);
  });
});
