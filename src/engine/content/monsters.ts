/**
 * Warband — data-driven monster (boss) definitions + AI decision functions.
 * Base numbers are n=1; player-count scaling (scaling.ts) is applied at fight
 * start and to boss outgoing damage. Endless "type" modifiers (Frost Dragon,
 * Dark Troll, …) are layered on per cycle — see CYCLE_MODIFIERS / applyModifier.
 */
import type { MonsterId, Boss, Player, BossTier, BossBodyShape } from '../core/types';
import type { Rng } from '../core/math';
import {
  MONSTER_COLORS,
  RUN_LENGTH,
  TWIN_BASE_CHANCE,
  TWIN_CHANCE_PER_CYCLE,
  TWIN_CHANCE_MAX,
  TWIN_EXTRA_CHANCE,
  TWIN_EXTRA_FALLOFF,
  TWIN_EXTRA_PER_CYCLE,
  TWIN_MAX_BOSSES,
} from '../core/constants';

export type BossAbilityShape =
  | 'cone'
  | 'circleAtTarget' // circle centered on target's position
  | 'pbaoe' // circle around the boss
  | 'line' // charge / dash line
  | 'projectile'
  | 'summon'
  | 'voidzones'
  | 'beam' // channeled beam (Life Drain)
  | 'buffSelf'; // self buff / self-heal (frenzy, regenerate, ward)

export interface BossAbilityDef {
  id: string;
  name: string;
  shape: BossAbilityShape;
  windup: number; // s (0 = instant, no telegraph)
  cooldown: number; // s
  damage: number; // base per-hit (or per-tick for beam)
  range?: number; // cone range / line length / target reach / projectile travel cap
  radius?: number; // circle / pbaoe / impact radius
  halfAngleDeg?: number;
  width?: number; // line half-width
  knockback?: number;
  stun?: number; // applied to players hit by cone/pbaoe
  silence?: number; // seconds of SILENCE applied to players hit (item 28) — caster bosses
  slowMult?: number; // on-hit slow (frost bosses); applied to projectiles/zones too
  slowDuration?: number;
  projSpeed?: number;
  projCount?: number; // fan / volley count for projectile shape
  spreadDeg?: number; // fan spread for projectile shape
  chargeSpeed?: number; // line dash speed (troll charge)
  minHpFrac?: number; // usable only at/below this HP fraction
  targetRandom?: boolean; // target a random player instead of highest threat
  // summon / zones
  countScaling?: 'adds' | 'zones';
  addCountBonus?: number; // extra minions beyond the scaled count
  addHpMult?: number; // tougher minions
  addSpeedMult?: number; // faster minions
  zoneCountBonus?: number;
  zoneDuration?: number;
  zoneTickDamage?: number;
  // beam channel
  channelDuration?: number;
  healSelf?: boolean;
  // buffSelf
  buffMoveMult?: number;
  buffDamageMult?: number;
  buffDefMult?: number;
  buffDuration?: number;
  selfHealFrac?: number; // heal boss by this fraction of maxHp
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
  tier: BossTier;
  /** Excluded from run pools and pickers (e.g. the playground training dummy). */
  hidden?: boolean;
  bodyShape: BossBodyShape;
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
// Ability builders (terse constructors so 30+ bosses stay readable)
// ---------------------------------------------------------------------------

type Extra = Partial<BossAbilityDef>;
const A = {
  cone: (
    id: string,
    name: string,
    windup: number,
    cd: number,
    dmg: number,
    range: number,
    half: number,
    x: Extra = {},
  ): BossAbilityDef => ({
    id,
    name,
    shape: 'cone',
    windup,
    cooldown: cd,
    damage: dmg,
    range,
    halfAngleDeg: half,
    ...x,
  }),
  circle: (
    id: string,
    name: string,
    windup: number,
    cd: number,
    dmg: number,
    range: number,
    radius: number,
    x: Extra = {},
  ): BossAbilityDef => ({
    id,
    name,
    shape: 'circleAtTarget',
    windup,
    cooldown: cd,
    damage: dmg,
    range,
    radius,
    ...x,
  }),
  nova: (
    id: string,
    name: string,
    windup: number,
    cd: number,
    dmg: number,
    radius: number,
    x: Extra = {},
  ): BossAbilityDef => ({
    id,
    name,
    shape: 'pbaoe',
    windup,
    cooldown: cd,
    damage: dmg,
    radius,
    ...x,
  }),
  line: (
    id: string,
    name: string,
    windup: number,
    cd: number,
    dmg: number,
    range: number,
    width: number,
    x: Extra = {},
  ): BossAbilityDef => ({
    id,
    name,
    shape: 'line',
    windup,
    cooldown: cd,
    damage: dmg,
    range,
    width,
    chargeSpeed: 600,
    ...x,
  }),
  proj: (
    id: string,
    name: string,
    windup: number,
    cd: number,
    dmg: number,
    x: Extra = {},
  ): BossAbilityDef => ({
    id,
    name,
    shape: 'projectile',
    windup,
    cooldown: cd,
    damage: dmg,
    projSpeed: 440,
    ...x,
  }),
  summon: (
    id: string,
    name: string,
    windup: number,
    cd: number,
    x: Extra = {},
  ): BossAbilityDef => ({
    id,
    name,
    shape: 'summon',
    windup,
    cooldown: cd,
    damage: 0,
    countScaling: 'adds',
    ...x,
  }),
  voids: (id: string, name: string, windup: number, cd: number, x: Extra = {}): BossAbilityDef => ({
    id,
    name,
    shape: 'voidzones',
    windup,
    cooldown: cd,
    damage: 0,
    radius: 90,
    countScaling: 'zones',
    zoneDuration: 8,
    zoneTickDamage: 12,
    targetRandom: true,
    ...x,
  }),
  beam: (
    id: string,
    name: string,
    windup: number,
    cd: number,
    dmg: number,
    x: Extra = {},
  ): BossAbilityDef => ({
    id,
    name,
    shape: 'beam',
    windup,
    cooldown: cd,
    damage: dmg,
    range: 500,
    width: 24,
    channelDuration: 2,
    ...x,
  }),
  buff: (id: string, name: string, windup: number, cd: number, x: Extra = {}): BossAbilityDef => ({
    id,
    name,
    shape: 'buffSelf',
    windup,
    cooldown: cd,
    damage: 0,
    buffDuration: 6,
    ...x,
  }),
};

/** Priority-list decision maker: first usable rule whose guard passes wins. */
interface Rule {
  id: string;
  cond?: (c: BossDecisionCtx) => boolean;
  chance?: number;
}
function decideBy(rules: Rule[]): (c: BossDecisionCtx) => string | null {
  return (c) => {
    for (const r of rules) {
      if (!c.usable(r.id)) continue;
      if (r.cond && !r.cond(c)) continue;
      if (r.chance != null && c.rng.next() > r.chance) continue;
      return r.id;
    }
    return null;
  };
}
const melee = (c: BossDecisionCtx): boolean => c.anyInMelee;
const far =
  (d: number) =>
  (c: BossDecisionCtx): boolean =>
    c.distToTarget > d;
const within =
  (d: number) =>
  (c: BossDecisionCtx): boolean =>
    c.distToTarget <= d;

// ===========================================================================
// Originals
// ===========================================================================
const DRAGON: MonsterDef = {
  id: 'dragon',
  name: 'Ancient Dragon',
  theme: 'A hulking wyrm wreathed in flame.',
  difficulty: 'Medium',
  tier: 'medium',
  bodyShape: 'star',
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
    A.cone('fireBreath', 'Fire Breath', 1.2, 6, 55, 400, 30),
    A.circle('fireball', 'Fireball', 1.0, 4, 45, 700, 110),
    A.nova('tailSweep', 'Tail Sweep', 0.9, 8, 40, 160, { knockback: 120 }),
    A.nova('wingGust', 'Wing Gust', 1.5, 14, 15, 300, { knockback: 200, minHpFrac: 0.5 }),
  ],
  decide: ({ usable, anyInMelee, distToTarget, hpFrac, rng }) => {
    if (hpFrac <= 0.5 && usable('wingGust') && rng.next() < 0.5) return 'wingGust';
    if (anyInMelee && usable('tailSweep')) return 'tailSweep';
    if (usable('fireBreath') && distToTarget <= 420) return 'fireBreath';
    if (usable('fireball')) return 'fireball';
    return null;
  },
};

