import { describe, expect, it } from 'vitest';
import { World } from '../src/engine/world/world';
import {
  resolvePlayerAbility,
  resolveBossAbility,
  stepShove,
} from '../src/engine/combat/abilities';
import {
  apertureBulwarks,
  apertureView,
  dissolveBulwark,
  dissolveOverlappedBulwarks,
  tickInfernalApertures,
} from '../src/engine/combat/infernalAperture';
import { walkAroundBulwarks, clipBulwarkStep } from '../src/engine/combat/apertureMovement';
import { applyBuff, makeBuff } from '../src/engine/combat/combat';
import { dist } from '../src/engine/core/torus';
import { drawInfernalAperture } from '../src/render/pipeline/apertureVisuals';
import type { Add, Player } from '../src/engine/core/types';
import type { Graphics } from 'pixi.js';
const zero = { x: 0, y: 0 };
function setup() {
  const w = new World({
    seed: 31,
    monsterId: 'troll',
    players: [
      {
        peerId: 'a',
        name: 'A',
        classId: 'warlock',
        charUpgrades: ['wa_fiend_g_a'],
        subSkills: ['wa_fiend_hurl'],
      },
    ],
  });
  w.scene = null;
  w.obstacles = [];
  w.terrain = [];
  const p = w.players[0],
    b = w.boss!;
  p.pos = { x: 500, y: 400 };
  p.aim = { x: 1, y: 0 };
  b.pos = { x: 1050, y: 400 };
  b.hp = b.maxHp = 10000;
  b.moveSpeed = 200;
  b.decisionTimer = 100;
  return { w, p, b };
}
function open(w: World, p: Player) {
  resolvePlayerAbility(w, p, 'a3', zero);
}
function tick(w: World, dt = 0.05) {
  w.step(dt, new Map());
}
function shots(w: World, dt: number) {
  (w as unknown as { updateProjectiles(dt: number): void }).updateProjectiles(dt);
}
function nativeShot(w: World, p: Player) {
  resolvePlayerAbility(w, p, 'basic', zero);
  return w.projectiles.at(-1)!;
}
function minion(w: World, x: number, y = 400) {
  const a = {
    ...w.boss!,
    id: w.allocId(),
    pos: { x, y },
    radius: 12,
    hp: 1000,
    maxHp: 1000,
    buffs: [],
    targetId: w.players[0].id,
    attackCd: 0,
    moveSpeed: 160,
  } as unknown as Add;
  w.adds.push(a);
  return a;
}

