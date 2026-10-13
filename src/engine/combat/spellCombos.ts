/** Shared authored spell interactions; copied skills retain their own behavior. */
import type { Player, Boss, Add } from '../core/types';
import type { PlayerAbilityDef } from '../content/classes';

export function controlledSpellMultiplier(target: Boss | Add, bonus: number | undefined): number {
  return bonus &&
    target.buffs.some(
      (b) =>
        b.remaining > 0 &&
        (b.kind === 'stun' || b.kind === 'root' || (b.kind === 'moveSpeed' && b.mult < 1)),
    )
    ? 1 + bonus
    : 1;
}

/** Reserve the one-use surge at cast start; the resolved spell carries its boost. */
export function consumeSpellSurge(p: Player, ab: PlayerAbilityDef): PlayerAbilityDef {
  if (!ab.consumesSurge) return ab;
  const index = p.buffs.findIndex((b) => b.kind === 'spellSurge' && b.remaining > 0);
  if (index < 0) return ab;
  p.buffs.splice(index, 1);
  const count = Math.max(1, ab.projCount ?? 1);
  // Zone-payload fusions keep their original delivery: extra shots must not duplicate zones.
  const twin =
    ab.surgeTwin &&
    ab.kind === 'projectile' &&
    !ab.components?.effects.some((e) => e.kind === 'zone');
  return {
    ...ab,
    damage: ab.damage * 1.2 * (twin ? count / (count + 1) : 1),
    castTime: (ab.castTime ?? 0) * 0.5,
    ...(twin ? { projCount: count + 1, spreadDeg: Math.max(4, ab.spreadDeg ?? 0) } : {}),
  };
}

export function prepareSpellSurge(p: Player, ab: PlayerAbilityDef): void {
  if (!ab.prepareSurge) return;
  const buff = {
    kind: 'spellSurge' as const,
    mult: 1.2,
    remaining: ab.prepareSurge,
    source: 'spellSurge',
  };
  const index = p.buffs.findIndex((b) => b.source === buff.source);
  if (index < 0) p.buffs.push(buff);
  else p.buffs[index] = { ...buff, remaining: Math.max(p.buffs[index].remaining, buff.remaining) };
}
