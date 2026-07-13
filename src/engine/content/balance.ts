/**
 * Warband — the MATCH BALANCE engine (adaptive difficulty). PURE TS.
 *
 * Two signals feed each encounter's boss scaling so a run stays STEADILY
 * challenging without cancelling the player's power fantasy:
 *
 * 1. KILL PACE (feedback) — how fast the band has been felling bosses. The host
 *    records every encounter's time-to-kill against a target
 *    (BALANCE_TARGET_TTK, stretched for multi-boss packs), smooths it with an
 *    EMA (`recordEncounter`) and feeds the resulting `pace` into the next
 *    World. Faster-than-target kills stiffen the next boss; a slog — or a
 *    wipe, which records a fixed "struggling" sample — eases it. Negative
 *    feedback: fight length converges toward the target instead of running
 *    away in either direction.
 *
 * 2. BAND POWER (feed-forward) — how strong the warband actually SPAWNED,
 *    measured off the realized roster (`bandPowerRatio`): resolved ability
 *    tables and stat multipliers, so generic boons, class boons, grafts,
 *    grands, subclass skills, multiclass breadth and ephemeral elixirs all
 *    count — bots included. It is compared to the growth curve the run is
 *    tuned for (`expectedBandPower`, ~two picks per hero per cleared
 *    encounter), and only the DEVIATION is compensated: ordinary progression
 *    stays rewarding, while stacking rewards far past the curve is answered
 *    one fight sooner than the pace signal alone could.
 *
 * Both signals multiply into the boss HP / outgoing-damage scaling
 * (`balanceAdjust`), hard-capped (BALANCE_HP_MIN/MAX, BALANCE_DMG_MIN/MAX) so
 * the adjustment can never wall a struggling band or trivialize a boss. No RNG
 * stream is touched: the boss set, affixes, terrain and reward offers remain
 * purely seed-derived — the engine only turns the pressure knobs.
 *
 * The hero-power estimator is an INDEX, not a simulation: both the hero and
 * their class baseline run through the same estimator, so systematic modelling
 * error cancels in the ratio and an un-upgraded hero measures exactly 1.
 * Deliberately un-modelled (utility, not raw power): terrain resist, i-frames,
 * stuns/slows, knockbacks and lifesteal.
 */
import type { Player, BossTier } from '../core/types';
import type { PlayerAbilityDef } from './classes';
import { getClass } from './classes';
import { previewAbilityTable } from './charUpgrades';
import {
  BOSS_HEAL_SCALE_MIN,
  BOSS_HEAL_SCALE_FULL_CLEARS,
  BOSS_INVULN_THRESHOLD_1,
  BOSS_INVULN_THRESHOLD_2,
  BOSS_INVULN_POWER_HARD,
  ZONE_TICK_INTERVAL,
  BALANCE_TARGET_TTK,
  BALANCE_PACK_TTK_BONUS,
  BALANCE_TTK_FLOOR,
  BALANCE_PACE_ALPHA,
  BALANCE_PACE_SAMPLE_MIN,
  BALANCE_PACE_SAMPLE_MAX,
  BALANCE_DEFEAT_PACE,
  BALANCE_EXPECTED_GROWTH,
  BALANCE_POWER_EXCESS_MIN,
  BALANCE_POWER_EXCESS_MAX,
  BALANCE_POWER_COMP_UP,
  BALANCE_POWER_COMP_DOWN,
  BALANCE_POWER_DMG_FRAC,
  BALANCE_PACE_HP_EXP,
  BALANCE_PACE_DMG_EXP,
  BALANCE_HP_MIN,
  BALANCE_HP_MAX,
  BALANCE_DMG_MIN,
  BALANCE_DMG_MAX,
  BALANCE_W_OFFENSE,
  BALANCE_W_DURABILITY,
  BALANCE_W_MOBILITY,
  BALANCE_SUSTAIN_HORIZON_S,
  BALANCE_ZONE_COMMIT,
  BALANCE_MIN_CYCLE_S,
  BALANCE_EXTRA_CLASS_BONUS,
} from '../core/constants';

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

