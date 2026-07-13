/**
 * Warband — CHAOS DRAFT (item 10): the opt-in "randomized kits" mode. PURE TS.
 *
 * A run started with Chaos Draft drafts every combatant a random FULL kit from the
 * shared master seed instead of the one they picked: each hero (and bot) plays a
 * seed-assigned class, and every boss slot is a seed-assigned monster — so runs turn
 * unpredictable. Because each draw is a WHOLE class / monster (never a Frankenstein
 * of cross-class abilities), the kit stays coherent AND every character-upgrade offer
 * is that class's OWN correct boon: the (classId, slot) upgrade keying is honoured by
 * construction, so a drafted Mage is offered the Mage's Fireball upgrade, never a
 * mismatched one.
 *
 * DETERMINISM: everything derives from the master/fight seed via mixSeed (no
 * Math.random, no Date), so the host and every client agree on the draft — the host
 * bakes each hero's drafted class into the StartMsg roster and drafts the boss, and a
 * client simply reads its own roster entry — and a typed-in seed reproduces the exact
 * same draft for everyone. The hero draft keys off the MASTER seed (stable across a
 * run, so accumulated upgrades keep matching the drafted class); the boss draft keys
 * off the per-fight seed, so each boss of a run is its own surprise.
 */
import type { ClassId, MonsterId } from '../core/types';
import { CLASS_IDS } from './classes';
import { MONSTER_IDS } from './monsters';
import { mixSeed } from '../core/math';
import { hashStr } from './procgen';

/**
 * The class a combatant drafts in Chaos Draft — a seed-derived pick over the full
 * roster (independent of what they chose, so the draft can surprise). Keyed by the
 * peer/bot id so every peer resolves the same class, and by the MASTER seed so it
 * stays stable across a run's bosses.
 */
export function draftedClassFor(seed: number, peerId: string): ClassId {
  const roll = mixSeed(seed, hashStr(peerId), 0x5c1a) >>> 0;
  return CLASS_IDS[roll % CLASS_IDS.length];
}

/**
 * The monster a boss slot drafts in Chaos Draft — a seed-derived pick over the live
 * (non-hidden) roster. Keyed by the slot's original monster id, so a twin pack's two
 * slots draft independently, and by the per-fight seed so each boss is its own draw.
 */
export function draftedMonsterFor(seed: number, monsterId: MonsterId): MonsterId {
  const roll = mixSeed(seed, hashStr(monsterId), 0x30b5) >>> 0;
  return MONSTER_IDS[roll % MONSTER_IDS.length];
}