const TROLL: MonsterDef = {
  id: 'troll',
  name: 'Forest Troll',
  theme: 'A raging ogre that regenerates relentlessly.',
  difficulty: 'Medium-Hard',
  tier: 'medium',
  bodyShape: 'blob',
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
    A.cone('smash', 'Smash', 0.8, 2.5, 45, 90, 45),
    A.line('charge', 'Charge', 1.0, 7, 50, 700, 45, { knockback: 120, targetRandom: true }),
    A.nova('groundSlam', 'Ground Slam', 1.1, 6, 40, 200),
  ],
  decide: ({ usable, anyInMelee, rng }) => {
    if (anyInMelee) {
      if (usable('groundSlam') && rng.next() < 0.4) return 'groundSlam';
      if (usable('smash')) return 'smash';
      if (usable('groundSlam')) return 'groundSlam';
      return null;
    }
    if (usable('charge')) return 'charge';
    if (usable('groundSlam')) return 'groundSlam';
    return null;
  },
};

const LICH: MonsterDef = {
  id: 'lich',
  name: 'Lich',
  theme: 'An undead sorcerer that floods the arena with the dead.',
  difficulty: 'Hard',
  tier: 'hard',
  bodyShape: 'diamond',
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
    A.proj('shadowBolt', 'Shadow Bolt', 0, 2.0, 30, { projSpeed: 420 }),
    A.summon('summonSkeletons', 'Summon Skeletons', 1.5, 12),
    A.voids('voidZone', 'Void Zone', 0, 9, { radius: 90, zoneDuration: 8, zoneTickDamage: 12 }),
    A.beam('lifeDrain', 'Life Drain', 0.8, 10, 15, { healSelf: true }),
  ],
  decide: ({ usable, target }) => {
    if (usable('summonSkeletons')) return 'summonSkeletons';
    if (usable('voidZone')) return 'voidZone';
    if (usable('lifeDrain') && target) return 'lifeDrain';
    if (usable('shadowBolt') && target) return 'shadowBolt';
    return null;
  },
};

// ===========================================================================
// EASY tier
// ===========================================================================
const GOBLIN: MonsterDef = {
  id: 'goblin',
  name: 'Goblin Warlord',
  theme: 'A cackling chieftain who calls in his rabble.',
  difficulty: 'Easy',
  tier: 'easy',
  bodyShape: 'humanoid',
  color: 0x7a9e3a,
  baseHp: 1450,
  radius: 46,
  moveSpeed: 165,
  regen: 0,
  meleeRange: 120,
  enrageThreshold: 0.3,
  enrageCooldownMult: 0.7,
  enrageRegenMult: 1,
  abilities: [
    A.cone('hack', 'Rusty Hack', 0.7, 2.2, 32, 100, 45),
    A.summon('callRabble', 'Call the Rabble', 1.2, 12, { addSpeedMult: 1.1 }),
    A.proj('boneToss', 'Bone Toss', 0.5, 4, 26, { projSpeed: 460, targetRandom: true }),
  ],
  decide: decideBy([{ id: 'callRabble' }, { id: 'hack', cond: melee }, { id: 'boneToss' }]),
};

const SPIDER: MonsterDef = {
  id: 'spider',
  name: 'Broodmother',
  theme: 'A bloated spider webbing the arena in venom.',
  difficulty: 'Easy',
  tier: 'easy',
  bodyShape: 'insect',
  color: 0x4a3a5a,
  baseHp: 1500,
  radius: 52,
  moveSpeed: 175,
  regen: 0,
  meleeRange: 120,
  enrageThreshold: 0.3,
  enrageCooldownMult: 0.7,
  enrageRegenMult: 1,
  abilities: [
    A.cone('bite', 'Venom Bite', 0.6, 2.5, 30, 95, 40, { slowMult: 0.6, slowDuration: 2 }),
    A.voids('webs', 'Web Snare', 0.4, 9, {
      radius: 95,
      zoneDuration: 6,
      zoneTickDamage: 8,
      slowMult: 0.4,
      slowDuration: 1.2,
    }),
    A.summon('spiderlings', 'Spawn Spiderlings', 1.0, 13, {
      addHpMult: 0.6,
      addSpeedMult: 1.2,
      addCountBonus: 1,
    }),
  ],
  decide: decideBy([{ id: 'spiderlings' }, { id: 'webs' }, { id: 'bite', cond: melee }]),
};

const BANDIT: MonsterDef = {
  id: 'bandit',
  name: 'Bandit Captain',
  theme: 'A quick blade who darts and flings daggers.',
  difficulty: 'Easy',
  tier: 'easy',
  bodyShape: 'humanoid',
  color: 0x8a6b4a,
  baseHp: 1400,
  radius: 44,
  moveSpeed: 185,
  regen: 0,
  meleeRange: 115,
  enrageThreshold: 0.3,
  enrageCooldownMult: 0.65,
  enrageRegenMult: 1,
  abilities: [
    A.cone('slash', 'Cutthroat Slash', 0.5, 2.0, 30, 95, 42),
    A.proj('daggerFan', 'Dagger Fan', 0.6, 6, 18, { projSpeed: 520, projCount: 3, spreadDeg: 26 }),
    A.line('rush', 'Rush', 0.7, 8, 36, 520, 40, { knockback: 80, targetRandom: true }),
  ],
  decide: decideBy([
    { id: 'rush', cond: far(260) },
    { id: 'daggerFan' },
    { id: 'slash', cond: melee },
  ]),
};

const KOBOLD: MonsterDef = {
  id: 'kobold',
  name: 'Kobold Firebrand',
  theme: 'A dragon-worshipping trapper hurling flame pots.',
  difficulty: 'Easy',
  tier: 'easy',
  bodyShape: 'humanoid',
  color: 0xd97b3e,
  baseHp: 1420,
  radius: 44,
  moveSpeed: 175,
  regen: 0,
  meleeRange: 115,
  enrageThreshold: 0.3,
  enrageCooldownMult: 0.7,
  enrageRegenMult: 1,
  blink: { range: 220, threatenRange: 130, internalCd: 6 },
  abilities: [
    A.circle('firepot', 'Flame Pot', 0.9, 4, 34, 620, 100),
    A.nova('scatter', 'Scatter Traps', 0.7, 9, 24, 150),
    A.proj('spark', 'Spark Bolt', 0, 2, 20, { projSpeed: 480 }),
  ],
  decide: decideBy([{ id: 'scatter', cond: melee }, { id: 'firepot' }, { id: 'spark' }]),
};

