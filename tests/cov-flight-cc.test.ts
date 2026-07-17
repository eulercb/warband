/**
 * Branch-coverage tests for NEW mechanics: the SLUGGISH wind-up-slow rider (item 9)
 * delivered by melee cones and projectiles, ranged-AoE arming (item 12), the
 * flight bypass over ground zones / terrain (items 7 & 8) and the CC-immunity
 * announce-once guard on applyStun (item 1).
 *
 * Every case asserts a real observable effect (a buff appears, HP does / doesn't
 * change, an event fires exactly once). Deterministic: fixed seeds, fixed dt, no
 * Math.random / Date.
 */
import { describe, it, expect } from 'vitest';
import { resolvePlayerAbility } from '../src/engine/combat/abilities';
import { World } from '../src/engine/world/world';
import { makeBuff, applyBuff, applyStun, BOSS_INVULN_SOURCE } from '../src/engine/combat/combat';
import type {
  Player,
  GameEvent,
  GroundZone,
  TerrainPatch,
  Vec2,
  ClassId,
  MonsterId,
} from '../src/engine/core/types';

const DT = 0.05;
const ZERO: Vec2 = { x: 0, y: 0 };
const UP: Vec2 = { x: 0, y: -1 };
const RIGHT: Vec2 = { x: 1, y: 0 };

function mkWorld(classId: ClassId = 'knight', monsterId: MonsterId = 'dragon'): World {
  return new World({ monsterId, seed: 1, players: [{ peerId: 'a', name: 'A', classId }] });
}

/** Two-player world (first entry flies, second stays grounded, for the item 7/8 tests). */
function mkDuoWorld(c1: ClassId, c2: ClassId): World {
  return new World({
    monsterId: 'dragon',
    seed: 1,
    players: [
      { peerId: 'a', name: 'A', classId: c1 },
      { peerId: 'b', name: 'B', classId: c2 },
    ],
  });
}

function tableOf(p: Player) {
  if (!p.abilities) throw new Error('player has no ability table');
  return p.abilities;
}

function sink(): { events: GameEvent[] } {
  return { events: [] };
}

// ===========================================================================
// item 1 — abilities.ts:270-271: a meleeCone DIRECT HIT with castSlow > 1
// stamps a `castSlow` (SLUGGISH) buff on the struck target.
// ===========================================================================
describe('meleeCone castSlow rider (abilities.ts applyStrikeRiders)', () => {
  it('a Cleave carrying castSlow slows the struck boss’s wind-up', () => {
    const w = mkWorld('knight');
    const p = w.players[0];
    const boss = w.boss!;
    // Knight basic (Cleave) is a meleeCone; graft a wind-up-slow rider onto it.
    tableOf(p).basic.castSlow = 1.4;
    p.pos = { x: 800, y: 500 };
    p.aim = { ...UP };
    boss.pos = { x: 800, y: 450 }; // squarely in the cone
    const before = boss.hp;
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(boss.hp).toBeLessThan(before); // it was a real direct hit
    const cs = boss.buffs.find((b) => b.kind === 'castSlow' && b.source === 'castSlow');
    expect(cs).toBeTruthy();
    expect(cs!.mult).toBeCloseTo(1.4, 6);
    expect(cs!.remaining).toBeCloseTo(3, 6); // castSlowDuration default 3s
  });

  it('a plain Cleave (no castSlow rider) leaves the boss un-slugged', () => {
    const w = mkWorld('knight');
    const p = w.players[0];
    const boss = w.boss!;
    p.pos = { x: 800, y: 500 };
    p.aim = { ...UP };
    boss.pos = { x: 800, y: 450 };
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(boss.buffs.some((b) => b.kind === 'castSlow')).toBe(false);
  });
});

