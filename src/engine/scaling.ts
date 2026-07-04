/**
 * Warband — player-count scaling. Computed ONCE at fight start from the number
 * of connected players `n` (1..MAX_PLAYERS).
 */
import {
  SCALE_HP_PER_PLAYER,
  SCALE_DMG_PER_PLAYER,
  SCALE_TROLL_REGEN_PER_PLAYER,
  MAX_PLAYERS,
} from './constants';

export interface ScalingResult {
  playerCount: number;
  hpMultiplier: number;
  bossDamageMult: number;
  trollRegenMult: number;
}

export function computeScaling(n: number): ScalingResult {
  const playerCount = Math.max(1, Math.min(MAX_PLAYERS, Math.round(n)));
  const k = playerCount - 1;
  return {
    playerCount,
    hpMultiplier: 1 + SCALE_HP_PER_PLAYER * k, // 1, 1.75, 2.5, 3.25
    bossDamageMult: 1 + SCALE_DMG_PER_PLAYER * k, // 1, 1.12, 1.24, 1.36
    trollRegenMult: 1 + SCALE_TROLL_REGEN_PER_PLAYER * k, // 1, 1.5, 2, 2.5
  };
}

/** Add / void-zone counts scale directly with n (see monsters.ts). */
export function addCount(n: number): number {
  return Math.ceil(n / 2) + 1;
}

export function zoneCount(n: number): number {
  return Math.ceil(n / 2);
}
