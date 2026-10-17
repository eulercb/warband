/** Directional charges and control resistance are separate from percentage mitigation. */
import type { Buff, Player, Vec2 } from '../core/types';
import { sub } from '../core/torus';
export function isSteadfast(entity: { buffs?: Buff[] }): boolean {
  return !!entity.buffs?.some((b) => b.kind === 'steadfast' && b.remaining > 0);
}
export function blockFromFront(p: Player, origin: Vec2 | undefined, damage: number): boolean {
  const guard = p.buffs.find((b) => b.kind === 'frontGuard' && b.remaining > 0 && b.mult > 0);
  if (!guard || !origin || damage <= 0) return false;
  const delta = sub(origin, p.pos);
  const distance = Math.hypot(delta.x, delta.y);
  const aim = Math.hypot(p.aim.x, p.aim.y);
  if (distance < 1e-6 || aim < 1e-6 || delta.x * p.aim.x + delta.y * p.aim.y < distance * aim * 0.5)
    return false;
  guard.mult--;
  if (guard.mult <= 0) p.buffs.splice(p.buffs.indexOf(guard), 1);
  return true;
}
export function cleanseMovement(target: { buffs: Buff[] }): void {
  target.buffs = target.buffs.filter(
    (b) =>
      !(
        b.kind === 'stun' ||
        b.kind === 'root' ||
        b.kind === 'silence' ||
        (b.kind === 'moveSpeed' && b.mult < 1) ||
        (b.kind === 'castSlow' && b.mult > 1)
      ),
  );
}