const DIREWOLF: MonsterDef = {
  id: 'direwolf',
  name: 'Dire Wolf Alpha',
  theme: 'A pack leader that lunges and howls for the hunt.',
  difficulty: 'Easy',
  tier: 'easy',
  bodyShape: 'beast',
  color: 0x8a8f98,
  baseHp: 1550,
  radius: 50,
  moveSpeed: 205,
  regen: 0,
  meleeRange: 125,
  enrageThreshold: 0.35,
  enrageCooldownMult: 0.6,
  enrageRegenMult: 1,
  abilities: [
    A.cone('maul', 'Maul', 0.5, 1.8, 34, 110, 45),
    A.line('pounce', 'Pounce', 0.6, 6, 40, 480, 44, { knockback: 90 }),
    A.buff('howl', 'Blood Howl', 0.8, 14, {
      buffMoveMult: 1.35,
      buffDamageMult: 1.2,
      buffDuration: 6,
    }),
    A.summon('callPack', 'Call the Pack', 1.1, 16, { addSpeedMult: 1.3, addHpMult: 0.7 }),
  ],
  decide: decideBy([
    { id: 'howl', cond: (c) => c.hpFrac < 0.6 },
    { id: 'pounce', cond: far(240) },
    { id: 'callPack' },
    { id: 'maul', cond: melee },
  ]),
};

const ANIMATED_ARMOR: MonsterDef = {
  id: 'animatedArmor',
  name: 'Animated Armor',
  theme: 'An empty suit of plate that slams and reflects blows.',
  difficulty: 'Easy',
  tier: 'easy',
  bodyShape: 'construct',
  color: 0x9aa4b2,
  baseHp: 1750,
  radius: 52,
  moveSpeed: 130,
  regen: 0,
  meleeRange: 130,
  enrageThreshold: 0.3,
  enrageCooldownMult: 0.7,
  enrageRegenMult: 1,
  abilities: [
    A.cone('slam', 'Gauntlet Slam', 0.8, 2.6, 38, 105, 50),
    A.nova('shockwave', 'Shockwave', 1.0, 7, 34, 175, { knockback: 110 }),
    A.buff('brace', 'Brace', 0.5, 12, { buffDefMult: 0.55, buffDuration: 4 }),
  ],
  decide: decideBy([
    { id: 'brace', cond: (c) => c.hpFrac < 0.5 },
    { id: 'shockwave', cond: melee, chance: 0.5 },
    { id: 'slam', cond: melee },
    { id: 'shockwave' },
  ]),
};

const HARPY: MonsterDef = {
  id: 'harpy',
  name: 'Harpy Matriarch',
  theme: 'A shrieking flyer who buffets the band with gales.',
  difficulty: 'Easy',
  tier: 'easy',
  bodyShape: 'beast',
  color: 0xb07acb,
  baseHp: 1480,
  radius: 48,
  moveSpeed: 195,
  regen: 0,
  meleeRange: 120,
  enrageThreshold: 0.3,
  enrageCooldownMult: 0.65,
  enrageRegenMult: 1,
  blink: { range: 260, threatenRange: 140, internalCd: 5 },
  abilities: [
    A.cone('rake', 'Talon Rake', 0.5, 2.0, 30, 100, 45),
    A.nova('galeBlast', 'Gale Blast', 1.0, 8, 22, 240, { knockback: 200 }),
    A.proj('screech', 'Sonic Screech', 0.4, 5, 24, { projSpeed: 500, projCount: 2, spreadDeg: 18 }),
  ],
  decide: decideBy([
    { id: 'galeBlast', cond: melee },
    { id: 'rake', cond: melee },
    { id: 'screech' },
  ]),
};

const GNOLL: MonsterDef = {
  id: 'gnoll',
  name: 'Gnoll Packlord',
  theme: 'A hyena-headed marauder who whips his pack into a frenzy.',
  difficulty: 'Easy',
  tier: 'easy',
  bodyShape: 'beast',
  color: 0xa8894a,
  baseHp: 1600,
  radius: 50,
  moveSpeed: 180,
  regen: 0,
  meleeRange: 125,
  enrageThreshold: 0.35,
  enrageCooldownMult: 0.6,
  enrageRegenMult: 1,
  abilities: [
    A.cone('cleave', 'Bone Cleave', 0.6, 2.2, 34, 110, 48),
    A.summon('rally', 'Rally the Pack', 1.0, 13, { addSpeedMult: 1.15 }),
    A.buff('frenzy', 'Frenzy', 0.6, 15, {
      buffMoveMult: 1.25,
      buffDamageMult: 1.25,
      buffDuration: 6,
    }),
  ],
  decide: decideBy([
    { id: 'frenzy', cond: (c) => c.hpFrac < 0.6 },
    { id: 'rally' },
    { id: 'cleave', cond: melee },
  ]),
};

const MUD_GOLEM: MonsterDef = {
  id: 'mudGolem',
  name: 'Mud Golem',
  theme: 'A lumbering ooze that hurls clinging muck.',
  difficulty: 'Easy',
  tier: 'easy',
  bodyShape: 'construct',
  color: 0x6b5a3a,
  baseHp: 1800,
  radius: 58,
  moveSpeed: 110,
  regen: 2,
  meleeRange: 140,
  enrageThreshold: 0.3,
  enrageCooldownMult: 0.75,
  enrageRegenMult: 1,
  abilities: [
    A.nova('quake', 'Quake', 1.0, 5, 36, 190, { slowMult: 0.6, slowDuration: 2 }),
    A.circle('muckLob', 'Muck Lob', 0.9, 5, 30, 600, 110, { slowMult: 0.5, slowDuration: 2.5 }),
    A.cone('backhand', 'Backhand', 0.8, 3, 40, 110, 45, { knockback: 90 }),
  ],
  decide: decideBy([
    { id: 'quake', cond: melee },
    { id: 'backhand', cond: melee },
    { id: 'muckLob' },
  ]),
};

const ZOMBIE: MonsterDef = {
  id: 'zombie',
  name: 'Zombie Hulk',
  theme: 'A rotting brute that shrugs off wounds and vomits bile.',
  difficulty: 'Easy',
  tier: 'easy',
  bodyShape: 'humanoid',
  color: 0x6a8a5a,
  baseHp: 1900,
  radius: 56,
  moveSpeed: 105,
  regen: 5,
  meleeRange: 135,
  enrageThreshold: 0.25,
  enrageCooldownMult: 0.75,
  enrageRegenMult: 1.5,
  abilities: [
    A.cone('pound', 'Rotting Pound', 0.9, 2.8, 40, 115, 48),
    A.circle('bileSpew', 'Bile Spew', 0.8, 6, 28, 520, 120, { slowMult: 0.6, slowDuration: 2 }),
    A.summon('raiseDead', 'Raise Dead', 1.4, 15, { addHpMult: 0.8 }),
  ],
  decide: decideBy([
    { id: 'raiseDead' },
    { id: 'bileSpew', cond: far(150) },
    { id: 'pound', cond: melee },
  ]),
};

