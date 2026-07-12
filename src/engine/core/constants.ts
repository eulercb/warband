/**
 * Warband — ALL tunable numbers live here (plus classes.ts / monsters.ts which
 * import from here). Everything is a starting balance point meant to be nudged.
 */
import type { MonsterId } from './types';

// --- Simulation ---
export const SIM_TICK_RATE = 20; // Hz
export const SIM_DT = 1 / SIM_TICK_RATE; // 0.05 s
export const SNAPSHOT_RATE = 20; // Hz (host -> clients)

// --- Pacing / weight of blows (see spawnPlayers / spawnBosses) ---
/**
 * Global slow-down for the twitchy "attack" abilities (basic + the direct-damage
 * A1/A2/A3s). Doubling their cooldowns makes each blow land less often but read
 * as a heavier hit; boss HP is reduced by BOSS_HP_SCALE to keep a fight's overall
 * length roughly the same. Sustain / mobility / heal cooldowns are untouched so
 * the slower pace doesn't quietly make the band more fragile.
 */
export const ATTACK_CD_SCALE = 2;
/** Boss max-HP multiplier that pairs with ATTACK_CD_SCALE to hold fight length. */
export const BOSS_HP_SCALE = 0.6;

/**
 * A boss's passive regen is SUPPRESSED for this long after it takes any damage,
 * so a band that keeps up the pressure always out-DPSes the heal and the fight
 * can't drag; step away and the boss slowly knits itself back together. Also caps
 * the fraction of max HP a boss may regenerate per second so no boss out-heals
 * a committed party.
 */
export const BOSS_REGEN_LOCKOUT_S = 3.5;
export const BOSS_REGEN_MAX_FRAC = 0.006; // ≤ 0.6% max HP / s regardless of `regen`

/** Class SKILL stacking cap: the same class/graft upgrade can be taken at most this many times. */
export const MAX_SKILL_STACKS = 5;

// --- Arena ---
export const ARENA_W = 1600; // world units
export const ARENA_H = 1000;
export const PLAYER_RADIUS = 16;

// --- Input / netcode ---
export const DEAD_ZONE = 0.15;
export const INTERP_DELAY_MS = 100;
export const INPUT_SEND_RATE = 30; // Hz (client -> host)

// --- Boss AI ---
export const BOSS_DECISION_MIN = 1.2; // s between ability decisions when idle
export const BOSS_RECOVER_TIME = 0.4; // s after an ability resolves

// --- Downed / revive ---
export const DOWNED_BLEEDOUT = 20; // s
export const REVIVE_RANGE = 60; // u
export const REVIVE_TIME = 3; // s continuous hold
export const REVIVE_HP_FRAC = 0.4;

// --- Threat ---
export const THREAT_DECAY = 0.05; // fraction/s
export const HEAL_THREAT_FACTOR = 0.5; // heal * this * classThreatMult
export const TAUNT_THREAT_MARGIN = 100; // added on top of current max threat

// --- Ground zones ---
// The spec says zones tick "each sim tick"; a per-half-second tick keeps the
// listed per-tick numbers legible and fair (a full sim-tick cadence would be
// 20x and instantly lethal). Tunable.
export const ZONE_TICK_INTERVAL = 0.5; // s
// Purely visual: zones ease IN over their first `ZONE_FADE_IN` seconds and ease
// OUT over their last `ZONE_FADE_OUT` seconds so they clearly appear and then
// disappear after a while instead of popping in/out. The simulation still uses
// the zone's full duration for ticks/hit-tests; only the drawn opacity fades.
export const ZONE_FADE_IN = 0.2; // s
export const ZONE_FADE_OUT = 0.6; // s

// --- Terrain (static per-run environmental hazards) ---
// Terrain patches are generated once at fight start from the run seed (so host
// and clients agree) and themed by the boss. They slow and/or damage players
// who stand in them. Damage ticks at this cadence (matches ground zones).
export const TERRAIN_TICK_INTERVAL = 0.5; // s
export const TERRAIN_MIN_PATCHES = 3;
/** Hard cap across every layout archetype (rivers/rings use many small blobs). */
export const TERRAIN_MAX_PATCHES = 9;
export const TERRAIN_MIN_RADIUS = 90; // world units
export const TERRAIN_MAX_RADIUS = 180;
/** Keep terrain away from the party's spawn strip and the boss's opening spot. */
export const TERRAIN_SPAWN_CLEARANCE = 220; // u around player spawn / boss center

