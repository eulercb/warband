import type { PlayerAbilityDef } from './classes';
export const FONT_TEXT =
  'one rescue attempt per owner per encounter; a downed ally inside consumes this field and receives a normal 3s revive channel, using normal revive stock; the caster can be rescued too';
export function revivalFont(ab: Omit<PlayerAbilityDef, 'slot'> & { slot?: string }): boolean {
  return (
    ab.kind === 'groundZone' &&
    ab.slot !== 'basic' &&
    (ab.zoneTickHeal ?? 0) > 0 &&
    (ab.components
      ? ab.components.delivery.kind === 'groundZone' &&
        ab.components.effects.some((e) => e.kind === 'revivalFont') &&
        ab.components.effects.some((e) => e.kind === 'zone' && (e.zone.tickHeal ?? 0) > 0)
      : !!ab.revivalFont)
  );
}
