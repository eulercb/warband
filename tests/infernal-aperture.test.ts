import { afterEach, describe, expect, it, vi } from 'vitest';
import { World } from '../src/engine/world/world';
import { resolvePlayerAbility } from '../src/engine/combat/abilities';
import * as combat from '../src/engine/combat/combat';
import { applyBuff, makeBuff } from '../src/engine/combat/combat';
import {
  apertureView,
  circleEntry,
  openInfernalAperture,
  resolvedAperture,
  stepApertureProjectile,
  tickInfernalApertures,
  tryApertureEmber,
} from '../src/engine/combat/infernalAperture';
import {
  decompose,
  recompose,
  componentValue,
  refreshComponents,
  setForgeSeed,
  synthesizeAbility,
} from '../src/engine/content/forge';
import { previewAbilityTable, describeCharOffer } from '../src/engine/content/charUpgrades';
import { describeAbility, getClass } from '../src/engine/content/classes';
import {
  boundedAbility,
  effectiveRecharge,
  persistentDuration,
} from '../src/engine/content/abilityLimits';
import { drawInfernalAperture } from '../src/render/pipeline/apertureVisuals';
import type { Add, ExtSlot, InputCommand, Player } from '../src/engine/core/types';
import type { Graphics } from 'pixi.js';
const zero = { x: 0, y: 0 };
afterEach(() => setForgeSeed(null));
function setup(skill = 'wa_fiend_hurl', upgrades = ['wa_fiend_g_a']) {
  const w = new World({
    seed: 31,
    monsterId: 'lich',
    players: [
      { peerId: 'a', name: 'A', classId: 'warlock', charUpgrades: upgrades, subSkills: [skill] },
    ],
  });
  w.scene = null;
  w.obstacles = [];
  w.terrain = [];
  const p = w.players[0],
    boss = w.boss!;
  p.pos = { x: 500, y: 400 };
  p.aim = { x: 1, y: 0 };
  p.critChance = 0;
  boss.pos = { x: 1000, y: 400 };
  boss.hp = boss.maxHp = 10000;
  boss.moveSpeed = 0;
  boss.decisionTimer = 100;
  return { w, p, boss };
}
function use(w: World, p: Player, slot: ExtSlot, fresh = true) {
  (
    w as unknown as { tryUseAbility(p: Player, s: ExtSlot, d: typeof zero, f: boolean): void }
  ).tryUseAbility(p, slot, zero, fresh);
}
function shots(w: World, dt: number) {
  (w as unknown as { updateProjectiles(dt: number): void }).updateProjectiles(dt);
}
function armed() {
  const s = setup();
  use(s.w, s.p, 'a3');
  return s;
}
function fire(w: World, p: Player) {
  resolvePlayerAbility(w, p, 'basic', zero);
  return w.projectiles.at(-1)!;
}
function frame(w: World, buttons: Partial<InputCommand['buttons']> = {}, autofire = true) {
  w.step(
    0.05,
    new Map([
      [
        'a',
        {
          seq: w.tick,
          move: zero,
          aim: { x: 1, y: 0 },
          autofire,
          buttons: { basic: false, a1: false, a2: false, a3: false, revive: false, ...buttons },
        },
      ],
    ]),
  );
}
function add(w: World, x: number, y = 400) {
  const a = {
    ...w.boss!,
    id: w.allocId(),
    pos: { x, y },
    radius: 10,
    hp: 1000,
    maxHp: 1000,
    buffs: [],
    targetId: w.players[0].id,
    attackCd: 0,
    moveSpeed: 0,
  } as unknown as Add;
  w.adds.push(a);
  return a;
}

