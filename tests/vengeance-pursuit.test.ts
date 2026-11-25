import { expect, it } from 'vitest';
import { World } from '../src/engine/world/world';
import { decompose, recompose } from '../src/engine/content/forge';
import { applyBuff, makeBuff } from '../src/engine/combat/combat';

function setup(pick = 'pa_vengeance_hunt', identity = 'pa_vengeance_g_b') {
  const w = new World({
    seed: 31,
    monsterId: 'troll',
    players: [
      {
        peerId: 'a',
        name: 'Paladin',
        classId: 'paladin',
        subSkills: [pick],
        extraClasses: ['mage'],
        charUpgrades: identity ? [identity] : [],
      },
    ],
  });
  w.scene = null;
  w.obstacles = [];
  w.terrain = [];
  const p = w.players[0],
    b = w.boss!;
  p.pos = { x: 500, y: 400 };
  b.pos = { x: 730, y: 400 };
  b.moveSpeed = 0;
  b.decisionTimer = 1000;
  b.hp = b.maxHp = 10000;
  function step(basic = false, autofire = false, aim = { x: 1, y: 0 }, move = { x: 0, y: 0 }) {
    w.step(
      0.01,
      new Map([
        [
          'a',
          {
            seq: w.tick,
            move,
            aim,
            buttons: { basic, a1: false, a2: false, a3: false, revive: false },
            autofire,
          },
        ],
      ]),
    );
  }
  return { w, p, b, step };
}

it.each(['hunt', 'shackle', 'charge', 'smite'])(
  'first pick %s closes on the boss before the first hit',
  (pick) => {
    const { w, p, b, step } = setup('pa_vengeance_' + pick);
    step();
    expect(w.serialize().players[0].vengeancePursuit?.blocked).toBe(false);
    step(true);
    expect(p.glide?.vengeancePursuit?.targetId).toBe(b.id);
    expect(b.hp).toBe(10000);
    for (let i = 0; i < 45; i++) step();
    expect(p.pos.x).toBeGreaterThan(550);
    expect(p.glide).toBeNull();
    expect(b.hp).toBeLessThan(10000);
    expect(p.cooldowns.a3).toBe(0);
    expect(p.paladinAura).toBeUndefined();
  },
);

it('an in-range swing takes priority and holding autofire never launches pursuit', () => {
  const { p, b, step } = setup();
  b.pos.x = 610;
  step(true, true);
  expect(b.hp).toBe(10000);
  for (let i = 0; i < 8; i++) step();
  expect(b.hp).toBeLessThan(10000);
  b.pos.x = 730;
  for (let i = 0; i < 250; i++) step(true, true);
  expect(p.vengeancePursuitReadyAt).toBeUndefined();
  step();
  for (let i = 0; i < 150; i++) step();
  step(true, true);
  expect(p.glide?.vengeancePursuit).toBeDefined();
});

it('cover blocks launch and the preview matches it', () => {
  const { w, p, b, step } = setup();
  w.obstacles.push({ id: 400, pos: { x: 557, y: 400 }, radius: 20, kind: 'pillar', variant: 0 });
  step();
  expect(w.serialize().players[0].vengeancePursuit?.blocked).toBe(true);
  step(true);
  expect(p.vengeancePursuitReadyAt).toBeUndefined();
  expect(b.hp).toBe(10000);
});

it('retreat can defeat the swing and a root can interrupt the run', () => {
  const first = setup();
  first.step(true);
  first.b.pos.x = 1000;
  for (let i = 0; i < 45; i++) first.step();
  expect(first.b.hp).toBe(10000);
  expect(first.p.pos.x).toBeLessThanOrEqual(720.01);
  const second = setup();
  second.step(true);
  applyBuff(second.p, makeBuff('root', 0, 2, 'test'));
  second.step();
  expect(second.p.glide).toBeNull();
  expect(second.b.hp).toBe(10000);
});

it('a perpendicular aim does not move the Paladin, and new cover can stop a committed run', () => {
  const { w, p, b, step } = setup();
  step(true, false, { x: 0, y: -1 });
  expect(p.vengeancePursuitReadyAt).toBeUndefined();
  step();
  for (let i = 0; i < 160; i++) step();
  step(true);
  expect(p.glide?.vengeancePursuit).toBeDefined();
  w.obstacles.push({ id: 401, pos: { x: 558, y: 400 }, radius: 18, kind: 'pillar', variant: 0 });
  for (let i = 0; i < 45; i++) step();
  expect(p.glide).toBeNull();
  expect(b.hp).toBe(10000);
  expect(p.vengeancePursuitReadyAt).toBeGreaterThan(w.elapsed);
});