// ===========================================================================
// MEDIUM tier
// ===========================================================================
const ORC: MonsterDef = {
  id: 'orc',
  name: 'Orc Warchief',
  theme: 'A brutal warlord whose roar drives his warband berserk.',
  difficulty: 'Medium',
  tier: 'medium',
  bodyShape: 'humanoid',
  color: 0x4a7a3a,
  baseHp: 2300,
  radius: 58,
  moveSpeed: 155,
  regen: 0,
  meleeRange: 145,
  enrageThreshold: 0.3,
  enrageCooldownMult: 0.6,
  enrageRegenMult: 1,
  abilities: [
    A.cone('greataxe', 'Greataxe Cleave', 0.8, 2.4, 48, 130, 50),
    A.line('warcharge', 'War Charge', 1.0, 8, 50, 640, 46, { knockback: 130, targetRandom: true }),
    A.buff('warcry', 'War Cry', 0.7, 16, {
      buffMoveMult: 1.2,
      buffDamageMult: 1.3,
      buffDuration: 7,
    }),
    A.summon('summonGrunts', 'Summon Grunts', 1.2, 15, { addHpMult: 1.1 }),
  ],
  decide: decideBy([
    { id: 'warcry', cond: (c) => c.hpFrac < 0.6 },
    { id: 'warcharge', cond: far(220) },
    { id: 'summonGrunts' },
    { id: 'greataxe', cond: melee },
  ]),
};

const MANTICORE: MonsterDef = {
  id: 'manticore',
  name: 'Manticore',
  theme: 'A winged lion that rakes in melee and volleys tail spikes.',
  difficulty: 'Medium',
  tier: 'medium',
  bodyShape: 'beast',
  color: 0xb0442e,
  baseHp: 2200,
  radius: 60,
  moveSpeed: 170,
  regen: 0,
  meleeRange: 140,
  enrageThreshold: 0.3,
  enrageCooldownMult: 0.65,
  enrageRegenMult: 1,
  abilities: [
    A.cone('rake', 'Savage Rake', 0.6, 2.2, 42, 120, 46),
    A.proj('tailSpikes', 'Tail Spikes', 0.7, 6, 24, {
      projSpeed: 560,
      projCount: 5,
      spreadDeg: 40,
    }),
    A.line('pounce', 'Pounce', 0.7, 7, 44, 560, 46, { knockback: 110 }),
  ],
  decide: decideBy([
    { id: 'pounce', cond: far(240) },
    { id: 'tailSpikes', cond: far(160) },
    { id: 'rake', cond: melee },
    { id: 'tailSpikes' },
  ]),
};

const WRAITH: MonsterDef = {
  id: 'wraith',
  name: 'Wraith',
  theme: 'A vengeful spirit that phases about draining life.',
  difficulty: 'Medium',
  tier: 'medium',
  bodyShape: 'diamond',
  color: 0x5a6a8a,
  baseHp: 2000,
  radius: 54,
  moveSpeed: 150,
  regen: 0,
  meleeRange: 130,
  enrageThreshold: 0.25,
  enrageCooldownMult: 0.7,
  enrageRegenMult: 1,
  blink: { range: 320, threatenRange: 120, internalCd: 4 },
  abilities: [
    A.proj('shadowLance', 'Shadow Lance', 0, 2, 30, { projSpeed: 460 }),
    A.beam('drainSoul', 'Drain Soul', 0.7, 9, 18, { healSelf: true, channelDuration: 2.2 }),
    A.voids('graspingDead', 'Grasping Dead', 0.4, 10, {
      radius: 95,
      zoneTickDamage: 12,
      slowMult: 0.5,
      slowDuration: 1.2,
    }),
    A.nova('wail', 'Wail', 1.1, 12, 30, 200, { minHpFrac: 0.5 }),
  ],
  decide: decideBy([
    { id: 'wail', cond: (c) => c.hpFrac < 0.5 && melee(c) },
    { id: 'drainSoul', cond: (c) => c.target != null },
    { id: 'graspingDead' },
    { id: 'shadowLance' },
  ]),
};

const BASILISK: MonsterDef = {
  id: 'basilisk',
  name: 'Basilisk',
  theme: 'A great lizard whose petrifying gaze freezes the careless.',
  difficulty: 'Medium',
  tier: 'medium',
  bodyShape: 'serpent',
  color: 0x5a8a4a,
  baseHp: 2250,
  radius: 58,
  moveSpeed: 140,
  regen: 0,
  meleeRange: 140,
  enrageThreshold: 0.3,
  enrageCooldownMult: 0.7,
  enrageRegenMult: 1,
  abilities: [
    A.cone('petrifyGaze', 'Petrifying Gaze', 1.3, 9, 24, 360, 26, { stun: 1.4 }),
    A.cone('bite', 'Venom Bite', 0.7, 2.4, 44, 120, 44, { slowMult: 0.6, slowDuration: 2 }),
    A.circle('venomSpit', 'Venom Spit', 0.8, 5, 30, 560, 110, { slowMult: 0.55, slowDuration: 2 }),
  ],
  decide: decideBy([
    { id: 'petrifyGaze', cond: within(360) },
    { id: 'bite', cond: melee },
    { id: 'venomSpit' },
  ]),
};

const OWLBEAR: MonsterDef = {
  id: 'owlbear',
  name: 'Owlbear',
  theme: 'A feathered bruiser that hits like a rockslide.',
  difficulty: 'Medium',
  tier: 'medium',
  bodyShape: 'blob',
  color: 0x9a6a3a,
  baseHp: 2500,
  radius: 64,
  moveSpeed: 150,
  regen: 0,
  meleeRange: 150,
  enrageThreshold: 0.3,
  enrageCooldownMult: 0.6,
  enrageRegenMult: 1,
  abilities: [
    A.cone('doubleSwipe', 'Double Swipe', 0.7, 2.2, 46, 130, 55),
    A.nova('groundStomp', 'Ground Stomp', 1.0, 6, 42, 200, { knockback: 120 }),
    A.line('charge', 'Barreling Charge', 0.9, 8, 48, 620, 50, {
      knockback: 140,
      targetRandom: true,
    }),
  ],
  decide: decideBy([
    { id: 'charge', cond: far(240) },
    { id: 'groundStomp', cond: melee, chance: 0.5 },
    { id: 'doubleSwipe', cond: melee },
    { id: 'groundStomp' },
  ]),
};

const CYCLOPS: MonsterDef = {
  id: 'cyclops',
  name: 'Cyclops',
  theme: 'A one-eyed giant that hurls boulders across the field.',
  difficulty: 'Medium',
  tier: 'medium',
  bodyShape: 'humanoid',
  color: 0xa87a5a,
  baseHp: 2600,
  radius: 70,
  moveSpeed: 120,
  regen: 0,
  meleeRange: 160,
  enrageThreshold: 0.3,
  enrageCooldownMult: 0.7,
  enrageRegenMult: 1,
  abilities: [
    A.circle('boulder', 'Boulder Throw', 1.1, 4.5, 46, 750, 120),
    A.cone('clubSweep', 'Club Sweep', 0.9, 2.8, 50, 150, 55, { knockback: 120 }),
    A.nova('stomp', 'Titan Stomp', 1.0, 8, 40, 220),
  ],
  decide: decideBy([
    { id: 'stomp', cond: melee, chance: 0.4 },
    { id: 'clubSweep', cond: melee },
    { id: 'boulder' },
  ]),
};

const GARGOYLE: MonsterDef = {
  id: 'gargoyle',
  name: 'Gargoyle Sentinel',
  theme: 'A stone guardian that dives from on high and turns to rock.',
  difficulty: 'Medium',
  tier: 'medium',
  bodyShape: 'construct',
  color: 0x6a6a72,
  baseHp: 2300,
  radius: 56,
  moveSpeed: 165,
  regen: 0,
  meleeRange: 135,
  enrageThreshold: 0.3,
  enrageCooldownMult: 0.65,
  enrageRegenMult: 1,
  blink: { range: 300, threatenRange: 130, internalCd: 6 },
  abilities: [
    A.line('divebomb', 'Dive Bomb', 0.9, 7, 46, 600, 46, { knockback: 120 }),
    A.cone('claw', 'Stone Claw', 0.6, 2.2, 40, 115, 46),
    A.buff('petrify', 'Petrify', 0.5, 13, {
      buffDefMult: 0.4,
      buffDuration: 4,
      selfHealFrac: 0.06,
    }),
  ],
  // divebomb closes from anywhere past melee, so a kiting Gargoyle can't idle in
  // the 135–240px band (it dives at the target instead of standing still).
  decide: decideBy([
    { id: 'petrify', cond: (c) => c.hpFrac < 0.5 },
    { id: 'divebomb', cond: far(130) },
    { id: 'claw', cond: melee },
  ]),
};

