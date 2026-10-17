import { describe, expect, it, vi } from 'vitest';
import { getMonster, abilityById } from '../src/engine/content/monsters';
import { World } from '../src/engine/world/world';
import {
  grantAbsorption,
  absorptionAmount,
  absorbDamage,
  maintainAbsorption,
} from '../src/engine/combat/absorption';
import { damagePlayer, applyBuff, makeBuff, tickBuffs } from '../src/engine/combat/combat';
import { beamTick, resolvePlayerAbility } from '../src/engine/combat/abilities';
import { healSupportAlly } from '../src/engine/combat/support';
import {
  armMartialUtility,
  onMartialHit,
  consumeMartialFinishers,
} from '../src/engine/combat/martial';
import { getClass, describeAbility } from '../src/engine/content/classes';
import { getSubSkill } from '../src/engine/content/subclasses';
import {
  decompose,
  recompose,
  refreshComponents,
  componentValue,
  describeComposed,
  synthesizeAbility,
  abilityCapability,
} from '../src/engine/content/forge';
import { previewSubAbility } from '../src/engine/content/charUpgrades';
import { heroPowerRatio } from '../src/engine/content/balance';
import type { GroundZone, Player } from '../src/engine/core/types';
const ZERO = { x: 0, y: 0 };
const sub = (id: string) => ({ ...getSubSkill(id)!.ability, slot: 'sub1' as const });
function setup() {
  const w = new World({
    monsterId: 'dragon',
    seed: 5,
    players: [
      { peerId: 'a', name: 'A', classId: 'cleric' },
      { peerId: 'b', name: 'B', classId: 'knight' },
      { peerId: 'c', name: 'C', classId: 'monk' },
    ],
  });
  const [p, a, far] = w.players;
  for (const [i, q] of w.players.entries()) {
    q.hp = q.maxHp = 100;
    q.pos = { x: 600 + i * 30, y: 400 };
  }
  far.pos.x = 1100;
  w.terrain = [];
  w.obstacles = [];
  w.boss!.pos = { x: 1000, y: 700 };
  return { w, p, a, far };
}
const amount = (p: Player) => absorptionAmount(p.buffs);
const tickZone = (w: World, z: GroundZone) =>
  (w as unknown as { applyZoneTick: (z: GroundZone) => void }).applyZoneTick(z);
const down = (w: World) =>
  (w as unknown as { checkDownedTransitions: () => void }).checkDownedTransitions();

