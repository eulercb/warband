import type { PlayerAbilityDef } from './classes';
export const FONT_TEXT = (family: 'sanctuary' | 'bloom') =>
  `one ${family === 'sanctuary' ? 'area' : 'single-ally'} rescue attempt per owner per encounter, separate from the other font; ${family === 'sanctuary' ? 'all downed allies' : 'one downed ally'} inside consume this field for a 3s revive channel without shared revive stock; can rescue you`;
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
