import type { PlayerAbilityDef } from './classes';
export const GUIDANCE_DURATION = 1.25;
export const GUIDANCE_TURN_RATE = Math.PI;
export const GUIDANCE_TEXT =
  'steer the latest projectile spell with live aim for up to 1.25s after launch, at 180°/s; newer launches take control';
export function guidedSpell(ab: Omit<PlayerAbilityDef, 'slot'> & { slot?: string }): boolean {
  return (
    ab.kind === 'projectile' &&
    ab.slot !== 'basic' &&
    ab.damage > 0 &&
    !ab.returningShot &&
    (ab.components
      ? ab.components.delivery.kind === 'projectile' &&
        !ab.components.effects.some((e) => e.kind === 'returningShot') &&
        ab.components.effects.some((e) => e.kind === 'guidedShot')
      : !!ab.guidedShot)
  );
}
