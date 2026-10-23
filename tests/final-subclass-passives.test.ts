import { describe, expect, it } from 'vitest';
import { World } from '../src/engine/world/world';
import { getSubclass } from '../src/engine/content/subclasses';
import { resolvePlayerAbility, spawnZone } from '../src/engine/combat/abilities';
import { damageBoss, damageAdd, damagePlayer, tickBuffs } from '../src/engine/combat/combat';
import {
  onSubclassFinisher,
  setSubclassPassive,
  tickSubclassPassives,
} from '../src/engine/combat/subclassPassives';
import { consumeMartialFinishers } from '../src/engine/combat/martial';
import { grantAbsorption, absorptionAmount } from '../src/engine/combat/absorption';
import { grantFrontGuard } from '../src/engine/combat/defense';
import { decompose, recompose } from '../src/engine/content/forge';
import { buffBadges } from '../src/render/overlays/buffGlyphs';
import type { Add, InputCommand } from '../src/engine/core/types';
const ZERO = { x: 0, y: 0 };
const cohort = ['bb_berserker', 'bb_totem', 'mo_openhand', 'mo_shadow', 'rg_hunter', 'dr_land'];
function setup(id: string, choice = 0) {
  const sub = getSubclass(id)!;
  const w = new World({
    monsterId: 'dragon',
    seed: 21,
    players: [
      { peerId: 'a', name: 'A', classId: sub.classId, subSkills: [sub.skills[choice].id] },
      { peerId: 'b', name: 'B', classId: 'knight' },
    ],
  });
  w.obstacles = [];
  w.terrain = [];
  w.scene = null;
  const [p, ally] = w.players;
  p.pos = { x: 600, y: 400 };
  p.aim = { x: 1, y: 0 };
  p.critChance = 0;
  ally.pos = { x: 650, y: 400 };
  const boss = w.boss!;
  boss.pos = { x: 640, y: 400 };
  boss.hp = boss.maxHp = 10000;
  boss.moveSpeed = 0;
  boss.decisionTimer = 100;
  return { w, p, ally, boss };
}
function momentum(w: World, stacks = 3) {
  const p = w.players[0];
  resolvePlayerAbility(w, p, 'a1', ZERO);
  for (let i = 0; i < stacks; i++) {
    resolvePlayerAbility(w, p, 'basic', ZERO);
    tickBuffs(p, 0.41);
  }
}
function impact(w: World) {
  const shot = w.projectiles.at(-1)!;
  shot.pos = { ...w.boss!.pos };
  (
    w as unknown as { resolvePlayerProjectile: (projectile: typeof shot) => boolean }
  ).resolvePlayerProjectile(shot);
}
function add(w: World): Add {
  const a: Add = {
    id: w.allocId(),
    pos: { ...w.boss!.pos },
    hp: 1000,
    maxHp: 1000,
    moveSpeed: 0,
    radius: 12,
    buffs: [],
    targetId: null,
    attackCd: 0,
  };
  w.adds.push(a);
  return a;
}

describe('final passive cohort: every individual choice works with base kit', () => {
  for (const id of cohort)
    it.each([0, 1, 2, 3])(`${id} choice %i`, (choice) => {
      const { w, p } = setup(id, choice);
      expect(p.subclassPassiveId).toBe(getSubclass(id)!.passive!.id);
      switch (id) {
        case 'bb_berserker':
        case 'bb_totem':
          momentum(w);
          resolvePlayerAbility(w, p, 'a3', ZERO);
          if (id === 'bb_berserker')
            expect(p.buffs.find((b) => b.kind === 'rampage')?.mult).toBe(3);
          else expect(absorptionAmount(p.buffs)).toBeCloseTo(Math.max(20, p.maxHp * 0.1));
          break;
        case 'mo_openhand':
        case 'mo_shadow':
          resolvePlayerAbility(w, p, 'a2', ZERO);
          p.cooldowns.a2 = 5;
          resolvePlayerAbility(w, p, 'a3', ZERO);
          if (id === 'mo_openhand')
            expect(p.buffs.find((b) => b.kind === 'frontGuard')?.mult).toBe(1);
          else expect(p.cooldowns.a2).toBe(3);
          break;
        case 'rg_hunter':
          resolvePlayerAbility(w, p, 'basic', ZERO);
          impact(w);
          expect(w.boss!.buffs.find((b) => b.source === 'hunterQuarry')?.mult).toBe(1.1);
          break;
        case 'dr_land':
          resolvePlayerAbility(w, p, 'a1', ZERO);
          expect(w.groundZones[0].allyBuff?.moveMult).toBe(1.2);
          expect(w.groundZones[0].castSlow).toBe(1.25);
      }
    });
});