// --- Obstacles (static per-run cover that blocks ranged attacks) ---
// Solid rubble/pillars generated once from the run seed. Projectiles crossing
// one are absorbed, so players can break line of sight and take cover. They do
// not block movement.
export const OBSTACLE_MIN_COUNT = 2;
export const OBSTACLE_MAX_COUNT = 4;
export const OBSTACLE_MIN_RADIUS = 40; // world units
export const OBSTACLE_MAX_RADIUS = 74;
/** Keep obstacles clear of the spawn strip and the boss's opening spot. */
export const OBSTACLE_SPAWN_CLEARANCE = 170; // u

// --- Gauntlet (sequence run) ---
// Legacy fixed order (kept for reference / single-picks). A modern "run" is now
// a curated 5-boss sequence assembled by difficulty tier (see monsters.ts
// `buildRun`), and continues into Endless cycles after the fifth boss falls.
export const GAUNTLET_ORDER: MonsterId[] = ['dragon', 'troll', 'lich'];

/** Bosses in a single run (a full run = this many bosses, then Victory/Endless). */
export const RUN_LENGTH = 5;

/**
 * Endless mode: after clearing a full run the party may press on into escalating
 * cycles. Each cycle multiplies boss HP and outgoing damage and applies an
 * elemental "type" to every boss (Frost Dragon, Dark Troll, …). Carried upgrades
 * and the accumulated score persist across cycles.
 */
export const ENDLESS_HP_PER_CYCLE = 0.35; // +35% boss HP per completed cycle
export const ENDLESS_DMG_PER_CYCLE = 0.18; // +18% boss damage per completed cycle

/**
 * Seconds the victory interstitial lingers before the next fight. It is no longer
 * an auto-advance timer — the run only proceeds once every player has marked
 * themselves ready for the next boss (mirrors the lobby ready-gate). Kept as the
 * cosmetic elapsed counter shown on the upgrade screen.
 */
export const GAUNTLET_INTERSTITIAL_S = 12;

// --- Player score (participation, accumulates across a run / endless) ---
export const SCORE_HEAL_FACTOR = 1.0; // effective healing counts 1:1 with damage
export const SCORE_PER_REVIVE = 250; // each revive
export const SCORE_PER_DEATH = 60; // subtracted per death (never below 0 overall)
export const SCORE_BOSS_CLEAR = 500; // flat bonus banked when a boss falls

// --- Ranged attacks: hard travel cap so no shot laps the torus forever ---
/**
 * Default maximum distance (world units) a ranged projectile may travel before it
 * fizzles, independent of its lifetime. Kept below a full arena lap so a shot can
 * never wrap all the way around the torus and strike the caster from behind.
 * Individual abilities may specify a shorter `range`.
 */
export const PROJECTILE_MAX_RANGE = 820;

// --- Pause / resume ---
/** Countdown (seconds) shown to everyone before the shared sim resumes. */
export const RESUME_COUNTDOWN_S = 3;

// --- Bots (host-simulated AI party members) ---
export const BOT_NAME_PREFIX = 'Bot';
/** Ranged bots try to hold roughly this distance from the boss. */
export const BOT_RANGED_STANDOFF = 340; // u
/** Melee (knight) bots close to within this distance of the boss. */
export const BOT_MELEE_RANGE = 120; // u
/** A bot reacts to a downed ally within this distance to res them. */
export const BOT_REVIVE_RANGE = 340; // u

// --- Attack-pattern fairness governor (see world/grammar.ts) ---
// A twitch fight must stay dodgeable: a boss won't START a big telegraphed attack
// aimed at a spot another hostile telegraph (a twin's cast, a corruption strike)
// is already threatening within this gap — unless it is ENRAGED, when composing
// telegraphs into a wall is a deliberate pressure beat. Inert for a lone boss.
export const FAIR_TELEGRAPH_GAP = 175; // world units between overlapping impacts

// --- Stalemate breaker ---
export const SOFT_ENRAGE_TIME = 300; // s — after this, escalating boss damage
export const SOFT_ENRAGE_RAMP = 0.05; // +5%/s boss outgoing damage past the threshold

// --- Stun diminishing returns (applies to players, bosses AND adds) ---
// Chain-stunning the same target gets weaker each time: every successive stun
// landed within the rolling window keeps only STUN_DR_FACTOR of the previous
// effective duration. Once the effective duration would drop below
// STUN_DR_FLOOR the stun is fully resisted (a `stunResist` event fires so the
// resist is readable). The counter resets after STUN_DR_WINDOW seconds without
// any new stun landing. Keeps Daze/Shield Bash/Deep Freeze strong openers
// without letting a rotation freeze a boss (or a hero) forever.
export const STUN_DR_FACTOR = 0.5; // each chained stun keeps 50% of the last
export const STUN_DR_WINDOW = 14; // s without stuns before the falloff resets
export const STUN_DR_FLOOR = 0.2; // s — anything shorter is resisted outright

