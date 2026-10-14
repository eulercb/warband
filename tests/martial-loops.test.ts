import { describe, it, expect } from 'vitest';
import { World } from '../src/engine/world/world';
import { resolvePlayerAbility } from '../src/engine/combat/abilities';
import {
  damagePlayer,
  applyBuff,
  makeBuff,
  tickBuffs,
  damageBoss,
  damageAdd,
} from '../src/engine/combat/combat';
import {
  armMartialUtility,
  prepareMartialFlow,
  consumeMartialFinishers,
} from '../src/engine/combat/martial';
import { getClass, describeAbility } from '../src/engine/content/classes';
import { getSubSkill } from '../src/engine/content/subclasses';
import { applyCharUpgrades } from '../src/engine/content/charUpgrades';
import {
  decompose,
  recompose,
  refreshComponents,
  componentValue,
} from '../src/engine/content/forge';
import { computeBotInput } from '../src/engine/ai/bot';
import { buffBadges } from '../src/render/overlays/buffGlyphs';
import type { Add, ClassId, ExtSlot, Player, Projectile } from '../src/engine/core/types';
const ZERO = { x: 0, y: 0 };
function world(classId: ClassId) {
  const w = new World({
    monsterId: 'dragon',
    seed: 5,
    players: [{ peerId: 'a', name: 'A', classId, extraClasses: ['knight', 'monk'] }],
  });
  const p = w.players[0];
  p.pos = { x: 600, y: 400 };
  p.aim = { x: 1, y: 0 };
  p.critChance = 0;
  w.boss!.pos = { x: 640, y: 400 };
  w.boss!.hp = w.boss!.maxHp = 10000;
  w.boss!.facing = Math.PI;
  return w;
}
function use(w: World, slot: ExtSlot) {
  (
    w as unknown as { tryUseAbility: (p: Player, s: ExtSlot, v: typeof ZERO) => void }
  ).tryUseAbility(w.players[0], slot, ZERO);
}
function tick(w: World, dt: number) {
  (w as unknown as { tickTimers: (dt: number) => void }).tickTimers(dt);
}
function impact(w: World, proj: Projectile) {
  return (
    w as unknown as { resolvePlayerProjectile: (p: Projectile) => boolean }
  ).resolvePlayerProjectile(proj);
}
function add(w: World, x = 640): Add {
  const a: Add = {
    id: w.allocId(),
    pos: { x, y: 400 },
    hp: 1000,
    maxHp: 1000,
    radius: 12,
    moveSpeed: 0,
    targetId: null,
    attackCd: 0,
    buffs: [],
  };
  w.adds.push(a);
  return a;
}
function sub(w: World, id: string) {
  w.players[0].subAbilities = { sub1: { ...getSubSkill(id)!.ability, slot: 'sub1' } };
}

