import { decompose, recompose } from '../src/engine/content/forge';
import { expect, it } from 'vitest';
import { World } from '../src/engine/world/world';
import { applyBuff, makeBuff } from '../src/engine/combat/combat';
import type { ClassId } from '../src/engine/core/types';

function encounter(classId: ClassId, skill?: string, grand?: string) {
  const world = new World({
    seed: 31,
    monsterId: 'troll',
    players: [
      {
        peerId: 'p',
        name: classId,
        classId,
        extraClasses: ['mage'],
        subSkills: skill ? [skill] : [],
        charUpgrades: grand ? [grand] : [],
      },
    ],
  });
  world.scene = null;
  world.obstacles = [];
  world.terrain = [];
  const player = world.players[0];
  const boss = world.boss!;
  player.pos = { x: 500, y: 400 };
  player.critChance = 0;
  boss.pos = { x: 550, y: 400 };
  boss.hp = boss.maxHp = 10000;
  boss.moveSpeed = 0;
  boss.decisionTimer = 1000;
  const step = (basic: boolean, sub1: boolean, aim = { x: 1, y: 0 }) =>
    world.step(
      0.05,
      new Map([
        [
          'p',
          {
            seq: world.tick,
            move: { x: 0, y: 0 },
            aim,
            buttons: { basic, a1: false, a2: false, a3: false, revive: false, sub1 },
          },
        ],
      ]),
    );
  return { world, player, boss, step };
}

it.each([
  ['knight', 'cleave', 2, undefined, 'kn_gk_basic_b'],
  ['paladin', 'holyStrike', 2, undefined, undefined],
  ['barbarian', 'axeSwing', 3, undefined, 'bb_gk_basic_b'],
  ['bard', 'bardFlourish', 2, 'ba_valor_blade', 'ba_valor_blade_g'],
  ['ranger', 'savageBite', 2, 'rg_beast_bite', 'rg_beast_bite_g'],
] as const)(
  '%s starts %s damage and its reach cue on the same tick',
  (classId, style, ticks, skill, grand) => {
    const { world, player, boss, step } = encounter(classId, skill, grand);
    step(!skill, !!skill);
    expect(world.serialize().players[0].weaponWindup).toMatchObject({
      style,
      angle: 0,
      progress: 0,
    });
    expect(player.cooldowns[skill ? 'sub1' : 'basic']).toBeGreaterThan(0);
    for (let tick = 0; tick < ticks; tick++) {
      expect(boss.hp).toBe(10000);
      expect(world.events.some((event) => event.t === 'skillArea')).toBe(false);
      step(false, false, { x: 0, y: 1 });
    }
    expect(world.serialize().players[0].weaponWindup).toBeUndefined();
    expect(boss.hp).toBeLessThan(10000);
    const area = world.events.find(
      (event) => event.t === 'skillArea' && event.area.style === style,
    );
    expect(area).toMatchObject({ area: { style, angle: 0 } });
    if (classId === 'bard') expect(boss.shove?.vx).toBeGreaterThan(0);
    if (classId === 'ranger')
      expect(player.buffs.some((buff) => buff.kind === 'parryReady')).toBe(true);
  },
);

it.each(['swap', 'stun', 'shove', 'down', 'silence', 'move'] as const)(
  'checks %s before a prepared hit',
  (change) => {
    const useSpecial = change === 'silence';
    const { world, player, boss, step } = useSpecial
      ? encounter('ranger', 'rg_beast_bite')
      : encounter('knight');
    step(!useSpecial, useSpecial);
    if (change === 'swap') world.requestClassSwap('p', 'mage');
    if (change === 'stun' || change === 'silence')
      applyBuff(player, makeBuff(change, 0, 1, change));
    if (change === 'down') player.hp = 0;
    if (change === 'shove') player.shove = { vx: 40, vy: 0, remaining: 1 };
    if (change === 'move') boss.pos.x += 250;
    step(false, false);
    step(false, false);
    expect(boss.hp).toBe(10000);
    expect(player.weaponWindup).toBeUndefined();
    expect(world.events.some((event) => event.t === 'skillArea')).toBe(change === 'move');
  },
);

it('recomposes the authored hybrid cone and uses the same host preparation', () => {
  const { world, player, boss, step } = encounter('bard', 'ba_valor_blade', 'ba_valor_blade_g');
  const source = { ...player.subAbilities!.sub1!, halfAngleDeg: undefined };
  player.subAbilities!.sub1 = recompose(decompose(source), source);
  step(false, true);
  expect(world.serialize().players[0].weaponWindup?.halfAngle).toBe(Math.PI / 4);
  expect(boss.hp).toBe(10000);
  step(false, false);
  step(false, false);
  expect(boss.hp).toBeLessThan(10000);
  expect(boss.shove?.vx).toBeGreaterThan(0);
});
