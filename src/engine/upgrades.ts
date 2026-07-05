/**
 * Warband — persistent hero upgrades earned between gauntlet bosses. PURE TS.
 *
 * After each boss falls in a run, every hero picks one upgrade from a small
 * random offer; picks accumulate across the run and are applied to the fresh
 * `Player` when the next fight is spawned (host-authoritative — see world.ts /
 * host.ts). Each upgrade is a pure stat mutation, so the whole system is
 * data-driven and unit-testable without any UI or networking.
 */
import type { Player } from './types';

export type UpgradeId =
  | 'swift'
  | 'vigor'
  | 'haste'
  | 'focus'
  | 'surefooted'
  | 'mighty'
  | 'bulwark'
  | 'renewal';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  /** One-line player-facing effect description. */
  desc: string;
  /** Emoji shown on the upgrade card / accumulated badge. */
  icon: string;
  /** Mutate a freshly-spawned player to apply this upgrade. */
  apply: (p: Player) => void;
}

/**
 * The upgrade pool. Effects are multiplicative where they stack (so repeated
 * picks keep helping without becoming trivially infinite), except the
 * fixed-cap terrain resist and additive regen.
 */
export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  swift: {
    id: 'swift',
    name: 'Swift',
    icon: '🌀',
    desc: '+15% movement speed',
    apply: (p) => {
      p.moveSpeed *= 1.15;
    },
  },
  vigor: {
    id: 'vigor',
    name: 'Vigor',
    icon: '❤️',
    desc: '+20% maximum health',
    apply: (p) => {
      p.maxHp = Math.round(p.maxHp * 1.2);
      p.hp = p.maxHp;
    },
  },
  haste: {
    id: 'haste',
    name: 'Haste',
    icon: '⚡',
    desc: '-18% ability cooldowns',
    apply: (p) => {
      p.cooldownMult *= 0.82;
    },
  },
  focus: {
    id: 'focus',
    name: 'Focus',
    icon: '🎯',
    desc: '-30% cast time',
    apply: (p) => {
      p.castMult *= 0.7;
    },
  },
  surefooted: {
    id: 'surefooted',
    name: 'Surefooted',
    icon: '🥾',
    desc: 'Halve terrain slow & damage (stacks to immunity)',
    apply: (p) => {
      p.terrainResist = Math.min(1, p.terrainResist + 0.5);
    },
  },
  mighty: {
    id: 'mighty',
    name: 'Mighty',
    icon: '🔥',
    desc: '+15% damage dealt',
    apply: (p) => {
      p.damageMult *= 1.15;
    },
  },
  bulwark: {
    id: 'bulwark',
    name: 'Bulwark',
    icon: '🛡️',
    desc: '-15% damage taken',
    apply: (p) => {
      p.damageTakenMult *= 0.85;
    },
  },
  renewal: {
    id: 'renewal',
    name: 'Renewal',
    icon: '✨',
    desc: 'Regenerate 2% max HP per second',
    apply: (p) => {
      // Computed off the (possibly Vigor-boosted) maxHp at spawn time.
      p.regenPerSec += p.maxHp * 0.02;
    },
  },
};

export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];

/** Type guard for an untrusted (e.g. networked) upgrade id. */
export function isUpgradeId(x: unknown): x is UpgradeId {
  return typeof x === 'string' && Object.prototype.hasOwnProperty.call(UPGRADES, x);
}

/** Apply an ordered list of upgrades to a player (skips unknown ids). */
export function applyUpgrades(p: Player, ids: UpgradeId[] | undefined): void {
  if (!ids) return;
  for (const id of ids) {
    const u = UPGRADES[id];
    if (u) u.apply(p);
  }
}

/**
 * Roll `n` distinct upgrades to offer this round. `rnd` returns a float in
 * [0,1) (Math.random in the UI). Pure aside from that injected randomness.
 */
export function rollUpgradeChoices(n: number, rnd: () => number): UpgradeId[] {
  const pool = [...UPGRADE_IDS];
  const out: UpgradeId[] = [];
  const count = Math.min(n, pool.length);
  while (out.length < count) {
    const i = Math.floor(rnd() * pool.length) % pool.length;
    out.push(pool[i]);
    pool.splice(i, 1);
  }
  return out;
}