// ===========================================================================
// item 2 — world.ts:1553-1554: a player PROJECTILE carrying castSlow stamps a
// `castSlow` buff on the boss it impacts.
// ===========================================================================
describe('projectile castSlow rider (world.applyProjRiders)', () => {
  it('a cursed arrow slows the boss’s wind-up on impact', () => {
    const w = mkWorld('ranger');
    w.obstacles = []; // nothing to absorb the shot
    const p = w.players[0];
    const boss = w.boss!;
    boss.decisionTimer = 100; // keep the boss still so the shot lands cleanly
    // Ranger basic (Arrow) spawns a real player projectile; arm it with a wind-up-slow
    // rider (as a forged cursed bolt carries — see world.applyProjRiders).
    p.pos = { x: 400, y: 500 };
    p.aim = { ...RIGHT };
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(w.projectiles).toHaveLength(1);
    w.projectiles[0].castSlow = 1.3; // the cursed rider on the live shot
    expect(w.projectiles[0].castSlow).toBe(1.3);

    // Drop the boss (and the live arrow) together so the very next tick impacts.
    const before = boss.hp;
    boss.pos = { x: 800, y: 500 };
    w.projectiles[0].pos = { x: 800, y: 500 };
    for (let i = 0; i < 5 && !boss.buffs.some((b) => b.kind === 'castSlow'); i++) {
      w.step(DT, new Map());
    }
    expect(boss.hp).toBeLessThan(before); // the arrow connected
    const cs = boss.buffs.find((b) => b.kind === 'castSlow' && b.source === 'castSlow');
    expect(cs).toBeTruthy();
    expect(cs!.mult).toBeCloseTo(1.3, 6);
  });
});

// ===========================================================================
// item 3 — world.ts:1637-1638: an ARMING ground zone is inert while
// armRemaining > 0, then bites once the arm window elapses.
// ===========================================================================
describe('ground-zone arming countdown (world.updateZones)', () => {
  it('deals no tick damage while arming, then damages once armed', () => {
    const w = mkWorld('knight');
    w.obstacles = [];
    w.terrain = [];
    const p = w.players[0];
    const boss = w.boss!;
    boss.decisionTimer = 100; // idle boss — its HP only ever moves via the zone
    const center: Vec2 = { x: 800, y: 400 };
    boss.pos = { ...center };
    const z: GroundZone = {
      id: w.allocId(),
      kind: 'poison',
      pos: { ...center },
      radius: 200,
      side: 'player',
      ownerId: p.id,
      damagePerTick: 25,
      healPerTick: 0,
      slowMult: 1,
      slowDuration: 0,
      duration: 10,
      remaining: 10,
      tickAccum: 0,
      armRemaining: 0.15,
      armTotal: 0.15,
      armFrom: { x: 400, y: 400 },
    };
    w.groundZones = [z];
    const hp0 = boss.hp;

    // While still arming: the countdown ticks but the zone stays inert.
    for (let i = 0; i < 2; i++) {
      boss.pos = { ...center };
      w.step(DT, new Map());
    }
    expect(z.armRemaining!).toBeGreaterThan(0); // still arming
    expect(z.armRemaining!).toBeLessThan(0.15); // ...but counting down (line 1637)
    expect(boss.hp).toBe(hp0); // inert telegraph — no bite yet

    // Step on: the arm window lapses and the zone starts biting.
    for (let i = 0; i < 40 && boss.hp === hp0; i++) {
      boss.pos = { ...center };
      w.step(DT, new Map());
    }
    expect(z.armRemaining ?? 0).toBe(0); // fully armed
    expect(boss.hp).toBeLessThan(hp0); // now it deals its tick damage
  });
});

