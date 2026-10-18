/** Endpoint-based teleportation, never a collision-driven shove. */
import type { World } from '../world/world';
import type { Player, Vec2 } from '../core/types';
import { dist, sub, wrapCoord } from '../core/torus';
import { applyBuff, isRooted, makeBuff } from './combat';
import { isSteadfast } from './defense';

export function dimensionDoor(
  world: World,
  player: Player,
  destination: Vec2,
  radius: number,
): void {
  const origin = { ...player.pos };
  const wrap = (pos: Vec2): Vec2 => ({
    x: wrapCoord(pos.x, world.arena.w),
    y: wrapCoord(pos.y, world.arena.h),
  });
  const end = wrap(destination);
  const enemies = [...world.bosses, ...world.adds].filter((e) => e.hp > 0);
  const bodies = [...world.players.filter((p) => p.state !== 'dead'), ...enemies];
  const solids = [...world.obstacles, ...world.totems];
  // Snapshot membership before anyone moves. Arrival takes priority when circles overlap;
  // each enemy is processed once, in stable ID order, independently of array order.
  const caught = enemies
    .map((enemy) => ({ enemy, from: { ...enemy.pos }, arrival: dist(enemy.pos, end) <= radius }))
    .filter(({ enemy, arrival }) => arrival || dist(enemy.pos, origin) <= radius)
    .sort((a, b) => Number(a.arrival) - Number(b.arrival) || a.enemy.id - b.enemy.id);
  const landing = (
    body: { pos: Vec2; radius: number },
    desired: Vec2,
    allowed: (pos: Vec2) => boolean = () => true,
  ): Vec2 | null => {
    const clear = (pos: Vec2): boolean =>
      [...solids, ...bodies].every(
        (other) => other === body || dist(pos, other.pos) >= body.radius + other.radius + 4,
      );
    // Nearest deterministic legal pocket. Only endpoints collide: cover between the
    // endpoints does not stop a teleport. Bounded search fails safely in crowded cover.
    for (let ring = 0; ring <= 10; ring++) {
      for (let spoke = 0; spoke < (ring === 0 ? 1 : 16); spoke++) {
        const angle = (spoke * Math.PI * 2) / 16;
        const pos = wrap({
          x: desired.x + Math.cos(angle) * ring * 24,
          y: desired.y + Math.sin(angle) * ring * 24,
        });
        if (allowed(pos) && clear(pos)) return pos;
      }
    }
    return null;
  };
  // Reserve the player's intended arrival while finding enemy pockets, and free
  // the departure point so a centered enemy can truly exchange places with them.
  player.pos = end;
  const moved: Array<{ enemy: (typeof enemies)[number]; from: Vec2 }> = [];
  for (const { enemy, from, arrival } of caught) {
    if (isRooted(enemy) || isSteadfast(enemy)) continue;
    const delta = sub(from, arrival ? end : origin);
    const length = Math.hypot(delta.x, delta.y);
    const angle =
      length > 0.001 ? Math.atan2(delta.y, delta.x) : Math.atan2(player.aim.y, player.aim.x);
    const distance = arrival ? length : Math.max(length + 100, radius + enemy.radius + 12);
    const to = landing(
      enemy,
      {
        x: origin.x + Math.cos(angle) * distance,
        y: origin.y + Math.sin(angle) * distance,
      },
      (pos) => {
        if (arrival) return true;
        const outward = sub(pos, origin);
        return (
          dist(pos, origin) >= distance &&
          outward.x * Math.cos(angle) + outward.y * Math.sin(angle) > 0
        );
      },
    );
    if (!to || dist(to, from) < 1) continue;
    enemy.pos = to;
    moved.push({ enemy, from });
  }
  const playerLanding = landing(player, end);
  if (!playerLanding) {
    // No partial cast: restore the endpoint snapshot if the caster cannot land.
    for (const { enemy, from } of moved) enemy.pos = from;
    player.pos = origin;
    return;
  }
  for (const { enemy, from } of moved) {
    enemy.shove = null;
    applyBuff(enemy, makeBuff('moveSpeed', 0.65, 2, 'dimensionDisorient'));
    world.events.push({ t: 'blink', id: enemy.id, from, to: { ...enemy.pos } });
  }
  player.pos = playerLanding;
  player.shove = null;
  player.glide = null;
}
