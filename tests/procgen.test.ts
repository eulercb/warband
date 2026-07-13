import { describe, it, expect, afterEach } from 'vitest';
import type { Player, AbilitySlot } from '../src/engine/core/types';
import {
  hashStr,
  abilityVariant,
  classVariant,
  bossAbilityVariant,
  monsterVariant,
  upgradeVariant,
  subSkillAbilityVariant,
  setProceduralSeed,
  proceduralSeed,
  procVariant,
  MONSTER_EPITHETS,
  UPGRADE_NAME_BANKS,
} from '../src/engine/content/procgen';
import { CLASSES, CLASS_IDS, getClass, describeAbility } from '../src/engine/content/classes';
import type { PlayerAbilityDef } from '../src/engine/content/classes';
import { MONSTERS, MONSTER_IDS, getMonster } from '../src/engine/content/monsters';
import type { MonsterDef } from '../src/engine/content/monsters';
import { UPGRADES, UPGRADE_IDS, getUpgrade, applyUpgrades } from '../src/engine/content/upgrades';
import {
  ALL_SUBCLASSES,
  getSubSkill,
  getSubclass,
  subclassesFor,
} from '../src/engine/content/subclasses';
import { previewAbilityTable } from '../src/engine/content/charUpgrades';
import { heroPowerRatio } from '../src/engine/content/balance';
import { World } from '../src/engine/world/world';
import { ATTACK_CD_SCALE, BOSS_HP_SCALE } from '../src/engine/core/constants';
import { computeScaling } from '../src/engine/content/scaling';

const SLOTS: AbilitySlot[] = ['basic', 'a1', 'a2', 'a3'];
const SEEDS = [1, 7, 42, 1337, 987654321, 0xdeadbeef];

/** Every numeric field of an ability def (presence must be roll-invariant). */
function numericKeys(ab: Record<string, unknown>): string[] {
  return Object.keys(ab)
    .filter((k) => typeof ab[k] === 'number')
    .sort();
}

/** The budget proxy the generator conserves (mirrors procgen.abilityOutput). */
function output(ab: Omit<PlayerAbilityDef, 'slot'>): number {
  const zoneTicks = ((ab.zoneDuration ?? 0) / 0.5) * 0.6;
  return (
    ab.damage * Math.max(1, ab.projCount ?? 1) +
    (ab.landingDamage ?? 0) +
    (ab.healOnUse ?? 0) +
    ((ab.zoneTickDamage ?? 0) + (ab.zoneTickHeal ?? 0)) * zoneTicks
  );
}

/** A minimal hero stub for upgrade-apply assertions. */
function mkPlayer(): Player {
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
    critChance: 0,
    critMult: 1.5,
    threat: 0,
    stats: { damageDealt: 0, healingDone: 0, revives: 0, deaths: 0 },
    prevButtons: { basic: false, a1: false, a2: false, a3: false, revive: false },
    lastSeq: -1,
  };
}

afterEach(() => setProceduralSeed(null));

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe('procgen determinism', () => {
  it('hashStr is stable and order-sensitive', () => {
    expect(hashStr('mage.a1')).toBe(hashStr('mage.a1'));
    expect(hashStr('mage.a1')).not.toBe(hashStr('a1.mage'));
    expect(hashStr('')).toBeGreaterThan(0);
  });

  it('the same seed regenerates identical content (host/client agreement)', () => {
    for (const id of CLASS_IDS) {
      expect(classVariant(42, CLASSES[id])).toEqual(classVariant(42, CLASSES[id]));
    }
    for (const id of MONSTER_IDS) {
      expect(JSON.stringify(monsterVariant(42, MONSTERS[id]))).toBe(
        JSON.stringify(monsterVariant(42, MONSTERS[id])),
      );
    }
    for (const id of UPGRADE_IDS) {
      const a = upgradeVariant(42, UPGRADES[id]);
      const b = upgradeVariant(42, UPGRADES[id]);
      expect(a.name).toBe(b.name);
      expect(a.desc).toBe(b.desc);
      const pa = mkPlayer();
      const pb = mkPlayer();
      a.apply(pa);
      b.apply(pb);
      expect(pa).toEqual(pb);
    }
  });

  it('different seeds actually change the content', () => {
    const a = JSON.stringify(classVariant(1, CLASSES.mage));
    const b = JSON.stringify(classVariant(2, CLASSES.mage));
    expect(a).not.toBe(b);
    const ma = JSON.stringify(monsterVariant(1, MONSTERS.dragon));
    const mb = JSON.stringify(monsterVariant(2, MONSTERS.dragon));
    expect(ma).not.toBe(mb);
  });
});

