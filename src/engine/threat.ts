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

/** Taunt: set the taunter's threat to the current max + margin. */
export function forceTopThreat(players: Player[], taunterId: EntityId): void {
  let max = 0;
  for (const p of players) max = Math.max(max, p.threat);
  const taunter = players.find((p) => p.id === taunterId);
  if (taunter) taunter.threat = max + TAUNT_THREAT_MARGIN;
}