// --- Twin (shared-arena) boss encounters ---
// A twin encounter splits the danger budget: each boss spawns with a fraction
// of its solo HP and deals a fraction of its solo damage, so two-at-once stays
// chaotic but survivable.
export const TWIN_HP_FRAC = 0.62;
export const TWIN_DMG_FRAC = 0.8;
/** Chance a mid-run slot rolls a MULTI-boss encounter (scales up in endless). */
export const TWIN_BASE_CHANCE = 0.38;
export const TWIN_CHANCE_PER_CYCLE = 0.14;
export const TWIN_CHANCE_MAX = 0.75;
/**
 * Once a slot has rolled into a multi-boss fight, each EXTRA co-boss beyond the
 * second is added with this probability (so triplets — and, rarely, quads —
 * become possible), tapering by TWIN_EXTRA_FALLOFF per additional boss and rising
 * with the endless cycle. Capped at TWIN_MAX_BOSSES total. Each boss in an N-pack
 * is weakened further (see spawnBosses) so a swarm stays chaotic, not lethal.
 */
export const TWIN_EXTRA_CHANCE = 0.3;
export const TWIN_EXTRA_FALLOFF = 0.45; // each further boss is much less likely
export const TWIN_EXTRA_PER_CYCLE = 0.06;
export const TWIN_MAX_BOSSES = 4;

// --- Boss-vs-boss synergy (twin / N-boss packs; see world.updateBossSynergy) ---
// While two or more bosses share the arena they stop ignoring each other: on a
// seeded cadence the healthiest boss forms a telegraphed BOND to a wounded
// partner and, if BOTH survive the wind-up, empowers (harder hits) or wards
// (tankier) it. The bond only resolves while both are alive, so killing the
// caster mid wind-up cancels the pulse — a duo becomes more than two solos, but
// it stays readable and interruptible. Host-authoritative + seeded; composes
// with affixes (distinct buff sources). Inert for a lone boss.
export const SYNERGY_FIRST_DELAY = 7; // s before the first pack bond can form
export const SYNERGY_INTERVAL = 10; // s between bond pulses
export const SYNERGY_WINDUP = 1.6; // s telegraphed, interruptible wind-up
export const SYNERGY_BUFF_DURATION = 6; // s the granted bond buff lasts
export const SYNERGY_EMPOWER_MULT = 1.35; // partner's outgoing-damage mult while bonded
export const SYNERGY_WARD_MULT = 0.6; // partner's incoming-damage mult while bonded

// --- Terrain surge (abyss void + Kraken tide; see world.updateTerrainSurge) ---
// The signature hazards stop being pure damage-over-time and become positioning
// threats. On a seeded cadence a surge telegraphs (a filling ring the band can
// flee) then PULLS every hero still inside toward the hazard's heart. The abyss
// has a bottomless CORE — a hero dragged into it plunges to an environmental
// death (Furi/Hades pit); the tide only hauls you deeper into the drowning water.
export const TERRAIN_ABYSS_CORE_FRAC = 0.5; // lethal core radius as a frac of the patch
export const TERRAIN_SURGE_INTERVAL = 7.5; // s between surges
export const TERRAIN_SURGE_FUSE = 1.5; // s telegraphed wind-up before the pull
export const ABYSS_SURGE_PULL = 210; // u a caught hero is dragged toward the core
export const ABYSS_SURGE_DAMAGE = 10; // surge contact damage (scaled), on top of the pull
export const ABYSS_PLUNGE_DAMAGE = 100000; // effectively lethal — a plunge into the void
export const TIDE_SURGE_PULL = 150; // u the tide hauls a hero deeper (never lethal)
export const TIDE_SURGE_DAMAGE = 9; // extra drowning damage from a tide surge
// The vampire's blood-mire and the demon's brimstone fissures surge too (item 28
// follow-up): a telegraphed, non-lethal drag toward the hazard's heart, so more
// marquee bosses fight on ground that threatens position, not just chip damage.
export const BLOODMIRE_SURGE_PULL = 140; // u the mire drags a hero toward the pool
export const BLOODMIRE_SURGE_DAMAGE = 10; // extra exsanguination damage on a surge
export const BRIMSTONE_SURGE_PULL = 160; // u the fissure sucks a hero toward the vent
export const BRIMSTONE_SURGE_DAMAGE = 12; // extra scorch damage on a surge

