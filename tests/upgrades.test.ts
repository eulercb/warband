import { describe, it, expect } from 'vitest';
import type { Player } from '../src/engine/core/types';
import {
  UPGRADES,
  UPGRADE_IDS,
  isUpgradeId,
  applyUpgrades,
  rollUpgradeChoices,
} from '../src/engine/content/upgrades';
import type { UpgradeId, UpgradeDef } from '../src/engine/content/upgrades';

// ---------------------------------------------------------------------------
// Fixtures & deterministic RNG helpers
// ---------------------------------------------------------------------------

/** A fresh hero at neutral (un-upgraded) defaults — mirrors world.spawnPlayers. */
function mkPlayer(over: Partial<Player> = {}): Player {
  return {
    id: 1,
    peerId: 'p1',
    name: 'P',
    classId: 'knight',
    pos: { x: 0, y: 0 },
    aim: { x: 1, y: 0 },
    hp: 100,
    maxHp: 100,
    moveSpeed: 200,
    radius: 16,
    state: 'alive',
    downedTimer: 0,
    reviveProgress: 0,
    reviverId: null,
    cooldowns: { basic: 0, a1: 0, a2: 0, a3: 0 },
    castTimer: 0,
    castSlot: null,
    buffs: [],
    cooldownMult: 1,
    castMult: 1,
    damageMult: 1,
    damageTakenMult: 1,
    terrainResist: 0,
    regenPerSec: 0,
    threat: 0,
    stats: { damageDealt: 0, healingDone: 0, revives: 0, deaths: 0 },
    prevButtons: { basic: false, a1: false, a2: false, a3: false, revive: false },
    lastSeq: -1,
    ...over,
  };
}

/** Deterministic rng that cycles through a fixed list of values in [0,1). */
function cyclingRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