describe('bounded absorption', () => {
  it('keeps the strongest cast, shared cap, and no free refresh from weaker casts', () => {
    const { p } = setup();
    expect(grantAbsorption(p, 20, 4)).toBe(20);
    expect(grantAbsorption(p, 10, 6)).toBe(0);
    expect(p.buffs[0].remaining).toBe(4);
    expect(grantAbsorption(p, 100, 5)).toBe(30);
    expect(amount(p)).toBe(50);
    expect(p.maxHp).toBe(100);
    expect(p.hp).toBe(100);
    expect(p.buffs).toHaveLength(1);
    expect(grantAbsorption(p, 10, 3, true)).toBe(0);
    expect(amount(p)).toBe(50);
    p.buffs = [];
    expect(grantAbsorption(p, 10, 3, true)).toBe(10);
    expect(grantAbsorption(p, 10, 3, true)).toBe(10);
    expect(amount(p)).toBe(20);
    expect(grantAbsorption(p, 20, 3, true)).toBe(10);
    expect(amount(p)).toBe(30);
    tickBuffs(p, 3);
    expect(amount(p)).toBe(0);
  });
  it('rejects invalid grants and expires stale pools without reviving a player', () => {
    const { p } = setup();
    expect(grantAbsorption(p, 0, 2)).toBe(0);
    expect(grantAbsorption(p, 10, 0)).toBe(0);
    p.hp = 0;
    expect(grantAbsorption(p, 10, 2)).toBe(0);
    p.hp = 20;
    p.state = 'downed';
    expect(grantAbsorption(p, 10, 2)).toBe(0);
    p.state = 'alive';
    p.buffs = [makeBuff('absorption', 25, 0, 'old')];
    expect(amount(p)).toBe(0);
    expect(absorbDamage(p, 10)).toBe(10);
    expect(grantAbsorption(p, 10, 2)).toBe(10);
    expect(p.buffs).toHaveLength(1);
    p.maxHp = 20;
    maintainAbsorption(p);
    expect(amount(p)).toBe(10);
    p.state = 'dead';
    maintainAbsorption(p);
    expect(amount(p)).toBe(0);
  });
  it('applies mitigation first, preserves the pool through invulnerability, and preserves contact hooks without reporting HP damage', () => {
    const { w, p } = setup();
    const hook = vi.spyOn(w, 'onPlayerDamaged');
    grantAbsorption(p, 30, 5);
    applyBuff(p, makeBuff('damageTaken', 0.5, 5, 'def'));
    p.damageTakenMult = 0.5;
    applyBuff(p, makeBuff('invuln', 0, 1, 'test'));
    expect(damagePlayer(w, p, 100)).toBe(0);
    expect(amount(p)).toBe(30);
    p.buffs = p.buffs.filter((b) => b.kind !== 'invuln');
    expect(damagePlayer(w, p, 100)).toBe(0);
    expect(amount(p)).toBe(5);
    expect(p.hp).toBe(100);
    expect(hook).toHaveBeenCalledTimes(1);
    expect(damagePlayer(w, p, 40)).toBe(5);
    expect(p.hp).toBe(95);
    expect(amount(p)).toBe(0);
    expect(hook).toHaveBeenCalledTimes(2);
    expect(w.events.filter((e) => e.t === 'hit')).toMatchObject([{ amount: 5 }]);
    p.state = 'downed';
    expect(damagePlayer(w, p, 40)).toBe(0);
  });
  it('preserves guarded counters on absorbed contact without enemy lifesteal credit', () => {
    const { w, p } = setup();
    armMartialUtility(p, getClass('knight').abilities.a2);
    grantAbsorption(p, 30, 4);
    expect(damagePlayer(w, p, 20)).toBe(0);
    expect(p.buffs.some((b) => b.kind === 'counter')).toBe(true);
    expect(damagePlayer(w, p, 20)).toBe(10);
    expect(p.buffs.some((b) => b.kind === 'counter')).toBe(true);
    expect(absorbDamage(p, 0)).toBe(0);
  });
  it('lethal overflow cannot trigger a counter; environmental downing and Phoenix revive clear protection', () => {
    const { w, p } = setup();
    p.hp = 5;
    grantAbsorption(p, 30, 4);
    armMartialUtility(p, getClass('knight').abilities.a2);
    expect(damagePlayer(w, p, 36)).toBe(6);
    expect(p.hp).toBe(-1);
    expect(p.buffs.some((b) => b.kind === 'counter')).toBe(false);
    down(w);
    expect(p.state).toBe('downed');
    p.state = 'alive';
    p.hp = 50;
    grantAbsorption(p, 20, 4);
    p.hp = 0;
    down(w);
    expect(amount(p)).toBe(0);
    p.state = 'alive';
    p.hp = 50;
    grantAbsorption(p, 20, 4);
    p.selfRevives = 1;
    p.hp = 0;
    down(w);
    expect(p.state).toBe('alive');
    expect(p.hp).toBeGreaterThan(0);
    expect(amount(p)).toBe(0);
  });
});

