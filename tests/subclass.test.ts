/**
 * Subclass skills (item 13) + multiclass swap (item 14) — host-authoritative
 * World behaviour, driven directly.
 */
import { describe, it, expect } from 'vitest';
import { World } from '../src/engine/world/world';
import { SIM_DT } from '../src/engine/core/constants';
import {
  getSubSkill,
  subclassOfSkill,
  isSubSkillId,
  subclassesFor,
  subSkillsForClass,
  specialRewardStep,
} from '../src/engine/content/subclasses';
import { previewPlayerStats } from '../src/engine/content/charUpgrades';
import type { UpgradeId } from '../src/engine/content/upgrades';
import type { InputCommand, ClassId } from '../src/engine/core/types';

function input(over: Partial<InputCommand['buttons']>): InputCommand {
  return {
    seq: 1,
    move: { x: 0, y: 0 },
    aim: { x: 0, y: -1 },
    buttons: { basic: false, a1: false, a2: false, a3: false, revive: false, ...over },
  };
}

describe('subclass skills', () => {
  it('binds chosen skills to sub1/sub2 with their own cooldowns', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 1,
      players: [
        {
          peerId: 'a',
          name: 'A',
          classId: 'knight',
          subSkills: ['kn_champion_slam', 'kn_champion_riposte'],
        },
      ],
    });
    const p = w.players[0];
    expect(p.subAbilities?.sub1?.name).toBe(getSubSkill('kn_champion_slam')!.ability.name);
    expect(p.subAbilities?.sub2?.name).toBe(getSubSkill('kn_champion_riposte')!.ability.name);
    expect(p.cooldowns.sub1).toBe(0);
    expect(p.cooldowns.sub2).toBe(0);
    expect(p.subSkillIds).toEqual(['kn_champion_slam', 'kn_champion_riposte']);
  });

  it('firing sub1 casts the skill and puts it on cooldown', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 2,
      players: [{ peerId: 'a', name: 'A', classId: 'knight', subSkills: ['kn_champion_slam'] }],
    });
    // Stand next to the boss so the pbaoe lands.
    w.players[0].pos = { ...w.bosses[0].pos };
    const before = w.bosses[0].hp;
    w.step(SIM_DT, new Map([['a', input({ sub1: true })]]));
    expect(w.players[0].cooldowns.sub1).toBeGreaterThan(0);
    expect(w.bosses[0].hp).toBeLessThan(before); // Earthshaker connected
  });

  it('a silenced hero can only use the basic attack', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 3,
      players: [{ peerId: 'a', name: 'A', classId: 'knight', subSkills: ['kn_champion_slam'] }],
    });
    const p = w.players[0];
    p.buffs.push({ kind: 'silence', mult: 1, remaining: 5, source: 'test' });
    p.pos = { ...w.bosses[0].pos };
    w.step(SIM_DT, new Map([['a', input({ sub1: true, a1: true })]]));
    // Silenced: neither the sub skill nor a1 went on cooldown.
    expect(p.cooldowns.sub1 ?? 0).toBe(0);
    expect(p.cooldowns.a1).toBe(0);
  });
});

