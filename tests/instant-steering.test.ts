import { afterEach, describe, expect, it, vi } from 'vitest';
import { World } from '../src/engine/world/world';
import {
  resolvePlayerAbility,
  beamTick,
  resolveBossAbility,
  bossChargeTarget,
} from '../src/engine/combat/abilities';
import { maneuverCast, onManeuverHit, tickManeuvers } from '../src/engine/combat/battleManeuvers';
import { type BossAbilityDef } from '../src/engine/content/monsters';
import { type BossAction, type Boss, type Player, type Vec2 } from '../src/engine/core/types';
import { applyBuff, makeBuff } from '../src/engine/combat/combat';
import { decompose, recompose } from '../src/engine/content/forge';
import { SnapshotInterpolator } from '../src/render/pipeline/interpolate';
import { INTERP_DELAY_MS } from '../src/engine/core/constants';
const down = { x: 0, y: 1 };
afterEach(() => vi.restoreAllMocks());
function setup(shape: BossAbilityDef['shape'] = 'cone') {
  const w = new World({
    seed: 31,
    monsterId: 'dragon',
    players: [
      {
        peerId: 'a',
        name: 'Steering',
        classId: 'knight',
        subSkills: ['kn_battle_precision'],
        charUpgrades: ['kn_battlemaster_g_a'],
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
  p.buffs = [];
  p.critChance = 0;
  b.pos = { x: 600, y: 400 };
  b.hp = b.maxHp = 10000;
  b.moveSpeed = 0;
  b.decisionTimer = 100;
  b.blinkTimer = 100;
  const ab: BossAbilityDef = {
    id: 'steering-test',
    name: 'Steering test',
    shape,
    damage: 30,
    cooldown: 10,
    windup: 0.2,
    range: 150,
    halfAngleDeg: 8,
    radius: 105,
    width: 20,
    channelDuration: 1,
  };
  w.monsterDef = { ...w.monsterDef, abilities: [ab] };
  b.action = {
    kind: 'windup',
    abilityId: ab.id,
    remaining: 0.2,
    total: 0.2,
    targetId: p.id,
    targetPos: { ...p.pos },
    aimAngle: Math.PI,
    channelAccum: 0,
  };
  p.abilities!.a3 = { ...p.abilities!.a3, stun: undefined };
  return { w, p, b, ab };
}
function add(s: ReturnType<typeof setup>, pos: Vec2) {
  s.w.spawnAddWave(pos, 1, { minR: 0, maxR: 0 });
  const a = s.w.adds.at(-1)!;
  a.pos = { ...pos };
  a.hp = a.maxHp = 1000;
  a.moveSpeed = 0;
  a.attackCd = 100;
  return a;
}
function request(s: ReturnType<typeof setup>, move = down) {
  const cast = maneuverCast(s.p, s.p.abilities!.a3, move);
  onManeuverHit(s.w, s.p, s.b, 1, cast);
  return cast;
}
describe('immediate multi-enemy steering', () => {
  it.each([false, true])(
    'one real cone steers boss and summons independently; recovering boss=%s',
    (recovering) => {
      const s = setup(),
        { w, p, b } = s,
        a = add(s, { x: 530, y: 320 }),
        other = add(s, { x: 530, y: 480 });
      p.abilities!.a3.range = 180;
      p.abilities!.a3.halfAngleDeg = 70;
      if (recovering) b.maneuverRecovery = 2;
      resolvePlayerAbility(w, p, 'a3', down);
      expect(a.maneuverMotion?.phase).toBe('travel');
      expect(other.maneuverMotion?.phase).toBe('travel');
      expect(!!b.maneuverMotion).toBe(!recovering);
      w.step(0.05, new Map());
      expect(a.pos.y).toBe(350);
      expect(other.pos.y).toBe(510);
      expect(b.pos.y).toBe(recovering ? 400 : 430);
      expect(b.action.remaining).toBeCloseTo(0.15);
    },
  );
  it('distinct projectiles from one real Volley steer different recipients and retain one shared token', () => {
    const s = setup(),
      { w, p, b } = s;
    {
      b.action.kind = 'idle';
      b.pos = { x: 700, y: 400 };
      const a = add(s, { x: 700, y: 330 }),
        other = add(s, { x: 700, y: 470 });
      resolvePlayerAbility(w, p, 'sub1', down);
      const shots = w.projectiles.slice();
      expect(shots).toHaveLength(3);
      const token = shots[0].maneuverCast!;
      for (const shot of shots) expect(shot.maneuverCast).toBe(token);
      for (const [i, target] of [b, a, other].entries()) {
        const shot = shots[i];
        shot.pos = { ...target.pos };
        shot.vel = { x: 0, y: 0 };
        shot.impactRadius = 0;
        // Separate frames prove the first impact doesn't spend later projectiles' recipients.
        for (const otherShot of shots) if (otherShot !== shot) otherShot.pos = { x: 1000, y: 1000 };
        const from = { ...target.pos };
        w.step(0.01, new Map());
        expect(target.pos.y).toBeGreaterThan(from.y);
      }
      expect(token.steeredTargets?.size).toBe(3);
    }
  });
  it('one cast cannot steer the same foe again after recovery, but a fresh cast can', () => {
    const s = setup(),
      { w, p, b } = s,
      cast = request(s);
    tickManeuvers(w, 0.2);
    tickManeuvers(w, 7);
    const pos = { ...b.pos };
    onManeuverHit(w, p, b, 1, cast);
    expect(b.maneuverMotion).toBeUndefined();
    expect(b.pos).toEqual(pos);
    onManeuverHit(w, p, b, 1, maneuverCast(p, p.abilities!.a3, down));
    expect(b.maneuverMotion).toBeDefined();
  });
  it.each(['root', 'steadfast', 'recovering'] as const)(
    'rejecting a %s boss does not block other recipients',
    (reason) => {
      const s = setup(),
        { w, p, b } = s,
        a = add(s, { x: 560, y: 400 });
      if (reason === 'recovering') b.maneuverRecovery = 2;
      else applyBuff(b, makeBuff(reason, 0, 2, 'test'));
      const cast = maneuverCast(p, p.abilities!.a3, down);
      onManeuverHit(w, p, b, 1, cast);
      onManeuverHit(w, p, a, 1, cast);
      expect(cast.steeredTargets?.has(b.id)).toBe(false);
      expect(cast.steeredTargets?.has(a.id)).toBe(true);
    },
  );
  it('a standalone composed copy moves multiple recipients without the donor passive', () => {
    const s = setup(),
      { w, p, b } = s,
      a = add(s, { x: 560, y: 400 });
    p.abilities!.a3 = recompose(decompose(p.abilities!.a3), p.abilities!.a3);
    p.subclassPassiveId = undefined;
    p.charUpgradeIds = [];
    resolvePlayerAbility(w, p, 'a3', down);
    tickManeuvers(w, 0.05);
    expect(b.pos.y).toBe(430);
    expect(a.pos.y).toBe(430);
  });
  it('opposing ordinary shove combines immediately and both timers advance', () => {
    const s = setup(),
      { w, b } = s;
    b.shove = { vx: 0, vy: -100, remaining: 0.2 };
    request(s);
    w.step(0.05, new Map());
    expect(b.pos.y).toBe(425);
    expect(b.shove?.remaining).toBeCloseTo(0.15);
    expect(b.maneuverMotion?.remaining).toBe(50);
  });
});
describe('active attack geometry and clocks', () => {
  it.each(['cone', 'pbaoe'] as const)(
    'moving a %s caster creates a dodge while its original windup finishes',
    (shape) => {
      for (const steering of [false, true]) {
        const s = setup(shape),
          { w, p, b } = s;
        if (steering) request(s);
        const hp = p.hp;
        w.step(0.05, new Map());
        expect(b.action.remaining).toBeCloseTo(0.15);
        for (let i = 0; i < 4; i++) w.step(0.05, new Map());
        expect(p.hp === hp).toBe(steering);
        expect(b.action.kind).toBe('recover');
      }
    },
  );
  it('channel countdown and damage ticks continue while its caster slides', () => {
    const s = setup('beam'),
      { w, p, b, ab } = s;
    ab.range = 500;
    b.action.kind = 'channel';
    b.action.remaining = 1;
    b.action.channelAccum = 0.49;
    request(s);
    w.step(0.05, new Map());
    expect(b.pos.y).toBe(430);
    expect(b.action.remaining).toBeCloseTo(0.95);
    expect(p.hp).toBeLessThan(p.maxHp);
  });
  it('a tracking beam can be displaced out of range and its line still targets the live victim', () => {
    const s = setup('beam'),
      { w, p, b, ab } = s;
    ab.range = 110;
    request(s);
    tickManeuvers(w, 0.2);
    expect(beamTick(w, b, ab, b.action)).toBe(0);
    p.pos = { x: 610, y: 480 };
    const t = w.serialize().bosses[0].telegraph!;
    expect(t.target).toEqual(p.pos);
    expect(t.anchor).toBe('tracking');
  });
  it('ground-targeted circles keep their location when the caster moves', () => {
    const s = setup('circleAtTarget'),
      { w, p, b, ab } = s;
    const target = { ...p.pos };
    request(s);
    tickManeuvers(w, 0.2);
    expect(w.serialize().bosses[0].telegraph?.target).toEqual(target);
    const hp = p.hp;
    resolveBossAbility(w, b, ab, b.action);
    expect(p.hp).toBeLessThan(hp);
  });
  it('charge commitment records a body-relative heading and length, and landing ends leftover slides', () => {
    const s = setup('line'),
      { w, p, b, ab } = s;
    b.action = (
      w as unknown as { planBossAction: (b: Boss, a: BossAbilityDef, p: Player) => BossAction }
    ).planBossAction(b, ab, p);
    expect(b.action.chargeOffset).toEqual({ x: -100, y: 0 });
    request(s);
    tickManeuvers(w, 0.05);
    expect(bossChargeTarget(b, b.action, ab)).toEqual({ x: 500, y: 430 });
    const preview = w.serialize().bosses[0].telegraph!;
    expect(preview.target).toEqual({ x: 500, y: 430 });
    expect(preview.width).toBe(2 * (20 + b.radius * 0.5));
    resolveBossAbility(w, b, ab, b.action);
    expect(b.pos).toEqual({ x: 500, y: 430 });
    expect(b.maneuverMotion).toBeUndefined();
    expect(b.shove).toBeNull();
  });
  it('charge preview and hit path agree at solid cover', () => {
    const s = setup('line'),
      { w, b, ab } = s;
    b.action.chargeOffset = { x: 240, y: 0 };
    b.action.targetPos = { x: 840, y: 400 };
    w.obstacles = [{ id: 999, pos: { x: 780, y: 400 }, radius: 20, kind: 'pillar' }];
    const target = w.serialize().bosses[0].telegraph!.target;
    resolveBossAbility(w, b, ab, b.action);
    expect(b.pos).toEqual(target);
    expect(b.pos.x).toBeLessThan(780);
  });
  it('already emitted projectiles keep their positions while a later cast moves their owner', () => {
    const s = setup('projectile'),
      { w, b, ab } = s;
    resolveBossAbility(w, b, ab, b.action);
    const shot = w.projectiles[0],
      pos = { ...shot.pos };
    request(s);
    tickManeuvers(w, 0.2);
    expect(shot.pos).toEqual(pos);
  });
});
describe('moving telegraphs on remote snapshots', () => {
  it.each(['cone', 'pbaoe', 'circleAtTarget', 'line', 'beam'] as const)(
    '%s remains attached to the displayed caster or its proper world target',
    (shape) => {
      const s = setup(shape),
        { w, p, b } = s;
      if (shape === 'line') b.action.chargeOffset = { x: -100, y: 0 };
      let now = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => now);
      const interp = new SnapshotInterpolator();
      interp.push(w.serialize());
      b.pos.y = 460;
      p.pos.x = 520;
      now = 100;
      const latest = w.serialize();
      const raw = latest.bosses[0].telegraph!;
      latest.bosses[0].revealed = { abilityId: s.ab.id, mode: 'fixed', shape: raw };
      latest.bosses[0].forethought = {
        remaining: 2,
        preview: { abilityId: s.ab.id, mode: 'fixed', shape: raw },
      };
      const saved = JSON.stringify(latest);
      interp.push(latest);
      const result = interp.sample(INTERP_DELAY_MS + 50, { localPlayerId: p.id, arena: w.arena })!;
      const boss = result.bosses[0],
        telegraph = boss.telegraph!;
      expect(boss.pos.y).toBe(430);
      expect(telegraph.origin.y).toBe(430);
      if (shape === 'pbaoe') expect(telegraph.target).toEqual(boss.pos);
      if (shape === 'circleAtTarget') expect(telegraph.target).toEqual(raw.target);
      if (shape === 'line') expect(telegraph.target).toEqual({ x: 500, y: 430 });
      if (shape === 'beam') expect(telegraph.target).toEqual({ x: 510, y: 400 });
      expect(boss.revealed?.shape?.origin.y).toBe(430);
      expect(boss.forethought?.preview?.shape?.origin.y).toBe(430);
      expect(JSON.stringify(latest)).toBe(saved);
    },
  );
  it('a tracking marker follows predicted local movement and preserves fallback when its victim is downed', () => {
    const { w, p } = setup('beam');
    const snap = w.serialize(),
      interp = new SnapshotInterpolator();
    interp.push(snap);
    let result = interp.sample(performance.now() + 1000, {
      localPlayerId: p.id,
      arena: w.arena,
      predictedLocalPos: { x: 550, y: 450 },
    })!;
    expect(result.bosses[0].telegraph?.target).toEqual({ x: 550, y: 450 });
    snap.tick++;
    snap.players[0].state = 'downed';
    interp.push(snap);
    result = interp.sample(performance.now() + 1000, { localPlayerId: p.id, arena: w.arena })!;
    expect(result.bosses[0].telegraph?.target).toEqual(snap.bosses[0].telegraph?.target);
  });
});

it('a later ineligible recipient does not hide another foe already moving for this player', () => {
  const s = setup(),
    { w, p, b } = s,
    a = add(s, { x: 560, y: 400 }),
    cast = request(s);
  a.hp = 0;
  onManeuverHit(w, p, a, 1, cast);
  expect(w.serialize().players[0].maneuver).toMatchObject({ phase: 'travel', targetId: b.id });
});

it('a projectile that starts steering integrates existing knockback exactly once in its hit frame', () => {
  const s = setup(),
    { w, p, b } = s;
  b.action.kind = 'idle';
  b.shove = { vx: 100, vy: 0, remaining: 0.2 };
  resolvePlayerAbility(w, p, 'sub1', down);
  const shot = w.projectiles[1];
  shot.pos = { ...b.pos };
  shot.vel = { x: 0, y: 0 };
  for (const other of w.projectiles) if (other !== shot) other.pos = { x: 1000, y: 1000 };
  w.step(0.01, new Map());
  expect(b.pos.x).toBeCloseTo(601);
  expect(b.pos.y).toBeCloseTo(406);
  expect(b.shove?.remaining).toBeCloseTo(0.19);
});

it('an earlier rejected foe can be steered by a later projectile from the same cast after another victim moves', () => {
  const s = setup(),
    { w, p, b } = s,
    a = add(s, { x: 560, y: 400 }),
    cast = maneuverCast(p, p.abilities!.a3, down);
  b.maneuverRecovery = 1;
  onManeuverHit(w, p, b, 1, cast);
  onManeuverHit(w, p, a, 1, cast);
  b.maneuverRecovery = 0;
  onManeuverHit(w, p, b, 1, cast);
  expect(cast.steeredTargets?.size).toBe(2);
  expect(b.maneuverMotion?.phase).toBe('travel');
});

it('one native cast can steer two bosses as independent recipients', () => {
  const { w, p, b } = setup();
  const other = structuredClone(b);
  other.id = w.allocId();
  other.pos = { x: 600, y: 430 };
  w.bosses.push(other);
  resolvePlayerAbility(w, p, 'a3', down);
  expect(b.maneuverMotion).toBeDefined();
  expect(other.maneuverMotion).toBeDefined();
  tickManeuvers(w, 0.05);
  expect(b.pos.y).toBe(430);
  expect(other.pos.y).toBe(460);
});
