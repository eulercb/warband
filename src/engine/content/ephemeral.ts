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
import { Rng, mixSeed } from '../core/math';
import { hashStr } from './procgen';
import { forgeVariant } from './forge';

export type EphemeralId = 'speed' | 'damage' | 'defense' | 'potion' | 'revive' | 'retry' | 'reroll';

/**
 * item: reroll — how many times a hero may re-randomize their current upgrade offers
 * per between-boss stop. Recurring-but-CAPPED (not one-time, not unlimited): a single
 * reroll is too weak to steer a build, while an unlimited one lets a coin-rich player
 * brute-force the exact offers they want, defeating the point of a random shop. A few
 * cheap rerolls let a player nudge toward the build they want while keeping randomness
 * and leaving coins a meaningful choice against potions / buffs.
 */
export const REROLL_CAP = 3;

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
    icon: '🛡️',
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
    icon: '🕊️',
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
  reroll: {
    id: 'reroll',
    name: "Gambler's Coin",
    icon: '🎲',
    desc: `Re-randomize your current upgrade offers — biased to differ (up to ${REROLL_CAP}/stop)`,
    cost: 2, // the cheapest stall — a small, repeatable nudge toward the build you want
    kind: 'meta', // a between-boss ACTION, not a next-fight perk (like retry); no stock
  },
};

export const EPHEMERAL_IDS: EphemeralId[] = Object.keys(EPHEMERAL) as EphemeralId[];

export function isEphemeralId(x: unknown): x is EphemeralId {
  return typeof x === 'string' && Object.prototype.hasOwnProperty.call(EPHEMERAL, x);
}

/**
 * Chaos Forge (docs/CHAOS_FORGE.md §7) — mechanic-true name flavours for the shop,
 * keyed by id. Index 0 is the canonical name. The shop is the one content family
 * procgen never touched; Forge folds it in. */
const EPHEMERAL_NAME_BANKS: Record<EphemeralId, string[]> = {
  speed: ['Swiftness Draught', 'Zephyr Tonic', 'Fleetfoot Brew', 'Windstep Elixir'],
  damage: ['Fury Elixir', 'Wrath Draught', 'Bloodrage Tonic', 'Warfire Brew'],
  defense: ['Stoneskin Tonic', 'Ironhide Draught', 'Bulwark Brew', 'Aegis Elixir'],
  potion: ['Healing Vial', 'Mending Draught', 'Restorative Phial', 'Salve of Renewal'],
  revive: ['Phoenix Charm', 'Everflame Token', 'Second Wind Charm', 'Rebirth Sigil'],
  retry: ['Second Chance', "Fate's Reroll", 'Last Stand Pact', 'Mulligan Rite'],
  reroll: ["Gambler's Coin", 'Chancewheel Token', 'Loaded Die', "Fortune's Whim"],
};

/**
 * Roll a Chaos Forge shop item for the run: a re-flavoured NAME from its bank and
 * a jittered COST within a small band. The functional identity — id, kind,
 * hardcore gate, and the applied magnitude (a spawn-time balance constant) — is
 * PRESERVED, so the desc stays accurate and the store/host buy logic is unchanged;
 * only the economics (price) and flavour vary. Deterministic: host + every client
 * derive the same price from the shared seed, so a buy never disagrees.
 */
export function ephemeralVariant(seed: number, base: EphemeralDef): EphemeralDef {
  const rng = new Rng(mixSeed(seed, 0xe140, hashStr(base.id)));
  const bank = EPHEMERAL_NAME_BANKS[base.id];
  const name = bank[rng.int(0, bank.length - 1)];
  const cost = Math.max(1, base.cost + rng.int(-2, 3));
  return { ...base, name, cost };
}

/**
 * Resolve a shop item — the run's Chaos Forge variant (re-priced + re-flavoured)
 * while a Forge run is active, else the canonical authored def. Every shop
 * consumer (the reward-room stalls, the list shop, the store's optimistic buy and
 * the host's authoritative buy) resolves through here so the displayed and the
 * charged price always agree.
 */
export function getEphemeral(id: EphemeralId): EphemeralDef {
  return forgeVariant('shop', id, (seed) => ephemeralVariant(seed, EPHEMERAL[id])) ?? EPHEMERAL[id];
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
