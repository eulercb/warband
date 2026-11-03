import { getMonster, type BossAbilityShape } from './monsters';
import type { BossView, MonsterId } from '../core/types';
/** Forecasts describe delivery, never a fictitious locked floor location. */
export function forethoughtLabel(
  monsterId: MonsterId,
  read: BossView['forethought'],
): string | undefined {
  if (!read || read.remaining <= 0) return undefined;
  const ab = getMonster(monsterId).abilities.find((a) => a.id === read.abilityId);
  if (!ab) return 'Reading next move…';
  const shape: Record<BossAbilityShape, string> = {
    cone: 'cone',
    circleAtTarget: 'aimed area',
    line: 'line',
    pbaoe: 'nearby burst',
    projectile: 'projectile',
    beam: 'beam',
    summon: 'summon',
    buffSelf: 'self buff',
    voidzones: 'hazard field',
  };
  return `Next: ${ab.name} · ${shape[ab.shape]}`;
}
