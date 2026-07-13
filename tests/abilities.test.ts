import { describe, it, expect } from 'vitest';
import {
  resolvePlayerAbility,
  resolveBossAbility,
  beamTick,
  withLength,
  applyImpulse,
  PLAYER_RADIUS,
} from '../src/engine/combat/abilities';
import { World } from '../src/engine/world/world';
import { getSubSkill } from '../src/engine/content/subclasses';
import { getClass, describeAbility } from '../src/engine/content/classes';
import { getMonster, abilityById } from '../src/engine/content/monsters';
import type { BossAbilityDef } from '../src/engine/content/monsters';
import { makeBuff, applyBuff } from '../src/engine/combat/combat';
import { ARENA_W, ARENA_H, ADD_HP, ADD_MOVE_SPEED, ADD_RADIUS } from '../src/engine/core/constants';
import type { Player, BossAction, ClassId, MonsterId, Add, Vec2 } from '../src/engine/core/types';

// ---------------------------------------------------------------------------
// Fixtures / helpers
// ---------------------------------------------------------------------------

function mkWorld(classId: ClassId = 'knight', monsterId: MonsterId = 'dragon'): World {
  return new World({ monsterId, seed: 1, players: [{ peerId: 'a', name: 'A', classId }] });
}

/** Two-player world (caster first, ally second). */
function mkDuo(caster: ClassId, ally: ClassId): World {
  return new World({
    monsterId: 'dragon',
    seed: 1,
    players: [
      { peerId: 'a', name: 'A', classId: caster },
      { peerId: 'b', name: 'B', classId: ally },
    ],
  });
}

/** The player's private (cloned) ability table — World always sets it. */
function tableOf(p: Player) {
  if (!p.abilities) throw new Error('player has no ability table');
  return p.abilities;
}

function mkAction(over: Partial<BossAction> = {}): BossAction {
  return {
    kind: 'windup',
    abilityId: null,
    remaining: 0,
    total: 0,
    targetId: null,
    targetPos: null,
    aimAngle: 0,
    channelAccum: 0,
    ...over,
  };
}

function bossAb(monsterId: MonsterId, id: string): BossAbilityDef {
  const ab = abilityById(getMonster(monsterId), id);
  if (!ab) throw new Error(`no boss ability ${id} on ${monsterId}`);
  return ab;
}

function mkAdd(w: World, pos: Vec2): Add {
  return {
    id: w.allocId(),
    pos: { ...pos },
    hp: ADD_HP,
    maxHp: ADD_HP,
    moveSpeed: ADD_MOVE_SPEED,
    radius: ADD_RADIUS,
    targetId: null,
    attackCd: 0,
    buffs: [],
  };
}

const UP: Vec2 = { x: 0, y: -1 };
const RIGHT: Vec2 = { x: 1, y: 0 };
const ZERO: Vec2 = { x: 0, y: 0 };

// ===========================================================================
// Player: meleeCone
// ===========================================================================
describe('player meleeCone', () => {
  it('Cleave damages a boss inside the arc and emits cast + skillArea events', () => {
    const w = mkWorld('knight');
    const p = w.players[0];
    const boss = w.boss!;
    p.pos = { x: 800, y: 500 };
    p.aim = { ...UP };
    boss.pos = { x: 800, y: 450 };
    const before = boss.hp;
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(before - boss.hp).toBeCloseTo(22, 6); // Cleave base 22, all mults 1
    expect(w.events[0].t).toBe('cast');
    expect(
      w.events.some((e) => e.t === 'cast' && e.ability === 'Cleave' && e.slot === 'basic'),
    ).toBe(true);
    expect(w.events.some((e) => e.t === 'skillArea' && e.area.kind === 'cone')).toBe(true);
    expect(w.events.some((e) => e.t === 'hit' && e.targetId === boss.id)).toBe(true);
  });

  it('misses a boss out of range (cast + skillArea still fire, no hit)', () => {
    const w = mkWorld('knight');
    const p = w.players[0];
    const boss = w.boss!;
    p.pos = { x: 800, y: 500 };
    p.aim = { ...UP };
    boss.pos = { x: 200, y: 200 };
    const before = boss.hp;
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(boss.hp).toBe(before);
    expect(w.events.some((e) => e.t === 'cast')).toBe(true);
    expect(w.events.some((e) => e.t === 'skillArea')).toBe(true);
    expect(w.events.some((e) => e.t === 'hit')).toBe(false);
  });

  it('hits adds in the cone', () => {
    const w = mkWorld('knight');
    const p = w.players[0];
    p.pos = { x: 800, y: 500 };
    p.aim = { ...UP };
    w.boss!.pos = { x: 200, y: 200 }; // out of the way
    const add = mkAdd(w, { x: 800, y: 450 });
    w.adds = [add];
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(ADD_HP - add.hp).toBeCloseTo(22, 6);
  });

  it('ignores corpses (0-HP boss and adds) inside the cone', () => {
    const w = mkWorld('knight');
    const p = w.players[0];
    const boss = w.boss!;
    p.pos = { x: 800, y: 500 };
    p.aim = { ...UP };
    boss.pos = { x: 800, y: 450 };
    boss.hp = 0; // a corpse in the arc
    const dead = mkAdd(w, { x: 800, y: 455 });
    dead.hp = 0;
    const live = mkAdd(w, { x: 800, y: 460 });
    w.adds = [dead, live];
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(boss.hp).toBe(0); // untouched
    expect(dead.hp).toBe(0);
    expect(ADD_HP - live.hp).toBeCloseTo(22, 6);
    expect(w.events.some((e) => e.t === 'hit' && e.targetId === boss.id)).toBe(false);
  });

  it('Shield Bash applies a stun rider to the boss', () => {
    const w = mkWorld('knight');
    const p = w.players[0];
    const boss = w.boss!;
    p.pos = { x: 800, y: 500 };
    p.aim = { ...UP };
    boss.pos = { x: 800, y: 460 };
    const before = boss.hp;
    resolvePlayerAbility(w, p, 'a3', ZERO); // Shield Bash: damage 30, stun 0.8
    expect(before - boss.hp).toBeCloseTo(30, 6);
    const stun = boss.buffs.find((b) => b.kind === 'stun' && b.source === 'stun');
    expect(stun).toBeTruthy();
    expect(stun!.remaining).toBeCloseTo(0.8, 6);
  });

  it('a slow rider chills the struck boss through a melee swing', () => {
    const w = mkWorld('rogue');
    const p = w.players[0];
    const boss = w.boss!;
    tableOf(p).basic.slowMult = 0.5;
    tableOf(p).basic.slowDuration = 2;
    p.pos = { x: 800, y: 500 };
    p.aim = { ...UP };
    boss.pos = { x: 800, y: 470 };
    resolvePlayerAbility(w, p, 'basic', ZERO);
    const slow = boss.buffs.find((b) => b.kind === 'moveSpeed' && b.source === 'slow');
    expect(slow).toBeTruthy();
    expect(slow!.mult).toBeCloseTo(0.5, 6);
    expect(slow!.remaining).toBeCloseTo(2, 6);
  });

  it('lifesteal heals the caster for a fraction of melee damage dealt', () => {
    const w = mkWorld('knight');
    const p = w.players[0];
    const boss = w.boss!;
    tableOf(p).basic.lifestealFrac = 0.5;
    p.hp = p.maxHp - 50;
    p.pos = { x: 800, y: 500 };
    p.aim = { ...UP };
    boss.pos = { x: 800, y: 460 };
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(p.hp).toBeCloseTo(p.maxHp - 50 + 22 * 0.5, 5); // 22 dealt * 0.5
  });
});