const ETTIN: MonsterDef = {
  id: 'ettin',
  name: 'Ettin',
  theme: 'A two-headed giant that never stops swinging.',
  difficulty: 'Medium',
  tier: 'medium',
  bodyShape: 'humanoid',
  color: 0x7a6a5a,
  baseHp: 2550,
  radius: 66,
  moveSpeed: 135,
  regen: 0,
  meleeRange: 155,
  enrageThreshold: 0.3,
  enrageCooldownMult: 0.6,
  enrageRegenMult: 1,
  abilities: [
    A.cone('leftSmash', 'Left Smash', 0.7, 2.0, 44, 140, 50),
    A.cone('rightSmash', 'Right Smash', 0.7, 3.5, 44, 140, 50, { knockback: 90 }),
    A.nova('doubleStomp', 'Double Stomp', 1.0, 7, 42, 210),
  ],
  decide: decideBy([
    { id: 'doubleStomp', cond: melee, chance: 0.4 },
    { id: 'rightSmash', cond: melee },
    { id: 'leftSmash', cond: melee },
    { id: 'doubleStomp' },
  ]),
};

const WISP: MonsterDef = {
  id: 'wisp',
  name: "Will-o'-Wisp",
  theme: 'A dancing light that lures the band into wildfire.',
  difficulty: 'Medium',
  tier: 'medium',
  bodyShape: 'orb',
  color: 0x9ad0ff,
  baseHp: 1900,
  radius: 46,
  moveSpeed: 175,
  regen: 0,
  meleeRange: 110,
  enrageThreshold: 0.25,
  enrageCooldownMult: 0.7,
  enrageRegenMult: 1,
  blink: { range: 340, threatenRange: 150, internalCd: 3.5 },
  abilities: [
    A.proj('emberBolt', 'Ember Bolt', 0, 1.6, 26, { projSpeed: 500 }),
    A.voids('wildfire', 'Wildfire', 0.5, 8, { radius: 90, zoneTickDamage: 14, zoneDuration: 7 }),
    A.circle('flare', 'Blinding Flare', 0.8, 6, 30, 620, 120, { slowMult: 0.6, slowDuration: 1.5 }),
    A.buff('flicker', 'Flicker', 0.3, 11, { buffMoveMult: 1.4, buffDuration: 4 }),
  ],
  decide: decideBy([
    { id: 'flicker', cond: (c) => c.hpFrac < 0.5 },
    { id: 'wildfire' },
    { id: 'flare', cond: far(150) },
    { id: 'emberBolt' },
  ]),
};

const MINOTAUR: MonsterDef = {
  id: 'minotaur',
  name: 'Minotaur',
  theme: 'A labyrinth beast that gores anything in its path.',
  difficulty: 'Medium',
  tier: 'medium',
  bodyShape: 'beast',
  color: 0x8a4a2a,
  baseHp: 2400,
  radius: 62,
  moveSpeed: 160,
  regen: 0,
  meleeRange: 145,
  enrageThreshold: 0.35,
  enrageCooldownMult: 0.55,
  enrageRegenMult: 1,
  abilities: [
    A.line('gore', 'Goring Charge', 0.8, 6, 52, 680, 48, { knockback: 160, targetRandom: true }),
    A.cone('axeSweep', 'Labrys Sweep', 0.8, 2.4, 46, 135, 52),
    A.nova('quake', 'Stomping Quake', 1.0, 8, 40, 200, { knockback: 100 }),
  ],
  decide: decideBy([
    { id: 'gore', cond: far(220) },
    { id: 'quake', cond: melee, chance: 0.4 },
    { id: 'axeSweep', cond: melee },
    { id: 'gore' },
  ]),
};

// ===========================================================================
// HARD tier
// ===========================================================================
const BEHOLDER: MonsterDef = {
  id: 'beholder',
  name: 'Beholder',
  theme: 'A floating horror firing eye-rays in every direction.',
  difficulty: 'Hard',
  tier: 'hard',
  bodyShape: 'orb',
  color: 0xb04ad0,
  baseHp: 2900,
  radius: 60,
  moveSpeed: 120,
  regen: 0,
  meleeRange: 140,
  enrageThreshold: 0.25,
  enrageCooldownMult: 0.65,
  enrageRegenMult: 1,
  blink: { range: 260, threatenRange: 120, internalCd: 6 },
  abilities: [
    A.proj('eyeRays', 'Eye Rays', 0.6, 5, 22, { projSpeed: 480, projCount: 8, spreadDeg: 320 }),
    A.circle('disintegrate', 'Disintegrate', 1.0, 6, 50, 700, 100),
    // SIGNATURE (item 28): the central eye's antimagic cone SILENCES casters caught
    // in its gaze — turn away or fight with your basic until it passes.
    A.cone('antimagicEye', 'Antimagic Eye', 1.0, 12, 16, 440, 42, {
      silence: 4,
      slowMult: 0.6,
      slowDuration: 1.5,
    }),
    A.voids('antimagic', 'Antimagic Pools', 0.4, 10, {
      radius: 100,
      zoneTickDamage: 14,
      slowMult: 0.5,
      slowDuration: 1.5,
    }),
    A.beam('deathRay', 'Death Ray', 0.8, 12, 20, { channelDuration: 2.2 }),
  ],
  decide: decideBy([
    { id: 'eyeRays', chance: 0.6 },
    { id: 'antimagicEye', cond: within(440), chance: 0.5 },
    { id: 'disintegrate' },
    { id: 'antimagic' },
    { id: 'deathRay', cond: (c) => c.target != null },
  ]),
};

const VAMPIRE: MonsterDef = {
  id: 'vampire',
  name: 'Vampire Lord',
  theme: 'A noble fiend that drains blood and summons the swarm.',
  difficulty: 'Hard',
  tier: 'hard',
  bodyShape: 'humanoid',
  color: 0x8a2a3a,
  baseHp: 2800,
  radius: 56,
  moveSpeed: 165,
  regen: 0,
  meleeRange: 135,
  enrageThreshold: 0.3,
  enrageCooldownMult: 0.6,
  enrageRegenMult: 1,
  blink: { range: 300, threatenRange: 130, internalCd: 5 },
  abilities: [
    A.cone('rend', 'Crimson Rend', 0.6, 2.2, 42, 120, 45),
    A.beam('bloodDrain', 'Blood Drain', 0.7, 8, 22, { healSelf: true, channelDuration: 2.2 }),
    A.summon('batSwarm', 'Bat Swarm', 1.0, 13, {
      addSpeedMult: 1.4,
      addHpMult: 0.5,
      addCountBonus: 1,
    }),
    A.buff('nightpower', 'Power of Night', 0.5, 16, {
      buffDamageMult: 1.3,
      buffMoveMult: 1.2,
      selfHealFrac: 0.08,
      buffDuration: 8,
    }),
  ],
  decide: decideBy([
    { id: 'nightpower', cond: (c) => c.hpFrac < 0.5 },
    { id: 'bloodDrain', cond: (c) => c.target != null },
    { id: 'batSwarm' },
    { id: 'rend', cond: melee },
  ]),
};

