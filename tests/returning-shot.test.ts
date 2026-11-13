import { afterEach, describe, expect, it } from 'vitest';
import { Graphics } from 'pixi.js';
import { World } from '../src/engine/world/world';
import { resolvePlayerAbility } from '../src/engine/combat/abilities';
import {
  armReturningShot,
  prepareReturningStep,
  returningCaught,
} from '../src/engine/combat/returningShot';
import { resolvedReturningShot, describeAbility, CLASSES } from '../src/engine/content/classes';
import {
  previewAbilityTable,
  previewSubAbility,
  getCharUpgrade,
} from '../src/engine/content/charUpgrades';
import {
  decompose,
  recompose,
  refreshComponents,
  componentValue,
  synthesizeAbility,
  setForgeSeed,
} from '../src/engine/content/forge';
import { applyBuff, makeBuff } from '../src/engine/combat/combat';
import { drawReturningShot } from '../src/render/pipeline/returningVisuals';
import type { InputCommand } from '../src/engine/core/types';
const zero = { x: 0, y: 0 },
  right = { x: 1, y: 0 };
const skills = ['rg_hunter_hail', 'rg_hunter_mark', 'rg_hunter_stand', 'rg_hunter_volley'];
afterEach(() => setForgeSeed(null));
function setup(skill = skills[0], ids = ['rg_hunter_g_b'], single = true) {
  const w = new World({
    seed: 31,
    monsterId: 'dragon',
    players: [
      {
        peerId: 'a',
        name: 'Hunter',
        classId: 'ranger',
        charUpgrades: ids,
        subSkills: [skill],
        extraClasses: ['mage'],
      },
    ],
  });
  w.scene = null;
  w.obstacles = [];
  w.terrain = [];
  const p = w.players[0],
    b = w.boss!;
  p.pos = { x: 500, y: 400 };
  p.aim = right;
  p.critChance = 0;
  p.buffs = [];
  p.subclassPassiveId = undefined;
  b.pos = { x: 700, y: 400 };
  b.hp = b.maxHp = 10000;
  b.moveSpeed = 0;
  b.decisionTimer = 1000;
  if (single) p.abilities!.a1 = { ...p.abilities!.a1, projCount: 1, spreadDeg: 0 };
  return { w, p, b };
}
function advance(w: World, dt = 0.01) {
  (w as unknown as { updateProjectiles(dt: number): void }).updateProjectiles(dt);
}
function fire(w: World) {
  resolvePlayerAbility(w, w.players[0], 'a1', zero);
  return w.projectiles[0];
}
function untilReturn(w: World) {
  for (let i = 0; i < 150 && w.projectiles[0]?.returningShot?.phase === 'out'; i++) advance(w);
}
function finish(w: World) {
  for (let i = 0; i < 400 && w.projectiles.length; i++) advance(w);
  expect(w.projectiles).toHaveLength(0);
}
function input(w: World, buttons: Partial<InputCommand['buttons']> = {}, move = zero, dt = 0.01) {
  w.step(
    dt,
    new Map([
      [
        'a',
        {
          seq: w.tick,
          move,
          aim: right,
          buttons: { basic: false, a1: false, a2: false, a3: false, revive: false, ...buttons },
        },
      ],
    ]),
  );
}
describe('returning Hunter flight', () => {
  it.each([
    { speed: 700, range: 820, outward: 820 },
    { speed: 100, range: 820, outward: 300 },
    { speed: 700, range: 180, outward: 180 },
  ])(
    'preserves ordinary reachable outward distance ($speed/$range)',
    ({ speed, range, outward }) => {
      const { w, p, b } = setup();
      b.pos = { x: 1000, y: 800 };
      p.abilities!.a1.projSpeed = speed;
      p.abilities!.a1.maxRange = range;
      const shot = fire(w);
      const r = shot.returningShot!,
        start = r.shotPos.x;
      expect(r.outward).toBe(outward);
      expect(r.backSpeed).toBeGreaterThan(speed);
      expect(r.backLifetime).toBeLessThanOrEqual(0.8);
      for (let i = 0; i < 310 && r.phase === 'out'; i++) advance(w);
      expect(r.phase).toBe('back');
      expect(r.shotPos.x - start).toBeCloseTo(outward);
      finish(w);
    },
  );
  it.each([
    { x: 1, y: 0 },
    { x: 0, y: 1 },
  ])('reverses toward the original owner image across a seam (%s)', (aim) => {
    const { w, p, b } = setup();
    b.pos = { x: 1000, y: 800 };
    p.aim = aim;
    const shot = fire(w);
    untilReturn(w);
    const r = shot.returningShot!;
    expect(shot.vel.x * aim.x + shot.vel.y * aim.y).toBeLessThan(0);
    expect(Math.hypot(r.shotPos.x - r.ownerPos.x, r.shotPos.y - r.ownerPos.y)).toBeGreaterThan(800);
    advance(w, 0.1);
    expect(w.projectiles).toContain(shot);
    finish(w);
  });

  it.each(skills)('works from the starting Multishot with first pick %s', (skill) => {
    const { w, p, b } = setup(skill, undefined, false);
    input(w, { a1: true });
    for (let i = 0; i < 100; i++) input(w);
    expect(b.hp).toBeLessThan(10000);
    expect(p.cooldowns.a1).toBeGreaterThan(0);
    expect(w.events.filter((e) => e.t === 'cast' && e.slot === 'a1')).toHaveLength(0);
    expect(p.abilities!.basic.returningShot).toBeUndefined();
  });
  it.each([false, true])(
    'splits the existing damage into two single-contact legs and keeps the same cast token, composed=%s',
    (composed) => {
      const { w, p, b } = setup();
      if (composed) p.abilities!.a1 = recompose(decompose(p.abilities!.a1), p.abilities!.a1);
      const ab = p.abilities!.a1,
        shot = fire(w),
        token = shot.pilotCast;
      expect(shot.damage).toBe(ab.damage * 0.6);
      untilReturn(w);
      expect(b.hp).toBeCloseTo(10000 - ab.damage * 0.6);
      expect(shot.pilotCast).toBe(token);
      expect(shot.returningShot?.phase).toBe('back');
      expect(shot.returningShot?.turnFlash).toBeGreaterThan(0);
      finish(w);
      expect(b.hp).toBeCloseTo(10000 - ab.damage * 1.2);
      expect(w.events.filter((e) => e.t === 'hit' && e.targetId === b.id)).toHaveLength(2);
    },
  );
  it('does not turn inside a struck foe when the outbound piercing budget is spent', () => {
    const { w, p, b } = setup();
    p.abilities!.a1.pierce = 0;
    const shot = fire(w);
    for (let i = 0; i < 30; i++) advance(w);
    expect(b.hp).toBeCloseTo(10000 - p.abilities!.a1.damage * 0.6);
    expect(shot.returningShot?.phase).toBe('out');
    expect(shot.returningShot?.hitsLeft).toBe(0);
    const hp = b.hp;
    for (let i = 0; i < 10; i++) advance(w);
    expect(b.hp).toBe(hp);
    expect(shot.pos.x).toBeGreaterThan(b.pos.x + b.radius);
    finish(w);
    expect(b.hp).toBeCloseTo(10000 - p.abilities!.a1.damage * 1.2);
  });
  it('retains the authored hit count on each leg while harmless outbound travel passes more foes', () => {
    const { w, b } = setup();
    b.pos = { x: 1200, y: 100 };
    const adds = [585, 665, 745].map((x) => ({
      id: w.allocId(),
      pos: { x, y: 400 },
      hp: 1000,
      maxHp: 1000,
      radius: 10,
      moveSpeed: 0,
      targetId: null,
      attackCd: 0,
      buffs: [],
    }));
    w.adds.push(...adds);
    fire(w);
    untilReturn(w);
    expect(adds.map((a) => a.hp)).toEqual([988.6, 988.6, 1000]);
    finish(w);
    expect(adds.map((a) => a.hp)).toEqual([988.6, 977.2, 988.6]);
  });
  it('routes the returning leg toward the live body into a different firing lane', () => {
    const { w, p, b } = setup();
    b.pos = { x: 1000, y: 320 };
    const shot = fire(w);
    untilReturn(w);
    expect(b.hp).toBe(10000);
    p.pos = { x: 500, y: 200 };
    advance(w);
    expect(shot.vel.y).toBeLessThan(0);
    finish(w);
    expect(b.hp).toBeCloseTo(10000 - p.abilities!.a1.damage * 0.6);
  });
  it.each(['out', 'back'] as const)('solid cover absorbs the %s leg', (phase) => {
    const { w, b } = setup();
    b.pos = { x: 1200, y: 100 };
    fire(w);
    if (phase === 'back') untilReturn(w);
    w.obstacles = [{ id: 900, pos: { x: 650, y: 400 }, radius: 25, kind: 'rock' }];
    finish(w);
    expect(b.hp).toBe(10000);
  });
  it('preserves a short outward cap and supplies a separate finite return', () => {
    const { w, p, b } = setup();
    b.pos = { x: 1200, y: 100 };
    p.abilities!.a1.maxRange = 200;
    const shot = fire(w),
      start = shot.pos.x;
    untilReturn(w);
    expect(shot.pos.x - start).toBeCloseTo(200);
    expect(shot.rangeLeft).toBeGreaterThan(290);
    finish(w);
    const long = setup();
    long.b.pos = { x: 1200, y: 100 };
    const escaped = fire(long.w);
    untilReturn(long.w);
    long.p.pos = { x: 1100, y: 850 };
    finish(long.w);
    expect(escaped.returningShot!.backLifetime).toBeLessThan(0.8);
  });
  it('catches a returning shot when the owner steps into its current position', () => {
    const { w, p, b } = setup();
    b.pos = { x: 1200, y: 100 };
    p.abilities!.a1.maxRange = 180;
    const shot = fire(w);
    untilReturn(w);
    p.pos = { ...shot.pos };
    advance(w);
    expect(w.projectiles).toHaveLength(0);
  });
  it('sweeps the owner catch so a large step cannot shoot past the body', () => {
    const { w, p, b } = setup();
    b.pos = { x: 1200, y: 100 };
    const shot = fire(w);
    untilReturn(w);
    advance(w, 1);
    expect(w.projectiles).toHaveLength(0);
    expect(returningCaught(w, { ...shot, returningShot: undefined }, p.pos)).toBe(false);
  });
  it.each([
    'down',
    'dead',
    'hp',
    'scene',
    'finished',
    'class',
    'source',
    'removed',
    'missing',
  ] as const)('cancels on %s', (reason) => {
    const { w, p } = setup();
    fire(w);
    if (reason === 'down') p.state = 'downed';
    if (reason === 'dead') p.state = 'dead';
    if (reason === 'hp') p.hp = 0;
    if (reason === 'scene') w.scene = 'reward';
    if (reason === 'finished') w.finished = true;
    if (reason === 'class') {
      w.setActiveClass(p, 'mage');
      w.setActiveClass(p, 'ranger');
    }
    if (reason === 'source') p.abilities!.a1 = { ...p.abilities!.a1 };
    if (reason === 'removed') p.abilities!.a1.returningShot = false;
    if (reason === 'missing') w.players = [];
    advance(w);
    expect(w.projectiles).toHaveLength(0);
  });
  it('immunity consumes the contact as ordinary shots do, without repeated damage attempts', () => {
    const { w, b } = setup();
    applyBuff(b, makeBuff('invuln', 0, 3, 'immune'));
    fire(w);
    finish(w);
    expect(b.hp).toBe(10000);
  });
  it('preserves shared once-per-cast prepared refund state and the existing quarry mark', () => {
    const { w, p, b } = setup();
    p.subclassPassiveId = 'hunter_quarry';
    p.abilities!.a1.preparedRefund = 1;
    p.abilities!.a1.consumesPrecision = true;
    applyBuff(p, makeBuff('precision', 1, 4, 'precision'));
    const shot = fire(w),
      refund = shot.refundCast;
    untilReturn(w);
    expect(b.buffs.some((b) => b.source === 'hunterQuarry')).toBe(true);
    const marks = b.buffs.length;
    finish(w);
    expect(shot.refundCast).toBe(refund);
    expect(b.buffs.length).toBe(marks);
  });
});
describe('returning contract and readouts', () => {
  it('retains A growth and Roll tools while removing B suppression and field speed', () => {
    const t = previewAbilityTable('ranger', ['rg_hunter_g_b']);
    expect(t.basic.returningShot).toBeUndefined();
    expect(t.a1.returningShot).toBe(true);
    expect(t.a3.buffMoveMult).toBe(1.25);
    expect(t.a3.steadfastDuration).toBe(2);
    expect(previewSubAbility(skills[0], ['rg_hunter_g_b'])?.castSlow).toBeUndefined();
    expect(previewSubAbility(skills[2], ['rg_hunter_g_b'])?.zoneAllyMoveMult).toBe(1.2);
    expect(previewAbilityTable('ranger', ['rg_hunter_g_a']).a1.controlDamageBonus).toBe(0.25);
  });
  it('retains Honed and grands; explosive Quarry opts out while Multishot remains the route', () => {
    for (const id of [skills[1], skills[3]]) {
      const ab = previewSubAbility(id, [
        'rg_hunter_g_b',
        ...Array.from({ length: 5 }, () => `subup_${id}`),
        `${id}_g`,
      ])!;
      expect(resolvedReturningShot(ab)).toBe(id === skills[3]);
    }
    expect(
      resolvedReturningShot(previewAbilityTable('ranger', ['rg_hunter_g_b', 'rg_gk_a1_b']).a1),
    ).toBe(true);
  });
  it('copies, prices, refreshes and normalizes the component without donor class/passive', () => {
    const { w, p } = setup(skills[0], []);
    const raw = { ...p.abilities!.a1, returningShot: true };
    const c = decompose(raw);
    expect(componentValue({ ...c, delivery: { ...c.delivery, castTime: 0 } })).toBe(
      componentValue({
        ...decompose({ ...raw, returningShot: false }),
        delivery: { ...c.delivery, castTime: 0 },
      }) + 15,
    );
    w.setActiveClass(p, 'mage');
    p.abilities!.a1 = recompose(c, { slot: 'a1', name: 'Copied Hunt', cooldown: 6 });
    expect(refreshComponents(p.abilities!.a1).effects).toContainEqual({ kind: 'returningShot' });
    expect(describeAbility(p.abilities!.a1)).toContain('60% damage per leg');
    expect(fire(w).returningShot?.ownerClass).toBe('mage');
    c.effects.push({ kind: 'returningShot' });
    expect(
      recompose(c, raw).components!.effects.filter((e) => e.kind === 'returningShot'),
    ).toHaveLength(1);
  });
  it.each(['impact', 'zone', 'delivery'] as const)('rejects incompatible %s payloads', (bad) => {
    const raw = previewAbilityTable('ranger', ['rg_hunter_g_b']).a1,
      c = decompose(raw);
    if (bad === 'impact') c.delivery.impactRadius = 65;
    if (bad === 'zone')
      c.effects.push({
        kind: 'zone',
        zone: { zoneKind: 'entangle', radius: 90, duration: 3, tickDamage: 5 },
      });
    if (bad === 'delivery') c.delivery.kind = 'pbaoe';
    expect(recompose(c, raw).returningShot).toBeUndefined();
    expect(resolvedReturningShot({ ...raw, components: c })).toBe(false);
  });
  it('uses a compatible basic fallback for a real graft and returns to the special on reclaim', () => {
    const { w, p } = setup(skills[0], ['hy_inspire', 'rg_hunter_g_b']);
    expect(p.abilities!.a1.kind).toBe('buffAlly');
    expect(p.abilities!.basic.returningShot).toBe(true);
    resolvePlayerAbility(w, p, 'basic', zero);
    expect(w.projectiles[0].returningShot).toBeDefined();
    const restored = previewAbilityTable('ranger', ['hy_inspire', 'rg_hunter_g_b', 'restore:a1']);
    expect(restored.a1.returningShot).toBe(true);
    expect(restored.basic.returningShot).toBeUndefined();
  });
  it('preserves a kit with no compatible projectile instead of minting a free shot', () => {
    const { p } = setup(skills[0], []);
    p.abilities!.basic.kind = 'meleeCone';
    p.abilities!.a1.kind = 'pbaoe';
    getCharUpgrade('rg_hunter_g_b')!.apply({ player: p, abilities: p.abilities! });
    expect(Object.values(p.abilities!).some(resolvedReturningShot)).toBe(false);
  });
  it('actual Forge first picks preserve composed receivers or a plainly described fallback', () => {
    for (const id of skills) {
      setForgeSeed(7);
      const { w, p } = setup(id, undefined, false);
      const ab = Object.values(p.abilities!).find(resolvedReturningShot);
      if (ab) {
        resolvePlayerAbility(w, p, ab.slot, zero);
        expect(w.projectiles.some((s) => !!s.returningShot)).toBe(true);
        expect(describeAbility(ab)).toContain('60% damage per leg');
      }
      setForgeSeed(null);
    }
  });
  it('can synthesize the priced route from actual donors', () => {
    const ab = previewAbilityTable('ranger', ['rg_hunter_g_b']).a1;
    const donors = Object.values(CLASSES).flatMap((c) =>
      Object.values(c.abilities).map((def) => ({
        classId: c.id,
        className: c.name,
        name: def.name,
        slot: def.slot,
        def,
      })),
    );
    donors.push({
      classId: 'ranger',
      className: 'Ranger',
      name: 'Returning Multishot',
      slot: 'a1',
      def: ab,
    });
    let found = false;
    for (let seed = 0; seed < 200; seed++) {
      const syn = synthesizeAbility(seed, 'return-route', 'a1', donors);
      if (resolvedReturningShot(syn.def)) {
        found = true;
        expect(syn.def.impactRadius ?? 0).toBe(0);
        expect(syn.def.cooldown).toBeGreaterThan(0);
        break;
      }
    }
    expect(found).toBe(true);
  });
  it('publishes only phase/turn state and renders visibly different legs', () => {
    const { w } = setup(),
      shot = fire(w);
    const out = w.serialize().projectiles[0];
    expect(out.returnPhase).toBe('out');
    expect(JSON.stringify(out)).not.toContain('source');
    untilReturn(w);
    const back = w.serialize().projectiles[0];
    expect(back.returnPhase).toBe('back');
    expect(back.returnTurn).toBe(true);
    const g = new Graphics();
    drawReturningShot(g, out, out.pos, 1);
    drawReturningShot(g, back, back.pos, 0.8);
    drawReturningShot(g, { ...back, vel: zero, returnTurn: false }, back.pos, 1);
    expect(g.context.instructions.length).toBeGreaterThan(0);
    g.destroy();
    expect(shot.pilotCast).toBeDefined();
  });
});

