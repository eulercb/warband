import { afterEach, expect, it } from 'vitest';
import { World } from '../src/engine/world/world';
import { reflectionView } from '../src/engine/combat/reflection';
import { reflectiveWard } from '../src/engine/content/reflectionRules';
import { absorptionAmount, grantAbsorption } from '../src/engine/combat/absorption';
import { makeBuff, damagePlayer } from '../src/engine/combat/combat';
import { getCharUpgrade, applyCharUpgrades } from '../src/engine/content/charUpgrades';
import { describeAbility } from '../src/engine/content/classes';
import {
  decompose,
  recompose,
  componentValue,
  synthesizeAbility,
  setForgeSeed,
  refreshComponents,
} from '../src/engine/content/forge';
import type { ExtSlot, Projectile, InputCommand } from '../src/engine/core/types';
const zero = { x: 0, y: 0 },
  right = { x: 1, y: 0 };
const picks = ['cl_light_flare', 'cl_light_beam', 'cl_light_flash', 'cl_light_warding'];
afterEach(() => setForgeSeed(null));
function setup(pick = picks[0], upgrades = ['cl_light_g_b']) {
  const w = new World({
    seed: 31,
    monsterId: 'lich',
    players: [
      {
        peerId: 'a',
        name: 'Light',
        classId: 'cleric',
        charUpgrades: upgrades,
        subSkills: [pick],
        extraClasses: ['mage'],
      },
      { peerId: 'b', name: 'Ally', classId: 'mage' },
    ],
  });
  w.scene = null;
  w.obstacles = [];
  w.terrain = [];
  const p = w.players[0],
    ally = w.players[1],
    b = w.boss!;
  p.pos = { x: 500, y: 400 };
  p.aim = right;
  p.critChance = 0;
  ally.pos = { x: 1200, y: 700 };
  b.pos = { x: 800, y: 400 };
  b.moveSpeed = 0;
  b.decisionTimer = 1000;
  b.hp = b.maxHp = 10000;
  return { w, p, ally, b };
}
function step(w: World, slot?: ExtSlot, dt = 0.01, autofire = false) {
  const buttons: InputCommand['buttons'] = {
    basic: false,
    a1: false,
    a2: false,
    a3: false,
    revive: false,
  };
  if (slot) buttons[slot] = true;
  w.step(dt, new Map([['a', { seq: w.tick, aim: right, move: zero, buttons, autofire }]]));
}
function shot(w: World, extra: Partial<Projectile> = {}) {
  const q: Projectile = {
    id: w.allocId(),
    ownerId: w.boss!.id,
    kind: 'arcaneBolt',
    side: 'boss',
    pos: { x: 560, y: 400 },
    vel: { x: -500, y: 0 },
    damage: 20,
    hitRadius: 8,
    impactRadius: 0,
    lifetime: 3,
    rangeLeft: 900,
    slowMult: 0.5,
    slowDuration: 3,
    ...extra,
  };
  w.projectiles.push(q);
  return q;
}
it.each(picks)('each first pick %s has a full-health Blessing reflection route', (pick) => {
  const { w, p, b } = setup(pick);
  step(w, 'a3');
  expect(absorptionAmount(p.buffs)).toBeGreaterThan(0);
  expect(reflectionView(w, p)).toBeDefined();
  const hp = p.hp,
    ward = absorptionAmount(p.buffs),
    q = shot(w),
    id = q.id;
  step(w, undefined, 0.1);
  expect(p.hp).toBe(hp);
  expect(absorptionAmount(p.buffs)).toBe(ward);
  expect(q.id).toBe(id);
  expect(q.side).toBe('player');
  expect(q.vel.x).toBe(500);
  expect(q.reflected).toBe(true);
  expect(q.slowMult).toBeUndefined();
  expect(q.rangeLeft).toBeCloseTo(900);
  expect(q.lifetime).toBeCloseTo(2.9);
  expect(reflectionView(w, p)).toBeUndefined();
  expect(w.serialize().projectiles.find((s) => s.id === id)?.reflected).toBe(true);
  const hpBoss = b.hp;
  for (let i = 0; i < 100 && w.projectiles.includes(q); i++) step(w);
  expect(b.hp).toBe(hpBoss - 20);
});
it('reflects on the actual weakest ally, without redirecting boss aim or moving the recipient', () => {
  const { w, p, ally } = setup();
  ally.pos = { x: 530, y: 450 };
  ally.hp -= 10;
  step(w, 'a3');
  expect(reflectionView(w, p)).toBeUndefined();
  expect(reflectionView(w, ally)).toBeDefined();
  const pos = { ...ally.pos };
  const q = shot(w, { pos: { x: 590, y: 450 } });
  step(w, undefined, 0.1);
  expect(q.side).toBe('player');
  expect(ally.pos).toEqual(pos);
});
it('eligible casts refresh one halo even at capped absorption, without generating protection rewards', () => {
  const { w, p } = setup('cl_light_warding');
  grantAbsorption(p, 1000, 8);
  const shield = absorptionAmount(p.buffs);
  step(w, 'a3');
  expect(reflectionView(w, p)).toBeDefined();
  expect(absorptionAmount(p.buffs)).toBe(shield);
  expect(p.buffs.some((b) => b.kind === 'radiantCharge')).toBe(false);
  step(w, undefined, 0.5);
  const old = p.reflectionWard;
  step(w, 'sub1');
  expect(p.reflectionWard).not.toBe(old);
  expect(p.reflectionWard!.remaining).toBeGreaterThan(3.9);
  shot(w);
  step(w, undefined, 0.1);
  expect(reflectionView(w, p)).toBeUndefined();
  p.cooldowns.a3 = 0;
  step(w);
  step(w, 'a3');
  expect(reflectionView(w, p)).toBeDefined();
  expect(absorptionAmount(p.buffs)).toBe(shield);
});
it.each(['cover', 'body', 'projection'])(
  'earlier %s contact wins and preserves a later halo',
  (kind) => {
    const { w, p, ally } = setup();
    step(w, 'a3');
    if (kind === 'cover') w.obstacles = [{ id: w.allocId(), pos: { x: 550, y: 400 }, radius: 12 }];
    else {
      ally.pos = { x: 550, y: 400 };
      if (kind === 'projection')
        ally.buffs.push({
          source: 'test',
          kind: 'frontGuard',
          mult: 1,
          remaining: 4,
          projectedGuard: { reach: 20, halfWidth: 60 },
          projectedGuardClass: ally.classId,
        });
    }
    const q = shot(w, { pos: { x: 650, y: 400 }, vel: { x: -1000, y: 0 } });
    step(w, undefined, 0.2);
    expect(q.reflected).toBeUndefined();
    expect(reflectionView(w, p)).toBeDefined();
  },
);
it('swept high-speed contact reflects once and saves personal frontal blocks', () => {
  const { w, p } = setup('cl_light_warding', ['cl_light_g_b', 'cl_light_warding_g']);
  step(w, 'sub1');
  const guard = p.buffs.find((b) => b.kind === 'frontGuard')!;
  const q = shot(w, { pos: { x: 650, y: 400 }, vel: { x: -2000, y: 0 } });
  step(w, undefined, 0.1);
  expect(q.reflected).toBe(true);
  expect(guard.mult).toBe(1);
  const other = shot(w);
  step(w, undefined, 0.1);
  expect(other.reflected).toBeUndefined();
  expect(guard.mult).toBe(0);
});
it.each(['invuln', 'zero', 'stationary', 'expired'])('%s shots do not spend reflection', (mode) => {
  const { w, p } = setup();
  step(w, 'a3');
  if (mode === 'invuln') p.buffs.push(makeBuff('invuln', 0, 1, 'test'));
  const q = shot(w, {
    pos: { ...p.pos },
    ...(mode === 'zero' ? { damage: 0 } : {}),
    ...(mode === 'stationary' ? { vel: zero } : {}),
    ...(mode === 'expired' ? { lifetime: 0 } : {}),
  });
  step(w);
  expect(q.reflected).toBeUndefined();
  expect(reflectionView(w, p)).toBeDefined();
});
it.each(['down', 'source', 'class', 'disconnect', 'expiry'])(
  'unspent wards invalidate on owner %s',
  (mode) => {
    const { w, p, ally } = setup();
    ally.pos = { x: 520, y: 420 };
    ally.hp -= 1;
    step(w, 'a3');
    if (mode === 'down') p.hp = 0;
    if (mode === 'source') p.abilities!.a3 = { ...p.abilities!.a3 };
    if (mode === 'class') w.setActiveClass(p, 'mage');
    if (mode === 'disconnect') w.removePlayerByPeer(p.peerId);
    if (mode === 'expiry') for (let i = 0; i < 410; i++) step(w);
    expect(reflectionView(w, ally)).toBeUndefined();
    step(w);
    expect(ally.reflectionWard).toBeUndefined();
  },
);
it('borrowed return damage cannot crit, multiply outgoing damage or spend direct resources', () => {
  const { w, p, b } = setup();
  step(w, 'a3');
  p.damageMult = 9;
  p.critChance = 1;
  p.buffs.push(
    makeBuff('precision', 1, 6, 'precision'),
    makeBuff('radiantCharge', 1.25, 6, 'test'),
  );
  const q = shot(w);
  step(w, undefined, 0.1);
  const hp = b.hp;
  for (let i = 0; i < 100 && w.projectiles.includes(q); i++) step(w);
  expect(b.hp).toBe(hp - 20);
  expect(p.buffs.some((b) => b.kind === 'precision')).toBe(true);
  expect(p.buffs.some((b) => b.kind === 'radiantCharge')).toBe(true);
});
it('nonprojectile damage leaves the halo ready while ordinary protection absorbs it', () => {
  const { w, p } = setup();
  step(w, 'a3');
  const shield = absorptionAmount(p.buffs);
  damagePlayer(w, p, 10);
  expect(absorptionAmount(p.buffs)).toBeLessThan(shield);
  expect(reflectionView(w, p)).toBeDefined();
});
it('retained Forge reflection has a fixed price, fits positive barriers and works outside Light', () => {
  const { w, p } = setup();
  const native = p.abilities!.a3,
    comp = decompose(native);
  expect(
    componentValue(comp) -
      componentValue({ ...comp, effects: comp.effects.filter((e) => e.kind !== 'reflectWard') }),
  ).toBe(32);
  let made;
  for (let seed = 0; seed < 128 && !made; seed++) {
    const candidate = synthesizeAbility(
      seed,
      'reflect',
      'a3',
      ['Ward', 'Barrier', 'Blessing'].map((name) => ({
        name,
        classId: 'cleric' as const,
        className: 'Cleric',
        slot: 'a3',
        def: native,
      })),
      new Set(['buffAlly']),
    ).def;
    if (reflectiveWard(candidate)) made = candidate;
  }
  if (!made) throw Error('Actual synthesis lost reflection');
  w.setActiveClass(p, 'mage');
  p.abilities!.a3 = made;
  p.cooldowns.a3 = 0;
  step(w, 'a3');
  expect(reflectionView(w, p)).toBeDefined();
  expect(describeAbility(made)).toContain('one 4s projectile reflection');
  expect(refreshComponents(made).effects.some((e) => e.kind === 'reflectWard')).toBe(true);
  for (const invalid of [
    { ...comp, delivery: { kind: 'projectile' as const } },
    { ...comp, effects: comp.effects.filter((e) => e.kind !== 'absorption') },
  ]) {
    const bad = recompose(invalid, { slot: 'a3', name: 'Invalid', cooldown: 8 });
    expect(reflectiveWard(bad)).toBe(false);
    expect(describeAbility(bad)).not.toContain('reflection');
  }
});