describe('Barbarian follow-through and shelter', () => {
  it.each([false, true])(
    'Rampage works with native/composed basics, once (composed=%s)',
    (composed) => {
      const { w, p, boss } = setup('bb_berserker');
      if (composed)
        p.abilities!.basic = recompose(decompose(p.abilities!.basic), p.abilities!.basic);
      momentum(w);
      resolvePlayerAbility(w, p, 'a3', ZERO);
      expect(
        buffBadges(p.buffs).some((b) => b.label.includes('Rampage: next basic cast +30%')),
      ).toBe(true);
      const before = boss.hp;
      resolvePlayerAbility(w, p, 'basic', ZERO);
      expect(before - boss.hp).toBeCloseTo(p.abilities!.basic.damage * 1.35 * 1.3);
      expect(p.buffs.some((b) => b.kind === 'rampage')).toBe(false);
      expect(p.abilities!.basic).not.toHaveProperty('momentumUsed');
    },
  );
  it('misses spend Rampage; expiry and class swaps remove readiness', () => {
    const { w, p, boss } = setup('bb_berserker');
    momentum(w, 1);
    resolvePlayerAbility(w, p, 'a3', ZERO);
    boss.pos.x += 1000;
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(p.buffs.some((b) => b.kind === 'rampage')).toBe(false);
    onSubclassFinisher(w, p, { ...p.abilities!.a3, momentumUsed: 2 });
    tickBuffs(p, 4);
    expect(p.buffs.some((b) => b.kind === 'rampage')).toBe(false);
    onSubclassFinisher(w, p, { ...p.abilities!.a3, momentumUsed: 2 });
    setSubclassPassive(p, undefined);
    expect(p.buffs.some((b) => b.kind === 'rampage')).toBe(false);
  });
  it('rewards all Momentum-spending subclass skills, native and composed', () => {
    for (const id of ['bb_berserker', 'bb_totem'])
      for (let i = 0; i < 4; i++) {
        const { w, p } = setup(id, i);
        if (!p.subAbilities!.sub1!.spendsMomentum) continue;
        p.subAbilities!.sub1 = recompose(decompose(p.subAbilities!.sub1!), p.subAbilities!.sub1!);
        momentum(w, 2);
        resolvePlayerAbility(w, p, 'sub1', ZERO);
        if (id === 'bb_berserker') expect(p.buffs.find((b) => b.kind === 'rampage')?.mult).toBe(2);
        else expect(absorptionAmount(p.buffs)).toBeCloseTo(Math.max(16, p.maxHp * 0.08));
      }
  });
  it('Shelter respects range, living allies, stronger barriers and its gate', () => {
    const { w, p, ally } = setup('bb_totem');
    const ab = { ...p.abilities!.a3, momentumUsed: 3 };
    grantAbsorption(p, 40, 10);
    grantAbsorption(ally, 40, 10);
    onSubclassFinisher(w, p, ab);
    expect(p.subclassPassiveCooldowns?.totem_shelter).toBeUndefined();
    ally.buffs = [];
    ally.pos.x = 1000;
    onSubclassFinisher(w, p, ab);
    expect(absorptionAmount(ally.buffs)).toBe(0);
    ally.pos.x = 650;
    ally.state = 'downed';
    onSubclassFinisher(w, p, ab);
    expect(absorptionAmount(ally.buffs)).toBe(0);
    ally.state = 'alive';
    onSubclassFinisher(w, p, ab);
    expect(absorptionAmount(ally.buffs)).toBeCloseTo(Math.max(20, ally.maxHp * 0.1));
    expect(absorptionAmount(p.buffs)).toBe(40);
    ally.buffs = [];
    onSubclassFinisher(w, p, ab);
    expect(absorptionAmount(ally.buffs)).toBe(0);
    tickSubclassPassives(p, 6);
    onSubclassFinisher(w, p, { ...ab, momentumUsed: 1 });
    expect(absorptionAmount(ally.buffs)).toBeCloseTo(Math.max(12, ally.maxHp * 0.06));
    tickBuffs(ally, 4);
    expect(absorptionAmount(ally.buffs)).toBe(0);
  });
});