// --- Boss affixes (rolled at fight-gen; see content/affixes.ts + world.ts) ---
// Each affix bends the same boss into a different fight. All numbers are starting
// balance points. Cadence timers accumulate in `boss.affixTimers`.
/** Vampiric: boss heals this fraction of the damage its attacks deal to players. */
export const AFFIX_VAMPIRIC_FRAC = 0.35;
/** Frenzied: attacks up to this much faster, ramping in as HP falls below half. */
export const AFFIX_FRENZY_MAX_CDR = 0.45; // 0.45 => cooldowns as low as 55%
/** Splitting: seconds between the bonus add waves it calls on top of its kit. */
export const AFFIX_SPLIT_INTERVAL = 11;
/** Volatile: a lingering pool dropped at each telegraphed impact. */
export const AFFIX_VOLATILE_ZONE_DURATION = 5;
export const AFFIX_VOLATILE_TICK = 11; // per-0.5s tick damage inside the pool
export const AFFIX_VOLATILE_RADIUS = 95;
/** Molten: a short-lived burning patch trailed as the boss walks. */
export const AFFIX_MOLTEN_INTERVAL = 0.85; // s between trail drops
export const AFFIX_MOLTEN_ZONE_DURATION = 3;
export const AFFIX_MOLTEN_TICK = 9;
export const AFFIX_MOLTEN_RADIUS = 62;
/** Warding: a periodic damage-absorbing ward (a damage-taken buff). */
export const AFFIX_WARD_INTERVAL = 12; // s between wards
export const AFFIX_WARD_DEF_MULT = 0.55; // incoming-damage mult while warded
export const AFFIX_WARD_DURATION = 4;
/** Accelerating: move speed ramps the longer the fight drags on. */
export const AFFIX_ACCEL_RAMP = 0.012; // +1.2%/s of base move speed
export const AFFIX_ACCEL_MAX = 1.6; // capped at +60%
/** Overcharged: telegraph + hit radius/range swell by this factor. */
export const AFFIX_OVERCHARGE_SCALE = 1.4;
/** Barbed: a retaliation pulse whose damage scales with recently-soaked damage. */
export const AFFIX_BARBED_INTERVAL = 3; // s between thorn pulses
export const AFFIX_BARBED_RADIUS = 210;
export const AFFIX_BARBED_FRAC = 0.5; // pulse dmg = this × recent damage soaked
export const AFFIX_BARBED_MAX = 55; // cap per pulse (before scaling)
export const AFFIX_BARBED_MEMORY = 2; // s half-life-ish window for "recent" damage
/** Teleporting: a synthetic blink granted even to bosses that can't normally. */
export const AFFIX_TELEPORT_CD = 4.5; // internal cooldown (s)
export const AFFIX_TELEPORT_RANGE = 300;
export const AFFIX_TELEPORT_THREATEN = 130; // blink when a hero is this close
export const AFFIX_TELEPORT_CD_MULT = 0.6; // shortens an existing blinker's cd too

// --- Mid-fight corruption events (see world/corruption.ts) ---
// Seeded beats that fire during a fight to keep a familiar boss unpredictable.
// Only active when the World is created with `corruption: true` (host enables it
// for gauntlet slots past the opener and every endless cycle).
/** Grace period (s) before the first corruption beat can fire. */
export const CORRUPTION_FIRST_DELAY = 22;
/** Baseline seconds between beats (randomised ±CORRUPTION_INTERVAL_JITTER). */
export const CORRUPTION_INTERVAL = 26;
export const CORRUPTION_INTERVAL_JITTER = 8;
/** Each endless cycle shortens the gap between beats by this fraction (capped). */
export const CORRUPTION_CYCLE_SPEEDUP = 0.12;
export const CORRUPTION_MIN_INTERVAL = 12; // s — the fastest the cadence gets
/** Telegraph-rain: strike count + per-strike geometry / fuse / damage. */
export const CORRUPTION_RAIN_COUNT = 5;
export const CORRUPTION_RAIN_RADIUS = 105;
export const CORRUPTION_RAIN_FUSE = 1.5;
export const CORRUPTION_RAIN_DAMAGE = 34;
/** Vent eruption: erupting hazard count + lingering pool profile. */
export const CORRUPTION_VENT_COUNT = 4;
export const CORRUPTION_VENT_RADIUS = 96;
export const CORRUPTION_VENT_FUSE = 1.7;
export const CORRUPTION_VENT_DAMAGE = 26;
export const CORRUPTION_VENT_POOL_DURATION = 6;
export const CORRUPTION_VENT_POOL_TICK = 12;
/** Collapsing arena: ring radius, strike count and fuse. */
export const CORRUPTION_COLLAPSE_RADIUS = 430;
export const CORRUPTION_COLLAPSE_COUNT = 10;
export const CORRUPTION_COLLAPSE_FUSE = 2.2;
export const CORRUPTION_COLLAPSE_DAMAGE = 40;
/** Enrage surge: temporary boss empower window. */
export const CORRUPTION_SURGE_DURATION = 9;
export const CORRUPTION_SURGE_DMG_MULT = 1.4;
export const CORRUPTION_SURGE_MOVE_MULT = 1.25;
/** Healing rift: the benevolent beat — a player-side heal pool. */
export const CORRUPTION_RIFT_RADIUS = 120;
export const CORRUPTION_RIFT_DURATION = 8;
export const CORRUPTION_RIFT_TICK_HEAL = 22;
/** Add swarm: how many extra minions boil up (before player-count scaling). */
export const CORRUPTION_SWARM_COUNT = 3;