const FROST_GIANT: MonsterDef = {
  id: 'frostGiant',
  name: 'Frost Giant',
  theme: 'A glacial titan that freezes and shatters the ground.',
  difficulty: 'Hard',
  tier: 'hard',
  bodyShape: 'humanoid',
  color: 0x6ab0d9,
  baseHp: 3200,
  radius: 76,
  moveSpeed: 120,
  regen: 0,
  meleeRange: 165,
  enrageThreshold: 0.3,
  enrageCooldownMult: 0.65,
  enrageRegenMult: 1,
  abilities: [
    A.nova('frostNova', 'Frost Nova', 1.1, 7, 40, 230, { slowMult: 0.35, slowDuration: 3 }),
    A.circle('iceBoulder', 'Ice Boulder', 1.1, 5, 48, 760, 120, { slowMult: 0.5, slowDuration: 2 }),
    A.cone('frostBreath', 'Frost Breath', 1.2, 8, 38, 380, 32, {
      stun: 1.0,
      slowMult: 0.5,
      slowDuration: 2,
    }),
    A.line('avalanche', 'Avalanche', 1.0, 9, 50, 620, 55, {
      knockback: 130,
      targetRandom: true,
      minHpFrac: 0.6,
    }),
  ],
  decide: decideBy([
    { id: 'frostBreath', cond: within(380), chance: 0.7 },
    { id: 'frostNova', cond: melee },
    { id: 'avalanche', cond: far(240) },
    { id: 'iceBoulder' },
  ]),
};

const MINDFLAYER: MonsterDef = {
  id: 'mindflayer',
  name: 'Mind Flayer',
  theme: 'An aberration that stuns minds and enthralls the fallen.',
  difficulty: 'Hard',
  tier: 'hard',
  bodyShape: 'humanoid',
  color: 0x6a4a8a,
  baseHp: 2700,
  radius: 54,
  moveSpeed: 140,
  regen: 0,
  meleeRange: 130,
  enrageThreshold: 0.25,
  enrageCooldownMult: 0.7,
  enrageRegenMult: 1,
  blink: { range: 280, threatenRange: 130, internalCd: 5 },
  abilities: [
    A.cone('mindBlast', 'Mind Blast', 1.0, 7, 30, 340, 34, { stun: 1.3 }),
    // SIGNATURE (item 28): a psionic hush that SILENCES casters in a wide circle —
    // no abilities but the basic attack while it lasts.
    A.circle('psionicSilence', 'Psionic Silence', 1.1, 13, 18, 640, 150, {
      silence: 4,
      slowMult: 0.6,
      slowDuration: 2,
    }),
    A.beam('brainDrain', 'Brain Drain', 0.7, 9, 22, { healSelf: true, channelDuration: 2 }),
    A.voids('psychicRift', 'Psychic Rift', 0.5, 9, { radius: 100, zoneTickDamage: 14 }),
    A.summon('enthrall', 'Enthrall', 1.2, 14, { addHpMult: 1.0 }),
  ],
  decide: decideBy([
    { id: 'psionicSilence', cond: (c) => c.target != null, chance: 0.5 },
    { id: 'mindBlast', cond: within(340), chance: 0.6 },
    { id: 'brainDrain', cond: (c) => c.target != null },
    { id: 'psychicRift' },
    { id: 'enthrall' },
  ]),
};

const DEATHKNIGHT: MonsterDef = {
  id: 'deathknight',
  name: 'Death Knight',
  theme: 'A fallen champion wielding cleaving frost and undeath.',
  difficulty: 'Hard',
  tier: 'hard',
  bodyShape: 'humanoid',
  color: 0x3a3a4a,
  baseHp: 3000,
  radius: 60,
  moveSpeed: 150,
  regen: 0,
  meleeRange: 150,
  enrageThreshold: 0.3,
  enrageCooldownMult: 0.6,
  enrageRegenMult: 1,
  abilities: [
    A.cone('deathCleave', 'Death Cleave', 0.8, 2.4, 50, 135, 52, {
      slowMult: 0.6,
      slowDuration: 2,
    }),
    A.line('deathGrip', 'Death Grip', 0.7, 8, 40, 640, 44, { knockback: 70, targetRandom: true }),
    A.nova('deathAndDecay', 'Death and Decay', 1.0, 7, 44, 210),
    A.summon('raiseGhouls', 'Raise Ghouls', 1.2, 14, { addHpMult: 1.1 }),
  ],
  decide: decideBy([
    { id: 'deathGrip', cond: far(240) },
    { id: 'deathAndDecay', cond: melee, chance: 0.5 },
    { id: 'raiseGhouls' },
    { id: 'deathCleave', cond: melee },
  ]),
};

const DEMON: MonsterDef = {
  id: 'demon',
  name: 'Demon Lord',
  theme: 'A pit fiend wreathed in hellfire and meteor rain.',
  difficulty: 'Hard',
  tier: 'hard',
  bodyShape: 'humanoid',
  color: 0xd93a2a,
  baseHp: 3300,
  radius: 72,
  moveSpeed: 140,
  regen: 0,
  meleeRange: 160,
  enrageThreshold: 0.3,
  enrageCooldownMult: 0.6,
  enrageRegenMult: 1,
  abilities: [
    A.circle('meteor', 'Meteor', 1.2, 4.5, 50, 800, 130),
    A.cone('hellfire', 'Hellfire Breath', 1.1, 7, 44, 420, 32),
    A.nova('infernalSlam', 'Infernal Slam', 1.0, 6, 46, 220, { knockback: 130 }),
    A.voids('brimstone', 'Brimstone', 0.5, 10, {
      radius: 100,
      zoneTickDamage: 16,
      zoneDuration: 7,
    }),
  ],
  decide: decideBy([
    { id: 'infernalSlam', cond: melee, chance: 0.4 },
    { id: 'hellfire', cond: within(420) },
    { id: 'brimstone' },
    { id: 'meteor' },
  ]),
};

const TREANT: MonsterDef = {
  id: 'treant',
  name: 'Ancient Treant',
  theme: 'A walking oak that ensnares roots and regrows its bark.',
  difficulty: 'Hard',
  tier: 'hard',
  bodyShape: 'tree',
  color: 0x4a6a2a,
  baseHp: 3400,
  radius: 74,
  moveSpeed: 105,
  regen: 10,
  meleeRange: 165,
  enrageThreshold: 0.3,
  enrageCooldownMult: 0.7,
  enrageRegenMult: 2,
  abilities: [
    A.cone('branchSwipe', 'Branch Swipe', 0.9, 2.6, 48, 150, 52, { knockback: 100 }),
    A.voids('roots', 'Grasping Roots', 0.5, 8, {
      radius: 100,
      zoneTickDamage: 12,
      slowMult: 0.3,
      slowDuration: 1.5,
    }),
    A.summon('saplings', 'Spawn Saplings', 1.2, 13, { addHpMult: 0.8 }),
    A.buff('regrow', 'Regrow Bark', 0.6, 14, {
      buffDefMult: 0.5,
      selfHealFrac: 0.1,
      buffDuration: 5,
    }),
  ],
  decide: decideBy([
    { id: 'regrow', cond: (c) => c.hpFrac < 0.5 },
    { id: 'roots' },
    { id: 'saplings' },
    { id: 'branchSwipe', cond: melee },
  ]),
};