// ===========================================================================
// Player: projectile
// ===========================================================================
describe('player projectile', () => {
  it('Ranger Arrow spawns one arrow with the expected kinematics', () => {
    const w = mkWorld('ranger');
    const p = w.players[0];
    p.pos = { x: 400, y: 500 };
    p.aim = { ...RIGHT };
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(w.projectiles).toHaveLength(1);
    const proj = w.projectiles[0];
    expect(proj.kind).toBe('arrow');
    expect(proj.side).toBe('player');
    expect(proj.ownerId).toBe(p.id);
    expect(proj.damage).toBeCloseTo(20, 6);
    expect(proj.vel.x).toBeCloseTo(700, 4);
    expect(proj.vel.y).toBeCloseTo(0, 4);
    expect(proj.impactRadius).toBe(0);
    expect(proj.hitRadius).toBe(8);
    expect(proj.rangeLeft).toBeCloseTo(820, 6); // PROJECTILE_MAX_RANGE default
    expect(proj.pos.x).toBeCloseTo(400 + PLAYER_RADIUS + 4, 4); // origin nudged forward
    expect(w.events.some((e) => e.t === 'projectile' && e.kind === 'arrow')).toBe(true);
    expect(w.events.some((e) => e.t === 'cast' && e.ability === 'Arrow')).toBe(true);
  });

  it('Multishot fans three projectiles; the middle one flies straight along aim', () => {
    const w = mkWorld('ranger');
    const p = w.players[0];
    p.pos = { x: 400, y: 500 };
    p.aim = { ...RIGHT };
    resolvePlayerAbility(w, p, 'a1', ZERO); // Multishot: count 3, spread 30, dmg 16
    expect(w.projectiles).toHaveLength(3);
    for (const proj of w.projectiles) expect(proj.damage).toBeCloseTo(16, 6);
    const mid = w.projectiles[1];
    expect(mid.vel.x).toBeCloseTo(700, 3);
    expect(mid.vel.y).toBeCloseTo(0, 3);
    // The outer two are deflected off-axis (nonzero y velocity).
    expect(Math.abs(w.projectiles[0].vel.y)).toBeGreaterThan(1);
    expect(Math.abs(w.projectiles[2].vel.y)).toBeGreaterThan(1);
  });

  it('Mage Arcane Bolt (basic) uses the arcaneBolt kind', () => {
    const w = mkWorld('mage');
    const p = w.players[0];
    resolvePlayerAbility(w, p, 'basic', ZERO);
    const proj = w.projectiles[0];
    expect(proj.kind).toBe('arcaneBolt');
    expect(proj.damage).toBeCloseTo(16, 6);
    expect(Math.hypot(proj.vel.x, proj.vel.y)).toBeCloseTo(620, 3);
  });

  it('Mage Fireball reads as a fireball (impactRadius > 0) with a bigger hit radius', () => {
    const w = mkWorld('mage');
    const p = w.players[0];
    p.aim = { ...RIGHT };
    resolvePlayerAbility(w, p, 'a1', ZERO); // Fireball: dmg 70, speed 480, impactRadius 100
    const proj = w.projectiles[0];
    expect(proj.kind).toBe('fireball');
    expect(proj.damage).toBeCloseTo(70, 6);
    expect(proj.impactRadius).toBe(100);
    expect(proj.hitRadius).toBe(10);
    expect(Math.hypot(proj.vel.x, proj.vel.y)).toBeCloseTo(480, 3);
  });

  it('a fireball-slot with impactRadius 0 still gets the fireball kind via projectileKindFor', () => {
    const w = mkWorld('mage');
    const p = w.players[0];
    tableOf(p).a1.impactRadius = 0;
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(w.projectiles[0].kind).toBe('fireball');
    expect(w.projectiles[0].impactRadius).toBe(0);
  });

  it('Cleric Smite uses the smite kind', () => {
    const w = mkWorld('cleric');
    resolvePlayerAbility(w, w.players[0], 'basic', ZERO);
    const proj = w.projectiles[0];
    expect(proj.kind).toBe('smite');
    expect(proj.damage).toBeCloseTo(12, 6);
    expect(Math.hypot(proj.vel.x, proj.vel.y)).toBeCloseTo(560, 3);
  });

  it('Druid Thornlash uses the arrow kind', () => {
    const w = mkWorld('druid');
    resolvePlayerAbility(w, w.players[0], 'basic', ZERO);
    const proj = w.projectiles[0];
    expect(proj.kind).toBe('arrow');
    expect(proj.damage).toBeCloseTo(17, 6);
  });

  it('a class with no projectile branch (knight) falls back to the arrow kind', () => {
    const w = mkWorld('knight');
    const p = w.players[0];
    // Graft a plain projectile onto the knight's basic slot.
    tableOf(p).basic = {
      slot: 'basic',
      name: 'Bolt',
      kind: 'projectile',
      cooldown: 0,
      damage: 5,
      projSpeed: 500,
      projCount: 1,
    };
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(w.projectiles[0].kind).toBe('arrow');
  });

  it('carries slow / freeze / lifesteal riders onto the spawned projectile', () => {
    const w = mkWorld('ranger');
    const p = w.players[0];
    const t = tableOf(p).basic;
    t.slowMult = 0.5;
    t.slowDuration = 2;
    t.freeze = 1;
    t.lifestealFrac = 0.25;
    resolvePlayerAbility(w, p, 'basic', ZERO);
    const proj = w.projectiles[0];
    expect(proj.slowMult).toBe(0.5);
    expect(proj.slowDuration).toBe(2);
    expect(proj.freeze).toBe(1);
    expect(proj.lifesteal).toBe(0.25);
  });
});

// ===========================================================================
// Player: groundZone
// ===========================================================================
describe('player groundZone', () => {
  it('Cleric Sanctuary spawns a centered healing zone', () => {
    const w = mkWorld('cleric');
    const p = w.players[0];
    p.pos = { x: 700, y: 600 };
    resolvePlayerAbility(w, p, 'a2', ZERO);
    expect(w.groundZones).toHaveLength(1);
    const z = w.groundZones[0];
    expect(z.kind).toBe('sanctuary');
    expect(z.side).toBe('player');
    expect(z.ownerId).toBe(p.id);
    expect(z.healPerTick).toBe(10);
    expect(z.damagePerTick).toBe(0);
    expect(z.radius).toBe(140);
    expect(z.duration).toBe(4);
    expect(z.remaining).toBe(4);
    expect(z.pos.x).toBeCloseTo(700, 6); // centered on the caster
    expect(z.pos.y).toBeCloseTo(600, 6);
  });

  it('Ranger Rain of Arrows drops a damaging zone at the aimed ground spot', () => {
    const w = mkWorld('ranger');
    const p = w.players[0];
    p.pos = { x: 400, y: 500 };
    p.aim = { ...RIGHT };
    resolvePlayerAbility(w, p, 'a2', ZERO); // range 500, radius 120, dmg 12
    const z = w.groundZones[0];
    expect(z.kind).toBe('rainOfArrows');
    expect(z.damagePerTick).toBe(12);
    expect(z.healPerTick).toBe(0);
    expect(z.radius).toBe(120);
    expect(z.duration).toBe(3);
    expect(z.pos.x).toBeCloseTo(900, 4); // 400 + aim(1,0)*500
    expect(z.pos.y).toBeCloseTo(500, 4);
  });

  it('Druid Entangle carries slow fields onto the zone', () => {
    const w = mkWorld('druid');
    const p = w.players[0];
    p.pos = { x: 400, y: 500 };
    p.aim = { ...RIGHT };
    resolvePlayerAbility(w, p, 'a1', ZERO);
    const z = w.groundZones[0];
    expect(z.kind).toBe('entangle');
    expect(z.damagePerTick).toBe(6);
    expect(z.slowMult).toBeCloseTo(0.3, 6);
    expect(z.slowDuration).toBeCloseTo(1.2, 6);
    expect(z.radius).toBe(125);
  });

  it('Paladin Consecration is a centered zone that both heals and harms', () => {
    const w = mkWorld('paladin');
    const p = w.players[0];
    p.pos = { x: 500, y: 500 };
    resolvePlayerAbility(w, p, 'a1', ZERO);
    const z = w.groundZones[0];
    expect(z.kind).toBe('consecration');
    expect(z.damagePerTick).toBe(8);
    expect(z.healPerTick).toBe(8);
    expect(z.radius).toBe(150);
    expect(z.duration).toBe(5);
    expect(z.pos.x).toBeCloseTo(500, 6); // consecration is centered
  });

  it('Rogue Poison Vial is a ground-targeted damage zone', () => {
    const w = mkWorld('rogue');
    const p = w.players[0];
    p.pos = { x: 300, y: 400 };
    p.aim = { ...RIGHT };
    resolvePlayerAbility(w, p, 'a3', ZERO);
    const z = w.groundZones[0];
    expect(z.kind).toBe('poison');
    expect(z.damagePerTick).toBe(11);
    expect(z.pos.x).toBeCloseTo(720, 4); // 300 + 420
  });

  it('infers sanctuary (centered) when zoneKind is omitted but it heals', () => {
    const w = mkWorld('ranger');
    const p = w.players[0];
    p.pos = { x: 450, y: 450 };
    p.aim = { ...RIGHT };
    tableOf(p).a2 = {
      slot: 'a2',
      name: 'Font',
      kind: 'groundZone',
      cooldown: 0,
      damage: 0,
      radius: 100,
      zoneDuration: 3,
      zoneTickHeal: 5,
    };
    resolvePlayerAbility(w, p, 'a2', ZERO);
    const z = w.groundZones[0];
    expect(z.kind).toBe('sanctuary');
    expect(z.pos.x).toBeCloseTo(450, 6); // sanctuary => centered
  });

  it('infers rainOfArrows (ground-targeted) when zoneKind is omitted and it damages', () => {
    const w = mkWorld('ranger');
    const p = w.players[0];
    p.pos = { x: 450, y: 450 };
    p.aim = { ...RIGHT };
    tableOf(p).a2 = {
      slot: 'a2',
      name: 'Hail',
      kind: 'groundZone',
      cooldown: 0,
      damage: 0,
      radius: 100,
      zoneDuration: 3,
      zoneTickDamage: 5,
      range: 300,
    };
    resolvePlayerAbility(w, p, 'a2', ZERO);
    const z = w.groundZones[0];
    expect(z.kind).toBe('rainOfArrows');
    expect(z.pos.x).toBeCloseTo(750, 4); // 450 + 300 => not centered
  });

  it('applies zone defaults (radius 130, range 500, duration 4) when omitted', () => {
    const w = mkWorld('ranger');
    const p = w.players[0];
    p.pos = { x: 300, y: 400 };
    p.aim = { ...RIGHT };
    tableOf(p).a2 = {
      slot: 'a2',
      name: 'Bare Zone',
      kind: 'groundZone',
      cooldown: 0,
      damage: 0,
      zoneTickDamage: 5,
    };
    resolvePlayerAbility(w, p, 'a2', ZERO);
    const z = w.groundZones[0];
    expect(z.radius).toBe(130); // default radius
    expect(z.duration).toBe(4); // default duration
    expect(z.pos.x).toBeCloseTo(800, 4); // 300 + default range 500
  });
});

