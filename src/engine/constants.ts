/**
 * Warband — ALL tunable numbers live here (plus classes.ts / monsters.ts which
 * import from here). Everything is a starting balance point meant to be nudged.
 */
import type { MonsterId } from './types';

// --- Simulation ---
export const SIM_TICK_RATE = 20; // Hz
export const SIM_DT = 1 / SIM_TICK_RATE; // 0.05 s
export const SNAPSHOT_RATE = 20; // Hz (host -> clients)

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
/** Chance a mid-run slot rolls a twin encounter (scales up in endless). */
export const TWIN_BASE_CHANCE = 0.22;
export const TWIN_CHANCE_PER_CYCLE = 0.12;
export const TWIN_CHANCE_MAX = 0.6;

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
