/** Local detours for temporary cover, not a replacement for arena navigation. */
import type { Vec2 } from '../core/types';
import type { World } from '../world/world';
import { apertureBulwarks, circleEntry, dissolveBulwark } from './infernalAperture';
import { dist, sub, wrapPos } from '../core/torus';
interface Body {
  id: number;
  pos: Vec2;
  radius: number;
  charm?: unknown;
}
const routes = new WeakMap<Body, { owner: number; side: number; last: Vec2; stalled: number }>();
export function clipBulwarkStep(
  w: World,
  body: { pos: Vec2; radius: number },
  to: Vec2,
): { pos: Vec2; stopped: boolean } {
  let first = 1,
    stopped = false;
  for (const c of apertureBulwarks(w)) {
    const t = circleEntry(body.pos, to, c.pos, c.radius + body.radius);
    if (t !== null && t <= first) {
      first = t;
      stopped = true;
    }
  }
  if (!stopped) return { pos: wrapPos(to), stopped: false };
  return {
    pos: wrapPos({
      x: body.pos.x + (to.x - body.pos.x) * Math.max(0, first - 1e-7),
      y: body.pos.y + (to.y - body.pos.y) * Math.max(0, first - 1e-7),
    }),
    stopped,
  };
}
export function walkAroundBulwarks(w: World, body: Body, desired: Vec2, dt: number): Vec2 {
  if (body.charm) return wrapPos(desired);
  const covers = apertureBulwarks(w);
  const hit = covers.find(
    (c) => circleEntry(body.pos, desired, c.pos, c.radius + body.radius + 2) !== null,
  );
  if (!hit) {
    routes.delete(body);
    return wrapPos(desired);
  }
  const previous = routes.get(body),
    same = previous?.owner === hit.ownerId;
  const stalled = same && dist(body.pos, previous.last) < 0.1 ? previous.stalled + dt : 0;
  const side = same ? previous.side : body.id % 2 === 0 ? 1 : -1;
  routes.set(body, { owner: hit.ownerId, side, last: { ...body.pos }, stalled });
  const delta = sub(desired, body.pos),
    length = Math.hypot(delta.x, delta.y),
    angle = Math.atan2(delta.y, delta.x);
  if (stalled < 0.35)
    for (const sign of [side, -side])
      for (const turn of [Math.PI / 4, (Math.PI * 3) / 8, Math.PI / 2, (Math.PI * 5) / 8]) {
        const candidate = {
          x: body.pos.x + Math.cos(angle + sign * turn) * length,
          y: body.pos.y + Math.sin(angle + sign * turn) * length,
        };
        if (
          [...w.obstacles, ...covers].some(
            (c) => circleEntry(body.pos, candidate, c.pos, c.radius + body.radius + 1) !== null,
          )
        )
          continue;
        routes.set(body, { owner: hit.ownerId, side: sign, last: { ...body.pos }, stalled });
        return wrapPos(candidate);
      }
  // Never manufacture an indefinite pin in a crowded corner or actor pile-up.
  dissolveBulwark(w, hit.ownerId);
  routes.delete(body);
  return wrapPos(desired);
}
