import { afterEach, expect, it } from 'vitest';
import { World } from '../src/engine/world/world';
import { refugeField } from '../src/engine/content/refugeRules';
import {
  clipRefugeStep,
  refugeLive,
  refugeViews,
  tickRefuges,
  reserveRefuge,
  refugeHostile,
} from '../src/engine/combat/refuge';
import { clipBulwarkStep, walkAroundBulwarks } from '../src/engine/combat/apertureMovement';
import { resolveBossAbility, applyImpulse, stepShove } from '../src/engine/combat/abilities';
import { damagePlayer, applyBuff, makeBuff } from '../src/engine/combat/combat';
import { getMonster } from '../src/engine/content/monsters';
import {
  decompose,
  recompose,
  refreshComponents,
  componentValue,
  synthesizeAbility,
  setForgeSeed,
} from '../src/engine/content/forge';
import { describeAbility } from '../src/engine/content/classes';
import {
  applyCharUpgrades,
  previewAbilityTable,
  previewSubAbility,
} from '../src/engine/content/charUpgrades';
import { grandEligible } from '../src/engine/content/grandSelections';
import type { ExtSlot, InputCommand, Add } from '../src/engine/core/types';
import { dist } from '../src/engine/core/torus';
const picks = ['cl_life_bloom', 'cl_life_mend', 'cl_life_preserve', 'cl_life_smite'];
afterEach(() => setForgeSeed(null));
function setup(pick = picks[0], mods = ['cl_life_g_b'], party = 1) {
  const w = new World({
    seed: 31,
    monsterId: 'troll',
    players: Array.from({ length: party }, (_, i) => ({
      peerId: String(i),
      name: 'Life',
      classId: 'cleric' as const,
      subSkills: [pick],
      charUpgrades: mods,
      extraClasses: ['mage' as const],
    })),
  });
  w.scene = null;
  w.obstacles = [];
  w.terrain = [];
  const p = w.players[0],
    b = w.boss!;
  p.pos = { x: 500, y: 400 };
  p.aim = { x: 1, y: 0 };
  b.pos = { x: 1000, y: 400 };
  b.moveSpeed = 0;
  b.decisionTimer = 1000;
  b.hp = b.maxHp = 10000;
  for (const ally of w.players.slice(1)) ally.pos = { x: 500, y: 400 };
  return { w, p, b };
}
function step(w: World, slot?: ExtSlot, dt = 0.01, peer = '0', move = { x: 0, y: 0 }) {
  const buttons: InputCommand['buttons'] = {
    basic: false,
    a1: false,
    a2: false,
    a3: false,
    revive: false,
  };
  if (slot) buttons[slot] = true;
  w.step(
    dt,
    new Map([[peer, { seq: w.tick, buttons, move, aim: { x: 1, y: 0 }, autofire: false }]]),
  );
}
function field() {
  const c = setup();
  step(c.w, 'a2');
  return { ...c, z: c.w.groundZones[0] };
}
function strike(w: World, id: string) {
  const b = w.boss!,
    ab = getMonster('troll').abilities.find((a) => a.id === id)!;
  resolveBossAbility(w, b, ab, {
    kind: 'windup',
    abilityId: id,
    remaining: 0,
    total: ab.windup,
    targetId: w.players[0].id,
    targetPos: { ...w.players[0].pos },
    aimAngle: Math.PI,
    channelAccum: 0,
  });
}
it.each(picks)('every first pick %s prepares a full-health refuge against real pursuit', (pick) => {
  const { w, p, b } = setup(pick);
  step(w, 'a2');
  expect(p.hp).toBe(p.maxHp);
  expect(refugeViews(w)).toHaveLength(1);
  b.pos = { x: 760, y: 400 };
  b.moveSpeed = 180;
  for (let i = 0; i < 160; i++) step(w);
  expect(dist(b.pos, p.pos)).toBeGreaterThanOrEqual(140 + b.radius - 0.01);
  expect(w.serialize().refuges![0].radius).toBe(140);
  expect(p.abilities!.a1.rescueStrike).toBeUndefined();
  expect(p.abilities!.a2.zoneAllyMoveMult).toBeUndefined();
  expect(p.subAbilities!.sub1!.refuge).toBeUndefined();
});
it('without the identity the boss can approach through Sanctuary', () => {
  const { w, p, b } = setup(picks[0], []);
  step(w, 'a2');
  b.pos = { x: 760, y: 400 };
  b.moveSpeed = 180;
  for (let i = 0; i < 160; i++) step(w);
  expect(dist(b.pos, p.pos)).toBeLessThan(140 + b.radius);
});
it('swept entry stops charges and their actual damage path at the visible boundary', () => {
  const { w, p, b } = field();
  b.pos = { x: 900, y: 400 };
  const before = p.hp;
  strike(w, 'charge');
  expect(dist(b.pos, p.pos)).toBeCloseTo(140 + b.radius, 3);
  expect(p.hp).toBe(before);
});
it('melee cannot reach the center, but a large boss area attack can', () => {
  const { w, p, b } = field();
  b.pos = { x: 700.001, y: 400 };
  const before = p.hp;
  strike(w, 'smash');
  expect(p.hp).toBe(before);
  strike(w, 'groundSlam');
  expect(p.hp).toBeLessThan(before);
});
it('damage and healing cross the refuge without an immunity or multiplier', () => {
  const { w, p } = field();
  expect(damagePlayer(w, p, 20, { x: 900, y: 400 })).toBe(20);
  expect(p.hp).toBe(p.maxHp - 20);
  step(w, undefined, 0.55);
  expect(p.hp).toBeGreaterThan(p.maxHp - 20);
});
it('inside bodies are admitted, can leave, and are excluded only on re-entry', () => {
  const { w, b } = field();
  b.pos = { x: 500, y: 400 };
  expect(clipRefugeStep(w, b, { x: 550, y: 400 }).stopped).toBe(false);
  b.pos = clipRefugeStep(w, b, { x: 800, y: 400 }).pos;
  expect(clipRefugeStep(w, b, { x: 500, y: 400 }).stopped).toBe(true);
});
it('allies, static flyers and temporary flight bypass entry; landing inside never ejects', () => {
  const { w, p, b } = field();
  p.pos = { x: 850, y: 400 };
  expect(clipRefugeStep(w, p, { x: 500, y: 400 }).stopped).toBe(false);
  b.pos = { x: 850, y: 400 };
  applyBuff(b, makeBuff('flight', 0, 1, 'test'));
  expect(refugeHostile(w, b)).toBe(false);
  b.pos = clipRefugeStep(w, b, { x: 500, y: 400 }).pos;
  b.buffs = [];
  expect(clipRefugeStep(w, b, { x: 550, y: 400 }).stopped).toBe(false);
  b.monsterId = 'beholder';
  b.pos = { x: 850, y: 400 };
  expect(clipRefugeStep(w, b, { x: 500, y: 400 }).stopped).toBe(false);
});
it('only hostile grounded adds are excluded, not converted followers or unrelated bodies', () => {
  const { w, b } = field();
  const add = { ...b, id: 999, buffs: [], pos: { x: 850, y: 400 } } as unknown as Add;
  w.adds.push(add);
  expect(clipRefugeStep(w, add, { x: 500, y: 400 }).stopped).toBe(true);
  applyBuff(add, makeBuff('flight', 0, 1, 'test'));
  expect(refugeHostile(w, add)).toBe(false);
  add.buffs = [];
  add.charm = { ownerId: w.players[0].id, remaining: 1 } as Add['charm'];
  expect(refugeHostile(w, add)).toBe(false);
  expect(refugeHostile(w, { pos: { x: 850, y: 400 }, radius: 20 })).toBe(false);
});
it('shoves from outside stop at the refuge; shoves from inside can exit', () => {
  const { w, b } = field();
  b.pos = { x: 900, y: 400 };
  applyImpulse(w, b, { x: -1, y: 0 }, 500);
  stepShove(w, b, 1);
  expect(b.pos.x).toBeCloseTo(700, 3);
  expect(b.shove).toBeNull();
  b.pos = { x: 500, y: 400 };
  applyImpulse(w, b, { x: 1, y: 0 }, 300);
  stepShove(w, b, 1);
  expect(b.pos.x).toBeGreaterThan(700);
});
it('a tangent route can take a walking foe around the edge instead of penetrating', () => {
  const { w, b } = field();
  b.pos = { x: 700.01, y: 400 };
  const moved = walkAroundBulwarks(w, b, { x: 699, y: 400 }, 0.01);
  expect(dist(moved, { x: 500, y: 400 })).toBeGreaterThanOrEqual(200);
  expect(moved.y).not.toBe(400);
});
it('coarse movement and torus seams cannot tunnel through a refuge', () => {
  const { w, b, z } = field();
  z.pos = { x: 10, y: 400 };
  b.pos = { x: 250, y: 400 };
  expect(clipRefugeStep(w, b, { x: -250, y: 400 }).stopped).toBe(true);
  expect(clipBulwarkStep(w, b, { x: -250, y: 400 }).stopped).toBe(true);
});
it('ordinary growth and Consecrated Bastion retain healing and offensive use with capped refuge geometry', () => {
  const { w, p } = setup(picks[0], ['cl_life_g_b', 'cl_sanctuary', 'cl_gk_a2_b']);
  p.abilities!.a2.radius = 260;
  p.abilities!.a2.zoneDuration = 8;
  step(w, 'a2');
  expect(refugeViews(w)[0].radius).toBe(180);
  expect(w.groundZones[0].radius).toBe(260);
  for (let i = 0; i < 410; i++) step(w);
  expect(refugeViews(w)).toEqual([]);
  expect(w.groundZones.length).toBeGreaterThan(0);
});
it('a new owned refuge replaces only the old boundary while another owner keeps theirs', () => {
  const { w, p } = setup(picks[0], ['cl_life_g_b'], 2);
  step(w, 'a2');
  step(w, 'a2', 0.01, '1');
  expect(refugeViews(w)).toHaveLength(2);
  p.cooldowns.a2 = 0;
  step(w);
  step(w, 'a2');
  expect(w.groundZones).toHaveLength(3);
  expect(refugeViews(w)).toHaveLength(2);
});
it.each([
  'down',
  'class',
  'source',
  'epoch',
  'disconnect',
  'dead',
  'finished',
  'scene',
  'removed',
  'expired',
  'spent',
  'side',
  'heal',
  'follow',
])('refuge ends on %s', (mode) => {
  const { w, p, z } = field();
  if (mode === 'down') p.state = 'downed';
  if (mode === 'class') w.setActiveClass(p, 'mage');
  if (mode === 'source') p.abilities!.a2 = { ...p.abilities!.a2 };
  if (mode === 'epoch') p.castEpoch = 10;
  if (mode === 'disconnect') w.players = [];
  if (mode === 'dead') p.hp = 0;
  if (mode === 'finished') w.finished = true;
  if (mode === 'scene') w.scene = 'rewards' as World['scene'];
  if (mode === 'removed') w.groundZones = [];
  if (mode === 'expired') z.remaining = 0;
  if (mode === 'spent') z.refuge!.remaining = 0;
  if (mode === 'side') z.side = 'boss';
  if (mode === 'heal') z.healPerTick = 0;
  if (mode === 'follow') z.zoneFollow = 2;
  expect(refugeViews(w)).toEqual([]);
  tickRefuges(w, 0.01);
  if (mode !== 'removed') expect(z.refuge).toBeUndefined();
});
it('an arming field begins refuge time only once armed, and metadata-free fields are inert', () => {
  const { w, z } = field();
  z.armRemaining = 1;
  tickRefuges(w, 0.5);
  expect(z.refuge!.remaining).toBe(4);
  expect(refugeLive(w, z)).toBe(false);
  z.armRemaining = 0;
  tickRefuges(w, 0.1);
  expect(z.refuge!.remaining).toBeCloseTo(3.9);
  delete z.refuge;
  tickRefuges(w, 1);
  expect(refugeLive(w, z)).toBe(false);
});
it('copies and actual Forge synthesis retain one paid refuge without Life passive', () => {
  const { w, p, b } = setup();
  const native = p.abilities!.a2,
    comp = decompose(native);
  expect(
    componentValue(comp) -
      componentValue({ ...comp, effects: comp.effects.filter((e) => e.kind !== 'refuge') }),
  ).toBe(40);
  let made;
  for (let seed = 0; seed < 128 && !made; seed++) {
    const a = synthesizeAbility(
      seed,
      'refuge',
      'a2',
      ['A', 'B', 'C'].map((name) => ({
        name,
        classId: 'cleric' as const,
        className: 'Cleric',
        slot: 'a2',
        def: native,
      })),
      new Set(['groundZone']),
    ).def;
    if (refugeField(a)) made = a;
  }
  if (!made) throw Error('No synthesized refuge');
  w.setActiveClass(p, 'mage');
  p.abilities!.a2 = made;
  p.cooldowns.a2 = 0;
  step(w, 'a2');
  expect(refugeViews(w)).toHaveLength(1);
  b.pos = { x: 1000, y: 400 };
  expect(clipRefugeStep(w, b, { x: 500, y: 400 }).stopped).toBe(true);
  expect(describeAbility(made)).toContain('grounded enemies cannot enter');
  expect(refreshComponents(made).effects.some((e) => e.kind === 'refuge')).toBe(true);
  const invalid = [
    { ...comp, delivery: { kind: 'projectile' as const } },
    { ...comp, effects: comp.effects.filter((e) => e.kind !== 'zone') },
    {
      ...comp,
      effects: comp.effects.map((e) =>
        e.kind === 'zone' ? { ...e, zone: { ...e.zone, zoneFollow: 2 } } : e,
      ),
    },
  ];
  for (const c of invalid) {
    const a = recompose(c, { slot: 'a2', name: 'Invalid', cooldown: 8 });
    expect(refugeField(a)).toBe(false);
    expect(describeAbility(a)).not.toContain('enemies cannot enter');
  }
  expect(refugeField(recompose(comp, { slot: 'basic', name: 'Basic', cooldown: 1 }))).toBe(false);
});
it('earning the identity refreshes an existing composed healing field and duplicate profiles price once', () => {
  const { w, p } = setup(picks[0], []);
  p.abilities!.a2 = recompose(decompose(p.abilities!.a2), {
    slot: 'a2',
    name: 'Composed',
    cooldown: 14,
  });
  applyCharUpgrades(p, ['cl_life_g_b']);
  step(w, 'a2');
  expect(refugeViews(w)).toHaveLength(1);
  const comp = decompose(p.abilities!.a2);
  const duplicate = recompose(
    { ...comp, effects: [...comp.effects, { kind: 'refuge' }] },
    { slot: 'a2', name: 'Duplicate', cooldown: 14 },
  );
  expect(duplicate.components!.effects.filter((e) => e.kind === 'refuge')).toHaveLength(1);
});
it('invalid or unbound receiving abilities cannot reserve refuge metadata', () => {
  const { w, p } = setup();
  expect(reserveRefuge(w, p, p.abilities!.a1)).toBeUndefined();
  expect(reserveRefuge(w, p, { ...p.abilities!.a2, slot: 'sub2' })).toBeUndefined();
  const comp = decompose(p.abilities!.a2);
  for (const effects of [
    comp.effects.filter((e) => e.kind !== 'refuge'),
    comp.effects.filter((e) => e.kind !== 'zone'),
    comp.effects.map((e) =>
      e.kind === 'zone' ? { ...e, zone: { ...e.zone, tickHeal: undefined } } : e,
    ),
  ])
    expect(refugeField({ ...p.abilities!.a2, components: { ...comp, effects } })).toBe(false);
});
it('Forge eligibility is honest when no stationary base healing field survives', () => {
  for (const seed of [1, 7, 29]) {
    setForgeSeed(seed);
    const base = previewAbilityTable('cleric', ['cl_life_g_b']);
    expect(
      grandEligible('cl_life_g_b', 'cleric', {
        classes: ['cleric'],
        history: [],
        subSkills: [picks[0]],
      }),
    ).toBe(Object.values(base).some(refugeField));
  }
  expect(previewSubAbility('cl_life_bloom', ['cl_life_g_b'])!.refuge).toBeUndefined();
});

