import { getMonster, type BossAbilityShape } from './monsters';
import type { BossView, MonsterId, ForesightView } from '../core/types';
/** Forecasts describe delivery, never a fictitious locked floor location. */
export function forethoughtLabel(
  monsterId: MonsterId,
  read: BossView['forethought'],
  revealed?: BossView['revealed'],
): string | undefined {
  const next = read && read.remaining > 0 ? read : undefined;
  if (!next && !revealed) return undefined;
  const id = next?.abilityId ?? revealed?.abilityId;
  const ab = getMonster(monsterId).abilities.find((a) => a.id === id);
  if (!ab) return 'READING NEXT MOVE…';
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
  return `${next?.abilityId ? 'FORESEEN' : 'REVEALED'}: ${ab.name} · ${shape[ab.shape]}`;
}

export function foresightHint(v: ForesightView | undefined): string {
  if (!v) return 'Finishes the current attack, then reveals the next move';
  if (v.mode === 'tracking') return 'MARKED VICTIM · beam tracks them — leave its reach';
  if (v.mode === 'self') return 'BOSS-CENTERED · move outside the violet ring';
  if (v.mode === 'hazards') return 'HAZARDS NEAR PLAYERS · keep moving; locations form on release';
  if (v.mode === 'utility') return 'Boss prepares a summon or self buff';
  if (v.mode === 'volley') return 'AIM FIXED · step between or away from violet shot paths';
  return 'AIM FIXED · step outside the violet outline';
}