describe('multiclass swap', () => {
  function multiWorld() {
    return new World({
      monsterId: 'dragon',
      seed: 5,
      players: [{ peerId: 'a', name: 'A', classId: 'knight', extraClasses: ['mage'] }],
    });
  }

  it('builds a swappable kit per owned class', () => {
    const w = multiWorld();
    const p = w.players[0];
    expect(p.classes).toEqual(['knight', 'mage']);
    expect(p.classTables?.knight?.a1.name).toBe('Taunt');
    expect(p.classTables?.mage?.a1.name).toBe('Fireball');
    expect(p.classId).toBe('knight');
  });

  it('setActiveClass swaps the active kit and preserves per-class cooldowns', () => {
    const w = multiWorld();
    const p = w.players[0];
    p.cooldowns.a1 = 8; // Taunt on cooldown
    w.setActiveClass(p, 'mage');
    expect(p.classId).toBe('mage');
    expect(p.abilities?.a1.name).toBe('Fireball'); // now wielding the mage kit
    expect(p.classCooldowns?.knight?.a1).toBe(8); // knight's Taunt cd was stashed
    // Swaps are instant now (item 7) — an immediate re-swap succeeds and restores
    // the stashed per-class cooldowns (Taunt isn't a damaging slot, so no floor).
    w.setActiveClass(p, 'knight');
    expect(p.classId).toBe('knight');
    expect(p.cooldowns.a1).toBe(8);
  });

  it('persistent stats stay identity-bound across a swap, and the sheet preview agrees (#70)', () => {
    // Multiclass hero spawned as knight (identity) + mage, carrying a few run boons so
    // the stat block is non-trivial. `previewPlayerStats` is exactly what the pause
    // CharacterSheet renders; the fix pins it to the SPAWN class (classes[0]).
    const boons: UpgradeId[] = ['mighty', 'vigor', 'swift'];
    const w = new World({
      monsterId: 'dragon',
      seed: 5,
      players: [
        { peerId: 'a', name: 'A', classId: 'knight', extraClasses: ['mage'], upgrades: boons },
      ],
    });
    const p = w.players[0];
    const liveStats = () => ({
      maxHp: p.maxHp,
      moveSpeed: p.moveSpeed,
      damageMult: p.damageMult,
      cooldownMult: p.cooldownMult,
      castMult: p.castMult,
      damageTakenMult: p.damageTakenMult,
      terrainResist: p.terrainResist,
      regenPerSec: p.regenPerSec,
    });
    const atSpawn = liveStats();
    // The sheet previews the identity (spawn) class — it agrees with the sim at spawn.
    expect(previewPlayerStats('knight', boons, [])).toEqual(atSpawn);

    // Swap to the mage kit: setActiveClass changes only the kit + per-class cooldowns,
    // so the identity-bound persistent stat block must NOT move.
    w.setActiveClass(p, 'mage');
    expect(p.classId).toBe('mage');
    expect(liveStats()).toEqual(atSpawn); // sim stats unchanged by the swap

    // …so the identity-class preview STILL matches the sim after the swap (the fix)…
    expect(previewPlayerStats('knight', boons, [])).toEqual(liveStats());
    // …whereas previewing the ACTIVE (mage) class — the pre-fix behaviour — disagrees,
    // since a mage's base HP pool differs from the knight identity the sim is running.
    expect(previewPlayerStats('mage', boons, []).maxHp).not.toBe(liveStats().maxHp);
  });

  it('requestClassSwap without a target cycles to the next owned class (a tap)', () => {
    const w = multiWorld();
    w.requestClassSwap('a');
    expect(w.players[0].classId).toBe('mage');
  });

  it('requestClassSwap with a target swaps directly to that class (the radial)', () => {
    const w = multiWorld();
    w.requestClassSwap('a', 'mage');
    expect(w.players[0].classId).toBe('mage');
  });

  it('the raw swap button no longer cycles in-sim (the client drives the gesture)', () => {
    const w = multiWorld();
    w.step(SIM_DT, new Map([['a', input({ swap: true })]]));
    expect(w.players[0].classId).toBe('knight');
  });

  it('a sub-slot skill only fires while wielding its owning class (item 14)', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 7,
      players: [
        {
          peerId: 'a',
          name: 'A',
          classId: 'knight',
          extraClasses: ['mage'],
          subSkills: ['kn_champion_slam'], // a KNIGHT subclass skill
        },
      ],
    });
    const p = w.players[0];
    // Swap to mage (which doesn't own the knight sub skill): pressing sub1 is inert.
    w.setActiveClass(p, 'mage');
    p.pos = { ...w.bosses[0].pos };
    w.step(SIM_DT, new Map([['a', input({ sub1: true })]]));
    expect(p.cooldowns.sub1 ?? 0).toBe(0); // dormant on the wrong class

    // Release, swap back to knight, and press again — now it works.
    w.step(SIM_DT, new Map([['a', input({})]]));
    p.swapCd = 0; // clear the post-swap gate
    w.setActiveClass(p, 'knight');
    p.pos = { ...w.bosses[0].pos };
    w.step(SIM_DT, new Map([['a', input({ sub1: true })]]));
    expect(p.cooldowns.sub1 ?? 0).toBeGreaterThan(0); // active on the owning class
  });
});

describe('subclass lookups', () => {
  it('subclassOfSkill resolves a skill id to its parent subclass, else undefined', () => {
    const sub = subclassOfSkill('kn_champion_slam');
    expect(sub).toBeDefined();
    expect(sub!.classId).toBe('knight');
    expect(sub!.skills.some((s) => s.id === 'kn_champion_slam')).toBe(true);
    // Unknown id → optional-chain short-circuits to undefined (no throw).
    expect(subclassOfSkill('not_a_skill')).toBeUndefined();
  });

  it('isSubSkillId accepts real skill ids and rejects junk', () => {
    expect(isSubSkillId('kn_champion_slam')).toBe(true);
    expect(isSubSkillId('not_a_skill')).toBe(false); // a string, but not indexed
    expect(isSubSkillId(42)).toBe(false); // non-string short-circuit
    expect(isSubSkillId(undefined)).toBe(false);
  });

  it('subclassesFor returns a real subclass list, or [] for an unknown class (?? [] guard)', () => {
    expect(subclassesFor('knight').length).toBeGreaterThan(0);
    // A classId with no registered subclasses falls through the `?? []` fallback.
    expect(subclassesFor('nonesuch' as ClassId)).toEqual([]);
  });
});

