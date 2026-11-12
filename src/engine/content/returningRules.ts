/** A fixed two-leg damage budget, steered only by the owner's real position. */
export const RETURNING_DISTANCE = 360;
export function returningShotFits(kind: string, impactRadius = 0, zone = false): boolean {
  return kind === 'projectile' && impactRadius <= 0 && !zone;
}
export const RETURNING_SHOT_TEXT =
  'returns toward your current position after at most 360u outward (half its travel cap on shorter shots); 50% damage per leg, normal piercing on each leg; cover stops either leg';