describe('Cleric bubbles', () => {
  it('rescue grants a bubble from effective healing only, without extra healing score or threat', () => {
    const { w, p, a } = setup();
    a.hp = 20;
    const healed = healSupportAlly(w, p, a, 60, p.abilities!.a1);
    expect(healed).toBe(78);
    expect(amount(a)).toBe(45);
    expect(p.stats.healingDone).toBe(78);
    expect(a.buffs.some((b) => b.kind === 'damageTaken')).toBe(false);
    const score = p.stats.healingDone;
    healSupportAlly(w, p, a, 60, p.abilities!.a1);
    expect(p.stats.healingDone - score).toBe(2);
    expect(amount(a)).toBe(45.5);
    a.hp = a.maxHp;
    expect(healSupportAlly(w, p, a, 60, p.abilities!.a1)).toBe(0);
  });
  it.each([false, true])('casts distinct targeted/group bubbles, composed=%s', (composed) => {
    const { w, p, a, far } = setup();
    a.hp = 20;
    const use = (id: string) => {
      const ab = sub(id);
      p.subAbilities = { sub1: composed ? recompose(decompose(ab), ab) : ab };
      resolvePlayerAbility(w, p, 'sub1', ZERO);
    };
    use('cl_light_warding');
    expect(amount(a)).toBe(50);
    expect(amount(p)).toBe(0);
    expect(amount(far)).toBe(0);
    a.buffs = [];
    use('cl_life_preserve');
    expect(amount(p)).toBe(50);
    expect(amount(a)).toBe(50);
    expect(amount(far)).toBe(0);
    expect(p.stats.healingDone).toBe(0);
    expect(p.threat).toBe(0);
    a.state = 'downed';
    a.buffs = [];
    use('cl_life_preserve');
    expect(amount(a)).toBe(0);
  });
  it.each([false, true])(
    'only unused Sanctuary healing becomes shared capped absorption, composed=%s',
    (composed) => {
      const { w, p, a, far } = setup();
      const ab = p.abilities!.a2;
      p.abilities!.a2 = composed ? recompose(decompose(ab), ab) : ab;
      a.hp = 95;
      resolvePlayerAbility(w, p, 'a2', ZERO);
      const z = w.groundZones[0];
      expect(z.overflowShield).toBe(true);
      tickZone(w, z);
      expect(a.hp).toBe(100);
      expect(amount(a)).toBe(9);
      expect(amount(p)).toBe(14);
      expect(amount(far)).toBe(0);
      expect(p.stats.healingDone).toBe(5);
      tickZone(w, z);
      tickZone(w, z);
      expect(amount(p)).toBe(30);
      expect(amount(a)).toBe(30);
      tickBuffs(p, 1);
      tickZone(w, z);
      expect(p.buffs.find((b) => b.kind === 'absorption')!.remaining).toBe(6);
      // Same target ceiling across a different caster's overlapping zone.
      tickZone(w, { ...z, ownerId: a.id });
      expect(amount(p)).toBe(30);
      p.buffs = [];
      tickZone(w, { ...z, overflowShield: false });
      expect(amount(p)).toBe(0);
      a.state = 'dead';
      tickZone(w, { ...z, ownerId: a.id });
      expect(amount(p)).toBe(0);
      tickZone(w, { ...z, ownerId: 999 });
      expect(amount(p)).toBe(0);
    },
  );
  it('carries absorption through snapshots and clamps max-HP changes on timer ticks', () => {
    const { w, p } = setup();
    grantAbsorption(p, 30, 4);
    const snap = w.serialize();
    expect(snap.players.find((q) => q.id === p.id)!.buffs).toContainEqual({
      kind: 'absorption',
      mult: 30,
      remaining: 4,
    });
    p.maxHp = 50;
    (w as unknown as { tickTimers: (dt: number) => void }).tickTimers(0.1);
    expect(amount(p)).toBe(25);
  });
  it('keeps copied skill upgrades functional without mutating the source skill', () => {
    const original = sub('cl_light_warding');
    const upgraded = previewSubAbility('cl_light_warding', ['subup_cl_light_warding'])!;
    expect(upgraded.absorption!.amount).toBeGreaterThan(original.absorption!.amount);
    expect(upgraded.range).toBeGreaterThan(original.range!);
    expect(sub('cl_light_warding')).toEqual(original);
    expect(abilityCapability(original)).toBe('allyBuff');
    expect(abilityCapability(recompose(decompose(original), original))).toBe('allyBuff');
    const { p } = setup();
    const plain = heroPowerRatio(p);
    p.subAbilities = { sub1: original };
    expect(heroPowerRatio(p)).toBeGreaterThan(plain);
  });
});

it('Chain Pull spends momentum on damage and reach without changing the authored pull', () => {
  const { p } = setup();
  armMartialUtility(p, getClass('barbarian').abilities.a1);
  for (let i = 0; i < 3; i++) {
    p.buffs = p.buffs.filter((b) => b.kind !== 'momentumBeat');
    onMartialHit(p, 10, true);
  }
  const ab = sub('bb_berserker_chain');
  const boosted = consumeMartialFinishers(p, ab);
  expect(boosted.damage).toBeCloseTo(36.4);
  expect(boosted.range).toBe(244);
  expect(boosted.pull).toBe(200);
  expect(ab.range).toBe(220);
  expect(p.buffs.some((b) => b.kind === 'momentum')).toBe(false);
});