const KRAKEN: MonsterDef = {
  id: 'kraken',
  name: 'Kraken',
  theme: 'A leviathan lashing tentacles across the whole field.',
  difficulty: 'Hard',
  tier: 'hard',
  bodyShape: 'serpent',
  color: 0x2a5a6a,
  baseHp: 3500,
  radius: 78,
  moveSpeed: 110,
  regen: 4,
  meleeRange: 170,
  enrageThreshold: 0.3,
  enrageCooldownMult: 0.65,
  enrageRegenMult: 1,
  abilities: [
    A.line('tentacleSlam', 'Tentacle Slam', 0.9, 4, 46, 700, 55, {
      knockback: 140,
      targetRandom: true,
    }),
    A.nova('maelstrom', 'Maelstrom', 1.2, 8, 42, 260, { slowMult: 0.5, slowDuration: 2 }),
    A.circle('inkSpray', 'Ink Spray', 0.8, 6, 30, 640, 130, { slowMult: 0.5, slowDuration: 2.5 }),
    A.proj('brineBolts', 'Brine Bolts', 0.6, 5, 24, {
      projSpeed: 520,
      projCount: 4,
      spreadDeg: 60,
    }),
  ],
  decide: decideBy([
    { id: 'maelstrom', cond: melee },
    { id: 'tentacleSlam', cond: far(200) },
    { id: 'inkSpray' },
    { id: 'brineBolts' },
  ]),
};

const ARCHLICH: MonsterDef = {
  id: 'archlich',
  name: 'Archlich',
  theme: 'The lich perfected — an unrelenting storm of death magic.',
  difficulty: 'Very Hard',
  tier: 'hard',
  bodyShape: 'diamond',
  color: 0x5a3a7a,
  baseHp: 3300,
  radius: 58,
  moveSpeed: 135,
  regen: 0,
  meleeRange: 130,
  enrageThreshold: 0.25,
  enrageCooldownMult: 0.6,
  enrageRegenMult: 1,
  blink: { range: 320, threatenRange: 120, internalCd: 4 },
  abilities: [
    A.proj('boltStorm', 'Bolt Storm', 0.3, 1.8, 28, {
      projSpeed: 460,
      projCount: 3,
      spreadDeg: 24,
    }),
    A.summon('legion', 'Undead Legion', 1.4, 12, { addCountBonus: 1, addHpMult: 1.0 }),
    A.voids('deathZone', 'Death Zone', 0, 8, { radius: 95, zoneTickDamage: 15, zoneDuration: 8 }),
    A.beam('soulRend', 'Soul Rend', 0.8, 10, 20, { healSelf: true, channelDuration: 2.2 }),
    A.nova('necroBurst', 'Necrotic Burst', 1.1, 11, 40, 220, { minHpFrac: 0.5 }),
  ],
  decide: decideBy([
    { id: 'necroBurst', cond: (c) => c.hpFrac < 0.5 && melee(c) },
    { id: 'legion' },
    { id: 'deathZone' },
    { id: 'soulRend', cond: (c) => c.target != null },
    { id: 'boltStorm' },
  ]),
};

const FAE: MonsterDef = {
  id: 'fae',
  name: 'Archfae Queen',
  theme: 'A capricious fae weaving charms, thorns, and mirror-images.',
  difficulty: 'Very Hard',
  tier: 'hard',
  bodyShape: 'orb',
  color: 0xd97ab0,
  baseHp: 3000,
  radius: 54,
  moveSpeed: 160,
  regen: 0,
  meleeRange: 130,
  enrageThreshold: 0.25,
  enrageCooldownMult: 0.6,
  enrageRegenMult: 1,
  blink: { range: 340, threatenRange: 140, internalCd: 4 },
  abilities: [
    A.proj('faerieBolts', 'Faerie Bolts', 0.4, 2, 22, {
      projSpeed: 520,
      projCount: 3,
      spreadDeg: 30,
    }),
    A.voids('thornField', 'Thorn Field', 0.5, 8, {
      radius: 95,
      zoneTickDamage: 13,
      slowMult: 0.45,
      slowDuration: 1.5,
    }),
    A.summon('mirrorImages', 'Mirror Images', 1.0, 12, {
      addSpeedMult: 1.3,
      addHpMult: 0.5,
      addCountBonus: 1,
    }),
    A.circle('charm', 'Bewilder', 0.9, 7, 26, 620, 120, { slowMult: 0.4, slowDuration: 2 }),
    A.buff('glamour', 'Glamour', 0.4, 13, {
      buffMoveMult: 1.35,
      buffDefMult: 0.55,
      buffDuration: 5,
    }),
  ],
  decide: decideBy([
    { id: 'glamour', cond: (c) => c.hpFrac < 0.5 },
    { id: 'mirrorImages' },
    { id: 'thornField' },
    { id: 'charm', cond: far(150) },
    { id: 'faerieBolts' },
  ]),
};

