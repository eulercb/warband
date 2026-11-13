import { PROJECTILE_MAX_RANGE } from '../core/constants';
export const RETURNING_DAMAGE_PER_LEG = 0.6;
export const RETURNING_DAMAGE_TEXT = `${Math.round(RETURNING_DAMAGE_PER_LEG * 100)}% damage per leg (${Math.round(RETURNING_DAMAGE_PER_LEG * 200)}% if both legs hit)`;
/** Keep ordinary offensive reach, then provide a separate short return. */
export function returningTrajectory(range: number, speed: number) {
  const outward = Math.max(0, Math.min(range, speed * 3));
  const backRange = Math.min(outward * 1.5, outward + 360);
  const backSpeed = Math.max(speed * 1.5, outward * 2);
  return {
    outward,
    backRange,
    backSpeed,
    backLifetime: backSpeed > 0 ? backRange / backSpeed + 0.05 : 0.05,
  };
}
export function returningShotFits(kind: string, impactRadius = 0, zone = false): boolean {
  return kind === 'projectile' && impactRadius <= 0 && !zone;
}
export function returningShotDescription(range = PROJECTILE_MAX_RANGE, speed = 600): string {
  const d = returningTrajectory(Math.min(range, 900), speed).outward;
  return `flies up to ${Math.round(d)}u outward, then returns quickly toward your current position; ${RETURNING_DAMAGE_TEXT}, normal piercing on each leg; cover stops either leg`;
}