describe('Knight guarded counter', () => {
  it('a real guarded hit readies one stronger melee counter while retaining mitigation', () => {
    const w = world('knight');
    const p = w.players[0];
    resolvePlayerAbility(w, p, 'a2', ZERO);
    const hp = p.hp;
    damagePlayer(w, p, 40);
    expect(p.hp).toBe(hp - 20);
    expect(p.buffs.some((b) => b.kind === 'counter')).toBe(true);
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(w.boss!.hp).toBeCloseTo(10000 - 22 * 1.3);
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(w.boss!.hp).toBeCloseTo(10000 - 22 * 2.3);
    expect(p.buffs.some((b) => b.kind === 'counter')).toBe(false);
  });
  it('dodges, zero damage, and lethal damage cannot manufacture a counter', () => {
    const w = world('knight');
    const p = w.players[0];
    resolvePlayerAbility(w, p, 'a2', ZERO);
    damagePlayer(w, p, 0);
    expect(p.buffs.some((b) => b.kind === 'guard')).toBe(true);
    applyBuff(p, makeBuff('invuln', 0, 1, 'dodge'));
    damagePlayer(w, p, 30);
    expect(p.buffs.some((b) => b.kind === 'counter')).toBe(false);
    tickBuffs(p, 1.1);
    damagePlayer(w, p, 10000);
    expect(p.buffs.some((b) => b.kind === 'counter')).toBe(false);
  });
  it('misses, invulnerability, zero outgoing damage, and ranged hits preserve readiness; adds consume it', () => {
    const w = world('knight');
    const p = w.players[0];
    resolvePlayerAbility(w, p, 'a2', ZERO);
    damagePlayer(w, p, 10);
    p.aim = { x: -1, y: 0 };
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(p.buffs.some((b) => b.kind === 'counter')).toBe(true);
    applyBuff(w.boss!, makeBuff('invuln', 0, 1, 'immune'));
    p.aim = { x: 1, y: 0 };
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(p.buffs.some((b) => b.kind === 'counter')).toBe(true);
    tickBuffs(w.boss!, 2);
    damageBoss(w, p, w.boss!, 0, { melee: true });
    damageBoss(w, p, w.boss!, 10);
    expect(p.buffs.some((b) => b.kind === 'counter')).toBe(true);
    const a = add(w);
    damageAdd(w, p, a, 10, { melee: true });
    expect(a.hp).toBe(987);
    expect(p.buffs.some((b) => b.kind === 'counter')).toBe(false);
  });
  it('one guarded hit per cast and timed readiness do not stack or refresh from later damage', () => {
    const w = world('knight');
    const p = w.players[0];
    resolvePlayerAbility(w, p, 'a2', ZERO);
    damagePlayer(w, p, 10);
    tickBuffs(p, 1);
    damagePlayer(w, p, 10);
    expect(p.buffs.find((b) => b.kind === 'counter')!.remaining).toBe(3);
    tickBuffs(p, 3.1);
    expect(p.buffs.some((b) => b.kind === 'counter')).toBe(false);
    damagePlayer(w, p, 10);
    expect(p.buffs.some((b) => b.kind === 'counter')).toBe(false);
  });
  it('Battlemaster Rally and copied defenses carry the behavior, while ordinary defenses do not', () => {
    const w = world('ranger');
    const p = w.players[0];
    sub(w, 'kn_battle_rally');
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    damagePlayer(w, p, 10);
    expect(p.buffs.some((b) => b.kind === 'counter')).toBe(true);
    p.abilities!.basic = { ...getClass('knight').abilities.basic };
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(w.boss!.hp).toBeCloseTo(9971.4);
    p.buffs = [];
    p.abilities!.a2 = { ...getClass('paladin').abilities.a3 };
    resolvePlayerAbility(w, p, 'a2', ZERO);
    damagePlayer(w, p, 10);
    expect(p.buffs.some((b) => b.kind === 'counter')).toBe(false);
  });
});

describe('Ranger firing lanes', () => {
  it('a Multishot arrow hits two distinct bodies once each, then ends', () => {
    const w = world('ranger');
    const p = w.players[0];
    resolvePlayerAbility(w, p, 'a1', ZERO);
    const proj = w.projectiles[1];
    proj.pos = { ...w.boss!.pos };
    expect(impact(w, proj)).toBe(false);
    expect(w.boss!.hp).toBe(9981);
    expect(impact(w, proj)).toBe(false);
    expect(w.boss!.hp).toBe(9981);
    const a = add(w, 700);
    proj.pos = { ...a.pos };
    expect(impact(w, proj)).toBe(true);
    expect(a.hp).toBe(981);
  });
  it("Hunter's Mark passes two extra enemies and supports add-first and ownerless hits", () => {
    const w = world('ranger');
    const p = w.players[0];
    w.boss!.pos.x = 800;
    sub(w, 'rg_hunter_mark');
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    const proj = w.projectiles[0];
    const a = add(w, 640),
      b = add(w, 700);
    proj.pos = { ...a.pos };
    expect(impact(w, proj)).toBe(false);
    expect(a.hp).toBe(952);
    proj.pos = { ...b.pos };
    proj.ownerId = -1;
    expect(impact(w, proj)).toBe(false);
    expect(b.hp).toBe(952);
    proj.pos = { ...w.boss!.pos };
    expect(impact(w, proj)).toBe(true);
    expect(w.boss!.hp).toBe(9952);
  });
  it('invulnerable enemies absorb a piercing shot; blast/zone payloads never repeat', () => {
    const w = world('ranger');
    const p = w.players[0];
    applyBuff(w.boss!, makeBuff('invuln', 0, 2, 'immune'));
    resolvePlayerAbility(w, p, 'a1', ZERO);
    const proj = w.projectiles[0];
    proj.pos = { ...w.boss!.pos };
    expect(impact(w, proj)).toBe(true);
    expect(proj.hitIds).toEqual([]);
    expect(w.boss!.hp).toBe(10000);
    p.abilities!.a1.impactRadius = 50;
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(w.projectiles.at(-1)!.pierceLeft).toBeUndefined();
    p.abilities!.a1 = recompose(
      {
        delivery: { kind: 'projectile' },
        effects: [
          { kind: 'damage', amount: 30 },
          { kind: 'pierce', count: 2 },
          { kind: 'zone', zone: { zoneKind: 'poison', radius: 100, duration: 3, tickDamage: 5 } },
        ],
      },
      p.abilities!.a1,
    );
    resolvePlayerAbility(w, p, 'a1', ZERO);
    const fused = w.projectiles.at(-1)!;
    expect(fused.pierceLeft).toBeUndefined();
    fused.pos = { ...w.boss!.pos };
    expect(impact(w, fused)).toBe(true);
    expect(w.groundZones).toHaveLength(1);
  });
  it('ordinary Arrow remains single-hit; rain applies a bounded slow and retains airborne reach', () => {
    const w = world('ranger');
    const p = w.players[0];
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(w.projectiles[0].pierceLeft).toBeUndefined();
    p.abilities!.a2.range = 40;
    applyBuff(w.boss!, makeBuff('flight', 0, 3, 'flight'));
    resolvePlayerAbility(w, p, 'a2', ZERO);
    (w as unknown as { applyZoneTick: (z: (typeof w.groundZones)[0]) => void }).applyZoneTick(
      w.groundZones[0],
    );
    expect(w.boss!.buffs.some((b) => b.kind === 'moveSpeed' && b.mult === 0.75)).toBe(true);
  });
});