// ===========================================================================
// Player: pbaoe
// ===========================================================================
describe('player pbaoe', () => {
  it('Frost Nova damages, chills and flashes a circle', () => {
    const w = mkWorld('mage');
    const p = w.players[0];
    const boss = w.boss!;
    p.pos = { x: 800, y: 500 };
    boss.pos = { x: 800, y: 520 };
    const before = boss.hp;
    resolvePlayerAbility(w, p, 'a2', ZERO); // dmg 20, radius 150, slow 0.6 / 3s
    expect(before - boss.hp).toBeCloseTo(20, 6);
    const slow = boss.buffs.find((b) => b.kind === 'moveSpeed' && b.source === 'slow');
    expect(slow!.mult).toBeCloseTo(0.6, 6);
    expect(slow!.remaining).toBeCloseTo(3, 6);
    expect(w.events.some((e) => e.t === 'skillArea' && e.area.kind === 'circle')).toBe(true);
  });

  it('Whirlwind deals point-blank damage to a boss in range', () => {
    const w = mkWorld('barbarian');
    const p = w.players[0];
    const boss = w.boss!;
    p.pos = { x: 800, y: 500 };
    boss.pos = { x: 800, y: 520 };
    const before = boss.hp;
    resolvePlayerAbility(w, p, 'a3', ZERO); // Whirlwind dmg 34, radius 135
    expect(before - boss.hp).toBeCloseTo(34, 6);
  });

  it('Whirlwind also shreds adds in the radius', () => {
    const w = mkWorld('barbarian');
    const p = w.players[0];
    w.boss!.pos = { x: 200, y: 200 }; // out of the way
    p.pos = { x: 800, y: 500 };
    const add = mkAdd(w, { x: 800, y: 520 });
    w.adds = [add];
    resolvePlayerAbility(w, p, 'a3', ZERO);
    expect(ADD_HP - add.hp).toBeCloseTo(34, 6);
  });

  it('ignores corpses (0-HP boss and adds) in the pbaoe', () => {
    const w = mkWorld('barbarian');
    const p = w.players[0];
    const boss = w.boss!;
    p.pos = { x: 800, y: 500 };
    boss.pos = { x: 800, y: 520 };
    boss.hp = 0;
    const dead = mkAdd(w, { x: 800, y: 515 });
    dead.hp = 0;
    const live = mkAdd(w, { x: 800, y: 525 });
    w.adds = [dead, live];
    resolvePlayerAbility(w, p, 'a3', ZERO);
    expect(boss.hp).toBe(0);
    expect(dead.hp).toBe(0);
    expect(ADD_HP - live.hp).toBeCloseTo(34, 6);
  });

  it('does not hit a boss outside the radius', () => {
    const w = mkWorld('mage');
    const p = w.players[0];
    const boss = w.boss!;
    p.pos = { x: 800, y: 500 };
    boss.pos = { x: 200, y: 200 };
    const before = boss.hp;
    resolvePlayerAbility(w, p, 'a2', ZERO);
    expect(boss.hp).toBe(before);
  });

  it('a freeze rider stuns a boss caught in the nova', () => {
    const w = mkWorld('mage');
    const p = w.players[0];
    const boss = w.boss!;
    tableOf(p).a2.freeze = 1;
    p.pos = { x: 800, y: 500 };
    boss.pos = { x: 800, y: 520 };
    resolvePlayerAbility(w, p, 'a2', ZERO);
    expect(boss.buffs.some((b) => b.kind === 'stun' && b.source === 'freeze')).toBe(true);
  });

  it('lifesteal from a pbaoe heals the caster', () => {
    const w = mkWorld('barbarian');
    const p = w.players[0];
    const boss = w.boss!;
    tableOf(p).a3.lifestealFrac = 0.5;
    p.hp = p.maxHp - 40;
    p.pos = { x: 800, y: 500 };
    boss.pos = { x: 800, y: 520 };
    resolvePlayerAbility(w, p, 'a3', ZERO);
    expect(p.hp).toBeCloseTo(p.maxHp - 40 + 34 * 0.5, 5);
  });
});

// ===========================================================================
// Player: dash
// ===========================================================================
describe('player dash', () => {
  it('Roll moves along the move direction, grants i-frames and emits a dodge', () => {
    const w = mkWorld('ranger');
    const p = w.players[0];
    p.pos = { x: 400, y: 500 };
    resolvePlayerAbility(w, p, 'a3', RIGHT); // Roll: range 220, iframes 0.3
    expect(p.pos.x).toBeCloseTo(620, 4);
    expect(p.pos.y).toBeCloseTo(500, 4);
    const inv = p.buffs.find((b) => b.kind === 'invuln' && b.source === 'dash');
    expect(inv!.remaining).toBeCloseTo(0.3, 6);
    expect(w.events.some((e) => e.t === 'dodge' && e.id === p.id)).toBe(true);
  });

  it('falls back to aim direction when there is no move input', () => {
    const w = mkWorld('ranger');
    const p = w.players[0];
    p.pos = { x: 400, y: 500 };
    p.aim = { ...UP };
    resolvePlayerAbility(w, p, 'a3', ZERO);
    expect(p.pos.x).toBeCloseTo(400, 4);
    expect(p.pos.y).toBeCloseTo(280, 4); // 500 - 220 up
  });

  it('Leap deals landing damage in a circle around the touchdown', () => {
    const w = mkWorld('barbarian');
    const p = w.players[0];
    const boss = w.boss!;
    p.pos = { x: 400, y: 500 };
    boss.pos = { x: 670, y: 510 }; // near the {670,500} landing spot
    tableOf(p).a2.radius = undefined; // exercises the 120 default landing radius
    const before = boss.hp;
    resolvePlayerAbility(w, p, 'a2', RIGHT); // Leap: range 270, landingDamage 22
    expect(p.pos.x).toBeCloseTo(670, 4);
    expect(before - boss.hp).toBeCloseTo(22, 6);
    const inv = p.buffs.find((b) => b.kind === 'invuln' && b.source === 'dash');
    expect(inv!.remaining).toBeCloseTo(0.25, 6);
    expect(w.events.some((e) => e.t === 'skillArea' && e.area.kind === 'circle')).toBe(true);
  });

  it('Leap landing damage also strikes adds around the touchdown', () => {
    const w = mkWorld('barbarian');
    const p = w.players[0];
    w.boss!.pos = { x: 200, y: 200 }; // out of the way
    p.pos = { x: 400, y: 500 };
    const add = mkAdd(w, { x: 670, y: 510 }); // near the {670,500} landing spot
    w.adds = [add];
    resolvePlayerAbility(w, p, 'a2', RIGHT); // Leap: landingDamage 22, radius 120
    expect(ADD_HP - add.hp).toBeCloseTo(22, 6);
  });

  it('Leap landing ignores corpses and out-of-range targets', () => {
    const w = mkWorld('barbarian');
    const p = w.players[0];
    const boss = w.boss!;
    p.pos = { x: 400, y: 500 };
    boss.pos = { x: 670, y: 510 }; // at the landing spot...
    boss.hp = 0; // ...but a corpse
    const dead = mkAdd(w, { x: 675, y: 505 });
    dead.hp = 0;
    const faraway = mkAdd(w, { x: 100, y: 100 }); // outside the 120 landing radius
    w.adds = [dead, faraway];
    resolvePlayerAbility(w, p, 'a2', RIGHT);
    expect(boss.hp).toBe(0);
    expect(dead.hp).toBe(0);
    expect(faraway.hp).toBe(ADD_HP); // untouched, out of range
  });

  it('healOnUse patches the dasher up', () => {
    const w = mkWorld('ranger');
    const p = w.players[0];
    tableOf(p).a3.healOnUse = 30;
    p.hp = p.maxHp - 50;
    resolvePlayerAbility(w, p, 'a3', RIGHT);
    expect(p.hp).toBeCloseTo(p.maxHp - 20, 5);
  });

  it('a dash without i-frames or an explicit range moves the default 220 distance', () => {
    const w = mkWorld('ranger');
    const p = w.players[0];
    tableOf(p).a3.iframes = undefined; // no i-frame branch
    tableOf(p).a3.range = undefined; // default dash range 220
    p.pos = { x: 400, y: 500 };
    resolvePlayerAbility(w, p, 'a3', RIGHT);
    expect(p.pos.x).toBeCloseTo(620, 4); // 400 + default 220
    expect(p.buffs.some((b) => b.kind === 'invuln')).toBe(false);
  });

  it('wraps around the torus seam instead of leaving the arena', () => {
    const w = mkWorld('ranger');
    const p = w.players[0];
    p.pos = { x: ARENA_W - 20, y: 500 };
    resolvePlayerAbility(w, p, 'a3', RIGHT); // dash 220 past the right edge
    expect(p.pos.x).toBeCloseTo(200, 4); // (1580 + 220) - 1600
    expect(p.pos.x).toBeGreaterThanOrEqual(0);
    expect(p.pos.x).toBeLessThan(ARENA_W);
  });
});

// ===========================================================================
// Player: blink
// ===========================================================================
describe('player blink', () => {
  it('Blink teleports toward aim and emits a blink event', () => {
    const w = mkWorld('mage');
    const p = w.players[0];
    p.pos = { x: 400, y: 500 };
    p.aim = { ...RIGHT };
    resolvePlayerAbility(w, p, 'a3', ZERO); // Blink range 250
    expect(p.pos.x).toBeCloseTo(650, 4);
    expect(p.pos.y).toBeCloseTo(500, 4);
    expect(w.events.some((e) => e.t === 'blink' && e.id === p.id)).toBe(true);
    // Plain Blink grants no i-frames.
    expect(p.buffs.some((b) => b.kind === 'invuln')).toBe(false);
  });

  it('Rogue Shadowstep blinks with i-frames', () => {
    const w = mkWorld('rogue');
    const p = w.players[0];
    p.pos = { x: 400, y: 500 };
    p.aim = { ...RIGHT };
    resolvePlayerAbility(w, p, 'a2', ZERO); // Shadowstep: range 240, iframes 0.3
    expect(p.pos.x).toBeCloseTo(640, 4);
    const inv = p.buffs.find((b) => b.kind === 'invuln' && b.source === 'dash');
    expect(inv!.remaining).toBeCloseTo(0.3, 6);
  });

  it('healOnUse on a blink heals the caster', () => {
    const w = mkWorld('mage');
    const p = w.players[0];
    tableOf(p).a3.healOnUse = 25;
    tableOf(p).a3.range = undefined; // exercises the 250 default blink range
    p.hp = p.maxHp - 40;
    p.pos = { x: 400, y: 500 };
    p.aim = { ...RIGHT };
    resolvePlayerAbility(w, p, 'a3', ZERO);
    expect(p.hp).toBeCloseTo(p.maxHp - 15, 5);
    expect(p.pos.x).toBeCloseTo(650, 4); // 400 + default 250
  });
});

// ===========================================================================
// Player: selfBuff
// ===========================================================================
describe('player selfBuff', () => {
  it('Shield Wall applies a damage-taken mitigation buff (default 4s duration)', () => {
    const w = mkWorld('knight');
    const p = w.players[0];
    tableOf(p).a2.buffDuration = undefined; // exercises the 4s default
    resolvePlayerAbility(w, p, 'a2', ZERO); // buffDefMult 0.5
    const buff = p.buffs.find((b) => b.kind === 'damageTaken' && b.source === 'selfBuffDef');
    expect(buff!.mult).toBeCloseTo(0.5, 6);
    expect(buff!.remaining).toBeCloseTo(4, 6);
  });

  it('Rage grants both a damage and a move-speed buff', () => {
    const w = mkWorld('barbarian');
    const p = w.players[0];
    tableOf(p).a1.buffDuration = undefined; // exercises the 4s default on both buffs
    resolvePlayerAbility(w, p, 'a1', ZERO); // buffDamageMult 1.35, buffMoveMult 1.2
    const dmg = p.buffs.find((b) => b.kind === 'damageDealt' && b.source === 'selfBuffDmg');
    const move = p.buffs.find((b) => b.kind === 'moveSpeed' && b.source === 'selfBuffMove');
    expect(dmg!.mult).toBeCloseTo(1.35, 6);
    expect(move!.mult).toBeCloseTo(1.2, 6);
    expect(dmg!.remaining).toBeCloseTo(4, 6);
    expect(move!.remaining).toBeCloseTo(4, 6);
  });
});

