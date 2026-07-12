// @vitest-environment jsdom
/**
 * Branch-coverage top-up for TWO modules in one file:
 *   • src/engine/content/charUpgrades.ts — bard `?? 1` slow guards, the
 *     multiclass weighted-roll path, the at-max skip, and the single-offer
 *     re-offer swap (out.length === 1 → index 0).
 *   • src/ui/state/store.ts — screen-shake persistence, addMyExtraClass's
 *     dedupe ternary, the null-session guard on awardCoinsFromResult, and every
 *     buyEphemeral perk arm.
 *
 * The suites are deliberately comprehensive (not just the missing branches) so
 * each file's branch % stands on its own when this file is measured in isolation.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// TARGET 1 — charUpgrades.ts
// ---------------------------------------------------------------------------
import {
  upgradeAllowedFor,
  applyCharUpgrades,
  previewAbilityTable,
  isCharUpgradeId,
  rollCharChoices,
  reofferCandidates,
  describeCharOffer,
  charUpgradeBadge,
  charUpgradeMaxStacks,
  charUpgradeAtMax,
  REOFFER_CHANCE,
  HYBRID_OFFER_CHANCE,
  GRAND_OFFER_CHANCE,
  MAIN_CLASS_WEIGHT,
  CHAR_UPGRADES,
  CHAR_UPGRADES_BY_CLASS,
  HYBRID_UPGRADES,
  GRAND_BY_CLASS,
} from '../src/engine/content/charUpgrades';
import { CLASSES, CLASS_IDS, cloneAbilities } from '../src/engine/content/classes';
import type { PlayerAbilityDef, AbilityKind } from '../src/engine/content/classes';
import type { ClassId, Player, AbilitySlot } from '../src/engine/core/types';

/** A player stub carrying a private (cloned) ability table + the numeric fields
 *  the stat-flavoured upgrades tug on, seeded from the class defaults. */
function makePlayer(classId: ClassId): Player {
  const cls = CLASSES[classId];
  return {
    classId,
    abilities: cloneAbilities(cls.abilities),
    maxHp: cls.maxHp,
    hp: cls.maxHp,
    moveSpeed: cls.moveSpeed,
    regenPerSec: 0,
    cooldownMult: 1,
    castMult: 1,
    damageMult: 1,
    damageTakenMult: 1,
  } as unknown as Player;
}

/** Spawn a hero, apply the ordered upgrade ids, hand back the hero. */
function apply(classId: ClassId, ids: string[]): Player {
  const p = makePlayer(classId);
  applyCharUpgrades(p, ids);
  return p;
}