describe('specialRewardStep — run-clear reward ordering (item 15)', () => {
  const kSub = subclassesFor('knight')[0];
  const mSub = subclassesFor('mage')[0];
  const kFull = [kSub.skills[0].id, kSub.skills[1].id];

  it('groups a hero’s sub skills by owning class', () => {
    const mixed = [kSub.skills[0].id, mSub.skills[0].id];
    expect(subSkillsForClass('knight', mixed)).toEqual([kSub.skills[0].id]);
    expect(subSkillsForClass('mage', mixed)).toEqual([mSub.skills[0].id]);
    expect(subSkillsForClass('mage', ['ghost'])).toEqual([]);
  });

  it('G1 → subclass, G2 → second skill, G3 → class-or-grand (primary class)', () => {
    expect(specialRewardStep('knight', [], [])).toEqual({ kind: 'subclass', classId: 'knight' });
    expect(specialRewardStep('knight', [], [kSub.skills[0].id])).toEqual({
      kind: 'skill2',
      classId: 'knight',
      subclassId: kSub.id,
    });
    expect(specialRewardStep('knight', [], kFull)).toEqual({ kind: 'classOrGrand' });
  });

  it('picking a new class re-enters the subclass flow for it, then loops', () => {
    // Owns mage now but it has no subclass yet → offer mage a subclass (G4).
    expect(specialRewardStep('knight', ['mage'], kFull)).toEqual({
      kind: 'subclass',
      classId: 'mage',
    });
    // Mage gets a skill → its second skill (G5).
    expect(specialRewardStep('knight', ['mage'], [...kFull, mSub.skills[0].id])).toEqual({
      kind: 'skill2',
      classId: 'mage',
      subclassId: mSub.id,
    });
    // Every owned class complete again → class-or-grand (G6).
    expect(
      specialRewardStep('knight', ['mage'], [...kFull, mSub.skills[0].id, mSub.skills[1].id]),
    ).toEqual({ kind: 'classOrGrand' });
  });

  it('an unrecognised sub skill counts for no class (treated as sub-less)', () => {
    expect(specialRewardStep('knight', [], ['ghost'])).toEqual({
      kind: 'subclass',
      classId: 'knight',
    });
  });
});

describe('per-class subclass binding (item 15)', () => {
  const kSkill = subclassesFor('knight')[0].skills[0].id;
  const mSkill = subclassesFor('mage')[0].skills[0].id;

  it('binds only the ACTIVE class subclass skills, and a swap rebinds', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 3,
      players: [
        {
          peerId: 'a',
          name: 'A',
          classId: 'knight',
          extraClasses: ['mage'],
          subSkills: [kSkill, mSkill],
        },
      ],
    });
    const p = w.players[0];
    // On knight: sub1 is the knight skill; the mage skill is dormant.
    expect(p.subAbilities?.sub1?.name).toBe(getSubSkill(kSkill)!.ability.name);
    // The wire carries only the active class's sub skills (HUD binds by index).
    expect(w.serialize().players[0].subSkills).toEqual([kSkill]);

    // Swap to mage: sub1 rebinds to the mage skill.
    w.setActiveClass(p, 'mage');
    expect(p.subAbilities?.sub1?.name).toBe(getSubSkill(mSkill)!.ability.name);
    expect(w.serialize().players[0].subSkills).toEqual([mSkill]);
  });
});

describe('subclass grands transform bound sub-abilities at spawn + across a swap (item 17)', () => {
  it('applies an owned subclass grand to the bound sub-abilities at spawn', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 7,
      players: [
        {
          peerId: 'a',
          name: 'A',
          classId: 'knight',
          subSkills: ['kn_champion_slam', 'kn_champion_riposte'],
          charUpgrades: ['kn_champion_g_a'], // Unbroken Champion
        },
      ],
    });
    const p = w.players[0];
    // Earthshaker (pbaoe dmg 40, r150) → +50% magnitude, +30% area, +25% lifesteal.
    expect(p.subAbilities?.sub1?.damage).toBe(60);
    expect(p.subAbilities?.sub1?.radius).toBe(195);
    expect(p.subAbilities?.sub1?.lifestealFrac).toBeCloseTo(0.25, 5);
    // Riposte (melee dmg 46, range 80) is the second bound Champion skill.
    expect(p.subAbilities?.sub2?.damage).toBe(69);
  });

  it('re-applies each class’s subclass grand when the hero swaps class', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 8,
      players: [
        {
          peerId: 'a',
          name: 'A',
          classId: 'knight',
          extraClasses: ['mage'],
          subSkills: ['kn_champion_slam', 'mg_evoker_lightning'],
          charUpgrades: ['kn_champion_g_a', 'mg_evoker_g_a'],
        },
      ],
    });
    const p = w.players[0];
    // On knight: the Champion grand transforms Earthshaker (dmg 40 → 60).
    expect(p.subAbilities?.sub1?.name).toBe('Earthshaker');
    expect(p.subAbilities?.sub1?.damage).toBe(60);
    // Swap to mage: sub1 rebinds to Lightning Bolt and the Evoker grand transforms it
    // (dmg 40 → round(40 * 1.6) = 64, and a projectile gains a freeze rider).
    w.setActiveClass(p, 'mage');
    expect(p.subAbilities?.sub1?.name).toBe('Lightning Bolt');
    expect(p.subAbilities?.sub1?.damage).toBe(64);
    expect(p.subAbilities?.sub1?.freeze).toBeCloseTo(0.6, 5);
  });
});