// ---------------------------------------------------------------------------
// Class kits — identity envelope
// ---------------------------------------------------------------------------

describe('classVariant identity envelope', () => {
  it('preserves identity fields and jitters stats within role bounds', () => {
    for (const seed of SEEDS) {
      for (const id of CLASS_IDS) {
        const base = CLASSES[id];
        const v = classVariant(seed, base);
        expect(v.id).toBe(base.id);
        expect(v.name).toBe(base.name);
        expect(v.color).toBe(base.color);
        expect(v.role).toBe(base.role);
        expect(v.blurb).toBe(base.blurb);
        expect(v.threatMult).toBe(base.threatMult);
        expect(v.radius).toBe(base.radius);
        expect(v.maxHp).toBeGreaterThanOrEqual(base.maxHp * 0.88);
        expect(v.maxHp).toBeLessThanOrEqual(base.maxHp * 1.12);
        expect(v.moveSpeed).toBeGreaterThanOrEqual(base.moveSpeed * 0.91);
        expect(v.moveSpeed).toBeLessThanOrEqual(base.moveSpeed * 1.09);
      }
    }
  });

  it('every ability keeps its kind, slot, flavour gates and field set', () => {
    for (const seed of SEEDS) {
      for (const id of CLASS_IDS) {
        const base = CLASSES[id];
        const v = classVariant(seed, base);
        for (const slot of SLOTS) {
          const b = base.abilities[slot];
          const r = v.abilities[slot];
          expect(r.kind).toBe(b.kind);
          expect(r.slot).toBe(b.slot);
          expect(r.zoneKind).toBe(b.zoneKind);
          // The variance never adds or removes a mechanic — same numeric fields.
          expect(numericKeys(r as unknown as Record<string, unknown>)).toEqual(
            numericKeys(b as unknown as Record<string, unknown>),
          );
          // A single shot stays single; a fan stays a fan (within ±1, ≥2) — and
          // a BASIC attack's count is class fantasy, so it never changes at all.
          if ((b.projCount ?? 1) === 1 || slot === 'basic') {
            expect(r.projCount).toBe(b.projCount);
          } else {
            expect(r.projCount!).toBeGreaterThanOrEqual(Math.max(2, b.projCount! - 1));
            expect(r.projCount!).toBeLessThanOrEqual(b.projCount! + 1);
          }
          expect(r.cooldown).toBeGreaterThanOrEqual(0.2);
          if (b.damage > 0) expect(r.damage).toBeGreaterThanOrEqual(1);
          if (b.slowMult != null) {
            expect(r.slowMult!).toBeGreaterThanOrEqual(0.2);
            expect(r.slowMult!).toBeLessThanOrEqual(0.95);
          }
          if (b.buffDefMult != null) {
            expect(r.buffDefMult!).toBeGreaterThanOrEqual(0.2);
            expect(r.buffDefMult!).toBeLessThanOrEqual(0.95);
          }
          if (b.iframes != null) {
            expect(r.iframes!).toBeGreaterThanOrEqual(0.15);
            expect(r.iframes!).toBeLessThanOrEqual(0.5);
          }
          if (b.stun) expect(r.stun!).toBeLessThanOrEqual(b.stun + 0.4);
          if (b.castTime) expect(r.castTime!).toBeGreaterThanOrEqual(0.3);
          // The display NAME never rolls — it stays canonical (item 9) so upgrade
          // cards and tooltips never mix a base name with a re-flavoured one.
          expect(r.name).toBe(b.name);
          // Rolled tooltips stay well-formed.
          expect(describeAbility(r)).not.toMatch(/NaN|undefined/);
        }
      }
    }
  });

  it('keeps every damaging ability on power budget (output ↔ cooldown link)', () => {
    for (const seed of SEEDS) {
      for (const id of CLASS_IDS) {
        const base = CLASSES[id];
        const v = classVariant(seed, base);
        for (const slot of SLOTS) {
          const b = base.abilities[slot];
          const r = v.abilities[slot];
          const baseOut = output(b);
          if (baseOut <= 0) {
            // Pure utility: cooldown stays within its narrow free band.
            expect(r.cooldown).toBeGreaterThanOrEqual(b.cooldown * 0.8);
            expect(r.cooldown).toBeLessThanOrEqual(b.cooldown * 1.23);
            continue;
          }
          const power = output(r) / r.cooldown / (baseOut / b.cooldown);
          expect(power).toBeGreaterThanOrEqual(0.8);
          expect(power).toBeLessThanOrEqual(1.25);
        }
      }
    }
  });

  it('never re-rolls a base-skill display name (item 9)', () => {
    for (const seed of SEEDS) {
      for (const id of CLASS_IDS) {
        const base = CLASSES[id];
        const v = classVariant(seed, base);
        for (const slot of SLOTS) {
          // Every rolled kit keeps the canonical, recognisable skill names.
          expect(v.abilities[slot].name).toBe(base.abilities[slot].name);
        }
      }
    }
    // Subclass skills likewise keep their canonical name through the value roll.
    for (const seed of SEEDS) {
      for (const sub of ALL_SUBCLASSES) {
        for (const skill of sub.skills) {
          const r = subSkillAbilityVariant(seed, skill.id, skill.ability);
          expect(r.name).toBe(skill.ability.name);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Monsters — identity envelope
// ---------------------------------------------------------------------------

describe('monsterVariant identity envelope', () => {
  it('preserves AI, shape, tier and rolls stats within bounds (all monsters)', () => {
    for (const seed of SEEDS) {
      for (const id of MONSTER_IDS) {
        const base = MONSTERS[id];
        const v = monsterVariant(seed, base);
        expect(v.id).toBe(base.id);
        expect(v.tier).toBe(base.tier);
        expect(v.bodyShape).toBe(base.bodyShape);
        expect(v.color).toBe(base.color);
        expect(v.radius).toBe(base.radius);
        expect(v.meleeRange).toBe(base.meleeRange);
        expect(v.decide).toBe(base.decide); // the AI itself never re-rolls
        expect(v.name.startsWith(`${base.name}, `)).toBe(true);
        expect(MONSTER_EPITHETS.some((e) => v.name.endsWith(e))).toBe(true);
        expect(v.baseHp).toBeGreaterThanOrEqual(base.baseHp * 0.86);
        expect(v.baseHp).toBeLessThanOrEqual(base.baseHp * 1.14);
        expect(v.moveSpeed).toBeGreaterThanOrEqual(base.moveSpeed * 0.91);
        expect(v.moveSpeed).toBeLessThanOrEqual(base.moveSpeed * 1.09);
        expect(v.enrageThreshold).toBeGreaterThanOrEqual(0.12);
        expect(v.enrageThreshold).toBeLessThanOrEqual(0.5);
        expect(v.enrageCooldownMult).toBeGreaterThanOrEqual(0.45);
        expect(v.enrageCooldownMult).toBeLessThanOrEqual(0.85);
        expect(v.enrageRegenMult).toBe(base.enrageRegenMult);
        if (base.regen > 0) {
          expect(v.regen).toBeGreaterThan(0);
          expect(v.regen).toBeLessThanOrEqual(base.regen * 1.25);
        } else {
          expect(v.regen).toBe(base.regen);
        }
        if (base.blink) {
          expect(v.blink).toBeDefined();
          expect(v.blink!.threatenRange).toBe(base.blink.threatenRange);
          expect(v.blink!.internalCd).toBeGreaterThanOrEqual(2.5);
        } else {
          expect(v.blink).toBeUndefined();
        }
      }
    }
  });

  it('every boss ability keeps id/shape/gates, floors telegraphs and stays sane', () => {
    for (const seed of SEEDS) {
      for (const id of MONSTER_IDS) {
        const base = MONSTERS[id];
        const v = monsterVariant(seed, base);
        expect(v.abilities.length).toBe(base.abilities.length);
        base.abilities.forEach((b, i) => {
          const r = v.abilities[i];
          expect(r.id).toBe(b.id);
          expect(r.name).toBe(b.name); // boss abilities keep their names
          expect(r.shape).toBe(b.shape);
          expect(r.minHpFrac).toBe(b.minHpFrac);
          expect(r.targetRandom).toBe(b.targetRandom);
          expect(r.countScaling).toBe(b.countScaling);
          expect(r.zoneKind).toBe(b.zoneKind);
          expect(r.healSelf).toBe(b.healSelf);
          expect(numericKeys(r as unknown as Record<string, unknown>)).toEqual(
            numericKeys(b as unknown as Record<string, unknown>),
          );
          // Telegraph readability floor: ≥85% of authored, never under 0.3s.
          if (b.windup > 0) {
            expect(r.windup).toBeGreaterThanOrEqual(Math.max(0.3, b.windup * 0.85 - 0.026));
            expect(r.windup).toBeLessThanOrEqual(b.windup * 1.25 + 0.026);
          } else {
            expect(r.windup).toBe(0);
          }
          expect(r.cooldown).toBeGreaterThanOrEqual(1);
          if (b.damage > 0) {
            expect(r.damage).toBeGreaterThanOrEqual(1);
            // dmg jitter × the boss-wide HP↔damage budget compensation
            expect(r.damage).toBeGreaterThanOrEqual(Math.floor(b.damage * 0.85 * 0.94) - 1);
            expect(r.damage).toBeLessThanOrEqual(Math.ceil(b.damage * 1.15 * 1.06) + 1);
          }
          if (b.stun) expect(r.stun!).toBeLessThanOrEqual(b.stun + 0.3);
          if (b.silence) expect(r.silence!).toBeLessThanOrEqual(b.silence + 0.5);
          if (b.slowMult != null) {
            expect(r.slowMult!).toBeGreaterThanOrEqual(0.25);
            expect(r.slowMult!).toBeLessThanOrEqual(0.95);
          }
          if ((b.projCount ?? 1) >= 3) {
            expect(r.projCount!).toBeGreaterThanOrEqual(b.projCount! - 1);
            expect(r.projCount!).toBeLessThanOrEqual(b.projCount! + 1);
          } else {
            expect(r.projCount).toBe(b.projCount);
          }
          if (b.selfHealFrac) expect(r.selfHealFrac!).toBeLessThanOrEqual(0.15);
          if (b.buffDefMult) {
            expect(r.buffDefMult!).toBeGreaterThanOrEqual(0.3);
            expect(r.buffDefMult!).toBeLessThanOrEqual(0.9);
          }
        });
      }
    }
  });

  it('a boss that rolls extra HP hits proportionally softer (budget link)', () => {
    for (const seed of SEEDS) {
      for (const id of MONSTER_IDS) {
        const base = MONSTERS[id];
        const v = monsterVariant(seed, base);
        const hpF = v.baseHp / base.baseHp;
        const pairs = base.abilities.filter((a) => a.damage > 0);
        if (pairs.length === 0) continue;
        const dmgF =
          pairs.reduce((s, b, i) => {
            const r = v.abilities[base.abilities.indexOf(b)];
            void i;
            return s + r.damage / b.damage;
          }, 0) / pairs.length;
        // hp × mean-damage stays near the authored budget (jitter-tolerant).
        expect(hpF * dmgF).toBeGreaterThanOrEqual(0.78);
        expect(hpF * dmgF).toBeLessThanOrEqual(1.28);
      }
    }
  });

  it('the hidden practice dummy is never rolled', () => {
    expect(monsterVariant(42, MONSTERS.dummy)).toBe(MONSTERS.dummy);
  });

  it('covers the enrage-less / regen-less synthetic edge', () => {
    const synthetic: MonsterDef = {
      ...MONSTERS.goblin,
      id: 'goblin',
      hidden: false,
      regen: 0,
      enrageThreshold: 0,
    };
    const v = monsterVariant(7, synthetic);
    expect(v.enrageThreshold).toBe(0);
    expect(v.regen).toBe(0);
  });

  it('epithet bank entries are well-formed', () => {
    expect(new Set(MONSTER_EPITHETS).size).toBe(MONSTER_EPITHETS.length);
    for (const e of MONSTER_EPITHETS) expect(e).toMatch(/^(the|of) /);
  });
});

// ---------------------------------------------------------------------------
// Generic boons
// ---------------------------------------------------------------------------

describe('upgradeVariant', () => {
  it('keeps id/icon/role/caps, rolls magnitude, and desc matches the effect', () => {
    for (const seed of SEEDS) {
      for (const id of UPGRADE_IDS) {
        const base = UPGRADES[id];
        const v = upgradeVariant(seed, base);
        expect(v.id).toBe(base.id);
        expect(v.icon).toBe(base.icon);
        expect(v.role).toBe(base.role);
        expect(v.maxStacks).toBe(base.maxStacks);
        const p = mkPlayer();
        v.apply(p);
        switch (id) {
          case 'swift': {
            const b = p.moveSpeed / 200 - 1;
            expect(b).toBeGreaterThanOrEqual(0.1 - 1e-9);
            expect(b).toBeLessThanOrEqual(0.21 + 1e-9);
            expect(v.desc).toBe(`+${Math.round(b * 100)}% movement speed`);
            break;
          }
          case 'vigor': {
            const b = p.maxHp / 100 - 1;
            expect(b).toBeGreaterThanOrEqual(0.14 - 1e-9);
            expect(b).toBeLessThanOrEqual(0.28 + 1e-9);
            expect(p.hp).toBe(p.maxHp);
            expect(v.desc).toBe(`+${Math.round(b * 100)}% maximum health`);
            break;
          }
          case 'haste': {
            const b = 1 - p.cooldownMult;
            expect(b).toBeGreaterThanOrEqual(0.07 - 1e-9);
            expect(b).toBeLessThanOrEqual(0.14 + 1e-9);
            expect(v.desc).toBe(`-${Math.round(b * 100)}% ability cooldowns`);
            break;
          }
          case 'focus': {
            const b = 1 - p.castMult;
            expect(b).toBeGreaterThanOrEqual(0.22 - 1e-9);
            expect(b).toBeLessThanOrEqual(0.38 + 1e-9);
            expect(v.desc).toBe(`-${Math.round(b * 100)}% cast time`);
            break;
          }
          case 'mighty': {
            const b = p.damageMult - 1;
            expect(b).toBeGreaterThanOrEqual(0.1 - 1e-9);
            expect(b).toBeLessThanOrEqual(0.21 + 1e-9);
            expect(v.desc).toBe(`+${Math.round(b * 100)}% damage dealt`);
            break;
          }
          case 'bulwark': {
            const b = 1 - p.damageTakenMult;
            expect(b).toBeGreaterThanOrEqual(0.1 - 1e-9);
            expect(b).toBeLessThanOrEqual(0.21 + 1e-9);
            expect(v.desc).toBe(`-${Math.round(b * 100)}% damage taken`);
            break;
          }
          case 'renewal': {
            const frac = p.regenPerSec / p.maxHp;
            expect(frac).toBeGreaterThanOrEqual(0.014 - 1e-9);
            expect(frac).toBeLessThanOrEqual(0.027 + 1e-9);
            expect(v.desc).toContain('max HP per second');
            break;
          }
          case 'surefooted': {
            // Structural — untouched (2 stacks = immunity must survive rolling).
            expect(v).toBe(base);
            expect(p.terrainResist).toBe(0.5);
            break;
          }
        }
        if (id !== 'surefooted') {
          const bank = UPGRADE_NAME_BANKS[id];
          expect(bank).toBeDefined();
          expect(bank[0]).toBe(UPGRADES[id].name);
          expect(bank).toContain(v.name);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Subclass skills
// ---------------------------------------------------------------------------

describe('subSkillAbilityVariant', () => {
  it('rolls all 96 subclass skills within the shared envelope', () => {
    for (const sub of ALL_SUBCLASSES) {
      for (const skill of sub.skills) {
        const r = subSkillAbilityVariant(42, skill.id, skill.ability);
        expect(r.kind).toBe(skill.ability.kind);
        expect(r.name).toBe(skill.ability.name); // sub-skill names are identity
        expect(numericKeys(r as unknown as Record<string, unknown>)).toEqual(
          numericKeys(skill.ability as unknown as Record<string, unknown>),
        );
        expect(r.cooldown).toBeGreaterThanOrEqual(0.2);
        expect(describeAbility(r)).not.toMatch(/NaN|undefined/);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// The active-run registry + run-aware getters
// ---------------------------------------------------------------------------

describe('active-run registry', () => {
  it('serves canonical content with no run active', () => {
    expect(proceduralSeed()).toBeNull();
    expect(getClass('mage')).toBe(CLASSES.mage);
    expect(getMonster('dragon')).toBe(MONSTERS.dragon);
    expect(getUpgrade('swift')).toBe(UPGRADES.swift);
    expect(getSubSkill('kn_champion_slam')).toBe(
      ALL_SUBCLASSES.find((s) => s.id === 'kn_champion')!.skills[0],
    );
    expect(procVariant('x', 'y', () => 1)).toBeNull();
  });

  it('serves cached per-run variants while a seed is active, then reverts', () => {
    setProceduralSeed(1234);
    expect(proceduralSeed()).toBe(1234);
    const mage = getClass('mage');
    expect(mage).not.toBe(CLASSES.mage);
    expect(mage.id).toBe('mage');
    expect(getClass('mage')).toBe(mage); // cached — one object per run
    expect(mage).toEqual(classVariant(1234, CLASSES.mage));

    const dragon = getMonster('dragon');
    expect(dragon.name.startsWith('Ancient Dragon, ')).toBe(true);
    expect(getMonster('dragon')).toBe(dragon);
    expect(getMonster('dummy')).toBe(MONSTERS.dummy); // practice target untouched

    const swift = getUpgrade('swift');
    expect(UPGRADE_NAME_BANKS.swift).toContain(swift.name);

    const skill = getSubSkill('kn_champion_slam')!;
    expect(skill.desc).toBe(describeAbility(skill.ability));
    expect(getSubSkill('nope')).toBeUndefined();

    const sub = getSubclass('kn_champion')!;
    expect(sub.skills[0]).toBe(getSubSkill('kn_champion_slam'));
    expect(getSubclass('nope')).toBeUndefined();
    for (const s of subclassesFor('knight')) {
      for (const sk of s.skills) expect(sk.desc).toBe(describeAbility(sk.ability));
    }

    // Re-setting the SAME seed keeps the cache; a new seed re-rolls.
    setProceduralSeed(1234);
    expect(getClass('mage')).toBe(mage);
    setProceduralSeed(99);
    expect(getClass('mage')).not.toBe(mage);

    setProceduralSeed(null);
    expect(getClass('mage')).toBe(CLASSES.mage);
    expect(getMonster('dragon')).toBe(MONSTERS.dragon);
  });

  it('applyUpgrades applies the ROLLED magnitudes while a run is active', () => {
    setProceduralSeed(777);
    const rolled = getUpgrade('swift');
    const p = mkPlayer();
    applyUpgrades(p, ['swift']);
    const q = mkPlayer();
    rolled.apply(q);
    expect(p.moveSpeed).toBe(q.moveSpeed);
  });
});

// ---------------------------------------------------------------------------
// Integration — previews, boons, balance and the sim all follow the roll
// ---------------------------------------------------------------------------

describe('procedural run integration', () => {
  it('previewAbilityTable resolves the rolled kit (HUD = sim)', () => {
    setProceduralSeed(4242);
    const rolled = getClass('mage').abilities;
    const table = previewAbilityTable('mage', []);
    expect(table.a1.name).toBe(rolled.a1.name);
    expect(table.a1.damage).toBe(rolled.a1.damage);
    // The global attack slow-down still applies on top of the roll.
    expect(table.basic.cooldown).toBeCloseTo(rolled.basic.cooldown * ATTACK_CD_SCALE, 6);
    expect(table.a2.cooldown).toBeCloseTo(rolled.a2.cooldown * ATTACK_CD_SCALE, 6);
  });

  it('class boons stack on TOP of the rolled base numbers', () => {
    setProceduralSeed(31337);
    const base = getClass('knight').abilities.basic;
    const table = previewAbilityTable('knight', ['kn_widecleave']);
    expect(table.basic.range).toBe(base.range! + 14);
    expect(table.basic.damage).toBe(base.damage + 5);
  });

  it('an un-upgraded hero still measures power 1 (balance stays centred)', () => {
    setProceduralSeed(2026);
    const world = new World({
      monsterId: 'dragon',
      seed: 1,
      players: [{ peerId: 'h', name: 'H', classId: 'mage' }],
    });
    expect(heroPowerRatio(world.players[0])).toBeCloseTo(1, 6);
  });

  it('the sim spawns heroes and bosses from the rolled defs', () => {
    setProceduralSeed(555);
    const cls = getClass('barbarian');
    const mon = getMonster('troll');
    const world = new World({
      monsterId: 'troll',
      seed: 9,
      players: [{ peerId: 'h', name: 'H', classId: 'barbarian' }],
    });
    expect(world.players[0].maxHp).toBe(cls.maxHp);
    expect(world.players[0].moveSpeed).toBe(cls.moveSpeed);
    expect(world.players[0].abilities!.basic.name).toBe(cls.abilities.basic.name);
    const scaling = computeScaling(1, 0);
    expect(world.boss!.maxHp).toBe(Math.round(mon.baseHp * BOSS_HP_SCALE * scaling.hpMultiplier));
    expect(world.boss!.moveSpeed).toBe(mon.moveSpeed);
    expect(world.monsterDef.name).toBe(mon.name);
  });

  it('two "peers" with the same seed derive the same offers text', () => {
    setProceduralSeed(808);
    const a = { u: getUpgrade('mighty'), c: getClass('rogue').abilities.a1.name };
    setProceduralSeed(null);
    setProceduralSeed(808);
    const b = { u: getUpgrade('mighty'), c: getClass('rogue').abilities.a1.name };
    expect(a.u.name).toBe(b.u.name);
    expect(a.u.desc).toBe(b.u.desc);
    expect(a.c).toBe(b.c);
  });
});

// ---------------------------------------------------------------------------
// Store wiring — setActiveRunSeed is the seed's single choke point
// ---------------------------------------------------------------------------

describe('store wiring', () => {
  it('setActiveRunSeed activates and clears the procedural run', async () => {
    const { useStore } = await import('../src/ui/state/store');
    useStore.getState().setActiveRunSeed(13579);
    expect(proceduralSeed()).toBe(13579);
    expect(useStore.getState().activeRunSeed).toBe(13579);
    expect(getClass('mage')).not.toBe(CLASSES.mage);
    useStore.getState().setActiveRunSeed(null);
    expect(proceduralSeed()).toBeNull();
    expect(getClass('mage')).toBe(CLASSES.mage);
  });

  it('reset() ends the procedural run with the session', async () => {
    const { useStore } = await import('../src/ui/state/store');
    useStore.getState().setActiveRunSeed(24680);
    expect(proceduralSeed()).toBe(24680);
    useStore.getState().reset();
    expect(proceduralSeed()).toBeNull();
    expect(useStore.getState().activeRunSeed).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Raw generator edges
// ---------------------------------------------------------------------------

describe('generator edges', () => {
  it('abilityVariant without a name bank keeps the base name', () => {
    const base = CLASSES.mage.abilities.a1;
    const v = abilityVariant(9, 'edge.test', base);
    expect(v.name).toBe(base.name);
  });

  it('rolls the char-upgrade-only levers (maxRange / freeze) when present', () => {
    // No BASE kit carries these fields — they exist as boon levers — but a
    // rolled def must still jitter them within their envelopes if handed one.
    const base: PlayerAbilityDef = {
      ...CLASSES.mage.abilities.basic,
      maxRange: 800,
      freeze: 1,
    };
    for (const seed of SEEDS) {
      const v = abilityVariant(seed, 'edge.levers', base);
      expect(v.maxRange!).toBeGreaterThanOrEqual(800 * 0.9 - 3);
      expect(v.maxRange!).toBeLessThanOrEqual(800 * 1.12 + 3);
      expect(v.freeze!).toBeGreaterThanOrEqual(0.85 - 0.026);
      expect(v.freeze!).toBeLessThanOrEqual(1.4);
    }
  });

  it('bossAbilityVariant honours the damage compensation direction', () => {
    const base = MONSTERS.dragon.abilities[0];
    const soft = bossAbilityVariant(3, 'dragon', base, 0.8);
    const hard = bossAbilityVariant(3, 'dragon', base, 1.2);
    expect(soft.damage).toBeLessThan(hard.damage);
  });
});
