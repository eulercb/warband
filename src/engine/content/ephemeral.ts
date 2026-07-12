/**
 * Warband — the EPHEMERAL coin shop (item 21). PURE data.
 *
 * A secondary, throwaway economy layered on the between-boss phase. After each
 * boss, players earn COINS ranked by their performance in THAT fight (1st most,
 * 4th none). Coins buy one-off perks that last only the NEXT boss fight whether
 * used or not: passive combat bursts (speed / damage / defence) that auto-apply,
 * a healing potion spent with the item button, and a self-revive that fires on
 * its own when you fall. In a hardcore run this shop is also where you buy back
 * a revive-stock top-up or a retry.
 */
export type EphemeralId =
  | 'speed'
  | 'damage'
  | 'defense'
  | 'potion'
  | 'revive'
  | 'retry';

/** How the perk is consumed. */
export type EphemeralKind =
  | 'passive' // auto-applied as a next-fight buff, then gone
  | 'active' // spent in-fight with the item button (potions)
  | 'auto' // fires automatically when its trigger hits (self-revive on downed)
  | 'meta'; // a run-economy purchase, not a next-fight perk (hardcore retry)

export interface EphemeralDef {
  id: EphemeralId;
  name: string;
  icon: string;
  desc: string;
  /** Coin cost. */
  cost: number;
  kind: EphemeralKind;
  /** Only offered in hardcore runs. */
  hardcoreOnly?: boolean;
}

export const EPHEMERAL: Record<EphemeralId, EphemeralDef> = {
  speed: {
    id: 'speed',
    name: 'Swiftness Draught',
    icon: '💨',
    desc: '+30% move speed for the next fight',
    cost: 3,
    kind: 'passive',
  },
  damage: {
    id: 'damage',
    name: 'Fury Elixir',
    icon: '🔥',
    desc: '+25% damage for the next fight',
    cost: 4,
    kind: 'passive',
  },
  defense: {
    id: 'defense',
    name: 'Stoneskin Tonic',
    icon: '🪨',
    desc: '−25% damage taken for the next fight',
    cost: 4,
    kind: 'passive',
  },
  potion: {
    id: 'potion',
    name: 'Healing Vial',
    icon: '🧪',
    desc: 'Carry a vial — spend it in-fight (Use Item) to heal 40% max HP',
    cost: 3,
    kind: 'active',
  },
  revive: {
    id: 'revive',
    name: 'Phoenix Charm',
    icon: '🪶',
    desc: 'Auto-revive once when you fall this fight',
    cost: 6,
    kind: 'auto',
  },
  retry: {
    id: 'retry',
    name: 'Second Chance',
    icon: '🔄',
    desc: 'Hardcore: bank a retry — a wipe can restart the boss instead of ending the run',
    cost: 8,
    kind: 'meta',
    hardcoreOnly: true,
  },
};

export const EPHEMERAL_IDS: EphemeralId[] = Object.keys(EPHEMERAL) as EphemeralId[];

export function isEphemeralId(x: unknown): x is EphemeralId {
  return typeof x === 'string' && Object.prototype.hasOwnProperty.call(EPHEMERAL, x);
}

/**
 * Coins awarded by finishing RANK (0-based) in a boss fight: 1st gets the most,
 * 4th gets nothing (item 21). Clamped for larger/smaller bands.
 */
export const COIN_BY_RANK = [5, 3, 1, 0];
export function coinsForRank(rank: number): number {
  return COIN_BY_RANK[Math.min(rank, COIN_BY_RANK.length - 1)] ?? 0;
}

/**
 * A hero's carried ephemeral perks for one upcoming fight. Passive buffs apply at
 * spawn and vanish; potions/revives are in-fight resources. Retries live on the
 * run economy, not here.
 */
export interface EphemeralStock {
  speed?: boolean;
  damage?: boolean;
  defense?: boolean;
  potions?: number;
  revives?: number;
}
