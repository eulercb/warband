/**
 * Warband — mid-fight CORRUPTION events. PURE TS (operates on a World).
 *
 * Seeded random beats that fire DURING a fight so even a boss you know stays
 * unpredictable (Hades encounters / RoR2 void seeds). Most punish — a scatter of
 * telegraphed strikes, erupting hazard vents, a ring that herds you inward — one
 * rewards (a healing rift), and one just roars the boss into a brief surge. They
 * compose with everything else (affixes, twins, terrain) because they act only
 * through the World's existing primitives: pending strikes, ground zones, add
 * waves and boss buffs.
 *
 * Enabled only when the World is built with `corruption: true` (the host turns it
 * on for gauntlet slots past the opener and every endless cycle), so plain and
 * opening fights — and the whole existing test suite — are untouched.
 */
import type { World } from './world';
import type { CorruptionKind, Vec2 } from '../core/types';
import {
  ARENA_W,
  ARENA_H,
  CORRUPTION_FIRST_DELAY,
  CORRUPTION_INTERVAL,
  CORRUPTION_INTERVAL_JITTER,
  CORRUPTION_CYCLE_SPEEDUP,
  CORRUPTION_MIN_INTERVAL,
  CORRUPTION_RAIN_COUNT,
  CORRUPTION_RAIN_RADIUS,
  CORRUPTION_RAIN_FUSE,
  CORRUPTION_RAIN_DAMAGE,
  CORRUPTION_VENT_COUNT,
  CORRUPTION_VENT_RADIUS,
  CORRUPTION_VENT_FUSE,
  CORRUPTION_VENT_DAMAGE,
  CORRUPTION_VENT_POOL_DURATION,
  CORRUPTION_VENT_POOL_TICK,
  CORRUPTION_COLLAPSE_RADIUS,
  CORRUPTION_COLLAPSE_COUNT,
  CORRUPTION_COLLAPSE_FUSE,
  CORRUPTION_COLLAPSE_DAMAGE,
  CORRUPTION_SURGE_DURATION,
  CORRUPTION_SURGE_DMG_MULT,
  CORRUPTION_SURGE_MOVE_MULT,
  CORRUPTION_RIFT_RADIUS,
  CORRUPTION_RIFT_DURATION,
  CORRUPTION_RIFT_TICK_HEAL,
  CORRUPTION_SWARM_COUNT,
} from '../core/constants';
import { addCount } from '../content/scaling';
import { applyBuff, makeBuff } from '../combat/combat';
import { spawnZone } from '../combat/abilities';

/** Display names shown on the center-screen banner + world floater. */
const NAMES: Record<CorruptionKind, string> = {
  enrageSurge: 'Enrage Surge',
  telegraphRain: 'Telegraph Rain',
  healingRift: 'Healing Rift',
  addSwarm: 'Add Swarm',
  ventEruption: 'Vent Eruption',
  collapsingArena: 'Collapsing Arena',
};

interface KindDef {
  kind: CorruptionKind;
  weight: number;
  /** Benevolent beat (drives a friendlier banner colour). */
  good?: boolean;
}

/** The beat table — punishing beats outweigh the single reward beat. */
const KINDS: KindDef[] = [
  { kind: 'enrageSurge', weight: 3 },
  { kind: 'telegraphRain', weight: 3 },
  { kind: 'ventEruption', weight: 3 },
  { kind: 'addSwarm', weight: 2 },
  { kind: 'collapsingArena', weight: 2 },
  { kind: 'healingRift', weight: 2, good: true },
];

/** Accent colour per beat (matches the incoming-strike telegraph tint). */
const COLORS: Record<CorruptionKind, number> = {
  enrageSurge: 0xff3b30,
  telegraphRain: 0x9b6cff,
  healingRift: 0x7dffa0,
  addSwarm: 0x7fd14a,
  ventEruption: 0xff7a1f,
  collapsingArena: 0xff5a5a,
};

/** Seeded delay before the first beat can fire (grace period + jitter). */
export function firstCorruptionDelay(world: World): number {
  return CORRUPTION_FIRST_DELAY + world.rng.range(0, CORRUPTION_INTERVAL_JITTER);
}

