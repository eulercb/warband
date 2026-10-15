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
