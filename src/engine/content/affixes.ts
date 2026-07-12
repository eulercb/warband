/**
 * Warband — boss AFFIXES: modifiers rolled onto a boss at fight-gen so the same
 * three bosses become wildly different fights (Diablo / PoE map-mod style).
 *
 * This module owns only the DATA (the registry) and the seeded ROLL POLICY —
 * both pure and trivially unit-testable. The BEHAVIOUR each affix drives lives
 * host-side in `world.ts` (dispatched on `boss.affixes`), and the ids ride to
 * clients on `BossView.affixes` purely to colour the aura and label the HUD.
 *
 * Affixes COMPOSE: a boss can carry several at once, so "Vampiric Frenzied Orc"
 * is one fight and "Volatile Molten Orc" is another. The roll budget starts at
 * zero for a fresh party's opening boss and ramps through the run and each
 * endless cycle (mirroring how twin encounters escalate).
 */
import type { AffixId, BossTier } from '../core/types';
import type { Rng } from '../core/math';

export interface BossAffixDef {
  id: AffixId;
  /** Name prefix shown on the HUD ("Vampiric"). */
  name: string;
  /** One-line description (tooltip / lore). */
  blurb: string;
  /** Accent colour for the aura ring + HUD chip (packed 0xRRGGBB). */
  color: number;
  /** Relative selection weight when rolling. */
  weight: number;
  /** Difficulty tiers this affix may roll onto (keeps the nastiest off easy bosses). */
  tiers: BossTier[];
}

const ALL: BossTier[] = ['easy', 'medium', 'hard'];
const MID_HARD: BossTier[] = ['medium', 'hard'];

/**
 * The affix registry. Behaviour for each id is implemented in `world.ts`; the
 * numbers those behaviours use live in `core/constants.ts` (AFFIX_*).
 */
export const AFFIXES: Record<AffixId, BossAffixDef> = {
  vampiric: {
    id: 'vampiric',
    name: 'Vampiric',
    blurb: 'Drinks life from its blows — every hit it lands heals it.',
    color: 0xd83a5a,
    weight: 3,
    tiers: ALL,
  },
  frenzied: {
    id: 'frenzied',
    name: 'Frenzied',
    blurb: 'The closer to death, the faster it swings.',
    color: 0xff5a2a,
    weight: 3,
    tiers: ALL,
  },
  splitting: {
    id: 'splitting',
    name: 'Splitting',
    blurb: 'Keeps calling fresh rabble to the fight.',
    color: 0x7fd14a,
    weight: 2,
    tiers: ALL,
  },
  volatile: {
    id: 'volatile',
    name: 'Volatile',
    blurb: 'Its strikes leave the ground boiling where they land.',
    color: 0xffb03a,
    weight: 3,
    tiers: ALL,
  },
  molten: {
    id: 'molten',
    name: 'Molten',
    blurb: 'Scorches a burning trail wherever it treads.',
    color: 0xff7a1f,
    weight: 3,
    tiers: ALL,
  },
  warding: {
    id: 'warding',
    name: 'Warding',
    blurb: 'Wraps itself in a shield of stored spite, again and again.',
    color: 0x59d9ff,
    weight: 2,
    tiers: MID_HARD,
  },
  accelerating: {
    id: 'accelerating',
    name: 'Accelerating',
    blurb: 'Winds up faster the longer you let the fight run.',
    color: 0x5aa0ff,
    weight: 2,
    tiers: ALL,
  },
  teleporting: {
    id: 'teleporting',
    name: 'Teleporting',
    blurb: 'Slips away the instant you crowd it.',
    color: 0xb06cff,
    weight: 2,
    tiers: ALL,
  },
  overcharged: {
    id: 'overcharged',
    name: 'Overcharged',
    blurb: 'Every telegraph — and every blow — lands bigger.',
    color: 0xff5ad0,
    weight: 2,
    tiers: MID_HARD,
  },
  barbed: {
    id: 'barbed',
    name: 'Barbed',
    blurb: 'Answers your heaviest blows with a burst of thorns.',
    color: 0xe8d36a,
    weight: 2,
    tiers: MID_HARD,
  },
};

export const AFFIX_IDS: AffixId[] = Object.keys(AFFIXES) as AffixId[];

export function getAffix(id: AffixId): BossAffixDef {
  return AFFIXES[id];
}

export function isAffixId(x: unknown): x is AffixId {
  return typeof x === 'string' && x in AFFIXES;
}

/** True if `boss` (or any affix carrier) has the given affix. */
export function hasAffix(carrier: { affixes?: AffixId[] }, id: AffixId): boolean {
  return carrier.affixes?.includes(id) ?? false;
}

/** The primary aura accent colour for a set of affixes (first one), or null. */
export function affixAuraColor(affixes: AffixId[] | undefined): number | null {
  if (!affixes || affixes.length === 0) return null;
  return AFFIXES[affixes[0]].color;
}

/** The accent colours for every affix (so a multi-affix corona is multi-hued). */
export function affixColors(affixes: AffixId[] | undefined): number[] {
  if (!affixes || affixes.length === 0) return [];
  return affixes.map((id) => AFFIXES[id].color);
}

/** Human-readable prefix string ("Vampiric Frenzied"), or '' for none. */
export function affixPrefix(affixes: AffixId[] | undefined): string {
  if (!affixes || affixes.length === 0) return '';
  return affixes.map((id) => AFFIXES[id].name).join(' ');
}

// ---------------------------------------------------------------------------
// Roll policy (pure, seeded)
// ---------------------------------------------------------------------------

/** Hard cap on affixes per boss, so a fight stays readable rather than a soup. */
export const MAX_AFFIXES = 3;

/**
 * How many affixes a boss should carry given its place in the run. Affixes are
 * STANDARD now (every fight rolls at least one — a single light twist on the
 * opener), ramping to two deeper in a run, with every endless cycle stacking one
 * more up to MAX_AFFIXES. Pure.
 */
export function affixBudget(cycle: number, encounterIndex: number): number {
  const c = Math.max(0, Math.floor(cycle));
  const slot = Math.max(0, Math.floor(encounterIndex));
  const fromSlot = slot <= 1 ? 1 : 2;
  return Math.min(MAX_AFFIXES, fromSlot + c);
}

/** Weighted pick from `pool` (mutating: removes and returns the chosen id). */
function weightedTake(rng: Rng, pool: AffixId[]): AffixId | null {
  if (pool.length === 0) return null;
  const total = pool.reduce((s, id) => s + AFFIXES[id].weight, 0);
  let roll = rng.range(0, total);
  for (let i = 0; i < pool.length; i++) {
    roll -= AFFIXES[pool[i]].weight;
    if (roll <= 0) return pool.splice(i, 1)[0];
  }
  return pool.splice(pool.length - 1, 1)[0];
}

/**
 * Roll a set of DISTINCT affixes for one boss. Filtered to the affixes legal on
 * the boss's `tier`, weighted, and sized by `affixBudget`. Deterministic given
 * the injected RNG, so host and any replay agree.
 */
export function rollAffixes(
  tier: BossTier,
  cycle: number,
  encounterIndex: number,
  rng: Rng,
): AffixId[] {
  const budget = affixBudget(cycle, encounterIndex);
  if (budget <= 0) return [];
  const pool = AFFIX_IDS.filter((id) => AFFIXES[id].tiers.includes(tier));
  const chosen: AffixId[] = [];
  for (let i = 0; i < budget && pool.length > 0; i++) {
    const pick = weightedTake(rng, pool);
    if (pick) chosen.push(pick);
  }
  return chosen;
}