/** Seconds to the next beat — tightens each endless cycle, floored + jittered. */
function nextDelay(world: World): number {
  const speed = Math.min(0.7, Math.max(0, world.scaling.cycle) * CORRUPTION_CYCLE_SPEEDUP);
  const base = CORRUPTION_INTERVAL * (1 - speed);
  const jitter = world.rng.range(-CORRUPTION_INTERVAL_JITTER, CORRUPTION_INTERVAL_JITTER);
  return Math.max(CORRUPTION_MIN_INTERVAL, base + jitter);
}

/**
 * Advance the corruption scheduler by `dt`. Fires one beat when the timer runs
 * out, then reschedules. No-op while no boss is alive (nothing to corrupt).
 */
export function stepCorruption(world: World, dt: number): void {
  if (world.aliveBosses().length === 0) return;
  world.corruptionTimer -= dt;
  if (world.corruptionTimer > 0) return;
  fireCorruption(world);
  world.corruptionTimer = nextDelay(world);
}

/** Weighted pick of the next beat, avoiding an immediate repeat of the last. */
function pickKind(world: World): KindDef {
  const pool = KINDS.filter((k) => k.kind !== world.lastCorruption);
  const src = pool.length > 0 ? pool : KINDS;
  const total = src.reduce((s, k) => s + k.weight, 0);
  let roll = world.rng.range(0, total);
  for (const k of src) {
    roll -= k.weight;
    if (roll <= 0) return k;
  }
  return src[src.length - 1];
}

function fireCorruption(world: World): void {
  const def = pickKind(world);
  world.lastCorruption = def.kind;
  world.corruptionCount += 1;
  const center = partyCentroid(world);
  world.events.push({
    t: 'corruption',
    kind: def.kind,
    name: NAMES[def.kind],
    pos: center,
    good: def.good,
  });
  switch (def.kind) {
    case 'enrageSurge':
      return enrageSurge(world);
    case 'telegraphRain':
      return telegraphRain(world);
    case 'healingRift':
      return healingRift(world, center);
    case 'addSwarm':
      return addSwarm(world);
    case 'ventEruption':
      return ventEruption(world);
    case 'collapsingArena':
      return collapsingArena(world, center);
  }
}

// ---------------------------------------------------------------------------
// The beats
// ---------------------------------------------------------------------------

/** Every boss briefly roars: a temporary damage + speed empower window. */
function enrageSurge(world: World): void {
  for (const b of world.aliveBosses()) {
    applyBuff(
      b,
      makeBuff('damageDealt', CORRUPTION_SURGE_DMG_MULT, CORRUPTION_SURGE_DURATION, 'corruptSurge'),
    );
    applyBuff(
      b,
      makeBuff(
        'moveSpeed',
        CORRUPTION_SURGE_MOVE_MULT,
        CORRUPTION_SURGE_DURATION,
        'corruptSurgeMv',
      ),
    );
  }
}

/** A scatter of delayed circle strikes rains down near the band — dodge dance. */
function telegraphRain(world: World): void {
  const dmg = CORRUPTION_RAIN_DAMAGE * world.bossDamageScalar();
  for (let i = 0; i < CORRUPTION_RAIN_COUNT; i++) {
    world.addPendingStrike({
      pos: nearParty(world, 300, CORRUPTION_RAIN_RADIUS),
      radius: CORRUPTION_RAIN_RADIUS,
      fuse: CORRUPTION_RAIN_FUSE + world.rng.range(0, 0.6),
      damage: dmg,
      color: COLORS.telegraphRain,
    });
  }
}

