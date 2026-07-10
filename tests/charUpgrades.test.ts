import { describe, it, expect } from 'vitest';
import {
  upgradeAllowedFor,
  applyCharUpgrades,
  previewAbilityTable,
  isCharUpgradeId,
  rollCharChoices,
  CHAR_UPGRADES,
  CHAR_UPGRADES_BY_CLASS,
  HYBRID_UPGRADES,
  HYBRID_OFFER_CHANCE,
} from '../src/engine/charUpgrades';
import { CLASSES, CLASS_IDS, cloneAbilities } from '../src/engine/classes';
import type { PlayerAbilityDef, AbilityKind } from '../src/engine/classes';
import type { ClassId, Player, AbilitySlot } from '../src/engine/types';

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
  it('has a 5-strong pool for every one of the 8 classes', () => {
    expect(CLASS_IDS).toHaveLength(8);
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

  it('exposes 9 hybrid upgrades, all class-agnostic', () => {
    expect(HYBRID_UPGRADES).toHaveLength(9);
    for (const def of HYBRID_UPGRADES) expect(def.classId).toBe('any');
  });

  it('tags each hybrid graft/heal with the classes it must skip', () => {
    const byId = Object.fromEntries(HYBRID_UPGRADES.map((d) => [d.id, d]));
    expect(byId.hy_pyromancer.exclude).toEqual(['mage']);
    expect(byId.hy_shadowpact.exclude).toEqual(['rogue', 'mage']);
    expect(byId.hy_warhowl.exclude).toEqual(['barbarian']);
    expect(byId.hy_fieldmedic.exclude).toEqual(['cleric', 'paladin', 'druid']);
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

  it('flat lookup covers every class + hybrid def with unique ids', () => {
    const all = [...Object.values(CHAR_UPGRADES_BY_CLASS).flat(), ...HYBRID_UPGRADES];
    expect(all).toHaveLength(8 * 5 + 9); // 49
    const ids = all.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicates
    expect(Object.keys(CHAR_UPGRADES)).toHaveLength(49);
    for (const id of ids) expect(CHAR_UPGRADES[id].id).toBe(id);
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
    expect(a.a1.damage).toBe(20);
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
    expect(a.a1.impactRadius).toBe(135);
    expect(a.a1.damage).toBe(92);
  });
  it('mg_arcane pumps Arcane Bolt', () => {
    const a = apply('mage', ['mg_arcane']).abilities!;
    expect(a.basic.damage).toBe(22);
    expect(a.basic.cooldown).toBeCloseTo(0.369, 5); // 0.45 * 0.82
  });
  it('mg_blink upgrades Blink', () => {
    const a = apply('mage', ['mg_blink']).abilities!;
    expect(a.a3.range).toBe(320);
    expect(a.a3.cooldown).toBeCloseTo(4.2, 5); // 6 * 0.7
    expect(a.a3.iframes!).toBeCloseTo(0.25, 5); // was undefined -> +0.25
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
    expect(a.a3.damage).toBe(43);
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
    expect(a.a1.damage).toBe(82);
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
    expect(a.basic.cooldown).toBeCloseTo(0.3276, 5); // 0.42 * 0.78
    expect(a.basic.damage).toBe(23);
  });
  it('ro_envenom gives Slash + Backstab lifesteal', () => {
    const a = apply('rogue', ['ro_envenom']).abilities!;
    expect(a.basic.lifestealFrac!).toBeCloseTo(0.12, 5);
    expect(a.a1.lifestealFrac!).toBeCloseTo(0.12, 5);
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
    expect(a2.damage).toBe(70);
    expect(a2.castTime!).toBeCloseTo(0.7, 5);
    expect(a2.impactRadius).toBe(100);
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

  it('offers n distinct picks, capped at the pool size', () => {
    // rng 0 => always index 0 of the shrinking pool => pool order; 0.9 => no hybrid.
    expect(rollCharChoices('knight', 3, seq([0, 0, 0, 0.9]))).toEqual([
      'kn_bulwark',
      'kn_concuss',
      'kn_widecleave',
    ]);
    // n beyond the 5-strong pool clamps to the whole pool, in order.
    expect(rollCharChoices('knight', 10, seq([0, 0, 0, 0, 0, 0.9]))).toEqual([
      'kn_bulwark',
      'kn_concuss',
      'kn_widecleave',
      'kn_bastion',
      'kn_secondwind',
    ]);
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
    const offers = rollCharChoices('knight', 3, seq([0, 0, 0, 0.1, 0]));
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
      const offers = rollCharChoices(classId, 3, seq([0, 0, 0, 0.99]));
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
});