// ===========================================================================
// item 4 — world.ts:1663: a FLYING hero hovers over a boss GROUND zone (a void
// pool) and takes no tick damage; a grounded ally in the same pool is hurt.
// ===========================================================================
describe('flight negates a boss ground zone (world.applyZoneTick)', () => {
  it('a flyer takes no zone-tick damage while a grounded ally does', () => {
    const w = mkDuoWorld('knight', 'ranger');
    w.boss = null;
    w.terrain = [];
    w.obstacles = [];
    const flyer = w.players[0];
    const grounded = w.players[1];
    const spot: Vec2 = { x: 800, y: 400 };
    flyer.pos = { ...spot };
    grounded.pos = { ...spot };
    applyBuff(flyer, makeBuff('flight', 0, 5, 'flight'));

    const zone: GroundZone = {
      id: w.allocId(),
      kind: 'voidZone', // a GROUND effect — does not reach flyers
      pos: { ...spot },
      radius: 160,
      side: 'boss',
      ownerId: 0,
      damagePerTick: 20,
      healPerTick: 0,
      slowMult: 1,
      slowDuration: 0,
      duration: 10,
      remaining: 10,
      tickAccum: 0.5, // cross a tick threshold on the first step
    };
    w.groundZones = [zone];

    const flyerBefore = flyer.hp;
    const groundedBefore = grounded.hp;
    w.step(DT, new Map());
    expect(flyer.hp).toBe(flyerBefore); // hovered above the pool — untouched
    expect(grounded.hp).toBeLessThan(groundedBefore); // standing in it — burned
  });
});

// ===========================================================================
// item 5 — world.ts:1804: a FLYING hero soars over damaging/slowing TERRAIN; a
// grounded ally on the same patch is burned and mired.
// ===========================================================================
describe('flight negates terrain hazards (world terrain tick)', () => {
  it('a flyer takes no terrain damage or slow while a grounded ally does', () => {
    const w = mkDuoWorld('knight', 'ranger');
    w.boss = null;
    w.obstacles = [];
    const flyer = w.players[0];
    const grounded = w.players[1];
    flyer.terrainResist = 0;
    grounded.terrainResist = 0;
    const spot: Vec2 = { x: 500, y: 500 };
    flyer.pos = { ...spot };
    grounded.pos = { ...spot };
    applyBuff(flyer, makeBuff('flight', 0, 5, 'flight'));

    const patch: TerrainPatch = {
      id: w.allocId(),
      kind: 'magma',
      pos: { ...spot },
      radius: 150,
      damagePerTick: 12,
      slowMult: 0.4,
      slowDuration: 2,
      tickAccum: 0.5, // cross a tick threshold on the first step
    };
    w.terrain = [patch];

    const flyerBefore = flyer.hp;
    const groundedBefore = grounded.hp;
    w.step(DT, new Map());

    // The flyer soared over the hazard: no burn (line 1804) and no mire (line 1780).
    expect(flyer.hp).toBe(flyerBefore);
    expect(flyer.buffs.some((b) => b.source === 'terrain')).toBe(false);
    // The grounded ally ate both the damage and the slow.
    expect(grounded.hp).toBeLessThan(groundedBefore);
    expect(grounded.buffs.some((b) => b.kind === 'moveSpeed' && b.source === 'terrain')).toBe(true);
  });
});

// ===========================================================================
// item 6 — combat.ts:254-257: applyStun on a CC-immune (boss-invuln) target
// early-returns and announces a stun-resist ONCE (the announced guard).
// ===========================================================================
describe('applyStun on a CC-immune target announces once (combat.applyStun)', () => {
  it('resists the stun, cues Resisted the first time, then stays quiet', () => {
    const w = mkWorld('knight');
    const boss = w.boss!;
    applyBuff(boss, makeBuff('invuln', 0, 1.6, BOSS_INVULN_SOURCE)); // enters CC immunity

    // First attempt: resisted (returns 0, no stun buff) and the cue fires exactly once.
    const s1 = sink();
    expect(applyStun(s1, boss, 2, 'stun')).toBe(0);
    expect(boss.buffs.some((b) => b.kind === 'stun')).toBe(false);
    expect(s1.events.filter((e) => e.t === 'stunResist' && e.id === boss.id).length).toBe(1);
    expect(boss.stunDr?.load ?? 0).toBe(0); // the blocked attempt banked no DR load

    // Second attempt while still immune: still resisted, but the announced guard
    // suppresses a repeat cue (the false side of `if (!dr0.announced)`).
    const s2 = sink();
    expect(applyStun(s2, boss, 2, 'stun')).toBe(0);
    expect(boss.buffs.some((b) => b.kind === 'stun')).toBe(false);
    expect(s2.events.some((e) => e.t === 'stunResist')).toBe(false);
  });
});
