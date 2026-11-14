import type { PlayerAbilityDef } from './classes';
export const REFLECTION_TEXT =
  'a real barrier gain grants one 4s reflection; the first hostile projectile reaching its recipient reverses direction; no beams, waves, melee or fields';
export function reflectiveWard(ab: Omit<PlayerAbilityDef, 'slot'> & { slot?: string }): boolean {
  return (
    ['selfBuff', 'buffAlly'].includes(ab.kind) &&
    ab.slot !== 'basic' &&
    (ab.absorption?.amount ?? 0) > 0 &&
    (ab.components
      ? ['selfBuff', 'buffAlly'].includes(ab.components.delivery.kind) &&
        ab.components.effects.some((e) => e.kind === 'reflectWard') &&
        ab.components.effects.some((e) => e.kind === 'absorption' && e.grant.amount > 0)
      : !!ab.reflectWard)
  );
}