/** Small seeded LCG producing reproducible floats in [0,1). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// Insertion order of the catalog literal (also what Object.keys yields).
const EXPECTED_IDS: UpgradeId[] = [
  'swift',
  'vigor',
  'haste',
  'focus',
  'surefooted',
  'mighty',
  'bulwark',
  'renewal',
];

// ---------------------------------------------------------------------------
// UPGRADES catalog
// ---------------------------------------------------------------------------

describe('UPGRADES catalog', () => {
  it('every id maps to a well-formed, self-consistent def', () => {
    for (const id of UPGRADE_IDS) {
      const def: UpgradeDef = UPGRADES[id];
      expect(def.id).toBe(id);
      expect(typeof def.name).toBe('string');
      expect(def.name.length).toBeGreaterThan(0);
      expect(typeof def.desc).toBe('string');
      expect(def.desc.length).toBeGreaterThan(0);
      expect(typeof def.icon).toBe('string');
      expect(def.icon.length).toBeGreaterThan(0);
      expect(typeof def.apply).toBe('function');
    }
  });

  it('contains exactly the eight expected upgrades', () => {
    expect(Object.keys(UPGRADES).sort()).toEqual([...EXPECTED_IDS].sort());
  });
});

// ---------------------------------------------------------------------------
// UPGRADE_IDS
// ---------------------------------------------------------------------------

describe('UPGRADE_IDS', () => {
  it('lists the catalog keys in insertion order', () => {
    expect(UPGRADE_IDS).toEqual(EXPECTED_IDS);
    expect(UPGRADE_IDS).toEqual(Object.keys(UPGRADES));
    expect(UPGRADE_IDS).toHaveLength(8);
  });

  it('every listed id passes the type guard', () => {
    for (const id of UPGRADE_IDS) expect(isUpgradeId(id)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isUpgradeId
// ---------------------------------------------------------------------------

describe('isUpgradeId', () => {
  it('accepts every known id', () => {
    expect(isUpgradeId('swift')).toBe(true);
    expect(isUpgradeId('vigor')).toBe(true);
    expect(isUpgradeId('haste')).toBe(true);
    expect(isUpgradeId('focus')).toBe(true);
    expect(isUpgradeId('surefooted')).toBe(true);
    expect(isUpgradeId('mighty')).toBe(true);
    expect(isUpgradeId('bulwark')).toBe(true);
    expect(isUpgradeId('renewal')).toBe(true);
  });

  it('rejects unknown / mis-cased strings', () => {
    expect(isUpgradeId('bogus')).toBe(false);
    expect(isUpgradeId('')).toBe(false);
    expect(isUpgradeId('SWIFT')).toBe(false);
    expect(isUpgradeId(' swift')).toBe(false);
  });

  it('rejects inherited Object.prototype keys (own-property check, not `in`)', () => {
    expect(isUpgradeId('hasOwnProperty')).toBe(false);
    expect(isUpgradeId('toString')).toBe(false);
    expect(isUpgradeId('constructor')).toBe(false);
    expect(isUpgradeId('__proto__')).toBe(false);
    expect(isUpgradeId('valueOf')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isUpgradeId(0)).toBe(false);
    expect(isUpgradeId(1)).toBe(false);
    expect(isUpgradeId(NaN)).toBe(false);
    expect(isUpgradeId(null)).toBe(false);
    expect(isUpgradeId(undefined)).toBe(false);
    expect(isUpgradeId({})).toBe(false);
    expect(isUpgradeId([])).toBe(false);
    expect(isUpgradeId(true)).toBe(false);
    expect(isUpgradeId(Symbol('swift'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Individual upgrade effects (each def.apply)
// ---------------------------------------------------------------------------

describe('individual upgrade effects', () => {
  it('swift: +15% move speed, multiplicative', () => {
    const p = mkPlayer({ moveSpeed: 200 });
    UPGRADES.swift.apply(p);
    expect(p.moveSpeed).toBeCloseTo(230);
    UPGRADES.swift.apply(p);
    expect(p.moveSpeed).toBeCloseTo(264.5);
  });

  it('vigor: +20% max hp (rounded) and refills to full', () => {
    const p = mkPlayer({ maxHp: 100, hp: 40 });
    UPGRADES.vigor.apply(p);
    expect(p.maxHp).toBe(120);
    expect(p.hp).toBe(120);
  });

  it('vigor: rounds the boosted max hp', () => {
    const p = mkPlayer({ maxHp: 101, hp: 101 });
    // 101 * 1.2 = 121.2 -> Math.round -> 121
    UPGRADES.vigor.apply(p);
    expect(p.maxHp).toBe(121);
    expect(p.hp).toBe(121);
  });

  it('haste: -10% cooldowns, multiplicative (toned down, item 25)', () => {
    const p = mkPlayer({ cooldownMult: 1 });
    UPGRADES.haste.apply(p);
    expect(p.cooldownMult).toBeCloseTo(0.9);
    UPGRADES.haste.apply(p);
    expect(p.cooldownMult).toBeCloseTo(0.81);
  });

  it('focus: -30% cast time, multiplicative', () => {
    const p = mkPlayer({ castMult: 1 });
    UPGRADES.focus.apply(p);
    expect(p.castMult).toBeCloseTo(0.7);
    UPGRADES.focus.apply(p);
    expect(p.castMult).toBeCloseTo(0.49);
  });

  it('surefooted: +0.5 terrain resist, additive, capped at 1', () => {
    const p = mkPlayer({ terrainResist: 0 });
    UPGRADES.surefooted.apply(p);
    expect(p.terrainResist).toBeCloseTo(0.5);
    UPGRADES.surefooted.apply(p);
    expect(p.terrainResist).toBeCloseTo(1);
    UPGRADES.surefooted.apply(p); // already immune — stays clamped
    expect(p.terrainResist).toBeCloseTo(1);
  });

  it('surefooted: clamps a partial resist to 1', () => {
    const p = mkPlayer({ terrainResist: 0.7 });
    UPGRADES.surefooted.apply(p); // 0.7 + 0.5 = 1.2 -> min(1, …) -> 1
    expect(p.terrainResist).toBeCloseTo(1);
  });

  it('mighty: +15% damage dealt, multiplicative', () => {
    const p = mkPlayer({ damageMult: 1 });
    UPGRADES.mighty.apply(p);
    expect(p.damageMult).toBeCloseTo(1.15);
    UPGRADES.mighty.apply(p);
    expect(p.damageMult).toBeCloseTo(1.3225);
  });

  it('bulwark: -15% damage taken, multiplicative', () => {
    const p = mkPlayer({ damageTakenMult: 1 });
    UPGRADES.bulwark.apply(p);
    expect(p.damageTakenMult).toBeCloseTo(0.85);
    UPGRADES.bulwark.apply(p);
    expect(p.damageTakenMult).toBeCloseTo(0.7225);
  });

  it('renewal: adds 2% of current max hp to regen, additive', () => {
    const p = mkPlayer({ maxHp: 100, regenPerSec: 0 });
    UPGRADES.renewal.apply(p);
    expect(p.regenPerSec).toBeCloseTo(2);
    UPGRADES.renewal.apply(p); // additive off the same (unchanged) maxHp
    expect(p.regenPerSec).toBeCloseTo(4);
  });

  it('renewal: stacks on top of an existing regen and scales with max hp', () => {
    const p = mkPlayer({ maxHp: 250, regenPerSec: 1 });
    UPGRADES.renewal.apply(p); // 1 + 250 * 0.02 = 6
    expect(p.regenPerSec).toBeCloseTo(6);
  });
});

// ---------------------------------------------------------------------------
// applyUpgrades
// ---------------------------------------------------------------------------

describe('applyUpgrades', () => {
  it('no-ops on undefined', () => {
    const p = mkPlayer();
    applyUpgrades(p, undefined);
    expect(p).toEqual(mkPlayer());
  });

  it('no-ops on an empty list', () => {
    const p = mkPlayer();
    applyUpgrades(p, []);
    expect(p).toEqual(mkPlayer());
  });

  it('applies a single upgrade', () => {
    const p = mkPlayer({ damageMult: 1 });
    applyUpgrades(p, ['mighty']);
    expect(p.damageMult).toBeCloseTo(1.15);
  });

  it('applies a list in order, cumulatively (duplicates allowed)', () => {
    const p = mkPlayer({ moveSpeed: 200, damageMult: 1 });
    applyUpgrades(p, ['swift', 'mighty', 'swift']);
    expect(p.moveSpeed).toBeCloseTo(264.5); // 200 * 1.15 * 1.15
    expect(p.damageMult).toBeCloseTo(1.15);
  });

  it('skips unknown ids but still applies the known ones', () => {
    const p = mkPlayer({ damageMult: 1 });
    const ids = ['bogus', 'mighty', 'also-nope'] as unknown as UpgradeId[];
    applyUpgrades(p, ids);
    expect(p.damageMult).toBeCloseTo(1.15);
  });

  it('no-ops when every id is unknown', () => {
    const p = mkPlayer();
    applyUpgrades(p, ['nope'] as unknown as UpgradeId[]);
    expect(p).toEqual(mkPlayer());
  });

  it('renewal reads the vigor-boosted max hp when vigor is applied first', () => {
    const p = mkPlayer({ maxHp: 100, hp: 100, regenPerSec: 0 });
    // vigor: maxHp -> 120; renewal: regen += 120 * 0.02 = 2.4
    applyUpgrades(p, ['vigor', 'renewal']);
    expect(p.maxHp).toBe(120);
    expect(p.hp).toBe(120);
    expect(p.regenPerSec).toBeCloseTo(2.4);
  });

  it('renewal reads the pre-vigor max hp when it precedes vigor (order matters)', () => {
    const p = mkPlayer({ maxHp: 100, hp: 100, regenPerSec: 0 });
    // renewal: regen += 100 * 0.02 = 2; then vigor: maxHp -> 120
    applyUpgrades(p, ['renewal', 'vigor']);
    expect(p.maxHp).toBe(120);
    expect(p.regenPerSec).toBeCloseTo(2);
  });

  it('applies the full catalog at once, each to its own stat', () => {
    const p = mkPlayer({
      moveSpeed: 200,
      maxHp: 100,
      hp: 100,
      cooldownMult: 1,
      castMult: 1,
      damageMult: 1,
      damageTakenMult: 1,
      terrainResist: 0,
      regenPerSec: 0,
    });
    applyUpgrades(p, [...UPGRADE_IDS]);
    expect(p.moveSpeed).toBeCloseTo(230); // swift
    expect(p.maxHp).toBe(120); // vigor
    expect(p.cooldownMult).toBeCloseTo(0.9); // haste (toned down, item 25)
    expect(p.castMult).toBeCloseTo(0.7); // focus
    expect(p.terrainResist).toBeCloseTo(0.5); // surefooted
    expect(p.damageMult).toBeCloseTo(1.15); // mighty
    expect(p.damageTakenMult).toBeCloseTo(0.85); // bulwark
    // renewal runs after vigor in catalog order -> reads the boosted 120 maxHp
    expect(p.regenPerSec).toBeCloseTo(2.4);
  });
});

// ---------------------------------------------------------------------------
// rollUpgradeChoices
// ---------------------------------------------------------------------------

describe('rollUpgradeChoices', () => {
  it('returns n distinct ids drawn from the pool', () => {
    const out = rollUpgradeChoices(3, lcg(42));
    expect(out).toHaveLength(3);
    expect(new Set(out).size).toBe(3);
    for (const id of out) expect(UPGRADE_IDS).toContain(id);
  });

  it('a constant-0 rng draws the pool head each time (source order)', () => {
    expect(rollUpgradeChoices(3, () => 0)).toEqual(['swift', 'vigor', 'haste']);
    expect(rollUpgradeChoices(8, () => 0)).toEqual([...UPGRADE_IDS]);
  });

  it('a near-1 rng draws the pool tail each time (reverse order)', () => {
    expect(rollUpgradeChoices(8, () => 0.999)).toEqual([...UPGRADE_IDS].reverse());
  });

  it('follows a deterministic cycling rng exactly', () => {
    const rng = cyclingRng([0.3, 0.9, 0.0, 0.5]);
    expect(rollUpgradeChoices(4, rng)).toEqual(['haste', 'renewal', 'swift', 'surefooted']);
  });

  it('clamps a count larger than the pool to the whole pool (a permutation)', () => {
    const out = rollUpgradeChoices(100, lcg(7));
    expect(out).toHaveLength(UPGRADE_IDS.length);
    expect(new Set(out)).toEqual(new Set(UPGRADE_IDS));
  });

  it('returns the full pool when n equals the pool size', () => {
    const out = rollUpgradeChoices(UPGRADE_IDS.length, lcg(3));
    expect(out).toHaveLength(8);
    expect(new Set(out)).toEqual(new Set(UPGRADE_IDS));
  });

  it('returns an empty array for n = 0', () => {
    expect(rollUpgradeChoices(0, () => 0)).toEqual([]);
  });

  it('returns an empty array for a negative n', () => {
    expect(rollUpgradeChoices(-5, () => 0)).toEqual([]);
  });

  it('is repeatable: identical seeds yield identical draws', () => {
    expect(rollUpgradeChoices(5, lcg(99))).toEqual(rollUpgradeChoices(5, lcg(99)));
  });

  it('never mutates the shared UPGRADE_IDS source list', () => {
    const before = [...UPGRADE_IDS];
    rollUpgradeChoices(8, () => 0);
    rollUpgradeChoices(4, lcg(11));
    rollUpgradeChoices(100, lcg(12));
    expect(UPGRADE_IDS).toEqual(before);
    expect(UPGRADE_IDS).toHaveLength(8);
  });

  it('produces distinct, in-pool picks across many seeded rolls', () => {
    for (let seed = 1; seed <= 60; seed++) {
      for (const n of [1, 2, 4, 7, 8]) {
        const out = rollUpgradeChoices(n, lcg(seed * 131 + n));
        expect(out).toHaveLength(Math.min(n, UPGRADE_IDS.length));
        expect(new Set(out).size).toBe(out.length); // no duplicates
        for (const id of out) expect(UPGRADE_IDS).toContain(id);
      }
    }
  });

  it('tolerates an out-of-contract rng that returns 1 via the modulo guard', () => {
    // rnd() is contracted to [0,1); a stray 1 would index pool[len] and, without
    // the `% pool.length` guard, splice nothing and loop forever. The guard wraps
    // the pick back to index 0.
    expect(rollUpgradeChoices(2, () => 1)).toEqual(['swift', 'vigor']);
    expect(rollUpgradeChoices(8, () => 1)).toEqual([...UPGRADE_IDS]);
  });
});
