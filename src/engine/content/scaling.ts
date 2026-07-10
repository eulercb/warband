/**
 * Warband — player-count scaling. Computed ONCE at fight start from the number
 * of connected players `n` (1..MAX_PLAYERS).
 */
import {
  SCALE_HP_PER_PLAYER,
  SCALE_DMG_PER_PLAYER,
  SCALE_TROLL_REGEN_PER_PLAYER,
  MAX_PLAYERS,
  ENDLESS_HP_PER_CYCLE,
  ENDLESS_DMG_PER_CYCLE,
} from '../core/constants';

export interface ScalingResult {
  playerCount: number;
  hpMultiplier: number;
  bossDamageMult: number;
  trollRegenMult: number;
  /** Endless cycle this fight belongs to (0 = the first run). */
  cycle: number;
}

/**
 * Fight scaling from party size `n` and the endless `cycle` (0 = first run).
 * Each completed cycle multiplies boss HP and outgoing damage so a carried-over
 * warband keeps facing a stiffer wall even with all their accumulated upgrades.
 */
export function computeScaling(n: number, cycle = 0): ScalingResult {
  const playerCount = Math.max(1, Math.min(MAX_PLAYERS, Math.round(n)));
  const c = Math.max(0, Math.floor(cycle));
  const k = playerCount - 1;
  const cycleHp = 1 + ENDLESS_HP_PER_CYCLE * c;
  const cycleDmg = 1 + ENDLESS_DMG_PER_CYCLE * c;
  return {
    playerCount,
    hpMultiplier: (1 + SCALE_HP_PER_PLAYER * k) * cycleHp, // 1, 1.75, 2.5, 3.25 × cycle
    bossDamageMult: (1 + SCALE_DMG_PER_PLAYER * k) * cycleDmg, // 1, 1.12, 1.24, 1.36 × cycle
    trollRegenMult: 1 + SCALE_TROLL_REGEN_PER_PLAYER * k, // 1, 1.5, 2, 2.5
    cycle: c,
  };
}

/** Add / void-zone counts scale directly with n (see monsters.ts). */
export function addCount(n: number): number {
  return Math.ceil(n / 2) + 1;
}

export function zoneCount(n: number): number {
  return Math.ceil(n / 2);
}