// ===========================================================================
// Player: buffAlly
// ===========================================================================
describe('player buffAlly', () => {
  it('Blessing buffs the caster when solo (self is the only ally in range)', () => {
    const w = mkWorld('cleric');
    const p = w.players[0];
    tableOf(p).a3.buffDuration = undefined; // dmg/def buffs fall back to the 6s default
    tableOf(p).a3.range = undefined; // ...and the search radius to its 400 default
    resolvePlayerAbility(w, p, 'a3', ZERO); // dmg mult 1.25, def mult 0.8
    const dmg = p.buffs.find((b) => b.kind === 'damageDealt' && b.source === 'blessingDmg');
    const def = p.buffs.find((b) => b.kind === 'damageTaken' && b.source === 'blessingDef');
    expect(dmg!.remaining).toBeCloseTo(6, 6);
    expect(def!.remaining).toBeCloseTo(6, 6);
    expect(w.events.some((e) => e.t === 'skillArea' && e.area.kind === 'circle')).toBe(true);
  });

  it('targets the lowest-HP ally in range', () => {
    const w = mkDuo('cleric', 'knight');
    const cleric = w.players[0];
    const knight = w.players[1];
    knight.hp = knight.maxHp * 0.3; // clearly the neediest
    resolvePlayerAbility(w, cleric, 'a3', ZERO);
    expect(knight.buffs.some((b) => b.source === 'blessingDmg')).toBe(true);
    expect(cleric.buffs.some((b) => b.source === 'blessingDmg')).toBe(false);
  });

  it('applies a move-speed buff when the ability grants one', () => {
    const w = mkWorld('cleric');
    const p = w.players[0];
    tableOf(p).a3.buffMoveMult = 1.15;
    tableOf(p).a3.buffDuration = undefined; // exercises the 6s default on all three buffs
    tableOf(p).a3.buffDamageMult = undefined; // ...and the "no damage buff" branch
    tableOf(p).a3.buffDefMult = undefined; // ...and the "no defense buff" branch
    resolvePlayerAbility(w, p, 'a3', ZERO);
    const move = p.buffs.find((b) => b.kind === 'moveSpeed' && b.source === 'blessingMove');
    expect(move!.mult).toBeCloseTo(1.15, 6);
    expect(move!.remaining).toBeCloseTo(6, 6);
    expect(p.buffs.some((b) => b.source === 'blessingDmg')).toBe(false);
    expect(p.buffs.some((b) => b.source === 'blessingDef')).toBe(false);
  });

  it('falls back to buffing the caster when no ally is a valid target', () => {
    const w = mkWorld('cleric');
    const p = w.players[0];
    p.state = 'downed'; // no alive ally in range => `?? p` self-fallback
    resolvePlayerAbility(w, p, 'a3', ZERO);
    expect(p.buffs.some((b) => b.source === 'blessingDmg')).toBe(true);
  });
});

// ===========================================================================
// Player: heal
// ===========================================================================
describe('player heal', () => {
  it('Heal restores HP to a wounded ally (self) and emits a heal event', () => {
    const w = mkWorld('cleric');
    const p = w.players[0];
    p.hp = p.maxHp - 100;
    resolvePlayerAbility(w, p, 'a1', ZERO); // Heal 60
    expect(p.hp).toBeCloseTo(p.maxHp - 40, 5);
    expect(w.events.some((e) => e.t === 'heal' && e.targetId === p.id)).toBe(true);
  });

  it('healing a full-HP target is a no-op (no heal event)', () => {
    const w = mkWorld('cleric');
    const p = w.players[0];
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(p.hp).toBe(p.maxHp);
    expect(w.events.some((e) => e.t === 'heal')).toBe(false);
  });

  it('picks the lowest-HP ally within range', () => {
    const w = mkDuo('cleric', 'knight');
    const cleric = w.players[0];
    const knight = w.players[1];
    knight.hp = knight.maxHp - 80;
    resolvePlayerAbility(w, cleric, 'a1', ZERO);
    expect(knight.hp).toBeCloseTo(knight.maxHp - 20, 5); // healed +60
  });

  it('is a safe no-op when there is no valid ally to heal', () => {
    const w = mkWorld('cleric');
    const p = w.players[0];
    tableOf(p).a1.range = undefined; // exercises the 400 default search radius
    p.state = 'downed'; // the sole ally is not alive => no heal target
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(w.events.some((e) => e.t === 'heal')).toBe(false);
    expect(w.events.some((e) => e.t === 'cast')).toBe(true); // cast still announced
  });
});

// ===========================================================================
// Player: taunt
// ===========================================================================
describe('player taunt', () => {
  it('Taunt sets the world taunt target/timer and spikes the taunter threat', () => {
    const w = mkDuo('knight', 'ranger');
    const knight = w.players[0];
    const ranger = w.players[1];
    ranger.threat = 500; // knight must leapfrog this
    resolvePlayerAbility(w, knight, 'a1', ZERO); // buffDuration 4
    expect(w.tauntTargetId).toBe(knight.id);
    expect(w.tauntTimer).toBeCloseTo(4, 6);
    expect(knight.threat).toBeCloseTo(600, 6); // max(500) + TAUNT_THREAT_MARGIN(100)
    // Vanilla knight taunt grants no shield.
    expect(knight.buffs.some((b) => b.source === 'tauntShield')).toBe(false);
  });

  it('a Bastion-style taunt also shields the taunter', () => {
    const w = mkWorld('knight');
    const p = w.players[0];
    tableOf(p).a1.buffDefMult = 0.7;
    tableOf(p).a1.buffDuration = undefined; // exercises the 4s default for timer + shield
    resolvePlayerAbility(w, p, 'a1', ZERO);
    const shield = p.buffs.find((b) => b.kind === 'damageTaken' && b.source === 'tauntShield');
    expect(shield!.mult).toBeCloseTo(0.7, 6);
    expect(shield!.remaining).toBeCloseTo(4, 6);
    expect(w.tauntTimer).toBeCloseTo(4, 6); // default taunt duration
  });
});

// ===========================================================================
// Player: helpers / re-exports / fallbacks
// ===========================================================================
describe('player ability helpers', () => {
  it('falls back to the class defaults when a hero has no private table', () => {
    const w = mkWorld('knight');
    const p = w.players[0];
    const boss = w.boss!;
    p.abilities = undefined; // force the getClass() fallback path
    p.pos = { x: 800, y: 500 };
    p.aim = { ...UP };
    boss.pos = { x: 800, y: 450 };
    const before = boss.hp;
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(before - boss.hp).toBeCloseTo(22, 6); // still resolves Cleave
  });

  it('re-exports withLength and PLAYER_RADIUS', () => {
    expect(PLAYER_RADIUS).toBe(16);
    const v = withLength({ x: 3, y: 4 }, 10);
    expect(v.x).toBeCloseTo(6, 6);
    expect(v.y).toBeCloseTo(8, 6);
  });
});

// ===========================================================================
// Boss: cone
// ===========================================================================
describe('boss cone', () => {
  it('Fire Breath damages a player inside the cone and telegraphs it', () => {
    const w = mkWorld('knight', 'dragon');
    const boss = w.boss!;
    const p = w.players[0];
    boss.dmgScale = undefined; // exercise the `dmgScale ?? 1` fallback in the dmg calc
    boss.pos = { x: 800, y: 400 };
    p.pos = { x: 800, y: 200 }; // straight up, aimAngle = -PI/2
    const ab = bossAb('dragon', 'fireBreath'); // dmg 55, range 400, half 30
    const before = p.hp;
    resolveBossAbility(w, boss, ab, mkAction({ aimAngle: -Math.PI / 2 }));
    expect(before - p.hp).toBeCloseTo(55, 6);
    expect(w.events.some((e) => e.t === 'telegraph' && e.shape === 'cone')).toBe(true);
    expect(
      w.events.some((e) => e.t === 'cast' && e.side === 'boss' && e.ability === 'Fire Breath'),
    ).toBe(true);
  });

  it('misses a player outside the cone', () => {
    const w = mkWorld('knight', 'dragon');
    const boss = w.boss!;
    const p = w.players[0];
    boss.pos = { x: 800, y: 400 };
    p.pos = { x: 800, y: 600 }; // behind the -PI/2 facing
    const ab = bossAb('dragon', 'fireBreath');
    const before = p.hp;
    resolveBossAbility(w, boss, ab, mkAction({ aimAngle: -Math.PI / 2 }));
    expect(p.hp).toBe(before);
  });

  it('applies a stun rider to players hit by a stunning cone', () => {
    const w = mkWorld('knight', 'dragon');
    const boss = w.boss!;
    const p = w.players[0];
    boss.pos = { x: 800, y: 400 };
    p.pos = { x: 800, y: 250 };
    const ab: BossAbilityDef = {
      id: 'roar',
      name: 'Roar',
      shape: 'cone',
      windup: 0,
      cooldown: 0,
      damage: 10,
      range: 400,
      halfAngleDeg: 40,
      stun: 1,
    };
    resolveBossAbility(w, boss, ab, mkAction({ aimAngle: -Math.PI / 2 }));
    expect(p.buffs.some((b) => b.kind === 'stun' && b.source === 'bossStun')).toBe(true);
  });

  it('applies a slow rider from a frost cone', () => {
    const w = mkWorld('knight', 'dragon');
    const boss = w.boss!;
    const p = w.players[0];
    boss.pos = { x: 800, y: 400 };
    p.pos = { x: 800, y: 250 };
    const ab: BossAbilityDef = {
      id: 'frostbreath',
      name: 'Frost Breath',
      shape: 'cone',
      windup: 0,
      cooldown: 0,
      damage: 10,
      range: 400,
      halfAngleDeg: 40,
      slowMult: 0.5,
      // slowDuration omitted -> exercises the bossHitRider slow default (2s)
    };
    resolveBossAbility(w, boss, ab, mkAction({ aimAngle: -Math.PI / 2 }));
    const slow = p.buffs.find((b) => b.kind === 'moveSpeed' && b.source === 'bossSlow');
    expect(slow!.mult).toBeCloseTo(0.5, 6);
    expect(slow!.remaining).toBeCloseTo(2, 6); // default duration
  });

  it('scales boss damage by dmgScale (twin encounters)', () => {
    const w = mkWorld('knight', 'dragon');
    const boss = w.boss!;
    const p = w.players[0];
    boss.dmgScale = 0.5;
    boss.pos = { x: 800, y: 400 };
    p.pos = { x: 800, y: 250 };
    const ab = bossAb('dragon', 'fireBreath');
    const before = p.hp;
    resolveBossAbility(w, boss, ab, mkAction({ aimAngle: -Math.PI / 2 }));
    expect(before - p.hp).toBeCloseTo(27.5, 5); // 55 * 0.5
  });

  it("honors the boss's own damage-dealt buff", () => {
    const w = mkWorld('knight', 'dragon');
    const boss = w.boss!;
    const p = w.players[0];
    applyBuff(boss, makeBuff('damageDealt', 2, 5, 'frenzy'));
    boss.pos = { x: 800, y: 400 };
    p.pos = { x: 800, y: 250 };
    const ab = bossAb('dragon', 'fireBreath');
    const before = p.hp;
    resolveBossAbility(w, boss, ab, mkAction({ aimAngle: -Math.PI / 2 }));
    expect(before - p.hp).toBeCloseTo(110, 5); // 55 * 2
  });

  it('uses default range (300) and half-angle (30) when the cone omits them', () => {
    const w = mkWorld('knight', 'dragon');
    const boss = w.boss!;
    const p = w.players[0];
    boss.pos = { x: 800, y: 400 };
    p.pos = { x: 800, y: 200 }; // 200 up, within the default 300 range
    const ab: BossAbilityDef = {
      id: 'bareCone',
      name: 'Bare Cone',
      shape: 'cone',
      windup: 0,
      cooldown: 0,
      damage: 10,
    };
    const before = p.hp;
    resolveBossAbility(w, boss, ab, mkAction({ aimAngle: -Math.PI / 2 }));
    expect(before - p.hp).toBeCloseTo(10, 6);
  });
});