it('a retained reflection flag cannot bypass missing barrier components or an incompatible delivery', () => {
  const { p } = setup();
  const native = p.abilities!.a3,
    comp = decompose(native);
  expect(
    reflectiveWard({
      ...native,
      components: { ...comp, effects: comp.effects.filter((e) => e.kind !== 'absorption') },
    }),
  ).toBe(false);
  expect(
    reflectiveWard({ ...native, components: { ...comp, delivery: { kind: 'projectile' } } }),
  ).toBe(false);
});
it('returned blasts retain their radius but discard hostile riders and respect enemy immunity', () => {
  const { w, b } = setup();
  step(w, 'a3');
  const q = shot(w, { impactRadius: 100 });
  step(w, undefined, 0.1);
  expect(q.impactRadius).toBe(100);
  expect(q.slowMult).toBeUndefined();
  b.buffs.push(makeBuff('invuln', 0, 2, 'test'));
  const hp = b.hp;
  for (let i = 0; i < 100 && w.projectiles.includes(q); i++) step(w);
  expect(b.hp).toBe(hp);
  expect(b.buffs.some((b) => b.kind === 'moveSpeed')).toBe(false);
});
it('a disconnected reflector cannot deal ownerless borrowed damage', () => {
  const { w, p, b } = setup();
  step(w, 'a3');
  const q = shot(w);
  step(w, undefined, 0.1);
  w.removePlayerByPeer(p.peerId);
  const hp = b.hp;
  step(w);
  expect(w.projectiles.includes(q)).toBe(false);
  expect(b.hp).toBe(hp);
});