/** Hazard vents erupt across the arena, leaving lingering pools (dynamic terrain). */
function ventEruption(world: World): void {
  const dmg = CORRUPTION_VENT_DAMAGE * world.bossDamageScalar();
  const poolTick = CORRUPTION_VENT_POOL_TICK * world.bossDamageScalar();
  for (let i = 0; i < CORRUPTION_VENT_COUNT; i++) {
    world.addPendingStrike({
      pos: randomArenaPoint(world, CORRUPTION_VENT_RADIUS),
      radius: CORRUPTION_VENT_RADIUS,
      fuse: CORRUPTION_VENT_FUSE,
      damage: dmg,
      color: COLORS.ventEruption,
      leaveZone: {
        kind: 'voidZone',
        duration: CORRUPTION_VENT_POOL_DURATION,
        tickDamage: poolTick,
      },
    });
  }
}

/** A ring of strikes closes in around the band, herding it to the centre. */
function collapsingArena(world: World, center: Vec2): void {
  const dmg = CORRUPTION_COLLAPSE_DAMAGE * world.bossDamageScalar();
  const n = CORRUPTION_COLLAPSE_COUNT;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    world.addPendingStrike({
      pos: {
        x: clampAxis(center.x + Math.cos(ang) * CORRUPTION_COLLAPSE_RADIUS, ARENA_W, 120),
        y: clampAxis(center.y + Math.sin(ang) * CORRUPTION_COLLAPSE_RADIUS, ARENA_H, 120),
      },
      radius: 120,
      fuse: CORRUPTION_COLLAPSE_FUSE,
      damage: dmg,
      color: COLORS.collapsingArena,
      slowMult: 0.6,
      slowDuration: 1.5,
    });
  }
}

/** A seeded wave of adds boils up around the arena — a target-priority puzzle. */
function addSwarm(world: World): void {
  const count = addCount(world.scaling.playerCount) + CORRUPTION_SWARM_COUNT;
  world.spawnAddWave({ x: ARENA_W / 2, y: ARENA_H / 2 }, count, {
    hpMult: 0.8,
    minR: 300,
    maxR: 520,
  });
}

/** The benevolent beat: a healing rift blooms just off the band's heart. */
function healingRift(world: World, center: Vec2): void {
  const ang = world.rng.range(0, Math.PI * 2);
  const off = world.rng.range(120, 240);
  spawnZone(world, {
    kind: 'sanctuary',
    pos: {
      x: clampAxis(center.x + Math.cos(ang) * off, ARENA_W, CORRUPTION_RIFT_RADIUS),
      y: clampAxis(center.y + Math.sin(ang) * off, ARENA_H, CORRUPTION_RIFT_RADIUS),
    },
    radius: CORRUPTION_RIFT_RADIUS,
    side: 'player',
    ownerId: 0, // world-owned: heals without threat attribution
    damagePerTick: 0,
    healPerTick: CORRUPTION_RIFT_TICK_HEAL,
    duration: CORRUPTION_RIFT_DURATION,
  });
}

// ---------------------------------------------------------------------------
// Placement helpers
// ---------------------------------------------------------------------------

function clampAxis(v: number, max: number, margin: number): number {
  return Math.min(max - margin, Math.max(margin, v));
}

/** A random point inside the arena, kept `margin` clear of the edges. */
function randomArenaPoint(world: World, margin: number): Vec2 {
  return {
    x: world.rng.range(margin, ARENA_W - margin),
    y: world.rng.range(margin, ARENA_H - margin),
  };
}

/** A point near a random living hero (falls back to the arena centre). */
function nearParty(world: World, spread: number, margin: number): Vec2 {
  const alive = world.players.filter((p) => p.state === 'alive');
  if (alive.length === 0) return { x: ARENA_W / 2, y: ARENA_H / 2 };
  const p = world.rng.pick(alive);
  return {
    x: clampAxis(p.pos.x + world.rng.range(-spread, spread), ARENA_W, margin),
    y: clampAxis(p.pos.y + world.rng.range(-spread, spread), ARENA_H, margin),
  };
}

function partyCentroid(world: World): Vec2 {
  const alive = world.players.filter((p) => p.state === 'alive');
  if (alive.length === 0) return { x: ARENA_W / 2, y: ARENA_H / 2 };
  let x = 0;
  let y = 0;
  for (const p of alive) {
    x += p.pos.x;
    y += p.pos.y;
  }
  return { x: x / alive.length, y: y / alive.length };
}