describe('Barbarian momentum', () => {
  it('actual melee hits during Rage build capped momentum; one Whirlwind spends it', () => {
    const w = world('barbarian');
    const p = w.players[0];
    resolvePlayerAbility(w, p, 'a1', ZERO);
    for (let i = 0; i < 4; i++) {
      resolvePlayerAbility(w, p, 'basic', ZERO);
      tickBuffs(p, 0.5);
    }
    expect(p.buffs.find((b) => b.kind === 'momentum')!.mult).toBe(3);
    const hp = w.boss!.hp;
    resolvePlayerAbility(w, p, 'a3', ZERO);
    expect(w.boss!.hp).toBeCloseTo(hp - 40 * 1.3 * 1.35);
    expect(p.buffs.some((b) => b.kind === 'momentum')).toBe(false);
    const shape = w.events.filter((e) => e.t === 'skillArea').at(-1)!;
    expect(shape.t === 'skillArea' && shape.area.radius).toBe(165);
  });
  it('multi-target cones count one beat; ranged hits, zero damage, misses and immunity do not add stacks', () => {
    const w = world('barbarian');
    const p = w.players[0];
    add(w);
    add(w);
    resolvePlayerAbility(w, p, 'a1', ZERO);
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(p.buffs.find((b) => b.kind === 'momentum')!.mult).toBe(1);
    tickBuffs(p, 0.5);
    damageBoss(w, p, w.boss!, 10);
    damageBoss(w, p, w.boss!, 0, { melee: true });
    expect(p.buffs.find((b) => b.kind === 'momentum')!.mult).toBe(1);
    w.adds = [];
    p.aim = { x: -1, y: 0 };
    resolvePlayerAbility(w, p, 'basic', ZERO);
    p.aim = { x: 1, y: 0 };
    applyBuff(w.boss!, makeBuff('invuln', 0, 1, 'immune'));
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(p.buffs.find((b) => b.kind === 'momentum')!.mult).toBe(1);
  });
  it('momentum expires with the rage window, refreshes without stockpiling, and blocked attempts do not spend it', () => {
    const w = world('barbarian');
    const p = w.players[0];
    resolvePlayerAbility(w, p, 'a1', ZERO);
    resolvePlayerAbility(w, p, 'basic', ZERO);
    p.cooldowns.a3 = 1;
    use(w, 'a3');
    p.cooldowns.a3 = 0;
    applyBuff(p, makeBuff('silence', 0, 1, 'mute'));
    use(w, 'a3');
    expect(p.buffs.find((b) => b.kind === 'momentum')!.mult).toBe(1);
    tickBuffs(p, 6.1);
    expect(p.buffs.some((b) => b.kind === 'momentum')).toBe(false);
    resolvePlayerAbility(w, p, 'a1', ZERO);
    resolvePlayerAbility(w, p, 'basic', ZERO);
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(p.buffs.some((b) => b.kind === 'momentum')).toBe(false);
  });
  it('Frenzy/Wolf Spirit and cone/burst subclass finishers share the loop', () => {
    const w = world('barbarian');
    const p = w.players[0];
    sub(w, 'bb_berserker_frenzy');
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    resolvePlayerAbility(w, p, 'basic', ZERO);
    sub(w, 'bb_berserker_reckless');
    const boosted = consumeMartialFinishers(p, p.subAbilities!.sub1!);
    expect(boosted.range).toBe(98);
    expect(boosted.damage).toBeCloseTo(52.8);
    sub(w, 'bb_totem_wolf');
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    tickBuffs(p, 0.5);
    resolvePlayerAbility(w, p, 'basic', ZERO);
    sub(w, 'bb_totem_quake');
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(p.buffs.some((b) => b.kind === 'momentum')).toBe(false);
  });
  it('bots defer an available Whirlwind to build momentum, then use it at three stacks or expiry', () => {
    const w = world('barbarian');
    const p = w.players[0];
    expect(computeBotInput(w, p, 1).buttons.a3).toBe(false);
    resolvePlayerAbility(w, p, 'a1', ZERO);
    p.cooldowns.a1 = 14;
    expect(computeBotInput(w, p, 2).buttons.a3).toBe(false);
    for (let i = 0; i < 3; i++) {
      resolvePlayerAbility(w, p, 'basic', ZERO);
      tickBuffs(p, 0.5);
    }
    expect(computeBotInput(w, p, 3).buttons.a3).toBe(true);
    p.buffs.find((b) => b.kind === 'momentum')!.mult = 1;
    p.buffs.find((b) => b.kind === 'rageRhythm')!.remaining = 0.5;
    expect(computeBotInput(w, p, 4).buttons.a3).toBe(true);
  });
});

