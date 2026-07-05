/**
 * Warband — per-run cover obstacles. PURE TS.
 *
 * A small set of solid rubble/pillars laid out once at fight start, seeded from
 * the run seed so the host and every client agree. Obstacles block ranged
 * attacks: any projectile whose path crosses one is absorbed (see world.ts
 * `updateProjectiles`), letting players break line of sight and take cover. They
 * do NOT block movement — you position so an obstacle sits between you and the
 * shooter. Generated to avoid the party spawn strip, the boss's opening spot,
 * each other, and (mostly) the terrain hazards so cover reads cleanly.
 */
import type { Obstacle, Vec2 } from './types';
import { Rng } from './math';
import {
  ARENA_W,
  ARENA_H,
  OBSTACLE_MIN_COUNT,
  OBSTACLE_MAX_COUNT,
  OBSTACLE_MIN_RADIUS,
  OBSTACLE_MAX_RADIUS,
  OBSTACLE_SPAWN_CLEARANCE,
} from './constants';

/** A circle to keep obstacles away from (spawn/boss anchors, terrain patches). */
export interface KeepClear {
  pos: Vec2;
  radius: number;
}

export function generateObstacles(
  seed: number,
  allocId: () => number,
  avoid: KeepClear[],
): Obstacle[] {
  // Dedicated RNG stream (distinct from terrain's) so neither perturbs the other.
  const rng = new Rng((seed ^ 0x85ebca6b) >>> 0);
  const count = rng.int(OBSTACLE_MIN_COUNT, OBSTACLE_MAX_COUNT);

  const spawnAnchor: Vec2 = { x: ARENA_W / 2, y: ARENA_H - 220 };
  const bossAnchor: Vec2 = { x: ARENA_W / 2, y: 300 };

  const obstacles: Obstacle[] = [];
  let attempts = 0;
  while (obstacles.length < count && attempts < count * 16) {
    attempts++;
    const radius = rng.range(OBSTACLE_MIN_RADIUS, OBSTACLE_MAX_RADIUS);
    const pos: Vec2 = {
      x: rng.range(radius, ARENA_W - radius),
      y: rng.range(radius, ARENA_H - radius),
    };
    if (near(pos, spawnAnchor, radius + OBSTACLE_SPAWN_CLEARANCE)) continue;
    if (near(pos, bossAnchor, radius + OBSTACLE_SPAWN_CLEARANCE)) continue;
    if (obstacles.some((o) => near(pos, o.pos, radius + o.radius + 40))) continue;
    if (avoid.some((a) => near(pos, a.pos, radius + a.radius - 20))) continue;
    obstacles.push({ id: allocId(), pos, radius });
  }
  return obstacles;
}

/** Squared-distance proximity test (avoids a sqrt per candidate). */
function near(a: Vec2, b: Vec2, within: number): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy < within * within;
}
