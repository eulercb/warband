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
export const TERRAIN_MAX_PATCHES = 5;
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
// Order the bosses are fought in when the host enables a gauntlet run. A run
// starts at the host's chosen boss and proceeds through the rest of this list.
export const GAUNTLET_ORDER: MonsterId[] = ['dragon', 'troll', 'lich'];
/**
 * Seconds the victory interstitial lingers before the next gauntlet fight. This
 * doubles as the window in which each hero picks a between-boss upgrade, so it
 * is generous enough for everyone to choose (host can skip with "Continue now").
 */
export const GAUNTLET_INTERSTITIAL_S = 12;

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
