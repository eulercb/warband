import { afterEach, describe, expect, it } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import { World } from '../src/engine/world/world';
import { guidedSpell, guidedBurst, GUIDANCE_DURATION } from '../src/engine/content/guidanceRules';
import { guidanceView, guidedProjectileView, launchGuidance } from '../src/engine/combat/guidance';
import {
  decompose,
  recompose,
  componentValue,
  refreshComponents,
  setForgeSeed,
  synthesizeAbility,
} from '../src/engine/content/forge';
import { grandEligible, normalizeGrandLoadout } from '../src/engine/content/grandSelections';
import { describeAbility } from '../src/engine/content/classes';
import { previewAbilityTable, previewSubAbility } from '../src/engine/content/charUpgrades';
import { Fx } from '../src/render/overlays/fx';
import { Camera } from '../src/render/pipeline/camera';
import { drawGuidance, drawGuidedBurst } from '../src/render/pipeline/guidanceVisuals';
import {
  openInfernalAperture,
  stepApertureProjectile,
} from '../src/engine/combat/infernalAperture';
import type { ExtSlot, InputCommand, Vec2 } from '../src/engine/core/types';
const right = { x: 1, y: 0 },
  up = { x: 0, y: 1 },
  left = { x: -1, y: 0 },
  zero = { x: 0, y: 0 };