describe('Monk passive defense and mobility', () => {
  it('Flowguard preserves stronger guards and blocks only the front', () => {
    const { w, p, boss } = setup('mo_openhand');
    grantFrontGuard(p, 2, 5);
    onSubclassFinisher(w, p, { ...p.abilities!.a1, flowUsed: true });
    expect(p.buffs.find((b) => b.kind === 'frontGuard')?.mult).toBe(2);
    p.buffs = [];
    onSubclassFinisher(w, p, { ...p.abilities!.a1, flowUsed: true });
    const hp = p.hp;
    damagePlayer(w, p, 10, boss.pos);
    expect(p.hp).toBe(hp);
    damagePlayer(w, p, 10, boss.pos);
    expect(p.hp).toBeLessThan(hp);
  });
  it('Shadow Rhythm affects only running equipped movement specials and preserves unused gate', () => {
    const { w, p } = setup('mo_shadow', 1);
    const ab = { ...p.abilities!.a1, flowUsed: true };
    onSubclassFinisher(w, p, ab);
    expect(p.subclassPassiveCooldowns?.shadow_rhythm).toBeUndefined();
    p.cooldowns = { basic: 5, a1: 8, a2: 5, a3: 9, sub1: 1, sub2: 7 };
    onSubclassFinisher(w, p, ab);
    expect(p.cooldowns).toMatchObject({
      basic: 5,
      a1: 8,
      a2: 3,
      a3: 9,
      sub1: 0,
      sub2: 7,
    });
    onSubclassFinisher(w, p, ab);
    expect(p.cooldowns.a2).toBe(3);
    tickSubclassPassives(p, 4);
    onSubclassFinisher(w, p, ab);
    expect(p.cooldowns.a2).toBe(1);
    setSubclassPassive(p, undefined);
    setSubclassPassive(p, 'shadow_rhythm');
    onSubclassFinisher(w, p, ab);
    expect(p.cooldowns.a2).toBe(1);
  });
  it('all Flow-consuming subclass skills grant the same passive on composed paths', () => {
    for (const id of ['mo_openhand', 'mo_shadow'])
      for (let i = 0; i < 4; i++) {
        const { w, p } = setup(id, i);
        if (!p.subAbilities!.sub1!.consumesFlow) continue;
        p.subAbilities!.sub1 = recompose(decompose(p.subAbilities!.sub1!), p.subAbilities!.sub1!);
        resolvePlayerAbility(w, p, 'a2', ZERO);
        p.cooldowns.a2 = 5;
        resolvePlayerAbility(w, p, 'sub1', ZERO);
        if (id === 'mo_openhand') expect(p.buffs.some((b) => b.kind === 'frontGuard')).toBe(true);
        else expect(p.cooldowns.a2).toBe(3);
      }
  });
});

describe('Hunter exposes actual foes for the party', () => {
  it('first hit marks; subsequent party hits benefit; marks never stack between Hunters', () => {
    const { w, p, ally, boss } = setup('rg_hunter');
    const a = add(w);
    damageBoss(w, p, boss, 10, { direct: true });
    expect(boss.hp).toBe(9990);
    damageBoss(w, ally, boss, 10);
    expect(boss.hp).toBe(9979);
    ally.subclassPassiveId = 'hunter_quarry';
    damageBoss(w, ally, boss, 10, { direct: true });
    expect(boss.buffs.filter((b) => b.source === 'hunterQuarry')).toHaveLength(1);
    damageAdd(w, p, a, 10, { direct: true });
    expect(a.hp).toBe(990);
    damageAdd(w, ally, a, 10);
    expect(a.hp).toBe(979);
    tickBuffs(boss, 3);
    damageBoss(w, p, boss, 0, { direct: true });
    expect(boss.buffs).toHaveLength(0);
    damageBoss(w, p, boss, 10);
    expect(boss.buffs).toHaveLength(0);
    boss.buffs.push({ kind: 'invuln', mult: 0, remaining: 1, source: 'test' });
    damageBoss(w, p, boss, 10, { direct: true });
    expect(boss.buffs.some((b) => b.source === 'hunterQuarry')).toBe(false);
  });
});

