import type { AbilityKind } from './classes';
export const BLOOD_PRICE = 0.02;
export const BLOOD_LEECH = 0.2;
export const HUNT_STEP = 120;
export const FLOW_EXTENSION_CAP = 1;
export function flowPayoff(kind: AbilityKind): string {
  if (kind === 'projectile') return 'spend Flow for no wind-up and at least 0.6s stun on hit';
  if (kind === 'groundZone')
    return 'spend Flow for no wind-up, +35u radius and slow to 60% for at least 0.8s';
  return kind === 'meleeCone'
    ? 'spend Flow for no wind-up and +30u cone reach'
    : 'spend Flow for no wind-up and +35u burst radius';
}

/** Name only the geometry and payload that the receiving finisher actually uses. */
export function momentumPayoff(kind: AbilityKind): string {
  if (kind === 'meleeCone') return 'spend Momentum for +10% damage and +8u reach per stack';
  if (kind === 'groundZone')
    return 'spend Momentum for +10% damage per tick and +10u field radius per stack';
  if (kind === 'pbaoe') return 'spend Momentum for +10% damage and +10u burst radius per stack';
  return 'spend Momentum for +10% damage per stack';
}
export function flowPreparation(kind: AbilityKind, duration: string): string {
  const trigger =
    kind === 'dash'
      ? 'dashing'
      : kind === 'blink'
        ? 'blinking'
        : kind === 'selfBuff'
          ? 'centering yourself'
          : 'casting';
  return `${trigger} readies Flow for ${duration}; next marked special gains its listed Flow effect`;
}

export function momentumPreparation(duration: number, hunt = 0): string | null {
  const seconds = (v: number) => `${Math.round(v * 100) / 100}s`;
  if (hunt >= duration) return null;
  if (hunt > 0)
    return `after the ${seconds(hunt)} hunt, melee hits build Momentum for the final ${seconds(duration - hunt)}`;
  return `melee hits build up to 3 momentum during ${seconds(duration)}; marked finishers gain +10% dmg per stack (at most 1 stack per 0.4s)`;
}
