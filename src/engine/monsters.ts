/**
 * Warband — data-driven monster (boss) definitions + AI decision functions.
 * Base numbers are n=1; player-count scaling (scaling.ts) is applied at fight
 * start and to boss outgoing damage.
 */
import type { MonsterId, Boss, Player } from './types';
import type { Rng } from './math';
import { MONSTER_COLORS } from './constants';

export type BossAbilityShape =
  | 'cone'
  | 'circleAtTarget' // circle centered on target's position
  | 'pbaoe' // circle around the boss
  | 'line' // charge / dash line
  | 'projectile'
  | 'summon'
  | 'voidzones'
  | 'beam'; // channeled beam (Life Drain)

export interface BossAbilityDef {
  id: string;
  name: string;
  shape: BossAbilityShape;
  windup: number; // s (0 = instant, no telegraph)
  cooldown: number; // s
  damage: number; // base per-hit (or per-tick for beam)
  range?: number; // cone range / line length / target reach
  radius?: number; // circle / pbaoe / impact radius
  halfAngleDeg?: number;
  width?: number; // line half-width
  knockback?: number;
  stun?: number;
  slowMult?: number;
  slowDuration?: number;
  projSpeed?: number;
  chargeSpeed?: number; // line dash speed (troll charge)
  minHpFrac?: number; // usable only at/below this HP fraction
  targetRandom?: boolean; // target a random player instead of highest threat
  // summon / zones
  countScaling?: 'adds' | 'zones';
  zoneDuration?: number;
  zoneTickDamage?: number;
  // beam channel
  channelDuration?: number;
  healSelf?: boolean;
}

export interface BossDecisionCtx {
  boss: Boss;
  hpFrac: number;
  target: Player | null; // highest-threat alive player
  distToTarget: number; // Infinity if no target
  anyInMelee: boolean;
  usable: (id: string) => boolean; // off cooldown + hp gate satisfied
  rng: Rng;
}

export interface MonsterDef {
  id: MonsterId;
  name: string;
  theme: string;
  difficulty: string;
  color: number;
  baseHp: number;
  radius: number;
  moveSpeed: number;
  regen: number; // HP/s base
  meleeRange: number; // distance (center-to-center) considered "in melee"
  enrageThreshold: number; // hp fraction
  enrageCooldownMult: number;
  enrageRegenMult: number;
  abilities: BossAbilityDef[];
  decide: (ctx: BossDecisionCtx) => string | null;
  blink?: { range: number; threatenRange: number; internalCd: number };
}

// ---------------------------------------------------------------------------
// Ancient Dragon — default; balanced fire bruiser (Medium)
// ---------------------------------------------------------------------------
const DRAGON: MonsterDef = {
  id: 'dragon',
  name: 'Ancient Dragon',
  theme: 'A hulking wyrm wreathed in flame.',
  difficulty: 'Medium',
  color: MONSTER_COLORS.dragon,
  baseHp: 2600,
  radius: 72,
  moveSpeed: 120,
  regen: 0,
  meleeRange: 170,
  enrageThreshold: 0.25,
  enrageCooldownMult: 0.7,
  enrageRegenMult: 1,
  abilities: [
    {
      id: 'fireBreath',
      name: 'Fire Breath',
      shape: 'cone',
      windup: 1.2,
      cooldown: 6,
      damage: 55,
      range: 400,
      halfAngleDeg: 30,
    },
    {
      id: 'fireball',
      name: 'Fireball',
      shape: 'circleAtTarget',
      windup: 1.0,
      cooldown: 4,
      damage: 45,
      range: 700,
      radius: 110,
    },
    {
      id: 'tailSweep',
      name: 'Tail Sweep',
      shape: 'pbaoe',
      windup: 0.9,
      cooldown: 8,
      damage: 40,
      radius: 160,
      knockback: 120,
    },
    {
      id: 'wingGust',
      name: 'Wing Gust',
      shape: 'pbaoe',
      windup: 1.5,
      cooldown: 14,
      damage: 15,
      radius: 300,
      knockback: 200,
      minHpFrac: 0.5,
    },
  ],
  decide: ({ usable, anyInMelee, distToTarget, hpFrac, rng }) => {
    if (hpFrac <= 0.5 && usable('wingGust') && rng.next() < 0.5) return 'wingGust';
    if (anyInMelee && usable('tailSweep')) return 'tailSweep';
    if (usable('fireBreath') && distToTarget <= 420) return 'fireBreath';
    if (usable('fireball')) return 'fireball';
    if (anyInMelee && usable('tailSweep')) return 'tailSweep';
    return null;
  },
};