it('an enclosed detour stops at contact only until the finite refuge expires', () => {
  const { w, b } = field();
  b.pos = { x: 700.01, y: 400 };
  w.obstacles = [
    { id: 901, pos: { x: 700, y: 350 }, radius: 48, kind: 'pillar', variant: 0 },
    { id: 902, pos: { x: 700, y: 450 }, radius: 48, kind: 'pillar', variant: 0 },
  ];
  const pos = walkAroundBulwarks(w, b, { x: 690, y: 400 }, 0.1);
  expect(pos.x).toBeGreaterThanOrEqual(700 - 0.001);
  tickRefuges(w, 4.1);
  w.obstacles = [];
  b.pos = pos;
  expect(walkAroundBulwarks(w, b, { x: 690, y: 400 }, 0.1).x).toBe(690);
});
it('Font consumption removes the refuge and still performs its stock-free solo rescue', () => {
  const { w, p } = setup(picks[0], ['cl_life_g_b', 'cl_life_g_a']);
  w.reviveBudget = 0;
  step(w, 'a2');
  expect(refugeViews(w)).toHaveLength(1);
  p.hp = 0;
  step(w);
  expect(p.state).toBe('downed');
  expect(w.fontRescues).toHaveLength(1);
  expect(refugeViews(w)).toEqual([]);
  for (let i = 0; i < 310; i++) step(w);
  expect(p.state).toBe('alive');
  expect(w.reviveBudget).toBe(0);
});
it('losing the refuge payload itself invalidates an otherwise unchanged source', () => {
  const { w, p, z } = field();
  delete p.abilities!.a2.refuge;
  expect(refugeLive(w, z)).toBe(false);
});
