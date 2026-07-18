import { describe, it, expect } from 'vitest';
import {
  upgradeAllowedFor,
  applyCharUpgrades,
  previewAbilityTable,
  previewPlayerStats,
  isCharUpgradeId,
  rollCharChoices,
  reofferCandidates,
  describeCharOffer,
  charUpgradeBadge,
  charUpgradeMaxStacks,
  charUpgradeAtMax,
  grandCount,
  applySubclassGrands,
  offerableGrands,
  REOFFER_CHANCE,
  CHAR_UPGRADES,
  CHAR_UPGRADES_BY_CLASS,
  HYBRID_UPGRADES,
  HYBRID_OFFER_CHANCE,
  GRAND_BY_CLASS,
  SKILL_GRANDS,
  SUBCLASS_GRANDS,
  GRAFT_GRANDS,
  SUB_SKILL_UPGRADES,
  applySubSkillUpgrades,
  previewSubAbility,
  PERSISTENT_STATS,
} from '../src/engine/content/charUpgrades';
import { CLASSES, CLASS_IDS, cloneAbilities, getClass } from '../src/engine/content/classes';
import type { PlayerAbilityDef, AbilityKind } from '../src/engine/content/classes';
import { SUBCLASSES, getSubSkill, subclassOfSkill } from '../src/engine/content/subclasses';
import { setProceduralSeed } from '../src/engine/content/procgen';
import {
  CRIT_CHANCE_BASE,
  CRIT_MULT_BASE,
  CRIT_CHANCE_PER_DEADEYE,
  PROJECTILE_MAX_RANGE,
} from '../src/engine/core/constants';
import type { ClassId, Player, AbilitySlot, SubSlot } from '../src/engine/core/types';

// ---------------------------------------------------------------------------
// Fixtures / helpers
// ---------------------------------------------------------------------------

/** A player stub carrying a private (cloned) ability table + all the numeric
 *  fields the stat-flavoured upgrades tug on, seeded from the class defaults. */
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

/** Spawn a hero of `classId`, apply the ordered upgrade ids, hand back the hero. */
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

// ---------------------------------------------------------------------------
// Catalog shape: per-class pools, the hybrid pool, and the flat lookup
// ---------------------------------------------------------------------------

describe('character-upgrade catalog', () => {
  it('has a 5-strong pool for every one of the 12 classes', () => {
    expect(CLASS_IDS).toHaveLength(12);
    for (const classId of CLASS_IDS) {
      const pool = CHAR_UPGRADES_BY_CLASS[classId];
      expect(pool).toHaveLength(5);
      for (const def of pool) {
        expect(def.classId).toBe(classId);
        expect(typeof def.id).toBe('string');
        expect(typeof def.name).toBe('string');
        expect(typeof def.desc).toBe('string');
        expect(typeof def.icon).toBe('string');
        expect(typeof def.apply).toBe('function');
      }
    }
  });

  it('exposes 12 hybrid upgrades, all class-agnostic', () => {
    expect(HYBRID_UPGRADES).toHaveLength(12);
    for (const def of HYBRID_UPGRADES) expect(def.classId).toBe('any');
  });

  it('tags each hybrid graft/heal with the classes it must skip', () => {
    const byId = Object.fromEntries(HYBRID_UPGRADES.map((d) => [d.id, d]));
    expect(byId.hy_pyromancer.exclude).toEqual(['mage', 'sorcerer']);
    expect(byId.hy_shadowpact.exclude).toEqual(['rogue', 'mage', 'sorcerer']);
    expect(byId.hy_warhowl.exclude).toEqual(['barbarian']);
    expect(byId.hy_fieldmedic.exclude).toEqual(['cleric', 'paladin', 'druid', 'bard']);
    // The pure combat-style hybrids graft nothing away, so they exclude nobody.
    for (const id of [
      'hy_vampiric',
      'hy_frostbrand',
      'hy_stormsplit',
      'hy_juggernaut',
      'hy_glasscannon',
    ]) {
      expect(byId[id].exclude).toBeUndefined();
    }
  });

  it('flat lookup covers every class + hybrid + all grand kinds with unique ids', () => {
    const classGrand = Object.values(GRAND_BY_CLASS).flat();
    expect(classGrand).toHaveLength(12 * 2); // 2 class capstones per class (item 22)
    expect(SKILL_GRANDS).toHaveLength(12 * 4 * 2); // 2 per base skill: 12 × (basic/a1/a2/a3) × 2 = 96
    expect(SUBCLASS_GRANDS).toHaveLength(12 * 2 * 2); // 2 per subclass: 24 subclasses × 2 = 48
    expect(GRAFT_GRANDS).toHaveLength(7 * 2); // 2 per skill-replacing graft: 7 grafts × 2 = 14 (item 18/66)
    const all = [
      ...Object.values(CHAR_UPGRADES_BY_CLASS).flat(),
      ...HYBRID_UPGRADES,
      ...classGrand,
      ...SKILL_GRANDS,
      ...SUBCLASS_GRANDS,
      ...GRAFT_GRANDS,
      ...SUB_SKILL_UPGRADES, // item 6: one per subclass skill (24 subclasses × 4 = 96)
    ];
    expect(all).toHaveLength(12 * 5 + 12 + 24 + 96 + 48 + 14 + 96); // 350 (item 66: +3 grafts, +6 graft-grands)
    expect(SUB_SKILL_UPGRADES).toHaveLength(96);
    const ids = all.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicates
    expect(Object.keys(CHAR_UPGRADES)).toHaveLength(350);
    for (const id of ids) expect(CHAR_UPGRADES[id].id).toBe(id);
    // Every grand improvement (class, skill, subclass, graft) is uniquely capped at one stack.
    for (const d of [...classGrand, ...SKILL_GRANDS, ...SUBCLASS_GRANDS, ...GRAFT_GRANDS]) {
      expect(d.grand).toBe(true);
      expect(d.maxStacks).toBe(1);
    }
  });

  it('tags every base-skill grand with the class + base slot it twists (item 17)', () => {
    // 2 grands for each of the 48 base skills, keyed by (classId, skillSlot).
    const bySlot = new Map<string, number>();
    for (const d of SKILL_GRANDS) {
      expect(d.classId).not.toBe('any');
      expect(['basic', 'a1', 'a2', 'a3']).toContain(d.skillSlot);
      expect(d.subclassId).toBeUndefined();
      const key = `${d.classId}:${d.skillSlot}`;
      bySlot.set(key, (bySlot.get(key) ?? 0) + 1);
    }
    expect(bySlot.size).toBe(48); // every class × slot represented
    for (const [, n] of bySlot) expect(n).toBe(2); // exactly two per skill
  });

  it('tags every subclass grand with its subclass + parent class (item 17)', () => {
    const bySub = new Map<string, number>();
    for (const d of SUBCLASS_GRANDS) {
      const sub = subclassOfSkill(
        SUBCLASSES[d.classId as ClassId].find((s) => s.id === d.subclassId)!.skills[0].id,
      );
      expect(sub?.id).toBe(d.subclassId); // subclassId names a real subclass
      expect(sub?.classId).toBe(d.classId); // classId is that subclass's parent class
      expect(d.skillSlot).toBeUndefined();
      bySub.set(d.subclassId!, (bySub.get(d.subclassId!) ?? 0) + 1);
    }
    expect(bySub.size).toBe(24); // every subclass represented
    for (const [, n] of bySub) expect(n).toBe(2); // exactly two per subclass
  });

  it('tags every graft grand with a real skill-replacing graft, two per graft (item 18)', () => {
    // The skill-replacing grafts are exactly the hybrids with a `replaces` slot.
    const grafts = HYBRID_UPGRADES.filter((h) => h.replaces);
    expect(grafts.map((h) => h.id).sort()).toEqual([
      'hy_fieldmedic',
      'hy_hexbrand',
      'hy_inspire',
      'hy_pyromancer',
      'hy_shadowpact',
      'hy_warhowl',
      'hy_windstep',
    ]);
    const byGraft = new Map<string, number>();
    for (const d of GRAFT_GRANDS) {
      expect(d.classId).toBe('any'); // class-agnostic — any hero can bolt on the graft
      expect(d.skillSlot).toBeUndefined();
      expect(d.subclassId).toBeUndefined();
      expect(grafts.some((h) => h.id === d.graftId)).toBe(true); // names a real graft
      byGraft.set(d.graftId!, (byGraft.get(d.graftId!) ?? 0) + 1);
    }
    expect(byGraft.size).toBe(7); // every skill-replacing graft covered
    for (const [, n] of byGraft) expect(n).toBe(2); // exactly two per graft
  });
});

// ---------------------------------------------------------------------------
// upgradeAllowedFor — class gating for pool picks and hybrid grafts
// ---------------------------------------------------------------------------