// ---------------------------------------------------------------------------
// Hero / band power (feed-forward signal)
// ---------------------------------------------------------------------------

/** Estimated per-second rates of one resolved kit (see `kitRates`). */
interface KitRates {
  /** Damage per second across the kit (direct + discounted zone + landing). */
  dps: number;
  /** Heal output per second (heals, heal zones, on-use self-patches). */
  hps: number;
  /** Offense uplift from damage buffs, weighted by uptime (0 = none). */
  offenseBuff: number;
}

/** Rate contribution of a single ability, at the hero's cd/cast multipliers. */
function abilityRates(ab: PlayerAbilityDef, cdMult: number, castMult: number): KitRates {
  const cycle = Math.max(ab.cooldown * cdMult + (ab.castTime ?? 0) * castMult, BALANCE_MIN_CYCLE_S);
  const zoneTicks = (ab.zoneDuration ?? 0) / ZONE_TICK_INTERVAL;
  const zoneCommit = zoneTicks * BALANCE_ZONE_COMMIT;
  const healPerUse =
    (ab.healOnUse ?? 0) +
    (ab.zoneTickHeal ?? 0) * zoneCommit +
    // A 'heal' kind's `damage` field IS its heal magnitude — sustain, not offense.
    (ab.kind === 'heal' ? ab.damage : 0);
  const damagePerUse =
    ab.kind === 'heal'
      ? 0
      : ab.damage * Math.max(1, ab.projCount ?? 1) +
        (ab.zoneTickDamage ?? 0) * zoneCommit +
        (ab.landingDamage ?? 0);
  // A damage buff (Rage, Inspiration) uplifts the rest of the kit while it's up.
  const uptime = clamp((ab.buffDuration ?? 0) / cycle, 0, 1);
  const offenseBuff = Math.max(0, (ab.buffDamageMult ?? 1) - 1) * uptime;
  return { dps: damagePerUse / cycle, hps: healPerUse / cycle, offenseBuff };
}

/** Summed rates of a resolved ability table (+ any bound subclass skills). */
function kitRates(
  abilities: Iterable<PlayerAbilityDef>,
  cdMult: number,
  castMult: number,
): KitRates {
  const total: KitRates = { dps: 0, hps: 0, offenseBuff: 0 };
  for (const ab of abilities) {
    const r = abilityRates(ab, cdMult, castMult);
    total.dps += r.dps;
    total.hps += r.hps;
    total.offenseBuff += r.offenseBuff;
  }
  return total;
}

/**
 * One hero's realized power relative to their class's un-upgraded baseline
 * (1 = fresh hero). Blends offense (kit DPS × damage multipliers × buff
 * uptime), durability (effective HP + a sustain horizon of regen/heal output)
 * and mobility, weighted by the BALANCE_W_* exponents, plus a flat bonus per
 * extra multiclass kit. Both sides run the same estimator, so an un-upgraded
 * hero is exactly 1 by construction.
 */
export function heroPowerRatio(p: Player): number {
  const cls = getClass(p.classId);
  const table = p.abilities ?? previewAbilityTable(p.classId, []);
  const hero = kitRates(
    [...Object.values(table), ...Object.values(p.subAbilities ?? {})],
    p.cooldownMult,
    p.castMult,
  );
  const base = kitRates(Object.values(previewAbilityTable(p.classId, [])), 1, 1);

  const offense =
    (hero.dps * p.damageMult * (1 + hero.offenseBuff)) /
    Math.max(base.dps * (1 + base.offenseBuff), 1);
  const durability =
    (p.maxHp / p.damageTakenMult + BALANCE_SUSTAIN_HORIZON_S * (p.regenPerSec + hero.hps)) /
    (cls.maxHp + BALANCE_SUSTAIN_HORIZON_S * base.hps);
  const mobility = p.moveSpeed / cls.moveSpeed;
  const extraClasses = Math.max(0, (p.classes?.length ?? 1) - 1);

  return (
    Math.pow(offense, BALANCE_W_OFFENSE) *
    Math.pow(durability, BALANCE_W_DURABILITY) *
    Math.pow(mobility, BALANCE_W_MOBILITY) *
    (1 + BALANCE_EXTRA_CLASS_BONUS * extraClasses)
  );
}

