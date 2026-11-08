import { afterEach, describe, it, expect } from 'vitest';
import { Graphics } from 'pixi.js';
import { World } from '../src/engine/world/world';
import { resolvePlayerAbility, stepPlayerGlide } from '../src/engine/combat/abilities';
import {
  palmContact,
  palmDirection,
  palmSweepView,
  reservePalmSweep,
  startPalmSweep,
  validPalmSweep,
} from '../src/engine/combat/palmSweep';
import { CLASSES, describeAbility, resolvedPalmSweep } from '../src/engine/content/classes';
import { previewAbilityTable, previewSubAbility } from '../src/engine/content/charUpgrades';
import {
  decompose,
  recompose,
  refreshComponents,
  componentValue,
  synthesizeAbility,
  synthesizeClass,
  setForgeSeed,
} from '../src/engine/content/forge';
import { applyBuff, makeBuff } from '../src/engine/combat/combat';
import { drawPalmSweep } from '../src/render/pipeline/palmVisuals';
import type { Player, ExtSlot, Vec2 } from '../src/engine/core/types';
const zero = { x: 0, y: 0 },
  right = { x: 1, y: 0 },
  left = { x: -1, y: 0 };
const skills = ['mo_openhand_flurry', 'mo_openhand_wave', 'mo_openhand_wind', 'mo_openhand_ki'];
afterEach(() => setForgeSeed(null));
function setup(skill = skills[0], ids = ['mo_openhand_g_b']) {
  const w = new World({
    seed: 31,
    monsterId: 'dragon',
    players: [
      {
        peerId: 'a',
        name: 'Monk',
        classId: 'monk',
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
  b.pos = { x: 600, y: 400 };
  b.hp = b.maxHp = 10000;
  b.moveSpeed = 0;
  b.decisionTimer = 1000;
  return { w, p, b };
}
function use(w: World, p: Player, slot: ExtSlot, dir = zero) {
  (w as unknown as { tryUseAbility(p: Player, s: ExtSlot, d: Vec2): void }).tryUseAbility(
    p,
    slot,
    dir,
  );
}
function step(w: World, count = 1) {
  for (let i = 0; i < count; i++)
    w.step(
      0.05,
      new Map([
        [
          'a',
          {
            seq: w.tick,
            move: zero,
            aim: right,
            buttons: { basic: false, a1: false, a2: false, a3: false, revive: false },
          },
        ],
      ]),
    );
}
describe('body-carried Palm', () => {
  it.each(skills)('works with actual starting Step and every first pick: %s', (skill) => {
    const { w, p, b } = setup(skill);
    use(w, p, 'a2', right);
    stepPlayerGlide(w, p, 0.2);
    expect(p.pos.x).toBe(750);
    p.buffs = p.buffs.filter((b) => b.kind !== 'invuln');
    const before = b.hp;
    use(w, p, 'a3', right);
    expect(p.castTimer).toBe(0);
    expect(palmSweepView(w, p)).toMatchObject({ active: true, radius: 165, dir: right });
    expect(p.buffs.filter((b) => b.kind === 'frontGuard')).toHaveLength(1);
    expect(p.buffs.some((b) => b.kind === 'invuln')).toBe(false);
    for (let i = 0; i < 8; i++) stepPlayerGlide(w, p, 0.05);
    expect(p.pos.x).toBe(930);
    expect(p.glide).toBeNull();
    expect(b.hp).toBe(before - p.abilities!.a3.damage);
    expect(w.events.filter((e) => e.t === 'cast' && e.slot === 'a3')).toHaveLength(1);
  });
  it('keeps the unprepared windup and captures direction at original press', () => {
    const { w, p, b } = setup();
    use(w, p, 'a3', left);
    expect(p.castTimer).toBe(0.4);
    expect(p.glide).toBeFalsy();
    expect(palmSweepView(w, p)).toMatchObject({ casting: true, dir: left, radius: 130 });
    p.aim = right;
    step(w, 9);
    expect(p.glide?.palmSweep).toBeDefined();
    expect(p.glide?.dir).toEqual(left);
    const hp = b.hp;
    step(w, 10);
    expect(p.pos.x).toBeLessThan(500);
    expect(b.hp).toBe(hp);
    expect(p.cooldowns.a3).toBeGreaterThan(14);
  });
  it('hits departure and newly crossed foes once, including lethal and immune contacts', () => {
    const { w, p, b } = setup();
    applyBuff(p, makeBuff('flow', 0, 4, 'flow'));
    use(w, p, 'a3', right);
    const first = b.hp;
    expect(first).toBeLessThan(10000);
    for (let i = 0; i < 8; i++) stepPlayerGlide(w, p, 0.05);
    expect(b.hp).toBe(first);
    p.cooldowns.a3 = 0;
    b.pos = { x: 850, y: 400 };
    b.hp = 1;
    resolvePlayerAbility(w, p, 'a3', right);
    stepPlayerGlide(w, p, 1);
    expect(b.hp).toBeLessThanOrEqual(0);
    const immune = setup();
    applyBuff(immune.b, makeBuff('invuln', 0, 1, 'immune'));
    resolvePlayerAbility(immune.w, immune.p, 'a3', right);
    immune.b.buffs = [];
    stepPlayerGlide(immune.w, immune.p, 0.1);
    expect(immune.b.hp).toBe(10000);
  });
  it('clips movement at solid cover with no extra landing attack', () => {
    const { w, p, b } = setup();
    w.obstacles = [{ id: 900, pos: { x: 610, y: 400 }, radius: 30, kind: 'rock' }];
    resolvePlayerAbility(w, p, 'a3', right);
    const hp = b.hp;
    stepPlayerGlide(w, p, 1);
    expect(p.pos.x).toBeLessThan(610);
    expect(p.glide).toBeNull();
    expect(b.hp).toBe(hp);
    expect(w.events.filter((e) => e.t === 'skillArea')).toHaveLength(0);
  });
  it('rooted launch remains an ordinary local Palm and explains the restriction', () => {
    const { w, p, b } = setup();
    applyBuff(p, makeBuff('root', 0, 4, 'root'));
    expect(palmSweepView(w, p)?.blocked).toContain('Rooted');
    resolvePlayerAbility(w, p, 'a3', right);
    expect(b.hp).toBeLessThan(10000);
    expect(p.glide).toBeFalsy();
    expect(p.pos).toEqual({ x: 500, y: 400 });
  });
  it.each(['root', 'stun', 'shove', 'down', 'class', 'scene', 'source'] as const)(
    'interrupts the active footprint for %s',
    (reason) => {
      const { w, p } = setup();
      resolvePlayerAbility(w, p, 'a3', right);
      const from = { ...p.pos };
      if (reason === 'root' || reason === 'stun') applyBuff(p, makeBuff(reason, 0, 3, reason));
      if (reason === 'shove') p.shove = { vx: 200, vy: 0, remaining: 1 };
      if (reason === 'down') p.state = 'downed';
      if (reason === 'class') w.setActiveClass(p, 'mage');
      if (reason === 'scene') w.scene = 'reward';
      if (reason === 'source') p.abilities!.a3 = { ...p.abilities!.a3 };
      stepPlayerGlide(w, p, 0.05);
      expect(p.pos).toEqual(from);
      expect(p.glide).toBeNull();
    },
  );
  it('applies Death Touch force from the actual first-contact origin', () => {
    const { w, p, b } = setup(skills[0], ['mo_openhand_g_b', 'mo_gk_a3_a']);
    b.pos = { x: 850, y: 400 };
    resolvePlayerAbility(w, p, 'a3', right);
    stepPlayerGlide(w, p, 1);
    expect(b.shove?.vx).toBeLessThan(0);
    expect(Math.abs(b.shove!.vx) * b.shove!.remaining).toBeCloseTo(110);
  });
});
describe('copy and ownership contracts', () => {
  it('a copied composed burst travels without Flow or the donor passive', () => {
    const { w, p, b } = setup(skills[0], []);
    p.subclassPassiveId = undefined;
    p.abilities!.a3 = recompose(decompose({ ...p.abilities!.a3, palmSweep: { distance: 180 } }), {
      slot: 'a3',
      name: 'Copied Palm',
      cooldown: 9,
    });
    b.pos = { x: 800, y: 400 };
    resolvePlayerAbility(w, p, 'a3', right);
    expect(p.glide?.palmSweep).toBeDefined();
    stepPlayerGlide(w, p, 1);
    expect(b.hp).toBeLessThan(10000);
  });
  it('requires live matching source and epoch, rejects incompatible contracts', () => {
    const { w, p } = setup();
    const ab = p.abilities!.a3;
    const cast = reservePalmSweep(w, p, ab, 'a3', zero)!;
    expect(validPalmSweep(w, p, cast)).toBe(true);
    p.palmEpoch = 1;
    expect(validPalmSweep(w, p, cast)).toBe(false);
    expect(startPalmSweep(w, p, { ...ab, palmSweepCast: cast })).toBe(false);
    expect(startPalmSweep(w, p, ab)).toBe(false);
    expect(reservePalmSweep(w, p, p.abilities!.basic, 'basic', zero)).toBeUndefined();
    w.scene = 'reward';
    expect(reservePalmSweep(w, p, ab, 'a3', zero)).toBeUndefined();
    expect(palmSweepView(w, p)).toBeUndefined();
    expect(resolvedPalmSweep({ ...ab, infernalClaim: true })).toBeUndefined();
    expect(resolvedPalmSweep({ ...ab, ancestralRelay: { range: 360 } })).toBeUndefined();
  });
  it('computes continuous first contact across the arena seam and misses safely', () => {
    expect(palmContact({ x: 1590, y: 400 }, { x: 100, y: 400 }, { x: 40, y: 400 }, 10)).toEqual({
      x: 30,
      y: 400,
    });
    expect(palmContact(zero, zero, { x: 10, y: 0 }, 1)).toBeNull();
    expect(palmContact(zero, { x: 20, y: 0 }, { x: 10, y: 50 }, 1)).toBeNull();
    expect(palmContact(zero, { x: 20, y: 0 }, { x: 30, y: 0 }, 1)).toBeNull();
    expect(palmDirection(zero, zero)).toEqual(right);
    expect(palmDirection(left, right)).toEqual(left);
  });
});
describe('content and Forge', () => {
  it('removes redundant/scattered riders while preserving individual grands', () => {
    const a = previewAbilityTable('monk', ['mo_openhand_g_a']);
    expect(a.a2.prepareFlow).toBe(6);
    expect(a.basic.flowExtendOnHit).toBe(0.25);
    expect(a.a1.controlDamageBonus).toBe(0.25);
    const b = previewAbilityTable('monk', ['mo_openhand_g_b']);
    expect(b.a2.healOnUse).toBe(18);
    expect(b.a2.steadfastDuration).toBeUndefined();
    expect(b.a3.lifestealFrac).toBeUndefined();
    expect(previewSubAbility('mo_openhand_wind', ['mo_openhand_g_b'])?.crossingGuard).toBeDefined();
  });
  it('round-trips, prices, caps, refreshes and generates the portable component', () => {
    const raw = previewAbilityTable('monk', ['mo_openhand_g_b']).a3,
      comp = decompose(raw);
    const ab = recompose(comp, { slot: 'a3', name: 'Palm', cooldown: 9 });
    expect(resolvedPalmSweep(ab)).toEqual({ distance: 180 });
    expect(componentValue(comp)).toBeGreaterThan(
      componentValue(decompose(CLASSES.monk.abilities.a3)),
    );
    expect(describeAbility(ab)).toContain('over 0.4s');
    ab.palmSweep = { distance: 1000 };
    expect(refreshComponents(ab).effects).toContainEqual({ kind: 'palmSweep', distance: 180 });
    const donor = {
      classId: 'monk' as const,
      className: 'Monk',
      name: 'Palm',
      slot: 'a3' as const,
      def: raw,
    };
    for (let seed = 0; seed < 20; seed++) {
      const syn = synthesizeAbility(seed, 'sweep', 'a3', [donor]);
      expect(syn.def.cooldown).toBeGreaterThan(0);
      expect(resolvedPalmSweep(syn.def)?.distance ?? 180).toBeLessThanOrEqual(180);
    }
  });
  it('rejects basic, incompatible origins and duplicate sweep components', () => {
    const raw = previewAbilityTable('monk', ['mo_openhand_g_b']).a3,
      c = decompose(raw);
    c.effects.push({ kind: 'palmSweep', distance: 90 });
    expect(
      recompose(c, { slot: 'a3', name: 'Palm', cooldown: 9 }).components!.effects.filter(
        (e) => e.kind === 'palmSweep',
      ),
    ).toHaveLength(1);
    expect(recompose(c, { slot: 'basic', name: 'Palm', cooldown: 9 }).palmSweep).toBeUndefined();
    c.effects.push({ kind: 'ancestralRelay', range: 360 });
    const neither = recompose(c, { slot: 'a3', name: 'Palm', cooldown: 9 });
    expect(neither.palmSweep).toBeUndefined();
    expect(neither.ancestralRelay).toBeUndefined();
  });
  it('ensures a compatible starting receiver for every Forge first pick', () => {
    for (const skill of skills) {
      setForgeSeed(7);
      const { w, p } = setup(skill);
      const ab = Object.values(p.abilities!).find((a) => resolvedPalmSweep(a));
      expect(ab).toBeDefined();
      resolvePlayerAbility(w, p, ab!.slot, zero);
      expect(p.glide?.palmSweep).toBeDefined();
      setForgeSeed(null);
    }
    const mage = CLASSES.mage,
      donors = Object.values(mage.abilities).map((def) => ({
        classId: mage.id,
        className: mage.name,
        name: def.name,
        slot: def.slot,
        def,
      }));
    for (let seed = 0; seed < 10; seed++) {
      const c = synthesizeClass(seed, CLASSES.monk, donors);
      expect(Object.values(c.abilities).some((a) => a.kind === 'pbaoe' && !a.infernalClaim)).toBe(
        true,
      );
    }
  });
  it('renders a body-bound active footprint and a root-aware planning cue', () => {
    const { w, p } = setup(),
      g = new Graphics(),
      screen = (v: Vec2) => v;
    const ready = palmSweepView(w, p)!;
    drawPalmSweep(g, ready, p.pos, screen, 1, true);
    drawPalmSweep(g, ready, p.pos, screen, 1, false);
    resolvePlayerAbility(w, p, 'a3', right);
    const active = palmSweepView(w, p)!;
    drawPalmSweep(g, active, p.pos, screen, 0.6, false);
    drawPalmSweep(g, { ...active, blocked: 'Rooted' }, p.pos, screen, 1, true);
    expect(g.context.instructions.length).toBeGreaterThan(0);
    g.destroy();
  });
});

it('sweeps bosses and summons once across the full path, including a small copied footprint', () => {
  const { w, p, b } = setup();
  b.pos = { x: 800, y: 400 };
  const ab = { ...p.abilities!.a3, radius: 30 };
  p.abilities!.a3 = ab;
  const adds = [
    {
      id: w.allocId(),
      pos: { x: 590, y: 400 },
      hp: 1000,
      maxHp: 1000,
      radius: 12,
      moveSpeed: 0,
      targetId: null,
      attackCd: 0,
      buffs: [],
    },
    {
      id: w.allocId(),
      pos: { x: 650, y: 400 },
      hp: 1000,
      maxHp: 1000,
      radius: 12,
      moveSpeed: 0,
      targetId: null,
      attackCd: 0,
      buffs: [],
    },
  ];
  w.adds.push(...adds);
  resolvePlayerAbility(w, p, 'a3', right);
  stepPlayerGlide(w, p, 1);
  for (const add of adds) expect(add.hp).toBe(1000 - ab.damage);
  expect(b.hp).toBe(10000);
});

it('previews the actual prepared/default/capped footprint and rejects an unbound source', () => {
  const { w, p } = setup();
  const ab = p.abilities!.a3;
  expect(reservePalmSweep(w, p, ab, 'sub2', zero)).toBeUndefined();
  p.subAbilities!.sub2 = { ...ab, slot: 'sub2' };
  p.abilities!.a3 = { ...ab, palmSweep: undefined };
  expect(palmSweepView(w, p)?.slot).toBe('sub2');
  expect(palmSweepView(w, p)?.ready).toBe(true);
  p.abilities!.a3 = ab;
  delete p.subAbilities!.sub2;
  p.cooldowns.a3 = 0;
  expect(palmSweepView(w, p)?.ready).toBe(true);
  applyBuff(p, makeBuff('flow', 0, 0, 'flow'));
  expect(palmSweepView(w, p)?.radius).toBe(130);
  applyBuff(p, makeBuff('flow', 0, 4, 'flow'));
  expect(palmSweepView(w, p)?.radius).toBe(165);
  p.abilities!.a3 = { ...ab };
  delete p.abilities!.a3.radius;
  expect(palmSweepView(w, p)?.radius).toBe(165);
  p.buffs = [];
  expect(palmSweepView(w, p)?.radius).toBe(150);
  p.abilities!.a3.radius = 240;
  applyBuff(p, makeBuff('flow', 0, 4, 'flow'));
  expect(palmSweepView(w, p)?.radius).toBe(240);
});

it('can synthesize the priced sweep from the general donor pool', () => {
  const raw = previewAbilityTable('monk', ['mo_openhand_g_b']).a3;
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
    classId: 'monk',
    className: 'Monk',
    name: 'Travelling Palm',
    slot: 'a3',
    def: raw,
  });
  let found = false;
  for (let seed = 0; seed < 150; seed++) {
    const syn = synthesizeAbility(seed, 'portable-sweep', 'a3', donors);
    if (resolvedPalmSweep(syn.def)) {
      found = true;
      expect(componentValue(syn.def.components!)).toBeGreaterThan(0);
      break;
    }
  }
  expect(found).toBe(true);
});
it('never combines a travelling burst with a targeted claim and preserves component authority', () => {
  const raw = previewAbilityTable('monk', ['mo_openhand_g_b']).a3,
    c = decompose(raw);
  c.effects.push(
    ...decompose({ ...raw, palmSweep: undefined, infernalClaim: true }).effects.filter(
      (e) => e.kind === 'skillContract',
    ),
  );
  expect(recompose(c, { slot: 'a3', name: 'Claim', cooldown: 9 }).palmSweep).toBeUndefined();
  const stripped = { ...raw, components: decompose(CLASSES.monk.abilities.a3) };
  expect(resolvedPalmSweep(stripped)).toBeUndefined();
});

it('previews combined Flow and Momentum with the actual resolver without spending either', () => {
  const { w, p } = setup();
  p.abilities!.a3.spendsMomentum = true;
  p.buffs = [
    makeBuff('rageRhythm', 0, 6, 'rage'),
    makeBuff('momentum', 3, 6, 'momentum'),
    makeBuff('flow', 0, 4, 'flow'),
  ];
  const before = structuredClone(p.buffs);
  expect(palmSweepView(w, p)?.radius).toBe(195);
  expect(p.buffs).toEqual(before);
  resolvePlayerAbility(w, p, 'a3', right);
  expect(p.glide?.ab.radius).toBe(195);
  expect(palmSweepView(w, p)?.radius).toBe(195);
  expect(p.buffs.some((b) => b.kind === 'flow' || b.kind === 'momentum')).toBe(false);
});
