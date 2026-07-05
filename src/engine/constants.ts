/**
 * Warband — ALL tunable numbers live here (plus classes.ts / monsters.ts which
 * import from here). Everything is a starting balance point meant to be nudged.
 */

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