// ---------------------------------------------------------------------------
// Forest Troll — DPS & positioning check (Medium-Hard)
// ---------------------------------------------------------------------------
const TROLL: MonsterDef = {
  id: 'troll',
  name: 'Forest Troll',
  theme: 'A raging ogre that regenerates relentlessly.',
  difficulty: 'Medium-Hard',
  color: MONSTER_COLORS.troll,
  baseHp: 2200,
  radius: 60,
  moveSpeed: 150,
  regen: 8,
  meleeRange: 150,
  enrageThreshold: 0.3,
  enrageCooldownMult: 0.6,
  enrageRegenMult: 2,
  abilities: [
    {
      id: 'smash',
      name: 'Smash',
      shape: 'cone',
      windup: 0.8,
      cooldown: 2.5,
      damage: 45,
      range: 90,
      halfAngleDeg: 45,
    },
    {
      id: 'charge',
      name: 'Charge',
      shape: 'line',
      windup: 1.0,
      cooldown: 7,
      damage: 50,
      range: 700,
      width: 45,
      chargeSpeed: 600,
      knockback: 120,
      targetRandom: true,
    },
    {
      id: 'groundSlam',
      name: 'Ground Slam',
      shape: 'pbaoe',
      windup: 1.1,
      cooldown: 6,
      damage: 40,
      radius: 200,
    },
  ],
  decide: ({ usable, anyInMelee, rng }) => {
    if (anyInMelee) {
      if (usable('groundSlam') && rng.next() < 0.4) return 'groundSlam';
      if (usable('smash')) return 'smash';
      if (usable('groundSlam')) return 'groundSlam';
      return null;
    }
    // kiter — punish range
    if (usable('charge')) return 'charge';
    if (usable('groundSlam')) return 'groundSlam';
    return null;
  },
};

// ---------------------------------------------------------------------------
// Lich — adds & chaos; positioning puzzle (Hard)
// ---------------------------------------------------------------------------
const LICH: MonsterDef = {
  id: 'lich',
  name: 'Lich',
  theme: 'An undead sorcerer that floods the arena with the dead.',
  difficulty: 'Hard',
  color: MONSTER_COLORS.lich,
  baseHp: 1900,
  radius: 56,
  moveSpeed: 130,
  regen: 0,
  meleeRange: 130,
  enrageThreshold: 0.2,
  enrageCooldownMult: 0.7,
  enrageRegenMult: 1,
  blink: { range: 300, threatenRange: 100, internalCd: 5 },
  abilities: [
    {
      id: 'shadowBolt',
      name: 'Shadow Bolt',
      shape: 'projectile',
      windup: 0,
      cooldown: 2.0,
      damage: 30,
      projSpeed: 420,
    },
    {
      id: 'summonSkeletons',
      name: 'Summon Skeletons',
      shape: 'summon',
      windup: 1.5,
      cooldown: 12,
      damage: 0,
      countScaling: 'adds',
    },
    {
      id: 'voidZone',
      name: 'Void Zone',
      shape: 'voidzones',
      windup: 0,
      cooldown: 9,
      damage: 0,
      radius: 90,
      countScaling: 'zones',
      zoneDuration: 8,
      zoneTickDamage: 12,
      targetRandom: true,
    },
    {
      id: 'lifeDrain',
      name: 'Life Drain',
      shape: 'beam',
      windup: 0.8,
      cooldown: 10,
      damage: 15,
      range: 500,
      width: 24,
      channelDuration: 2,
      healSelf: true,
    },
  ],
  decide: ({ usable, target }) => {
    if (usable('summonSkeletons')) return 'summonSkeletons';
    if (usable('voidZone')) return 'voidZone';
    if (usable('lifeDrain') && target) return 'lifeDrain';
    if (usable('shadowBolt') && target) return 'shadowBolt';
    return null;
  },
};

export const MONSTERS: Record<MonsterId, MonsterDef> = {
  dragon: DRAGON,
  troll: TROLL,
  lich: LICH,
};

export const MONSTER_IDS: MonsterId[] = ['dragon', 'troll', 'lich'];
export const DEFAULT_MONSTER: MonsterId = 'dragon';

export function getMonster(id: MonsterId): MonsterDef {
  return MONSTERS[id];
}

export function abilityById(def: MonsterDef, id: string): BossAbilityDef | undefined {
  return def.abilities.find((a) => a.id === id);
}
