import { describe, it, expect } from 'vitest';
import { buffBadges, buffLabel } from '../src/render/overlays/buffGlyphs';
import type { BuffView, BuffKind } from '../src/engine/core/types';

const buff = (kind: BuffKind, remaining: number, mult = 1): BuffView => ({ kind, remaining, mult });

describe('buffBadges', () => {
  it('returns nothing for missing / empty buff lists', () => {
    expect(buffBadges(undefined)).toEqual([]);
    expect(buffBadges([])).toEqual([]);
  });

  it('describes stun and invuln', () => {
    const [stun] = buffBadges([buff('stun', 2)]);
    expect(stun.glyph).toBe('💫');
    expect(stun.good).toBe(false);
    expect(stun.label).toBe('Stunned');

    const [inv] = buffBadges([buff('invuln', 2)]);
    expect(inv.glyph).toBe('✨');
    expect(inv.good).toBe(true);
  });

  it('splits moveSpeed into slow (mult<1) vs haste (mult>=1)', () => {
    expect(buffBadges([buff('moveSpeed', 3, 0.5)])[0]).toMatchObject({
      glyph: '🐌',
      good: false,
      label: 'Slowed',
    });
    expect(buffBadges([buff('moveSpeed', 3, 1.4)])[0]).toMatchObject({
      glyph: '💨',
      good: true,
      label: 'Hastened',
    });
  });

  it('splits damageDealt into empower (mult>=1) vs weaken (mult<1)', () => {
    expect(buffBadges([buff('damageDealt', 3, 1)])[0]).toMatchObject({ glyph: '💪', good: true });
    expect(buffBadges([buff('damageDealt', 3, 0.7)])[0]).toMatchObject({
      glyph: '🔻',
      good: false,
    });
  });

  it('splits damageTaken into shield (mult<=1) vs vulnerable (mult>1)', () => {
    expect(buffBadges([buff('damageTaken', 3, 1)])[0]).toMatchObject({ glyph: '🛡️', good: true });
    expect(buffBadges([buff('damageTaken', 3, 1.5)])[0]).toMatchObject({
      glyph: '💔',
      good: false,
    });
  });

  it('ignores unknown buff kinds', () => {
    expect(buffBadges([buff('unknownKind' as BuffKind, 3)])).toEqual([]);
  });

  it('rounds remaining up, with a floor of 1 second', () => {
    expect(buffBadges([buff('stun', 2.1)])[0].secs).toBe(3);
    expect(buffBadges([buff('stun', 0.2)])[0].secs).toBe(1);
    expect(buffBadges([buff('stun', 0)])[0].secs).toBe(1);
  });

  it('dedupes by glyph, keeping the longest remaining', () => {
    const badges = buffBadges([buff('stun', 2), buff('stun', 5), buff('stun', 1)]);
    expect(badges).toHaveLength(1);
    expect(badges[0].secs).toBe(5);
  });

  it('caps the number of badges returned', () => {
    const many = [
      buff('stun', 2),
      buff('invuln', 2),
      buff('moveSpeed', 2, 1.5),
      buff('damageDealt', 2, 1.5),
      buff('damageTaken', 2, 1.5),
    ];
    expect(buffBadges(many)).toHaveLength(4); // default cap
    expect(buffBadges(many, 2)).toHaveLength(2);
  });
});

describe('buffLabel', () => {
  it('renders a compact one-line summary', () => {
    expect(buffLabel([buff('stun', 2), buff('invuln', 3)])).toBe('💫2 ✨3');
  });

  it('is empty when nothing surfaces', () => {
    expect(buffLabel([])).toBe('');
    expect(buffLabel([buff('unknownKind' as BuffKind, 3)])).toBe('');
  });

  it('honours the cap', () => {
    const many = [buff('stun', 2), buff('invuln', 2), buff('moveSpeed', 2, 1.5)];
    expect(buffLabel(many, 1).split(' ')).toHaveLength(1);
  });
});