it('Forge identity offers state the actual ally-blessing condition for reflection', () => {
  setForgeSeed(31);
  expect(getCharUpgrade('cl_light_g_b')!.desc).toContain('third-slot ally damage blessing');
  expect(getCharUpgrade('cl_light_g_b')!.desc).toContain('full absorption');
});

it('earning the identity on an existing composed blessing adds the paid component during refresh', () => {
  const { w, p } = setup(picks[0], []);
  p.abilities!.a3 = recompose(decompose(p.abilities!.a3), {
    slot: 'a3',
    name: 'Composed Blessing',
    cooldown: 12,
  });
  applyCharUpgrades(p, ['cl_light_g_b']);
  expect(p.abilities!.a3.components!.effects.some((e) => e.kind === 'reflectWard')).toBe(true);
  step(w, 'a3');
  expect(reflectionView(w, p)).toBeDefined();
});

it.each(['lifetime', 'range', 'both'])(
  'a nearly spent incoming %s receives a useful fresh return leg',
  (mode) => {
    const { w, p, b } = setup();
    b.pos = { x: 1000, y: 400 };
    step(w, 'a3');
    const q = shot(w, {
      pos: { x: 529, y: 400 },
      lifetime: mode === 'range' ? 3 : 0.011,
      rangeLeft: mode === 'lifetime' ? 900 : 6,
    });
    step(w);
    expect(q.reflected).toBe(true);
    expect(q.rangeLeft).toBe(900);
    expect(q.lifetime).toBeGreaterThanOrEqual(900 / 500);
    const hp = b.hp;
    for (let i = 0; i < 200 && w.projectiles.includes(q); i++) step(w);
    expect(b.hp).toBe(hp - 20);
    expect(p.reflectionWard).toBeUndefined();
  },
);
it('a missed return expires at its finite 900u travel cap', () => {
  const { w, b } = setup();
  b.pos = { x: 1000, y: 700 };
  step(w, 'a3');
  const q = shot(w, { pos: { x: 529, y: 400 }, lifetime: 0.011, rangeLeft: 6 });
  step(w);
  const start = { ...q.pos },
    hp = b.hp;
  for (let i = 0; i < 220 && w.projectiles.includes(q); i++) step(w);
  expect(w.projectiles.includes(q)).toBe(false);
  expect(q.pos.x - start.x).toBeCloseTo(900);
  expect(b.hp).toBe(hp);
});
it('a second caster replaces one capped recipient halo with the newest source, without stacking', () => {
  const { w, p, ally } = setup();
  ally.pos = { x: 520, y: 430 };
  ally.hp = 20;
  grantAbsorption(ally, 1000, 8);
  step(w, 'a3');
  expect(ally.reflectionWard?.ownerId).toBe(p.id);
  ally.abilities!.a3 = { ...p.abilities!.a3 };
  ally.cooldowns.a3 = 0;
  w.step(
    0.01,
    new Map([
      [
        'b',
        {
          seq: w.tick,
          move: zero,
          aim: right,
          buttons: { basic: false, a1: false, a2: false, a3: true, revive: false },
        },
      ],
    ]),
  );
  expect(ally.reflectionWard?.ownerId).toBe(ally.id);
  expect(reflectionView(w, ally)?.remaining).toBeGreaterThan(3.9);
  p.hp = 0;
  expect(reflectionView(w, ally)).toBeDefined();
  const q = shot(w, { pos: { x: 549, y: 430 } });
  step(w);
  expect(q.reflected).toBe(true);
  expect(reflectionView(w, ally)).toBeUndefined();
});