// ===========================================================================
// Boss: circleAtTarget
// ===========================================================================
describe('boss circleAtTarget', () => {
  it('Fireball detonates on the locked target position', () => {
    const w = mkWorld('knight', 'dragon');
    const boss = w.boss!;
    const p = w.players[0];
    boss.pos = { x: 400, y: 400 };
    p.pos = { x: 900, y: 300 };
    const ab = bossAb('dragon', 'fireball'); // dmg 45, radius 110
    const before = p.hp;
    resolveBossAbility(w, boss, ab, mkAction({ targetPos: { x: 900, y: 300 } }));
    expect(before - p.hp).toBeCloseTo(45, 6);
    expect(w.events.some((e) => e.t === 'telegraph' && e.shape === 'circle')).toBe(true);
  });

  it('falls back to the boss position when no target position is locked', () => {
    const w = mkWorld('knight', 'dragon');
    const boss = w.boss!;
    const p = w.players[0];
    boss.pos = { x: 500, y: 500 };
    p.pos = { x: 500, y: 500 }; // sitting on the boss
    const ab = bossAb('dragon', 'fireball');
    const before = p.hp;
    resolveBossAbility(w, boss, ab, mkAction({ targetPos: null }));
    expect(before - p.hp).toBeCloseTo(45, 6);
  });

  it('uses the default radius (110) when the ability omits one', () => {
    const w = mkWorld('knight', 'dragon');
    const boss = w.boss!;
    const p = w.players[0];
    boss.pos = { x: 400, y: 400 };
    p.pos = { x: 900, y: 300 };
    const ab: BossAbilityDef = {
      id: 'bareCircle',
      name: 'Bare Circle',
      shape: 'circleAtTarget',
      windup: 0,
      cooldown: 0,
      damage: 10,
    };
    const before = p.hp;
    resolveBossAbility(w, boss, ab, mkAction({ targetPos: { x: 900, y: 300 } }));
    expect(before - p.hp).toBeCloseTo(10, 6);
  });

  it('spares a player standing outside the blast circle', () => {
    const w = mkWorld('knight', 'dragon');
    const boss = w.boss!;
    const p = w.players[0];
    boss.pos = { x: 400, y: 400 };
    p.pos = { x: 200, y: 700 }; // far from the {900,300} detonation
    const ab = bossAb('dragon', 'fireball'); // radius 110
    const before = p.hp;
    resolveBossAbility(w, boss, ab, mkAction({ targetPos: { x: 900, y: 300 } }));
    expect(p.hp).toBe(before);
  });
});

// ===========================================================================
// Boss: pbaoe
// ===========================================================================
describe('boss pbaoe', () => {
  it('Tail Sweep damages and knocks a nearby player back', () => {
    const w = mkWorld('knight', 'dragon');
    const boss = w.boss!;
    const p = w.players[0];
    boss.pos = { x: 800, y: 400 };
    p.pos = { x: 800, y: 450 };
    const ab = bossAb('dragon', 'tailSweep'); // dmg 40, radius 160, knockback 120
    const before = p.hp;
    resolveBossAbility(w, boss, ab, mkAction());
    expect(before - p.hp).toBeCloseTo(40, 6);
    expect(p.pos.y).toBeCloseTo(570, 4); // pushed +120 away from the boss
    expect(w.events.some((e) => e.t === 'telegraph' && e.shape === 'circle')).toBe(true);
  });

  it('knockback uses a fallback direction when the player sits on the boss center', () => {
    const w = mkWorld('knight', 'dragon');
    const boss = w.boss!;
    const p = w.players[0];
    boss.pos = { x: 800, y: 400 };
    p.pos = { x: 800, y: 400 };
    const ab = bossAb('dragon', 'tailSweep');
    resolveBossAbility(w, boss, ab, mkAction());
    expect(p.pos.x).toBeCloseTo(920, 4); // fallback {1,0} * 120
    expect(p.pos.y).toBeCloseTo(400, 4);
  });

  it('applies a stun rider from a stunning pbaoe', () => {
    const w = mkWorld('knight', 'dragon');
    const boss = w.boss!;
    const p = w.players[0];
    boss.pos = { x: 800, y: 400 };
    p.pos = { x: 800, y: 430 };
    const ab: BossAbilityDef = {
      id: 'quake',
      name: 'Quake',
      shape: 'pbaoe',
      windup: 0,
      cooldown: 0,
      damage: 5,
      radius: 200,
      stun: 1,
    };
    resolveBossAbility(w, boss, ab, mkAction());
    expect(p.buffs.some((b) => b.kind === 'stun' && b.source === 'bossStun')).toBe(true);
  });

  it('uses the default radius (160) and leaves a non-knockback pbaoe in place', () => {
    const w = mkWorld('knight', 'dragon');
    const boss = w.boss!;
    const p = w.players[0];
    boss.pos = { x: 800, y: 400 };
    p.pos = { x: 800, y: 500 }; // 100 apart < default radius 160
    const ab: BossAbilityDef = {
      id: 'stomp',
      name: 'Stomp',
      shape: 'pbaoe',
      windup: 0,
      cooldown: 0,
      damage: 10,
    };
    const before = p.hp;
    resolveBossAbility(w, boss, ab, mkAction());
    expect(before - p.hp).toBeCloseTo(10, 6);
    expect(p.pos.y).toBeCloseTo(500, 4); // no knockback => unmoved
  });

  it('spares a player standing outside the pbaoe radius', () => {
    const w = mkWorld('knight', 'dragon');
    const boss = w.boss!;
    const p = w.players[0];
    boss.pos = { x: 800, y: 400 };
    p.pos = { x: 200, y: 100 }; // well outside Tail Sweep's 160 radius
    const ab = bossAb('dragon', 'tailSweep');
    const before = p.hp;
    resolveBossAbility(w, boss, ab, mkAction());
    expect(p.hp).toBe(before);
  });
});

// ===========================================================================
// Boss: line (charge)
// ===========================================================================
describe('boss line', () => {
  it('Charge damages along the path and relocates the boss to the target', () => {
    const w = mkWorld('knight', 'troll');
    const boss = w.boss!;
    const p = w.players[0];
    boss.pos = { x: 800, y: 300 };
    p.pos = { x: 800, y: 550 }; // on the charge line
    const ab = bossAb('troll', 'charge'); // dmg 50, width 45, knockback 120
    const before = p.hp;
    resolveBossAbility(w, boss, ab, mkAction({ targetPos: { x: 800, y: 800 } }));
    expect(before - p.hp).toBeCloseTo(50, 6);
    expect(boss.pos.x).toBeCloseTo(800, 4);
    expect(boss.pos.y).toBeCloseTo(800, 4);
    expect(w.events.some((e) => e.t === 'telegraph' && e.shape === 'line')).toBe(true);
  });

  it('derives the charge endpoint from aimAngle + range when no target position is set', () => {
    const w = mkWorld('knight', 'troll');
    const boss = w.boss!;
    const p = w.players[0];
    boss.pos = { x: 200, y: 500 };
    p.pos = { x: 600, y: 500 }; // on the +x path
    const ab = bossAb('troll', 'charge'); // range 700
    const before = p.hp;
    resolveBossAbility(w, boss, ab, mkAction({ aimAngle: 0, targetPos: null }));
    expect(before - p.hp).toBeCloseTo(50, 6);
    expect(boss.pos.x).toBeCloseTo(900, 4); // 200 + 700 along aimAngle 0
  });

  it('uses default range (600) / width (45) and skips knockback when absent', () => {
    const w = mkWorld('knight', 'dragon');
    const boss = w.boss!;
    const p = w.players[0];
    boss.pos = { x: 200, y: 500 };
    p.pos = { x: 600, y: 500 }; // on the +x path, perp 0
    const ab: BossAbilityDef = {
      id: 'gore',
      name: 'Gore',
      shape: 'line',
      windup: 0,
      cooldown: 0,
      damage: 10,
    };
    const before = p.hp;
    resolveBossAbility(w, boss, ab, mkAction({ aimAngle: 0, targetPos: null }));
    expect(before - p.hp).toBeCloseTo(10, 6);
    expect(boss.pos.x).toBeCloseTo(800, 4); // 200 + default range 600
    expect(p.pos.y).toBeCloseTo(500, 4); // no knockback => unmoved
  });

  it('spares a player standing off the charge path but still relocates the boss', () => {
    const w = mkWorld('knight', 'troll');
    const boss = w.boss!;
    const p = w.players[0];
    boss.pos = { x: 800, y: 300 };
    p.pos = { x: 400, y: 550 }; // far to the side of the {800,x} charge line
    const ab = bossAb('troll', 'charge');
    const before = p.hp;
    resolveBossAbility(w, boss, ab, mkAction({ targetPos: { x: 800, y: 800 } }));
    expect(p.hp).toBe(before);
    expect(boss.pos.y).toBeCloseTo(800, 4); // boss still dashes to the target
  });
});