describe('Monk movement and Flow', () => {
  it('Step prepares one Flow; basics preserve it; a wide Palm casts immediately', () => {
    const w = world('monk');
    const p = w.players[0];
    resolvePlayerAbility(w, p, 'a2', ZERO);
    expect(p.buffs.some((b) => b.kind === 'flow')).toBe(true);
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(p.buffs.some((b) => b.kind === 'flow')).toBe(true);
    use(w, 'a3');
    expect(p.castTimer).toBe(0);
    expect(p.buffs.some((b) => b.kind === 'flow')).toBe(false);
    const shape = w.events.filter((e) => e.t === 'skillArea').at(-1)!;
    expect(shape.t === 'skillArea' && shape.area.radius).toBe(165);
    p.cooldowns.a3 = 0;
    use(w, 'a3');
    expect(p.castTimer).toBe(0.4);
  });
  it('a longer Stunning Strike preserves its damage/control and consumes readiness even on a committed miss', () => {
    const w = world('monk');
    const p = w.players[0];
    w.boss!.pos.x = 704;
    w.boss!.radius = 12;
    resolvePlayerAbility(w, p, 'a2', ZERO);
    use(w, 'a1');
    expect(w.boss!.hp).toBe(9966);
    expect(w.boss!.buffs.some((b) => b.kind === 'stun')).toBe(true);
    p.cooldowns.a1 = 0;
    resolvePlayerAbility(w, p, 'a2', ZERO);
    p.aim = { x: -1, y: 0 };
    use(w, 'a1');
    expect(p.buffs.some((b) => b.kind === 'flow')).toBe(false);
  });
  it('rooted mobility never prepares Flow, expiry is normal, and blocked finishers preserve it', () => {
    const w = world('monk');
    const p = w.players[0];
    applyBuff(p, makeBuff('root', 0, 1, 'root'));
    resolvePlayerAbility(w, p, 'a2', ZERO);
    expect(p.buffs.some((b) => b.kind === 'flow')).toBe(false);
    tickBuffs(p, 1.1);
    resolvePlayerAbility(w, p, 'a2', ZERO);
    p.cooldowns.a3 = 1;
    use(w, 'a3');
    expect(p.buffs.some((b) => b.kind === 'flow')).toBe(true);
    tickBuffs(p, 4.1);
    p.cooldowns.a3 = 0;
    use(w, 'a3');
    expect(p.castTimer).toBe(0.4);
  });
  it('Open Hand/Shadow movement and finishers work in canonical and composed form', () => {
    const w = world('monk');
    const p = w.players[0];
    sub(w, 'mo_shadow_step');
    p.subAbilities!.sub1 = recompose(decompose(p.subAbilities!.sub1!), p.subAbilities!.sub1!);
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(p.buffs.some((b) => b.kind === 'flow')).toBe(true);
    sub(w, 'mo_shadow_strike');
    const out = consumeMartialFinishers(p, p.subAbilities!.sub1);
    expect(out.range).toBe(90);
    sub(w, 'mo_openhand_wind');
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    sub(w, 'mo_openhand_wave');
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(p.buffs.some((b) => b.kind === 'flow')).toBe(false);
  });
  it('copied mobility and finishers retain readiness across class swaps without refresh', () => {
    const w = world('monk');
    const p = w.players[0];
    resolvePlayerAbility(w, p, 'a2', ZERO);
    tickBuffs(p, 1);
    w.setActiveClass(p, 'knight');
    expect(p.buffs.find((b) => b.kind === 'flow')!.remaining).toBe(3);
    p.abilities!.a3 = { ...getClass('monk').abilities.a3 };
    use(w, 'a3');
    expect(p.castTimer).toBe(0);
  });
});

