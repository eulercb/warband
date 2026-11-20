import { expect, it } from 'vitest';
import { World } from '../src/engine/world/world';
import { applyBuff, makeBuff } from '../src/engine/combat/combat';
import type { ClassId, InputCommand } from '../src/engine/core/types';

function setup(classId: ClassId, slot: 'basic' | 'a1' | 'a3', upgrades: string[] = []) {
  const pick =
    classId === 'paladin' ? ['pa_vengeance_hunt'] : classId === 'bard' ? ['ba_valor_blade'] : [];
  const world = new World({
    seed: 31,
    monsterId: 'troll',
    players: [{ peerId: 'hero', name: 'Hero', classId, charUpgrades: upgrades, subSkills: pick }],
  });
  world.obstacles = [];
  world.terrain = [];
  const player = world.players[0],
    boss = world.boss!;
  player.pos = { x: 500, y: 400 };
  player.hp = 50;
  boss.pos = { x: 1000, y: 600 };
  boss.moveSpeed = 0;
  boss.decisionTimer = 1000;
  const add = {
    id: world.allocId(),
    pos: { x: 550, y: 400 },
    hp: 1,
    maxHp: 1,
    radius: 12,
    moveSpeed: 0,
    targetId: null,
    attackCd: 1000,
    buffs: [],
  };
  const input: InputCommand = {
    seq: 1,
    move: { x: 0, y: 0 },
    aim: { x: 1, y: 0 },
    buttons: { basic: false, a1: false, a2: false, a3: false, revive: false, [slot]: true },
  };
  function cast() {
    world.step(0.05, new Map([[player.peerId, input]]));
    for (let i = 0; i < 30 && !world.finished; i++) world.step(0.05, new Map());
  }
  return { world, player, boss, add, cast };
}

it('Relentless Holy Strike heals only for the actual HP removed from an add', () => {
  const { world, player, add, cast } = setup('paladin', 'basic', ['pa_vengeance_g_b']);
  world.adds.push(add);
  cast();
  expect(player.stats.damageDealt).toBe(1);
  expect(player.hp).toBeCloseTo(50.15);
});

it('Hero’s Ballad Dissonant Whispers leeches only the actual area damage', () => {
  const { world, player, add, cast } = setup('bard', 'a3', ['ba_valor_g_a']);
  world.adds.push(add);
  cast();
  expect(player.stats.damageDealt).toBe(1);
  expect(player.hp).toBeCloseTo(50.2);
});

it.each(['add', 'boss', 'immune'] as const)(
  'a direct shot leeches actual damage against %s',
  (target) => {
    const { world, player, boss, add, cast } = setup('ranger', 'basic');
    player.abilities!.basic.lifestealFrac = 0.25;
    if (target === 'add') world.adds.push(add);
    else {
      boss.pos = { x: 600, y: 400 };
      boss.hp = 1;
      boss.regenLockout = 5;
      if (target === 'immune') applyBuff(boss, makeBuff('invuln', 0, 2, 'test'));
    }
    cast();
    expect(player.stats.damageDealt).toBe(target === 'immune' ? 0 : 1);
    expect(player.hp).toBeCloseTo(target === 'immune' ? 50 : 50.25);
  },
);

it('an exploding shot leeches each real contact once across the boss and an add', () => {
  const { world, player, boss, add, cast } = setup('mage', 'a1');
  player.abilities!.a1.lifestealFrac = 0.25;
  boss.pos = { x: 620, y: 400 };
  boss.hp = 1;
  boss.regenLockout = 5;
  world.adds.push(add);
  cast();
  expect(player.stats.damageDealt).toBe(2);
  expect(player.hp).toBeCloseTo(50.5);
});