describe('Infernal Aperture setup and fresh action', () => {
  it('fixes mouths to successful aim and emits only one later ember without a recast or cooldown change', () => {
    const { w, p } = armed(),
      a = p.infernalAperture!;
    expect(a.entry).toEqual({ x: 580, y: 400 });
    expect(a.exit).toEqual({ x: 820, y: 400 });
    const cd = p.cooldowns.a3,
      buffs = structuredClone(p.buffs),
      locks = structuredClone(p.rechargeLocks);
    use(w, p, 'a3');
    expect(w.projectiles).toHaveLength(0);
    w.tick++;
    use(w, p, 'a3', false);
    expect(w.projectiles).toHaveLength(0);
    p.pos.y += 100;
    p.aim = { x: 0, y: -1 };
    use(w, p, 'a3');
    expect(w.projectiles).toHaveLength(1);
    const ember = w.projectiles[0];
    expect(ember.damage).toBe(22);
    expect(ember.pos.y).toBeLessThan(p.pos.y);
    expect(ember.vel).toEqual({ x: 0, y: -660 });
    expect(p.cooldowns.a3).toBe(cd);
    expect(p.buffs).toEqual(buffs);
    expect(p.rechargeLocks).toEqual(locks);
    expect(w.events.filter((e) => e.t === 'cast')).toHaveLength(1);
    use(w, p, 'a3');
    expect(w.projectiles).toHaveLength(1);
    expect(a.entry).toEqual({ x: 580, y: 400 });
    expect(a.emberReady).toBe(false);
  });
  it.each([false, true])('requires release after held setup, autofire=%s', (auto) => {
    const { w, p } = setup();
    frame(w, { a3: true }, auto);
    frame(w, { a3: true }, auto);
    expect(w.projectiles).toHaveLength(0);
    frame(w, {}, auto);
    frame(w, { a3: true }, auto);
    expect(w.projectiles).toHaveLength(1);
    expect(p.infernalAperture!.emberReady).toBe(false);
  });
  it.each(['silence', 'stun'] as const)('blocks %s without spending ember', (kind) => {
    const { w, p } = armed();
    w.tick++;
    applyBuff(p, makeBuff(kind, 0, 2, 'test'));
    use(w, p, 'a3');
    expect(w.projectiles).toHaveLength(0);
    expect(apertureView(w, p)?.blocked).not.toBeNull();
    p.buffs = [];
    use(w, p, 'a3');
    expect(w.projectiles).toHaveLength(1);
  });
  it('blocks cast and forced movement, but permits a rooted stationary shot', () => {
    const { w, p } = armed();
    w.tick++;
    p.castTimer = 1;
    use(w, p, 'a3');
    expect(apertureView(w, p)?.blocked).toBe('Casting');
    p.castTimer = 0;
    p.shove = { vx: 0, vy: 1, remaining: 1 };
    use(w, p, 'a3');
    expect(apertureView(w, p)?.blocked).toBe('Moving');
    p.shove = null;
    applyBuff(p, makeBuff('root', 0, 1, 'test'));
    use(w, p, 'a3');
    expect(w.projectiles).toHaveLength(1);
  });
  it('rejects blocked endpoints without moving them or refunding the ordinary cast', () => {
    const { w, p } = setup();
    w.obstacles = [{ id: 900, pos: { x: 820, y: 400 }, radius: 15 }];
    use(w, p, 'a3');
    expect(p.infernalAperture).toBeUndefined();
    expect(p.cooldowns.a3).toBeGreaterThan(0);
    expect(p.buffs.some((b) => b.kind === 'damageDealt')).toBe(true);
    expect(w.events.some((e) => e.t === 'cast' && e.ability.includes('blocked by cover'))).toBe(
      true,
    );
  });
  it.each(['down', 'hp', 'class', 'source', 'contract', 'room', 'expiry'] as const)(
    'clears unavailable setup on %s',
    (reason) => {
      const { w, p } = armed();
      if (reason === 'down') p.state = 'downed';
      if (reason === 'hp') p.hp = 0;
      if (reason === 'room') w.scene = 'reward';
      if (reason === 'hp') p.hp = 0;
      if (reason === 'class') p.classId = 'mage';
      if (reason === 'source') p.abilities!.a3 = { ...p.abilities!.a3 };
      if (reason === 'contract') delete p.abilities!.a3.infernalAperture;
      if (reason === 'room') w.scene = 'reward';
      tickInfernalApertures(w, reason === 'expiry' ? 7 : 0);
      expect(p.infernalAperture).toBeUndefined();
      expect(apertureView(w, p)).toBeUndefined();
      expect(tryApertureEmber(w, p, 'a3', true)).toBe(false);
    },
  );
  it('publishes geometry/action only, never source or shared setup tokens', () => {
    const { w, p } = armed();
    const a = w.serialize().players[0].infernalAperture!;
    expect(Object.keys(a).sort()).toEqual([
      'blocked',
      'direction',
      'emberReady',
      'entry',
      'exit',
      'radius',
      'remaining',
      'slot',
    ]);
    a.entry.x = 0;
    expect(p.infernalAperture!.entry.x).toBe(580);
    expect(tryApertureEmber(w, p, 'sub1', true)).toBe(false);
  });
  it('leaves Pact intact and never creates the retired hit counter', () => {
    const { w, p, boss } = setup('wa_fiend_resilience', ['wa_fiend_g_b']);
    use(w, p, 'a3');
    expect(p.infernalAperture).toBeUndefined();
    expect(p.buffs.some((b) => b.kind === 'absorption')).toBe(true);
    fire(w, p);
    for (let i = 0; i < 10; i++) shots(w, 0.1);
    expect(boss.hp).toBeLessThan(boss.maxHp);
    expect(p.buffs.some((b) => b.kind === 'grandCadence')).toBe(false);
  });
});

