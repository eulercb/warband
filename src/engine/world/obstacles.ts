/**
 * Warband — per-run PROCEDURAL cover obstacles. PURE TS.
 *
 * Solid rubble/pillars/crystals laid out once at fight start, seeded from the
 * run seed so the host and every client agree. Obstacles block ranged attacks
 * — any projectile whose path crosses one is absorbed (see world.ts
 * `updateProjectiles`) — AND movement (world.separateAndClamp ejects movers),
 * so players can break line of sight and body-block.
 *
 * Collision stays circular for every obstacle; the variety comes from two
 * axes: a LAYOUT ARCHETYPE (scattered boulders, a broken wall of touching
 * stones, a henge ring, a spiral, twin bulwarks) that composes many circles
 * into readable structures, and a per-obstacle visual `kind` (rock / pillar /
 * crystal / stump / monolith) that the renderer draws with a matching
 * silhouette. Generated to avoid the party spawn strip, the boss's opening
 * spot, and (mostly) the terrain hazards so cover reads cleanly.
 */
import type { Obstacle, ObstacleKind, Vec2 } from '../core/types';
import { Rng } from '../core/math';
import {
  ARENA_W,
  ARENA_H,
  OBSTACLE_MIN_RADIUS,
  OBSTACLE_MAX_RADIUS,
  OBSTACLE_SPAWN_CLEARANCE,
} from '../core/constants';

/** A circle to keep obstacles away from (spawn/boss anchors, terrain patches). */
export interface KeepClear {
  pos: Vec2;
  radius: number;
}

/** How this run's cover is arranged. Rolled from the seed. */
export type ObstacleLayout = 'scatter' | 'wall' | 'henge' | 'spiral' | 'bulwarks';

const LAYOUTS: ObstacleLayout[] = ['scatter', 'wall', 'henge', 'spiral', 'bulwarks'];

/** Visual silhouettes weighted per layout (collision is always the circle). */
const KIND_POOLS: Record<ObstacleLayout, ObstacleKind[]> = {
  scatter: ['rock', 'rock', 'stump', 'crystal'],
  wall: ['rock', 'rock', 'monolith'],
  henge: ['monolith', 'pillar', 'monolith'],
  spiral: ['crystal', 'crystal', 'rock'],
  bulwarks: ['pillar', 'rock', 'monolith'],
};

/** Hard cap so structured layouts can't flood the arena with cover. */
export const OBSTACLE_HARD_CAP = 9;

const SPAWN_ANCHOR: Vec2 = { x: ARENA_W / 2, y: ARENA_H - 220 };
const BOSS_ANCHOR: Vec2 = { x: ARENA_W / 2, y: 300 };

export function generateObstacles(
  seed: number,
  allocId: () => number,
  avoid: KeepClear[],
): Obstacle[] {
  // Dedicated RNG stream (distinct from terrain's) so neither perturbs the other.
  const rng = new Rng((seed ^ 0x85ebca6b) >>> 0);
  const layout = LAYOUTS[rng.int(0, LAYOUTS.length - 1)];
  const kinds = KIND_POOLS[layout];

  const anchors = layoutAnchors(rng, layout);
  const obstacles: Obstacle[] = [];
  for (const a of anchors) {
    if (obstacles.length >= OBSTACLE_HARD_CAP) break;
    if (near(a.pos, SPAWN_ANCHOR, a.radius + OBSTACLE_SPAWN_CLEARANCE)) continue;
    if (near(a.pos, BOSS_ANCHOR, a.radius + OBSTACLE_SPAWN_CLEARANCE)) continue;
    // Structured layouts may touch each other by design; only scatter keeps
    // stones apart, and every layout stays out of the terrain hazards.
    if (layout === 'scatter' && obstacles.some((o) => near(a.pos, o.pos, a.radius + o.radius + 40)))
      continue;
    if (avoid.some((k) => near(a.pos, k.pos, a.radius + k.radius - 20))) continue;
    obstacles.push({
      id: allocId(),
      pos: a.pos,
      radius: a.radius,
      kind: kinds[rng.int(0, kinds.length - 1)],
      variant: rng.int(0, 0xffff),
    });
  }
  return obstacles;
}