describe('upgradeAllowedFor', () => {
  it('permits a class-specific upgrade only for its own class', () => {
    const def = CHAR_UPGRADES.mg_freeze;
    expect(upgradeAllowedFor(def, 'mage')).toBe(true);
    expect(upgradeAllowedFor(def, 'knight')).toBe(false);
  });

  it('offers an unrestricted hybrid to any class', () => {
    const def = CHAR_UPGRADES.hy_vampiric;
    for (const classId of CLASS_IDS) expect(upgradeAllowedFor(def, classId)).toBe(true);
  });

  it("honours a hybrid's exclude list", () => {
    expect(upgradeAllowedFor(CHAR_UPGRADES.hy_pyromancer, 'mage')).toBe(false);
    expect(upgradeAllowedFor(CHAR_UPGRADES.hy_pyromancer, 'knight')).toBe(true);
    expect(upgradeAllowedFor(CHAR_UPGRADES.hy_shadowpact, 'rogue')).toBe(false);
    expect(upgradeAllowedFor(CHAR_UPGRADES.hy_shadowpact, 'mage')).toBe(false);
    expect(upgradeAllowedFor(CHAR_UPGRADES.hy_shadowpact, 'knight')).toBe(true);
    for (const healer of ['cleric', 'paladin', 'druid'] as const) {
      expect(upgradeAllowedFor(CHAR_UPGRADES.hy_fieldmedic, healer)).toBe(false);
    }
    expect(upgradeAllowedFor(CHAR_UPGRADES.hy_fieldmedic, 'knight')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isCharUpgradeId — untrusted-id type guard
// ---------------------------------------------------------------------------

describe('isCharUpgradeId', () => {
  it('accepts real ids from both the class and hybrid pools', () => {
    for (const id of ['kn_bulwark', 'dr_ward', 'hy_vampiric', 'ro_envenom']) {
      expect(isCharUpgradeId(id)).toBe(true);
    }
  });

  it('rejects unknown strings and non-strings', () => {
    expect(isCharUpgradeId('nope')).toBe(false);
    expect(isCharUpgradeId('')).toBe(false);
    expect(isCharUpgradeId(123)).toBe(false);
    expect(isCharUpgradeId(null)).toBe(false);
    expect(isCharUpgradeId(undefined)).toBe(false);
    expect(isCharUpgradeId({})).toBe(false);
  });

  it('is not fooled by Object.prototype keys (own-property check)', () => {
    expect(isCharUpgradeId('toString')).toBe(false);
    expect(isCharUpgradeId('constructor')).toBe(false);
    expect(isCharUpgradeId('hasOwnProperty')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyCharUpgrades — guards, skipping, accumulation
// ---------------------------------------------------------------------------

describe('applyCharUpgrades guards', () => {
  it('is a no-op for undefined ids', () => {
    const p = makePlayer('knight');
    const before = p.abilities!.basic.damage;
    applyCharUpgrades(p, undefined);
    expect(p.abilities!.basic.damage).toBe(before);
  });

  it('does nothing (and never throws) when the hero has no ability table', () => {
    const p = { classId: 'knight' } as unknown as Player;
    expect(() => applyCharUpgrades(p, ['kn_bulwark'])).not.toThrow();
  });

  it('skips unknown and mismatched-class ids but still applies valid ones, in order', () => {
    // mg_freeze (mage) + bogus are skipped; kn_widecleave lands twice.
    const p = apply('knight', ['kn_widecleave', 'mg_freeze', 'bogus', 'kn_widecleave']);
    const a = p.abilities!;
    expect(a.basic.damage).toBe(22 + 5 + 5); // 32
    expect(a.basic.range).toBe(70 + 14 + 14); // 98
    expect(a.a2.freeze ?? 0).toBe(0); // mage upgrade never touched the knight
  });

  it('skips a hybrid on an excluded class', () => {
    const p = apply('mage', ['hy_pyromancer']); // mage already owns Fireball
    expect(p.abilities!.a2.name).toBe('Frost Nova'); // untouched
  });
});

// ---------------------------------------------------------------------------
// Per-class effect numbers (exact, derived from classes.ts base stats)
// ---------------------------------------------------------------------------

describe('knight upgrades', () => {
  it('kn_bulwark thickens and extends Shield Wall', () => {
    const a = apply('knight', ['kn_bulwark']).abilities!;
    expect(a.a2.buffDefMult!).toBeCloseTo(0.4, 5); // 0.5 * 0.8
    expect(a.a2.buffDuration!).toBeCloseTo(5.5, 5); // 4 + 1.5
  });
  it('kn_concuss lengthens the Shield Bash stun and adds damage', () => {
    const a = apply('knight', ['kn_concuss']).abilities!;
    expect(a.a3.stun!).toBeCloseTo(1.3, 5); // 0.8 + 0.5
    expect(a.a3.damage).toBe(42); // 30 + 12
  });
  it('kn_widecleave widens and sharpens Cleave', () => {
    const a = apply('knight', ['kn_widecleave']).abilities!;
    expect(a.basic.range).toBe(84);
    expect(a.basic.halfAngleDeg).toBe(53);
    expect(a.basic.damage).toBe(27);
  });
  it('kn_bastion hastes Taunt and grants it a shield floor (setMin from unset)', () => {
    const a = apply('knight', ['kn_bastion']).abilities!;
    expect(a.a1.cooldown).toBeCloseTo(9.6, 5); // 12 * 0.8
    expect(a.a1.buffDefMult!).toBeCloseTo(0.7, 5); // was undefined -> set
    expect(a.a1.buffDuration).toBe(4); // +0
  });
  it('kn_bastion twice keeps the shield floor (setMin Math.min branch)', () => {
    const a = apply('knight', ['kn_bastion', 'kn_bastion']).abilities!;
    expect(a.a1.buffDefMult!).toBeCloseTo(0.7, 5); // min(0.7, 0.7)
    expect(a.a1.cooldown).toBeCloseTo(12 * 0.8 * 0.8, 5); // 7.68
  });
  it('kn_secondwind grants regen scaled off max HP (player-only)', () => {
    const p = apply('knight', ['kn_secondwind']);
    expect(p.regenPerSec).toBeCloseTo(3.6, 5); // 240 * 0.015
  });
});

describe('ranger upgrades', () => {
  it('rg_pierce buffs Arrow damage/speed and Multishot damage', () => {
    const a = apply('ranger', ['rg_pierce']).abilities!;
    expect(a.basic.damage).toBe(25);
    expect(a.basic.projSpeed).toBe(790);
    expect(a.a1.damage).toBe(23); // Multishot 19 base + rg_pierce (item 10)
  });
  it('rg_frost chills Arrow and Multishot', () => {
    const a = apply('ranger', ['rg_frost']).abilities!;
    for (const ab of [a.basic, a.a1]) {
      expect(ab.slowMult!).toBeCloseTo(0.6, 5);
      expect(ab.slowDuration!).toBeCloseTo(1.5, 5);
    }
  });
  it('rg_volley fans two extra Multishot arrows', () => {
    const a = apply('ranger', ['rg_volley']).abilities!;
    expect(a.a1.projCount).toBe(5);
    expect(a.a1.spreadDeg).toBe(38);
  });
  it('rg_barbed deepens Rain of Arrows', () => {
    const a = apply('ranger', ['rg_barbed']).abilities!;
    expect(a.a2.zoneTickDamage).toBe(19);
    expect(a.a2.zoneDuration!).toBeCloseTo(4.5, 5);
    expect(a.a2.radius).toBe(135);
  });
  it('rg_fleet upgrades the Roll', () => {
    const a = apply('ranger', ['rg_fleet']).abilities!;
    expect(a.a3.cooldown).toBeCloseTo(3.5, 5); // 5 * 0.7
    expect(a.a3.range).toBe(270);
    expect(a.a3.iframes!).toBeCloseTo(0.45, 5);
  });
});

describe('mage upgrades', () => {
  it('mg_freeze makes Frost Nova freeze solid', () => {
    const a = apply('mage', ['mg_freeze']).abilities!;
    expect(a.a2.freeze!).toBeCloseTo(1.1, 5);
    expect(a.a2.radius).toBe(168);
    expect(a.a2.damage).toBe(28);
  });
  it('mg_quickcast shaves Fireball cast + cooldown', () => {
    const a = apply('mage', ['mg_quickcast']).abilities!;
    expect(a.a1.castTime!).toBeCloseTo(0.42, 5); // 0.7 * 0.6
    expect(a.a1.cooldown).toBeCloseTo(5.95, 5); // 7 * 0.85
  });
  it('mg_combust widens the Fireball blast', () => {
    const a = apply('mage', ['mg_combust']).abilities!;
    expect(a.a1.impactRadius).toBe(145); // 110 + 35
    expect(a.a1.damage).toBe(102); // 80 + 22
  });
  it('mg_arcane pumps Arcane Bolt', () => {
    const a = apply('mage', ['mg_arcane']).abilities!;
    expect(a.basic.damage).toBe(22);
    expect(a.basic.cooldown).toBeCloseTo(0.4095, 5); // 0.45 * 0.91 (toned down, item 25)
  });
  it('mg_blink upgrades Blink', () => {
    const a = apply('mage', ['mg_blink']).abilities!;
    expect(a.a3.range).toBe(320);
    expect(a.a3.cooldown).toBeCloseTo(4.2, 5); // 6 * 0.7
    expect(a.a3.iframes!).toBeCloseTo(0.45, 5); // base 0.2 (item 56) -> +0.25
  });
});

describe('cleric upgrades', () => {
  it('cl_greaterheal boosts Heal', () => {
    const a = apply('cleric', ['cl_greaterheal']).abilities!;
    expect(a.a1.damage).toBe(88);
    expect(a.a1.range).toBe(450);
  });
  it('cl_blessing empowers Blessing', () => {
    const a = apply('cleric', ['cl_blessing']).abilities!;
    expect(a.a3.buffDamageMult!).toBeCloseTo(1.4, 5);
    expect(a.a3.buffDefMult!).toBeCloseTo(0.72, 5); // 0.8 * 0.9
    expect(a.a3.buffDuration).toBe(8);
  });
  it('cl_sanctuary enlarges Sanctuary', () => {
    const a = apply('cleric', ['cl_sanctuary']).abilities!;
    expect(a.a2.zoneTickHeal).toBe(17);
    expect(a.a2.radius).toBe(165);
    expect(a.a2.zoneDuration!).toBeCloseTo(5.5, 5);
  });
  it('cl_smite makes Smite hit + daze', () => {
    const a = apply('cleric', ['cl_smite']).abilities!;
    expect(a.basic.damage).toBe(20);
    expect(a.basic.freeze!).toBeCloseTo(0.5, 5);
  });
  it('cl_warpriest toughens the cleric (player-only)', () => {
    const p = apply('cleric', ['cl_warpriest']);
    expect(p.maxHp).toBe(179); // round(160 * 1.12)
    expect(p.hp).toBe(179);
    expect(p.moveSpeed).toBeCloseTo(216, 5); // 200 * 1.08
  });
});

describe('barbarian upgrades', () => {
  it('bb_endlessrage supercharges Rage', () => {
    const a = apply('barbarian', ['bb_endlessrage']).abilities!;
    expect(a.a1.buffDamageMult!).toBeCloseTo(1.5, 5);
    expect(a.a1.buffMoveMult!).toBeCloseTo(1.3, 5);
    expect(a.a1.cooldown).toBeCloseTo(11.9, 5); // 14 * 0.85
  });
  it('bb_bloodthirst gives Swings + Whirlwind lifesteal', () => {
    const a = apply('barbarian', ['bb_bloodthirst']).abilities!;
    expect(a.basic.lifestealFrac!).toBeCloseTo(0.15, 5);
    expect(a.a3.lifestealFrac!).toBeCloseTo(0.15, 5);
  });
  it('bb_seismic arms the Leap landing', () => {
    const a = apply('barbarian', ['bb_seismic']).abilities!;
    expect(a.a2.landingDamage).toBe(46);
    expect(a.a2.radius).toBe(150);
    expect(a.a2.cooldown).toBeCloseTo(5.95, 5); // 7 * 0.85
  });
  it('bb_brutal widens Swings + Whirlwind', () => {
    const a = apply('barbarian', ['bb_brutal']).abilities!;
    expect(a.basic.damage).toBe(32);
    expect(a.basic.range).toBe(92);
    expect(a.a3.damage).toBe(49); // Whirlwind 40 base + bb_brutal (item 10)
    expect(a.a3.radius).toBe(150);
  });
  it('bb_thickhide toughens the barbarian (player-only)', () => {
    const p = apply('barbarian', ['bb_thickhide']);
    expect(p.maxHp).toBe(235); // round(210 * 1.12)
    expect(p.hp).toBe(235);
    expect(p.damageTakenMult).toBeCloseTo(0.9, 5);
  });
});

describe('rogue upgrades', () => {
  it('ro_assassin sharpens Backstab', () => {
    const a = apply('rogue', ['ro_assassin']).abilities!;
    expect(a.a1.damage).toBe(74); // item 13: Backstab base 50 (crit-leaning) + 24
    expect(a.a1.cooldown).toBeCloseTo(3.9, 5); // 5 * 0.78
  });
  it('ro_poison spreads Poison Vial', () => {
    const a = apply('rogue', ['ro_poison']).abilities!;
    expect(a.a3.zoneTickDamage).toBe(18);
    expect(a.a3.zoneDuration!).toBeCloseTo(5.5, 5);
    expect(a.a3.radius).toBe(123);
  });
  it('ro_vanish upgrades Shadowstep', () => {
    const a = apply('rogue', ['ro_vanish']).abilities!;
    expect(a.a2.cooldown).toBeCloseTo(4.2, 5); // 6 * 0.7
    expect(a.a2.iframes!).toBeCloseTo(0.5, 5); // 0.3 + 0.2
    expect(a.a2.healOnUse!).toBeCloseTo(22, 5); // was undefined -> +22
  });
  it('ro_flurry speeds up Slash', () => {
    const a = apply('rogue', ['ro_flurry']).abilities!;
    expect(a.basic.cooldown).toBeCloseTo(0.3738, 5); // 0.42 * 0.89 (toned down, item 25)
    expect(a.basic.damage).toBe(23);
  });
  it('ro_envenom gives Slash + Backstab lifesteal', () => {
    const a = apply('rogue', ['ro_envenom']).abilities!;
    expect(a.basic.lifestealFrac!).toBeCloseTo(0.12, 5);
    expect(a.a1.lifestealFrac!).toBeCloseTo(0.12, 5);
  });
  it('ro_grand_shadow modernizes Shadow Master into a crit capstone (item 13)', () => {
    const a = apply('rogue', ['ro_grand_shadow']).abilities!;
    expect(a.a2.cooldown).toBeCloseTo(6 * 0.35, 5); // Shadowstep → 2.1s
    // Backstab gains flat AND a crit lean stacking on its base +30% / +0.3×.
    expect(a.a1.damage).toBe(85); // 50 + 35
    expect(a.a1.critChanceBonus!).toBeCloseTo(0.5, 5); // 0.3 base + 0.2
    expect(a.a1.critMultBonus!).toBeCloseTo(0.8, 5); // 0.3 base + 0.5
  });
});

describe('paladin upgrades', () => {
  it('pa_hallowed empowers Consecration', () => {
    const a = apply('paladin', ['pa_hallowed']).abilities!;
    expect(a.a1.zoneTickDamage).toBe(13);
    expect(a.a1.zoneTickHeal).toBe(13);
    expect(a.a1.radius).toBe(172);
    expect(a.a1.zoneDuration!).toBeCloseTo(6.5, 5);
  });
  it('pa_aegis fortifies Divine Shield', () => {
    const a = apply('paladin', ['pa_aegis']).abilities!;
    expect(a.a3.buffDefMult!).toBeCloseTo(0.28, 5); // 0.35 * 0.8
    expect(a.a3.buffDuration).toBe(6);
    expect(a.a3.cooldown).toBeCloseTo(13.6, 5); // 16 * 0.85
  });
  it('pa_mercy boosts Lay on Hands', () => {
    const a = apply('paladin', ['pa_mercy']).abilities!;
    expect(a.a2.damage).toBe(122);
    expect(a.a2.cooldown).toBeCloseTo(5.1, 5); // 6 * 0.85
  });
  it('pa_radiant upgrades Holy Strike', () => {
    const a = apply('paladin', ['pa_radiant']).abilities!;
    expect(a.basic.damage).toBe(29);
    expect(a.basic.freeze!).toBeCloseTo(0.4, 5);
    expect(a.basic.lifestealFrac!).toBeCloseTo(0.1, 5);
  });
  it('pa_zeal speeds move + cooldowns (player-only)', () => {
    const p = apply('paladin', ['pa_zeal']);
    expect(p.moveSpeed).toBeCloseTo(211.68, 5); // 196 * 1.08
    expect(p.cooldownMult).toBeCloseTo(0.9, 5);
  });
});

describe('druid upgrades', () => {
  it('dr_grasp roots + gnaws with Entangle', () => {
    const a = apply('druid', ['dr_grasp']).abilities!;
    expect(a.a1.slowMult!).toBeCloseTo(0.18, 5); // 0.3 * 0.6
    expect(a.a1.zoneTickDamage).toBe(11);
    expect(a.a1.zoneDuration!).toBeCloseTo(5.5, 5);
  });
  it('dr_regrowth boosts Regrowth', () => {
    const a = apply('druid', ['dr_regrowth']).abilities!;
    expect(a.a2.damage).toBe(81);
    expect(a.a2.range).toBe(430);
    expect(a.a2.cooldown).toBeCloseTo(3.4, 5); // 4 * 0.85
  });
  it('dr_gale widens Cyclone', () => {
    const a = apply('druid', ['dr_gale']).abilities!;
    expect(a.a3.radius).toBe(180);
    expect(a.a3.slowMult!).toBeCloseTo(0.35, 5); // 0.5 * 0.7
    expect(a.a3.damage).toBe(32);
  });
  it('dr_thorns splinters Thornlash', () => {
    const a = apply('druid', ['dr_thorns']).abilities!;
    expect(a.basic.projCount).toBe(2);
    expect(a.basic.spreadDeg).toBe(14);
    expect(a.basic.damage).toBe(22);
  });
  it('dr_ward toughens + regen off the boosted max HP (player-only)', () => {
    const p = apply('druid', ['dr_ward']);
    expect(p.maxHp).toBe(157); // round(140 * 1.12)
    expect(p.hp).toBe(157);
    expect(p.regenPerSec).toBeCloseTo(2.355, 5); // 157 * 0.015 (post-boost)
  });
});

// ---------------------------------------------------------------------------
// Hybrid upgrades — grafts (slot replacement) + whole-kit combat styles
// ---------------------------------------------------------------------------

describe('hybrid grafts replace a slot with a foreign ability', () => {
  it("hy_pyromancer drops the Mage's Fireball into A2", () => {
    const p = apply('knight', ['hy_pyromancer']);
    const a2 = p.abilities!.a2;
    expect(a2.name).toBe('Fireball');
    expect(a2.kind).toBe('projectile');
    expect(a2.damage).toBe(80);
    expect(a2.castTime!).toBeCloseTo(0.7, 5);
    expect(a2.impactRadius).toBe(110);
    expect(a2.slot).toBe('a2'); // re-labelled to the graft slot
    // The graft is a private copy — the shared Mage table is untouched.
    expect(a2).not.toBe(CLASSES.mage.abilities.a1);
    expect(CLASSES.mage.abilities.a1.slot).toBe('a1');
  });

  it("hy_shadowpact drops the Rogue's Shadowstep into A3", () => {
    const a = apply('knight', ['hy_shadowpact']).abilities!;
    expect(a.a3.name).toBe('Shadowstep');
    expect(a.a3.kind).toBe('blink');
    expect(a.a3.range).toBe(240);
    expect(a.a3.iframes!).toBeCloseTo(0.3, 5);
    expect(a.a3.slot).toBe('a3');
  });

  it("hy_warhowl drops the Barbarian's Rage into A1", () => {
    const a = apply('knight', ['hy_warhowl']).abilities!;
    expect(a.a1.name).toBe('Rage');
    expect(a.a1.kind).toBe('selfBuff');
    expect(a.a1.buffDamageMult!).toBeCloseTo(1.35, 5);
    expect(a.a1.buffMoveMult!).toBeCloseTo(1.2, 5);
    expect(a.a1.slot).toBe('a1');
  });

  it('hy_fieldmedic grafts a weakened, slower Heal (tweak) into A2', () => {
    const a = apply('knight', ['hy_fieldmedic']).abilities!;
    expect(a.a2.name).toBe('Field Dressing');
    expect(a.a2.kind).toBe('heal');
    expect(a.a2.damage).toBe(45); // round(60 * 0.75)
    expect(a.a2.cooldown).toBe(5); // 3 + 2
    expect(a.a2.range).toBe(400);
    // Source Heal stays pristine (tweak mutated the copy only).
    expect(CLASSES.cleric.abilities.a1.damage).toBe(60);
    expect(CLASSES.cleric.abilities.a1.name).toBe('Heal');
  });

  // item 66: grafts donated by the expansion classes (bard/monk/warlock).
  it("hy_hexbrand drops the Warlock's Hex zone into A3", () => {
    const a = apply('knight', ['hy_hexbrand']).abilities!;
    expect(a.a3.name).toBe('Hex');
    expect(a.a3.kind).toBe('groundZone');
    expect(a.a3.zoneTickDamage).toBe(12);
    expect(a.a3.radius).toBe(120);
    expect(a.a3.slot).toBe('a3');
    expect(CLASSES.warlock.abilities.a1.slot).toBe('a1'); // source untouched
  });

  it("hy_windstep drops the Monk's Step of the Wind dash into A3", () => {
    const a = apply('knight', ['hy_windstep']).abilities!;
    expect(a.a3.name).toBe('Step of the Wind');
    expect(a.a3.kind).toBe('dash');
    expect(a.a3.iframes!).toBeCloseTo(0.3, 5);
    expect(a.a3.healOnUse).toBe(18);
    expect(a.a3.slot).toBe('a3');
  });

  it("hy_inspire drops the Bard's Inspiration ally-buff into A1", () => {
    const a = apply('knight', ['hy_inspire']).abilities!;
    expect(a.a1.name).toBe('Inspiration');
    expect(a.a1.kind).toBe('buffAlly');
    expect(a.a1.buffDamageMult!).toBeCloseTo(1.2, 5);
    expect(a.a1.range).toBe(420);
    expect(a.a1.slot).toBe('a1');
  });

  it('the new grafts span the expansion wave and each carries two graft-grands', () => {
    // Donor classes now include bard/monk/warlock, not just the v1 four.
    const donors = new Set(
      HYBRID_UPGRADES.filter((h) => h.graftSource).map((h) => h.graftSource!.classId),
    );
    for (const c of ['warlock', 'monk', 'bard'] as const) expect(donors.has(c)).toBe(true);
  });
});

describe('the expansion graft-grands transform their grafted skill (item 66)', () => {
  it('hy_hexbrand grands fester and prolong the grafted Hex', () => {
    const blight = apply('knight', ['hy_hexbrand', 'hy_hexbrand_g_a']).abilities!.a3;
    expect(blight.zoneTickDamage).toBe(22); // 12 + 10
    expect(blight.radius).toBe(170); // 120 + 50
    const curse = apply('knight', ['hy_hexbrand', 'hy_hexbrand_g_b']).abilities!.a3;
    expect(curse.zoneDuration).toBe(9); // 5 + 4
    expect(curse.slowMult!).toBeCloseTo(0.5, 5); // snared harder (min of 0.7, 0.5)
    expect(curse.cooldown).toBeCloseTo(6.6, 5); // 11 * 0.6
  });

  it('hy_windstep grands sharpen the grafted dash', () => {
    const cyclone = apply('knight', ['hy_windstep', 'hy_windstep_g_a']).abilities!.a3;
    expect(cyclone.cooldown).toBeCloseTo(2, 5); // 5 * 0.4
    expect(cyclone.iframes!).toBeCloseTo(0.7, 5); // 0.3 + 0.4
    expect(cyclone.range).toBe(370); // 250 + 120
    const gale = apply('knight', ['hy_windstep', 'hy_windstep_g_b']).abilities!.a3;
    expect(gale.healOnUse).toBe(58); // 18 + 40
    expect(gale.iframes!).toBeCloseTo(0.5, 5); // 0.3 + 0.2
  });

  it('hy_inspire grands deepen the grafted ally-buff', () => {
    const chorus = apply('knight', ['hy_inspire', 'hy_inspire_g_a']).abilities!.a1;
    expect(chorus.buffDamageMult!).toBeCloseTo(1.45, 5); // 1.2 + 0.25
    expect(chorus.buffDuration).toBe(10); // 6 + 4
    expect(chorus.cooldown).toBeCloseTo(8.4, 5); // 12 * 0.7
    const hymn = apply('knight', ['hy_inspire', 'hy_inspire_g_b']).abilities!.a1;
    expect(hymn.buffDefMult!).toBeCloseTo(0.6, 5); // min of 0.85, 0.6
    expect(hymn.range).toBe(580); // 420 + 160
    expect(hymn.buffDuration).toBe(9); // 6 + 3
  });
});

// ---------------------------------------------------------------------------
// GRAFT grands (item 18) — two radical capstones per skill-replacing graft, each
// transforming the grafted FOREIGN skill. A knight can hold all four grafts (none
// excludes it), so it is the host for the apply-correctness sweep.
// ---------------------------------------------------------------------------

describe('graft grands transform the grafted skill, and only with the graft held (item 18)', () => {
  /** The graft each grand belongs to, and the slot that graft occupies. */
  const graftOf = (grandId: string) => {
    const grand = CHAR_UPGRADES[grandId];
    const graft = HYBRID_UPGRADES.find((h) => h.id === grand.graftId)!;
    return { graftId: graft.id, slot: graft.replaces! };
  };

  it('there are two graft grands for each of the seven skill-replacing grafts', () => {
    expect(GRAFT_GRANDS).toHaveLength(14);
  });

  for (const def of GRAFT_GRANDS) {
    it(`${def.id} retunes the grafted skill when the graft is held`, () => {
      const { graftId, slot } = graftOf(def.id);
      const withGraft = apply('knight', [graftId]).abilities![slot];
      const withGrand = apply('knight', [graftId, def.id]).abilities![slot];
      // The grand measurably changed the grafted skill (same skill, new numbers).
      expect(withGrand.name).toBe(withGraft.name);
      expect(JSON.stringify(withGrand)).not.toBe(JSON.stringify(withGraft));
    });

    it(`${def.id} is a no-op when the hero never took the graft`, () => {
      const { slot } = graftOf(def.id);
      // Applied without the graft, the grand touches nothing — the native kit is
      // byte-identical to a hero who took no upgrades at all.
      const pristine = apply('knight', []).abilities!;
      const withGrandOnly = apply('knight', [def.id]).abilities!;
      expect(JSON.stringify(withGrandOnly)).toBe(JSON.stringify(pristine));
      // and in particular the native skill in the graft's slot is untouched.
      expect(withGrandOnly[slot].name).toBe(CLASSES.knight.abilities[slot].name);
    });
  }

  it('Living Cataclysm swells the grafted Fireball by exact amounts', () => {
    const fb = CLASSES.mage.abilities.a1; // dmg 80, impactRadius 110
    const a2 = apply('knight', ['hy_pyromancer', 'hy_pyromancer_g_a']).abilities!.a2;
    expect(a2.name).toBe('Fireball');
    expect(a2.damage).toBe((fb.damage ?? 0) + 60);
    expect(a2.impactRadius).toBe((fb.impactRadius ?? 0) + 80);
  });

  it('Chain Ignition makes the grafted Fireball fast and freezing', () => {
    const fb = CLASSES.mage.abilities.a1; // castTime 0.7, cooldown 7
    const a2 = apply('knight', ['hy_pyromancer', 'hy_pyromancer_g_b']).abilities!.a2;
    expect(a2.castTime!).toBeCloseTo((fb.castTime ?? 0) * 0.35, 5);
    expect(a2.cooldown).toBeCloseTo(fb.cooldown * 0.5, 5);
    expect(a2.freeze!).toBeCloseTo(0.9, 5); // projectiles the sim can freeze
  });

  it('Umbral Reservoir teaches the grafted Shadowstep to heal and reach', () => {
    const step = CLASSES.rogue.abilities.a2; // range 240, iframes 0.3, no healOnUse
    const a3 = apply('knight', ['hy_shadowpact', 'hy_shadowpact_g_b']).abilities!.a3;
    expect(a3.name).toBe('Shadowstep');
    expect(a3.range).toBe((step.range ?? 0) + 160);
    expect(a3.healOnUse).toBe(45); // gained from nothing (absent field → +45)
    expect(a3.iframes!).toBeCloseTo((step.iframes ?? 0) + 0.25, 5);
  });

  it('Undying Fury grants the grafted Rage brand-new mitigation', () => {
    const rage = CLASSES.barbarian.abilities.a1; // no buffDefMult, cooldown 14
    expect(rage.buffDefMult).toBeUndefined();
    const a1 = apply('knight', ['hy_warhowl', 'hy_warhowl_g_b']).abilities!.a1;
    expect(a1.buffDefMult!).toBeCloseTo(0.55, 5); // −45% damage taken while raging
    expect(a1.cooldown).toBeCloseTo(rage.cooldown * 0.65, 5);
  });

  it('Battlefield Surgeon turns the grafted Field Dressing into a real mend', () => {
    // Field Dressing is the tweaked Heal (dmg 45, range 400).
    const a2 = apply('knight', ['hy_fieldmedic', 'hy_fieldmedic_g_a']).abilities!.a2;
    expect(a2.name).toBe('Field Dressing');
    expect(a2.damage).toBe(45 + 75);
    expect(a2.range).toBe(400 + 150);
  });

  it('accrues onto the graft itself — a reclaim never lets it touch the native skill', () => {
    // Take the graft, grand it, then reclaim the native a2 (Shield Wall). The grand
    // must NOT bleed onto the reclaimed native — it belongs to the stashed Fireball.
    const reclaimed = apply('knight', ['hy_pyromancer', 'hy_pyromancer_g_a', 'restore:a2'])
      .abilities!.a2;
    expect(reclaimed.name).toBe('Shield Wall'); // native back
    expect(JSON.stringify(reclaimed)).toBe(JSON.stringify(CLASSES.knight.abilities.a2)); // pristine
    // Re-graft: the stashed Fireball returns with the grand still baked in.
    const regrafted = apply('knight', [
      'hy_pyromancer',
      'hy_pyromancer_g_a',
      'restore:a2',
      'hy_pyromancer',
    ]).abilities!.a2;
    expect(regrafted.name).toBe('Fireball');
    expect(regrafted.damage).toBe(80 + 60); // grand persisted across the round-trip
  });
});

describe('hybrid combat styles', () => {
  it('hy_vampiric feeds only damaging strikes/shots and trims max HP (knight)', () => {
    const p = apply('knight', ['hy_vampiric']);
    const a = p.abilities!;
    expect(a.basic.lifestealFrac!).toBeCloseTo(0.1, 5); // Cleave (meleeCone)
    expect(a.a3.lifestealFrac!).toBeCloseTo(0.1, 5); // Shield Bash (meleeCone)
    expect(a.a1.lifestealFrac).toBeUndefined(); // Taunt deals no damage
    expect(a.a2.lifestealFrac).toBeUndefined(); // Shield Wall deals no damage
    expect(p.maxHp).toBe(216); // round(240 * 0.9)
    expect(p.hp).toBe(216); // clamped down to new max
  });

  it('hy_vampiric drinks through projectile + pbaoe but not blink (mage)', () => {
    const p = apply('mage', ['hy_vampiric']);
    const a = p.abilities!;
    expect(a.basic.lifestealFrac!).toBeCloseTo(0.1, 5); // Arcane Bolt (projectile)
    expect(a.a1.lifestealFrac!).toBeCloseTo(0.1, 5); // Fireball (projectile)
    expect(a.a2.lifestealFrac!).toBeCloseTo(0.1, 5); // Frost Nova (pbaoe, dmg 20)
    expect(a.a3.lifestealFrac).toBeUndefined(); // Blink deals no damage
    expect(p.maxHp).toBe(90); // round(100 * 0.9)
  });

  it('hy_frostbrand chills every damaging non-heal ability, sparing heals (cleric)', () => {
    const a = apply('cleric', ['hy_frostbrand']).abilities!;
    expect(a.basic.slowMult!).toBeCloseTo(0.72, 5); // Smite (projectile) chills
    expect(a.basic.slowDuration!).toBeCloseTo(1.4, 5);
    expect(a.a1.slowMult).toBeUndefined(); // Heal is spared despite dealing "damage"
    expect(a.a2.slowMult).toBeUndefined(); // Sanctuary deals no damage
    expect(a.a3.slowMult).toBeUndefined(); // Blessing deals no damage
  });

  it('hy_frostbrand chills a melee kit too (knight)', () => {
    const a = apply('knight', ['hy_frostbrand']).abilities!;
    expect(a.basic.slowMult!).toBeCloseTo(0.72, 5);
    expect(a.a3.slowMult!).toBeCloseTo(0.72, 5);
    expect(a.a1.slowMult).toBeUndefined();
  });

  it('hy_stormsplit forks a melee basic into a wider, heavier swing (knight)', () => {
    const a = apply('knight', ['hy_stormsplit']).abilities!;
    expect(a.basic.halfAngleDeg).toBe(57); // 45 + 12
    expect(a.basic.range).toBe(82); // 70 + 12
    expect(a.basic.damage).toBe(26); // 22 + 4
  });

  it('hy_stormsplit forks a projectile basic into an extra shot (ranger)', () => {
    const a = apply('ranger', ['hy_stormsplit']).abilities!;
    expect(a.basic.projCount).toBe(2); // 1 + 1
    expect(a.basic.spreadDeg).toBe(12); // was undefined -> max(0, 12)
  });

  it('hy_juggernaut trades speed for bulk (player-only)', () => {
    const p = apply('knight', ['hy_juggernaut']);
    expect(p.maxHp).toBe(300); // round(240 * 1.25)
    expect(p.hp).toBe(300);
    expect(p.damageTakenMult).toBeCloseTo(0.92, 5);
    expect(p.moveSpeed).toBeCloseTo(176.7, 5); // 190 * 0.93
  });

  it('hy_glasscannon trades toughness for damage (player-only)', () => {
    const p = apply('knight', ['hy_glasscannon']);
    expect(p.damageMult).toBeCloseTo(1.25, 5);
    expect(p.damageTakenMult).toBeCloseTo(1.18, 5);
    // Purely a stat style — the ability table is left alone.
    expect(p.abilities!.basic.damage).toBe(22);
  });
});

// ---------------------------------------------------------------------------
// previewAbilityTable — HUD preview without a live World
// ---------------------------------------------------------------------------

describe('previewAbilityTable', () => {
  it('returns a fresh clone, never the shared class table', () => {
    const preview = previewAbilityTable('mage', []);
    expect(preview).not.toBe(CLASSES.mage.abilities);
    expect(preview.a2).not.toBe(CLASSES.mage.abilities.a2);
    expect(preview.a2.name).toBe('Frost Nova'); // faithful copy
  });

  it('reflects a class upgrade in the previewed numbers', () => {
    const preview = previewAbilityTable('mage', ['mg_freeze']);
    expect(preview.a2.freeze!).toBeCloseTo(1.1, 5);
  });

  it('follows a hybrid graft so the HUD shows the new ability name', () => {
    expect(previewAbilityTable('knight', ['hy_pyromancer']).a2.name).toBe('Fireball');
    expect(previewAbilityTable('ranger', ['hy_shadowpact']).a3.name).toBe('Shadowstep');
  });

  it('ignores mismatched class upgrades and excluded hybrids', () => {
    // Mage upgrade previewed on a knight: A2 stays Shield Wall.
    const k = previewAbilityTable('knight', ['mg_freeze']);
    expect(k.a2.name).toBe('Shield Wall');
    expect(k.a2.freeze ?? 0).toBe(0);
    // Pyromancer previewed on a mage (excluded): A2 stays Frost Nova.
    expect(previewAbilityTable('mage', ['hy_pyromancer']).a2.name).toBe('Frost Nova');
  });

  it('tolerates unknown ids without throwing', () => {
    const preview = previewAbilityTable('knight', ['bogus']);
    expect(preview.basic.name).toBe('Cleave');
  });

  it('runs stat-flavoured upgrades against a throwaway stub (table unchanged)', () => {
    // These touch the stub player, not the abilities — must not throw and must
    // leave the previewed table intact.
    const secondWind = previewAbilityTable('knight', ['kn_secondwind']);
    expect(secondWind.basic.name).toBe('Cleave');
    const glass = previewAbilityTable('knight', ['hy_glasscannon']);
    expect(glass.basic.damage).toBe(22);
  });

  it('applies an ordered mix of graft + class upgrade', () => {
    const preview = previewAbilityTable('knight', ['hy_pyromancer', 'kn_widecleave']);
    expect(preview.a2.name).toBe('Fireball'); // graft
    expect(preview.basic.damage).toBe(27); // 22 + 5
  });
});

// ---------------------------------------------------------------------------
// rollCharChoices + HYBRID_OFFER_CHANCE
// ---------------------------------------------------------------------------

describe('rollCharChoices', () => {
  it('exposes the documented hybrid-swap chance', () => {
    expect(HYBRID_OFFER_CHANCE).toBeCloseTo(0.45, 5);
  });

  // item: reroll — the exclude-bias steers the base draw away from the shown ids so a
  // re-roll surfaces different boons (an empty exclude reproduces the seeded draw). n=2
  // keeps the fresh pool (5 knight boons − 2 shown = 3) able to fill without degrading.
  it('biases the char draw away from excluded ids (reroll)', () => {
    const base = rollCharChoices('knight', 2, seq([0, 0, 0.9, 0.9, 0.9]));
    expect(base).toEqual(['kn_bulwark', 'kn_concuss']);
    // Excluding the shown ids (7th arg) shifts the head-of-pool draw to the NEXT boons.
    const rerolled = rollCharChoices('knight', 2, seq([0, 0, 0.9, 0.9, 0.9]), [], [], [], base);
    expect(rerolled.some((id) => base.includes(id))).toBe(false);
    expect(rerolled).toHaveLength(2);
    // An empty exclude is byte-for-byte the un-excluded draw.
    expect(rollCharChoices('knight', 2, seq([0, 0, 0.9, 0.9, 0.9]), [], [], [], [])).toEqual(base);
  });

  it('the reroll exclude degrades gracefully when it would starve the pool', () => {
    // Exclude the WHOLE knight base pool → the fresh pool is empty, so the excluded ids
    // come back and the roll still fills n (never returns short just because of a reroll).
    const whole = rollCharChoices('knight', 5, seq([0, 0, 0, 0, 0, 0.9, 0.9]));
    const out = rollCharChoices('knight', 3, seq([0, 0, 0, 0.9, 0.9]), [], [], [], whole);
    expect(out).toHaveLength(3);
  });

  it('offers n distinct picks, capped at the pool size', () => {
    // rng 0 => always index 0 of the shrinking pool => pool order; 0.9 => no hybrid
    // and (final draw) no grand swap.
    expect(rollCharChoices('knight', 3, seq([0, 0, 0, 0.9, 0.9]))).toEqual([
      'kn_bulwark',
      'kn_concuss',
      'kn_widecleave',
    ]);
    // n beyond the 5-strong base pool degrades gracefully (items 12 & 14): the base
    // pool comes first, in order, then the remaining slots top up from the RARE
    // cross-class hybrids (no reoffers for a graft-less hero), so the offer is never
    // short while eligible upgrades remain.
    const wide = rollCharChoices('knight', 10, seq([0, 0, 0, 0, 0, 0.9, 0.9]));
    expect(wide.slice(0, 5)).toEqual([
      'kn_bulwark',
      'kn_concuss',
      'kn_widecleave',
      'kn_bastion',
      'kn_secondwind',
    ]);
    expect(new Set(wide).size).toBe(wide.length); // still distinct
    for (const id of wide.slice(5)) {
      expect(CHAR_UPGRADES[id].classId).toBe('any'); // the fill is cross-class hybrids
      expect(upgradeAllowedFor(CHAR_UPGRADES[id], 'knight')).toBe(true);
    }
  });

  it('returns nothing for n <= 0 (and never reaches the hybrid swap)', () => {
    expect(rollCharChoices('knight', 0, seq([0.1]))).toEqual([]);
  });

  it('yields no offers for an unrecognised class (empty pool fallback)', () => {
    expect(rollCharChoices('nope' as ClassId, 3, seq([0.1, 0.1]))).toEqual([]);
  });

  it('never repeats a class upgrade within one offer set', () => {
    const offers = rollCharChoices('mage', 5, seq([0.1, 0.9, 0.3, 0.7, 0.5, 0.99]));
    expect(offers).toHaveLength(5);
    expect(new Set(offers).size).toBe(5);
    for (const id of offers) expect(CHAR_UPGRADES[id].classId).toBe('mage');
  });

  it('swaps the last pick for a hybrid when the roll crosses the threshold', () => {
    // picks: index 0 x3 -> [kn_bulwark, kn_concuss, kn_widecleave];
    // 0.1 < 0.45 triggers the swap; hybrid index 0 -> first knight-eligible hybrid.
    const offers = rollCharChoices('knight', 3, seq([0, 0, 0, 0.1, 0, 0.9]));
    expect(offers.slice(0, 2)).toEqual(['kn_bulwark', 'kn_concuss']);
    expect(offers[2]).toBe('hy_pyromancer');
    expect(CHAR_UPGRADES[offers[2]].classId).toBe('any');
  });

  it('does NOT swap at exactly the threshold (strict < boundary)', () => {
    const offers = rollCharChoices('knight', 3, seq([0, 0, 0, 0.45, 0]));
    expect(offers[2]).toBe('kn_widecleave'); // unchanged
  });

  it('only ever offers a hybrid the class is eligible for', () => {
    // Mage excludes Pyromancer + Shadowpact, so its first eligible hybrid is Warhowl.
    const offers = rollCharChoices('mage', 3, seq([0, 0, 0, 0.1, 0]));
    expect(offers[2]).toBe('hy_warhowl');
    expect(offers).not.toContain('hy_pyromancer');
    expect(offers).not.toContain('hy_shadowpact');
    expect(upgradeAllowedFor(CHAR_UPGRADES[offers[2]], 'mage')).toBe(true);
  });

  it('does not mutate the shared class pool', () => {
    rollCharChoices('knight', 5, seq([0, 0, 0, 0, 0, 0]));
    expect(CHAR_UPGRADES_BY_CLASS.knight).toHaveLength(5);
  });

  it('offers a valid, class-eligible set for every class (no-hybrid stream)', () => {
    for (const classId of CLASS_IDS) {
      // trailing 0.99 also suppresses the grand-improvement swap.
      const offers = rollCharChoices(classId, 3, seq([0, 0, 0, 0.99, 0.99]));
      expect(offers).toHaveLength(3);
      const poolIds = new Set(CHAR_UPGRADES_BY_CLASS[classId].map((d) => d.id));
      for (const id of offers) expect(poolIds.has(id)).toBe(true);
    }
  });

  it('upholds its invariants across a random sweep (all classes)', () => {
    for (const classId of CLASS_IDS) {
      const rng = lcg(0xc0ffee ^ classId.length);
      let sawHybrid = false;
      for (let t = 0; t < 60; t++) {
        const offers = rollCharChoices(classId, 3, rng);
        expect(offers).toHaveLength(3);
        expect(new Set(offers).size).toBe(3); // distinct
        const hybrids = offers.filter((id) => CHAR_UPGRADES[id].classId === 'any');
        expect(hybrids.length).toBeLessThanOrEqual(1); // at most one hybrid
        if (hybrids.length === 1) sawHybrid = true;
        for (const id of offers) {
          const def = CHAR_UPGRADES[id];
          expect(def).toBeTruthy();
          expect(upgradeAllowedFor(def, classId)).toBe(true); // never an illegal offer
        }
      }
      expect(sawHybrid).toBe(true); // the ~45% swap does fire over 60 rolls
    }
  });
});

describe('rollCharChoices — multiclass weighting + fill-to-max (item 8)', () => {
  it('spans every owned class, weighted toward the main class', () => {
    const extras: ClassId[] = ['mage', 'cleric'];
    const idsOf = (c: ClassId): Set<string> => new Set(CHAR_UPGRADES_BY_CLASS[c].map((d) => d.id));
    const mainIds = idsOf('knight');
    const mageIds = idsOf('mage');
    const clericIds = idsOf('cleric');
    let main = 0;
    let extra = 0;
    let sawMage = false;
    let sawCleric = false;
    const rng = lcg(0x51ee7);
    for (let t = 0; t < 400; t++) {
      for (const id of rollCharChoices('knight', 4, rng, [], extras, [])) {
        if (mainIds.has(id)) main++;
        else if (mageIds.has(id)) {
          extra++;
          sawMage = true;
        } else if (clericIds.has(id)) {
          extra++;
          sawCleric = true;
        }
      }
    }
    expect(sawMage).toBe(true); // extra-class boons DO surface (item 8: all classes)
    expect(sawCleric).toBe(true);
    expect(main).toBeGreaterThan(extra); // …but the main class is weighted heavier
  });

  it('fills to the max option count while any eligible upgrade remains', () => {
    // Own all-but-one knight boon at cap: the native pool is nearly dry, but the
    // top-up from hybrids/reoffers still fills the offer to the max (item 8) — across
    // any rng, so a near-exhausted single-class hero is never left with a short list.
    const nearlyAll = CHAR_UPGRADES_BY_CLASS.knight
      .slice(0, -1)
      .flatMap((d) => Array<string>(charUpgradeMaxStacks(d.id)).fill(d.id));
    for (const s of [lcg(1), lcg(2), lcg(0xbeef)]) {
      expect(rollCharChoices('knight', 4, s, nearlyAll)).toHaveLength(4);
    }
  });

  it('a multiclass hero fills to max spanning classes even when the main pool is thin', () => {
    // Main (knight) pool fully capped, but two extra classes keep the offer full.
    const cappedKnight = CHAR_UPGRADES_BY_CLASS.knight.flatMap((d) =>
      Array<string>(charUpgradeMaxStacks(d.id)).fill(d.id),
    );
    const offers = rollCharChoices('knight', 4, lcg(9), cappedKnight, ['mage', 'cleric'], []);
    expect(offers).toHaveLength(4);
    // Every pick is a live, class-eligible id (from an owned class or a hybrid).
    for (const id of offers) expect(CHAR_UPGRADES[id]).toBeTruthy();
  });
});

describe('rollCharChoices — grafted-over EXTRA class drops its dead boons (#69)', () => {
  // `hy_warhowl` grafts the Barbarian's Rage over slot a1 on WHICHEVER class it is
  // replayed on. For a hero whose EXTRA multiclass is ranger, that displaces the
  // ranger's a1 (Multishot), so a ranger boon that only upgrades a1 can no longer land
  // on a live skill — it must drop from the offer pool, exactly like a grafted-over
  // MAIN-class boon already does. Before the fix the item-26 filter ran for the main
  // class only, so a displaced extra class still offered its dead boons.
  const GRAFT = 'hy_warhowl'; // replaces: 'a1'

  // Union of every id offered to a knight/ranger multiclass hero across a deterministic
  // sweep. n=5 so a single roll can surface several distinct ranger boons per iteration.
  const offeredSweep = (owned: string[]): Set<string> => {
    const seen = new Set<string>();
    const rng = lcg(0x9017e);
    for (let t = 0; t < 600; t++) {
      for (const id of rollCharChoices('knight', 5, rng, owned, ['ranger'], [])) seen.add(id);
    }
    return seen;
  };

  it('never offers an extra-class boon that only upgrades the grafted-over slot', () => {
    // rg_volley touches a1 alone (BOON_SLOTS = ['a1']); with a1 grafted it is dead.
    expect(offeredSweep([GRAFT]).has('rg_volley')).toBe(false);
  });

  it('positive control: without the graft that same extra-class boon IS offered', () => {
    // Proves the drop above is caused by the graft, not by the boon being unreachable.
    expect(offeredSweep([]).has('rg_volley')).toBe(true);
  });

  it('still offers an extra-class boon that also touches a LIVE slot (precise, not blanket)', () => {
    // rg_frost upgrades basic AND a1; basic stays native, so the boon survives — the
    // filter drops a boon only when EVERY native slot it touches has been grafted over.
    expect(offeredSweep([GRAFT]).has('rg_frost')).toBe(true);
  });
});

describe('grand improvements — never in the between-boss pool (item 20)', () => {
  it('the roll never surfaces a grand, whatever the rng', () => {
    // Grands are reserved for the run-clear special reward; the between-boss shop
    // only ever draws real class boons (± a hybrid).
    for (const s of [
      seq([0, 0, 0, 0.99, 0.01]),
      seq([0.01, 0.01, 0.01, 0.01, 0.01]),
      seq([0.5, 0.5, 0.5, 0, 0]),
    ]) {
      const offers = rollCharChoices('knight', 3, s);
      for (const id of offers) expect(CHAR_UPGRADES[id].grand).not.toBe(true);
    }
  });

  it('a full random sweep never yields a grand for any class', () => {
    for (const classId of CLASS_IDS) {
      const rng = lcg(0x9e3779b9 ^ classId.length);
      for (let t = 0; t < 80; t++) {
        for (const id of rollCharChoices(classId, 4, rng)) {
          expect(CHAR_UPGRADES[id]?.grand).not.toBe(true);
        }
      }
    }
  });

  it('a grand improvement applies its transformation and is capped at one stack', () => {
    const p = makePlayer('knight');
    const before = p.damageTakenMult;
    applyCharUpgrades(p, ['kn_grand_immovable']);
    expect(p.damageTakenMult).toBeLessThan(before); // −25% damage taken
    expect(CHAR_UPGRADES.kn_grand_immovable.maxStacks).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Defensive fallbacks — the `?? default` guards inside effect functions fire
// only for ability shapes the real class data never produces (a slow-less
// snare, a projectile with no projCount, a melee basic with no arc/range). We
// exercise them by calling an effect's `apply` directly against a synthetic
// table, so the guards are proven rather than left as dead branches.
// ---------------------------------------------------------------------------

describe('effect fallbacks for absent optional fields', () => {
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
  const stub = makePlayer('knight');

  it('dr_grasp treats a slow-less Entangle as unslowed (slowMult ?? 1)', () => {
    const a = table({ a1: ab('a1', 'groundZone', 0) }); // no slowMult
    CHAR_UPGRADES.dr_grasp.apply({ player: stub, abilities: a });
    expect(a.a1.slowMult!).toBeCloseTo(0.6, 5); // (undefined ?? 1) * 0.6
  });

  it('dr_gale treats a slow-less Cyclone as unslowed (slowMult ?? 1)', () => {
    const a = table({ a3: ab('a3', 'pbaoe', 10) }); // no slowMult
    CHAR_UPGRADES.dr_gale.apply({ player: stub, abilities: a });
    expect(a.a3.slowMult!).toBeCloseTo(0.7, 5); // (undefined ?? 1) * 0.7
  });

  it('hy_stormsplit defaults a projectile with no projCount (projCount ?? 1)', () => {
    const a = table({ basic: ab('basic', 'projectile', 10, { spreadDeg: 5 }) }); // no projCount
    CHAR_UPGRADES.hy_stormsplit.apply({ player: stub, abilities: a });
    expect(a.basic.projCount).toBe(2); // (undefined ?? 1) + 1
    expect(a.basic.spreadDeg).toBe(12); // max(5, 12)
  });

  it('hy_stormsplit defaults a melee basic with no arc/range (?? 45 / ?? 70)', () => {
    const a = table(); // default basic: meleeCone, no halfAngleDeg / range
    CHAR_UPGRADES.hy_stormsplit.apply({ player: stub, abilities: a });
    expect(a.basic.halfAngleDeg).toBe(57); // (undefined ?? 45) + 12
    expect(a.basic.range).toBe(82); // (undefined ?? 70) + 12
    expect(a.basic.damage).toBe(14); // 10 + 4
  });

  it('mul() treats an absent target field as 0 (mg_quickcast on a cast-less A1)', () => {
    const a = table({ a1: ab('a1', 'projectile', 70) }); // cooldown 1, but no castTime
    CHAR_UPGRADES.mg_quickcast.apply({ player: stub, abilities: a });
    expect(a.a1.castTime).toBe(0); // (undefined ?? 0) * 0.6
    expect(a.a1.cooldown).toBeCloseTo(0.85, 5); // 1 * 0.85
  });

  // Grand-capstone tunes read optional buff/snare fields the real kits fill in, so
  // their `?? default` arms only fire against a field-less ability. Apply each grand
  // straight onto a synthetic slot to prove the guard rather than leave it dead.
  it('so_gk_a2_a defaults a move-buff-less Mirror Image (buffMoveMult ?? 1)', () => {
    const a = table({ a2: ab('a2', 'selfBuff', 0) }); // no buffMoveMult
    CHAR_UPGRADES.so_gk_a2_a.apply({ player: stub, abilities: a });
    expect(a.a2.buffMoveMult).toBeCloseTo(1.35, 5); // max(undefined ?? 1, 1.35)
  });

  it('so_gk_a2_b defaults a move-buff-less Mirror Image (buffMoveMult ?? 1)', () => {
    const a = table({ a2: ab('a2', 'selfBuff', 0) });
    CHAR_UPGRADES.so_gk_a2_b.apply({ player: stub, abilities: a });
    expect(a.a2.buffMoveMult).toBeCloseTo(1.3, 5);
  });

  it('wa_gk_a1_b defaults a duration-less Hex (slowDuration ?? 0)', () => {
    const a = table({ a1: ab('a1', 'groundZone', 0) }); // no slowDuration
    CHAR_UPGRADES.wa_gk_a1_b.apply({ player: stub, abilities: a });
    expect(a.a1.slowDuration).toBeCloseTo(1.5, 5); // max(undefined ?? 0, 1.5)
  });

  it('amplify() seeds iframes on an iframe-less dash sub-skill (iframes ?? 0)', () => {
    const dash = ab('a1', 'dash', 0); // dash, no iframes
    CHAR_UPGRADES.kn_champion_g_a.apply({
      player: stub,
      abilities: table(),
      subAbilities: { sub1: dash },
    });
    expect(dash.iframes).toBeCloseTo(0.15, 5); // round(((undefined ?? 0) + 0.15) * 100) / 100
  });

  it('slowRider() chills a damage-less hazard via its tick damage (damage ?? 0 → OR second operand)', () => {
    // A pure hazard: no `damage` field at all, only per-tick damage — so `(ab.damage ?? 0)`
    // takes its 0 fallback, the first `> 0` is false, and the OR falls through to the tick.
    const zone = ab('a1', 'groundZone', undefined as unknown as number, { zoneTickDamage: 15 });
    CHAR_UPGRADES.kn_battlemaster_g_a.apply({
      player: stub,
      abilities: table(),
      subAbilities: { sub1: zone },
    });
    expect(zone.slowMult).toBeCloseTo(0.45, 5);
  });
});

describe('applySubclassGrands: absent-field guards', () => {
  const champSub = (): PlayerAbilityDef => ({
    slot: 'a1',
    name: 'Champion Slam',
    kind: 'meleeCone',
    cooldown: 5,
    damage: 30,
  });

  it('no-ops when the hero has sub-abilities but no recorded subSkillIds (subSkillIds ?? [])', () => {
    const p = makePlayer('knight');
    p.subAbilities = { sub1: champSub() };
    p.subSkillIds = undefined; // the slot→subclass map cannot be built…
    const before = p.subAbilities.sub1!.damage;
    applySubclassGrands(p, ['kn_champion_g_a']);
    // …so no grand binds to a slot: the sub-ability is left exactly as it was.
    expect(p.subAbilities.sub1!.damage).toBe(before);
    expect(p.subAbilities.sub1!.lifestealFrac ?? 0).toBe(0);
  });

  it('applies a subclass grand even when the hero has no base ability table (abilities ?? {})', () => {
    const p = makePlayer('knight');
    p.subAbilities = { sub1: champSub() };
    p.subSkillIds = ['kn_champion_slam']; // maps sub1 → the kn_champion subclass
    (p as unknown as { abilities?: unknown }).abilities = undefined; // no base kit present
    applySubclassGrands(p, ['kn_champion_g_a']);
    // Unbroken Champion grafts 25% lifesteal onto its (damaging) sub-skill — proof the
    // grand ran despite the missing base table (the `?? {}` fallback stood in).
    expect(p.subAbilities.sub1!.lifestealFrac).toBeCloseTo(0.25, 5);
  });
});

// ---------------------------------------------------------------------------
// Skill-keyed progression — stash / restore + isolation (items 15 & 17)
//
// A hero's a2 (knight) is Shield Wall; hy_pyromancer grafts the Mage's Fireball
// over it. Progression must key by SKILL, not slot: a Shield-Wall boon may never
// bleed onto the grafted Fireball, and reclaiming Shield Wall must bring its
// boons back.
// ---------------------------------------------------------------------------

describe('skill-keyed progression: isolation (item 17)', () => {
  it('a class boon on the native skill never lands on a graft that later takes the slot', () => {
    // kn_bulwark tunes Shield Wall (a2); grafting Fireball over a2 must not absorb it.
    const p = apply('knight', ['hy_pyromancer', 'kn_bulwark']);
    const a2 = p.abilities!.a2;
    expect(a2.name).toBe('Fireball'); // the graft is what's equipped
    expect(a2.buffDefMult).toBeUndefined(); // Shield Wall's boon did NOT bleed onto Fireball
    expect(a2.buffDuration).toBeUndefined();
    // Fireball's own numbers are pristine.
    expect(a2.damage).toBe(80);
    expect(a2.impactRadius).toBe(110);
  });

  it('routes the boon to the displaced native even when it is picked AFTER the graft', () => {
    // Boon accrues on the stashed Shield Wall; reclaiming it proves the boon landed there.
    const p = apply('knight', ['hy_pyromancer', 'kn_bulwark', 'restore:a2']);
    const a2 = p.abilities!.a2;
    expect(a2.name).toBe('Shield Wall');
    expect(a2.buffDefMult!).toBeCloseTo(0.4, 5); // 0.5 * 0.8 — the boon was preserved on the native
    expect(a2.buffDuration!).toBeCloseTo(5.5, 5); // 4 + 1.5
  });

  it('a whole-kit combat style still lands on the CURRENT occupant (the graft)', () => {
    // hy_vampiric feeds damaging strikes/shots — it should feed the grafted Fireball,
    // not the stashed native, because a style re-flavours what you actually hold.
    const p = apply('knight', ['hy_pyromancer', 'hy_vampiric']);
    const a2 = p.abilities!.a2;
    expect(a2.name).toBe('Fireball');
    expect(a2.lifestealFrac!).toBeCloseTo(0.1, 5); // the equipped Fireball drinks
  });
});

describe('skill-keyed progression: stash / restore round-trip (item 15)', () => {
  it('earn → graft over → reclaim preserves the original skill and its boons', () => {
    const p = apply('knight', ['kn_bulwark', 'hy_pyromancer', 'restore:a2']);
    const a2 = p.abilities!.a2;
    expect(a2.name).toBe('Shield Wall'); // reclaimed
    expect(a2.buffDefMult!).toBeCloseTo(0.4, 5); // boon intact
    expect(a2.buffDuration!).toBeCloseTo(5.5, 5);
  });

  it('reclaim is a no-op when the native skill was never displaced', () => {
    const p = apply('knight', ['kn_bulwark', 'restore:a2']);
    const a2 = p.abilities!.a2;
    expect(a2.name).toBe('Shield Wall');
    expect(a2.buffDefMult!).toBeCloseTo(0.4, 5);
  });

  it('re-seats a previously-stashed GRAFT with its accrued graftup boons intact', () => {
    // Graft Fireball, level it, bury it under Field Dressing, then graft Fireball again:
    // the second Pyromancer restores the SAME leveled Fireball, not a fresh one.
    const p = apply('knight', [
      'hy_pyromancer',
      'graftup:a2:mg_combust', // Fireball +22 dmg / +35 impact
      'hy_fieldmedic', // displaces Fireball with Field Dressing
      'hy_pyromancer', // re-seats the stashed, leveled Fireball
    ]);
    const a2 = p.abilities!.a2;
    expect(a2.name).toBe('Fireball');
    expect(a2.damage).toBe(102); // 80 + 22 preserved across the stash
    expect(a2.impactRadius).toBe(145); // 110 + 35
  });

  it('previewAbilityTable (HUD path) reflects reclaimed progression too', () => {
    const t = previewAbilityTable('knight', ['kn_bulwark', 'hy_pyromancer', 'restore:a2']);
    expect(t.a2.name).toBe('Shield Wall');
    expect(t.a2.buffDefMult!).toBeCloseTo(0.4, 5);
  });
});

describe('skill-keyed progression: grafted-skill upgrades (graftup)', () => {
  it('a graftup levels the grafted skill via a source-class boon', () => {
    const a = apply('knight', ['hy_pyromancer', 'graftup:a2:mg_combust']).abilities!;
    expect(a.a2.name).toBe('Fireball');
    expect(a.a2.damage).toBe(102); // 80 + 22
    expect(a.a2.impactRadius).toBe(145); // 110 + 35
  });

  it('a second source boon composes on the same grafted skill', () => {
    const a = apply('knight', [
      'hy_pyromancer',
      'graftup:a2:mg_combust', // dmg 102, impact 145
      'graftup:a2:mg_quickcast', // castTime 0.42, cooldown *0.85
    ]).abilities!;
    expect(a.a2.damage).toBe(102);
    expect(a.a2.castTime!).toBeCloseTo(0.42, 5); // 0.7 * 0.6
  });

  it('a graftup on a non-graft slot is harmless (applies to whatever is there)', () => {
    // Defensive: an unsolicited graftup with no graft present still must not throw.
    expect(() => apply('knight', ['graftup:a2:mg_combust'])).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Synthetic-id plumbing: wire guard, stacking caps
// ---------------------------------------------------------------------------

describe('isCharUpgradeId accepts well-formed synthetic ids only', () => {
  it('accepts valid reclaim / graftup ids', () => {
    expect(isCharUpgradeId('restore:a2')).toBe(true);
    expect(isCharUpgradeId('restore:basic')).toBe(true);
    expect(isCharUpgradeId('graftup:a2:mg_combust')).toBe(true);
  });

  it('rejects malformed or unknown-boon synthetic ids', () => {
    expect(isCharUpgradeId('restore:')).toBe(false);
    expect(isCharUpgradeId('restore:zz')).toBe(false); // not a slot
    expect(isCharUpgradeId('graftup:a2')).toBe(false); // no boon
    expect(isCharUpgradeId('graftup::mg_combust')).toBe(false); // empty slot
    expect(isCharUpgradeId('graftup:zz:mg_combust')).toBe(false); // bad slot
    expect(isCharUpgradeId('graftup:a2:bogus')).toBe(false); // unknown boon
    expect(isCharUpgradeId('restore')).toBe(false); // no colon at all
  });
});

describe('charUpgradeMaxStacks for synthetic ids', () => {
  it('a reclaim is never capped (contextual)', () => {
    expect(charUpgradeMaxStacks('restore:a2')).toBe(Number.POSITIVE_INFINITY);
  });
  it('a graftup inherits the source boon cap', () => {
    expect(charUpgradeMaxStacks('graftup:a2:mg_combust')).toBe(charUpgradeMaxStacks('mg_combust'));
    expect(charUpgradeMaxStacks('graftup:a2:mg_combust')).toBe(5); // MAX_SKILL_STACKS default
  });
});

// ---------------------------------------------------------------------------
// reofferCandidates — what a hero currently qualifies to reclaim / level
// ---------------------------------------------------------------------------

describe('reofferCandidates (items 15 & 17)', () => {
  it('is empty for a hero who owns no grafts (offer stream untouched)', () => {
    expect(reofferCandidates('knight', [])).toEqual([]);
    expect(reofferCandidates('knight', ['kn_bulwark', 'kn_concuss'])).toEqual([]);
  });

  it('is empty for an unrecognised class', () => {
    expect(reofferCandidates('nope' as ClassId, ['hy_pyromancer'])).toEqual([]);
  });

  it('offers a reclaim of the displaced native plus the graft’s source boons', () => {
    const c = reofferCandidates('knight', ['hy_pyromancer']);
    expect(c).toContain('restore:a2'); // reclaim Shield Wall
    expect(c).toContain('graftup:a2:mg_quickcast');
    expect(c).toContain('graftup:a2:mg_combust');
    // Only Fireball's (a1) mage boons — never an unrelated-slot mage boon.
    expect(c).not.toContain('graftup:a2:mg_freeze'); // Frost Nova (a2), not Fireball
    expect(c).not.toContain('graftup:a2:mg_blink'); // Blink (a3)
  });

  it('drops a graftup once it is owned at the source boon cap', () => {
    const owned = ['hy_pyromancer', ...Array<string>(5).fill('graftup:a2:mg_combust')];
    const c = reofferCandidates('knight', owned);
    expect(c).not.toContain('graftup:a2:mg_combust'); // at cap (5)
    expect(c).toContain('graftup:a2:mg_quickcast'); // still available
    expect(c).toContain('restore:a2');
  });

  it('stops offering a reclaim once the native has been reclaimed', () => {
    const c = reofferCandidates('knight', ['hy_pyromancer', 'restore:a2']);
    expect(c).toEqual([]); // a2 native equipped again → nothing displaced
  });
});

// ---------------------------------------------------------------------------
// rollCharChoices — the re-offer swap (deterministic, seeded)
// ---------------------------------------------------------------------------

describe('rollCharChoices re-offer swap', () => {
  it('exposes the documented re-offer chance', () => {
    expect(REOFFER_CHANCE).toBeCloseTo(0.5, 5);
  });

  it('does not draw rng or swap for a hero without a displaced skill', () => {
    // Same stream, with and without a trailing (would-be) re-offer draw, is identical.
    const base = rollCharChoices('knight', 4, seq([0, 0, 0, 0, 0.9, 0.9]), []);
    expect(base).toEqual(['kn_bulwark', 'kn_concuss', 'kn_widecleave', 'kn_bastion']);
  });

  it('swaps in a reclaim when the re-offer roll fires', () => {
    // With hy_pyromancer owned, kn_bulwark (a2-only) is filtered out (item 26), so
    // the picks are [concuss, widecleave, bastion, secondwind]; 0.9 skips the hybrid;
    // 0.0 < 0.5 fires the re-offer; index 0.0 → reoffers[0] = restore:a2, placed at [1].
    const off = rollCharChoices('knight', 4, seq([0, 0, 0, 0, 0.9, 0.0, 0.0]), ['hy_pyromancer']);
    expect(off[1]).toBe('restore:a2');
    expect(off[0]).toBe('kn_concuss');
    expect(isCharUpgradeId(off[1])).toBe(true);
  });

  it('can swap in a graftup (index picks a grafted-skill upgrade)', () => {
    // index 0.9 → floor(0.9*3)=2 → reoffers[2] = graftup:a2:mg_combust.
    const off = rollCharChoices('knight', 4, seq([0, 0, 0, 0, 0.9, 0.0, 0.9]), ['hy_pyromancer']);
    expect(off[1]).toBe('graftup:a2:mg_combust');
  });

  it('does NOT swap when the re-offer roll is at/above the threshold', () => {
    const off = rollCharChoices('knight', 4, seq([0, 0, 0, 0, 0.9, 0.5]), ['hy_pyromancer']);
    expect(off[1]).toBe('kn_widecleave'); // untouched base pick (bulwark filtered, item 26)
    expect(off).not.toContain('restore:a2');
  });

  it('drops class boons that only upgrade a grafted-over skill (item 26)', () => {
    // hy_pyromancer grafts Fireball onto the Knight's a2 (Shield Wall). kn_bulwark
    // ONLY upgrades Shield Wall, so with that graft owned it must vanish from the
    // pool — while a boon on a still-live skill (kn_widecleave → basic) stays.
    const off = rollCharChoices('knight', 5, seq([0, 0, 0, 0, 0.99, 0.99]), ['hy_pyromancer']);
    expect(off).not.toContain('kn_bulwark');
    expect(off).toContain('kn_widecleave');
  });
});

// ---------------------------------------------------------------------------
// rollCharChoices — graceful degradation + reachability (items 12, 13, 14)
// ---------------------------------------------------------------------------

describe('rollCharChoices graceful degradation (items 12–14)', () => {
  /** Every base id of a class, each repeated to its cap — a fully-exhausted pool. */
  function maxedOut(classId: ClassId): string[] {
    const owned: string[] = [];
    for (const d of CHAR_UPGRADES_BY_CLASS[classId]) {
      for (let i = 0; i < charUpgradeMaxStacks(d.id); i++) owned.push(d.id);
    }
    return owned;
  }

  it('never returns a blank class-boon offer while rare upgrades remain (item 12)', () => {
    // Every common knight boon is owned at its cap, so the base pool is empty. The
    // roll must still surface options — degrading to the cross-class hybrids.
    const owned = maxedOut('knight');
    const off = rollCharChoices('knight', 4, seq([0, 0, 0, 0, 0.99, 0.99]), owned);
    expect(off.length).toBeGreaterThan(0); // NEVER blank while anything is eligible
    for (const id of off) {
      expect(charUpgradeAtMax(id, owned)).toBe(false); // never a maxed pick
      const isReoffer = id.startsWith('restore:') || id.startsWith('graftup:');
      expect(isReoffer || CHAR_UPGRADES[id]?.classId === 'any').toBe(true); // rare/restore only
    }
  });

  it('keeps skill-replace / restore offers surfacing once the pool is exhausted (item 14)', () => {
    // A hero holding the Pyromancer graft (displacing Shield Wall) whose remaining
    // common boons are all maxed: the reclaim of the displaced skill must still be
    // offered rather than the class-boon relic going blank.
    const owned = ['hy_pyromancer', ...maxedOut('knight')];
    const off = rollCharChoices('knight', 4, seq([0.99]), owned);
    expect(off.length).toBeGreaterThan(0);
    expect(off).toContain('restore:a2'); // the reclaim keeps appearing (item 14)
  });

  // Late-run offer fixes: once the base pool is exhausted the degraded fill must stay
  // (a) RANDOM — varied between seeds, not one fixed repeated list — and (b) keep
  // offering GENUINE upgrades (hybrids) rather than collapsing to only skill-swap /
  // restore options while real upgrades remain.
  it('varies the degraded offer across seeds instead of repeating one fixed list', () => {
    const owned = maxedOut('knight'); // base pool fully exhausted → degradation path
    const sets = new Set<string>();
    for (const s of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const off = rollCharChoices('knight', 4, lcg(s), owned);
      expect(off).toHaveLength(4);
      sets.add(off.join(','));
    }
    // The old deterministic fill returned the SAME 4-pick list for every seed (size 1).
    expect(sets.size).toBeGreaterThan(1);
  });

  it('always offers a genuine upgrade while hybrids remain (never only swaps)', () => {
    // Exhausted pool + a graft displacing a2: every seed must surface BOTH a real cross-
    // class hybrid (never collapse to only skill-swap/restore) AND the reclaim (item 14).
    const owned = ['hy_pyromancer', ...maxedOut('knight')];
    for (const s of [1, 7, 42, 0xbee, 0x1234]) {
      const off = rollCharChoices('knight', 4, lcg(s), owned);
      expect(off).toHaveLength(4);
      const hasGenuine = off.some((id) => CHAR_UPGRADES[id]?.classId === 'any');
      const hasReclaim = off.some((id) => id.startsWith('restore:'));
      expect(hasGenuine).toBe(true); // a genuine upgrade is always present
      expect(hasReclaim).toBe(true); // …and the displaced skill stays reclaimable (item 14)
    }
  });

  it('never degrades to an all-reoffer set while a genuine upgrade is eligible (every class)', () => {
    for (const classId of CLASS_IDS) {
      const owned = maxedOut(classId);
      const rng = lcg(0xd00d ^ classId.length);
      for (let t = 0; t < 40; t++) {
        const off = rollCharChoices(classId, 4, rng, owned);
        if (off.length === 0) continue; // (no class has an empty hybrid pool, but be safe)
        const hasGenuine = off.some(
          (id) => !id.startsWith('restore:') && !id.startsWith('graftup:'),
        );
        expect(hasGenuine).toBe(true);
      }
    }
  });

  it('keeps the basic-attack projectile boon reachable (item 13)', () => {
    // so_twin (Sorcerer) and dr_thorns (Druid) are the only class-pool boons that add
    // a projectile to the BASIC attack; both must stay offerable from a fresh pool.
    // rng 0 walks the shrinking pool in order; trailing 0.99s suppress the swaps.
    expect(rollCharChoices('sorcerer', 5, seq([0, 0, 0, 0, 0, 0.99, 0.99]))).toContain('so_twin');
    expect(rollCharChoices('druid', 5, seq([0, 0, 0, 0, 0, 0.99, 0.99]))).toContain('dr_thorns');
    // And they survive a seed sweep — guarding the item-26 liveBoon / atMax filters.
    let sawTwin = false;
    let sawThorns = false;
    const rng = lcg(0x51301);
    for (let t = 0; t < 200 && !(sawTwin && sawThorns); t++) {
      if (rollCharChoices('sorcerer', 4, rng, []).includes('so_twin')) sawTwin = true;
      if (rollCharChoices('druid', 4, rng, []).includes('dr_thorns')) sawThorns = true;
    }
    expect(sawTwin).toBe(true);
    expect(sawThorns).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// describeCharOffer / charUpgradeBadge — labels for real + synthetic ids
// ---------------------------------------------------------------------------

describe('projectile range grands extend range instead of collapsing it (item 3)', () => {
  // A base projectile has no `maxRange` field and falls back to PROJECTILE_MAX_RANGE at
  // spawn, so a naive addN(...,'maxRange',X) read the missing field as 0 and SLASHED the
  // cap to X — a "+range" boon that made the shot far SHORTER (the Frostlance bug). The
  // range grands must now lengthen the shot; the lances that never promised range leave
  // the cap untouched at its default.
  it('Deadeye / Railshot / Judgment raise maxRange above the default cap', () => {
    expect(previewAbilityTable('ranger', ['rg_grand_deadeye']).basic.maxRange).toBe(
      PROJECTILE_MAX_RANGE + 220,
    );
    expect(previewAbilityTable('ranger', ['rg_gk_basic_b']).basic.maxRange).toBe(
      PROJECTILE_MAX_RANGE + 260,
    );
    expect(previewAbilityTable('cleric', ['cl_gk_basic_b']).basic.maxRange).toBe(
      PROJECTILE_MAX_RANGE + 200,
    );
  });

  it('Frostlance / Chaos Lance keep the default range cap (never the 200u regression)', () => {
    const frost = previewAbilityTable('mage', ['mg_gk_basic_b']).basic;
    const chaos = previewAbilityTable('sorcerer', ['so_gk_basic_b']).basic;
    // maxRange stays unset ⇒ the spawn falls back to PROJECTILE_MAX_RANGE (820), not 200.
    expect(frost.maxRange ?? PROJECTILE_MAX_RANGE).toBe(PROJECTILE_MAX_RANGE);
    expect(chaos.maxRange ?? PROJECTILE_MAX_RANGE).toBe(PROJECTILE_MAX_RANGE);
    // …while still granting the speed + freeze the description promises.
    expect(frost.freeze).toBeCloseTo(0.4, 6);
    expect(frost.projSpeed).toBe(620 + 350);
    expect(chaos.freeze).toBeCloseTo(0.4, 6);
  });
});

describe('previewSubAbility (item 5)', () => {
  it('applies Honed boons (stacking) and lowers cooldown, and ignores unrelated ids', () => {
    const base = previewSubAbility('kn_champion_slam', [])!;
    const honed1 = previewSubAbility('kn_champion_slam', ['subup_kn_champion_slam'])!;
    const honed2 = previewSubAbility('kn_champion_slam', [
      'subup_kn_champion_slam',
      'subup_kn_champion_slam',
    ])!;
    expect(honed1.damage).toBeGreaterThan(base.damage);
    expect(honed2.damage).toBeGreaterThan(honed1.damage); // each occurrence stacks
    expect(honed1.cooldown).toBeLessThan(base.cooldown);
    // A base-slot boon touches base abilities, not sub-abilities → no change here.
    const unrelated = previewSubAbility('kn_champion_slam', ['kn_widecleave'])!;
    expect(unrelated.damage).toBe(base.damage);
  });

  it('applies a subclass grand to every skill of that subclass only', () => {
    const base = previewSubAbility('kn_champion_slam', [])!;
    const granded = previewSubAbility('kn_champion_slam', ['kn_champion_g_a'])!;
    expect(granded.damage).toBeGreaterThan(base.damage);
    // A different subclass's grand leaves this skill untouched.
    const otherGrand = SUBCLASS_GRANDS.find((g) => g.subclassId !== 'kn_champion')!;
    const unaffected = previewSubAbility('kn_champion_slam', [otherGrand.id])!;
    expect(unaffected.damage).toBe(base.damage);
  });

  it('skips ids that do not touch this skill (unknown id, or a base-slot boon)', () => {
    const base = previewSubAbility('kn_champion_slam', [])!;
    const r = previewSubAbility('kn_champion_slam', ['not_a_real_upgrade', 'kn_bulwark'])!;
    expect(r.damage).toBe(base.damage); // untouched — neither id hones this sub-skill
    expect(r.cooldown).toBe(base.cooldown);
  });

  it('returns null for an unknown sub-skill id', () => {
    expect(previewSubAbility('not_a_skill', [])).toBeNull();
  });
});

describe('describeCharOffer', () => {
  it('keeps the "Replaces X" graft label (item 18)', () => {
    const v = describeCharOffer('knight', [], 'hy_pyromancer')!;
    expect(v.label).toBe("☄️ Pyromancer's Pact");
    expect(v.desc).toContain('Replaces Shield Wall');
  });

  it('flags a GRAND capstone', () => {
    const v = describeCharOffer('knight', [], 'kn_grand_immovable')!;
    expect(v.label.startsWith('★')).toBe(true);
    expect(v.desc.startsWith('GRAND —')).toBe(true);
  });

  it('labels a reclaim, naming the displaced skill and what it drops', () => {
    const v = describeCharOffer('knight', ['hy_pyromancer'], 'restore:a2')!;
    expect(v.label).toBe('↩️ Reclaim Shield Wall');
    expect(v.desc).toContain('dropping Fireball');
  });

  it('omits the "dropping" clause when nothing is displaced', () => {
    const v = describeCharOffer('knight', [], 'restore:a2')!;
    expect(v.label).toBe('↩️ Reclaim Shield Wall');
    expect(v.desc).not.toContain('dropping');
  });

  it('labels a graftup with the source boon, naming the grafted skill', () => {
    const v = describeCharOffer('knight', ['hy_pyromancer'], 'graftup:a2:mg_combust')!;
    expect(v.label).toBe('🔥 Combustion');
    expect(v.desc).toContain('Upgrades your grafted Fireball');
  });

  it('returns null for an unrecognised id', () => {
    expect(describeCharOffer('knight', [], 'bogus')).toBeNull();
  });

  // A "resolved post-value" = a "Now →" segment that carries a digit (a resolved
  // ability stat and/or player stat). This is the item-6 regression guard: every
  // offer card must show the RESULTING value, not just a prose delta — or be an
  // explicitly whitelisted prose-only case with the reason recorded below.
  const resolvesPostValue = (desc: string): boolean => {
    const now = desc.split('Now →')[1];
    return now !== undefined && /\d/.test(now);
  };

  it('every between-boss class boon resolves a Now → post-value (item 6)', () => {
    for (const classId of CLASS_IDS) {
      for (const def of CHAR_UPGRADES_BY_CLASS[classId]) {
        const v = describeCharOffer(classId, [], def.id)!;
        expect(resolvesPostValue(v.desc), `${classId}/${def.id}: ${v.desc}`).toBe(true);
      }
    }
  });

  it('every class capstone + base-skill grand resolves a Now → post-value (item 6)', () => {
    for (const g of [...Object.values(GRAND_BY_CLASS).flat(), ...SKILL_GRANDS]) {
      const classId = g.classId === 'any' ? 'knight' : g.classId;
      const v = describeCharOffer(classId, [], g.id)!;
      expect(resolvesPostValue(v.desc), `${g.id}: ${v.desc}`).toBe(true);
    }
  });

  it('every graft grand resolves a Now → post-value once its graft is held (item 6)', () => {
    for (const g of GRAFT_GRANDS) {
      const graft = HYBRID_UPGRADES.find((h) => h.id === g.graftId)!;
      const classId = CLASS_IDS.find((c) => !(graft.exclude ?? []).includes(c))!;
      const v = describeCharOffer(classId, [g.graftId!], g.id)!;
      expect(resolvesPostValue(v.desc), `${g.id}: ${v.desc}`).toBe(true);
    }
  });

  it('subclass grands resolve a numeric Now → once the equipped subs are known (item 5)', () => {
    // item 5 lifted the old prose-only whitelist: a subclass grand retunes SUB-abilities
    // (sub1/sub2), so passing the hero's equipped sub-skills lets the card resolve the
    // concrete resulting values — exactly like a base-class card.
    for (const g of SUBCLASS_GRANDS) {
      const classId = g.classId as ClassId;
      const sub = SUBCLASSES[classId].find((s) => s.id === g.subclassId)!;
      const equipped = sub.skills.slice(0, 2).map((s) => s.id);
      const v = describeCharOffer(classId, [], g.id, equipped)!;
      expect(resolvesPostValue(v.desc), `${g.id}: ${v.desc}`).toBe(true);
      // …and even WITHOUT the equipped list it still states a concrete change in prose
      // (the item-6 floor — never vague).
      expect(/\d/.test(describeCharOffer(classId, [], g.id)!.desc)).toBe(true);
    }
  });

  it('a Honed subclass-skill boon shows an explicit before→after (item 5)', () => {
    const v = describeCharOffer('knight', [], 'subup_kn_champion_slam', ['kn_champion_slam'])!;
    expect(v.desc).toContain('Now →');
    expect(v.desc).toContain('Earthshaker'); // names the honed skill
    expect(v.desc).toMatch(/\(was .*cooldown\)/); // before→after, both concrete lines
    expect(resolvesPostValue(v.desc)).toBe(true);
  });

  it('a subclass grand previews the before→after of every equipped skill it retunes (item 5)', () => {
    const v = describeCharOffer('knight', [], 'kn_champion_g_a', [
      'kn_champion_slam',
      'kn_champion_charge',
    ])!;
    const preview = v.desc.split('Now →')[1];
    // Both equipped Champion skills appear, each with a "(was …)" before→after.
    expect(preview).toContain('Earthshaker');
    expect(preview).toContain('Bull Rush');
    expect((preview.match(/\(was /g) ?? []).length).toBe(2);
  });

  it('never mixes a re-flavoured skill name into an upgrade card, even mid-run (items 1/9)', () => {
    // Item 1's report: the headline named "Fireball" while the "Now →" preview
    // named the rolled variant ("Pyroclasm"). With name-rolling reverted (item 9)
    // every ability keeps its canonical name, so the two halves always agree.
    for (const seed of [1, 42, 1337, 987654321]) {
      setProceduralSeed(seed);
      try {
        for (const classId of CLASS_IDS) {
          const canon = new Set(
            (['basic', 'a1', 'a2', 'a3'] as AbilitySlot[]).map(
              (s) => getClass(classId).abilities[s].name,
            ),
          );
          // item 5: subclass-skill upgrade cards now also preview the retuned
          // sub-ability, so their (identity, never-rolled) names are canonical too.
          for (const sc of SUBCLASSES[classId]) for (const sk of sc.skills) canon.add(sk.name);
          for (const [id, def] of Object.entries(CHAR_UPGRADES)) {
            if (def.classId !== classId || def.replaces) continue;
            const v = describeCharOffer(classId, [], id);
            if (!v || !v.desc.includes('Now →')) continue;
            // Every "Name: …" prefix in the preview must be a canonical skill name
            // of this class — never a re-flavoured bank variant.
            const preview = v.desc.split('Now →')[1];
            for (const m of preview.matchAll(/(?:^|·)\s*([^:·]+):/g)) {
              expect(canon.has(m[1].trim())).toBe(true);
            }
          }
        }
      } finally {
        setProceduralSeed(null);
      }
    }
  });

  it('appends a current-stats preview naming the retuned ability (item 4)', () => {
    const v = describeCharOffer('ranger', [], 'rg_pierce')!;
    // The boon retunes Arrow + Multishot, so the tooltip shows their resolved line.
    expect(v.desc).toContain('Now →');
    expect(v.desc).toContain('Arrow:');
  });

  it('the preview reflects the CURRENT stacked stats, not fixed numbers (item 4)', () => {
    const arrowDmg = (desc: string): number => {
      const after = desc.split('Now →')[1] ?? '';
      return Number(/Arrow: (\d+) dmg/.exec(after)?.[1] ?? '0');
    };
    const fresh = describeCharOffer('ranger', [], 'rg_pierce')!;
    // A hero who already stacked the boon once sees a HIGHER arrow number in the
    // preview — the tooltip is computed off their real current kit.
    const stacked = describeCharOffer('ranger', ['rg_pierce'], 'rg_pierce')!;
    expect(arrowDmg(stacked.desc)).toBeGreaterThan(arrowDmg(fresh.desc));
  });
});

describe('charUpgradeBadge', () => {
  it('describes a real boon', () => {
    const b = charUpgradeBadge('kn_bulwark')!;
    expect(b.name).toBe('Impenetrable');
    expect(b.icon).toBe('🛡️');
  });
  it('describes a reclaim and a graftup', () => {
    expect(charUpgradeBadge('restore:a2')!.icon).toBe('↩️');
    expect(charUpgradeBadge('graftup:a2:mg_combust')!.name).toBe('Combustion');
  });
  it('returns null for an unrecognised id', () => {
    expect(charUpgradeBadge('bogus')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Grand improvements — every capstone's `apply` must actually transform the
// hero. The catalog test above only proves they EXIST; here we run each one so
// the effect body (a stat retune or an ability-number bump) is exercised.
// ---------------------------------------------------------------------------

describe('grand improvements apply real, measurable transformations (item 22)', () => {
  const grands = Object.values(GRAND_BY_CLASS).flat();

  it('there are two grand capstones per class', () => {
    expect(grands).toHaveLength(24);
  });

  for (const def of grands) {
    it(`${def.id} changes the ${def.classId} hero when applied`, () => {
      const classId = def.classId as ClassId;
      const base = makePlayer(classId);
      const after = apply(classId, [def.id]);
      const statChanged =
        after.maxHp !== base.maxHp ||
        after.moveSpeed !== base.moveSpeed ||
        after.damageMult !== base.damageMult ||
        after.damageTakenMult !== base.damageTakenMult ||
        after.cooldownMult !== base.cooldownMult ||
        after.castMult !== base.castMult ||
        after.regenPerSec !== base.regenPerSec;
      const abilitiesChanged = JSON.stringify(after.abilities) !== JSON.stringify(base.abilities);
      // A capstone must retune SOMETHING — a stat multiplier or an ability number.
      expect(statChanged || abilitiesChanged).toBe(true);
    });
  }

  it('rg_grand_deadeye sharpens the ranger Arrow by exact amounts', () => {
    const arrow = CLASSES.ranger.abilities.basic;
    const a = apply('ranger', ['rg_grand_deadeye']).abilities!;
    expect(a.basic.damage).toBe((arrow.damage ?? 0) + 20);
    expect(a.basic.projSpeed).toBe((arrow.projSpeed ?? 0) + 250);
  });

  it('mg_grand_archmage slashes cast time and pumps damage + health', () => {
    const p = apply('mage', ['mg_grand_archmage']);
    expect(p.castMult).toBeCloseTo(0.4, 5); // spells snap out
    expect(p.damageMult).toBeCloseTo(1.3, 5);
  });

  it('wa_grand_ruin deepens the warlock Hex and Hellish Rebuke', () => {
    const hex = CLASSES.warlock.abilities.a1;
    const rebuke = CLASSES.warlock.abilities.a2;
    const a = apply('warlock', ['wa_grand_ruin']).abilities!;
    expect(a.a1.zoneTickDamage).toBe((hex.zoneTickDamage ?? 0) + 22);
    expect(a.a1.radius).toBe((hex.radius ?? 0) + 65);
    expect(a.a2.damage).toBe((rebuke.damage ?? 0) + 40);
  });
});

// ---------------------------------------------------------------------------
// previewPlayerStats — resolved stat block for the pause-menu character sheet
// ---------------------------------------------------------------------------
describe('previewPlayerStats', () => {
  it('returns the class baseline with no boons', () => {
    const s = previewPlayerStats('knight', [], []);
    expect(s.maxHp).toBe(CLASSES.knight.maxHp);
    expect(s.moveSpeed).toBe(CLASSES.knight.moveSpeed);
    expect(s.damageMult).toBe(1);
    expect(s.cooldownMult).toBe(1);
    expect(s.damageTakenMult).toBe(1);
    expect(s.regenPerSec).toBe(0);
    expect(s.terrainResist).toBe(0);
    // item 5: the base crit every hero carries must surface in the preview (the stub
    // is seeded with it), so the pause-menu sheet shows it even with no crit boons.
    expect(s.critChance).toBe(CRIT_CHANCE_BASE);
    expect(s.critMult).toBe(CRIT_MULT_BASE);
  });

  it('stacks Deadeye crit-chance boons on top of the base (item 5)', () => {
    expect(previewPlayerStats('ranger', ['deadeye'], []).critChance).toBeCloseTo(
      CRIT_CHANCE_BASE + CRIT_CHANCE_PER_DEADEYE,
      5,
    );
    expect(previewPlayerStats('ranger', ['deadeye', 'deadeye'], []).critChance).toBeCloseTo(
      CRIT_CHANCE_BASE + 2 * CRIT_CHANCE_PER_DEADEYE,
      5,
    );
  });

  it('folds generic boons into the stat block (Mighty/Bulwark/Vigor/Swift)', () => {
    const s = previewPlayerStats('knight', ['mighty', 'bulwark', 'vigor', 'swift'], []);
    expect(s.damageMult).toBeCloseTo(1.15, 5);
    expect(s.damageTakenMult).toBeCloseTo(0.85, 5);
    expect(s.maxHp).toBe(Math.round(CLASSES.knight.maxHp * 1.2));
    expect(s.moveSpeed).toBeCloseTo(CLASSES.knight.moveSpeed * 1.15, 3);
  });

  it('applies class character boons for the ACTIVE class only', () => {
    // A knight grand that cuts damage-taken should move the stat; a mismatched
    // (ranger) id is skipped, exactly as the live sim does.
    const s = previewPlayerStats('knight', [], ['kn_grand_immovable', 'rg_grand_deadeye']);
    expect(s.damageTakenMult).toBeCloseTo(0.6, 5);
    expect(s.maxHp).toBe(Math.round(CLASSES.knight.maxHp * 1.35));
  });
});

// ---------------------------------------------------------------------------
// PERSISTENT_STATS — the single display model the pause sheet + reward card share
// ---------------------------------------------------------------------------
describe('PERSISTENT_STATS display model', () => {
  it('formats a cell + readout for every stat (adding one is a one-line change)', () => {
    const s = previewPlayerStats('ranger', ['deadeye'], []); // crit boosted, non-trivial
    const ctx = { baseMoveSpeed: getClass('ranger').moveSpeed };
    for (const r of PERSISTENT_STATS) {
      const cell = r.cell(s, ctx);
      expect(cell.text.length).toBeGreaterThan(0);
      expect(typeof cell.good).toBe('boolean');
      expect(r.readout(s).length).toBeGreaterThan(0);
    }
  });

  it('renders crit chance as a percentage and crit damage as a ×multiplier (item 5)', () => {
    const s = previewPlayerStats('ranger', ['deadeye'], []);
    const ctx = { baseMoveSpeed: getClass('ranger').moveSpeed };
    const chance = PERSISTENT_STATS.find((r) => r.key === 'critChance')!;
    const dmg = PERSISTENT_STATS.find((r) => r.key === 'critMult')!;
    expect(chance.cell(s, ctx).text).toBe('13%'); // 5% base + 8% Deadeye
    expect(chance.readout(s)).toBe('13%');
    expect(dmg.cell(s, ctx).text).toBe('×1.5');
    // maxHp is readout-only (the sheet shows it in its header, not as a row).
    expect(PERSISTENT_STATS.find((r) => r.key === 'maxHp')!.panelRow).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Base-SKILL grands (item 17) — two radical capstones per base skill. Each must
// twist ONLY its own slot (keyed by skillSlot), never bleed onto a sibling slot.
// ---------------------------------------------------------------------------

describe('base-skill grands apply, and touch only their own slot (item 17)', () => {
  it('every base-skill grand transforms its slot and leaves the other three intact', () => {
    for (const d of SKILL_GRANDS) {
      const classId = d.classId as ClassId;
      const base = cloneAbilities(CLASSES[classId].abilities);
      const after = apply(classId, [d.id]).abilities!;
      const slot = d.skillSlot!;
      // The targeted slot changed...
      expect(JSON.stringify(after[slot])).not.toBe(JSON.stringify(base[slot]));
      // ...and no other base slot did (progression stays keyed to the one skill).
      for (const s of ['basic', 'a1', 'a2', 'a3'] as AbilitySlot[]) {
        if (s === slot) continue;
        expect(JSON.stringify(after[s])).toBe(JSON.stringify(base[s]));
      }
    }
  });

  it('kn_gk_basic_a turns Cleave into a lifestealing 360° whirlwind (exact)', () => {
    const a = apply('knight', ['kn_gk_basic_a']).abilities!;
    expect(a.basic.halfAngleDeg).toBe(180); // full circle
    expect(a.basic.range).toBe(95); // 70 + 25
    expect(a.basic.damage).toBe(34); // 22 + 12
    expect(a.basic.lifestealFrac!).toBeCloseTo(0.2, 5);
  });

  it('mg_gk_a1_a makes Fireball a Supernova; mg_gk_a2_a freezes Frost Nova solid', () => {
    const nova = apply('mage', ['mg_gk_a1_a']).abilities!;
    expect(nova.a1.damage).toBe(135); // 80 + 55
    expect(nova.a1.impactRadius).toBe(190); // 110 + 80
    const zero = apply('mage', ['mg_gk_a2_a']).abilities!;
    expect(zero.a2.freeze!).toBeCloseTo(1.5, 5);
    expect(zero.a2.damage).toBe(40); // 20 + 20
    expect(zero.a2.radius).toBe(190); // 150 + 40
  });

  it('a taunt grand tunes only the shield + duration levers taunt honours', () => {
    // kn_gk_a1_a — Taunt reads only buffDefMult (shield) + buffDuration + cooldown.
    const a = apply('knight', ['kn_gk_a1_a']).abilities!;
    expect(a.a1.buffDefMult!).toBeCloseTo(0.45, 5); // was unset → 55% mitigation
    expect(a.a1.buffDuration).toBe(8); // 4 + 4
  });
});

// ---------------------------------------------------------------------------
// SUBCLASS grands (item 17) — transform the hero's BOUND sub1/sub2 skills of the
// grand's subclass via the applySubclassGrands path (world.rebindActiveSubs).
// ---------------------------------------------------------------------------

/** A hero of `classId` with `subSkillIds` bound to sub1/sub2 (active-class only,
 *  first two — mirrors world.rebindActiveSubs) and `charUpgrades` applied, incl.
 *  the subclass-grand pass that tunes the bound sub-abilities. */
function makePlayerWithSubs(
  classId: ClassId,
  subSkillIds: string[],
  charUpgrades: string[] = [],
): Player {
  const p = makePlayer(classId);
  applyCharUpgrades(p, charUpgrades);
  p.charUpgradeIds = charUpgrades;
  p.subSkillIds = subSkillIds;
  const active = subSkillIds.filter((id) => subclassOfSkill(id)?.classId === classId).slice(0, 2);
  p.subAbilities = {};
  active.forEach((id, i) => {
    const skill = getSubSkill(id);
    if (!skill) return;
    const slot: SubSlot = i === 0 ? 'sub1' : 'sub2';
    p.subAbilities![slot] = { ...skill.ability, slot };
  });
  applySubclassGrands(p, charUpgrades);
  applySubSkillUpgrades(p, charUpgrades); // item 6: mirror world.rebindActiveSubs
  return p;
}

describe('subclass grands transform the bound sub-abilities (item 17)', () => {
  it('Unbroken Champion amplifies BOTH bound Champion skills and adds lifesteal', () => {
    // sub1 = Earthshaker (pbaoe dmg 40, r150); sub2 = Riposte (melee dmg 46, range 80).
    const p = makePlayerWithSubs(
      'knight',
      ['kn_champion_slam', 'kn_champion_riposte'],
      ['kn_champion_g_a'],
    );
    expect(p.subAbilities!.sub1!.damage).toBe(60); // round(40 * 1.5)
    expect(p.subAbilities!.sub1!.radius).toBe(195); // round(150 * 1.3)
    expect(p.subAbilities!.sub1!.lifestealFrac!).toBeCloseTo(0.25, 5);
    expect(p.subAbilities!.sub2!.damage).toBe(69); // round(46 * 1.5)
    expect(p.subAbilities!.sub2!.range).toBe(104); // round(80 * 1.3)
    expect(p.subAbilities!.sub2!.lifestealFrac!).toBeCloseTo(0.25, 5);
  });

  it("Warlord's Tempo cuts sub cooldowns, amplifies, and stuns a pbaoe", () => {
    const p = makePlayerWithSubs(
      'knight',
      ['kn_champion_slam', 'kn_champion_riposte'],
      ['kn_champion_g_b'],
    );
    expect(p.subAbilities!.sub1!.cooldown).toBeCloseTo(4.8, 5); // 8 * 0.6
    expect(p.subAbilities!.sub1!.damage).toBe(52); // round(40 * 1.3)
    expect(p.subAbilities!.sub1!.stun!).toBeCloseTo(0.6, 5); // pbaoe gets a stun rider
  });

  it('leaves the base kit untouched and no-ops for an unpicked subclass', () => {
    const p = makePlayerWithSubs(
      'knight',
      ['kn_champion_slam', 'kn_champion_riposte'],
      ['kn_champion_g_a'],
    );
    expect(p.abilities!.basic.damage).toBe(CLASSES.knight.abilities.basic.damage); // base kit intact
    // A grand for a subclass the hero did NOT pick tunes nothing.
    const q = makePlayerWithSubs(
      'knight',
      ['kn_champion_slam', 'kn_champion_riposte'],
      ['kn_battlemaster_g_a'],
    );
    expect(q.subAbilities!.sub1!.damage).toBe(40); // Earthshaker untouched
  });

  it('is a harmless no-op in the base replay (no sub-abilities present)', () => {
    const before = JSON.stringify(makePlayer('knight').abilities);
    const p = apply('knight', ['kn_champion_g_a']); // no subAbilities on this hero
    expect(JSON.stringify(p.abilities)).toBe(before);
  });

  it('every subclass grand measurably transforms a bound skill of its subclass', () => {
    for (const d of SUBCLASS_GRANDS) {
      const sub = SUBCLASSES[d.classId as ClassId].find((s) => s.id === d.subclassId)!;
      const p = makePlayerWithSubs(
        d.classId as ClassId,
        [sub.skills[0].id, sub.skills[1].id],
        [d.id],
      );
      const pristine = JSON.stringify({ ...sub.skills[0].ability, slot: 'sub1' });
      expect(JSON.stringify(p.subAbilities!.sub1)).not.toBe(pristine);
    }
  });
});

// ---------------------------------------------------------------------------
// grandCount — the "strong party" progression gate (item 5)
// ---------------------------------------------------------------------------

describe('grandCount (item 5)', () => {
  it('counts held GRAND capstones and ignores plain boons + synthetic ids', () => {
    expect(grandCount(undefined)).toBe(0);
    expect(grandCount([])).toBe(0);
    expect(grandCount(['kn_bulwark'])).toBe(0); // an ordinary class boon
    expect(grandCount(['kn_grand_immovable'])).toBe(1); // a real class capstone
    expect(grandCount(['kn_grand_immovable', 'rg_grand_deadeye', 'kn_bulwark'])).toBe(2);
    expect(grandCount(['restore:a2', 'graftup:a2:mg_combust'])).toBe(0); // synthetic → no def
  });

  it('reaches the ≥3 strong-party bar only with three genuine grands', () => {
    expect(grandCount(['kn_grand_immovable', 'rg_grand_deadeye']) >= 3).toBe(false);
    expect(grandCount(['kn_grand_immovable', 'rg_grand_deadeye', 'mg_grand_archmage']) >= 3).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// offerableGrands — the run-clear offer, with item-19 accessibility gates.
// ---------------------------------------------------------------------------

describe('offerableGrands (items 17 & 19)', () => {
  it('offers class capstones + all live base-skill grands, but no unpicked subclass grands', () => {
    const offered = offerableGrands('knight', [], []);
    const ids = offered.map((d) => d.id);
    expect(ids).toContain('kn_grand_immovable'); // class capstone (item 22)
    expect(ids).toContain('kn_gk_basic_a'); // base-skill grand, native slot live
    expect(ids).toContain('kn_gk_a2_a');
    expect(ids).not.toContain('kn_champion_g_a'); // no subclass picked yet
    for (const d of offered) expect(d.classId).toBe('knight'); // only this class's grands
  });

  it('surfaces a subclass grand only once its subclass is picked', () => {
    expect(offerableGrands('knight', [], []).map((d) => d.id)).not.toContain('kn_champion_g_a');
    const picked = offerableGrands('knight', [], ['kn_champion_slam']).map((d) => d.id);
    expect(picked).toContain('kn_champion_g_a');
    expect(picked).toContain('kn_champion_g_b');
    expect(picked).not.toContain('kn_battlemaster_g_a'); // the other subclass stays hidden
  });

  it('hides a base-skill grand whose native slot has been grafted over (item 19)', () => {
    // hy_pyromancer grafts Fireball over the Knight's a2 (Shield Wall).
    const ids = offerableGrands('knight', ['hy_pyromancer'], []).map((d) => d.id);
    expect(ids).not.toContain('kn_gk_a2_a'); // a2 native displaced → its grand is dead
    expect(ids).not.toContain('kn_gk_a2_b');
    expect(ids).toContain('kn_gk_basic_a'); // other slots still native → still offered
    expect(ids).toContain('kn_gk_a1_a');
  });

  it('re-offers a base-skill grand once its native skill is reclaimed', () => {
    const ids = offerableGrands('knight', ['hy_pyromancer', 'restore:a2'], []).map((d) => d.id);
    expect(ids).toContain('kn_gk_a2_a'); // a2 native back → grand offerable again
  });

  it('drops any grand already held at its (1) cap', () => {
    expect(offerableGrands('knight', ['kn_grand_immovable'], []).map((d) => d.id)).not.toContain(
      'kn_grand_immovable',
    );
    expect(offerableGrands('knight', ['kn_gk_basic_a'], []).map((d) => d.id)).not.toContain(
      'kn_gk_basic_a',
    );
    expect(
      offerableGrands('knight', ['kn_champion_g_a'], ['kn_champion_slam']).map((d) => d.id),
    ).not.toContain('kn_champion_g_a');
  });

  it('surfaces a graft grand only while the hero holds that graft (item 18)', () => {
    // No graft → no graft grand.
    expect(offerableGrands('knight', [], []).map((d) => d.id)).not.toContain('hy_pyromancer_g_a');
    // Graft held → both its grands are offered, but not another graft's.
    const held = offerableGrands('knight', ['hy_pyromancer'], []).map((d) => d.id);
    expect(held).toContain('hy_pyromancer_g_a');
    expect(held).toContain('hy_pyromancer_g_b');
    expect(held).not.toContain('hy_shadowpact_g_a'); // a graft the hero doesn't hold
  });

  it('stops offering a graft grand once the graft is reclaimed away (item 18)', () => {
    const ids = offerableGrands('knight', ['hy_pyromancer', 'restore:a2'], []).map((d) => d.id);
    expect(ids).not.toContain('hy_pyromancer_g_a'); // Fireball dropped → its grand is gone
    expect(ids).not.toContain('hy_pyromancer_g_b');
  });

  it('never offers a graft grand to a class the graft excludes (item 18)', () => {
    // A Mage can't hold Pyromancer's Pact (it excludes mage), so even with the id in
    // the owned list the graft never seats — and its grand never surfaces.
    const ids = offerableGrands('mage', ['hy_pyromancer'], []).map((d) => d.id);
    expect(ids).not.toContain('hy_pyromancer_g_a');
    expect(ids).not.toContain('hy_pyromancer_g_b');
  });

  it('drops a graft grand already held at its (1) cap (item 18)', () => {
    const ids = offerableGrands('knight', ['hy_pyromancer', 'hy_pyromancer_g_a'], []).map(
      (d) => d.id,
    );
    expect(ids).not.toContain('hy_pyromancer_g_a'); // capped
    expect(ids).toContain('hy_pyromancer_g_b'); // its sibling is still open
  });

  it('is empty for an unrecognised class', () => {
    expect(offerableGrands('nope' as ClassId, [], [])).toEqual([]);
  });
});

describe('base-skill + subclass + graft grands never enter the between-boss pool (item 20)', () => {
  it('a random sweep never yields a skill, subclass, or graft grand for any class', () => {
    const grandIds = new Set(
      [...SKILL_GRANDS, ...SUBCLASS_GRANDS, ...GRAFT_GRANDS].map((d) => d.id),
    );
    for (const classId of CLASS_IDS) {
      const rng = lcg(0x51de ^ classId.length);
      for (let t = 0; t < 80; t++) {
        for (const id of rollCharChoices(classId, 4, rng, [], [])) {
          expect(grandIds.has(id)).toBe(false);
          expect(CHAR_UPGRADES[id]?.grand).not.toBe(true);
        }
      }
    }
  });

  it('a graft grand never leaks into the pool even while the graft is owned (item 18/20)', () => {
    // Owning the graft opens reclaim / graftup re-offers, but its GRAND stays locked
    // to the run-clear special reward — the between-boss shop must never surface it.
    const rng = lcg(0xc0ffee);
    for (let t = 0; t < 200; t++) {
      for (const id of rollCharChoices('knight', 4, rng, ['hy_pyromancer'], [])) {
        expect(id).not.toBe('hy_pyromancer_g_a');
        expect(id).not.toBe('hy_pyromancer_g_b');
        expect(CHAR_UPGRADES[id]?.grand).not.toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Per-subclass-skill upgrades (item 6)
// ---------------------------------------------------------------------------

describe('per-subclass-skill upgrades (item 6)', () => {
  it('generates exactly one boon per subclass skill, keyed by sub skill id', () => {
    expect(SUB_SKILL_UPGRADES).toHaveLength(96);
    for (const def of SUB_SKILL_UPGRADES) {
      expect(def.subSkillId).toBeTruthy();
      expect(def.id).toBe(`subup_${def.subSkillId}`);
      expect(def.grand).toBeFalsy(); // a normal boon, not a grand
      expect(charUpgradeMaxStacks(def.id)).toBe(5); // shared cap
      expect(CHAR_UPGRADES[def.id]).toBe(def); // resolvable in the flat lookup
    }
  });

  it('hones the exact bound sub skill (magnitude, footprint, cooldown)', () => {
    const p = makePlayerWithSubs(
      'knight',
      ['kn_champion_slam', 'kn_champion_riposte'],
      ['subup_kn_champion_slam'],
    );
    // Earthshaker (sub1): base dmg 40, radius 150, cooldown 8.
    expect(p.subAbilities!.sub1!.damage).toBe(45); // round(40 × 1.12)
    expect(p.subAbilities!.sub1!.radius).toBe(162); // round(150 × 1.08)
    expect(p.subAbilities!.sub1!.cooldown).toBeCloseTo(7.36, 5); // 8 × 0.92
    // The OTHER bound sub skill is untouched — the boon is skill-specific.
    expect(p.subAbilities!.sub2!.damage).toBe(46); // Riposte base dmg unchanged
  });

  it('stacks across multiple picks (compounding), up to the shared cap', () => {
    const p = makePlayerWithSubs(
      'knight',
      ['kn_champion_slam'],
      ['subup_kn_champion_slam', 'subup_kn_champion_slam'],
    );
    // Two stacks: 40 → 45 → round(45 × 1.12)=50.
    expect(p.subAbilities!.sub1!.damage).toBe(50);
    const id = 'subup_kn_champion_slam';
    expect(charUpgradeAtMax(id, [id, id, id, id])).toBe(false);
    expect(charUpgradeAtMax(id, [id, id, id, id, id])).toBe(true);
  });

  it('is a no-op for a sub skill the hero has NOT equipped', () => {
    const p = makePlayerWithSubs('knight', ['kn_champion_slam'], ['subup_kn_champion_riposte']);
    expect(p.subAbilities!.sub1!.damage).toBe(40); // Earthshaker untouched (Riposte not bound)
  });

  it('is a harmless no-op in the base-ability replay', () => {
    const p = makePlayer('knight');
    applyCharUpgrades(p, ['subup_kn_champion_slam']); // no subAbilities → nothing happens
    expect(p.abilities!.basic.damage).toBe(CLASSES.knight.abilities.basic.damage);
  });

  it('only enters the roll once the hero has that sub skill equipped', () => {
    const id = 'subup_kn_champion_slam';
    // Not equipped → never offered, even across a long rng sweep.
    const rng1 = lcg(0xabc);
    let sawWithout = false;
    for (let t = 0; t < 120; t++) {
      if (rollCharChoices('knight', 4, rng1, [], [], []).includes(id)) sawWithout = true;
    }
    expect(sawWithout).toBe(false);
    // Equipped → it can surface.
    const rng2 = lcg(0xabc);
    let sawWith = false;
    for (let t = 0; t < 300 && !sawWith; t++) {
      if (rollCharChoices('knight', 4, rng2, [], [], ['kn_champion_slam']).includes(id)) {
        sawWith = true;
      }
    }
    expect(sawWith).toBe(true);
  });
});