// --- Hardcore mode (item 11) ---
// A deadlier run for aggressive players. There's an EXPECTED kill time per boss;
// corruption beats already come more often, and ACCELERATE the longer a fight
// drags past that budget, so a party that can't close the kill drowns in beats.
// That death spiral is the WARNING; a hard kill-DEADLINE is the wall — let the
// clock run out with a boss still standing and the band wipes to defeat.
// Revives are limited per fight and a wipe has no free retry (the run ends).
/** Baseline corruption cadence multiplier in hardcore (< 1 = more frequent). */
export const HARDCORE_CORRUPTION_MULT = 0.55;
/** Expected seconds to fell a boss; beats accelerate once the fight runs longer. */
export const HARDCORE_TIME_BUDGET = 75;
/** Seconds-over-budget that halves the gap between beats (the death spiral). */
export const HARDCORE_RAMP_TAU = 45;
/** Floor on the beat interval in hardcore, so it stays dodgeable, never instant. */
export const HARDCORE_MIN_INTERVAL = 3.5;
/** Revives a hardcore band gets per fight before a downed hero is lost for good. */
export const HARDCORE_REVIVES_PER_FIGHT = 2;
// Hard kill-DEADLINE. Multiples of the expected-kill budget above: a lone boss
// must fall within HARDCORE_DEADLINE_MULT × budget, and a shared-arena pack earns
// HARDCORE_DEADLINE_PACK_BONUS × budget for each EXTRA boss (more health bars to
// chew through). The budget is a flat time (party DPS already scales with the
// boss-HP knobs — player count, tier, endless cycle), so the deadline stays flat
// too rather than double-counting HP. Single boss ⇒ 75·2.4 = 180 s; twin ⇒ 225 s.
export const HARDCORE_DEADLINE_MULT = 2.4;
export const HARDCORE_DEADLINE_PACK_BONUS = 0.6;
/** Seconds-remaining under which the HUD countdown flips to its urgent (red) state. */
export const HARDCORE_DEADLINE_WARN = 30;

// --- Adds (skeletons) ---
export const ADD_HP = 60;
export const ADD_MOVE_SPEED = 160;
export const ADD_RADIUS = 12;
export const ADD_DAMAGE = 10;
export const ADD_ATTACK_CD = 1.0; // s
export const ADD_ATTACK_RANGE = 26; // u reach beyond radii

// --- Physics ---
export const SEPARATION_ITERATIONS = 2;
export const KNOCKBACK_FRICTION = 0; // knockback is applied instantly as displacement

// --- Class colors (PixiJS hex) ---
export const CLASS_COLORS: Record<string, number> = {
  knight: 0x4a90d9, // steel blue
  ranger: 0x4caf50, // green
  mage: 0x9c5cf0, // violet
  cleric: 0xf2c14e, // gold
  barbarian: 0xd9713e, // burnt orange
  rogue: 0x8a8f98, // slate grey
  paladin: 0xe8d36a, // radiant gold-white
  druid: 0x5bbf7a, // moss green
  bard: 0xe083c8, // orchid
  monk: 0x2fb8a6, // teal
  sorcerer: 0xff7043, // deep orange
  warlock: 0x6d3fa0, // indigo-violet
};

// --- Monster colors ---
export const MONSTER_COLORS: Record<string, number> = {
  dragon: 0xd9463e, // red
  troll: 0x6b8e23, // olive/brown-green
  lich: 0x3a2f5b, // dark violet
};

// --- Player-count scaling coefficients (see scaling.ts) ---
export const SCALE_HP_PER_PLAYER = 0.75;
export const SCALE_DMG_PER_PLAYER = 0.12;
export const SCALE_TROLL_REGEN_PER_PLAYER = 0.5;

export const MAX_PLAYERS = 4;