// ===========================================================================
// Boss: projectile
// ===========================================================================
describe('boss projectile', () => {
  it('Shadow Bolt fires a boss-side projectile toward the locked target', () => {
    const w = mkWorld('knight', 'lich');
    const boss = w.boss!;
    const p = w.players[0];
    boss.pos = { x: 400, y: 400 };
    p.pos = { x: 800, y: 400 };
    const ab = bossAb('lich', 'shadowBolt'); // dmg 30, speed 420
    resolveBossAbility(w, boss, ab, mkAction({ targetId: p.id }));
    expect(w.projectiles).toHaveLength(1);
    const proj = w.projectiles[0];
    expect(proj.kind).toBe('shadowBolt');
    expect(proj.side).toBe('boss');
    expect(proj.ownerId).toBe(boss.id);
    expect(proj.damage).toBeCloseTo(30, 6);
    expect(proj.hitRadius).toBe(12);
    expect(proj.lifetime).toBe(4);
    expect(proj.rangeLeft).toBe(900); // default when the ability has no range
    expect(Math.hypot(proj.vel.x, proj.vel.y)).toBeCloseTo(420, 3);
    expect(proj.vel.x).toBeGreaterThan(0); // aimed toward the player (+x)
    expect(w.events.some((e) => e.t === 'projectile' && e.kind === 'shadowBolt')).toBe(true);
  });

  it('a fan volley spawns projCount projectiles', () => {
    const w = mkWorld('knight', 'lich');
    const boss = w.boss!;
    const p = w.players[0];
    boss.pos = { x: 400, y: 400 };
    p.pos = { x: 800, y: 400 };
    const ab: BossAbilityDef = {
      id: 'spray',
      name: 'Spray',
      shape: 'projectile',
      windup: 0,
      cooldown: 0,
      damage: 8,
      projSpeed: 400,
      projCount: 3,
      spreadDeg: 40,
    };
    resolveBossAbility(w, boss, ab, mkAction({ targetId: p.id }));
    expect(w.projectiles).toHaveLength(3);
    for (const proj of w.projectiles) expect(proj.side).toBe('boss');
  });

  it('applies the default speed / count / range when the ability omits them', () => {
    const w = mkWorld('knight', 'lich');
    const boss = w.boss!;
    boss.pos = { x: 400, y: 400 };
    const ab: BossAbilityDef = {
      id: 'bolt',
      name: 'Bare Bolt',
      shape: 'projectile',
      windup: 0,
      cooldown: 0,
      damage: 5,
    };
    resolveBossAbility(w, boss, ab, mkAction({ targetPos: { x: 900, y: 400 } }));
    expect(w.projectiles).toHaveLength(1); // projCount default 1
    const proj = w.projectiles[0];
    expect(Math.hypot(proj.vel.x, proj.vel.y)).toBeCloseTo(420, 3); // projSpeed default 420
    expect(proj.rangeLeft).toBe(900); // range default 900
  });

  it('aims at the locked target position when no targetId is set', () => {
    const w = mkWorld('knight', 'lich');
    const boss = w.boss!;
    boss.pos = { x: 400, y: 400 };
    const ab = bossAb('lich', 'shadowBolt');
    resolveBossAbility(w, boss, ab, mkAction({ targetId: null, targetPos: { x: 900, y: 400 } }));
    expect(w.projectiles[0].vel.x).toBeGreaterThan(0);
  });

  it('falls back to aimAngle when neither a target id nor a target position exists', () => {
    const w = mkWorld('knight', 'lich');
    const boss = w.boss!;
    boss.pos = { x: 400, y: 400 };
    const ab = bossAb('lich', 'shadowBolt');
    resolveBossAbility(w, boss, ab, mkAction({ targetId: null, targetPos: null, aimAngle: 0 }));
    expect(w.projectiles).toHaveLength(1);
    expect(w.projectiles[0].vel.x).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Boss: summon
// ===========================================================================
describe('boss summon', () => {
  it('Summon Skeletons spawns the player-count-scaled number of adds', () => {
    const w = mkWorld('knight', 'lich');
    const boss = w.boss!;
    w.adds = [];
    w.events = [];
    const ab = bossAb('lich', 'summonSkeletons');
    resolveBossAbility(w, boss, ab, mkAction());
    expect(w.adds).toHaveLength(2); // addCount(1) = 2
    for (const a of w.adds) {
      expect(a.hp).toBe(ADD_HP);
      expect(a.maxHp).toBe(ADD_HP);
      expect(a.moveSpeed).toBe(ADD_MOVE_SPEED);
      expect(a.radius).toBe(ADD_RADIUS);
      expect(a.pos.x).toBeGreaterThanOrEqual(0);
      expect(a.pos.x).toBeLessThan(ARENA_W);
      expect(a.pos.y).toBeGreaterThanOrEqual(0);
      expect(a.pos.y).toBeLessThan(ARENA_H);
    }
    expect(w.events.filter((e) => e.t === 'spawn').length).toBe(2);
  });

  it('honors addCountBonus / addHpMult / addSpeedMult', () => {
    const w = mkWorld('knight', 'lich');
    const boss = w.boss!;
    w.adds = [];
    const ab: BossAbilityDef = {
      id: 'horde',
      name: 'Horde',
      shape: 'summon',
      windup: 0,
      cooldown: 0,
      damage: 0,
      countScaling: 'adds',
      addCountBonus: 1,
      addHpMult: 2,
      addSpeedMult: 1.5,
    };
    resolveBossAbility(w, boss, ab, mkAction());
    expect(w.adds).toHaveLength(3); // addCount(1)=2 + bonus 1
    expect(w.adds[0].hp).toBeCloseTo(ADD_HP * 2, 6);
    expect(w.adds[0].moveSpeed).toBeCloseTo(ADD_MOVE_SPEED * 1.5, 6);
  });

  it('summons exactly one add when countScaling is not "adds"', () => {
    const w = mkWorld('knight', 'lich');
    const boss = w.boss!;
    w.adds = [];
    const ab: BossAbilityDef = {
      id: 'raise',
      name: 'Raise Dead',
      shape: 'summon',
      windup: 0,
      cooldown: 0,
      damage: 0,
    };
    resolveBossAbility(w, boss, ab, mkAction());
    expect(w.adds).toHaveLength(1);
  });
});

// ===========================================================================
// Boss: voidzones
// ===========================================================================
describe('boss voidzones', () => {
  it('Void Zone drops the player-count-scaled number of boss-side zones', () => {
    const w = mkWorld('knight', 'lich');
    const boss = w.boss!;
    w.groundZones = [];
    const ab = bossAb('lich', 'voidZone'); // radius 90, dur 8, tick 12
    resolveBossAbility(w, boss, ab, mkAction());
    expect(w.groundZones).toHaveLength(1); // zoneCount(1) = 1
    const z = w.groundZones[0];
    expect(z.kind).toBe('voidZone');
    expect(z.side).toBe('boss');
    expect(z.ownerId).toBe(boss.id);
    expect(z.radius).toBe(90);
    expect(z.duration).toBe(8);
    expect(z.damagePerTick).toBeCloseTo(12, 6); // 12 * scalar(1) * dmgScale(1)
    expect(z.pos.x).toBeGreaterThanOrEqual(0);
    expect(z.pos.x).toBeLessThan(ARENA_W);
  });

  it('adds zoneCountBonus extra zones', () => {
    const w = mkWorld('knight', 'lich');
    const boss = w.boss!;
    w.groundZones = [];
    const ab: BossAbilityDef = {
      id: 'mines',
      name: 'Mines',
      shape: 'voidzones',
      windup: 0,
      cooldown: 0,
      damage: 0,
      radius: 90,
      countScaling: 'zones',
      zoneCountBonus: 2,
      zoneDuration: 8,
      zoneTickDamage: 12,
    };
    resolveBossAbility(w, boss, ab, mkAction());
    expect(w.groundZones).toHaveLength(3); // zoneCount(1)=1 + bonus 2
  });

  it('uses radius / tick / duration defaults and anchors on all players when none are alive', () => {
    const w = mkWorld('knight', 'lich');
    const boss = w.boss!;
    boss.dmgScale = undefined; // exercise the `dmgScale ?? 1` fallback in the tick calc
    w.groundZones = [];
    w.players[0].state = 'downed'; // no alive players => pool falls back to world.players
    const ab: BossAbilityDef = {
      id: 'bareVoid',
      name: 'Bare Void',
      shape: 'voidzones',
      windup: 0,
      cooldown: 0,
      damage: 0,
      countScaling: 'zones',
    };
    resolveBossAbility(w, boss, ab, mkAction());
    expect(w.groundZones).toHaveLength(1);
    const z = w.groundZones[0];
    expect(z.radius).toBe(90); // default radius
    expect(z.damagePerTick).toBeCloseTo(12, 6); // default tick damage
    expect(z.duration).toBe(8); // default duration
  });

  it('anchors zones on the boss when the arena has no players to target', () => {
    const w = mkWorld('knight', 'lich');
    const boss = w.boss!;
    boss.pos = { x: 500, y: 500 };
    w.players = []; // empty pool => anchor falls back to the boss position
    w.groundZones = [];
    const ab = bossAb('lich', 'voidZone');
    resolveBossAbility(w, boss, ab, mkAction());
    expect(w.groundZones.length).toBeGreaterThanOrEqual(1);
    // Each zone sits within ~60u jitter of the boss it anchored on.
    for (const z of w.groundZones) {
      expect(Math.hypot(z.pos.x - 500, z.pos.y - 500)).toBeLessThanOrEqual(60 + 1);
    }
  });
});

// ===========================================================================
// Boss: buffSelf
// ===========================================================================
describe('boss buffSelf', () => {
  it('applies haste / frenzy / ward buffs and a self-heal', () => {
    const w = mkWorld('knight', 'dragon');
    const boss = w.boss!;
    boss.hp = boss.maxHp - 500;
    const ab: BossAbilityDef = {
      id: 'empower',
      name: 'Empower',
      shape: 'buffSelf',
      windup: 0,
      cooldown: 0,
      damage: 0,
      buffMoveMult: 1.3,
      buffDamageMult: 1.5,
      buffDefMult: 0.7,
      // buffDuration omitted -> the buffs use their 5s default
      selfHealFrac: 0.1,
    };
    const before = boss.hp;
    resolveBossAbility(w, boss, ab, mkAction());
    expect(
      boss.buffs.find((b) => b.kind === 'moveSpeed' && b.source === 'bossHaste')!.mult,
    ).toBeCloseTo(1.3, 6);
    expect(
      boss.buffs.find((b) => b.kind === 'damageDealt' && b.source === 'bossFrenzy')!.mult,
    ).toBeCloseTo(1.5, 6);
    expect(
      boss.buffs.find((b) => b.kind === 'damageTaken' && b.source === 'bossWard')!.mult,
    ).toBeCloseTo(0.7, 6);
    expect(boss.hp - before).toBeCloseTo(boss.maxHp * 0.1, 5); // healed 10% of maxHp
  });

  it('does nothing when the buffSelf ability specifies no buffs or heal', () => {
    const w = mkWorld('knight', 'dragon');
    const boss = w.boss!;
    boss.hp = boss.maxHp - 200;
    const before = boss.hp;
    const ab: BossAbilityDef = {
      id: 'noop',
      name: 'Focus',
      shape: 'buffSelf',
      windup: 0,
      cooldown: 0,
      damage: 0,
    };
    resolveBossAbility(w, boss, ab, mkAction());
    expect(boss.buffs).toHaveLength(0);
    expect(boss.hp).toBe(before);
  });
});

// ===========================================================================
// Boss: beam channel + beamTick
// ===========================================================================
describe('boss beam channel', () => {
  it('Life Drain switches the action into a channel', () => {
    const w = mkWorld('knight', 'lich');
    const boss = w.boss!;
    const ab = bossAb('lich', 'lifeDrain'); // channelDuration 2
    const action = mkAction({ kind: 'windup', abilityId: 'lifeDrain', remaining: 0 });
    resolveBossAbility(w, boss, ab, action);
    expect(action.kind).toBe('channel');
    expect(action.abilityId).toBe('lifeDrain');
    expect(action.remaining).toBeCloseTo(2, 6);
    expect(action.total).toBeCloseTo(2, 6);
    expect(action.channelAccum).toBe(0);
  });

  it('defaults the channel duration to 2s when the ability omits it', () => {
    const w = mkWorld('knight', 'lich');
    const boss = w.boss!;
    const ab: BossAbilityDef = {
      id: 'bareBeam',
      name: 'Bare Beam',
      shape: 'beam',
      windup: 0,
      cooldown: 0,
      damage: 5,
    };
    const action = mkAction({ kind: 'windup', abilityId: 'bareBeam' });
    resolveBossAbility(w, boss, ab, action);
    expect(action.kind).toBe('channel');
    expect(action.remaining).toBeCloseTo(2, 6);
  });
});

describe('beamTick', () => {
  it('drains the locked target and heals the boss', () => {
    const w = mkWorld('knight', 'lich');
    const boss = w.boss!;
    const p = w.players[0];
    boss.dmgScale = undefined; // exercise the `dmgScale ?? 1` fallback in beamTick
    boss.pos = { x: 800, y: 400 };
    boss.hp = boss.maxHp - 100;
    p.pos = { x: 800, y: 450 };
    const ab = bossAb('lich', 'lifeDrain'); // dmg 15, range 500, healSelf
    const pHp = p.hp;
    const bHp = boss.hp;
    beamTick(w, boss, ab, mkAction({ targetId: p.id }));
    expect(pHp - p.hp).toBeCloseTo(15, 6);
    expect(boss.hp - bHp).toBeCloseTo(15, 6);
  });

  it('does nothing when the target is out of range', () => {
    const w = mkWorld('knight', 'lich');
    const boss = w.boss!;
    const p = w.players[0];
    boss.pos = { x: 200, y: 400 };
    p.pos = { x: 900, y: 400 }; // 700 apart > range 500
    const ab = bossAb('lich', 'lifeDrain');
    const pHp = p.hp;
    const bHp = boss.hp;
    beamTick(w, boss, ab, mkAction({ targetId: p.id }));
    expect(p.hp).toBe(pHp);
    expect(boss.hp).toBe(bHp);
  });

  it('does nothing without a locked target', () => {
    const w = mkWorld('knight', 'lich');
    const boss = w.boss!;
    const p = w.players[0];
    const ab = bossAb('lich', 'lifeDrain');
    const pHp = p.hp;
    beamTick(w, boss, ab, mkAction({ targetId: null }));
    expect(p.hp).toBe(pHp);
  });

  it('damages but does not heal the boss when healSelf is off', () => {
    const w = mkWorld('knight', 'lich');
    const boss = w.boss!;
    const p = w.players[0];
    boss.pos = { x: 800, y: 400 };
    boss.hp = boss.maxHp - 100;
    p.pos = { x: 800, y: 450 };
    const ab: BossAbilityDef = {
      id: 'lance',
      name: 'Soul Lance',
      shape: 'beam',
      windup: 0,
      cooldown: 0,
      damage: 10,
      // range omitted on purpose -> exercises the default (500) range gate
    };
    const pHp = p.hp;
    const bHp = boss.hp;
    beamTick(w, boss, ab, mkAction({ targetId: p.id }));
    expect(pHp - p.hp).toBeCloseTo(10, 6);
    expect(boss.hp).toBe(bHp);
  });
});

// ===========================================================================
// Player: resolution defaults / guards (untaken `??` and early-return branches)
// ===========================================================================
describe('player ability resolution defaults', () => {
  it('a melee slow rider defaults its duration to 2s when slowDuration is unset', () => {
    const w = mkWorld('rogue');
    const p = w.players[0];
    const boss = w.boss!;
    tableOf(p).basic.slowMult = 0.5;
    tableOf(p).basic.slowDuration = undefined; // exercises `ab.slowDuration ?? 2`
    p.pos = { x: 800, y: 500 };
    p.aim = { ...UP };
    boss.pos = { x: 800, y: 470 };
    resolvePlayerAbility(w, p, 'basic', ZERO);
    const slow = boss.buffs.find((b) => b.kind === 'moveSpeed' && b.source === 'slow');
    expect(slow!.mult).toBeCloseTo(0.5, 6);
    expect(slow!.remaining).toBeCloseTo(2, 6); // the default duration
  });

  it('resolving an unbound sub slot is an early no-op (no cast, no projectile)', () => {
    const w = mkWorld('knight');
    const p = w.players[0];
    expect(p.subAbilities).toBeUndefined(); // nothing bound to sub1
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(w.events.some((e) => e.t === 'cast')).toBe(false); // returned before the cast push
    expect(w.projectiles).toHaveLength(0);
  });

  it('falls back to white (0xffffff) when the class has no palette colour', () => {
    const w = mkWorld('knight');
    const p = w.players[0];
    const boss = w.boss!;
    p.classId = 'ghost' as ClassId; // not a key in CLASS_COLORS → `?? 0xffffff`
    p.pos = { x: 800, y: 500 };
    p.aim = { ...UP };
    boss.pos = { x: 200, y: 200 }; // out of the cone → no damage → no getClass on the bogus id
    resolvePlayerAbility(w, p, 'basic', ZERO);
    let color: number | undefined;
    for (const e of w.events) if (e.t === 'skillArea') color = e.color;
    expect(color).toBe(0xffffff);
    expect(boss.hp).toBe(boss.maxHp); // nothing was struck
  });

  it('a bare meleeCone uses the default range (70) and half-angle (45)', () => {
    const w = mkWorld('knight');
    const p = w.players[0];
    const boss = w.boss!;
    tableOf(p).basic = {
      slot: 'basic',
      name: 'Bare Cleave',
      kind: 'meleeCone',
      cooldown: 0,
      damage: 15,
      // no range / no halfAngleDeg → exercises `?? 70` and `?? 45`
    };
    p.pos = { x: 800, y: 500 };
    p.aim = { ...UP };
    boss.pos = { x: 800, y: 450 }; // 50u dead ahead: inside the default 70 range and 45° arc
    const before = boss.hp;
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(before - boss.hp).toBeCloseTo(15, 6);
  });

  it('a bare projectile uses the default count (1) and speed (600)', () => {
    const w = mkWorld('ranger');
    const p = w.players[0];
    tableOf(p).basic = {
      slot: 'basic',
      name: 'Bare Bolt',
      kind: 'projectile',
      cooldown: 0,
      damage: 10,
      // no projCount / no projSpeed → exercises `?? 1` and `?? 600`
    };
    p.pos = { x: 400, y: 500 };
    p.aim = { ...RIGHT };
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(w.projectiles).toHaveLength(1); // projCount ?? 1
    const proj = w.projectiles[0];
    expect(Math.hypot(proj.vel.x, proj.vel.y)).toBeCloseTo(600, 3); // projSpeed ?? 600
  });

  it('a bare pbaoe uses the default radius (150)', () => {
    const w = mkWorld('mage');
    const p = w.players[0];
    const boss = w.boss!;
    tableOf(p).a2 = {
      slot: 'a2',
      name: 'Bare Nova',
      kind: 'pbaoe',
      cooldown: 0,
      damage: 12,
      // no radius → exercises `?? 150`
    };
    p.pos = { x: 800, y: 500 };
    boss.pos = { x: 800, y: 600 }; // 100u away: comfortably inside the default 150 radius
    const before = boss.hp;
    resolvePlayerAbility(w, p, 'a2', ZERO);
    expect(before - boss.hp).toBeCloseTo(12, 6);
  });
});

// ---------------------------------------------------------------------------
// applyImpulse — knockback/pull VISUAL slide (item 28)
// ---------------------------------------------------------------------------
describe('applyImpulse visual slide', () => {
  it('moves the logical pos instantly but slides the RENDERED pos in from the origin', () => {
    const w = mkWorld('knight');
    const p = w.players[0];
    p.pos = { x: 800, y: 500 };
    applyImpulse(w, p, { x: 1, y: 0 }, 100); // shove +x by 100u

    // The authoritative position jumps to the final spot (logic/collisions intact).
    expect(p.pos.x).toBeCloseTo(900, 3);
    expect(p.slideOff).toBeTruthy();
    expect(p.slideRemaining).toBeGreaterThan(0);

    // Right after the shove (ease ≈ 1) the RENDERED pos is still back at the origin,
    // so the hero visibly travels rather than teleporting.
    const rendered0 = w.serialize().players[0].pos.x;
    expect(rendered0).toBeCloseTo(800, 0);

    // Once the slide settles, the rendered pos catches up to the logical pos.
    p.slideRemaining = 0;
    expect(w.serialize().players[0].pos.x).toBeCloseTo(900, 0);
  });

  it('does not animate a tiny shove (below the SHOVE_MIN threshold)', () => {
    const w = mkWorld('knight');
    const p = w.players[0];
    p.pos = { x: 800, y: 500 };
    applyImpulse(w, p, { x: 1, y: 0 }, 10); // < SHOVE_MIN
    expect(p.pos.x).toBeCloseTo(810, 3);
    expect(p.slideRemaining).toBeUndefined(); // no slide recorded
    expect(w.serialize().players[0].pos.x).toBeCloseTo(810, 0);
  });
});

// ===========================================================================
// Player cone AoE — cone-described abilities resolve/telegraph as CONES (item 3)
// ===========================================================================
describe('player cone AoE (item 3)', () => {
  it('Cone of Cold and Dragon Breath are frontal cones, not circles', () => {
    for (const id of ['mg_evoker_cone', 'so_draconic_breath']) {
      const ab = getSubSkill(id)!.ability;
      expect(ab.kind).toBe('meleeCone'); // the engine's frontal-cone primitive
      expect(ab.range).toBeGreaterThan(70); // a RANGED cone (beyond melee reach)
      expect(ab.halfAngleDeg).toBeGreaterThan(0); // has an arc
      expect(ab.radius).toBeUndefined(); // NOT a circle
    }
  });

  it('a ranged cone hits a target in front at range and flashes a cone area', () => {
    const w = mkWorld('mage');
    const p = w.players[0];
    const boss = w.boss!;
    tableOf(p).a1 = { ...getSubSkill('mg_evoker_cone')!.ability, slot: 'a1' };
    p.pos = { x: 800, y: 500 };
    p.aim = { ...UP };
    boss.pos = { x: 800, y: 340 }; // 160u dead ahead — inside a 210u cone, beyond melee
    const before = boss.hp;
    resolvePlayerAbility(w, p, 'a1', UP);
    expect(boss.hp).toBeLessThan(before); // hit
    expect(w.events.some((e) => e.t === 'skillArea' && e.area.kind === 'cone')).toBe(true);
  });

  it('a ranged cone misses a target off to the side (outside the arc)', () => {
    const w = mkWorld('mage');
    const p = w.players[0];
    const boss = w.boss!;
    tableOf(p).a1 = { ...getSubSkill('mg_evoker_cone')!.ability, slot: 'a1' };
    p.pos = { x: 800, y: 500 };
    p.aim = { ...UP }; // facing up (−y)
    boss.pos = { x: 970, y: 500 }; // 170u directly to the RIGHT — 90° off the aim axis
    const before = boss.hp;
    resolvePlayerAbility(w, p, 'a1', UP);
    expect(boss.hp).toBe(before); // outside the cone arc → no hit
    expect(w.events.some((e) => e.t === 'skillArea' && e.area.kind === 'cone')).toBe(true);
  });
});

// ===========================================================================
// Root gates boss mobility — charge/dash fizzles while rooted (item 9)
// ===========================================================================
describe('root gates boss mobility (item 9)', () => {
  it("a rooted boss's charge (line) fizzles — no reposition and no path damage", () => {
    const w = mkWorld('knight', 'troll');
    const boss = w.boss!;
    const p = w.players[0];
    const ab = bossAb('troll', 'charge');
    const targetPos = { x: 900, y: 500 };

    // Unrooted: the charge dashes the boss to the target and hits a hero in the path.
    boss.pos = { x: 400, y: 500 };
    p.pos = { x: 900, y: 500 };
    let before = p.hp;
    resolveBossAbility(w, boss, ab, mkAction({ targetPos, aimAngle: 0 }));
    expect(boss.pos.x).toBeGreaterThan(400); // relocated toward the target
    expect(p.hp).toBeLessThan(before); // path damage landed

    // Rooted: the whole charge fizzles.
    boss.pos = { x: 400, y: 500 };
    p.hp = p.maxHp;
    before = p.hp;
    applyBuff(boss, makeBuff('root', 0, 2, 'zoneRoot'));
    resolveBossAbility(w, boss, ab, mkAction({ targetPos, aimAngle: 0 }));
    expect(boss.pos).toEqual({ x: 400, y: 500 }); // no reposition while rooted
    expect(p.hp).toBe(before); // …and no path damage
  });
});

// ===========================================================================
// Root/bind sweep (item 3) — every root/bind ability truly immobilises a boss
// ===========================================================================
describe('root/bind sweep (item 3)', () => {
  it('flags the true roots and keeps intentional snares/thorns as slows', () => {
    // True roots: Druid Entangle (base), Mage Abjurer Otiluke Bind, Rogue
    // Trickster Ensnaring Strike — a bind/web holds the target fast.
    expect(getClass('druid').abilities.a1.roots).toBe(true);
    expect(getSubSkill('mg_abjurer_bind')!.ability.roots).toBe(true);
    expect(getSubSkill('ro_trickster_snare')!.ability.roots).toBe(true);
    // Documented product call — a "snare"/thorn-barrier/nova-burst stays a soft
    // slow, never a hard root (still slows, never immobilises).
    for (const id of ['rg_beast_snare', 'dr_land_wall', 'bb_totem_quake', 'pa_vengeance_shackle']) {
      const ab = getSubSkill(id)!.ability;
      expect(ab.roots ?? false).toBe(false);
      expect(ab.slowMult!).toBeLessThan(1);
    }
  });

  it('describeAbility reads a rooting zone as "roots" and a snare as a % slow', () => {
    expect(describeAbility(getClass('druid').abilities.a1)).toContain('roots');
    expect(describeAbility(getSubSkill('mg_abjurer_bind')!.ability)).toContain('roots');
    const snare = describeAbility(getSubSkill('rg_beast_snare')!.ability);
    expect(snare).toContain('slow to');
    expect(snare).not.toContain('roots');
  });

  // Each newly-rooting subclass ability must spawn a TRUE-root zone (roots:true),
  // which the engine's root contract turns into a full immobilise (move + blink +
  // Teleporting affix + charge, all covered generically by the root-buff tests).
  for (const [name, id] of [
    ['Otiluke Bind', 'mg_abjurer_bind'],
    ['Ensnaring Strike', 'ro_trickster_snare'],
  ] as const) {
    it(`${name} spawns a true-root entangle zone`, () => {
      const w = mkWorld('mage');
      const p = w.players[0];
      p.subAbilities = { sub1: { ...getSubSkill(id)!.ability, slot: 'sub1' } };
      p.pos = { x: 400, y: 500 };
      p.aim = { ...RIGHT };
      resolvePlayerAbility(w, p, 'sub1', ZERO);
      const z = w.groundZones[0];
      expect(z.kind).toBe('entangle');
      expect(z.roots).toBe(true);
      expect(z.slowMult).toBeCloseTo(0.3, 6);
    });
  }
});

// ===========================================================================
// Crit + backstab in ability resolution (item 5)
// ===========================================================================
describe('crit + backstab (item 5)', () => {
  it('a forced crit multiplies a melee cone strike and flags it (front → no backstab)', () => {
    const w = mkWorld('knight');
    const p = w.players[0];
    const boss = w.boss!;
    p.critChance = 1; // always crit
    p.critMult = 2; // clean ×2
    boss.facing = 0; // faces +x, toward the player → the player is in FRONT
    p.pos = { x: 800, y: 500 };
    p.aim = { x: -1, y: 0 };
    boss.pos = { x: 760, y: 500 }; // inside the player's cone, on the boss's front side
    const before = boss.hp;
    resolvePlayerAbility(w, p, 'basic', ZERO);
    const hit = w.events.find((e) => e.t === 'hit' && e.targetId === boss.id) as
      { crit?: boolean; backstab?: boolean } | undefined;
    expect(hit?.crit).toBe(true);
    expect(hit?.backstab).toBeFalsy();
    expect(before - boss.hp).toBeCloseTo(44, 5); // Cleave 22 × critMult 2
  });

  it('a rear-arc melee cone backstabs for bonus damage (crit suppressed)', () => {
    const w = mkWorld('knight');
    const p = w.players[0];
    const boss = w.boss!;
    p.critChance = 0; // isolate the backstab bonus
    boss.facing = 0; // faces +x (AWAY from the player)
    p.pos = { x: 720, y: 500 };
    p.aim = { x: 1, y: 0 };
    boss.pos = { x: 760, y: 500 }; // player stands behind the boss, inside the cone
    const before = boss.hp;
    resolvePlayerAbility(w, p, 'basic', ZERO);
    const hit = w.events.find((e) => e.t === 'hit' && e.targetId === boss.id) as
      { crit?: boolean; backstab?: boolean } | undefined;
    expect(hit?.backstab).toBe(true);
    expect(hit?.crit).toBeFalsy();
    expect(before - boss.hp).toBeCloseTo(22 * 1.4, 4); // Cleave 22 × BACKSTAB_MULT
  });
});