describe('Aperture placement repairs and owned bulwark', () => {
  it('creates useful real cover in an empty arena without adding universal arena obstacles', () => {
    const { w, p } = setup();
    open(w, p);
    expect(w.obstacles).toHaveLength(0);
    expect(apertureBulwarks(w)).toEqual([{ ownerId: p.id, pos: { x: 700, y: 400 }, radius: 48 }]);
    expect(p.infernalAperture!.conduitReady).toBe(true);
  });
  it.each(['entrance', 'exit'] as const)(
    'repairs a blocked %s deterministically and keeps every mouth within 108u',
    (which) => {
      const a = setup(),
        b = setup();
      for (const s of [a, b]) {
        s.w.obstacles = [
          { id: 900, pos: { x: which === 'entrance' ? 580 : 820, y: 400 }, radius: 15 },
        ];
        open(s.w, s.p);
      }
      expect(a.p.infernalAperture!.entry).toEqual(b.p.infernalAperture!.entry);
      expect(a.p.infernalAperture!.exit).toEqual(b.p.infernalAperture!.exit);
      const gate = a.p.infernalAperture!;
      expect(dist(gate.entry, { x: 580, y: 400 })).toBeLessThanOrEqual(108.0001);
      expect(dist(gate.exit, { x: 820, y: 400 })).toBeLessThanOrEqual(108.0001);
      for (const o of a.w.obstacles) {
        expect(dist(o.pos, gate.entry)).toBeGreaterThan(o.radius + 24);
        expect(dist(o.pos, gate.exit)).toBeGreaterThan(o.radius + 24);
      }
    },
  );
  it.each([40, 60, 74])(
    'repairs an exit centered in a standard %su arena boulder and fires beyond it',
    (radius) => {
      const { w, p, b } = setup();
      w.obstacles = [{ id: 900, pos: { x: 820, y: 400 }, radius }];
      open(w, p);
      expect(p.infernalAperture!.conduitReady).toBe(true);
      expect(dist(p.infernalAperture!.exit, { x: 820, y: 400 })).toBeGreaterThan(radius + 24);
      expect(p.infernalAperture!.exit.x).toBeGreaterThan(820 + radius);
      nativeShot(w, p);
      shots(w, 1);
      expect(b.hp).toBeLessThan(b.maxHp);
    },
  );
  it('near-exit cover leaves an actual outgoing firing path rather than putting the exit on the near side', () => {
    const { w, p, b } = setup();
    w.obstacles = [{ id: 900, pos: { x: 820, y: 400 }, radius: 15 }];
    open(w, p);
    expect(p.infernalAperture!.exit.x).toBeGreaterThan(820);
    nativeShot(w, p);
    shots(w, 1);
    expect(b.hp).toBeLessThan(b.maxHp);
  });
  it('repairs around the torus seam without extending the projectile range budget', () => {
    const { w, p } = setup();
    p.pos.x = 1500;
    w.obstacles = [{ id: 900, pos: { x: 220, y: 400 }, radius: 15 }];
    open(w, p);
    expect(dist(p.infernalAperture!.exit, { x: 220, y: 400 })).toBeLessThanOrEqual(108.0001);
    const s = nativeShot(w, p);
    shots(w, 0.7);
    expect(s.apertureUsed).toBe(true);
    expect(s.rangeLeft).toBeLessThan(820 - 240);
  });
  it('keeps clear mouths without spawning cover inside static cover or a hostile body', () => {
    for (const body of [false, true]) {
      const { w, p, b } = setup();
      if (body) b.pos = { x: 700, y: 400 };
      else w.obstacles = [{ id: 900, pos: { x: 700, y: 400 }, radius: 60 }];
      open(w, p);
      expect(p.infernalAperture!.conduitReady).toBe(true);
      expect(p.infernalAperture!.bulwark).toBeUndefined();
    }
  });
  it('crowded geometry keeps Blessing and one usable ember instead of a lost cast', () => {
    const { w, p } = setup();
    w.obstacles = [{ id: 900, pos: { x: 580, y: 400 }, radius: 110 }];
    open(w, p);
    expect(p.infernalAperture!.conduitReady).toBe(false);
    expect(apertureBulwarks(w)).toHaveLength(0);
    expect(p.buffs.some((b) => b.kind === 'damageDealt')).toBe(true);
    w.tick++;
    (
      w as unknown as { tryUseAbility(p: Player, s: 'a3', d: typeof zero, f: boolean): void }
    ).tryUseAbility(p, 'a3', zero, true);
    expect(w.projectiles).toHaveLength(1);
    expect(p.infernalAperture!.emberReady).toBe(false);
  });
  it('failed refresh preserves an existing valid gate and successful replacement stays one per owner', () => {
    const { w, p } = setup();
    open(w, p);
    const old = p.infernalAperture;
    w.obstacles = [{ id: 900, pos: { x: 580, y: 400 }, radius: 110 }];
    open(w, p);
    expect(p.infernalAperture).toBe(old);
    w.obstacles = [];
    p.pos.y += 200;
    open(w, p);
    expect(p.infernalAperture).not.toBe(old);
    expect(apertureBulwarks(w)).toHaveLength(1);
  });
  it('source loss, death and expiry remove cover while the public geometry is copied', () => {
    for (const reason of ['source', 'death', 'expiry']) {
      const { w, p } = setup();
      open(w, p);
      const v = apertureView(w, p)!;
      v.bulwark!.pos.x = 0;
      expect(p.infernalAperture!.bulwark!.pos.x).toBe(700);
      if (reason === 'source') delete p.abilities!.a3.infernalAperture;
      if (reason === 'death') p.hp = 0;
      tickInfernalApertures(w, reason === 'expiry' ? 6.1 : 0);
      expect(apertureBulwarks(w)).toHaveLength(0);
    }
    const s = setup();
    dissolveBulwark(s.w, 999);
  });
});