describe('Swept entry, real conduit travel and outgoing collision', () => {
  it('bypasses intervening cover with finite transit while preserving projectile identity and tokens', () => {
    const { w, p, boss } = armed();
    w.obstacles = [{ id: 900, pos: { x: 700, y: 400 }, radius: 20 }];
    const shot = fire(w, p),
      token = shot.pilotCast,
      id = shot.id;
    shots(w, 0.1);
    expect(shot.apertureTransit).toBeDefined();
    expect(w.serialize().projectiles).toHaveLength(0);
    expect(boss.hp).toBe(boss.maxHp);
    shots(w, 0.2);
    expect(shot.apertureTransit).toBeDefined();
    shots(w, 0.5);
    expect(boss.hp).toBeLessThan(boss.maxHp);
    expect(shot.id).toBe(id);
    expect(shot.pilotCast).toBe(token);
    expect(shot.rangeLeft).toBeLessThan(820 - 240);
  });
  it('gives equivalent position, range and lifetime with coarse and fine steps', () => {
    const a = armed(),
      b = armed();
    const x = fire(a.w, a.p),
      y = fire(b.w, b.p);
    shots(a.w, 0.6);
    for (let i = 0; i < 12; i++) shots(b.w, 0.05);
    expect(x.pos.x).toBeCloseTo(y.pos.x, 6);
    expect(x.rangeLeft).toBeCloseTo(y.rangeLeft, 6);
    expect(x.lifetime).toBeCloseTo(y.lifetime, 6);
    expect(x.apertureUsed).toBe(true);
  });
  it.each(['before', 'exit', 'after'] as const)(
    'cover %s the conduit absorbs the shot at its real contact',
    (where) => {
      const { w, p, boss } = armed();
      w.obstacles = [
        {
          id: 900,
          pos: { x: where === 'before' ? 550 : where === 'exit' ? 820 : 900, y: 400 },
          radius: 12,
        },
      ];
      const s = fire(w, p);
      shots(w, 1);
      expect(w.projectiles).toHaveLength(0);
      expect(boss.hp).toBe(boss.maxHp);
      if (where === 'before') expect(s.apertureUsed).toBeUndefined();
    },
  );
  it('hits a nearer enemy before a farther cover obstacle or entrance', () => {
    const { w, p } = armed(),
      a = add(w, 550);
    w.obstacles = [{ id: 900, pos: { x: 650, y: 400 }, radius: 10 }];
    fire(w, p);
    shots(w, 0.5);
    expect(a.hp).toBeLessThan(1000);
    expect(w.projectiles).toHaveLength(0);
  });
  it('preserves piercing hit IDs across entry and exits into the nearest later recipient', () => {
    const { w, p, boss } = armed(),
      a = add(w, 550),
      b = add(w, 900);
    const s = fire(w, p);
    s.pierceLeft = 3;
    s.hitIds = [];
    const token = s.pilotCast;
    shots(w, 1);
    expect(a.hp).toBeLessThan(1000);
    expect(b.hp).toBeLessThan(1000);
    expect(boss.hp).toBeLessThan(boss.maxHp);
    expect(s.hitIds).toContain(a.id);
    expect(s.hitIds).toContain(b.id);
    expect(s.pilotCast).toBe(token);
    expect(s.apertureUsed).toBe(true);
  });
  it('does not route misses, backward crossings, setup shots or shots beginning on the mouth', () => {
    for (const mode of ['miss', 'back', 'setup', 'inside']) {
      const { w, p } = armed(),
        s = fire(w, p);
      if (mode === 'miss') s.pos.y += 40;
      if (mode === 'back') {
        s.pos.x = 620;
        s.vel.x = -660;
      }
      if (mode === 'setup') s.pilotCast = p.infernalAperture!.setupCast;
      if (mode === 'inside') s.pos.x = 580;
      shots(w, 0.2);
      expect(s.apertureUsed, mode).toBeUndefined();
    }
  });
  it('keeps lateral clearance and authored spread instead of collapsing fans', () => {
    const { w, p } = armed(),
      s = fire(w, p);
    s.pos.y += 10;
    s.spreadOffset = 0.1;
    shots(w, 0.5);
    expect(s.apertureUsed).toBe(true);
    expect(Math.atan2(s.vel.y, s.vel.x)).toBeCloseTo(0.1);
    expect(s.pos.y).toBeGreaterThan(410);
    const x = armed(),
      miss = fire(x.w, x.p);
    miss.pos.y += 17;
    shots(x.w, 0.2);
    expect(miss.apertureUsed).toBeUndefined();
  });
  it('charges the gap to range and refuses insufficient range or lifetime', () => {
    for (const key of ['range', 'life']) {
      const { w, p, boss } = armed(),
        s = fire(w, p);
      if (key === 'range') s.rangeLeft = 200;
      else s.lifetime = 0.2;
      shots(w, 0.5);
      expect(w.projectiles).toHaveLength(0);
      expect(boss.hp).toBe(boss.maxHp);
    }
  });
  it('never damages beyond an expired free-flight budget before entry or after exit', () => {
    for (const range of [10, 350]) {
      const { w, p, boss } = armed(),
        s = fire(w, p);
      s.rangeLeft = range;
      shots(w, 10);
      expect(boss.hp).toBe(boss.maxHp);
      expect(w.projectiles).toHaveLength(0);
    }
  });
  it('gate expiry preserves an admitted shot; death/class/source loss cancels transit', () => {
    for (const reason of [
      'expiry',
      'down',
      'hp',
      'room',
      'class',
      'source',
      'contract',
      'missing',
    ] as const) {
      const { w, p, boss } = armed();
      const s = fire(w, p);
      shots(w, 0.1);
      expect(s.apertureTransit).toBeDefined();
      if (reason === 'expiry') p.infernalAperture!.remaining = 0;
      if (reason === 'down') p.state = 'downed';
      if (reason === 'hp') p.hp = 0;
      if (reason === 'room') w.scene = 'reward';
      if (reason === 'class') p.classId = 'mage';
      if (reason === 'source') p.abilities!.a3 = { ...p.abilities!.a3 };
      if (reason === 'contract') delete p.abilities!.a3.infernalAperture;
      if (reason === 'missing') w.players = [];
      tickInfernalApertures(w, 0);
      shots(w, 1);
      expect(boss.hp < boss.maxHp, reason).toBe(reason === 'expiry');
    }
  });
  it('sweeps forward torus images beyond half a tile in a coarse step', () => {
    for (const cover of [false, true]) {
      const coarse = armed(),
        fine = armed();
      for (const s of [coarse, fine]) {
        s.boss.pos = { x: 400, y: 610 };
        s.boss.radius = 5;
        if (cover) s.w.obstacles = [{ id: 999, pos: { x: 400, y: 610 }, radius: 5 }];
        const shot = fire(s.w, s.p);
        shot.pos = { x: 400, y: 0 };
        shot.vel = { x: 0, y: 660 };
        shot.apertureUsed = true;
      }
      shots(coarse.w, 1);
      for (let i = 0; i < 20; i++) shots(fine.w, 0.05);
      expect(coarse.w.projectiles).toHaveLength(0);
      expect(fine.w.projectiles).toHaveLength(0);
      expect(coarse.boss.hp).toBeCloseTo(fine.boss.hp);
    }
  });
  it.each(['range', 'lifetime'])(
    'resolves exact exit-budget contacts with overlapping piercing recipients: %s',
    (budget) => {
      const { w, p, boss } = armed();
      boss.pos.x = 1400;
      const a = add(w, 820),
        b = add(w, 820),
        shot = fire(w, p);
      shot.pos = { x: 579, y: 400 };
      shot.vel = { x: 660, y: 0 };
      shot.pierceLeft = 2;
      shot.hitIds = [];
      if (budget === 'range') shot.rangeLeft = 241;
      else shot.lifetime = 241 / 660;
      shots(w, 241 / 660);
      expect(a.hp).toBeLessThan(1000);
      expect(b.hp).toBeLessThan(1000);
      expect(w.projectiles).toHaveLength(0);
    },
  );
  it.each([false, true])(
    'keeps actual native/composed fan offsets and shared tokens through changed player aim: %s',
    (composed) => {
      const { w, p, boss } = armed();
      boss.pos.x = 1400;
      p.abilities!.basic = { ...p.abilities!.basic, projCount: 3, spreadDeg: 10 };
      if (composed)
        p.abilities!.basic = recompose(decompose(p.abilities!.basic), p.abilities!.basic);
      resolvePlayerAbility(w, p, 'basic', zero);
      const fan = [...w.projectiles],
        token = fan[0].pilotCast;
      p.aim = { x: 0, y: 1 };
      shots(w, 0.6);
      expect(fan).toHaveLength(3);
      for (const s of fan) {
        expect(s.apertureUsed).toBe(true);
        expect(s.pilotCast).toBe(token);
        expect(Math.atan2(s.vel.y, s.vel.x)).toBeCloseTo(s.spreadOffset!);
      }
      expect(new Set(fan.map((s) => s.spreadOffset)).size).toBe(3);
    },
  );
  it('wraps fixed endpoints and routes across the torus seam', () => {
    const { w, p } = setup();
    p.pos.x = 1500;
    use(w, p, 'a3');
    expect(p.infernalAperture!.entry.x).toBe(1580);
    expect(p.infernalAperture!.exit.x).toBe(220);
    const s = fire(w, p);
    shots(w, 0.6);
    expect(s.apertureUsed).toBe(true);
    expect(s.pos.x).toBeLessThan(500);
  });
  it('never routes allied/enemy projectiles through this owner’s entrance', () => {
    const { w, p } = armed(),
      s = fire(w, p);
    s.ownerId = 999;
    expect(stepApertureProjectile(w, s, 0.2, () => true)).toBeNull();
    s.ownerId = p.id;
    s.side = 'boss';
    expect(stepApertureProjectile(w, s, 0.2, () => true)).toBeNull();
  });
  it('does not invent setup after invalid resolutions or route stationary/expired shots', () => {
    const { w, p } = setup(),
      ab = { ...p.abilities!.a3, pilotCast: { spent: false } };
    openInfernalAperture(w, p, ab, 'basic');
    expect(p.infernalAperture).toBeUndefined();
    p.state = 'downed';
    openInfernalAperture(w, p, ab, 'a3');
    expect(p.infernalAperture).toBeUndefined();
    p.state = 'alive';
    use(w, p, 'a3');
    const s = fire(w, p);
    s.vel = zero;
    expect(stepApertureProjectile(w, s, 0.1, () => true)).toBe(false);
    expect(stepApertureProjectile(w, s, 0, () => true)).toBeNull();
    s.vel = { x: 660, y: 0 };
    s.lifetime = 0;
    expect(stepApertureProjectile(w, s, 0.1, () => true)).toBe(false);
    w.scene = 'reward';
    s.apertureUsed = true;
    expect(stepApertureProjectile(w, s, 0.1, () => true)).toBe(false);
  });
});

