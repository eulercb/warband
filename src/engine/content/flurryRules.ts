export const FLURRY_STRIKES = 3;
export const FLURRY_INTERVAL = 0.075;
export const FLURRY_SHARE = 0.36;
export const WHIRLING_FIST_SHARE = 0.54;

export function flurryDamageText(
  damage: number,
  fullTurn: boolean,
  format: (value: number) => string,
): string {
  return fullTurn
    ? `two passing fists for ${format(damage * WHIRLING_FIST_SHARE)} dmg each`
    : `${FLURRY_STRIKES} alternating palms for ${format(damage * FLURRY_SHARE)} dmg each`;
}
