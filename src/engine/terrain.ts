/**
 * Warband — per-run terrain generation. PURE TS.
 *
 * Terrain is a small set of static, themed environmental hazards laid out once
 * at fight start. It is generated deterministically from the run seed so the
 * host and every client agree without extra syncing, and it is themed by the
 * boss: magma in the dragon's lair, swamp in the troll's forest, cursed ice and
 * death-fog in the lich's crypt. Patches slow and/or damage players who stand
 * in them (see world.ts `updateTerrain`), turning the flat arena into a
 * positioning puzzle.
 */
import type { MonsterId, TerrainKind, TerrainPatch, Vec2 } from './types';
import { Rng } from './math';
import {
  ARENA_W,
  ARENA_H,
  TERRAIN_MIN_PATCHES,
  TERRAIN_MAX_PATCHES,
  TERRAIN_MIN_RADIUS,
  TERRAIN_MAX_RADIUS,
  TERRAIN_SPAWN_CLEARANCE,
  TERRAIN_TICK_INTERVAL,
} from './constants';

/** Static balance profile for one terrain kind (per-tick = per 0.5s). */
interface TerrainProfile {
  kind: TerrainKind;
  damagePerTick: number; // to players inside
  slowMult: number; // moveSpeed mult while inside (1 = none)
  slowDuration: number; // s the slow lingers after leaving
  /** Relative selection weight within a theme. */
  weight: number;
}

const PROFILES: Record<TerrainKind, TerrainProfile> = {
  magma: { kind: 'magma', damagePerTick: 9, slowMult: 0.6, slowDuration: 1.2, weight: 3 },
  ember: { kind: 'ember', damagePerTick: 0, slowMult: 0.7, slowDuration: 1.0, weight: 2 },
  swamp: { kind: 'swamp', damagePerTick: 4, slowMult: 0.5, slowDuration: 1.6, weight: 3 },
  bog: { kind: 'bog', damagePerTick: 0, slowMult: 0.45, slowDuration: 1.8, weight: 2 },
  ice: { kind: 'ice', damagePerTick: 0, slowMult: 0.5, slowDuration: 0.6, weight: 3 },
  deathfog: { kind: 'deathfog', damagePerTick: 6, slowMult: 0.85, slowDuration: 1.0, weight: 2 },
};

/** Which terrain kinds each boss's arena is themed with. */
const THEMES: Record<MonsterId, TerrainKind[]> = {
  dragon: ['magma', 'ember'],
  troll: ['swamp', 'bog'],
  lich: ['ice', 'deathfog'],
};

/** Weighted pick of a terrain kind from a theme list. */
function pickKind(rng: Rng, kinds: TerrainKind[]): TerrainKind {
  const total = kinds.reduce((s, k) => s + PROFILES[k].weight, 0);
  let roll = rng.range(0, total);
  for (const k of kinds) {
    roll -= PROFILES[k].weight;
    if (roll <= 0) return k;
  }
  return kinds[kinds.length - 1];
}

/**
 * Build the terrain for one run. `seed` is the run seed; `allocId` mints entity
 * ids from the World so terrain shares the id space with everything else. The
 * boss's opening position and the party's spawn strip are kept clear so nobody
 * starts inside a hazard.
 */
export function generateTerrain(
  monsterId: MonsterId,
  seed: number,
  allocId: () => number,
): TerrainPatch[] {
  // Dedicated RNG derived from the run seed so terrain layout is reproducible
  // on clients and does NOT perturb the world's own RNG stream.
  const rng = new Rng((seed ^ 0x9e3779b9) >>> 0);
  const kinds = THEMES[monsterId];
  const count = rng.int(TERRAIN_MIN_PATCHES, TERRAIN_MAX_PATCHES);

  // Reserved keep-clear anchors: party spawn strip (bottom center) + boss start.
  const spawnAnchor: Vec2 = { x: ARENA_W / 2, y: ARENA_H - 220 };
  const bossAnchor: Vec2 = { x: ARENA_W / 2, y: 300 };

  const patches: TerrainPatch[] = [];
  let attempts = 0;
  while (patches.length < count && attempts < count * 12) {
    attempts++;
    const radius = rng.range(TERRAIN_MIN_RADIUS, TERRAIN_MAX_RADIUS);
    const pos: Vec2 = {
      x: rng.range(radius, ARENA_W - radius),
      y: rng.range(radius, ARENA_H - radius),
    };
    // Skip if it would smother a spawn/boss anchor or overlap an existing patch.
    if (near(pos, spawnAnchor, radius + TERRAIN_SPAWN_CLEARANCE)) continue;
    if (near(pos, bossAnchor, radius + TERRAIN_SPAWN_CLEARANCE)) continue;
    if (patches.some((p) => near(pos, p.pos, radius + p.radius - 30))) continue;

    const profile = PROFILES[pickKind(rng, kinds)];
    patches.push({
      id: allocId(),
      kind: profile.kind,
      pos,
      radius,
      damagePerTick: profile.damagePerTick,
      slowMult: profile.slowMult,
      slowDuration: profile.slowDuration,
      tickAccum: 0,
    });
  }
  return patches;
}

/** Squared-distance proximity test (avoids a sqrt per candidate). */
function near(a: Vec2, b: Vec2, within: number): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy < within * within;
}

export { TERRAIN_TICK_INTERVAL };