it.each([
  ['knight', 'a2'],
  ['ranger', 'a1'],
  ['barbarian', 'a1'],
  ['barbarian', 'a3'],
  ['monk', 'a2'],
  ['monk', 'a3'],
] as const)('Forge preserves and executes %s %s mechanics', (classId, slot) => {
  const w = world(classId);
  const p = w.players[0];
  const original = p.abilities![slot];
  const comp = decompose(original);
  p.abilities![slot] = recompose(comp, original);
  expect(componentValue(comp)).toBeGreaterThanOrEqual(0);
  const refreshed = recompose(refreshComponents(p.abilities![slot]), original);
  for (const field of [
    'guardWindow',
    'pierce',
    'momentumWindow',
    'spendsMomentum',
    'prepareFlow',
    'consumesFlow',
  ] as const)
    expect(refreshed[field]).toBe(original[field]);
  expect(describeAbility(refreshed)).toMatch(/guard|pierce|momentum|Flow/);
  if (classId === 'barbarian' && slot === 'a3') {
    resolvePlayerAbility(w, p, 'a1', ZERO);
    resolvePlayerAbility(w, p, 'basic', ZERO);
  }
  if (classId === 'monk' && slot === 'a3') resolvePlayerAbility(w, p, 'a2', ZERO);
  resolvePlayerAbility(w, p, slot, ZERO);
  if (classId === 'knight') expect(p.buffs.some((b) => b.kind === 'guard')).toBe(true);
  if (classId === 'ranger') expect(w.projectiles[0].pierceLeft).toBe(1);
  if (classId === 'monk' && slot === 'a3')
    expect(p.buffs.some((b) => b.kind === 'flow')).toBe(false);
});
it('real upgrades extend guard and Flow on composed skills without changing old defense or movement behavior', () => {
  const knight = world('knight').players[0];
  knight.abilities!.a2 = recompose(decompose(knight.abilities!.a2), knight.abilities!.a2);
  applyCharUpgrades(knight, ['kn_bulwark']);
  expect(knight.abilities!.a2.guardWindow).toBe(5.5);
  expect(knight.abilities!.a2.buffDefMult).toBe(0.4);
  expect(recompose(knight.abilities!.a2.components!, knight.abilities!.a2).guardWindow).toBe(5.5);
  const monk = world('monk').players[0];
  applyCharUpgrades(monk, ['mo_wind']);
  expect(monk.abilities!.a2.prepareFlow).toBe(4.5);
  expect(monk.abilities!.a2.range).toBe(300);
});
it('readiness badges explain their payoff and unprepared finishers preserve ordinary numbers', () => {
  const w = world('monk');
  const p = w.players[0];
  const ab = p.abilities!.a3;
  expect(consumeMartialFinishers(p, ab)).toBe(ab);
  armMartialUtility(p, ab);
  prepareMartialFlow(p, ab);
  expect(p.buffs).toEqual([]);
  const badges = buffBadges([
    { kind: 'guard', mult: 1.3, remaining: 4 },
    { kind: 'counter', mult: 1.3, remaining: 4 },
    { kind: 'momentum', mult: 3, remaining: 4 },
    { kind: 'flow', mult: 0, remaining: 4 },
  ]);
  expect(badges.map((b) => b.label).join(' ')).toMatch(/Momentum 3\/3/);
  expect(badges).toHaveLength(4);
});