it('catches a conduit-routed return before a large step overshoots its owner', () => {
  const { w, b } = setup();
  b.pos = { x: 1200, y: 100 };
  const shot = fire(w);
  untilReturn(w);
  shot.apertureUsed = true;
  advance(w, 1);
  expect(w.projectiles).toHaveLength(0);
});
it('keeps ordinary, stationary and transit projectile handling bounded', () => {
  const { w, p } = setup();
  const shot = fire(w);
  expect(prepareReturningStep(w, { ...shot, returningShot: undefined }, 0.1)).toBe(0.1);
  const before = shot.damage;
  armReturningShot(p, { ...shot, impactRadius: 50 }, p.abilities!.a1);
  expect(shot.damage).toBe(before);
  armReturningShot(
    p,
    { ...shot, onImpact: { kind: 'entangle', radius: 40, duration: 1 } },
    p.abilities!.a1,
  );
  armReturningShot(p, shot, { ...p.abilities!.a1, slot: 'sub2' });
  expect(shot.damage).toBe(before);
  shot.vel = zero;
  expect(prepareReturningStep(w, shot, 0.1)).toBe(0.1);
  shot.apertureTransit = {
    remaining: 1,
    exit: zero,
    velocity: right,
    classId: p.classId,
    slot: 'a1',
    source: p.abilities!.a1,
  };
  expect(prepareReturningStep(w, shot, 0.1)).toBe(0.1);
});
it('refresh removes an unavailable return component after an explosive upgrade', () => {
  const { p } = setup();
  p.abilities!.a1 = recompose(decompose(p.abilities!.a1), p.abilities!.a1);
  p.abilities!.a1.impactRadius = 65;
  const c = refreshComponents(p.abilities!.a1);
  expect(c.effects.some((e) => e.kind === 'returningShot')).toBe(false);
});