describe('First picks, synthesis and shared slot ownership', () => {
  it.each(['wa_fiend_hurl', 'wa_fiend_pit', 'wa_fiend_rebuke', 'wa_fiend_resilience'])(
    'provides a full-health lone-boss route with %s',
    (skill) => {
      const { w, p, boss } = setup(skill);
      use(w, p, 'a1');
      use(w, p, 'a3');
      fire(w, p);
      shots(w, 1);
      expect(boss.hp).toBeLessThan(boss.maxHp);
      expect(p.infernalAperture).toBeDefined();
    },
  );
  it('prices and roundtrips the component; refresh and recovery use authoritative component duration', () => {
    const ab = previewAbilityTable('warlock', ['wa_fiend_g_a']).a3,
      c = decompose(ab);
    expect(componentValue(c)).toBeGreaterThan(
      componentValue({ ...c, effects: c.effects.filter((e) => e.kind !== 'infernalAperture') }),
    );
    const copy = recompose(c, ab);
    expect(copy.infernalAperture).toEqual(ab.infernalAperture);
    expect(describeAbility(copy)).toContain('one 22-damage ember');
    copy.infernalAperture!.duration = 5;
    copy.components = refreshComponents(copy);
    expect(resolvedAperture(copy)?.duration).toBe(5);
    expect(
      persistentDuration({
        ...copy,
        components: {
          ...copy.components,
          effects: copy.components.effects.filter((e) => e.kind === 'infernalAperture'),
        },
      }),
    ).toBe(5);
    expect(effectiveRecharge(copy, 0.1, 1, 'a3')).toBeGreaterThanOrEqual(7);
    copy.components.effects = copy.components.effects.filter((e) => e.kind !== 'infernalAperture');
    expect(resolvedAperture(copy)).toBeUndefined();
    expect(
      boundedAbility({ ...ab, infernalAperture: { ...ab.infernalAperture!, reach: 9999 } })
        .infernalAperture.reach,
    ).toBe(400);
  });
  it('actual synthesis produces a priced self-contained action even with no projectile partner', () => {
    const source = previewAbilityTable('warlock', ['wa_fiend_g_a']).a3;
    let ab;
    for (let seed = 0; seed < 50; seed++) {
      const fused = synthesizeAbility(seed, 'aperture', 'a3', [
        {
          name: 'Buff',
          classId: 'warlock',
          className: 'Warlock',
          slot: 'a3',
          def: { ...source, infernalAperture: undefined },
        },
        {
          name: 'Conduit',
          classId: 'warlock',
          className: 'Warlock',
          slot: 'a2',
          def: {
            name: 'Conduit',
            kind: 'selfBuff',
            cooldown: 14,
            damage: 0,
            infernalAperture: source.infernalAperture,
          },
        },
      ]).def;
      if (resolvedAperture(fused)) {
        ab = fused;
        break;
      }
    }
    expect(ab).toBeDefined();
    if (!ab) throw new Error('No aperture synthesis found');
    const { w, p } = setup('wa_fiend_hurl', []);
    p.abilities!.a3 = ab;
    p.subclassPassiveId = undefined;
    use(w, p, 'a3');
    w.tick++;
    use(w, p, 'a3');
    expect(w.projectiles[0].damage).toBeLessThanOrEqual(22);
    expect(w.projectiles[0].damage).toBeGreaterThan(0);
    expect(describeAbility(ab)).toContain('one ');
    expect(decompose(recompose(decompose(ab), ab))).toEqual(decompose(ab));
  });
  it('installs into active Forge kits and reports the receiving skill honestly', () => {
    setForgeSeed(47);
    const { w, p } = setup();
    expect(resolvedAperture(p.abilities!.a3)).toBeDefined();
    expect(describeCharOffer('warlock', [], 'wa_fiend_g_a')?.desc).toContain('one aimed ember');
    p.cooldowns.a3 = 14;
    resolvePlayerAbility(w, p, 'a3', zero);
    expect(p.infernalAperture).toBeDefined();
  });
  it('isolates the native a3 contract from a real graft and restores it on reclaim', () => {
    for (const history of [
      ['wa_fiend_g_a', 'hy_shadowpact'],
      ['hy_shadowpact', 'wa_fiend_g_a'],
    ]) {
      const { w, p } = setup('wa_fiend_hurl', history);
      expect(p.abilities!.a3.name).toBe('Shadowstep');
      expect(resolvedAperture(p.abilities!.a3)).toBeUndefined();
      use(w, p, 'a3');
      expect(p.infernalAperture).toBeUndefined();
      const restored = setup('wa_fiend_hurl', [...history, 'restore:a3']);
      use(restored.w, restored.p, 'a3');
      expect(restored.p.infernalAperture).toBeDefined();
    }
    expect(getClass('warlock').abilities.a3.infernalAperture).toBeUndefined();
  });
  it('routes actual Hurl grand impact damage once without changing its payload or shared token', () => {
    const { w, p, boss } = setup('wa_fiend_hurl', ['wa_fiend_g_a', 'wa_fiend_hurl_g']);
    use(w, p, 'a3');
    resolvePlayerAbility(w, p, 'sub1', zero);
    const shot = w.projectiles[0];
    expect(shot.impactRadius).toBe(65);
    const token = shot.pilotCast,
      damage = shot.damage;
    shots(w, 1);
    expect(shot.apertureUsed).toBe(true);
    expect(shot.pilotCast).toBe(token);
    expect(shot.impactRadius).toBe(65);
    expect(shot.damage).toBe(damage);
    expect(boss.hp).toBeLessThan(boss.maxHp);
    expect(w.events.filter((e) => e.t === 'skillArea' && e.area.radius === 65)).toHaveLength(1);
  });
  it('keeps an actual routed piercing cast reward once-per-cast through multiple recipients', () => {
    const { w, p, boss } = armed();
    boss.pos.x = 1400;
    add(w, 850);
    add(w, 900);
    const shot = fire(w, p);
    shot.pierceLeft = 2;
    shot.hitIds = [];
    shot.precisionOnHit = 3;
    const spy = vi.spyOn(combat, 'applyBuff');
    shots(w, 1);
    expect(
      spy.mock.calls.filter(([target, b]) => target === p && b.kind === 'precision'),
    ).toHaveLength(1);
    expect(shot.pilotCast?.utilitySpent).toBe(true);
    expect(shot.hitIds).toHaveLength(2);
    spy.mockRestore();
  });

  it('prioritizes earned Return over Ember, but lets an unarmed portable reprise use the supplied shot', () => {
    const { w, p, boss } = setup();
    const native = previewAbilityTable('rogue', ['ro_assassin_g_a']).a2;
    const c = decompose(p.abilities!.a3);
    c.effects.push({
      kind: 'shadowReprise',
      reprise: { ...native.shadowReprise!, prepared: false },
    });
    p.abilities!.a3 = recompose(c, p.abilities!.a3);
    use(w, p, 'a3');
    w.tick++;
    p.pos.x += 40;
    use(w, p, 'a3');
    expect(w.projectiles).toHaveLength(1);
    boss.pos = { x: 540, y: 400 };
    shots(w, 0.05);
    expect(p.shadowReprise?.armedTick).toBeDefined();
    w.tick++;
    use(w, p, 'a3');
    expect(p.pos.x).toBe(500);
    expect(p.infernalAperture!.emberReady).toBe(false);
  });
  it('an earned return owns the slot while its supplied ember remains unused', () => {
    const { w, p } = setup();
    const shadow = previewAbilityTable('rogue', ['ro_assassin_g_a']).a2.shadowReprise!;
    const c = decompose(p.abilities!.a3);
    c.effects.push({ kind: 'shadowReprise', reprise: { ...shadow, prepared: false } });
    p.abilities!.a3 = recompose(c, p.abilities!.a3);
    use(w, p, 'a3');
    p.pos.x += 40;
    w.onPlayerDirectHit(p, w.boss!, 10, false, undefined, { cast: { spent: false } });
    w.tick++;
    use(w, p, 'a3');
    expect(p.pos.x).toBe(500);
    expect(w.projectiles).toHaveLength(0);
    expect(p.infernalAperture?.emberReady).toBe(true);
  });
  it('handles legacy fan metadata and bounds a nonconsuming collision callback', () => {
    const { w, p } = armed();
    const legacy = fire(w, p);
    delete legacy.spreadOffset;
    shots(w, 0.6);
    expect(legacy.apertureUsed).toBe(true);
    expect(legacy.vel.y).toBe(0);
    for (const range of [0, 100]) {
      const s = fire(w, p);
      s.pos = { ...w.boss!.pos };
      s.apertureUsed = true;
      s.rangeLeft = range;
      let contacts = 0;
      const survives = stepApertureProjectile(w, s, 0.1, () => {
        contacts++;
        return false;
      });
      expect(contacts).toBe(w.bosses.length + w.adds.length + 5);
      expect(survives).toBe(range > 0);
    }
  });
  it('chooses the first of multiple intersected torus copies for large bodies', () => {
    expect(circleEntry({ x: 0, y: 0 }, { x: 0, y: 900 }, { x: 0, y: 0 }, 200)).toBe(0);
  });
  it('an actual class swap cancels only this owner’s pending transit and cannot reclaim it', () => {
    const w = new World({
      seed: 31,
      monsterId: 'lich',
      players: [
        {
          peerId: 'a',
          name: 'A',
          classId: 'warlock',
          extraClasses: ['mage'],
          charUpgrades: ['wa_fiend_g_a'],
          subSkills: ['wa_fiend_hurl'],
        },
        { peerId: 'b', name: 'B', classId: 'warlock' },
      ],
    });
    w.scene = null;
    w.obstacles = [];
    w.terrain = [];
    const [p, ally] = w.players;
    p.pos = { x: 500, y: 400 };
    p.aim = { x: 1, y: 0 };
    w.boss!.pos = { x: 1400, y: 400 };
    use(w, p, 'a3');
    const pending = fire(w, p);
    shots(w, 0.1);
    expect(pending.apertureTransit).toBeDefined();
    const normal = fire(w, p),
      foreign = fire(w, ally);
    w.setActiveClass(p, 'mage');
    expect(w.projectiles).not.toContain(pending);
    expect(w.projectiles).toContain(normal);
    expect(w.projectiles).toContain(foreign);
    expect(p.infernalAperture).toBeUndefined();
    w.setActiveClass(p, 'warlock');
    expect(p.infernalAperture).toBeUndefined();
  });
  it('component refresh preserves an owned aperture when a legacy flat mirror is absent', () => {
    const native = previewAbilityTable('warlock', ['wa_fiend_g_a']).a3,
      copy = recompose(decompose(native), native);
    delete copy.infernalAperture;
    copy.components = refreshComponents(copy);
    expect(resolvedAperture(copy)).toEqual(native.infernalAperture);
  });
  it('solves segment contacts and draws waiting, blocked and exhausted public geometry', () => {
    expect(circleEntry(zero, zero, { x: 10, y: 0 }, 1)).toBeNull();
    expect(circleEntry(zero, { x: 10, y: 0 }, { x: 5, y: 5 }, 1)).toBeNull();
    expect(circleEntry(zero, { x: 10, y: 0 }, { x: -5, y: 0 }, 1)).toBeNull();
    const { w, p } = armed(),
      a = apertureView(w, p)!;
    const g = { moveTo: () => g, lineTo: () => g, stroke: () => g } as unknown as Graphics;
    drawInfernalAperture(g, a, zero, { x: 100, y: 0 }, 1, true);
    drawInfernalAperture(
      g,
      { ...a, blocked: 'Silenced', remaining: 0.5 },
      zero,
      { x: 100, y: 0 },
      1,
      false,
    );
  });
});