/** The band's overall power: the mean hero ratio (party size is scaled elsewhere). */
export function bandPowerRatio(players: readonly Player[]): number {
  if (players.length === 0) return 1;
  let sum = 0;
  for (const p of players) sum += heroPowerRatio(p);
  return sum / players.length;
}

/**
 * Encounters the band has cleared before this fight (each one granted every
 * hero a reward pair) — the x-axis of the expected-power curve. Endless keeps
 * counting: cycle `c`, slot `i` of an `n`-encounter run ⇒ `c·n + i` clears.
 */
export function runClears(cycle: number, runIndex: number, runTotal: number): number {
  return Math.max(0, cycle) * Math.max(1, runTotal) + Math.max(0, runIndex);
}

/** The band power the run is TUNED for after `clears` cleared encounters. */
export function expectedBandPower(clears: number): number {
  return Math.pow(1 + BALANCE_EXPECTED_GROWTH, Math.max(0, clears));
}

// ---------------------------------------------------------------------------
// Progression-aware boss sustain / invulnerability (items 2 & 5)
// ---------------------------------------------------------------------------

/** Numeric rank of a boss tier (easy < medium < hard) for difficulty gating. */
export function tierRank(tier: BossTier): number {
  return tier === 'hard' ? 2 : tier === 'medium' ? 1 : 0;
}

/**
 * Item 2 — the fraction of a boss's ACTIVE healing (burst self-heal, Life-Drain,
 * Vampiric) that survives this fight. Low early, so a fresh band that took on a
 * boss too soon (the Ancient Treant is the poster child) can always out-DPS its
 * sustain; ramps to 1 by `BOSS_HEAL_SCALE_FULL_CLEARS` cleared encounters, plus a
 * nudge from how far the band's realized power sits above the tuned curve — so late
 * or over-strong bands keep their sustain intact. Bounded to [MIN, 1].
 */
export function bossHealScale(clears: number, powerExcess: number): number {
  const progress = clamp(
    Math.max(0, clears) / BOSS_HEAL_SCALE_FULL_CLEARS + Math.max(0, powerExcess - 1) * 0.5,
    0,
    1,
  );
  return BOSS_HEAL_SCALE_MIN + (1 - BOSS_HEAL_SCALE_MIN) * progress;
}

/**
 * Item 5 — the descending HP-fraction windows at which a boss turns briefly
 * invulnerable, or `[]` when the mechanic is disabled. It fires only when BOTH:
 *   • the band is STRONG — some hero has a completed multiclass (an extra class
 *     with its two subclass skills) or ≥3 grand improvements (caller decides), and
 *   • the fight is HARDER / LATER — a medium+ tier boss, an endless cycle, or the
 *     band well ahead of the tuned curve.
 * A qualifying boss always gets the first window (guaranteed to fire before death);
 * the hardest fights (hard tier / endless / band far ahead) add a second, deeper
 * one. Never more than two, so total invuln uptime stays hard-bounded and winnable.
 */
export function bossInvulnThresholds(
  strongParty: boolean,
  tier: BossTier,
  cycle: number,
  powerExcess: number,
): number[] {
  const rank = tierRank(tier);
  const hardFight = rank >= 1 || cycle >= 1 || powerExcess >= BOSS_INVULN_POWER_HARD;
  if (!strongParty || !hardFight) return [];
  const out = [BOSS_INVULN_THRESHOLD_1];
  const veryHard = rank >= 2 || cycle >= 1 || powerExcess >= BOSS_INVULN_POWER_HARD + 0.15;
  if (veryHard) out.push(BOSS_INVULN_THRESHOLD_2);
  return out;
}

