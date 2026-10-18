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

/** Images intercept direct contact before absorption; immunity/front blocks preserve them. */
export function mirrorDamage(p: Player, origin: Vec2 | undefined, damage: number): number {
  if (!origin || damage <= 0) return damage;
  const images = p.buffs.find((b) => b.kind === 'mirrorImages' && b.remaining > 0 && b.mult > 0);
  if (!images) return damage;
  images.mult--;
  if (images.mult <= 0) p.buffs.splice(p.buffs.indexOf(images), 1);
  return damage * 0.4;
}

/** One shared frontal guard; a weaker cast cannot erase or add to stronger blocks. */
export function grantFrontGuard(p: Player, charges: number, duration: number): void {
  const old = p.buffs.find((b) => b.kind === 'frontGuard' && b.remaining > 0 && b.mult > 0);
  if (old && (old.mult > charges || (old.mult === charges && old.remaining >= duration))) return;
  p.buffs = p.buffs.filter((b) => b.kind !== 'frontGuard');
  p.buffs.push({ kind: 'frontGuard', mult: charges, remaining: duration, source: 'frontGuard' });
}