const picks = ['so_wild_surge', 'so_wild_tides', 'so_wild_bend', 'so_wild_font'];
afterEach(() => setForgeSeed(null));
function setup(pick = picks[0], mods = ['so_wild_g_b']) {
  const w = new World({
    seed: 31,
    monsterId: 'lich',
    players: [
      {
        peerId: 'a',
        name: 'Wild',
        classId: 'sorcerer',
        subSkills: [pick],
        charUpgrades: mods,
        extraClasses: ['mage'],
      },
      { peerId: 'b', name: 'Other', classId: 'sorcerer' },
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
  w.players[1].pos = { x: 400, y: 700 };
  b.pos = { x: 1400, y: 700 };
  b.hp = b.maxHp = 10000;
  b.moveSpeed = 0;
  b.decisionTimer = 1000;
  return { w, p, b };
}
function step(w: World, slot?: ExtSlot, aim: Vec2 = right, dt = 0.01) {
  const buttons: InputCommand['buttons'] = {
    basic: false,
    a1: false,
    a2: false,
    a3: false,
    revive: false,
  };
  if (slot) buttons[slot] = true;
  w.step(dt, new Map([['a', { seq: w.tick, move: zero, aim, buttons, autofire: false }]]));
}
function cast(w: World, slot: ExtSlot = 'a1') {
  step(w, slot);
  for (let i = 0; i < 200 && w.players[0].castTimer > 0; i++) step(w);
}
function angle(v: Vec2) {
  return Math.atan2(v.y, v.x);
}
const gap = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
describe('Chaos Crossing manual guidance', () => {
  it.each(picks)('has a full-health starting Meteor route with %s', (pick) => {
    const { w, p } = setup(pick);
    cast(w);
    const q = w.projectiles[0],
      speed = Math.hypot(q.vel.x, q.vel.y),
      budget = q.rangeLeft,
      life = q.lifetime;
    expect(p.hp).toBe(p.maxHp);
    expect(q.guidance).toBe(p.guidance);
    expect(guidanceView(w, p)?.name).toBe(p.abilities!.a1.name);
    const remaining = p.guidance!.remaining;
    step(w, undefined, up, 0.1);
    expect(angle(q.vel)).toBeCloseTo(Math.PI * 0.1);
    expect(Math.hypot(q.vel.x, q.vel.y)).toBeCloseTo(speed);
    expect(p.guidance!.remaining).toBeCloseTo(remaining - 0.1);
    expect(q.lifetime).toBeCloseTo(life - 0.1);
    expect(q.rangeLeft).toBeCloseTo(budget - speed * 0.1);
    expect(w.serialize().projectiles[0].guidance).toBeDefined();
    expect(w.serialize().players[0].guidance).toBeDefined();
  });
  it.each([14, 60, 110])('keeps every fan offset and one clock at width %s', (width) => {
    const { w, p } = setup();
    p.subAbilities!.sub1!.spreadDeg = width;
    cast(w, 'sub1');
    const shots = [...w.projectiles],
      offsets = shots.map((q) => q.spreadOffset!);
    expect(shots).toHaveLength(6);
    const duration = p.guidance!.remaining;
    for (const q of shots) q.hitIds = [12345];
    step(w, undefined, up, 0.1);
    for (let i = 0; i < shots.length; i++) {
      expect(gap(angle(shots[i].vel), p.guidance!.angle + offsets[i])).toBeCloseTo(0);
      expect(shots[i].hitIds).toEqual([12345]);
    }
    expect(p.guidance!.remaining).toBeCloseTo(duration - 0.1);
  });
  it('Surge twins keep the enhanced damage budget and share guidance without duplicating resources', () => {
    const { w, p } = setup();
    cast(w, 'a2');
    cast(w);
    expect(w.projectiles).toHaveLength(2);
    expect(w.projectiles[0].guidance).toBe(w.projectiles[1].guidance);
    expect(w.projectiles.reduce((n, q) => n + q.damage, 0)).toBeCloseTo(
      p.abilities!.a1.damage * 1.2,
    );
    expect(p.buffs.some((b) => b.kind === 'spellSurge')).toBe(false);
    expect(p.buffs.some((b) => b.kind === 'wildWeave')).toBe(true);
  });
  it('max ordinary Meteor, Focus and Surge keep a full post-launch steering window', () => {
    const { w, p } = setup(picks[0], ['so_wild_g_b', ...Array<string>(5).fill('so_meteor')]);
    p.castMult = 0.1;
    p.cooldownMult = 0.1;
    cast(w, 'a2');
    cast(w);
    expect(p.guidance!.remaining).toBeCloseTo(GUIDANCE_DURATION - 0.01);
    expect(w.projectiles.length).toBeGreaterThan(0);
  });
  it('a newer eligible launch takes control; basics and ordinary utilities do not', () => {
    const { w, p } = setup();
    cast(w);
    const old = w.projectiles[0];
    step(w, 'basic');
    expect(p.guidance).toBe(old.guidance);
    step(w);
    cast(w, 'sub1');
    const group = p.guidance;
    expect(group).not.toBe(old.guidance);
    const heading = angle(old.vel);
    step(w, undefined, up, 0.1);
    expect(angle(old.vel)).toBeCloseTo(heading);
    expect(guidedProjectileView(w, old)).toBeUndefined();
    expect(
      w.projectiles.filter((q) => q.guidance === group).every((q) => angle(q.vel) > -Math.PI),
    ).toBe(true);
  });
  it('expiry is ballistic and cannot resume when the owner aims again', () => {
    const { w, p } = setup();
    cast(w);
    const q = w.projectiles[0];
    for (let i = 0; i < 130; i++) step(w, undefined, up);
    expect(guidanceView(w, p)).toBeUndefined();
    const heading = angle(q.vel);
    step(w, undefined, left, 0.1);
    expect(angle(q.vel)).toBeCloseTo(heading);
  });
  it.each(['down', 'class', 'source', 'scene'] as const)(
    'permanently releases surviving shots on %s',
    (reason) => {
      const { w, p } = setup();
      cast(w);
      const q = w.projectiles[0],
        source = p.abilities!.a1;
      if (reason === 'down') p.state = 'downed';
      if (reason === 'class') w.setActiveClass(p, 'mage');
      if (reason === 'source') p.abilities!.a1 = { ...source };
      if (reason === 'scene') w.finished = true;
      expect(guidanceView(w, p)).toBeUndefined();
      // A normal update invalidates the private record (finished worlds skip stepping).
      if (reason === 'scene') {
        step(w);
        w.finished = false;
      } else step(w, undefined, up);
      if (reason === 'scene') {
        w.setActiveClass(p, 'mage');
      }
      p.state = 'alive';
      if (p.classId !== 'sorcerer') w.setActiveClass(p, 'sorcerer');
      p.abilities!.a1 = source;
      const heading = angle(q.vel);
      step(w, undefined, left);
      expect(angle(q.vel)).toBeCloseTo(heading);
    },
  );
  it('zero aim holds the current heading and another player cannot steer the spell', () => {
    const { w, p } = setup();
    cast(w);
    const q = w.projectiles[0];
    w.players[1].aim = up;
    step(w, undefined, zero);
    expect(angle(q.vel)).toBeCloseTo(0);
    expect(p.guidance!.remaining).toBeLessThan(1.25);
  });
  it('cover still absorbs the spell; a missed spell does not find an enemy automatically', () => {
    const { w, p } = setup();
    cast(w);
    const q = w.projectiles[0];
    w.obstacles = [{ id: w.allocId(), pos: { x: q.pos.x + 35, y: q.pos.y }, radius: 20 }];
    step(w, undefined, right, 0.1);
    expect(w.projectiles).not.toContain(q);
    expect(guidanceView(w, p)).toBeUndefined();
  });
  it('a guided piercing shot cannot damage the same boss again while turning inside its body', () => {
    const { w, p, b } = setup();
    p.abilities!.a1 = {
      ...p.abilities!.a1,
      impactRadius: undefined,
      projSpeed: 80,
      pierce: 2,
      castTime: 0,
      damage: 5,
    };
    b.pos = { x: 580, y: 400 };
    b.radius = 30;
    cast(w);
    const q = w.projectiles[0];
    for (let i = 0; i < 100 && b.hp === b.maxHp; i++) step(w);
    expect(b.hp).toBeLessThan(b.maxHp);
    expect(q.hitIds).toContain(b.id);
    const after = b.hp;
    for (let i = 0; i < 6; i++) step(w, undefined, up, 0.05);
    expect(b.hp).toBe(after);
    expect(w.projectiles).toContain(q);
  });
  it('steering wraps normally across the torus without adding travel', () => {
    const { w, p } = setup();
    p.pos = { x: w.arena.w - 40, y: 400 };
    cast(w);
    const q = w.projectiles[0];
    const budget = q.rangeLeft;
    step(w, undefined, right, 0.1);
    expect(q.pos.x).toBeLessThan(200);
    expect(q.rangeLeft).toBeLessThan(budget);
  });
});
describe('retained guidance payloads', () => {
  it('prices and refreshes a composed copy without donor passive', () => {
    const { w, p } = setup();
    const original = p.abilities!.a1,
      c = decompose(original);
    c.delivery.castTime = 0;
    expect(
      componentValue(c) -
        componentValue({ ...c, effects: c.effects.filter((e) => e.kind !== 'guidedShot') }),
    ).toBe(24);
    w.setActiveClass(p, 'mage');
    p.cooldowns.a1 = 0;
    p.abilities!.a1 = recompose(c, original);
    p.abilities!.a1.components = refreshComponents(p.abilities!.a1);
    expect(describeAbility(p.abilities!.a1)).toContain('live aim');
    cast(w);
    expect(p.guidance).toBeDefined();
    step(w, undefined, up, 0.1);
    expect(w.projectiles[0].vel.y).toBeGreaterThan(0);
  });
  it('actual seeded synthesis can retain the priced effect on a positive projectile', () => {
    const { w, p } = setup();
    const source = p.abilities!.a1;
    let made;
    for (let seed = 0; seed < 32 && !made; seed++) {
      const candidate = synthesizeAbility(
        seed,
        'guided',
        'a1',
        [
          {
            name: 'Guided source',
            classId: 'sorcerer',
            className: 'Sorcerer',
            slot: 'a1',
            def: source,
          },
          {
            name: 'Other shot',
            classId: 'mage',
            className: 'Mage',
            slot: 'a1',
            def: { ...source, guidedShot: undefined },
          },
        ],
        new Set(['projectile']),
      ).def;
      if (guidedSpell(candidate)) made = candidate;
    }
    expect(made).toBeDefined();
    p.abilities!.a1 = made!;
    cast(w);
    expect(p.guidance).toBeDefined();
  });
  it.each(['dash', 'pbaoe', 'selfBuff', 'projectile'] as const)(
    'drops unsupported %s/basic guidance instead of hidden flat execution',
    (kind) => {
      const { p } = setup(),
        c = decompose(p.abilities!.a1);
      c.delivery.kind = kind;
      const made = recompose(c, {
        slot: kind === 'projectile' ? 'basic' : 'a1',
        name: 'Changed',
        cooldown: 8,
      });
      expect(guidedSpell(made)).toBe(false);
      expect(describeAbility(made)).not.toContain('live aim');
    },
  );
  it('returning shots retain their own controller and strip guidance through refresh/recompose', () => {
    const { p } = setup();
    const source = {
      ...p.abilities!.a1,
      impactRadius: undefined,
      returningShot: true,
      guidedShot: true,
    };
    const c = decompose(source);
    c.effects.push({ kind: 'guidedShot' });
    const made = recompose(c, source);
    expect(guidedSpell(made)).toBe(false);
    expect(refreshComponents(made).effects.some((e) => e.kind === 'guidedShot')).toBe(false);
  });
  it('guided zone-impact copies keep exactly one ordinary impact, not extra Surge twins', () => {
    const { w, p, b } = setup();
    const c = decompose(p.abilities!.a1);
    c.delivery.castTime = 0;
    c.effects.push({
      kind: 'zone',
      zone: { zoneKind: 'poison', radius: 80, duration: 2, tickDamage: 4 },
    });
    p.abilities!.a1 = recompose(c, p.abilities!.a1);
    b.pos = { x: 650, y: 400 };
    cast(w, 'a2');
    cast(w);
    expect(w.projectiles).toHaveLength(1);
    for (let i = 0; i < 60 && !w.groundZones.length; i++) step(w);
    expect(w.groundZones).toHaveLength(1);
    expect(b.hp).toBeLessThan(b.maxHp);
  });
  it('a conduit ends steering for the transported shot', () => {
    const { w, p } = setup();
    cast(w);
    const q = w.projectiles[0];
    const utility = {
      ...p.abilities!.a3,
      pilotCast: { spent: false },
      infernalAperture: { duration: 6, reach: 320, radius: 24, emberDamage: 22 },
    };
    p.abilities!.a3 = utility;
    openInfernalAperture(w, p, utility, 'a3');
    const a = p.infernalAperture!;
    q.pos = { x: a.entry.x - 50, y: a.entry.y };
    q.vel = { x: 600, y: 0 };
    q.rangeLeft = 1200;
    stepApertureProjectile(w, q, 0.1, () => true);
    expect(q.guidance).toBeUndefined();
    expect(guidedProjectileView(w, q)).toBeUndefined();
  });
  it('eligibility follows actual native/graft/Forge receivers and preserves an unusable identity bank', () => {
    const ctx = { classes: ['sorcerer' as const], history: [] as string[], subSkills: [picks[1]] };
    expect(grandEligible('so_wild_g_b', 'sorcerer', ctx)).toBe(true);
    for (let seed = 0; seed < 12; seed++) {
      setForgeSeed(seed);
      const candidates = [
        ...Object.values(previewAbilityTable('sorcerer', ['so_wild_g_b'])),
        previewSubAbility(picks[1], ['so_wild_g_b']),
      ];
      const eligible = candidates.some((ab) => ab && (guidedSpell(ab) || guidedBurst(ab)));
      expect(grandEligible('so_wild_g_b', 'sorcerer', ctx)).toBe(eligible);
      const selected = normalizeGrandLoadout(
        { version: 1, classes: { sorcerer: { bank: ['so_wild_g_b'], equipped: ['so_wild_g_b'] } } },
        ctx,
      );
      expect(selected.classes.sorcerer!.bank).toContain('so_wild_g_b');
      expect(selected.classes.sorcerer!.equipped.includes('so_wild_g_b')).toBe(eligible);
    }
  });
  it('basic and stale/incompatible flat flags cannot launch guidance', () => {
    const { w, p } = setup();
    expect(launchGuidance(w, p, p.abilities!.basic, 'basic', right)).toBeUndefined();
    const bad = {
      ...p.abilities!.a1,
      components: { delivery: { kind: 'projectile' as const }, effects: [] },
    };
    expect(guidedSpell(bad)).toBe(false);
  });
  it('draws active rings/arrows and bounded launch feedback', () => {
    const g = new Graphics(),
      fx = new Fx(new Container()),
      camera = new Camera(1280, 800);
    drawGuidance(g, { x: 100, y: 100 }, 0, 1, 1);
    expect(g.context.instructions.length).toBeGreaterThan(0);
    expect(g.getLocalBounds().minX).toBeGreaterThan(70);
    expect(g.getLocalBounds().minY).toBeGreaterThan(70);
    expect(g.getLocalBounds().width).toBeLessThan(80);
    fx.processEvents([{ t: 'spellGuidance', pos: { x: 100, y: 100 } }], camera);
    fx.draw(g, camera);
    fx.update(1000);
    fx.draw(g, camera);
    expect(g.context.instructions.length).toBe(0);
  });
});

it('renders queued, steered and ballistic burst footprints and a bounded relay flash', () => {
  const g = new Graphics(),
    fx = new Fx(new Container()),
    camera = new Camera(1280, 800);
  for (const [queued, guided] of [
    [false, true],
    [true, true],
    [false, false],
  ]) {
    g.clear();
    drawGuidedBurst(g, { x: 100, y: 100 }, 80, 1, 0.8, 0, queued, guided);
    expect(g.getLocalBounds().width).toBeCloseTo(162);
  }
  fx.processEvents([{ t: 'spellRelay', from: { x: 100, y: 100 }, to: { x: 300, y: 100 } }], camera);
  fx.draw(g, camera);
  expect(g.context.instructions.length).toBeGreaterThan(0);
  fx.update(1000);
  fx.draw(g, camera);
  expect(g.context.instructions.length).toBe(0);
});