it('momentum is reserved through a wind-up and an interruption spends it without a delayed hit', () => {
  const w = world('barbarian');
  const p = w.players[0];
  resolvePlayerAbility(w, p, 'a1', ZERO);
  resolvePlayerAbility(w, p, 'basic', ZERO);
  use(w, 'a3');
  expect(p.castTimer).toBe(0.4);
  expect(p.castAbility!.damage).toBeCloseTo(44);
  expect(p.buffs.some((b) => b.kind === 'momentum')).toBe(false);
  applyBuff(p, makeBuff('stun', 0, 1, 'interrupt'));
  const hp = w.boss!.hp;
  tick(w, 0.5);
  expect(w.boss!.hp).toBe(hp);
  expect(p.castAbility).toBeUndefined();
  expect(p.buffs.some((b) => b.kind === 'momentum')).toBe(false);
  tickBuffs(p, 1);
  p.cooldowns.a3 = 0;
  use(w, 'a3');
  expect(p.castAbility!.damage).toBe(40);
});
it('prepared finishers use default geometry safely and only live momentum can be spent', () => {
  const w = world('monk');
  const p = w.players[0];
  prepareMartialFlow(p, { ...p.abilities!.a2, prepareFlow: 4 });
  expect(consumeMartialFinishers(p, { ...p.abilities!.a1, range: undefined }).range).toBe(100);
  prepareMartialFlow(p, p.abilities!.a2);
  expect(consumeMartialFinishers(p, { ...p.abilities!.a3, radius: undefined }).radius).toBe(165);
  armMartialUtility(p, getClass('barbarian').abilities.a1);
  damageBoss(w, p, w.boss!, 1, { melee: true });
  expect(
    consumeMartialFinishers(p, { ...getClass('barbarian').abilities.a3, radius: undefined }).radius,
  ).toBe(140);
  tickBuffs(p, 0.5);
  damageBoss(w, p, w.boss!, 1, { melee: true });
  const def = {
    ...getClass('barbarian').abilities.a3,
    kind: 'meleeCone' as const,
    range: undefined,
  };
  expect(consumeMartialFinishers(p, def).range).toBe(78);
  tickBuffs(p, 0.5);
  damageBoss(w, p, w.boss!, 1, { melee: true });
  p.buffs = p.buffs.filter((b) => b.kind !== 'rageRhythm');
  expect(consumeMartialFinishers(p, def)).toBe(def);
});
it('Forge refresh adds eligible interaction fields and preserves absent fields when patching old components', () => {
  const sources = [
    getClass('knight').abilities.a2,
    getClass('ranger').abilities.a1,
    getClass('barbarian').abilities.a1,
    getClass('barbarian').abilities.a3,
    getClass('monk').abilities.a2,
    getClass('monk').abilities.a3,
  ];
  for (const source of sources) {
    const blank = {
      ...source,
      guardWindow: undefined,
      pierce: undefined,
      momentumWindow: undefined,
      spendsMomentum: undefined,
      prepareFlow: undefined,
      consumesFlow: undefined,
    };
    const fused = recompose(decompose(blank), source);
    Object.assign(fused, {
      guardWindow: source.guardWindow,
      pierce: source.pierce,
      momentumWindow: source.momentumWindow,
      spendsMomentum: source.spendsMomentum,
      prepareFlow: source.prepareFlow,
      consumesFlow: source.consumesFlow,
    });
    const refreshed = recompose(refreshComponents(fused), source);
    for (const key of [
      'guardWindow',
      'pierce',
      'momentumWindow',
      'spendsMomentum',
      'prepareFlow',
      'consumesFlow',
    ] as const)
      expect(refreshed[key]).toBe(source[key]);
  }
});

it('Forge preserves existing martial payloads when an absent flat optional field is refreshed', () => {
  for (const [classId, slot, key] of [
    ['knight', 'a2', 'guardWindow'],
    ['ranger', 'a1', 'pierce'],
    ['barbarian', 'a1', 'momentumWindow'],
    ['monk', 'a2', 'prepareFlow'],
  ] as const) {
    const source = getClass(classId).abilities[slot];
    const fused = recompose(decompose(source), source);
    fused[key] = undefined;
    expect(recompose(refreshComponents(fused), source)[key]).toBe(source[key]);
  }
  const hunter = getSubSkill('rg_hunter_mark')!.ability;
  expect(describeAbility(hunter)).toContain('pierce 2 additional enemies');
  expect(describeAbility(recompose(decompose(hunter), { ...hunter, slot: 'sub1' }))).toContain(
    'pierce 2 additional enemies',
  );
});
