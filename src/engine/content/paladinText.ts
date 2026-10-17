import type { PlayerAbilityDef } from './classes';
export function auraText(a: NonNullable<PlayerAbilityDef['paladinAura']>): string {
  const effect =
    a.kind === 'bulwark'
      ? '15% less damage and 35% shorter control'
      : a.kind === 'pursuit'
        ? '18% move speed and one +25% melee hit per ally per activation'
        : '10 HP/s recovery after an effective heal';
  return `${a.kind} aura — follows you for ${a.duration}s within ${a.radius}u; ${effect}; one active aura, strongest equivalent wins`;
}