/** A scripted rng: cycles through the supplied values (never returns undefined). */
function seq(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

/** A cheap deterministic LCG in [0,1) for invariant sweeps across many rolls. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** Synthetic ability + table builders (for driving the `?? default` guards). */
function ab(
  slot: AbilitySlot,
  kind: AbilityKind,
  damage: number,
  over: Partial<PlayerAbilityDef> = {},
): PlayerAbilityDef {
  return { slot, name: 'test', kind, cooldown: 1, damage, ...over };
}
function table(
  over: Partial<Record<AbilitySlot, PlayerAbilityDef>> = {},
): Record<AbilitySlot, PlayerAbilityDef> {
  return {
    basic: ab('basic', 'meleeCone', 10),
    a1: ab('a1', 'meleeCone', 10),
    a2: ab('a2', 'meleeCone', 10),
    a3: ab('a3', 'meleeCone', 10),
    ...over,
  };
}

describe('charUpgrades: gating & id guards', () => {
  it('upgradeAllowedFor honours class match, hybrid openness, and exclude lists', () => {
    expect(upgradeAllowedFor(CHAR_UPGRADES.mg_freeze, 'mage')).toBe(true);
    expect(upgradeAllowedFor(CHAR_UPGRADES.mg_freeze, 'knight')).toBe(false);
    // Unrestricted hybrid: allowed everywhere.
    for (const c of CLASS_IDS) expect(upgradeAllowedFor(CHAR_UPGRADES.hy_vampiric, c)).toBe(true);
    // Excluded hybrid.
    expect(upgradeAllowedFor(CHAR_UPGRADES.hy_pyromancer, 'mage')).toBe(false);
    expect(upgradeAllowedFor(CHAR_UPGRADES.hy_pyromancer, 'knight')).toBe(true);
  });

  it('isCharUpgradeId accepts real + well-formed synthetic ids, rejects the rest', () => {
    expect(isCharUpgradeId('kn_bulwark')).toBe(true);
    expect(isCharUpgradeId('restore:a2')).toBe(true);
    expect(isCharUpgradeId('graftup:a2:mg_combust')).toBe(true);
    expect(isCharUpgradeId('nope')).toBe(false);
    expect(isCharUpgradeId('restore:zz')).toBe(false);
    expect(isCharUpgradeId('graftup:a2')).toBe(false);
    expect(isCharUpgradeId('graftup:zz:mg_combust')).toBe(false); // invalid slot (line 1414)
    expect(isCharUpgradeId('graftup:a2:bogus')).toBe(false);
    expect(isCharUpgradeId(123)).toBe(false);
    expect(isCharUpgradeId(null)).toBe(false);
    expect(isCharUpgradeId('toString')).toBe(false);
  });

  it('charUpgradeMaxStacks / charUpgradeAtMax cover real, reclaim and graftup ids', () => {
    expect(charUpgradeMaxStacks('restore:a2')).toBe(Number.POSITIVE_INFINITY);
    expect(charUpgradeMaxStacks('graftup:a2:mg_combust')).toBe(charUpgradeMaxStacks('mg_combust'));
    expect(charUpgradeMaxStacks('kn_grand_immovable')).toBe(1);
    expect(charUpgradeAtMax('kn_bulwark', [])).toBe(false);
    expect(charUpgradeAtMax('kn_bulwark', Array<string>(5).fill('kn_bulwark'))).toBe(true);
    // A reclaim is contextual — never "maxed".
    expect(charUpgradeAtMax('restore:a2', ['restore:a2', 'restore:a2'])).toBe(false);
  });
});

describe('charUpgrades: catalog shape', () => {
  it('every class owns a 5-strong pool and every hybrid is class-agnostic', () => {
    expect(CLASS_IDS.length).toBe(12);
    for (const c of CLASS_IDS) expect(CHAR_UPGRADES_BY_CLASS[c]).toHaveLength(5);
    for (const d of HYBRID_UPGRADES) expect(d.classId).toBe('any');
    // Two grand improvements per class, each capped at one stack.
    for (const c of CLASS_IDS) {
      expect(GRAND_BY_CLASS[c]).toHaveLength(2);
      for (const d of GRAND_BY_CLASS[c]) expect(d.maxStacks).toBe(1);
    }
    expect(HYBRID_OFFER_CHANCE).toBeCloseTo(0.45, 5);
    expect(REOFFER_CHANCE).toBeCloseTo(0.5, 5);
    expect(GRAND_OFFER_CHANCE).toBeCloseTo(0.14, 5);
    expect(MAIN_CLASS_WEIGHT).toBeCloseTo(2.5, 5);
  });
});

describe('applyCharUpgrades: guards & routing', () => {
  it('no-ops on undefined ids and on a hero with no ability table', () => {
    const p = makePlayer('knight');
    const before = p.abilities!.basic.damage;
    applyCharUpgrades(p, undefined);
    expect(p.abilities!.basic.damage).toBe(before);
    const bare = { classId: 'knight' } as unknown as Player;
    expect(() => applyCharUpgrades(bare, ['kn_bulwark'])).not.toThrow();
  });

  it('skips unknown and mismatched-class ids, applies valid ones in order', () => {
    const a = apply('knight', ['kn_widecleave', 'mg_freeze', 'bogus', 'kn_widecleave']).abilities!;
    expect(a.basic.damage).toBe(22 + 5 + 5);
    expect(a.a2.freeze ?? 0).toBe(0);
  });

  it('routes a class boon to its native slot and a combat style to the current kit', () => {
    // kn_bastion twice exercises setMin (unset → set, then Math.min).
    const bastion = apply('knight', ['kn_bastion', 'kn_bastion']).abilities!;
    expect(bastion.a1.buffDefMult!).toBeCloseTo(0.7, 5);
    expect(bastion.a1.cooldown).toBeCloseTo(12 * 0.8 * 0.8, 5);
    // A whole-kit style lands on the (grafted) current occupant.
    const styled = apply('knight', ['hy_pyromancer', 'hy_vampiric']).abilities!;
    expect(styled.a2.name).toBe('Fireball');
    expect(styled.a2.lifestealFrac!).toBeCloseTo(0.1, 5);
  });

  it('applies player-only stat upgrades without touching the table', () => {
    const p = apply('knight', ['kn_secondwind']);
    expect(p.regenPerSec).toBeCloseTo(3.6, 5); // 240 * 0.015
    const glass = apply('knight', ['hy_glasscannon']);
    expect(glass.damageMult).toBeCloseTo(1.25, 5);
    expect(glass.damageTakenMult).toBeCloseTo(1.18, 5);
  });
});

describe('bard slow guards (lines 622 & 658)', () => {
  it('ba_cutting chills Vicious Mockery on the real bard (defined slowMult path)', () => {
    const a = apply('bard', ['ba_cutting']).abilities!;
    expect(a.basic.damage).toBe(21); // 15 + 6
    expect(a.basic.slowMult!).toBeCloseTo(0.6, 5); // min(0.8, 0.6)
    expect(a.basic.slowDuration!).toBeCloseTo(2, 5); // 1 + 1
  });

  it('ba_thunder widens/chills Dissonant Whispers on the real bard', () => {
    const a = apply('bard', ['ba_thunder']).abilities!;
    expect(a.a3.radius).toBe(175); // 150 + 25
    expect(a.a3.damage).toBe(32); // 22 + 10
    expect(a.a3.slowMult!).toBeCloseTo(0.35, 5); // 0.5 * 0.7
  });

  it('ba_cutting treats a slow-less basic as unslowed (slowMult ?? 1)', () => {
    const stub = makePlayer('bard');
    const a = table({ basic: ab('basic', 'projectile', 15) }); // no slowMult
    CHAR_UPGRADES.ba_cutting.apply({ player: stub, abilities: a });
    expect(a.basic.slowMult!).toBeCloseTo(0.6, 5); // min(undefined ?? 1, 0.6)
    expect(a.basic.damage).toBe(21);
  });

  it('ba_thunder treats a slow-less A3 as unslowed (slowMult ?? 1)', () => {
    const stub = makePlayer('bard');
    const a = table({ a3: ab('a3', 'pbaoe', 22) }); // no slowMult
    CHAR_UPGRADES.ba_thunder.apply({ player: stub, abilities: a });
    expect(a.a3.slowMult!).toBeCloseTo(0.7, 5); // (undefined ?? 1) * 0.7
  });
});

describe('effect fallbacks for absent optional fields', () => {
  const stub = makePlayer('knight');

  it('dr_grasp / dr_gale treat a slow-less zone as unslowed (slowMult ?? 1)', () => {
    const grasp = table({ a1: ab('a1', 'groundZone', 0) });
    CHAR_UPGRADES.dr_grasp.apply({ player: stub, abilities: grasp });
    expect(grasp.a1.slowMult!).toBeCloseTo(0.6, 5);
    const gale = table({ a3: ab('a3', 'pbaoe', 10) });
    CHAR_UPGRADES.dr_gale.apply({ player: stub, abilities: gale });
    expect(gale.a3.slowMult!).toBeCloseTo(0.7, 5);
  });

  it('hy_stormsplit defaults a bare projectile and a bare melee basic', () => {
    // spreadDeg present → Math.max keeps the wider of (5, 12).
    const proj = table({ basic: ab('basic', 'projectile', 10, { spreadDeg: 15 }) });
    CHAR_UPGRADES.hy_stormsplit.apply({ player: stub, abilities: proj });
    expect(proj.basic.projCount).toBe(2);
    expect(proj.basic.spreadDeg).toBe(15); // max(15, 12)
    // spreadDeg absent → (undefined ?? 0) then max(0, 12).
    const projBare = table({ basic: ab('basic', 'projectile', 10) });
    CHAR_UPGRADES.hy_stormsplit.apply({ player: stub, abilities: projBare });
    expect(projBare.basic.spreadDeg).toBe(12);
    const melee = table();
    CHAR_UPGRADES.hy_stormsplit.apply({ player: stub, abilities: melee });
    expect(melee.basic.halfAngleDeg).toBe(57); // (undefined ?? 45) + 12
    expect(melee.basic.range).toBe(82); // (undefined ?? 70) + 12
  });

  it('hy_frostbrand chills damaging non-heal abilities, sparing heals & zero-damage kit', () => {
    // Real cleric: Smite chills (no default slowMult → ?? 1), Heal is spared
    // (kind === 'heal'), Sanctuary/Blessing deal no damage (damage > 0 false).
    const a = apply('cleric', ['hy_frostbrand']).abilities!;
    expect(a.basic.slowMult!).toBeCloseTo(0.72, 5);
    expect(a.basic.slowDuration!).toBeCloseTo(1.4, 5);
    expect(a.a1.slowMult).toBeUndefined(); // Heal spared
    expect(a.a2.slowMult).toBeUndefined(); // no damage
    // Synthetic ability that already carries a slow → the ?? left operands are used.
    const preset = table({
      basic: ab('basic', 'meleeCone', 10, { slowMult: 0.9, slowDuration: 5 }),
    });
    CHAR_UPGRADES.hy_frostbrand.apply({ player: stub, abilities: preset });
    expect(preset.basic.slowMult!).toBeCloseTo(0.72, 5); // min(0.9, 0.72)
    expect(preset.basic.slowDuration!).toBeCloseTo(5, 5); // max(5, 1.4)
  });

  it('mul() treats an absent target field as 0 (mg_quickcast on a cast-less A1)', () => {
    const a = table({ a1: ab('a1', 'projectile', 70) });
    CHAR_UPGRADES.mg_quickcast.apply({ player: stub, abilities: a });
    expect(a.a1.castTime).toBe(0);
    expect(a.a1.cooldown).toBeCloseTo(0.85, 5);
  });
});

describe('hybrid grafts, styles & skill-keyed progression', () => {
  it('grafts a foreign ability into the target slot (private copy)', () => {
    const a = apply('knight', ['hy_pyromancer']).abilities!;
    expect(a.a2.name).toBe('Fireball');
    expect(a.a2.slot).toBe('a2');
    expect(CLASSES.mage.abilities.a1.slot).toBe('a1'); // source untouched
  });

  it('graft + graftup levels the grafted skill; restore reclaims the native + boons', () => {
    const leveled = apply('knight', ['hy_pyromancer', 'graftup:a2:mg_combust']).abilities!;
    expect(leveled.a2.damage).toBe(92); // 70 + 22
    const reclaimed = apply('knight', ['kn_bulwark', 'hy_pyromancer', 'restore:a2']).abilities!;
    expect(reclaimed.a2.name).toBe('Shield Wall');
    expect(reclaimed.a2.buffDefMult!).toBeCloseTo(0.4, 5); // boon preserved
  });

  it('re-seats a previously-stashed graft with its accrued boons intact', () => {
    const a = apply('knight', [
      'hy_pyromancer',
      'graftup:a2:mg_combust',
      'hy_fieldmedic', // displaces Fireball with Field Dressing
      'hy_pyromancer', // re-seats the stashed, leveled Fireball
    ]).abilities!;
    expect(a.a2.name).toBe('Fireball');
    expect(a.a2.damage).toBe(92);
  });

  it('a graftup on a slot with no graft is harmless', () => {
    expect(() => apply('knight', ['graftup:a2:mg_combust'])).not.toThrow();
  });
});

describe('previewAbilityTable', () => {
  it('returns a fresh clone and follows class upgrades + hybrid grafts', () => {
    const preview = previewAbilityTable('mage', []);
    expect(preview).not.toBe(CLASSES.mage.abilities);
    expect(previewAbilityTable('mage', ['mg_freeze']).a2.freeze!).toBeCloseTo(1.1, 5);
    expect(previewAbilityTable('knight', ['hy_pyromancer']).a2.name).toBe('Fireball');
  });

  it('ignores mismatched class upgrades, excluded hybrids and unknown ids', () => {
    expect(previewAbilityTable('knight', ['mg_freeze']).a2.name).toBe('Shield Wall');
    expect(previewAbilityTable('mage', ['hy_pyromancer']).a2.name).toBe('Frost Nova');
    expect(previewAbilityTable('knight', ['bogus']).basic.name).toBe('Cleave');
    // A stat-flavoured pick leaves the previewed table intact.
    expect(previewAbilityTable('knight', ['kn_secondwind']).basic.name).toBe('Cleave');
  });
});

describe('reofferCandidates', () => {
  it('is empty without a graft and for an unrecognised class', () => {
    expect(reofferCandidates('knight', [])).toEqual([]);
    expect(reofferCandidates('knight', ['kn_bulwark'])).toEqual([]);
    expect(reofferCandidates('nope' as ClassId, ['hy_pyromancer'])).toEqual([]);
  });

  it('offers a reclaim + the graft source-slot boons, dropping ones at cap', () => {
    const c = reofferCandidates('knight', ['hy_pyromancer']);
    expect(c).toContain('restore:a2');
    expect(c).toContain('graftup:a2:mg_quickcast');
    expect(c).toContain('graftup:a2:mg_combust');
    expect(c).not.toContain('graftup:a2:mg_freeze'); // Frost Nova, not Fireball
    const capped = reofferCandidates('knight', [
      'hy_pyromancer',
      ...Array<string>(5).fill('graftup:a2:mg_combust'),
    ]);
    expect(capped).not.toContain('graftup:a2:mg_combust');
    expect(capped).toContain('graftup:a2:mg_quickcast');
  });

  it('stops offering a reclaim once the native is reclaimed', () => {
    expect(reofferCandidates('knight', ['hy_pyromancer', 'restore:a2'])).toEqual([]);
  });
});

describe('describeCharOffer / charUpgradeBadge', () => {
  it('labels grafts, grands, reclaims (with and without a dropping clause) and graftups', () => {
    const graft = describeCharOffer('knight', [], 'hy_pyromancer')!;
    expect(graft.desc).toContain('Replaces Shield Wall');
    const grand = describeCharOffer('knight', [], 'kn_grand_immovable')!;
    expect(grand.label.startsWith('★')).toBe(true);
    expect(grand.desc.startsWith('GRAND —')).toBe(true);
    const reclaimDrop = describeCharOffer('knight', ['hy_pyromancer'], 'restore:a2')!;
    expect(reclaimDrop.desc).toContain('dropping Fireball');
    const reclaimPlain = describeCharOffer('knight', [], 'restore:a2')!;
    expect(reclaimPlain.desc).not.toContain('dropping');
    const graftup = describeCharOffer('knight', ['hy_pyromancer'], 'graftup:a2:mg_combust')!;
    expect(graftup.desc).toContain('Upgrades your grafted Fireball');
    const plain = describeCharOffer('knight', [], 'kn_bulwark')!;
    expect(plain.label).toBe('🛡️ Impenetrable');
    expect(describeCharOffer('knight', [], 'bogus')).toBeNull();
  });

  it('charUpgradeBadge resolves real, reclaim and graftup ids, null otherwise', () => {
    expect(charUpgradeBadge('kn_bulwark')!.name).toBe('Impenetrable');
    expect(charUpgradeBadge('restore:a2')!.icon).toBe('↩️');
    expect(charUpgradeBadge('graftup:a2:mg_combust')!.name).toBe('Combustion');
    expect(charUpgradeBadge('bogus')).toBeNull();
  });
});

describe('rollCharChoices: single-class path', () => {
  it('returns nothing for n<=0 or an unrecognised class', () => {
    expect(rollCharChoices('knight', 0, seq([0.1]))).toEqual([]);
    expect(rollCharChoices('nope' as ClassId, 3, seq([0.1]))).toEqual([]);
  });

  it('offers n distinct picks, clamped to the pool, in draw order', () => {
    expect(rollCharChoices('knight', 3, seq([0, 0, 0, 0.9, 0.9]))).toEqual([
      'kn_bulwark',
      'kn_concuss',
      'kn_widecleave',
    ]);
    expect(rollCharChoices('knight', 10, seq([0, 0, 0, 0, 0, 0.9, 0.9]))).toHaveLength(5);
  });

  it('swaps the last pick for a hybrid when the roll fires (but not at the boundary)', () => {
    const fired = rollCharChoices('knight', 3, seq([0, 0, 0, 0.1, 0, 0.9]));
    expect(fired[2]).toBe('hy_pyromancer');
    const boundary = rollCharChoices('knight', 3, seq([0, 0, 0, 0.45, 0]));
    expect(boundary[2]).toBe('kn_widecleave');
  });

  it('surfaces a grand improvement as the first pick when its roll fires', () => {
    const off = rollCharChoices('knight', 3, seq([0, 0, 0, 0.99, 0.1]));
    expect(off[0]).toBe('kn_grand_immovable');
  });

  it('upholds distinctness + legality across a seeded sweep of every class', () => {
    for (const classId of CLASS_IDS) {
      const rng = lcg(0xc0ffee ^ classId.length);
      for (let t = 0; t < 30; t++) {
        const offers = rollCharChoices(classId, 3, rng);
        expect(offers).toHaveLength(3);
        expect(new Set(offers).size).toBe(3);
        for (const id of offers) expect(upgradeAllowedFor(CHAR_UPGRADES[id], classId)).toBe(true);
      }
    }
  });
});

describe('rollCharChoices: re-offer swap placement', () => {
  it('places a swapped re-offer at index 1 when there are 2+ base offers', () => {
    const off = rollCharChoices('knight', 4, seq([0, 0, 0, 0, 0.9, 0.9, 0.0, 0.0]), [
      'hy_pyromancer',
    ]);
    expect(off[0]).toBe('kn_bulwark');
    expect(off[1]).toBe('restore:a2');
  });

  it('places a swapped re-offer at index 0 when there is a single offer (line 1773)', () => {
    // n=1 → out.length===1 → the `out.length > 1 ? 1 : 0` ternary takes the 0 arm.
    const off = rollCharChoices('knight', 1, seq([0, 0.99, 0.99, 0.0, 0.0]), ['hy_pyromancer']);
    expect(off).toEqual(['restore:a2']);
  });

  it('does NOT draw or swap for a hero without a displaced skill', () => {
    const off = rollCharChoices('knight', 4, seq([0, 0, 0, 0, 0.9, 0.9]), []);
    expect(off).toEqual(['kn_bulwark', 'kn_concuss', 'kn_widecleave', 'kn_bastion']);
  });
});

describe('rollCharChoices: multiclass weighted path (lines 1712-1730)', () => {
  it('weights the main class heavier and follows the roll deterministically', () => {
    // extras=['mage']; per-iteration rng picks by cumulative weight.
    //  iter1 rng=0    → main-class head (kn_bulwark)
    //  iter2 rng=0.5  → walks past several entries (covers the roll>0 continue)
    //  iter3 rng=0    → head of the shrunk pool
    const off = rollCharChoices('knight', 3, seq([0, 0.5, 0, 0.99, 0.99]), [], ['mage']);
    expect(off).toEqual(['kn_bulwark', 'kn_bastion', 'kn_concuss']);
    expect(new Set(off).size).toBe(3);
    for (const id of off) expect(CHAR_UPGRADES[id].classId).toBe('knight');
  });

  it('spans every owned class and never repeats a pick', () => {
    const rng = lcg(0x1234);
    for (let t = 0; t < 20; t++) {
      const off = rollCharChoices('knight', 6, rng, [], ['mage']);
      expect(off).toHaveLength(6);
      expect(new Set(off).size).toBe(6);
      for (const id of off) {
        expect(['knight', 'mage', 'any']).toContain(CHAR_UPGRADES[id].classId);
      }
    }
  });

  it('skips an upgrade already owned at its cap (line 1718 false arm)', () => {
    const off = rollCharChoices(
      'knight',
      3,
      seq([0, 0, 0, 0.99, 0.99]),
      Array<string>(5).fill('kn_bulwark'),
      ['mage'],
    );
    expect(off).not.toContain('kn_bulwark');
    expect(off).toEqual(['kn_concuss', 'kn_widecleave', 'kn_bastion']);
  });

  it('tolerates an unrecognised extra class (empty-pool fallback, line 1717)', () => {
    const off = rollCharChoices('knight', 2, seq([0, 0, 0.99, 0.99]), [], ['nope' as ClassId]);
    expect(off).toEqual(['kn_bulwark', 'kn_concuss']);
  });
});

// ===========================================================================
// TARGET 2 — store.ts
// ===========================================================================
import { useStore } from '../src/ui/state/store';
import type { AppState } from '../src/ui/state/store';
import { DEFAULT_CLASS } from '../src/engine/content/classes';
import { DEFAULT_MONSTER } from '../src/engine/content/monsters';
import type { LobbyPlayer, NetSession } from '../src/net/protocol';
import type { EphemeralId } from '../src/engine/content/ephemeral';

const NAME_KEY = 'warband.heroName.v1';
const VOLUME_KEY = 'warband.volume.v1';
const AUTOFIRE_KEY = 'warband.autofire.v1';
const SHAKE_KEY = 'warband.screenShake.v1';

// Snapshot the pristine store at import time (localStorage still empty) so we can
// restore it before every test, exactly like tests/store.test.ts.
const initialState: AppState = { ...useStore.getState() };
const noop = (): void => undefined;

function makeSession(onLeave: () => void = noop): NetSession {
  return {
    isHost: true,
    selfId: 'self-id',
    localPlayerId: 0,
    setLocalInput: noop,
    getRenderState: () => null,
    setSelection: noop,
    setReady: noop,
    requestPause: noop,
    chooseUpgrade: noop,
    chooseCharUpgrade: noop,
    chooseSubSkill: noop,
    chooseExtraClass: noop,
    swapClass: noop,
    buyEphemeral: noop,
    setNextReady: noop,
    leave: onLeave,
  };
}

const player: LobbyPlayer = {
  peerId: 'p1',
  name: 'Alice',
  classId: 'mage',
  ready: true,
  isHost: false,
  isBot: false,
};

function snapshot(): AppState {
  return { ...useStore.getState() };
}

function changedKeys(before: AppState, after: AppState): string[] {
  const b = before as unknown as Record<string, unknown>;
  const a = after as unknown as Record<string, unknown>;
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const changed: string[] = [];
  for (const k of keys) if (b[k] !== a[k]) changed.push(k);
  return changed.sort();
}

/** Re-import the store module so its load* helpers re-read the current localStorage. */
async function freshStore(): Promise<typeof useStore> {
  vi.resetModules();
  const mod = await import('../src/ui/state/store');
  return mod.useStore;
}

beforeEach(() => {
  localStorage.clear();
  useStore.setState(initialState);
});

describe('store: initial defaults', () => {
  it('has the documented defaults', () => {
    const s = useStore.getState();
    expect(s.phase).toBe('menu');
    expect(s.monsterId).toBe(DEFAULT_MONSTER);
    expect(s.localClass).toBe(DEFAULT_CLASS);
    expect(s.myUpgrades).toEqual([]);
    expect(s.myExtraClasses).toEqual([]);
    expect(s.myCoins).toBe(0);
    expect(s.screenShake).toBe(true);
    expect(s.volume).toBeCloseTo(1);
  });
});

describe('store: navigation, room & lobby setters', () => {
  it('setPhase changes phase and dismisses the Controls overlay only when open', () => {
    useStore.getState().setShowControls(true);
    let before = snapshot();
    useStore.getState().setPhase('game');
    expect(changedKeys(before, snapshot())).toEqual(['phase', 'showControls']);
    before = snapshot();
    useStore.getState().setPhase('lobby');
    expect(changedKeys(before, snapshot())).toEqual(['phase']);
  });

  it('covers the simple room / session / net setters', () => {
    const g = useStore.getState();
    g.setError('x');
    g.setHostLeft(true);
    g.setRoom('ROOM12', true);
    const sess = makeSession();
    g.setSession(sess);
    g.setNetMode('relay');
    g.setPeerCount(3);
    g.setNetHint('connecting');
    const s = useStore.getState();
    expect(s.error).toBe('x');
    expect(s.roomCode).toBe('ROOM12');
    expect(s.session).toBe(sess);
    expect(s.netMode).toBe('relay');
    expect(s.peerCount).toBe(3);
    expect(s.netHint).toBe('connecting');
  });

  it('covers lobby, seed and hardcore setters (incl. seedInput cap)', () => {
    const g = useStore.getState();
    g.setMonster('troll');
    g.setGauntlet(true);
    g.setLobby([player], 'lich', 'inFight', true);
    g.setLocalClass('ranger');
    g.setLocalReady(true);
    g.setSeedMode('custom');
    g.setSeedInput('s'.repeat(40));
    g.setActiveRunSeed(99);
    g.setHardcore(true);
    g.setActiveHardcore(true);
    const s = useStore.getState();
    expect(s.monsterId).toBe('lich');
    expect(s.players).toEqual([player]);
    expect(s.localClass).toBe('ranger');
    expect(s.seedMode).toBe('custom');
    expect(s.seedInput).toHaveLength(24); // capped
    expect(s.activeRunSeed).toBe(99);
    expect(s.hardcore).toBe(true);
    expect(s.activeHardcore).toBe(true);
  });

  it('covers the fight/run setters', () => {
    const g = useStore.getState();
    g.setPaused(true);
    g.setPausedBy('Bob');
    g.setResumeCountdown(3);
    g.setRun({ index: 1, total: 5 });
    g.setCycle(2);
    g.setNextReadyState(2, 4);
    g.setResult({ outcome: 'victory', timeMs: 1, stats: [], monsterId: 'dragon' });
    const s = useStore.getState();
    expect(s.paused).toBe(true);
    expect(s.pausedBy).toBe('Bob');
    expect(s.resumeCountdown).toBe(3);
    expect(s.run).toEqual({ index: 1, total: 5 });
    expect(s.cycle).toBe(2);
    expect(s.nextReadyTotal).toBe(4);
    expect(s.result?.outcome).toBe('victory');
  });
});

describe('store: hero name persistence', () => {
  it('setLocalName updates state and persists verbatim (no write-time cap)', () => {
    useStore.getState().setLocalName('Aragorn');
    expect(useStore.getState().localName).toBe('Aragorn');
    expect(localStorage.getItem(NAME_KEY)).toBe('Aragorn');
    const long = 'x'.repeat(30);
    useStore.getState().setLocalName(long);
    expect(localStorage.getItem(NAME_KEY)).toBe(long);
  });
});

describe('store: per-run progression', () => {
  it('addMyUpgrade / addMyCharUpgrade append immutably in order', () => {
    const g = useStore.getState();
    g.addMyUpgrade('swift');
    g.addMyUpgrade('vigor');
    const prevArray = useStore.getState().myUpgrades;
    g.addMyUpgrade('swift');
    expect(useStore.getState().myUpgrades).toEqual(['swift', 'vigor', 'swift']);
    expect(useStore.getState().myUpgrades).not.toBe(prevArray); // fresh array each append
    g.addMyCharUpgrade('cleave+');
    expect(useStore.getState().myCharUpgrades).toEqual(['cleave+']);
  });

  it('addMySubSkill caps at two and records the subclass', () => {
    const g = useStore.getState();
    g.addMySubSkill('kn_champion', 'a');
    g.addMySubSkill('kn_champion', 'b');
    g.addMySubSkill('kn_champion', 'c');
    expect(useStore.getState().mySubSkills).toEqual(['a', 'b']);
    expect(useStore.getState().mySubclassId).toBe('kn_champion');
  });

  it('addMyExtraClass appends once then dedupes (lines 345 & 346)', () => {
    const g = useStore.getState();
    g.addMyExtraClass('mage'); // not present → append
    expect(useStore.getState().myExtraClasses).toEqual(['mage']);
    const before = snapshot();
    g.addMyExtraClass('mage'); // present → return the same array untouched
    const after = snapshot();
    expect(after.myExtraClasses).toEqual(['mage']);
    expect(after.myExtraClasses).toBe(before.myExtraClasses); // identical reference
    g.addMyExtraClass('rogue'); // a different class → append
    expect(useStore.getState().myExtraClasses).toEqual(['mage', 'rogue']);
  });

  it('clearMyUpgrades empties every per-run list, coins and stock', () => {
    const g = useStore.getState();
    g.addMyUpgrade('swift');
    g.addMyCharUpgrade('cleave+');
    g.addMySubSkill('kn_champion', 'a');
    g.addMyExtraClass('mage');
    useStore.setState({ myCoins: 9, myEphemeral: { potions: 1 } });
    g.clearMyUpgrades();
    const s = useStore.getState();
    expect(s.myUpgrades).toEqual([]);
    expect(s.myCharUpgrades).toEqual([]);
    expect(s.mySubSkills).toEqual([]);
    expect(s.myExtraClasses).toEqual([]);
    expect(s.mySubclassId).toBeNull();
    expect(s.myCoins).toBe(0);
    expect(s.myEphemeral).toEqual({});
  });
});

describe('store: awardCoinsFromResult (null-session guard, line 350)', () => {
  it("banks this hero row's coins when a session is present", () => {
    const g = useStore.getState();
    g.setSession(makeSession()); // selfId = 'self-id'
    g.awardCoinsFromResult({
      outcome: 'victory',
      timeMs: 1,
      monsterId: 'dragon',
      stats: [
        {
          peerId: 'self-id',
          name: 'Me',
          classId: 'knight',
          damageDealt: 0,
          healingDone: 0,
          revives: 0,
          deaths: 0,
          score: 0,
          coins: 5,
        },
      ],
    });
    expect(useStore.getState().myCoins).toBe(5);
  });

  it('is a no-op when there is no session (early return)', () => {
    // No session set → the `if (!sess) return;` guard fires.
    useStore.getState().awardCoinsFromResult({
      outcome: 'victory',
      timeMs: 1,
      monsterId: 'dragon',
      stats: [
        {
          peerId: 'self-id',
          name: 'Me',
          classId: 'knight',
          damageDealt: 0,
          healingDone: 0,
          revives: 0,
          deaths: 0,
          score: 0,
          coins: 5,
        },
      ],
    });
    expect(useStore.getState().myCoins).toBe(0);
  });

  it('banks nothing when this hero has no coins row', () => {
    const g = useStore.getState();
    g.setSession(makeSession());
    g.awardCoinsFromResult({
      outcome: 'defeat',
      timeMs: 1,
      monsterId: 'dragon',
      stats: [],
    });
    expect(useStore.getState().myCoins).toBe(0);
  });
});

describe('store: buyEphemeral (every perk arm, lines 356-366)', () => {
  it('buys each passive/active/auto perk into the mirrored stock', () => {
    const bought: string[] = [];
    const session: NetSession = {
      ...makeSession(),
      buyEphemeral: (id) => {
        bought.push(id);
      },
    };
    const g = useStore.getState();
    g.setSession(session);
    useStore.setState({ myCoins: 100 });
    expect(g.buyEphemeral('speed')).toBe(true); // line 362
    expect(g.buyEphemeral('damage')).toBe(true); // line 363
    expect(g.buyEphemeral('defense')).toBe(true); // line 364
    expect(g.buyEphemeral('potion')).toBe(true); // line 365
    expect(g.buyEphemeral('revive')).toBe(true); // line 366
    expect(g.buyEphemeral('retry')).toBe(true); // no per-fight mirror
    const s = useStore.getState();
    expect(s.myEphemeral.speed).toBe(true);
    expect(s.myEphemeral.damage).toBe(true);
    expect(s.myEphemeral.defense).toBe(true);
    expect(s.myEphemeral.potions).toBe(1);
    expect(s.myEphemeral.revives).toBe(1);
    expect(s.myCoins).toBe(100 - 3 - 4 - 4 - 3 - 6 - 8);
    expect(bought).toEqual(['speed', 'damage', 'defense', 'potion', 'revive', 'retry']);
  });

  it('refuses an unknown id (line 356) and an unaffordable perk', () => {
    const g = useStore.getState();
    g.setSession(makeSession());
    expect(g.buyEphemeral('bogus' as EphemeralId)).toBe(false); // !def
    useStore.setState({ myCoins: 1 });
    expect(g.buyEphemeral('revive')).toBe(false); // costs 6
    expect(useStore.getState().myEphemeral.revives).toBeUndefined();
  });

  it('mirrors the buy even without a session (optional-chain guard)', () => {
    // No session → `session?.buyEphemeral(id)` short-circuits, state still updates.
    useStore.setState({ myCoins: 10 });
    expect(useStore.getState().buyEphemeral('potion')).toBe(true);
    expect(useStore.getState().myEphemeral.potions).toBe(1);
    expect(useStore.getState().myCoins).toBe(7);
  });

  it('resetEphemeralStock clears stock but keeps coins', () => {
    useStore.setState({ myCoins: 4, myEphemeral: { potions: 2, speed: true } });
    useStore.getState().resetEphemeralStock();
    expect(useStore.getState().myEphemeral).toEqual({});
    expect(useStore.getState().myCoins).toBe(4);
  });
});

describe('store: audio & input options', () => {
  it('toggleMute flips each call', () => {
    useStore.getState().toggleMute();
    expect(useStore.getState().muted).toBe(true);
    useStore.getState().toggleMute();
    expect(useStore.getState().muted).toBe(false);
  });

  it('setVolume clamps, persists and manages the mute interaction', () => {
    const g = useStore.getState();
    g.setVolume(0.42);
    expect(useStore.getState().volume).toBeCloseTo(0.42);
    expect(localStorage.getItem(VOLUME_KEY)).toBe('0.42');
    g.setVolume(1.5);
    expect(useStore.getState().volume).toBeCloseTo(1);
    g.setVolume(-0.5);
    expect(useStore.getState().volume).toBeCloseTo(0);
    // raising above zero lifts an explicit mute…
    g.toggleMute();
    g.setVolume(0.8);
    expect(useStore.getState().muted).toBe(false);
    // …but dropping to zero keeps an existing mute, and never sets one when unmuted.
    g.toggleMute();
    g.setVolume(0);
    expect(useStore.getState().muted).toBe(true);
    g.toggleMute();
    g.setVolume(0);
    expect(useStore.getState().muted).toBe(false);
  });

  it('setAutofire persists "1" / "0"', () => {
    useStore.getState().setAutofire(true);
    expect(localStorage.getItem(AUTOFIRE_KEY)).toBe('1');
    useStore.getState().setAutofire(false);
    expect(localStorage.getItem(AUTOFIRE_KEY)).toBe('0');
  });

  it('setScreenShake persists both ternary arms and updates state (line 98)', () => {
    const before = snapshot();
    useStore.getState().setScreenShake(false);
    expect(useStore.getState().screenShake).toBe(false);
    expect(localStorage.getItem(SHAKE_KEY)).toBe('0');
    expect(changedKeys(before, snapshot())).toEqual(['screenShake']);
    useStore.getState().setScreenShake(true);
    expect(useStore.getState().screenShake).toBe(true);
    expect(localStorage.getItem(SHAKE_KEY)).toBe('1');
  });
});

describe('store: reset', () => {
  it('returns to the menu, tears down the run and calls session.leave()', () => {
    let leaveCount = 0;
    const session = makeSession(() => {
      leaveCount += 1;
    });
    const g = useStore.getState();
    g.setSession(session);
    g.setRoom('ROOM12', true);
    g.setPhase('game');
    g.setError('boom');
    g.setLobby([player], 'lich', 'inFight', true);
    g.setRun({ index: 1, total: 3 });
    g.addMyUpgrade('swift');
    g.setResult({ outcome: 'victory', timeMs: 1, stats: [], monsterId: 'dragon' });
    g.setShowControls(true);

    useStore.getState().reset();
    const s = useStore.getState();
    expect(leaveCount).toBe(1);
    expect(s.phase).toBe('menu');
    expect(s.session).toBeNull();
    expect(s.roomCode).toBeNull();
    expect(s.run).toBeNull();
    expect(s.myUpgrades).toEqual([]);
    expect(s.result).toBeNull();
    expect(s.showControls).toBe(false);
  });

  it('preserves persisted prefs and lobby settings across a reset', () => {
    const g = useStore.getState();
    g.setNetMode('relay');
    g.setMonster('troll');
    g.setLocalName('Keeper');
    g.setGauntlet(true);
    useStore.getState().reset();
    const s = useStore.getState();
    expect(s.netMode).toBe('relay');
    expect(s.monsterId).toBe('troll');
    expect(s.localName).toBe('Keeper');
    expect(s.gauntlet).toBe(true);
  });

  it('swallows a throwing session.leave() and works with no active session', () => {
    const session = makeSession(() => {
      throw new Error('leave failed');
    });
    useStore.getState().setSession(session);
    expect(() => useStore.getState().reset()).not.toThrow();
    expect(useStore.getState().session).toBeNull();
    // No session at all → the optional-chain leave() is skipped.
    useStore.getState().setPhase('lobby');
    expect(() => useStore.getState().reset()).not.toThrow();
    expect(useStore.getState().phase).toBe('menu');
  });
});

describe('store: persistence resilience', () => {
  it('setters swallow localStorage write failures but still update state', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    try {
      const g = useStore.getState();
      expect(() => g.setLocalName('Boromir')).not.toThrow();
      expect(() => g.setVolume(0.3)).not.toThrow();
      expect(() => g.setAutofire(true)).not.toThrow();
      expect(() => g.setScreenShake(false)).not.toThrow();
      const s = useStore.getState();
      expect(s.localName).toBe('Boromir');
      expect(s.volume).toBeCloseTo(0.3);
      expect(s.autofire).toBe(true);
      expect(s.screenShake).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it('setters skip persistence but still update state when localStorage is absent', () => {
    vi.stubGlobal('localStorage', undefined);
    try {
      const g = useStore.getState();
      expect(() => g.setLocalName('Faramir')).not.toThrow();
      expect(() => g.setVolume(0.6)).not.toThrow();
      expect(() => g.setAutofire(true)).not.toThrow();
      expect(() => g.setScreenShake(false)).not.toThrow();
      const s = useStore.getState();
      expect(s.localName).toBe('Faramir');
      expect(s.volume).toBeCloseTo(0.6);
      expect(s.autofire).toBe(true);
      expect(s.screenShake).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('store: persisted preference loading (fresh module init)', () => {
  it('loads and caps / clamps persisted prefs', async () => {
    localStorage.setItem(NAME_KEY, 'x'.repeat(40));
    localStorage.setItem(VOLUME_KEY, '5');
    localStorage.setItem(AUTOFIRE_KEY, '1');
    localStorage.setItem(SHAKE_KEY, '0');
    const s = (await freshStore()).getState();
    expect(s.localName).toBe('x'.repeat(16));
    expect(s.volume).toBeCloseTo(1);
    expect(s.autofire).toBe(true);
    expect(s.screenShake).toBe(false);
  });

  it('clamps a negative volume up to 0 and reads a short name unchanged', async () => {
    localStorage.setItem(NAME_KEY, 'Gimli');
    localStorage.setItem(VOLUME_KEY, '-3');
    const s = (await freshStore()).getState();
    expect(s.localName).toBe('Gimli');
    expect(s.volume).toBeCloseTo(0);
  });

  it('falls back to defaults for a non-finite volume and any non-"1" autofire', async () => {
    localStorage.setItem(VOLUME_KEY, 'not-a-number');
    localStorage.setItem(AUTOFIRE_KEY, '0');
    localStorage.setItem(SHAKE_KEY, '1');
    const s = (await freshStore()).getState();
    expect(s.volume).toBeCloseTo(1);
    expect(s.autofire).toBe(false);
    expect(s.screenShake).toBe(true);
  });

  it('uses defaults when localStorage is absent at init', async () => {
    vi.stubGlobal('localStorage', undefined);
    try {
      const s = (await freshStore()).getState();
      expect(s.localName).toBe('');
      expect(s.volume).toBeCloseTo(1);
      expect(s.autofire).toBe(false);
      expect(s.screenShake).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('falls back to defaults when getItem throws', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    try {
      const s = (await freshStore()).getState();
      expect(s.localName).toBe('');
      expect(s.volume).toBeCloseTo(1);
      expect(s.autofire).toBe(false);
      expect(s.screenShake).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});