describe('Safe fire and actual hostile movement', () => {
  it('absorbs enemy and allied physical shots while routed fire bypasses its middle', () => {
    const { w, p, b } = setup();
    open(w, p);
    const hostile = nativeShot(w, p);
    hostile.side = 'boss';
    hostile.pos = { x: 900, y: 400 };
    hostile.vel = { x: -660, y: 0 };
    const hp = p.hp;
    shots(w, 0.8);
    expect(p.hp).toBe(hp);
    expect(w.projectiles).toHaveLength(0);
    const plain = nativeShot(w, p);
    plain.pilotCast = p.infernalAperture!.setupCast;
    shots(w, 1);
    expect(b.hp).toBe(b.maxHp);
    const routed = nativeShot(w, p);
    shots(w, 1);
    expect(routed.apertureUsed).toBe(true);
    expect(b.hp).toBeLessThan(b.maxHp);
  });
  it('a boss walks around the circular footprint instead of pinning against it', () => {
    const { w, p, b } = setup();
    open(w, p);
    b.pos = { x: 900, y: 400 };
    let sideways = 0;
    for (let i = 0; i < 70; i++) {
      tick(w);
      sideways = Math.max(sideways, Math.abs(b.pos.y - 400));
      expect(dist(b.pos, { x: 700, y: 400 })).toBeGreaterThanOrEqual(48 + b.radius - 0.01);
    }
    expect(sideways).toBeGreaterThan(20);
    expect(b.pos.x).toBeLessThan(650);
    expect(p.infernalAperture!.bulwark).toBeDefined();
  });
  it('an add detours, while players and charmed allies can cross without displacement', () => {
    const { w, p, b } = setup();
    b.moveSpeed = 0;
    open(w, p);
    const a = minion(w, 900);
    let sideways = 0;
    for (let i = 0; i < 70; i++) {
      tick(w);
      sideways = Math.max(sideways, Math.abs(a.pos.y - 400));
    }
    expect(sideways).toBeGreaterThan(20);
    expect(a.pos.x).toBeLessThan(650);
    p.pos = { x: 700, y: 400 };
    tick(w);
    expect(p.pos).toEqual({ x: 700, y: 400 });
    const friendly = { id: 999, pos: { x: 760, y: 400 }, radius: 12, charm: {} };
    expect(walkAroundBulwarks(w, friendly, { x: 650, y: 400 }, 0.1)).toEqual({ x: 650, y: 400 });
  });
  it('a second owner does not wall over an existing portal mouth or stack the same cover', () => {
    const { w, p, b } = setup();
    b.moveSpeed = 0;
    open(w, p);
    const second = new World({
      seed: 32,
      monsterId: 'lich',
      players: [
        {
          peerId: 'b',
          name: 'B',
          classId: 'warlock',
          charUpgrades: ['wa_fiend_g_a'],
          subSkills: ['wa_fiend_hurl'],
        },
      ],
    }).players[0];
    second.id = w.allocId();
    second.pos = { x: 620, y: 400 };
    second.aim = { x: 1, y: 0 };
    w.players.push(second);
    open(w, second);
    expect(second.infernalAperture!.conduitReady).toBe(true);
    for (const c of apertureBulwarks(w))
      for (const owner of w.players)
        for (const mouth of [owner.infernalAperture!.entry, owner.infernalAperture!.exit])
          expect(dist(c.pos, mouth)).toBeGreaterThan(c.radius + 24);
  });
  it('an ally with no clear lane neither blocks placement nor prevents another owner’s cover', () => {
    const { w, p } = setup();
    const second = new World({
      seed: 32,
      monsterId: 'lich',
      players: [
        {
          peerId: 'b',
          name: 'B',
          classId: 'warlock',
          charUpgrades: ['wa_fiend_g_a'],
          subSkills: ['wa_fiend_hurl'],
        },
      ],
    }).players[0];
    second.id = w.allocId();
    second.pos = { x: 620, y: 400 };
    second.aim = { x: 1, y: 0 };
    w.players.push(second);
    w.obstacles = [{ id: 900, pos: { x: 580, y: 400 }, radius: 110 }];
    open(w, p);
    expect(p.infernalAperture!.conduitReady).toBe(false);
    w.obstacles = [];
    open(w, second);
    expect(second.infernalAperture!.bulwark).toBeDefined();
    expect(second.infernalAperture!.bulwark!.pos.x).toBe(820);
  });
  it.each([100, 101])(
    'chooses a deterministic detour for body %s without moving through cover',
    (id) => {
      const { w, p } = setup();
      open(w, p);
      const body = { id, pos: { x: 780, y: 400 }, radius: 30 };
      const next = walkAroundBulwarks(w, body, { x: 770, y: 400 }, 0.05);
      expect(Math.abs(next.y - 400)).toBeGreaterThan(0);
      expect(dist(next, { x: 700, y: 400 })).toBeGreaterThanOrEqual(78);
    },
  );
  it('charge previews clip to current cover without changing the locked target or unrelated previews', () => {
    const { w, p, b } = setup();
    open(w, p);
    b.pos = { x: 1000, y: 400 };
    const line = w.monsterDef.abilities.find((a) => a.shape === 'line')!;
    expect(line).toBeDefined();
    b.action = {
      ...b.action,
      kind: 'windup',
      abilityId: line.id,
      aimAngle: Math.PI,
      targetPos: { x: 500, y: 400 },
      remaining: 1,
      total: 1,
    };
    const preview = w.serialize().bosses[0].telegraph!;
    expect(preview.target.x).toBeGreaterThan(700);
    expect(preview.range).toBeLessThan(500);
    expect(b.action.targetPos).toEqual({ x: 500, y: 400 });
    expect(preview.angle).toBe(Math.PI);
    dissolveBulwark(w, p.id);
    expect(w.serialize().bosses[0].telegraph!.range).toBe(line.range);
  });
  it('rooted and stunned bodies stay still without consuming the cover', () => {
    for (const kind of ['root', 'stun'] as const) {
      const { w, p, b } = setup();
      open(w, p);
      b.pos = { x: 850, y: 400 };
      applyBuff(b, makeBuff(kind, 0, 2, 'test'));
      for (let i = 0; i < 10; i++) tick(w);
      expect(b.pos).toEqual({ x: 850, y: 400 });
      expect(p.infernalAperture!.bulwark).toBeDefined();
    }
  });
  it('forced hostile movement sweeps to contact, but player shoves cross freely', () => {
    const { w, p, b } = setup();
    open(w, p);
    b.pos = { x: 900, y: 400 };
    b.shove = { vx: -1000, vy: 0, remaining: 1 };
    stepShove(w, b, 1);
    expect(b.pos.x).toBeGreaterThanOrEqual(700 + 48 + b.radius - 0.001);
    expect(b.shove).toBeNull();
    p.pos = { x: 600, y: 400 };
    p.shove = { vx: 200, vy: 0, remaining: 1 };
    stepShove(w, p, 1);
    expect(p.pos.x).toBe(800);
    expect(
      clipBulwarkStep(w, { pos: { x: 100, y: 100 }, radius: 10 }, { x: 200, y: 100 }).pos,
    ).toEqual({ x: 200, y: 100 });
  });
  it('an enemy blink/spawn overlapping cover dissolves it without pushing the enemy', () => {
    const { w, p, b } = setup();
    open(w, p);
    b.pos = { x: 700, y: 400 };
    dissolveOverlappedBulwarks(w);
    expect(p.infernalAperture!.bulwark).toBeUndefined();
    expect(b.pos).toEqual({ x: 700, y: 400 });
  });
  it('fully blocked detours fail open and a stalled actor cannot create a permanent pin', () => {
    for (const stalled of [false, true]) {
      const { w, p, b } = setup();
      open(w, p);
      b.pos = { x: 780, y: 400 };
      b.radius = 30;
      if (!stalled) w.obstacles = [{ id: 900, pos: { ...b.pos }, radius: 10 }];
      for (let i = 0; i < 10 && p.infernalAperture!.bulwark; i++)
        walkAroundBulwarks(w, b, { x: b.pos.x - 10, y: 400 }, 0.1);
      expect(p.infernalAperture!.bulwark).toBeUndefined();
    }
  });
  it('a locked boss charge is clipped at the cover and cannot hit someone behind it', () => {
    const { w, p, b } = setup();
    open(w, p);
    b.pos = { x: 1000, y: 400 };
    const hp = p.hp;
    const action = { ...b.action, aimAngle: Math.PI, targetPos: { x: 500, y: 400 } };
    resolveBossAbility(
      w,
      b,
      {
        id: 'test',
        name: 'Charge',
        shape: 'line',
        windup: 1,
        cooldown: 6,
        damage: 50,
        range: 600,
        width: 30,
      },
      action,
    );
    expect(b.pos.x).toBeGreaterThanOrEqual(700 + 48 + b.radius - 0.001);
    expect(p.hp).toBe(hp);
  });
  it('cover does not cancel a committed area attack behind it', () => {
    const { w, p, b } = setup();
    open(w, p);
    const hp = p.hp;
    resolveBossAbility(
      w,
      b,
      {
        id: 'area',
        name: 'Area',
        shape: 'circleAtTarget',
        windup: 1,
        cooldown: 6,
        damage: 25,
        radius: 80,
      },
      { ...b.action, targetPos: { ...p.pos } },
    );
    expect(p.hp).toBeLessThan(hp);
    expect(p.infernalAperture!.bulwark).toBeDefined();
  });
  it('renders honest circular cover and no nonexistent mouths in Ember-only fallback', () => {
    const { w, p } = setup();
    open(w, p);
    let circles = 0,
      lines = 0;
    const g = {
      circle: () => {
        circles++;
        return g;
      },
      fill: () => g,
      stroke: () => g,
      moveTo: () => {
        lines++;
        return g;
      },
      lineTo: () => g,
    } as unknown as Graphics;
    const v = apertureView(w, p)!;
    drawInfernalAperture(g, v, zero, { x: 100, y: 0 }, 1, true, { x: 50, y: 0 });
    expect(circles).toBe(2);
    expect(lines).toBeGreaterThan(0);
    circles = 0;
    lines = 0;
    drawInfernalAperture(g, { ...v, conduitReady: false }, zero, zero, 1, true);
    expect(circles + lines).toBe(0);
  });
});
