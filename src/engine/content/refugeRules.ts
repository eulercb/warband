import type { PlayerAbilityDef } from './classes';
export const REFUGE_TEXT =
  'a refuge for up to 4s and 180u; repels enemies inside and blocks entry, including flyers; allies and attacks cross freely; one refuge per owner';
export function refugeField(ab: Omit<PlayerAbilityDef, 'slot'> & { slot?: string }): boolean {
  return (
    ab.slot !== 'basic' &&
    ab.kind === 'groundZone' &&
    (ab.zoneTickHeal ?? 0) > 0 &&
    !ab.zoneFollow &&
    (ab.components
      ? ab.components.delivery.kind === 'groundZone' &&
        ab.components.effects.some((e) => e.kind === 'refuge') &&
        ab.components.effects.some(
          (e) => e.kind === 'zone' && (e.zone.tickHeal ?? 0) > 0 && !e.zone.zoneFollow,
        )
      : !!ab.refuge)
  );
}