it('ordinary Vengeance and a composed attack keep their regular movement contract', () => {
  const first = setup();
  first.p.charUpgradeIds = [];
  first.step(true);
  expect(first.p.glide).toBeFalsy();
  const second = setup();
  const native = second.p.abilities!.basic;
  second.p.abilities!.basic = recompose(decompose(native), {
    slot: 'basic',
    name: native.name,
    cooldown: native.cooldown,
  });
  second.step(true);
  expect(second.p.glide).toBeFalsy();
});

it('a small lateral retreat bends the run toward the original foe', () => {
  const { p, b, step } = setup();
  step(true);
  b.pos.y += 20;
  for (let i = 0; i < 45; i++) step();
  expect(p.pos.y).toBeGreaterThan(402);
  expect(b.hp).toBeLessThan(10000);
});

it('targets a nearer aimed add instead of the boss and cancels if the add is destroyed', () => {
  const { w, p, b, step } = setup();
  w.spawnAddWave({ x: 660, y: 400 }, 2, { minR: 0, maxR: 0, speedMult: 0 });
  const add = w.adds[0];
  step(true);
  expect(p.glide?.vengeancePursuit?.targetId).toBe(add.id);
  add.hp = 0;
  step();
  expect(p.glide).toBeNull();
  expect(b.hp).toBe(10000);
});

it('switching class cancels the reserved strike and keeps pursuit recovery on return', () => {
  const { w, p, b, step } = setup();
  step(true);
  const readyAt = p.vengeancePursuitReadyAt;
  w.setActiveClass(p, 'mage');
  expect(p.classId).toBe('mage');
  expect(p.glide).toBeNull();
  w.setActiveClass(p, 'paladin');
  p.cooldowns.basic = 0;
  step();
  step(true);
  expect(p.vengeancePursuitReadyAt).toBe(readyAt);
  expect(p.glide).toBeNull();
  expect(b.hp).toBe(10000);
});

it('a target beyond the walkable pursuit distance leaves the basic swing available', () => {
  const { p, b, step } = setup();
  b.pos.x = p.pos.x + p.abilities!.basic.range! + b.radius + 219;
  step(true);
  expect(p.vengeancePursuitReadyAt).toBeUndefined();
});

it('a quarry that moves into reach during pursuit is struck without overshooting', () => {
  const { p, b, step } = setup();
  step(true);
  const x = p.pos.x;
  b.pos.x = x + 110;
  step();
  expect(p.pos.x).toBeCloseTo(x);
  expect(b.hp).toBeLessThan(10000);
});

it('uses standard melee geometry when an eligible native strike omits optional geometry fields', () => {
  const { p, b, step } = setup();
  delete p.abilities!.basic.range;
  delete p.abilities!.basic.halfAngleDeg;
  step(true);
  expect(p.glide?.vengeancePursuit).toBeDefined();
  for (let i = 0; i < 45; i++) step();
  expect(b.hp).toBeLessThan(10000);
});

it('closes a 210u melee gap in under 0.3 seconds', () => {
  const { p, b, step } = setup();
  b.pos.x = p.pos.x + p.abilities!.basic.range! + b.radius + 210;
  const start = p.pos.x;
  step(true);
  expect(p.glide?.vengeancePursuit).toBeDefined();
  expect(b.hp).toBe(10000);
  for (let i = 1; i < 28; i++) step();
  expect(p.glide).toBeNull();
  expect(p.pos.x - start).toBeGreaterThanOrEqual(210);
  expect(b.hp).toBeLessThan(10000);
});

it.each(['', 'pa_vengeance_g_a', 'pa_vengeance_g_b'])(
  'fresh Holy Strike on re-entry after walking out of melee, identity %s',
  (identity) => {
    const { p, b, step } = setup('pa_vengeance_hunt', identity);
    const aim = { x: 1, y: 0 };
    b.pos.x = 610;
    step(true);
    expect(b.hp).toBe(10000);
    for (let i = 0; i < 8; i++) step();
    expect(b.hp).toBeLessThan(10000);
    for (let i = 0; i < 80; i++) step(false, false, aim, { x: -1, y: 0 });
    while (p.cooldowns.basic > 0) step();
    const retreatX = p.pos.x;
    const health = b.hp;
    expect(retreatX).toBeLessThan(375);

    step(true, false, aim);
    for (let i = 0; i < 35; i++) step();
    if (identity === 'pa_vengeance_g_b') {
      expect(p.pos.x).toBeGreaterThan(retreatX + 100);
      expect(b.hp).toBeLessThan(health);
    } else {
      expect(p.pos.x).toBe(retreatX);
      expect(b.hp).toBe(health);
    }
  },
);
