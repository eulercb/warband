/** Small deterministic geometry repair, never a map-wide target search. */
import type { Player, Vec2 } from '../core/types';
import type { World } from '../world/world';
import { dist, sub, wrapPos } from '../core/torus';
export interface CoverCircle {
  pos: Vec2;
  radius: number;
  ownerId: number;
}
export const BULWARK_RADIUS = 48;
// Largest authored boulder: 74u radius + 24u mouth + clearance, rounded to a 12u ring.
export const MOUTH_ADJUST = 108;
function candidates(center: Vec2, aim: Vec2, max: number, reverse = false): Vec2[] {
  const result = [center];
  for (let r = 12; r <= max; r += 12)
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8 + (reverse ? Math.PI : 0),
        x = Math.cos(a) * r,
        y = Math.sin(a) * r;
      result.push(
        wrapPos({ x: center.x + aim.x * x - aim.y * y, y: center.y + aim.y * x + aim.x * y }),
      );
    }
  return result;
}
export function placeAperture(
  w: World,
  p: Player,
  reach: number,
  radius: number,
  covers: CoverCircle[],
  mouths: ReadonlyArray<{ pos: Vec2; radius: number }>,
) {
  const u = p.aim,
    blocks = [...w.obstacles, ...covers.filter((c) => c.ownerId !== p.id)];
  const nominalEntry = wrapPos({ x: p.pos.x + (u.x * reach) / 4, y: p.pos.y + (u.y * reach) / 4 });
  const nominalExit = wrapPos({ x: p.pos.x + u.x * reach, y: p.pos.y + u.y * reach });
  const clear = (v: Vec2, r: number) => !blocks.some((b) => dist(v, b.pos) < r + b.radius + 2);
  const entrances = candidates(nominalEntry, u, MOUTH_ADJUST, true).filter((v) => {
    const d = sub(v, p.pos);
    return d.x * u.x + d.y * u.y > p.radius + 5 && clear(v, radius);
  });
  // Adjustment can extend a nominal endpoint by at most 108u; actual transit still
  // costs the original projectile range and stays inside the arena movement cap.
  const exits = candidates(nominalExit, u, MOUTH_ADJUST).filter(
    (v) =>
      dist(v, p.pos) <=
        Math.min(reach + MOUTH_ADJUST, Math.min(w.arena.w, w.arena.h) * 0.5) + 1e-6 &&
      clear(v, radius),
  );
  let best: { entry: Vec2; exit: Vec2; bulwark?: { pos: Vec2; radius: number } } | undefined,
    score = Infinity;
  for (const entry of entrances)
    for (const exit of exits) {
      const d = sub(exit, entry);
      if (d.x * u.x + d.y * u.y < reach / 2) continue;
      const cost = dist(entry, nominalEntry) ** 2 + dist(exit, nominalExit) ** 2;
      if (cost < score - 1e-6) {
        score = cost;
        best = { entry, exit };
      }
    }
  if (!best) return undefined;
  const delta = sub(best.exit, best.entry),
    mid = wrapPos({ x: best.entry.x + delta.x / 2, y: best.entry.y + delta.y / 2 });
  const bodies = [
    ...w.bosses.filter((b) => b.hp > 0),
    ...w.adds.filter((a) => a.hp > 0),
    ...w.totems,
  ];
  const pos = candidates(mid, u, 24).find(
    (v) =>
      clear(v, BULWARK_RADIUS) &&
      dist(v, best.entry) > BULWARK_RADIUS + radius + 2 &&
      dist(v, best.exit) > BULWARK_RADIUS + radius + 2 &&
      ![...bodies, ...mouths].some((b) => dist(v, b.pos) < BULWARK_RADIUS + b.radius + 2),
  );
  if (pos) best.bulwark = { pos, radius: BULWARK_RADIUS };
  return best;
}
