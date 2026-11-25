export const FLURRY_STRIKES = 3;
export const FLURRY_INTERVAL = 0.105;
export const FLURRY_SHARE = 0.36;
export const FOCUSED_FLURRY_STRIKES = 5;
export const FOCUSED_FLURRY_SHARE = 0.216;
export const FOCUSED_FLURRY_HALF_WIDTH = 21;

export function flurryDamageText(
  damage: number,
  focused: boolean,
  format: (value: number) => string,
): string {
  return focused
    ? `${FOCUSED_FLURRY_STRIKES} alternating palms for ${format(damage * FOCUSED_FLURRY_SHARE)} dmg each`
    : `${FLURRY_STRIKES} alternating palms for ${format(damage * FLURRY_SHARE)} dmg each`;
}