// ===========================================================================
// Practice target (menu playground)
// ===========================================================================
const DUMMY: MonsterDef = {
  id: 'dummy',
  name: 'Training Dummy',
  theme: 'A straw-stuffed sparring target. It judges you silently.',
  difficulty: 'Practice',
  tier: 'easy',
  hidden: true,
  bodyShape: 'construct',
  color: 0xc9a86a,
  baseHp: 600,
  radius: 40,
  moveSpeed: 0,
  regen: 25,
  meleeRange: 0,
  enrageThreshold: 0, // never enrages
  enrageCooldownMult: 1,
  enrageRegenMult: 1,
  abilities: [],
  decide: () => null,
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
export const MONSTERS: Record<MonsterId, MonsterDef> = {
  dragon: DRAGON,
  troll: TROLL,
  lich: LICH,
  dummy: DUMMY,
  goblin: GOBLIN,
  spider: SPIDER,
  bandit: BANDIT,
  kobold: KOBOLD,
  direwolf: DIREWOLF,
  animatedArmor: ANIMATED_ARMOR,
  harpy: HARPY,
  gnoll: GNOLL,
  mudGolem: MUD_GOLEM,
  zombie: ZOMBIE,
  orc: ORC,
  manticore: MANTICORE,
  wraith: WRAITH,
  basilisk: BASILISK,
  owlbear: OWLBEAR,
  cyclops: CYCLOPS,
  gargoyle: GARGOYLE,
  ettin: ETTIN,
  wisp: WISP,
  minotaur: MINOTAUR,
  beholder: BEHOLDER,
  vampire: VAMPIRE,
  frostGiant: FROST_GIANT,
  mindflayer: MINDFLAYER,
  deathknight: DEATHKNIGHT,
  demon: DEMON,
  treant: TREANT,
  kraken: KRAKEN,
  archlich: ARCHLICH,
  fae: FAE,
};

/** Every pickable boss (hidden practice targets excluded). */
export const MONSTER_IDS: MonsterId[] = (Object.keys(MONSTERS) as MonsterId[]).filter(
  (id) => !MONSTERS[id].hidden,
);
export const DEFAULT_MONSTER: MonsterId = 'dragon';

/** Boss ids grouped by difficulty tier (used to assemble runs). */
export const MONSTERS_BY_TIER: Record<BossTier, MonsterId[]> = {
  easy: MONSTER_IDS.filter((id) => MONSTERS[id].tier === 'easy'),
  medium: MONSTER_IDS.filter((id) => MONSTERS[id].tier === 'medium'),
  hard: MONSTER_IDS.filter((id) => MONSTERS[id].tier === 'hard'),
};

export function getMonster(id: MonsterId): MonsterDef {
  return MONSTERS[id];
}

export function abilityById(def: MonsterDef, id: string): BossAbilityDef | undefined {
  return def.abilities.find((a) => a.id === id);
}

// ---------------------------------------------------------------------------
// Run assembly + endless "type" modifiers
// ---------------------------------------------------------------------------

/**
 * Assemble a run of `RUN_LENGTH` bosses of escalating difficulty. The requested
 * `startId` (host's pick) leads the run; the rest are drawn from the tier bands
 * so a run climbs easy → medium → hard. Later cycles bias toward the harder end.
 * Pure aside from the injected RNG.
 */
export function buildRun(
  startId: MonsterId,
  cycle: number,
  rng: Rng,
  exclude?: ReadonlySet<MonsterId>,
): MonsterId[] {
  // Difficulty pattern per slot, hardened by cycle.
  const patternC0: BossTier[] = ['easy', 'easy', 'medium', 'medium', 'hard'];
  const patternHard: BossTier[] = ['medium', 'medium', 'hard', 'hard', 'hard'];
  const pattern =
    cycle <= 0
      ? patternC0
      : cycle === 1
        ? (['easy', 'medium', 'medium', 'hard', 'hard'] as BossTier[])
        : patternHard;

  const used = new Set<MonsterId>();
  const out: MonsterId[] = [];
  // Lead with the given opener (host's pick for a single fight; a seeded random
  // draw for a gauntlet — the run never lets you hand-pick the boss set).
  out.push(startId);
  used.add(startId);

  const pickFrom = (tier: BossTier): MonsterId => {
    // Prefer bosses neither used this run NOR seen last run (so Endless re-rolls a
    // fresh set), falling back progressively if the tier can't fill that.
    let pool = MONSTERS_BY_TIER[tier].filter((id) => !used.has(id) && !exclude?.has(id));
    if (pool.length === 0) pool = MONSTERS_BY_TIER[tier].filter((id) => !used.has(id));
    const src = pool.length > 0 ? pool : MONSTERS_BY_TIER[tier];
    const id = src[Math.floor(rng.next() * src.length) % src.length];
    used.add(id);
    return id;
  };

  for (let i = out.length; i < RUN_LENGTH; i++) {
    out.push(pickFrom(pattern[Math.min(i, pattern.length - 1)]));
  }
  return out.slice(0, RUN_LENGTH);
}

/**
 * Pick a seeded random opener for a gauntlet — the run never lets a player
 * hand-pick the first boss. Drawn from the easy tier on a fresh run (medium once
 * the difficulty has climbed), avoiding the previous run's bosses so Endless
 * opens on something new.
 */
export function randomOpener(cycle: number, rng: Rng, exclude?: ReadonlySet<MonsterId>): MonsterId {
  const tier: BossTier = cycle <= 0 ? 'easy' : 'medium';
  let pool = MONSTERS_BY_TIER[tier].filter((id) => !exclude?.has(id));
  if (pool.length === 0) pool = MONSTERS_BY_TIER[tier];
  return pool[Math.floor(rng.next() * pool.length) % pool.length];
}

/**
 * One run encounter: 1 boss (solo) or 2 (a shared-arena TWIN fight, each boss
 * at TWIN_HP_FRAC health / TWIN_DMG_FRAC damage — see world.spawnBosses).
 */
export type RunSlot = MonsterId[];

/**
 * Assemble a run as ENCOUNTERS: the classic climbing-difficulty spine from
 * `buildRun`, but any slot past the opener can roll into a chaotic twin fight
 * where two different bosses share the arena. Twin odds rise through endless
 * cycles (TWIN_BASE_CHANCE / TWIN_CHANCE_PER_CYCLE, capped at TWIN_CHANCE_MAX)
 * and scale DOWN for small parties — a lone hero facing two bosses that both
 * hunt them is punishment, not chaos, so solo/duo bands see twins rarely.
 * The partner is drawn from the slot's tier or the one below it, so a duo
 * spikes chaos without doubling the danger budget. Pure aside from the
 * injected RNG.
 */
export function buildRunSlots(
  startId: MonsterId,
  cycle: number,
  rng: Rng,
  partySize = 4,
  exclude?: ReadonlySet<MonsterId>,
): RunSlot[] {
  const spine = buildRun(startId, cycle, rng, exclude);
  const partyFactor = partySize >= 3 ? 1 : partySize === 2 ? 0.6 : 0.3;
  const twinChance =
    Math.min(TWIN_CHANCE_MAX, TWIN_BASE_CHANCE + Math.max(0, cycle) * TWIN_CHANCE_PER_CYCLE) *
    partyFactor;
  const lowerTier: Record<BossTier, BossTier> = { easy: 'easy', medium: 'easy', hard: 'medium' };

  return spine.map((id, slot) => {
    // The opener stays solo on the first run so a fresh party learns one boss
    // at a time; endless cycles throw packs at you from the very first gate.
    if (slot === 0 && cycle <= 0) return [id];
    if (rng.next() >= twinChance) return [id];
    const tier = MONSTERS[id].tier;
    const pool = [...MONSTERS_BY_TIER[tier], ...MONSTERS_BY_TIER[lowerTier[tier]]].filter(
      (x) => x !== id,
    );
    if (pool.length === 0) return [id];
    const pack: MonsterId[] = [id];
    const taken = new Set<MonsterId>([id]);
    // Second boss is guaranteed once we've committed to a multi-fight; each
    // further co-boss is added with a tapering, cycle-scaled probability so
    // triplets — and, rarely, quads — surface without becoming a wipe.
    let extraChance = (TWIN_EXTRA_CHANCE + Math.max(0, cycle) * TWIN_EXTRA_PER_CYCLE) * partyFactor;
    while (pack.length < TWIN_MAX_BOSSES) {
      const candidates = pool.filter((x) => !taken.has(x));
      if (candidates.length === 0) break;
      const partner = candidates[Math.floor(rng.next() * candidates.length) % candidates.length];
      pack.push(partner);
      taken.add(partner);
      if (pack.length >= 2 && rng.next() >= extraChance) break;
      extraChance *= TWIN_EXTRA_FALLOFF;
    }
    return pack;
  });
}

export interface BossModifier {
  id: string;
  /** Name prefix shown on the boss ("Frost Dragon"). */
  prefix: string;
  /** Accent colour for the aura glow. */
  color: number;
  /** Aura behaviour applied periodically by the World. */
  aura: 'frost' | 'shadow' | 'ember' | 'venom' | 'storm';
}

/**
 * Elemental "types" layered onto bosses each endless cycle. Cycle 1 uses index 0
 * (Frost), cycle 2 index 1 (Shadow), … wrapping around. Every cycle also stacks
 * the HP/damage multipliers from scaling.ts on top.
 */
export const CYCLE_MODIFIERS: BossModifier[] = [
  { id: 'frost', prefix: 'Frost', color: 0x7fd4ff, aura: 'frost' },
  { id: 'shadow', prefix: 'Dark', color: 0x9b6cff, aura: 'shadow' },
  { id: 'ember', prefix: 'Infernal', color: 0xff8a3d, aura: 'ember' },
  { id: 'venom', prefix: 'Venomous', color: 0x8fd14a, aura: 'venom' },
  { id: 'storm', prefix: 'Storm', color: 0x6ad0ff, aura: 'storm' },
];

/** The modifier for a given endless cycle (cycle 0 = none). */
export function modifierForCycle(cycle: number): BossModifier | null {
  if (cycle <= 0) return null;
  return CYCLE_MODIFIERS[(cycle - 1) % CYCLE_MODIFIERS.length];
}