/** Candidate positions/radii for a cover layout archetype. */
function layoutAnchors(rng: Rng, layout: ObstacleLayout): Array<{ pos: Vec2; radius: number }> {
  const out: Array<{ pos: Vec2; radius: number }> = [];
  const rr = (lo: number, hi: number): number => rng.range(lo, hi);

  switch (layout) {
    case 'scatter': {
      // The classic look: 2-4 independent boulders.
      const count = rng.int(2, 4);
      for (let i = 0; i < count * 5 && out.length < count; i++) {
        const radius = rr(OBSTACLE_MIN_RADIUS, OBSTACLE_MAX_RADIUS);
        out.push({
          pos: { x: rr(radius, ARENA_W - radius), y: rr(radius, ARENA_H - radius) },
          radius,
        });
      }
      break;
    }
    case 'wall': {
      // A broken rampart: a line of touching stones with a doorway knocked out.
      const n = rng.int(4, 6);
      const gapAt = rng.int(1, n - 2);
      const angle = rr(-0.5, 0.5) + (rng.next() < 0.5 ? 0 : Math.PI / 2);
      const cx = rr(ARENA_W * 0.3, ARENA_W * 0.7);
      const cy = rr(ARENA_H * 0.35, ARENA_H * 0.65);
      const link = rr(OBSTACLE_MIN_RADIUS * 0.9, OBSTACLE_MIN_RADIUS * 1.2);
      for (let i = 0; i < n; i++) {
        if (i === gapAt) continue; // the doorway
        const t = (i - (n - 1) / 2) * link * 1.9;
        out.push({
          pos: {
            x: contain(cx + Math.cos(angle) * t, link, ARENA_W),
            y: contain(cy + Math.sin(angle) * t, link, ARENA_H),
          },
          radius: link * rr(0.9, 1.1),
        });
      }
      break;
    }
    case 'henge': {
      // A ring of standing stones with wide gaps — cover in every direction,
      // sightlines through the gaps.
      const cx = ARENA_W / 2 + rr(-150, 150);
      const cy = ARENA_H / 2 + rr(-90, 90);
      const ringR = rr(210, 300);
      const n = rng.int(4, 6);
      for (let i = 0; i < n; i++) {
        if (rng.next() < 0.18) continue;
        const ang = (i / n) * Math.PI * 2 + rr(-0.12, 0.12);
        const radius = rr(OBSTACLE_MIN_RADIUS * 0.8, OBSTACLE_MIN_RADIUS * 1.15);
        out.push({
          pos: {
            x: contain(cx + Math.cos(ang) * ringR, radius, ARENA_W),
            y: contain(cy + Math.sin(ang) * ringR, radius, ARENA_H),
          },
          radius,
        });
      }
      break;
    }
    case 'spiral': {
      // Crystals spiraling out from a focus — dense cover near the eye,
      // sparse at the rim.
      const cx = rr(ARENA_W * 0.3, ARENA_W * 0.7);
      const cy = rr(ARENA_H * 0.35, ARENA_H * 0.65);
      const n = rng.int(5, 7);
      const start = rr(0, Math.PI * 2);
      for (let i = 0; i < n; i++) {
        const ang = start + i * 1.9; // golden-ish step
        const d = 70 + i * rr(52, 70);
        const radius = rr(OBSTACLE_MIN_RADIUS * 0.7, OBSTACLE_MIN_RADIUS * 1.0);
        out.push({
          pos: {
            x: contain(cx + Math.cos(ang) * d, radius, ARENA_W),
            y: contain(cy + Math.sin(ang) * d, radius, ARENA_H),
          },
          radius,
        });
      }
      break;
    }
    case 'bulwarks': {
      // Two short parallel walls flanking the midfield — trench warfare.
      const vertical = rng.next() < 0.5;
      const off = rr(190, 280);
      for (const side of [-1, 1]) {
        const n = rng.int(2, 3);
        const cx = ARENA_W / 2 + (vertical ? side * off : rr(-120, 120));
        const cy = ARENA_H / 2 + (vertical ? rr(-90, 90) : side * off);
        const link = rr(OBSTACLE_MIN_RADIUS * 0.95, OBSTACLE_MIN_RADIUS * 1.25);
        for (let i = 0; i < n; i++) {
          const t = (i - (n - 1) / 2) * link * 2.0;
          out.push({
            pos: {
              x: contain(cx + (vertical ? 0 : t), link, ARENA_W),
              y: contain(cy + (vertical ? t : 0), link, ARENA_H),
            },
            radius: link,
          });
        }
      }
      break;
    }
  }
  return out;
}

/** Keep an obstacle fully inside the arena. */
function contain(v: number, radius: number, max: number): number {
  const margin = radius + 6;
  return Math.min(max - margin, Math.max(margin, v));
}

/** Squared-distance proximity test (avoids a sqrt per candidate). */
function near(a: Vec2, b: Vec2, within: number): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy < within * within;
}
