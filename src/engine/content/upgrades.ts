/**
 * Warband — persistent hero upgrades earned between gauntlet bosses. PURE TS.
 *
 * After each boss falls in a run, every hero picks one upgrade from a small
 * random offer; picks accumulate across the run and are applied to the fresh
 * `Player` when the next fight is spawned (host-authoritative — see world.ts /
 * host.ts). Each upgrade is a pure stat mutation, so the whole system is
 * data-driven and unit-testable without any UI or networking.
 */
import type { Player } from '../core/types';
import { MAX_SKILL_STACKS } from '../core/constants';

export type UpgradeId =
  'swift' | 'vigor' | 'haste' | 'focus' | 'surefooted' | 'mighty' | 'bulwark' | 'renewal';

/** Coarse role of a boon, used to bias personality-driven bot picks (item 6). */
export type UpgradeRole = 'offense' | 'defense' | 'sustain' | 'tempo' | 'mobility';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  /** One-line player-facing effect description. */
  desc: string;
  /** Emoji shown on the upgrade card / accumulated badge. */
  icon: string;
  /** What the boon is FOR — biases which bots (by temperament) favour it. */
  role: UpgradeRole;
  /**
   * Most times this boon can be taken across a run. Once a hero owns this many,
   * it stops being offered (a maxed pick — e.g. Surefooted at full terrain
   * immunity — never clutters the shop again). Defaults to MAX_SKILL_STACKS.
   */
  maxStacks?: number;
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
    role: 'mobility',
    name: 'Swift',
    icon: '🌀',
    desc: '+15% movement speed',
    apply: (p) => {
      p.moveSpeed *= 1.15;
    },
  },
  vigor: {
    id: 'vigor',
    role: 'defense',
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
    role: 'tempo',
    name: 'Haste',
    icon: '⚡',
    desc: '-18% ability cooldowns',
    apply: (p) => {
      p.cooldownMult *= 0.82;
    },
  },
  focus: {
    id: 'focus',
    role: 'tempo',
    name: 'Focus',
    icon: '🎯',
    desc: '-30% cast time',
    apply: (p) => {
      p.castMult *= 0.7;
    },
  },
  surefooted: {
    id: 'surefooted',
    role: 'mobility',
    name: 'Surefooted',
    icon: '🥾',
    // Two picks reach full immunity, after which it drops out of the offer pool.
    maxStacks: 2,
    desc: 'Halve terrain slow & damage (2 stacks = full immunity)',
    apply: (p) => {
      p.terrainResist = Math.min(1, p.terrainResist + 0.5);
    },
  },
  mighty: {
    id: 'mighty',
    role: 'offense',
    name: 'Mighty',
    icon: '🔥',
    desc: '+15% damage dealt',
    apply: (p) => {
      p.damageMult *= 1.15;
    },
  },
  bulwark: {
    id: 'bulwark',
    role: 'defense',
    name: 'Bulwark',
    icon: '🛡️',
    desc: '-15% damage taken',
    apply: (p) => {
      p.damageTakenMult *= 0.85;
    },
  },
  renewal: {
    id: 'renewal',
    role: 'sustain',
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

/** Most times a generic boon may be taken (its `maxStacks`, or the shared cap). */
export function upgradeMaxStacks(id: UpgradeId): number {
  return UPGRADES[id].maxStacks ?? MAX_SKILL_STACKS;
}

/** Whether the hero already owns `id` at its stacking cap (so it shouldn't reroll). */
export function upgradeAtMax(id: UpgradeId, owned: readonly string[]): boolean {
  const have = owned.reduce((n, o) => (o === id ? n + 1 : n), 0);
  return have >= upgradeMaxStacks(id);
}

/**
 * Roll `n` distinct upgrades to offer this round. `rnd` returns a float in
 * [0,1) (Math.random in the UI). `owned` (the hero's picks so far) filters out
 * any boon already at its stacking cap so a maxed pick never clutters the shop.
 * Pure aside from the injected randomness.
 */
export function rollUpgradeChoices(
  n: number,
  rnd: () => number,
  owned: readonly string[] = [],
): UpgradeId[] {
  const pool = UPGRADE_IDS.filter((id) => !upgradeAtMax(id, owned));
  const out: UpgradeId[] = [];
  const count = Math.min(n, pool.length);
  while (out.length < count) {
    const i = Math.floor(rnd() * pool.length) % pool.length;
    out.push(pool[i]);
    pool.splice(i, 1);
  }
  return out;
}
