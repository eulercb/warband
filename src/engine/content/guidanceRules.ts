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

export const GUIDED_BURST_SPEED = 240;
export const GUIDED_BURST_RANGE = 300;
export const GUIDED_BURST_MIN = 0.2;
export const GUIDED_BURST_PREMIUM = 1.15;
export const GUIDED_BURST_TEXT =
  'steer one burst nucleus at 240u/s for up to 1.25s and 300u; press again to detonate (minimum 0.20s, early presses queue); one final burst deals +15% damage';
export const GUIDE_RELAY_TEXT =
  'a fresh successful Blink gathers and redirects your latest guided spell once; relocation spends its remaining travel, with no time reset; insufficient travel leaves the spell in place';
export function guidedBurstFits(ab: Omit<PlayerAbilityDef, 'slot'> & { slot?: string }): boolean {
  return (
    ab.kind === 'pbaoe' &&
    ab.slot !== 'basic' &&
    ab.damage > 0 &&
    !ab.shadowCommit &&
    !ab.palmSweep &&
    !ab.ancestralRelay &&
    !ab.infernalClaim &&
    !ab.shadowReprise &&
    !ab.infernalAperture
  );
}
export function guidedBurst(ab: Omit<PlayerAbilityDef, 'slot'> & { slot?: string }): boolean {
  return (
    guidedBurstFits(ab) &&
    (ab.components
      ? ab.components.delivery.kind === 'pbaoe' &&
        ab.components.effects.some((e) => e.kind === 'guidedBurst') &&
        !ab.components.effects.some(
          (e) =>
            [
              'shadowCommit',
              'palmSweep',
              'ancestralRelay',
              'shadowReprise',
              'infernalAperture',
            ].includes(e.kind) ||
            (e.kind === 'skillContract' && e.contract.infernalClaim),
        )
      : !!ab.guidedBurst)
  );
}
export function guideRelay(ab: Omit<PlayerAbilityDef, 'slot'>): boolean {
  return (
    ab.kind === 'blink' &&
    (ab.components
      ? ab.components.delivery.kind === 'blink' &&
        ab.components.effects.some((e) => e.kind === 'guideRelay')
      : !!ab.guideRelay)
  );
}
