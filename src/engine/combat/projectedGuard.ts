/** Swept projected-shield contact, ordered against bodies and cover on the same shot path. */
import type { Buff, Player, Projectile, Vec2 } from '../core/types';
import type { World } from '../world/world';
import { sub, wrapPos } from '../core/torus';
import { apertureBulwarks } from './infernalAperture';
import { consumeFrontGuard } from './defense';
import { onGuardedDamage } from './martial';
const EPS = 1e-7;

function circleTime(origin: Vec2, step: Vec2, radius: number): number | undefined {
  const c = origin.x * origin.x + origin.y * origin.y - radius * radius;
  if (c <= 0) return 0;
  const a = step.x * step.x + step.y * step.y;
  if (a < EPS) return undefined;
  const b = origin.x * step.x + origin.y * step.y;
  const d = b * b - a * c;
  if (d < 0) return undefined;
  const t = (-b - Math.sqrt(d)) / a;
  return t >= 0 && t <= 1 ? t : undefined;
}
function shieldTime(
  p: Player,
  guard: Buff,
  shot: Projectile,
  from: Vec2,
  step: Vec2,
): number | undefined {
  const shape = guard.projectedGuard!;
  const length = Math.hypot(p.aim.x, p.aim.y);
  if (length < EPS) return undefined;
  const nx = p.aim.x / length,
    ny = p.aim.y / length;
  if (shot.vel.x * nx + shot.vel.y * ny >= 0) return undefined;
  const rel = sub(from, p.pos);
  const start = { x: rel.x * nx + rel.y * ny - shape.reach, y: -rel.x * ny + rel.y * nx };
  const delta = { x: step.x * nx + step.y * ny, y: -step.x * ny + step.y * nx };
  const r = shot.hitRadius;
  if (start.x < -r) return undefined; // already behind the projected face
  const candidates: number[] = [];
  for (const end of [-shape.halfWidth, shape.halfWidth]) {
    const t = circleTime({ x: start.x, y: start.y - end }, delta, r);
    if (t !== undefined) candidates.push(t);
  }
  if (Math.abs(start.y) <= shape.halfWidth && Math.abs(start.x) <= r) candidates.push(0);
  if (delta.x < -EPS) {
    const t = (r - start.x) / delta.x;
    if (t >= 0 && t <= 1 && Math.abs(start.y + delta.y * t) <= shape.halfWidth) candidates.push(t);
  }
  return candidates.length ? Math.min(...candidates) : undefined;
}
type Contact =
  | { t: number; kind: 'shield'; player: Player; guard: Buff }
  | { t: number; kind: 'body'; player: Player }
  | { t: number; kind: 'cover' };

/** Returns false when no projected shield intersects: ordinary projectile routing stays authoritative. */
export function sweepProjectedGuard(w: World, shot: Projectile, from: Vec2): boolean {
  if (w.scene !== null || shot.side !== 'boss' || shot.damage <= 0) return false;
  // The projectile's new position is not wrapped until after collision resolution.
  const step = { x: shot.pos.x - from.x, y: shot.pos.y - from.y };
  let hit: Contact | undefined;
  for (const p of w.players) {
    if (p.state !== 'alive' || p.hp <= 0) continue;
    const guard = p.buffs.find(
      (b) =>
        b.kind === 'frontGuard' &&
        b.remaining > 0 &&
        b.mult > 0 &&
        b.projectedGuard &&
        b.projectedGuardClass === p.classId,
    );
    if (!guard) continue;
    const t = shieldTime(p, guard, shot, from, step);
    if (
      t !== undefined &&
      (!hit ||
        t < hit.t - EPS ||
        (Math.abs(t - hit.t) <= EPS && hit.kind === 'shield' && p.id < hit.player.id))
    )
      hit = { t, kind: 'shield', player: p, guard };
  }
  if (!hit) return false;
  // A shield cannot save someone whose body was reached first, nor spend behind cover.
  for (const cover of [...w.obstacles, ...apertureBulwarks(w)]) {
    const t = circleTime(sub(from, cover.pos), step, cover.radius + shot.hitRadius);
    if (t !== undefined && t <= hit.t) hit = { t, kind: 'cover' };
  }
  for (const p of w.players) {
    if (p.state !== 'alive') continue;
    const t = circleTime(sub(from, p.pos), step, p.radius + shot.hitRadius);
    if (
      t !== undefined &&
      (t < hit.t - EPS ||
        (Math.abs(t - hit.t) <= EPS &&
          hit.kind !== 'cover' &&
          (hit.kind === 'shield' || p.id < hit.player.id)))
    )
      hit = { t, kind: 'body', player: p };
  }
  const contact = wrapPos({ x: from.x + step.x * hit.t, y: from.y + step.y * hit.t });
  shot.pos = contact;
  if (hit.kind === 'body') w.resolveHostileContact(shot, hit.player);
  else if (hit.kind === 'shield') {
    // Interception is a physical guarded contact even when the owner has i-frames.
    consumeFrontGuard(hit.player, hit.guard, 1.3);
    onGuardedDamage(hit.player);
    w.events.push({
      t: 'support',
      sourceId: hit.player.id,
      targetId: hit.player.id,
      from: { ...hit.player.pos },
      pos: contact,
      kind: 'protect',
    });
  }
  return true;
}
