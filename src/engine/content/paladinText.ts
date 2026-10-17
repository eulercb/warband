import type { PlayerAbilityDef } from './classes';
export function auraText(a: NonNullable<PlayerAbilityDef['paladinAura']>): string {
  const effect =
    a.kind === 'bulwark'
      ? '10% less damage and 25% shorter control'
      : a.kind === 'pursuit'
        ? '12% move speed and one +15% melee hit per ally per activation'
        : '6 HP/s recovery after an effective heal';
  return `${a.kind} aura — follows you for ${a.duration}s within ${a.radius}u; ${effect}; one active aura, strongest equivalent wins`;
}