it.each(['cl_light_warding', 'cl_life_preserve'])(
  'preserves, prices and describes %s through Forge refresh/synthesis',
  (id) => {
    const ab = sub(id);
    const comp = decompose(ab);
    expect(componentValue(comp)).toBeGreaterThan(0);
    expect(describeAbility(ab)).toContain('absorption');
    expect(describeComposed(comp, ab.cooldown)).toContain('absorption');
    const rebuilt = recompose(comp, ab);
    expect(rebuilt.absorption).toEqual(ab.absorption);
    rebuilt.absorption = { ...rebuilt.absorption!, amount: 50 };
    expect(recompose(refreshComponents(rebuilt), rebuilt).absorption!.amount).toBe(50);
    rebuilt.absorption = undefined;
    expect(recompose(refreshComponents(rebuilt), rebuilt).absorption).toEqual(ab.absorption);
    for (let seed = 0; seed < 40; seed++) {
      const rolled = synthesizeAbility(seed, 'bubble', 'a1', [
        { name: ab.name, classId: 'cleric', className: 'Cleric', slot: 'a1', def: ab },
      ]);
      expect(componentValue(decompose(rolled.def))).toBeGreaterThan(0);
    }
  },
);

it('boss Life Drain heals only damage reaching health, not the absorption pool', () => {
  const { w, p } = setup();
  const boss = w.boss!;
  boss.pos = { ...p.pos };
  boss.hp = boss.maxHp - 100;
  boss.healScale = 1;
  boss.dmgScale = 1;
  vi.spyOn(w, 'bossDamageScalar').mockReturnValue(1);
  const ability = { ...abilityById(getMonster('lich'), 'lifeDrain')!, damage: 10 };
  const action = {
    kind: 'channel' as const,
    abilityId: 'lifeDrain',
    remaining: 1,
    total: 1,
    targetId: p.id,
    targetPos: null,
    aimAngle: 0,
    channelAccum: 0,
  };
  grantAbsorption(p, 15, 3);
  const start = boss.hp;
  expect(beamTick(w, boss, ability, action)).toBe(0);
  expect(boss.hp).toBe(start);
  expect(beamTick(w, boss, ability, action)).toBe(5);
  expect(boss.hp).toBe(start + 5);
});

it('zero hits leave a live pool untouched and expired shields never absorb', () => {
  const { p } = setup();
  grantAbsorption(p, 20, 4);
  expect(absorbDamage(p, 0)).toBe(0);
  expect(amount(p)).toBe(20);
  p.buffs[0].remaining = 0;
  expect(absorbDamage(p, 10)).toBe(10);
});

it('keeps Sanctuary overflow on a Forge projectile impact zone', () => {
  const { w, p } = setup();
  const zone = decompose(p.abilities!.a2).effects.find((e) => e.kind === 'zone')!;
  p.abilities!.basic = recompose(
    {
      delivery: { kind: 'projectile', projSpeed: 500 },
      effects: [{ kind: 'damage', amount: 1 }, zone],
    },
    p.abilities!.basic,
  );
  resolvePlayerAbility(w, p, 'basic', ZERO);
  const shot = w.projectiles[0];
  expect(shot.onImpact?.overflowShield).toBe(true);
  (w as unknown as { spawnImpactZone: (p: typeof shot) => void }).spawnImpactZone(shot);
  const spawned = w.groundZones[0];
  expect(spawned.overflowShield).toBe(true);
  spawned.pos = { ...p.pos };
  tickZone(w, spawned);
  expect(amount(p)).toBe(14);
});

it('ordinary heal bubbles add to existing protection and combine with the rescue bonus', () => {
  const { w, p, a } = setup();
  a.hp = 60;
  healSupportAlly(w, p, a, 10, p.abilities!.a1);
  expect(amount(a)).toBe(2.5);
  healSupportAlly(w, p, a, 10, p.abilities!.a1);
  expect(amount(a)).toBe(5);
  a.hp = 20;
  healSupportAlly(w, p, a, 60, p.abilities!.a1);
  expect(amount(a)).toBe(50);
  expect(a.buffs.find((b) => b.kind === 'absorption')!.remaining).toBe(6);
  a.hp = a.maxHp;
  const score = p.stats.healingDone;
  healSupportAlly(w, p, a, 60, p.abilities!.a1);
  expect(p.stats.healingDone).toBe(score);
  expect(amount(a)).toBe(50);
  tickBuffs(a, 6);
  expect(amount(a)).toBe(0);
});
