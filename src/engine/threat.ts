/**
 * Warband — aggro / threat table logic. Threat is stored per-player
 * (`player.threat`); the boss reads it to choose single-target focus.
 */
import type { Player, EntityId } from './types';
import { THREAT_DECAY, TAUNT_THREAT_MARGIN } from './constants';

export function decayThreat(players: Player[], dt: number): void {
  const factor = Math.max(0, 1 - THREAT_DECAY * dt);
  for (const p of players) p.threat *= factor;
}

/**
 * The boss's current single-target focus: the highest-threat living player,
 * unless a taunt is active and its target is still alive.
 */
export function highestThreatTarget(
  players: Player[],
  tauntTargetId: EntityId | null,
  tauntTimer: number,
): Player | null {
  const alive = players.filter((p) => p.state === 'alive');
  if (alive.length === 0) return null;

  if (tauntTimer > 0 && tauntTargetId != null) {
    const forced = alive.find((p) => p.id === tauntTargetId);
    if (forced) return forced;
  }

  let best = alive[0];
  for (const p of alive) {
    if (p.threat > best.threat) best = p;
  }
  return best;
}

/**
 * The `index`-th highest-threat living player (0 = top). Twin bosses use this
 * to split their attention: boss #0 hunts the top threat, boss #1 the runner-up
 * (falling back to the top when the party is smaller than the boss count). A
 * live taunt still overrides EVERY boss — taunting a duo is gloriously brave.
 */
export function nthThreatTarget(
  players: Player[],
  index: number,
  tauntTargetId: EntityId | null,
  tauntTimer: number,
): Player | null {
  if (tauntTimer > 0 && tauntTargetId != null) {
    const forced = players.find((p) => p.id === tauntTargetId && p.state === 'alive');
    if (forced) return forced;
  }
  const alive = players.filter((p) => p.state === 'alive');
  if (alive.length === 0) return null;
  const sorted = [...alive].sort((a, b) => b.threat - a.threat);
  return sorted[Math.min(index, sorted.length - 1)];
}

/** Taunt: set the taunter's threat to the current max + margin. */
export function forceTopThreat(players: Player[], taunterId: EntityId): void {
  let max = 0;
  for (const p of players) max = Math.max(max, p.threat);
  const taunter = players.find((p) => p.id === taunterId);
  if (taunter) taunter.threat = max + TAUNT_THREAT_MARGIN;
}
