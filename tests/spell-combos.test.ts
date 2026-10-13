import { computeBotInput } from '../src/engine/ai/bot';
import { describe, it, expect } from 'vitest';
import { World } from '../src/engine/world/world';
import { resolvePlayerAbility } from '../src/engine/combat/abilities';
import { applyBuff, makeBuff, tickBuffs } from '../src/engine/combat/combat';
import { controlledSpellMultiplier } from '../src/engine/combat/spellCombos';
import { getClass, describeAbility } from '../src/engine/content/classes';
import { getSubSkill } from '../src/engine/content/subclasses';
import { decompose, recompose, refreshComponents } from '../src/engine/content/forge';
import { buffBadges } from '../src/render/overlays/buffGlyphs';
import type { ClassId, ExtSlot, Vec2, Add } from '../src/engine/core/types';
const ZERO = { x: 0, y: 0 };
function world(classId: ClassId = 'mage', extraClasses: ClassId[] = []) {
  const w = new World({
    monsterId: 'dragon',
    seed: 5,
    players: [{ peerId: 'a', name: 'A', classId, extraClasses }],
  });
  w.players[0].pos = { x: 600, y: 400 };
  w.players[0].aim = { x: 1, y: 0 };
  w.players[0].critChance = 0;
  w.boss!.pos = { x: 640, y: 400 };
  w.boss!.hp = 10000;
  w.boss!.maxHp = 10000;
  w.boss!.facing = Math.PI;
  return w;
}
function impact(w: World) {
  const proj = w.projectiles.at(-1)!;
  proj.pos = { ...w.boss!.pos };
  (
    w as unknown as { resolvePlayerProjectile: (p: typeof proj) => boolean }
  ).resolvePlayerProjectile(proj);
}
function use(w: World, slot: ExtSlot) {
  (
    w as unknown as { tryUseAbility: (p: (typeof w.players)[0], s: ExtSlot, v: Vec2) => void }
  ).tryUseAbility(w.players[0], slot, ZERO);
}
function timers(w: World, dt: number) {
  (w as unknown as { tickTimers: (dt: number) => void }).tickTimers(dt);
}
function add(w: World): Add {
  const a: Add = {
    id: w.allocId(),
    pos: { ...w.boss!.pos },
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

describe('Mage: control then burst', () => {
  it.each(['moveSpeed', 'root', 'stun'] as const)(
    'Fireball exploits %s at impact, including airborne targets',
    (kind) => {
      const w = world();
      applyBuff(w.boss!, makeBuff(kind, kind === 'moveSpeed' ? 0.6 : 0, 3, 'test'));
      applyBuff(w.boss!, makeBuff('flight', 0, 3, 'flight'));
      resolvePlayerAbility(w, w.players[0], 'a1', ZERO);
      impact(w);
      expect(w.boss!.hp).toBe(9900);
    },
  );
  it('does not manufacture a combo from its own on-hit freeze, neutral speed, or expired control', () => {
    const w = world();
    const p = w.players[0];
    p.abilities!.a1.freeze = 1;
    applyBuff(w.boss!, makeBuff('moveSpeed', 1, 3, 'neutral'));
    resolvePlayerAbility(w, p, 'a1', ZERO);
    impact(w);
    expect(w.boss!.hp).toBe(9920);
    tickBuffs(w.boss!, 4);
    resolvePlayerAbility(w, p, 'a1', ZERO);
    impact(w);
    expect(w.boss!.hp).toBe(9840);
  });
  it('uses the real Frost Nova setup and normal non-combo damage on other targets', () => {
    const w = world();
    const p = w.players[0];
    resolvePlayerAbility(w, p, 'a2', ZERO);
    const a = add(w);
    resolvePlayerAbility(w, p, 'a1', ZERO);
    impact(w);
    expect(w.boss!.hp).toBe(9880);
    expect(a.hp).toBe(920);
  });
  it('honors invulnerability and controlled adds on single-target shots', () => {
    const w = world();
    const p = w.players[0];
    p.abilities!.a1.impactRadius = 0;
    applyBuff(w.boss!, makeBuff('invuln', 0, 2, 'test'));
    applyBuff(w.boss!, makeBuff('root', 0, 3, 'root'));
    resolvePlayerAbility(w, p, 'a1', ZERO);
    impact(w);
    expect(w.boss!.hp).toBe(10000);
    const a = add(w);
    w.boss!.hp = 0;
    applyBuff(a, makeBuff('stun', 0, 3, 'test'));
    resolvePlayerAbility(w, p, 'a1', ZERO);
    const proj = w.projectiles.at(-1)!;
    proj.pos = { ...a.pos };
    (
      w as unknown as { resolvePlayerProjectile: (p: typeof proj) => boolean }
    ).resolvePlayerProjectile(proj);
    expect(a.hp).toBe(900);
  });
  it('extends setup/payoff to Evoker burst skills and copied Fireball', () => {
    const w = world('knight');
    const p = w.players[0];
    p.abilities!.a1 = { ...getClass('mage').abilities.a1 };
    applyBuff(w.boss!, makeBuff('root', 0, 3, 'test'));
    resolvePlayerAbility(w, p, 'a1', ZERO);
    impact(w);
    expect(w.boss!.hp).toBe(9900);
    p.subAbilities = { sub1: { ...getSubSkill('mg_evoker_sculpt')!.ability, slot: 'sub1' } };
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(w.boss!.hp).toBeCloseTo(9827.5);
  });
});

describe('Sorcerer: prepare and commit one surge', () => {
  it('utility prepares one surge; basics preserve it; one Meteor consumes it', () => {
    const w = world('sorcerer');
    const p = w.players[0];
    resolvePlayerAbility(w, p, 'a2', ZERO);
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(p.buffs.some((b) => b.kind === 'spellSurge')).toBe(true);
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(w.projectiles.at(-1)!.damage).toBeCloseTo(46.8);
    const v = w.projectiles.at(-1)!.vel;
    expect((Math.abs(Math.atan2(v.y, v.x)) * 180) / Math.PI).toBeCloseTo(2);
    expect(
      w.projectiles
        .slice(-2)
        .map((p) => p.damage)
        .reduce((a, b) => a + b, 0),
    ).toBeCloseTo(93.6);
    expect(p.buffs.some((b) => b.kind === 'spellSurge')).toBe(false);
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(w.projectiles.at(-1)!.damage).toBe(78);
  });
  it('reserves a faster cast and its damage at cast start, even when readiness would expire', () => {
    const w = world('sorcerer');
    const p = w.players[0];
    resolvePlayerAbility(w, p, 'a2', ZERO);
    p.buffs.find((b) => b.kind === 'spellSurge')!.remaining = 0.1;
    use(w, 'a1');
    expect(p.castTimer).toBe(0.375);
    expect(p.cooldowns.a1).toBe(16);
    timers(w, 0.4);
    expect(w.projectiles.at(-1)!.damage).toBeCloseTo(46.8);
    expect(p.castAbility).toBeUndefined();
  });
  it('does not spend surge when cooldown, silence, stun or another cast blocks the attempt', () => {
    const w = world('sorcerer');
    const p = w.players[0];
    resolvePlayerAbility(w, p, 'a2', ZERO);
    p.cooldowns.a1 = 2;
    use(w, 'a1');
    p.cooldowns.a1 = 0;
    applyBuff(p, makeBuff('silence', 0, 2, 'test'));
    use(w, 'a1');
    tickBuffs(p, 3);
    applyBuff(p, makeBuff('stun', 0, 1, 'stun'));
    use(w, 'a1');
    tickBuffs(p, 2);
    p.castTimer = 1;
    use(w, 'a1');
    expect(p.buffs.some((b) => b.kind === 'spellSurge')).toBe(true);
  });
  it('expires, refreshes without stacking, and rooted blinks cannot prepare it', () => {
    const w = world('sorcerer');
    const p = w.players[0];
    resolvePlayerAbility(w, p, 'a2', ZERO);
    resolvePlayerAbility(w, p, 'a2', ZERO);
    expect(p.buffs.filter((b) => b.kind === 'spellSurge')).toHaveLength(1);
    tickBuffs(p, 9);
    applyBuff(p, makeBuff('root', 0, 2, 'test'));
    resolvePlayerAbility(w, p, 'a3', ZERO);
    expect(p.buffs.some((b) => b.kind === 'spellSurge')).toBe(false);
  });
  it('interrupted casts and class swaps cannot leak a reserved boost to another spell', () => {
    const w = world('sorcerer', ['mage']);
    const p = w.players[0];
    resolvePlayerAbility(w, p, 'a2', ZERO);
    use(w, 'a1');
    applyBuff(p, makeBuff('stun', 0, 2, 'test'));
    timers(w, 0.4);
    expect(w.projectiles).toHaveLength(0);
    tickBuffs(p, 3);
    p.cooldowns.a1 = 0;
    resolvePlayerAbility(w, p, 'a2', ZERO);
    use(w, 'a1');
    w.setActiveClass(p, 'mage');
    expect(p.castAbility).toBeUndefined();
    expect(p.castTimer).toBe(0);
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(w.projectiles.at(-1)!.damage).toBe(80);
  });
  it('supports no-wind-up spells and bound Draconic/Wild skills without another button', () => {
    const w = world('sorcerer');
    const p = w.players[0];
    p.subAbilities = { sub1: { ...getSubSkill('so_draconic_breath')!.ability, slot: 'sub1' } };
    resolvePlayerAbility(w, p, 'a2', ZERO);
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(w.boss!.hp).toBeCloseTo(9949.6);
    p.abilities!.a1.castTime = 0;
    resolvePlayerAbility(w, p, 'a2', ZERO);
    use(w, 'a1');
    expect(w.projectiles.at(-1)!.damage).toBeCloseTo(46.8);
  });
});

describe('spell identity through run systems', () => {
  it.each([
    ['mage', 'a1'],
    ['sorcerer', 'a1'],
    ['sorcerer', 'a2'],
    ['sorcerer', 'a3'],
  ] as const)('retains %s/%s fields, descriptions and upgrades through Forge', (c, slot) => {
    const ab = getClass(c).abilities[slot];
    const def = recompose(decompose(ab), ab);
    const refreshed = recompose(refreshComponents(def), ab);
    for (const k of ['controlDamageBonus', 'consumesSurge', 'prepareSurge', 'surgeTwin'] as const)
      expect(refreshed[k]).toBe(ab[k]);
    expect(describeAbility(def)).toMatch(/surge|slowed/);
  });
  it('runs composed preparation, burst, and conditional damage', () => {
    const w = world('sorcerer');
    const p = w.players[0];
    for (const s of ['a1', 'a2'] as const)
      p.abilities![s] = recompose(decompose(p.abilities![s]), p.abilities![s]);
    resolvePlayerAbility(w, p, 'a2', ZERO);
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(w.projectiles.at(-1)!.damage).toBeCloseTo(46.8);
    p.subAbilities = {
      sub1: recompose(decompose(getSubSkill('mg_evoker_sculpt')!.ability), {
        slot: 'sub1',
        name: 'Sculpted Blast',
        cooldown: 11,
      }),
    };
    applyBuff(w.boss!, makeBuff('root', 0, 3, 'test'));
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(w.boss!.hp).toBeCloseTo(9927.5);
  });
  it('shows compact surge feedback and does not treat haste as control', () => {
    expect(buffBadges([{ kind: 'spellSurge', mult: 1.2, remaining: 8 }])[0].label).toMatch(
      /next heavy spell/,
    );
    const w = world();
    applyBuff(w.boss!, makeBuff('moveSpeed', 1.2, 2, 'haste'));
    expect(controlledSpellMultiplier(w.boss!, 0.25)).toBe(1);
    expect(controlledSpellMultiplier(w.boss!, undefined)).toBe(1);
  });
});

it('Sorc bots prepare Mirror Image before casting a surge-enabled Meteor', () => {
  const w = world('sorcerer');
  const p = w.players[0];
  w.boss!.pos.x = p.pos.x + 300;
  let input = computeBotInput(w, p, 1);
  expect(input.buttons.a1).toBe(false);
  expect(input.buttons.a2).toBe(true);
  resolvePlayerAbility(w, p, 'a2', ZERO);
  input = computeBotInput(w, p, 2);
  expect(input.buttons.a1).toBe(true);
});
it('lower-rank preparation cannot shorten readiness and copied utility works on another class', () => {
  const w = world('knight');
  const p = w.players[0];
  p.abilities!.a2 = { ...getClass('sorcerer').abilities.a2, prepareSurge: 10 };
  resolvePlayerAbility(w, p, 'a2', ZERO);
  p.abilities!.a2.prepareSurge = 8;
  resolvePlayerAbility(w, p, 'a2', ZERO);
  expect(p.buffs.find((b) => b.kind === 'spellSurge')!.remaining).toBe(10);
  p.abilities!.a1 = { ...getClass('sorcerer').abilities.a1 };
  use(w, 'a1');
  expect(p.castTimer).toBe(0.375);
});
it('new conditional and preparation upgrades appear on eligible fused skills', () => {
  const w = world();
  const p = w.players[0];
  let def = recompose(decompose(p.abilities!.basic), p.abilities!.basic);
  def.controlDamageBonus = 0.2;
  def.consumesSurge = true;
  let updated = recompose(refreshComponents(def), def);
  expect(updated.controlDamageBonus).toBe(0.2);
  expect(updated.consumesSurge).toBe(true);
  def = recompose(decompose(getClass('knight').abilities.a2), getClass('knight').abilities.a2);
  def.prepareSurge = 8;
  updated = recompose(refreshComponents(def), def);
  expect(updated.prepareSurge).toBe(8);
});

it('surged projectile upgrades share damage across the extra shot and zone payloads are never duplicated', () => {
  const w = world('sorcerer');
  const p = w.players[0];
  p.abilities!.a1.projCount = 3;
  p.abilities!.a1.spreadDeg = 30;
  resolvePlayerAbility(w, p, 'a2', ZERO);
  resolvePlayerAbility(w, p, 'a1', ZERO);
  expect(w.projectiles).toHaveLength(4);
  expect(w.projectiles.reduce((s, p) => s + p.damage, 0)).toBeCloseTo(78 * 3 * 1.2);
  const fused = recompose(
    {
      delivery: { kind: 'projectile', surgeTwin: true, projCount: 1 },
      effects: [
        { kind: 'damage', amount: 50 },
        { kind: 'surgeStrike' },
        { kind: 'zone', zone: { zoneKind: 'poison', radius: 100, duration: 3, tickDamage: 10 } },
      ],
    },
    { slot: 'a1', name: 'Fusion', cooldown: 8 },
  );
  p.abilities!.a1 = fused;
  w.projectiles = [];
  resolvePlayerAbility(w, p, 'a2', ZERO);
  resolvePlayerAbility(w, p, 'a1', ZERO);
  expect(w.projectiles).toHaveLength(1);
  expect(w.projectiles[0].damage).toBe(60);
  expect(w.projectiles[0].onImpact?.tickDamage).toBe(10);
});