describe('Land zones preserve authored effects and affiliation', () => {
  it('enhances healing, damage and impact zones while preserving stronger parameters', () => {
    const { w, p } = setup('dr_land');
    spawnZone(w, {
      kind: 'entangle',
      pos: p.pos,
      radius: 100,
      side: 'player',
      ownerId: p.id,
      damagePerTick: 0,
      healPerTick: 0,
      duration: 4,
      color: 0,
      roots: true,
      castSlow: 1.4,
      allyBuff: { defMult: 0.8, moveMult: 1.3, duration: 2 },
    });
    expect(w.groundZones[0]).toMatchObject({
      roots: true,
      castSlow: 1.4,
      allyBuff: { defMult: 0.8, moveMult: 1.3, duration: 2 },
    });
    spawnZone(w, {
      kind: 'sanctuary',
      pos: p.pos,
      radius: 100,
      side: 'boss',
      ownerId: p.id,
      damagePerTick: 0,
      healPerTick: 4,
      duration: 4,
      color: 0,
    });
    expect(w.groundZones[1].allyBuff).toBeUndefined();
    p.hp -= 50;
    resolvePlayerAbility(w, p, 'a2', ZERO);
    expect(w.groundZones.at(-1)?.allyBuff?.moveMult).toBe(1.2);
  });
  it('actual ticks benefit nearby allies and hinder grounded enemies, then expire', () => {
    const { w, p, ally, boss } = setup('dr_land');
    // Dragon is a permanent flyer; a grounded test boss exercises the ground contract.
    boss.monsterId = 'lich';
    spawnZone(w, {
      kind: 'entangle',
      pos: p.pos,
      radius: 100,
      side: 'player',
      ownerId: p.id,
      damagePerTick: 0,
      healPerTick: 0,
      duration: 4,
      color: 0,
    });
    const z = w.groundZones[0];
    (w as unknown as { applyZoneTick: (zone: typeof z) => void }).applyZoneTick(z);
    expect(ally.buffs.some((b) => b.kind === 'moveSpeed' && b.mult === 1.2)).toBe(true);
    expect(boss.buffs.some((b) => b.kind === 'castSlow' && b.mult === 1.25)).toBe(true);
    tickBuffs(ally, 1);
    tickBuffs(boss, 1);
    expect(ally.buffs).toHaveLength(0);
    expect(boss.buffs).toHaveLength(0);
  });
});

it('real edge-triggered input builds Momentum and resolves its reward after wind-up', () => {
  const { w, p } = setup('bb_berserker');
  const step = (slot?: 'basic' | 'a1' | 'a3') => {
    const cmd: InputCommand = {
      seq: 0,
      move: ZERO,
      aim: { x: 1, y: 0 },
      autofire: false,
      buttons: {
        basic: slot === 'basic',
        a1: slot === 'a1',
        a2: false,
        a3: slot === 'a3',
        revive: false,
      },
    };
    w.step(0.05, new Map([['a', cmd]]));
  };
  step('a1');
  step();
  for (let i = 0; i < 3; i++) {
    step('basic');
    while (p.cooldowns.basic > 0) step();
  }
  expect(p.buffs.find((b) => b.kind === 'momentum')?.mult).toBe(3);
  step('a3');
  expect(p.buffs.some((b) => b.kind === 'rampage')).toBe(false);
  for (let j = 0; j < 12; j++) step();
  expect(p.buffs.find((b) => b.kind === 'rampage')?.mult).toBe(3);
  const base = p.abilities!.basic;
  const resolved = consumeMartialFinishers(p, base);
  expect(resolved.damage).toBeCloseTo(base.damage * 1.3);
  expect(resolved.range).toBe(base.range! + 24);
  expect(base).not.toHaveProperty('momentumUsed');
});