// ---------------------------------------------------------------------------
// Kill pace (feedback signal — host-side state, one number)
// ---------------------------------------------------------------------------

/** One finished encounter, as the pace tracker sees it. */
export interface EncounterSample {
  /** Sim seconds the encounter ran (World.elapsed at the end). */
  durationS: number;
  /** Bosses in the slot — a pack earns a stretched TTK target. */
  bossCount: number;
  /** Whether the band actually won (a wipe records a fixed struggle sample). */
  victory: boolean;
}

/**
 * A single victory's pace: target time ÷ actual time, so >1 = the band killed
 * faster than the run wants. Clamped so one cheese kill or one 10-minute slog
 * can't yank the signal to an extreme.
 */
export function encounterPace(durationS: number, bossCount: number): number {
  const target = BALANCE_TARGET_TTK * (1 + BALANCE_PACK_TTK_BONUS * Math.max(0, bossCount - 1));
  const pace = target / Math.max(durationS, BALANCE_TTK_FLOOR);
  return clamp(pace, BALANCE_PACE_SAMPLE_MIN, BALANCE_PACE_SAMPLE_MAX);
}

/**
 * Fold a finished encounter into the smoothed pace signal (EMA). A defeat
 * records BALANCE_DEFEAT_PACE — "this band is struggling" — so the retry (or
 * the next boss after a costly win elsewhere) eases off rather than piling on.
 */
export function recordEncounter(pace: number, sample: EncounterSample): number {
  const s = sample.victory
    ? encounterPace(sample.durationS, sample.bossCount)
    : BALANCE_DEFEAT_PACE;
  return pace + BALANCE_PACE_ALPHA * (s - pace);
}

// ---------------------------------------------------------------------------
// The adjustment
// ---------------------------------------------------------------------------

/** The bounded per-encounter adjustment the World multiplies into its scaling. */
export interface BalanceAdjust {
  /** Boss max-HP multiplier (≥ BALANCE_HP_MIN, ≤ BALANCE_HP_MAX). */
  hpMult: number;
  /** Boss outgoing-damage multiplier (≥ BALANCE_DMG_MIN, ≤ BALANCE_DMG_MAX). */
  dmgMult: number;
  /** The smoothed kill-pace signal that produced it (1 = on target). */
  pace: number;
  /** Band power ÷ expected curve, clamped (1 = exactly on the tuned curve). */
  powerExcess: number;
}

/** The no-op adjustment (tests, playground, menu scenes, un-hosted worlds). */
export const NEUTRAL_BALANCE: BalanceAdjust = Object.freeze({
  hpMult: 1,
  dmgMult: 1,
  pace: 1,
  powerExcess: 1,
});

/**
 * Blend the two signals into this encounter's boss scaling. HP soaks most of
 * the response (a longer fight reads as "worthy foe"); outgoing damage moves
 * less (extra boss damage punishes mistakes harder than extra HP does). The
 * power term compensates deviation from the expected curve asymmetrically —
 * firm above it, gentle slack below it — and everything is hard-capped.
 */
export function balanceAdjust(pace: number, bandPower: number, clears: number): BalanceAdjust {
  const powerExcess = clamp(
    bandPower / expectedBandPower(clears),
    BALANCE_POWER_EXCESS_MIN,
    BALANCE_POWER_EXCESS_MAX,
  );
  const comp = Math.pow(
    powerExcess,
    powerExcess >= 1 ? BALANCE_POWER_COMP_UP : BALANCE_POWER_COMP_DOWN,
  );
  const hpMult = clamp(Math.pow(pace, BALANCE_PACE_HP_EXP) * comp, BALANCE_HP_MIN, BALANCE_HP_MAX);
  const dmgMult = clamp(
    Math.pow(pace, BALANCE_PACE_DMG_EXP) * Math.pow(comp, BALANCE_POWER_DMG_FRAC),
    BALANCE_DMG_MIN,
    BALANCE_DMG_MAX,
  );
  return { hpMult, dmgMult, pace, powerExcess };
}
