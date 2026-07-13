/**
 * Warband — authoritative world state + fixed-timestep `step`. PURE TS.
 * Only the host runs a World; clients render interpolated snapshots.
 */
import type {
  Player,
  Boss,
  Add,
  Projectile,
  GroundZone,
  TerrainPatch,
  Obstacle,
  Totem,
  TotemView,
  InputCommand,
  GameEvent,
  Snapshot,
  RenderState,
  PlayerView,
  BossView,
  Telegraph,
  PendingStrike,
  BossAction,
  EntityId,
  ClassId,
  MonsterId,
  AffixId,
  Outcome,
  FightResult,
  AbilitySlot,
  SubSlot,
  ExtSlot,
  Cooldowns,
  TerrainKind,
  Vec2,
} from '../core/types';
import {
  SIM_DT,
  ARENA_W,
  ARENA_H,
  BOSS_DECISION_MIN,
  BOSS_RECOVER_TIME,
  DOWNED_BLEEDOUT,
  REVIVE_RANGE,
  REVIVE_TIME,
  REVIVE_HP_FRAC,
  ZONE_TICK_INTERVAL,
  TERRAIN_TICK_INTERVAL,
  SOFT_ENRAGE_TIME,
  SOFT_ENRAGE_RAMP,
  ADD_DAMAGE,
  ADD_ATTACK_CD,
  SEPARATION_ITERATIONS,
  PLAYER_RADIUS,
  SCORE_HEAL_FACTOR,
  SCORE_PER_REVIVE,
  SCORE_PER_DEATH,
  TWIN_HP_FRAC,
  PACK_EARLY_DMG_EASE,
  TWIN_DMG_FRAC,
  BOSS_HP_SCALE,
  BOSS_REGEN_MAX_FRAC,
  HARDCORE_REVIVES_PER_FIGHT,
  HARDCORE_TIME_BUDGET,
  HARDCORE_DEADLINE_MULT,
  HARDCORE_DEADLINE_PACK_BONUS,
  HARDCORE_DEADLINE_WARN_TIMES,
  DEADLINE_CHASM_START,
  DEADLINE_CHASM_CLOSE_RATE,
  DEADLINE_CHASM_MIN,
  DEADLINE_CHASM_DPS_FRAC,
  DEADLINE_CHASM_PULSE,
  DEADLINE_CHASM_RING_COUNT,
  DEADLINE_CORRUPTION_INTERVAL,
  CORRUPTION_COLLAPSE_DAMAGE,
  ADD_HP,
  ADD_MOVE_SPEED,
  ADD_RADIUS,
  AFFIX_VAMPIRIC_FRAC,
  AFFIX_FRENZY_MAX_CDR,
  AFFIX_SPLIT_INTERVAL,
  AFFIX_VOLATILE_ZONE_DURATION,
  AFFIX_VOLATILE_TICK,
  AFFIX_VOLATILE_RADIUS,
  AFFIX_MOLTEN_INTERVAL,
  AFFIX_MOLTEN_ZONE_DURATION,
  AFFIX_MOLTEN_TICK,
  AFFIX_MOLTEN_RADIUS,
  AFFIX_WARD_INTERVAL,
  AFFIX_WARD_DEF_MULT,
  AFFIX_WARD_DURATION,
  AFFIX_ACCEL_RAMP,
  AFFIX_ACCEL_MAX,
  AFFIX_OVERCHARGE_SCALE,
  AFFIX_BARBED_INTERVAL,
  AFFIX_BARBED_RADIUS,
  AFFIX_BARBED_FRAC,
  AFFIX_BARBED_MAX,
  AFFIX_BARBED_MEMORY,
  AFFIX_TELEPORT_CD,
  AFFIX_TELEPORT_RANGE,
  AFFIX_TELEPORT_THREATEN,
  AFFIX_TELEPORT_CD_MULT,
  SYNERGY_FIRST_DELAY,
  SYNERGY_INTERVAL,
  SYNERGY_WINDUP,
  SYNERGY_BUFF_DURATION,
  SYNERGY_EMPOWER_MULT,
  SYNERGY_WARD_MULT,
  TERRAIN_SURGE_INTERVAL,
  TERRAIN_SURGE_FUSE,
  ABYSS_SURGE_PULL,
  ABYSS_SURGE_DAMAGE,
  ABYSS_PLUNGE_DAMAGE,
  TIDE_SURGE_PULL,
  TIDE_SURGE_DAMAGE,
  BLOODMIRE_SURGE_PULL,
  BLOODMIRE_SURGE_DAMAGE,
  BRIMSTONE_SURGE_PULL,
  BRIMSTONE_SURGE_DAMAGE,
} from '../core/constants';
import { generateTerrain } from './terrain';
import { generateObstacles } from './obstacles';
import {
  Rng,
  vec,
  add as vadd,
  scale as vscale,
  normalize,
  clampLength,
  fromAngle,
  angleOf,
} from '../core/math';
// Toroidal (wrap-around) geometry — drop-in replacements for the Euclidean
// sub/dist/distSq/pointInSegment so combat measures the shortest path on the
// torus. `wrapPos` canonicalises positions after they move (see §infinite-map).
import { sub, dist, distSq, pointInSegment, wrapPos } from '../core/torus';
import { getClass, cloneAbilities, slowAttackCooldowns } from '../content/classes';
import { applyUpgrades } from '../content/upgrades';
import type { UpgradeId } from '../content/upgrades';
import {
  applyCharUpgrades,
  applySubclassGrands,
  previewAbilityTable,
} from '../content/charUpgrades';
import { getSubSkill, subclassOfSkill } from '../content/subclasses';
import { coinsForRank } from '../content/ephemeral';
import type { EphemeralStock } from '../content/ephemeral';
import { getMonster, abilityById } from '../content/monsters';
import type { MonsterDef, BossModifier } from '../content/monsters';
import { hasAffix, AFFIXES } from '../content/affixes';
import { computeScaling, addCount } from '../content/scaling';
import type { ScalingResult } from '../content/scaling';
import { balanceAdjust, bandPowerRatio, runClears, NEUTRAL_BALANCE } from '../content/balance';
import type { BalanceAdjust } from '../content/balance';
import {
  tickBuffs,
  tickStunDr,
  buffMult,
  hasBuff,
  applyBuff,
  applyStun,
  makeBuff,
  damageBoss,
  damageAdd,
  damagePlayer,
  healPlayer,
  coReviveSpeed,
  isRooted,
} from '../combat/combat';
import { decayThreat, nthThreatTarget } from '../combat/threat';
import {
  resolvePlayerAbility,
  resolveBossAbility,
  beamTick,
  spawnZone,
  abilityForSlot,
  pullToward,
} from '../combat/abilities';
import type { BossAbilityDef } from '../content/monsters';
import { stepCorruption, firstCorruptionDelay } from './corruption';
import { WALLING_SHAPES, overlapsActiveTelegraph } from './grammar';
import { FAIR_TELEGRAPH_GAP } from '../core/constants';

const SLOTS: AbilitySlot[] = ['basic', 'a1', 'a2', 'a3'];
const SUB_SLOTS: SubSlot[] = ['sub1', 'sub2'];

/**
 * Whether a hero's sub-slot skill is usable with their ACTIVE class (item 14). A
 * subclass skill belongs to exactly one class; a multiclass hero who swaps to a
 * different class should not be able to cast (or see) it. A single-class hero — or
 * a skill whose owning class we can't resolve — always passes, so nothing regresses.
 */
function subSlotForActiveClass(p: Player, slot: SubSlot): boolean {
  const idx = slot === 'sub1' ? 0 : 1;
  const id = activeSubSkillIds(p)[idx];
  if (!id) return false;
  const owner = subclassOfSkill(id)?.classId;
  return owner == null || owner === p.classId;
}

/** The (≤2) subclass-skill ids belonging to the hero's ACTIVE class (item 15): a
 *  multiclass hero can hold a full subclass per class, but only wields one at a
 *  time. Drives which two skills bind to sub1/sub2 and what the client is told. */
function activeSubSkillIds(p: Player): string[] {
  return (p.subSkillIds ?? [])
    .filter((id) => subclassOfSkill(id)?.classId === p.classId)
    .slice(0, 2);
}
/** Cooldown gate (s) after a multiclass swap, so it can't be spammed for free casts. */
const CLASS_SWAP_CD = 1.0;
// Ephemeral shop consumables (item 21).
/** Healing-vial restore, as a fraction of max HP. */
const EPHEMERAL_POTION_HEAL = 0.4;
/** Phoenix-charm auto-revive HP, as a fraction of max HP. */
const EPHEMERAL_SELFREVIVE_HP = 0.5;
/** Brief invulnerability after a self-revive so you don't instantly re-fall. */
const EPHEMERAL_SELFREVIVE_GRACE = 1.5;
// Passive next-fight perk magnitudes (folded into the stat multipliers at spawn).
const EPHEMERAL_SPEED_MULT = 1.3;
const EPHEMERAL_DAMAGE_MULT = 1.25;
const EPHEMERAL_DEFENSE_MULT = 0.75;

/** Blast-flash color for projectiles that detonate in an area on impact. */
const PROJECTILE_IMPACT_COLOR: Partial<Record<import('../core/types').ProjectileKind, number>> = {
  fireball: 0xff8a3d,
};

const ZERO_INPUT: InputCommand = {
  seq: 0,
  move: { x: 0, y: 0 },
  aim: { x: 1, y: 0 },
  buttons: { basic: false, a1: false, a2: false, a3: false, revive: false },
};

export interface WorldPlayerInit {
  peerId: string;
  name: string;
  classId: ClassId;
  /** Persistent generic upgrades this hero has earned this run (applied at spawn). */
  upgrades?: UpgradeId[];
  /** Persistent character (class) upgrades this hero has earned this run. */
  charUpgrades?: string[];
  /** Chosen subclass-skill ids bound to sub1/sub2 (item 13; up to two). */
  subSkills?: string[];
  /** Additional classes this hero can swap to (item 14). `classId` stays primary. */
  extraClasses?: ClassId[];
  /** Ephemeral-shop perks bought for THIS fight (item 21). Consumed on spawn. */
  ephemeral?: EphemeralStock;
  /** Score carried in from prior bosses this run (endless accumulates it). */
  baseScore?: number;
}

export interface WorldInit {
  monsterId: MonsterId;
  seed: number;
  players: WorldPlayerInit[];
  /** Endless cycle (0 = first run) — scales boss HP/damage (scaling.ts). */
  cycle?: number;
  /**
   * MATCH BALANCE (adaptive difficulty): the host's smoothed kill-pace signal
   * across the encounters fought so far (1 = on target, >1 = the band has been
   * killing fast — see content/balance.ts). When provided, the World measures
   * the band's realized power off the freshly-spawned roster and multiplies the
   * resulting hard-capped adjustment into this fight's boss HP / damage
   * scaling. Omitted (tests, playground, menu scenes) = fully neutral.
   */
  pace?: number;
  /** Slot within the current run (0-based) and the run's length, so a multi-boss
   *  pack can be eased against party progression early on (item 10). Default 0/1. */
  runIndex?: number;
  runTotal?: number;
  /** Endless "type" modifier layered on the boss (Frost, Dark, …). */
  modifier?: BossModifier | null;
  /**
   * Extra bosses sharing the arena (twin encounters). Every boss — lead
   * included — then spawns with TWIN_HP_FRAC of its HP and TWIN_DMG_FRAC of its
   * damage so the duo stays survivable.
   */
  coBosses?: MonsterId[];
  /**
   * Boss AFFIXES per boss, aligned with `[monsterId, ...coBosses]`. Rolled by the
   * host (content/affixes.rollAffixes) and applied at spawn. Absent = none, so
   * plain fights and the vast majority of tests are unaffected.
   */
  bossAffixes?: AffixId[][];
  /**
   * Enable mid-fight CORRUPTION events (world/corruption.ts). Off by default so
   * single fights and a fresh party's opener stay clean; the host turns it on for
   * gauntlet slots past the opener and every endless cycle.
   */
  corruption?: boolean;
  /**
   * Hardcore run (item 11): corruption beats come far more often and accelerate
   * the longer a fight drags past the expected kill time, revives are limited per
   * fight, and a wipe has no free retry. A deadlier mode for aggressive players.
   */
  hardcore?: boolean;
  /**
   * Practice mode (the walkable menu playground): the dummy respawns instead of
   * granting victory, the party can never wipe to defeat, and interaction
   * totems are placed around the arena.
   */
  practice?: boolean;
  /**
   * Scene mode — a calm, non-combat local world used for diegetic menus:
   * `'reward'` (the between-boss chamber) or `'war'` (the boss-selection war
   * room). In any scene it is heroes only — no boss, no hazards, no totems,
   * abilities are inert, and the sim never "finishes". The scene's interaction
   * objects (relics, vortex, effigies, portals) are owned by the UI harness, not
   * the World (they are non-solid, so the World needs no knowledge of them).
   */
  scene?: 'reward' | 'war';
}

/** Interval (s) at which an endless "type" modifier's aura fires. */
const MOD_AURA_INTERVAL = 3.5;

/**
 * Per-kind terrain SURGE behaviour (item 28). A surging hazard periodically drags
 * every hero caught inside toward its heart; the abyss's bottomless core makes the
 * drag lethal, the Kraken's tide only hauls you deeper into the drowning water.
 * Terrain kinds absent from this table never surge. `color` tints the telegraph.
 */
const TERRAIN_SURGE: Partial<
  Record<TerrainKind, { pull: number; surgeDamage: number; plunge: number; color: number }>
> = {
  abyss: {
    pull: ABYSS_SURGE_PULL,
    surgeDamage: ABYSS_SURGE_DAMAGE,
    plunge: ABYSS_PLUNGE_DAMAGE,
    color: 0x7b5cff,
  },
  tide: { pull: TIDE_SURGE_PULL, surgeDamage: TIDE_SURGE_DAMAGE, plunge: 0, color: 0x6cc6ff },
  bloodmire: {
    pull: BLOODMIRE_SURGE_PULL,
    surgeDamage: BLOODMIRE_SURGE_DAMAGE,
    plunge: 0,
    color: 0xd0466a,
  },
  brimstone: {
    pull: BRIMSTONE_SURGE_PULL,
    surgeDamage: BRIMSTONE_SURGE_DAMAGE,
    plunge: 0,
    color: 0xff7a3d,
  },
};

/**
 * An in-flight boss-vs-boss BOND (twin/N-boss packs, item 28): the healthiest
 * boss (`casterId`) is winding up a gift to a wounded partner (`partnerId`). If
 * BOTH survive the wind-up the partner is empowered (harder hits) or warded
 * (tankier); killing either mid wind-up cancels it. Host-only; the forming bond
 * is serialized as a line telegraph so the band can read and interrupt it.
 */
interface BossBond {
  casterId: EntityId;
  partnerId: EntityId;
  kind: 'empower' | 'ward';
  fuse: number; // s remaining in the wind-up
  total: number; // full wind-up (drives the telegraph fill)
}

export class World {
  players: Player[] = [];
  /** Every boss in the arena. Solo fights have one; twin encounters have two. */
  bosses: Boss[] = [];
  adds: Add[] = [];
  projectiles: Projectile[] = [];
  groundZones: GroundZone[] = [];
  /** Telegraphed delayed strikes not tied to a boss (corruption rain / vents). */
  pendingStrikes: PendingStrike[] = [];
  terrain: TerrainPatch[] = [];
  obstacles: Obstacle[] = [];
  /** Playground interaction pillars (practice worlds only; block movement). */
  totems: Totem[] = [];
  events: GameEvent[] = [];

  rng: Rng;
  arena = { w: ARENA_W, h: ARENA_H };
  tick = 0;
  elapsed = 0; // seconds
  seed: number;

  scaling: ScalingResult;
  /**
   * MATCH BALANCE adjustment applied to this fight (content/balance.ts): the
   * band's kill pace + measured power, folded into `scaling` at construction.
   * NEUTRAL_BALANCE unless the host fed a pace signal (real hosted fights).
   */
  readonly balance: BalanceAdjust;
  /** Endless cycle + this encounter's slot in the run, for progression-aware pack
   *  easing (item 10). Default cycle 0, slot 0 of a length-1 run. */
  private readonly cycle: number;
  private readonly runIndex: number;
  private readonly runTotal: number;
  /** Def of the encounter's LEAD boss (terrain theme, legacy single-boss paths). */
  monsterDef: MonsterDef;
  modifier: BossModifier | null;
  /** Practice playground: dummy respawns, party can't wipe. */
  practice: boolean;
  /** Scene mode (calm diegetic menu world): no boss, no combat, never ends. */
  scene: 'reward' | 'war' | null;

  /** Mid-fight corruption events enabled for this fight (host-gated). */
  corruptionEnabled: boolean;
  /** Hardcore run: deadlier corruption cadence + limited revives (see item 11). */
  hardcore = false;
  /** Revives remaining this fight (hardcore only; Infinity otherwise). */
  reviveBudget = Infinity;
  /**
   * Hardcore kill-DEADLINE (item 11): the `elapsed` second at which the band
   * wipes to defeat if any boss still stands. `Infinity` outside hardcore, so a
   * standard fight never times out. Fixed at spawn from the boss count.
   */
  hardcoreDeadline = Infinity;
  /** Seconds until the next corruption beat fires (see world/corruption.ts). */
  corruptionTimer = 0;
  /** How many corruption beats have fired (drives variety / anti-repeat). */
  corruptionCount = 0;
  /** The last corruption kind fired, so a beat doesn't immediately repeat. */
  lastCorruption: string | null = null;
  /** Deadline warning marks already announced (seconds-remaining) — each fires once. */
  private deadlineWarned = new Set<number>();
  /** Closing-chasm escalation once the deadline passes (items 21/27), or null. */
  private deadlineChasm: { center: Vec2; radius: number; pulse: number } | null = null;

  tauntTargetId: EntityId | null = null;
  tauntTimer = 0;

  /** Seconds until the next boss-vs-boss bond can form (twin/N-boss packs only). */
  synergyTimer = 0;
  /** The in-flight pack bond winding up, or null (see updateBossSynergy). */
  bond: BossBond | null = null;

  finished = false;
  outcome: Outcome | null = null;
  endMs = 0;

  private nextId = 1;

  constructor(init: WorldInit) {
    this.rng = new Rng(init.seed);
    this.seed = init.seed;
    this.scaling = computeScaling(init.players.length, init.cycle ?? 0);
    this.cycle = init.cycle ?? 0;
    this.runIndex = init.runIndex ?? 0;
    this.runTotal = init.runTotal ?? 1;
    this.monsterDef = getMonster(init.monsterId);
    this.modifier = init.modifier ?? null;
    this.practice = init.practice ?? false;
    this.scene = init.scene ?? null;
    // Hardcore only bites in a real fight; set it BEFORE the first corruption
    // delay is computed so the opening beat already lands on the deadlier cadence.
    this.hardcore = (init.hardcore ?? false) && !this.practice && this.scene === null;
    this.reviveBudget = this.hardcore ? HARDCORE_REVIVES_PER_FIGHT : Infinity;
    // Corruption only runs in a real fight (never in the menu scenes / playground).
    this.corruptionEnabled = (init.corruption ?? false) && !this.practice && this.scene === null;
    this.corruptionTimer = this.corruptionEnabled ? firstCorruptionDelay(this) : 0;
    this.spawnPlayers(init.players);
    // MATCH BALANCE (adaptive difficulty): only a real hosted fight feeds a
    // pace signal. Measure the band as it actually spawned — every reward is
    // applied by now — and turn this encounter's pressure knobs (bounded) so
    // the run stays steadily challenging. Practice / menu scenes stay neutral.
    const pace = this.practice || this.scene !== null ? null : (init.pace ?? null);
    this.balance =
      pace === null
        ? NEUTRAL_BALANCE
        : balanceAdjust(
            pace,
            bandPowerRatio(this.players),
            runClears(this.cycle, this.runIndex, this.runTotal),
          );
    this.scaling.hpMultiplier *= this.balance.hpMult;
    this.scaling.bossDamageMult *= this.balance.dmgMult;
    // A menu scene (reward chamber / war room) is heroes-only: no boss, no
    // hazards, no cover, no totems — only the harness's interaction objects.
    if (this.scene === null) {
      const ids: MonsterId[] = [init.monsterId, ...(init.coBosses ?? [])];
      this.spawnBosses(ids, init.bossAffixes);
      // A shared-arena pack stops ignoring each other after a grace period (item
      // 28): the first cross-boss bond can form once the fight has settled.
      if (this.bosses.length > 1) this.synergyTimer = SYNERGY_FIRST_DELAY;
      this.terrain = this.practice ? [] : generateTerrain(ids, init.seed, () => this.allocId());
      // Cover obstacles avoid the terrain patches so cover stays readable.
      this.obstacles = this.practice
        ? []
        : generateObstacles(
            init.seed,
            () => this.allocId(),
            this.terrain.map((t) => ({ pos: t.pos, radius: t.radius })),
          );
      if (this.practice) this.spawnTotems();
    }
    // Fix the hardcore kill-deadline now that the pack size is known (item 11).
    this.hardcoreDeadline = this.computeHardcoreDeadline();
  }

  /**
   * The `elapsed` second a hardcore fight is lost on the clock (item 11), or
   * `Infinity` for any non-hardcore fight. A flat budget per boss (party DPS
   * already tracks the boss-HP knobs) plus a bonus per EXTRA boss in a pack.
   */
  private computeHardcoreDeadline(): number {
    if (!this.hardcore || this.bosses.length === 0) return Infinity;
    const extra = this.bosses.length - 1;
    return HARDCORE_TIME_BUDGET * (HARDCORE_DEADLINE_MULT + HARDCORE_DEADLINE_PACK_BONUS * extra);
  }

  /**
   * Seconds left before the hardcore kill-deadline fails the fight (item 11), or
   * `Infinity` outside hardcore. Drives the HUD countdown; clamped at 0.
   */
  deadlineRemaining(): number {
    if (!Number.isFinite(this.hardcoreDeadline)) return Infinity;
    return Math.max(0, this.hardcoreDeadline - this.elapsed);
  }

  /**
   * Hardcore kill-deadline (items 21/24/27). The deadline is neither a visual
   * timer nor an instant wipe: the band gets escalating spoken-banner WARNINGS as
   * it nears (30/15/5s), and when it passes a bottomless CHASM opens and closes in
   * a shrinking ring around the party while corruption redoubles — so everyone is
   * swallowed within a few desperate seconds. No-op outside a hardcore fight, and
   * a kill (no boss alive) stops the clock so victory still wins on the wire.
   */
  private stepDeadline(dt: number): void {
    if (!Number.isFinite(this.hardcoreDeadline)) return;
    if (!this.bosses.some((b) => b.hp > 0)) return;
    const remaining = this.deadlineRemaining();

    // Before the deadline: spoken warnings at 30 / 15 / 5s (item 24, no visual timer).
    if (remaining > 0) {
      const center = { x: this.arena.w / 2, y: this.arena.h / 2 };
      for (const mark of HARDCORE_DEADLINE_WARN_TIMES) {
        if (remaining <= mark && !this.deadlineWarned.has(mark)) {
          this.deadlineWarned.add(mark);
          this.events.push({
            t: 'deadlineWarn',
            pos: center,
            text: `${mark}s — fell it or the Abyss opens`,
          });
        }
      }
      return;
    }

    // Deadline passed: open + close the chasm (items 21/27).
    if (!this.deadlineChasm) {
      this.deadlineChasm = { center: this.aliveCentroid(), radius: DEADLINE_CHASM_START, pulse: 0 };
      this.events.push({
        t: 'deadlineWarn',
        pos: { ...this.deadlineChasm.center },
        text: 'The Abyss opens — flee to the centre!',
      });
      // Corruption redoubles from here on (item 27): force a tight cadence.
      this.corruptionTimer = Math.min(this.corruptionTimer, DEADLINE_CORRUPTION_INTERVAL);
    }
    const chasm = this.deadlineChasm;
    chasm.radius = Math.max(DEADLINE_CHASM_MIN, chasm.radius - DEADLINE_CHASM_CLOSE_RATE * dt);
    const closed = chasm.radius <= DEADLINE_CHASM_MIN + 0.5;

    // Plunge a hero into the void — killed outright (swallowed, not merely downed),
    // so the escalation is truly terminal. The wipe check emits the time's-up cue.
    const swallow = (p: Player): void => {
      if (p.state === 'dead') return;
      if (p.state === 'alive') p.stats.deaths += 1;
      p.state = 'dead';
      p.hp = 0;
      this.events.push({ t: 'death', id: p.id, kind: 'player', pos: { ...p.pos } });
    };

    if (closed) {
      // The ring has bottomed out: the band is fully swallowed, centred stragglers
      // and all. checkEndConditions then ends the run as a defeat + deadline cue.
      for (const p of this.players) swallow(p);
      return;
    }

    // Telegraphed ring of strikes at the closing edge so clients see it squeeze in.
    chasm.pulse -= dt;
    if (chasm.pulse <= 0) {
      chasm.pulse = DEADLINE_CHASM_PULSE;
      this.spawnChasmRing(chasm.center, chasm.radius);
    }

    // Anyone OUTSIDE the shrinking safe circle is being devoured — a heavy fraction
    // of max HP per second (ignores mitigation), killed outright once it bites deep.
    for (const p of this.players) {
      if (p.state === 'dead') continue;
      if (dist(p.pos, chasm.center) > chasm.radius + p.radius) {
        p.hp -= p.maxHp * DEADLINE_CHASM_DPS_FRAC * dt;
        this.events.push({
          t: 'hit',
          pos: { ...p.pos },
          amount: p.maxHp * DEADLINE_CHASM_DPS_FRAC * dt,
          targetId: p.id,
          side: 'player',
        });
        if (p.hp <= 0) swallow(p);
      }
    }
  }

  /** Average position of the still-standing heroes (chasm centre), arena mid if none. */
  private aliveCentroid(): Vec2 {
    const alive = this.players.filter((p) => p.state === 'alive');
    if (alive.length === 0) return { x: this.arena.w / 2, y: this.arena.h / 2 };
    let x = 0;
    let y = 0;
    for (const p of alive) {
      x += p.pos.x;
      y += p.pos.y;
    }
    return { x: x / alive.length, y: y / alive.length };
  }

  /** A telegraphed ring of strikes marking the chasm's closing edge (item 21/27). */
  private spawnChasmRing(center: Vec2, radius: number): void {
    const n = DEADLINE_CHASM_RING_COUNT;
    const dmg = CORRUPTION_COLLAPSE_DAMAGE * this.bossDamageScalar();
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      this.addPendingStrike({
        pos: { x: center.x + Math.cos(ang) * radius, y: center.y + Math.sin(ang) * radius },
        radius: 92,
        fuse: 0.9,
        damage: dmg,
        color: 0x6a2fa0, // void purple
        slowMult: 0.5,
        slowDuration: 1,
      });
    }
  }

  /**
   * Back-compat accessor for the single-boss era: the encounter's first boss.
   * Prefer iterating `bosses` — this exists for tests and single-target logic.
   */
  get boss(): Boss | null {
    return this.bosses[0] ?? null;
  }

  set boss(b: Boss | null) {
    this.bosses = b ? [b] : [];
  }

  /** The MonsterDef a given boss acts by (twin bosses differ from the lead). */
  defOf(boss: Boss): MonsterDef {
    return boss.monsterId === this.monsterDef.id ? this.monsterDef : getMonster(boss.monsterId);
  }

  /** All bosses still fighting (hp > 0). */
  aliveBosses(): Boss[] {
    return this.bosses.filter((b) => b.hp > 0);
  }

  // -------------------------------------------------------------------------
  // Setup
  // -------------------------------------------------------------------------

  allocId(): EntityId {
    return this.nextId++;
  }

  private spawnPlayers(inits: WorldPlayerInit[]): void {
    const n = inits.length;
    const spacing = 90;
    const startX = this.arena.w / 2 - ((n - 1) * spacing) / 2;
    const y = this.arena.h - 220;
    inits.forEach((pi, i) => {
      const cls = getClass(pi.classId);
      const player: Player = {
        id: this.allocId(),
        peerId: pi.peerId,
        name: pi.name,
        classId: pi.classId,
        pos: { x: startX + i * spacing, y },
        aim: { x: 0, y: -1 },
        hp: cls.maxHp,
        maxHp: cls.maxHp,
        moveSpeed: cls.moveSpeed,
        radius: cls.radius,
        state: 'alive',
        downedTimer: 0,
        reviveProgress: 0,
        reviverId: null,
        cooldowns: { basic: 0, a1: 0, a2: 0, a3: 0 },
        castTimer: 0,
        castSlot: null,
        buffs: [],
        cooldownMult: 1,
        castMult: 1,
        damageMult: 1,
        damageTakenMult: 1,
        terrainResist: 0,
        regenPerSec: 0,
        threat: 0,
        stats: { damageDealt: 0, healingDone: 0, revives: 0, deaths: 0 },
        // Private ability table so character upgrades can retune this hero's kit
        // without mutating the shared class data.
        abilities: cloneAbilities(cls.abilities),
        baseScore: pi.baseScore ?? 0,
        prevButtons: { basic: false, a1: false, a2: false, a3: false, revive: false },
        lastSeq: -1,
      };
      // Apply this hero's accumulated run upgrades (may raise maxHp, so do it
      // before the player is considered "at full health"). Generic first, then
      // the class-specific character upgrades that retune the ability table.
      applyUpgrades(player, pi.upgrades);
      applyCharUpgrades(player, pi.charUpgrades);
      // Stash the picked char upgrades so subclass grands (item 17) among them can be
      // re-applied to the bound sub-abilities on every rebind (here + on a class swap).
      player.charUpgradeIds = pi.charUpgrades ?? [];
      // Global attack slow-down last, so character cooldown-reduction upgrades
      // still shave a proportional slice off the (doubled) base.
      if (player.abilities) slowAttackCooldowns(player.abilities);
      // Subclass skills (item 13) — bind up to two to the sub1/sub2 slots.
      this.bindSubSkills(player, pi.subSkills);
      // Multiclass (item 14) — build a resolved kit for each owned class so a swap
      // is instant, and seed per-class cooldown state.
      this.buildMulticlass(player, pi);
      // Ephemeral shop perks bought for THIS fight (item 21): passive combat
      // bursts fold into the stat multipliers; potions/self-revives become
      // in-fight resources. All gone next fight (a fresh World is built each boss).
      this.applyEphemeral(player, pi.ephemeral);
      player.hp = player.maxHp;
      this.players.push(player);
    });
  }

  /**
   * Record the hero's chosen subclass skills and bind the ACTIVE class's two to the
   * sub1/sub2 slots (items 13/15). A multiclass hero can hold a full subclass per
   * class; only the class they're currently wielding contributes usable sub skills,
   * and a class swap re-binds via `rebindActiveSubs`.
   */
  private bindSubSkills(p: Player, ids?: string[]): void {
    if (!ids || ids.length === 0) return;
    const valid = ids.filter((id) => getSubSkill(id));
    if (valid.length === 0) return;
    p.subSkillIds = valid;
    p.cooldowns.sub1 = 0;
    p.cooldowns.sub2 = 0;
    this.rebindActiveSubs(p);
  }

  /** Rebuild sub1/sub2 from the sub skills belonging to the hero's ACTIVE class. */
  private rebindActiveSubs(p: Player): void {
    const active = activeSubSkillIds(p);
    p.subAbilities = {};
    active.forEach((id, i) => {
      const skill = getSubSkill(id);
      if (!skill) return;
      const slot: SubSlot = i === 0 ? 'sub1' : 'sub2';
      p.subAbilities![slot] = { ...skill.ability, slot };
    });
    // Re-apply any owned SUBCLASS grands (item 17) to the freshly-bound sub-abilities
    // — the sub skills are rebuilt from scratch each rebind, so this stays idempotent.
    applySubclassGrands(p, p.charUpgradeIds);
  }

  /**
   * Build a ready-to-swap kit for each of a multiclass hero's classes (item 14).
   * Each extra class's table is resolved (clone + that class's ability upgrades +
   * the global attack slow-down) via previewAbilityTable, so a swap is instant and
   * each class keeps its own cooldown bank.
   */
  private buildMulticlass(p: Player, pi: WorldPlayerInit): void {
    const extra = [...new Set((pi.extraClasses ?? []).filter((c) => c !== pi.classId))];
    if (extra.length === 0) return;
    const zero = (): Cooldowns => ({ basic: 0, a1: 0, a2: 0, a3: 0 });
    p.classes = [pi.classId, ...extra];
    p.classTables = { [pi.classId]: p.abilities! };
    p.classCooldowns = { [pi.classId]: zero() };
    p.swapCd = 0;
    for (const cid of extra) {
      p.classTables[cid] = previewAbilityTable(cid, pi.charUpgrades ?? []);
      p.classCooldowns[cid] = zero();
    }
  }

  /**
   * Apply a hero's ephemeral-shop purchases for this fight (item 21). Passive
   * perks fold straight into the persistent stat multipliers (so they compose
   * with class upgrades and are predicted correctly on clients via `moveSpeed`);
   * potions and self-revives become live in-fight resources.
   */
  private applyEphemeral(p: Player, stock?: EphemeralStock): void {
    if (!stock) return;
    if (stock.speed) p.moveSpeed *= EPHEMERAL_SPEED_MULT;
    if (stock.damage) p.damageMult *= EPHEMERAL_DAMAGE_MULT;
    if (stock.defense) p.damageTakenMult *= EPHEMERAL_DEFENSE_MULT;
    if (stock.potions && stock.potions > 0) p.potions = stock.potions;
    if (stock.revives && stock.revives > 0) p.selfRevives = stock.revives;
  }

  /** Quaff a carried healing vial (item 21): heal a chunk of max HP, one charge. */
  private tryUsePotion(p: Player): void {
    if ((p.potions ?? 0) <= 0) return;
    if (p.hp >= p.maxHp) return; // don't waste a vial at full health
    p.potions = (p.potions ?? 0) - 1;
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * EPHEMERAL_POTION_HEAL);
    const healed = p.hp - before;
    p.stats.healingDone += healed;
    this.events.push({ t: 'heal', pos: { ...p.pos }, amount: healed, targetId: p.id });
  }

  /** Damage ease for a multi-boss pack, tied to party progression (item 10): full
   *  (1) in endless or by the run's end; softer for an early first-run pack. */
  private packDamageEase(): number {
    if (this.cycle > 0) return 1; // a built endless party takes packs at full strength
    const progress = this.runTotal > 1 ? this.runIndex / (this.runTotal - 1) : 1;
    const p = Math.max(0, Math.min(1, progress));
    return PACK_EARLY_DMG_EASE + (1 - PACK_EARLY_DMG_EASE) * p;
  }

  private spawnBosses(ids: MonsterId[], bossAffixes?: AffixId[][]): void {
    const n = ids.length;
    const twin = n > 1;
    // A shared-arena pack splits its danger budget: each boss is weaker the more
    // of them share the floor (twin ≈ 0.62 HP / 0.8 dmg; a triplet/quad even
    // less), so N-at-once stays chaotic rather than simply N× lethal.
    const hpFrac = twin ? TWIN_HP_FRAC * Math.sqrt(2 / n) : 1;
    // Ease a pack's damage against party progression (item 10): a multi-boss event
    // early in the FIRST run (cycle 0), when the band has barely any upgrades, hits
    // softer, ramping to full by the run's end. Endless cycles pay full (built party).
    const dmgFrac = twin ? TWIN_DMG_FRAC * Math.pow(2 / n, 0.35) * this.packDamageEase() : 1;
    ids.forEach((id, i) => {
      const def = getMonster(id);
      // The practice dummy is a UI/training target, not a balance target — it
      // keeps its full HP (and its brisk self-heal) so sparring stays smooth.
      const hpScale = def.id === 'dummy' ? 1 : BOSS_HP_SCALE;
      const maxHp = Math.round(def.baseHp * hpScale * this.scaling.hpMultiplier * hpFrac);
      const cooldowns: Record<string, number> = {};
      for (const ab of def.abilities) cooldowns[ab.id] = 0;
      // Spread a duo along the top of the arena so they don't spawn stacked.
      const x = (this.arena.w * (i + 1)) / (ids.length + 1);
      const affixes = bossAffixes?.[i]?.length ? bossAffixes[i] : undefined;
      // A Teleporting boss that can't normally blink gets a synthetic blink cd so
      // it starts on cooldown like a real blinker rather than vanishing on tick 1.
      const teleports = affixes?.includes('teleporting') ?? false;
      const blinkTimer = def.blink ? def.blink.internalCd : teleports ? AFFIX_TELEPORT_CD : 0;
      this.bosses.push({
        id: this.allocId(),
        monsterId: def.id,
        pos: { x, y: 300 },
        facing: Math.PI / 2,
        hp: maxHp,
        maxHp,
        moveSpeed: def.moveSpeed,
        radius: def.radius,
        phase: 'normal',
        action: {
          kind: 'idle',
          abilityId: null,
          remaining: 0,
          total: 0,
          targetId: null,
          targetPos: null,
          aimAngle: Math.PI / 2,
          channelAccum: 0,
        },
        cooldowns,
        // Stagger pack decisions so their openers don't land the same tick.
        decisionTimer: BOSS_DECISION_MIN * (1 + i * 0.5),
        regen: def.regen,
        regenLockout: 0,
        blinkTimer,
        buffs: [],
        dmgScale: dmgFrac,
        modAura: this.modifier?.aura,
        modColor: this.modifier?.color,
        modAuraTimer: 0,
        affixes,
        // Stagger affix cadences per boss so a duo's waves/pools don't sync up.
        affixTimers: affixes ? this.initialAffixTimers(i) : undefined,
        recentDamageTaken: 0,
      });
    });
  }

  /**
   * Seed each affix's cadence accumulator with a small per-boss offset so a twin
   * pair's molten trails / add waves / wards don't all fire on the same tick, and
   * so the first wave/pool doesn't land the instant the fight opens.
   */
  private initialAffixTimers(index: number): Record<string, number> {
    const jitter = index * 0.9;
    return {
      splitting: -3 + jitter, // first bonus wave lands a few seconds later
      molten: jitter * 0.2,
      warding: -2 + jitter,
      barbed: jitter * 0.3,
    };
  }

  /** Playground interaction pillars: Host / Join / Class / Controls totems. */
  private spawnTotems(): void {
    const w = this.arena.w;
    const h = this.arena.h;
    const mk = (kind: Totem['kind'], x: number, y: number): Totem => ({
      id: this.allocId(),
      kind,
      pos: { x, y },
      radius: 34,
      triggerRadius: 120,
    });
    this.totems = [
      mk('host', w * 0.24, h * 0.4),
      mk('join', w * 0.76, h * 0.4),
      mk('class', w * 0.24, h * 0.78),
      mk('controls', w * 0.76, h * 0.78),
    ];
  }

  playerIdByPeer(peerId: string): EntityId | null {
    const p = this.players.find((x) => x.peerId === peerId);
    return p ? p.id : null;
  }

  /** Remove a disconnected player mid-fight. Boss is NOT rescaled (per spec). */
  removePlayerByPeer(peerId: string): void {
    const p = this.players.find((x) => x.peerId === peerId);
    if (!p) return;
    if (this.tauntTargetId === p.id) {
      this.tauntTargetId = null;
      this.tauntTimer = 0;
    }
    this.players = this.players.filter((x) => x.peerId !== peerId);
    // Do not trigger defeat purely from a disconnect: only wipe when remaining
    // players are all non-alive (checkEndConditions guards players.length > 0).
    this.checkEndConditions();
  }

  bossDamageScalar(): number {
    const soft =
      this.elapsed > SOFT_ENRAGE_TIME
        ? 1 + SOFT_ENRAGE_RAMP * (this.elapsed - SOFT_ENRAGE_TIME)
        : 1;
    return this.scaling.bossDamageMult * soft;
  }

  // -------------------------------------------------------------------------
  // Main step
  // -------------------------------------------------------------------------

  step(dt: number, inputs: Map<string, InputCommand>): void {
    if (this.finished) return;
    this.events = [];
    this.elapsed += dt;

    this.tickTimers(dt);
    this.applyInputs(dt, inputs);
    this.checkDownedTransitions();
    this.updateRevive(dt, inputs);
    this.updateProjectiles(dt);
    this.updateZones(dt);
    this.updatePendingStrikes(dt);
    this.updateTerrain(dt);
    this.checkDownedTransitions();
    this.updateBosses(dt);
    // Boss-vs-boss synergy (twin/N-boss packs): a telegraphed bond that empowers
    // or wards a wounded partner. Inert for a lone boss (guards on pack size).
    this.updateBossSynergy(dt);
    this.updateAdds(dt);
    // Mid-fight corruption beats (host-gated) — may add pending strikes, zones,
    // adds or boss buffs that resolve on subsequent ticks.
    if (this.corruptionEnabled) stepCorruption(this, dt);
    // Hardcore kill-deadline warnings + closing-chasm escalation (items 21/24/27).
    this.stepDeadline(dt);
    decayThreat(this.players, dt);
    this.tauntTimer = Math.max(0, this.tauntTimer - dt);
    this.separateAndClamp();
    this.checkDownedTransitions();
    this.checkEndConditions();

    this.tick++;
  }

  private tickTimers(dt: number): void {
    for (const p of this.players) {
      tickBuffs(p, dt);
      tickStunDr(p, dt);
      // Passive regeneration (Renewal upgrade) — only while up and fighting.
      if (p.regenPerSec > 0 && p.state === 'alive' && p.hp > 0) {
        p.hp = Math.min(p.maxHp, p.hp + p.regenPerSec * dt);
      }
      p.cooldowns.basic = Math.max(0, p.cooldowns.basic - dt);
      p.cooldowns.a1 = Math.max(0, p.cooldowns.a1 - dt);
      p.cooldowns.a2 = Math.max(0, p.cooldowns.a2 - dt);
      p.cooldowns.a3 = Math.max(0, p.cooldowns.a3 - dt);
      // Subclass-skill cooldowns (present only when a skill is bound).
      if (p.cooldowns.sub1 != null) p.cooldowns.sub1 = Math.max(0, p.cooldowns.sub1 - dt);
      if (p.cooldowns.sub2 != null) p.cooldowns.sub2 = Math.max(0, p.cooldowns.sub2 - dt);
      // Multiclass swap gate + per-class cooldown decay for the INACTIVE classes,
      // so a swapped-away kit keeps recovering while you fight with another.
      if (p.swapCd != null && p.swapCd > 0) p.swapCd = Math.max(0, p.swapCd - dt);
      // Decay the purely-visual knockback/pull slide (item 28); logic never reads it.
      if (p.slideRemaining != null && p.slideRemaining > 0) {
        p.slideRemaining = Math.max(0, p.slideRemaining - dt);
      }
      this.tickInactiveClassCooldowns(p, dt);

      if (p.castTimer > 0) {
        const was = p.castTimer;
        p.castTimer = Math.max(0, p.castTimer - dt);
        if (was > 0 && p.castTimer === 0 && p.castSlot) {
          const slot = p.castSlot;
          p.castSlot = null;
          if (p.state === 'alive' && !hasBuff(p, 'stun')) {
            resolvePlayerAbility(this, p, slot, { x: 0, y: 0 });
          }
        }
      }

      if (p.state === 'downed') {
        p.downedTimer -= dt;
        if (p.downedTimer <= 0) {
          p.state = 'dead';
          this.events.push({ t: 'death', id: p.id, kind: 'player', pos: { ...p.pos } });
        }
      }
    }
  }

  private applyInputs(dt: number, inputs: Map<string, InputCommand>): void {
    for (const p of this.players) {
      const cmd = inputs.get(p.peerId) ?? ZERO_INPUT;
      if (p.state !== 'alive') {
        p.prevButtons = { ...cmd.buttons };
        continue;
      }

      // aim (always allowed)
      if (cmd.aim.x !== 0 || cmd.aim.y !== 0) p.aim = normalize(cmd.aim);

      // Ephemeral healing vial (item 21) — quaffed with the item button. A
      // consumable, not an ability, so it works even while stunned or mid-cast
      // (a clutch escape). Edge-triggered; inert in the calm reward scene.
      if (this.scene === null && (cmd.buttons.item ?? false) && !(p.prevButtons.item ?? false)) {
        this.tryUsePotion(p);
      }

      const stunned = hasBuff(p, 'stun');
      const casting = p.castTimer > 0;

      if (!stunned && !casting) {
        const move = clampLength(cmd.move, 1);
        const speed = p.moveSpeed * buffMult(p, 'moveSpeed');
        p.pos = vadd(p.pos, vscale(move, speed * dt));

        // The reward chamber is a calm, no-combat scene: the hero walks freely
        // but abilities are inert (no stray projectiles, and no cast-time root
        // locking the hero mid-stride while they walk to a relic or the vortex).
        if (this.scene === null) {
          const moveDir = normalize(move);
          for (const slot of SLOTS) {
            // Edge-triggered by default; with auto-fire, a held button repeats
            // (tryUseAbility still gates on cooldown, so it fires at cadence).
            const held = cmd.buttons[slot];
            const fired = cmd.autofire ? held : held && !p.prevButtons[slot];
            if (fired) this.tryUseAbility(p, slot, moveDir);
          }
          // Subclass skills (item 13) — same edge / autofire rules, but only while
          // wielding the class the skill belongs to (item 14: a multiclass hero's
          // sub skills go dormant when they swap to a class that doesn't own them).
          for (const slot of SUB_SLOTS) {
            if (!p.subAbilities?.[slot]) continue;
            if (!subSlotForActiveClass(p, slot)) continue;
            const held = cmd.buttons[slot] ?? false;
            const fired = cmd.autofire ? held : held && !(p.prevButtons[slot] ?? false);
            if (fired) this.tryUseAbility(p, slot, moveDir);
          }
          // Multiclass swap (item 14) is no longer driven off the raw button here:
          // the client owns the tap-vs-hold gesture (a quick tap cycles, a hold
          // opens the class radial) and drives it through `requestClassSwap` so a
          // hold can't accidentally cycle on the initial press. See net protocol
          // `swap` + `requestClassSwap` below.
        }
      }

      p.prevButtons = { ...cmd.buttons };
    }
  }

  private tryUseAbility(p: Player, slot: ExtSlot, moveDir: Vec2): void {
    const ab = abilityForSlot(p, slot);
    if (!ab) return; // sub slot with no bound skill
    if ((p.cooldowns[slot] ?? 0) > 0) return;
    if (hasBuff(p, 'silence') && slot !== 'basic') return; // silenced: only the basic works
    if (hasBuff(p, 'stun') || p.castTimer > 0) return;

    if (ab.castTime && ab.castTime > 0) {
      p.castTimer = ab.castTime * p.castMult;
      p.castSlot = slot;
      p.cooldowns[slot] = ab.cooldown * p.cooldownMult;
      this.events.push({
        t: 'cast',
        ability: `${ab.name} (cast)`,
        sourceId: p.id,
        pos: { ...p.pos },
        side: 'player',
        slot,
      });
    } else {
      resolvePlayerAbility(this, p, slot, moveDir);
      p.cooldowns[slot] = ab.cooldown * p.cooldownMult;
    }
  }

  // --- Multiclass (item 14) --------------------------------------------------

  /** Tap-swap to the NEXT owned class (per-class cooldowns preserved). */
  private cycleClass(p: Player): void {
    if (!p.classes || p.classes.length < 2) return;
    const cur = p.classes.indexOf(p.classId);
    const next = p.classes[(cur + 1) % p.classes.length];
    this.setActiveClass(p, next);
  }

  /**
   * Host-authoritative multiclass swap request for a peer (item 14). The single
   * deterministic entry point both the tap-cycle and the hold-to-open class radial
   * resolve through: with `target` it swaps directly to that class (the radial),
   * without it cycles to the next owned class (a quick tap). Validated — a target
   * the hero doesn't own is ignored, dead/downed heroes can't swap, and swaps are
   * inert outside a real fight — so a misbehaving client can't force a bad swap.
   * The swap-gate + per-class cooldowns are enforced by `setActiveClass`.
   */
  requestClassSwap(peerId: string, target?: ClassId): void {
    if (this.scene !== null) return; // only in a live fight, never a menu scene
    const p = this.players.find((x) => x.peerId === peerId);
    if (!p || p.state !== 'alive') return;
    if (target != null) {
      if (!p.classes || !p.classes.includes(target)) return; // must own the target
      this.setActiveClass(p, target);
    } else {
      this.cycleClass(p);
    }
  }

  /**
   * Swap the hero's active class. The previous kit's cooldowns are stashed and the
   * target kit's restored, so "all cooldowns are respected per class" (item 14).
   * A short swap gate prevents free-cast spam. Subclass skills persist across swaps.
   */
  setActiveClass(p: Player, classId: ClassId): void {
    if (p.classId === classId || !p.classTables || !p.classCooldowns) return;
    if (p.swapCd != null && p.swapCd > 0) return;
    const table = p.classTables[classId];
    if (!table) return;
    // Stash the current class's base-slot AND subclass-slot cooldowns: each class
    // carries its own subclass (item 15), so sub1/sub2 are per-class too now.
    p.classCooldowns[p.classId] = {
      basic: p.cooldowns.basic,
      a1: p.cooldowns.a1,
      a2: p.cooldowns.a2,
      a3: p.cooldowns.a3,
      sub1: p.cooldowns.sub1,
      sub2: p.cooldowns.sub2,
    };
    p.classId = classId;
    p.abilities = table;
    const cds = p.classCooldowns[classId] ?? { basic: 0, a1: 0, a2: 0, a3: 0 };
    p.cooldowns = {
      basic: cds.basic,
      a1: cds.a1,
      a2: cds.a2,
      a3: cds.a3,
      sub1: cds.sub1 ?? 0,
      sub2: cds.sub2 ?? 0,
    };
    // Swap sub1/sub2 to the new class's subclass skills (or clear if it has none).
    this.rebindActiveSubs(p);
    p.castTimer = 0;
    p.castSlot = null;
    p.swapCd = CLASS_SWAP_CD;
  }

  /** Decay the saved cooldowns of the classes the hero is NOT currently wielding. */
  private tickInactiveClassCooldowns(p: Player, dt: number): void {
    if (!p.classCooldowns) return;
    for (const cid of Object.keys(p.classCooldowns)) {
      if (cid === p.classId) continue;
      const c: Cooldowns = p.classCooldowns[cid];
      c.basic = Math.max(0, c.basic - dt);
      c.a1 = Math.max(0, c.a1 - dt);
      c.a2 = Math.max(0, c.a2 - dt);
      c.a3 = Math.max(0, c.a3 - dt);
      if (c.sub1 != null) c.sub1 = Math.max(0, c.sub1 - dt);
      if (c.sub2 != null) c.sub2 = Math.max(0, c.sub2 - dt);
    }
  }

  private updateRevive(dt: number, inputs: Map<string, InputCommand>): void {
    // Hardcore: once the fight's revive stock is spent, a downed hero can no
    // longer be brought back — they're out for the rest of this boss.
    if (this.reviveBudget <= 0) return;
    for (const d of this.players) {
      if (d.state !== 'downed') continue;
      // item 10: count EVERY ally reviving this hero (not just the first), so more
      // hands make the revive faster. The first in-range ally is credited with the
      // revive for score; the tally drives the co-revive speed-up.
      let reviver: Player | null = null;
      let reviverCount = 0;
      for (const p of this.players) {
        if (p.state !== 'alive') continue;
        const cmd = inputs.get(p.peerId);
        if (!cmd || !cmd.buttons.revive) continue;
        if (dist(p.pos, d.pos) <= REVIVE_RANGE + p.radius + d.radius) {
          reviverCount += 1;
          if (!reviver) reviver = p;
        }
      }
      if (reviver) {
        // Each extra concurrent reviver speeds the fill (diminishing returns, floored
        // so it can never be instant — see coReviveSpeed / REVIVE_MIN_TIME).
        d.reviveProgress += dt * coReviveSpeed(reviverCount);
        d.reviverId = reviver.id;
        if (d.reviveProgress >= REVIVE_TIME) {
          d.state = 'alive';
          d.hp = d.maxHp * REVIVE_HP_FRAC;
          d.reviveProgress = 0;
          d.reviverId = null;
          d.downedTimer = 0;
          reviver.stats.revives += 1;
          this.reviveBudget -= 1; // hardcore: spend from the fight's revive stock
          this.events.push({ t: 'revive', id: d.id, pos: { ...d.pos } });
          if (this.reviveBudget <= 0) return; // stock spent — no more this fight
        }
      } else {
        d.reviveProgress = 0;
        d.reviverId = null;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Projectiles
  // -------------------------------------------------------------------------

  private updateProjectiles(dt: number): void {
    const keep: Projectile[] = [];
    for (const proj of this.projectiles) {
      const prev = { x: proj.pos.x, y: proj.pos.y };
      const step = vscale(proj.vel, dt);
      proj.pos = vadd(proj.pos, step);
      proj.lifetime -= dt;
      // Hard travel cap: a ranged shot fizzles once its range budget is spent, so
      // no projectile can lap the torus forever and hit the caster from behind.
      proj.rangeLeft -= Math.hypot(step.x, step.y);

      // Cover obstacles absorb any ranged attack whose path crosses them
      // (segment test avoids fast projectiles tunneling through) — no damage.
      const consumed = this.projectileHitsObstacle(prev, proj)
        ? true
        : proj.side === 'player'
          ? this.resolvePlayerProjectile(proj)
          : this.resolveBossProjectile(proj);

      if (!consumed && proj.lifetime > 0 && proj.rangeLeft > 0) {
        // Projectiles wrap around the torus too (rather than flying off-map).
        proj.pos = wrapPos(proj.pos);
        keep.push(proj);
      }
    }
    this.projectiles = keep;
  }

  /** True if this projectile's step crossed any cover obstacle (blocks ranged). */
  private projectileHitsObstacle(prev: Vec2, proj: Projectile): boolean {
    for (const o of this.obstacles) {
      if (pointInSegment(o.pos, prev, proj.pos, o.radius, proj.hitRadius)) return true;
    }
    return false;
  }

  private resolvePlayerProjectile(proj: Projectile): boolean {
    const owner = this.players.find((p) => p.id === proj.ownerId) ?? null;
    // find first collision (any boss, else an add)
    let hitBoss: Boss | null = null;
    for (const b of this.aliveBosses()) {
      if (dist(proj.pos, b.pos) <= proj.hitRadius + b.radius) {
        hitBoss = b;
        break;
      }
    }
    let hitAdd: Add | null = null;
    if (!hitBoss) {
      for (const a of this.adds) {
        if (a.hp <= 0) continue;
        if (dist(proj.pos, a.pos) <= proj.hitRadius + a.radius) {
          hitAdd = a;
          break;
        }
      }
    }
    if (!hitBoss && !hitAdd) return false;

    let dealt = 0;
    if (proj.impactRadius > 0) {
      // AoE on impact
      const center = proj.pos;
      for (const b of this.aliveBosses()) {
        if (dist(center, b.pos) <= proj.impactRadius + b.radius) {
          this.applyProjDamageBoss(owner, proj.damage, b);
          dealt += proj.damage;
          this.applyProjRiders(b, proj);
        }
      }
      for (const a of this.adds) {
        if (a.hp <= 0) continue;
        if (dist(center, a.pos) <= proj.impactRadius + a.radius) {
          if (owner) damageAdd(this, owner, a, proj.damage);
          else a.hp -= proj.damage;
          dealt += proj.damage;
          this.applyProjRiders(a, proj);
        }
      }
      // Flash the blast radius so the on-impact AoE is actually visible (it used
      // to emit a no-op telegraph). Colored to match the projectile (fireball).
      this.events.push({
        t: 'skillArea',
        sourceId: proj.ownerId,
        side: 'player',
        color: PROJECTILE_IMPACT_COLOR[proj.kind] ?? 0xff8a3d,
        area: {
          kind: 'circle',
          origin: { ...center },
          angle: 0,
          range: 0,
          radius: proj.impactRadius,
          halfAngle: 0,
        },
      });
    } else if (hitBoss) {
      this.applyProjDamageBoss(owner, proj.damage, hitBoss);
      dealt += proj.damage;
      this.applyProjRiders(hitBoss, proj);
    } else if (hitAdd) {
      if (owner) damageAdd(this, owner, hitAdd, proj.damage);
      else hitAdd.hp -= proj.damage;
      dealt += proj.damage;
      this.applyProjRiders(hitAdd, proj);
    }
    // Vampiric shots feed their archer (melee lifesteal lives in abilities.ts).
    if (proj.lifesteal && proj.lifesteal > 0 && dealt > 0 && owner) {
      healPlayer(this, null, owner, dealt * proj.lifesteal);
    }
    return true;
  }

  /** Apply a hostile projectile's on-hit riders (frost slow, freeze) to a target. */
  private applyProjRiders(target: Boss | Add, proj: Projectile): void {
    if (proj.slowMult != null && proj.slowMult < 1) {
      applyBuff(target, makeBuff('moveSpeed', proj.slowMult, proj.slowDuration ?? 2, 'slow'));
    }
    if (proj.freeze != null && proj.freeze > 0) {
      applyStun(this, target, proj.freeze, 'freeze');
    }
  }

  private applyProjDamageBoss(owner: Player | null, base: number, boss?: Boss | null): void {
    const target = boss ?? this.boss;
    if (!target) return;
    if (owner) {
      damageBoss(this, owner, target, base);
    } else {
      // Ownerless (disconnected caster): still honor the boss's mitigation buffs.
      const dealt = base * buffMult(target, 'damageTaken');
      target.hp -= dealt;
      this.events.push({
        t: 'hit',
        pos: { ...target.pos },
        amount: dealt,
        targetId: target.id,
        side: 'boss',
      });
    }
  }

  private resolveBossProjectile(proj: Projectile): boolean {
    for (const p of this.players) {
      if (p.state !== 'alive') continue;
      if (dist(proj.pos, p.pos) <= proj.hitRadius + p.radius) {
        damagePlayer(this, p, proj.damage);
        // Frost bosses' bolts chill whoever they strike.
        if (proj.slowMult != null && proj.slowMult < 1) {
          applyBuff(p, makeBuff('moveSpeed', proj.slowMult, proj.slowDuration ?? 2, 'bossSlow'));
        }
        return true;
      }
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Ground zones
  // -------------------------------------------------------------------------

  private updateZones(dt: number): void {
    const keep: GroundZone[] = [];
    for (const z of this.groundZones) {
      z.remaining -= dt;
      z.tickAccum += dt;
      while (z.tickAccum >= ZONE_TICK_INTERVAL) {
        z.tickAccum -= ZONE_TICK_INTERVAL;
        this.applyZoneTick(z);
      }
      if (z.remaining > 0) keep.push(z);
    }
    this.groundZones = keep;
  }

  private applyZoneTick(z: GroundZone): void {
    if (z.side === 'boss') {
      const slows = z.slowMult < 1;
      const silences = (z.silence ?? 0) > 0;
      for (const p of this.players) {
        if (p.state !== 'alive') continue;
        if (dist(z.pos, p.pos) <= z.radius + p.radius) {
          if (z.damagePerTick > 0) damagePlayer(this, p, z.damagePerTick);
          // Snare zones (Web Snare, Grasping Roots, Thorn Field…) also mire the party.
          if (slows) applyBuff(p, makeBuff('moveSpeed', z.slowMult, z.slowDuration, 'zoneSlow'));
          // Antimagic pools SILENCE casters who stand in them (item 28 follow-up):
          // a standable silence zone, re-applied each tick so leaving clears it.
          // The 🔇 buff glyph is the HUD cue; the world.step gate blocks specials.
          if (silences) applyBuff(p, makeBuff('silence', 0, z.silence!, 'zoneSilence'));
        }
      }
      return;
    }
    // player-side zone
    const owner = this.players.find((p) => p.id === z.ownerId) ?? null;
    const slows = z.slowMult < 1;
    // item 9: a true-root zone (Druid's Entangle) immobilises enemies inside — the
    // `root` buff is what world.bossMove / handleBlink / the charge resolution gate
    // on, so movement AND blink/charge/teleport stop while the boss stands in it.
    // Re-applied each tick and floored above the tick interval so it clears shortly
    // after the boss leaves (or the zone expires).
    const rootDur = z.roots ? Math.max(z.slowDuration, ZONE_TICK_INTERVAL * 1.5) : 0;
    if (z.damagePerTick > 0 || slows || z.roots) {
      for (const b of this.aliveBosses()) {
        if (dist(z.pos, b.pos) > z.radius + b.radius) continue;
        if (z.damagePerTick > 0) this.applyProjDamageBoss(owner, z.damagePerTick, b);
        if (slows) applyBuff(b, makeBuff('moveSpeed', z.slowMult, z.slowDuration, 'zoneSlow'));
        if (z.roots) applyBuff(b, makeBuff('root', 0, rootDur, 'zoneRoot'));
      }
      for (const a of this.adds) {
        if (a.hp <= 0) continue;
        if (dist(z.pos, a.pos) <= z.radius + a.radius) {
          if (z.damagePerTick > 0) {
            if (owner) damageAdd(this, owner, a, z.damagePerTick);
            else a.hp -= z.damagePerTick;
          }
          if (slows) applyBuff(a, makeBuff('moveSpeed', z.slowMult, z.slowDuration, 'zoneSlow'));
          if (z.roots) applyBuff(a, makeBuff('root', 0, rootDur, 'zoneRoot'));
        }
      }
    }
    if (z.healPerTick > 0) {
      for (const p of this.players) {
        if (p.state !== 'alive') continue;
        if (dist(z.pos, p.pos) <= z.radius + p.radius) {
          // heal via combat.healPlayer for stats/threat
          this.healViaZone(owner, p, z.healPerTick);
        }
      }
    }
  }

  private healViaZone(owner: Player | null, target: Player, amount: number): void {
    const effective = Math.min(amount, target.maxHp - target.hp);
    if (effective <= 0) return;
    target.hp += effective;
    if (owner) {
      owner.stats.healingDone += effective;
      owner.threat += effective * 0.5 * getClass(owner.classId).threatMult;
    }
    this.events.push({
      t: 'heal',
      pos: { ...target.pos },
      amount: effective,
      targetId: target.id,
    });
  }

  // -------------------------------------------------------------------------
  // Terrain (static per-run hazards)
  // -------------------------------------------------------------------------

  /**
   * Apply terrain effects to players: refresh the strongest slow found while
   * inside any patch (lingers `slowDuration` after leaving), and tick contact
   * damage per patch. Terrain never moves or expires. Boss/adds are unaffected
   * so terrain stays a clean positioning puzzle for the party.
   */
  private updateTerrain(dt: number): void {
    if (this.terrain.length === 0) return;

    // Signature hazards (abyss / tide) periodically SURGE — a telegraphed pull
    // toward their heart, lethal at the abyss's bottomless core (item 28).
    this.updateTerrainSurge(dt);

    // Slow: strongest (lowest mult) patch a player is standing in wins. The
    // Surefooted upgrade eases the slow back toward 1 (no effect at resist=1).
    for (const p of this.players) {
      if (p.state !== 'alive') continue;
      let slowest = 1;
      let slowDur = 0;
      for (const t of this.terrain) {
        if (t.slowMult >= 1) continue;
        if (dist(t.pos, p.pos) <= t.radius + p.radius && t.slowMult < slowest) {
          slowest = t.slowMult;
          slowDur = t.slowDuration;
        }
      }
      if (slowest < 1) {
        const resisted = 1 - (1 - slowest) * (1 - p.terrainResist);
        if (resisted < 1) applyBuff(p, makeBuff('moveSpeed', resisted, slowDur, 'terrain'));
      }
    }

    // Damage: per patch, on the shared ground-tick cadence (scaled by resist).
    for (const t of this.terrain) {
      if (t.damagePerTick <= 0) continue;
      t.tickAccum += dt;
      while (t.tickAccum >= TERRAIN_TICK_INTERVAL) {
        t.tickAccum -= TERRAIN_TICK_INTERVAL;
        for (const p of this.players) {
          if (p.state !== 'alive') continue;
          if (dist(t.pos, p.pos) <= t.radius + p.radius) {
            const dmg = t.damagePerTick * (1 - p.terrainResist);
            if (dmg > 0) damagePlayer(this, p, dmg);
          }
        }
      }
    }
  }

  /**
   * Schedule terrain SURGES (item 28): each surging hazard (abyss / tide) fires a
   * telegraphed pull toward its heart on a seeded cadence. The surge itself is a
   * pending strike carrying a `pull`, so it reuses the existing telegraph path
   * (clients see a filling ring and can flee) and resolves in updatePendingStrikes.
   * A per-patch phase stagger keeps multiple hazards from surging on the same tick.
   */
  private updateTerrainSurge(dt: number): void {
    for (let i = 0; i < this.terrain.length; i++) {
      const t = this.terrain[i];
      const cfg = TERRAIN_SURGE[t.kind];
      if (!cfg) continue;
      t.surgeAccum = (t.surgeAccum ?? -i * 0.9) + dt;
      if (t.surgeAccum < TERRAIN_SURGE_INTERVAL) continue;
      t.surgeAccum -= TERRAIN_SURGE_INTERVAL;
      this.addPendingStrike({
        pos: { ...t.pos },
        radius: t.radius,
        fuse: TERRAIN_SURGE_FUSE,
        damage: cfg.surgeDamage,
        color: cfg.color,
        pull: {
          strength: cfg.pull,
          lethalRadius: t.lethalRadius ?? 0,
          lethalDamage: cfg.plunge,
        },
      });
    }
  }

  // -------------------------------------------------------------------------
  // Boss
  // -------------------------------------------------------------------------

  private updateBosses(dt: number): void {
    this.tickModifierAura(dt);
    // Index among the LIVING bosses, so when one twin falls the survivor slides
    // back to hunting the top threat instead of forever chasing the runner-up.
    let aliveIndex = 0;
    for (const boss of this.bosses) {
      this.updateBoss(dt, boss, boss.hp > 0 ? aliveIndex++ : 0);
    }
  }

  // -------------------------------------------------------------------------
  // Boss-vs-boss synergy (twin / N-boss packs). A pack stops ignoring each other:
  // the healthiest boss forms a telegraphed BOND to a wounded partner and, if both
  // survive the wind-up, empowers or wards it — so a duo is more than two solos.
  // Seeded + host-authoritative; composes with affixes (distinct buff sources).
  // Completely inert for a lone boss (guards on pack size), so solo fights are
  // byte-for-byte unchanged.
  // -------------------------------------------------------------------------

  private updateBossSynergy(dt: number): void {
    // Cross-boss behaviour only exists when a pack shares the arena.
    if (this.bosses.length < 2) return;

    // A bond already forming: burn its wind-up, but only while BOTH ends live.
    if (this.bond) {
      const caster = this.bosses.find((b) => b.id === this.bond!.casterId);
      const partner = this.bosses.find((b) => b.id === this.bond!.partnerId);
      if (!caster || !partner || caster.hp <= 0 || partner.hp <= 0) {
        // The combo only resolves while both are alive — a kill cancels it.
        this.bond = null;
        this.synergyTimer = SYNERGY_INTERVAL;
        return;
      }
      this.bond.fuse -= dt;
      if (this.bond.fuse <= 0) {
        this.resolveBond(caster, partner, this.bond.kind);
        this.bond = null;
        this.synergyTimer = SYNERGY_INTERVAL;
      }
      return;
    }

    // Otherwise count down to the next bond; need two live bosses to pair up.
    const alive = this.aliveBosses();
    if (alive.length < 2) return;
    this.synergyTimer -= dt;
    if (this.synergyTimer > 0) return;
    this.startBond(alive);
  }

  /** Begin a telegraphed bond: the healthiest boss lends power to the most wounded. */
  private startBond(alive: Boss[]): void {
    const sorted = [...alive].sort((a, b) => b.hp / b.maxHp - a.hp / a.maxHp);
    const caster = sorted[0];
    const partner = sorted[sorted.length - 1];
    if (caster.id === partner.id) return; // degenerate (shouldn't happen with >=2)
    // Seeded gift: empower (partner hits harder) or ward (partner takes less).
    const kind: BossBond['kind'] = this.rng.next() < 0.5 ? 'empower' : 'ward';
    this.bond = {
      casterId: caster.id,
      partnerId: partner.id,
      kind,
      fuse: SYNERGY_WINDUP,
      total: SYNERGY_WINDUP,
    };
    // Flash the wind-up start; the forming bond also rides the wire as a line
    // telegraph (worldTelegraphs) so the band can read and interrupt it.
    this.events.push({ t: 'telegraph', pos: { ...partner.pos }, shape: 'line' });
  }

  /** Land a resolved bond: empower or ward the partner (composes with affixes). */
  private resolveBond(caster: Boss, partner: Boss, kind: BossBond['kind']): void {
    if (kind === 'empower') {
      applyBuff(
        partner,
        makeBuff('damageDealt', SYNERGY_EMPOWER_MULT, SYNERGY_BUFF_DURATION, 'packEmpower'),
      );
    } else {
      applyBuff(
        partner,
        makeBuff('damageTaken', SYNERGY_WARD_MULT, SYNERGY_BUFF_DURATION, 'packWard'),
      );
    }
    // Reads as a cast from the anchor + a flash on the empowered partner.
    this.events.push({
      t: 'cast',
      ability: kind === 'empower' ? 'Empower Pack' : 'Ward Pack',
      sourceId: caster.id,
      pos: { ...caster.pos },
      side: 'boss',
    });
    this.events.push({ t: 'telegraph', pos: { ...partner.pos }, shape: 'circle' });
  }

  private updateBoss(dt: number, boss: Boss, index: number): void {
    if (boss.hp <= 0) return;
    const def = this.defOf(boss);

    tickBuffs(boss, dt);
    tickStunDr(boss, dt);
    for (const id of Object.keys(boss.cooldowns)) {
      boss.cooldowns[id] = Math.max(0, boss.cooldowns[id] - dt);
    }
    boss.blinkTimer = Math.max(0, boss.blinkTimer - dt);

    // regen (troll & other regenerators) — SUPPRESSED for a beat after taking
    // damage, and hard-capped as a fraction of max HP/s, so a boss can never
    // out-heal a committed band and drag the fight out.
    boss.regenLockout = Math.max(0, (boss.regenLockout ?? 0) - dt);
    if (boss.regen > 0 && boss.regenLockout <= 0) {
      const regenMult =
        this.scaling.trollRegenMult * (boss.phase === 'enraged' ? def.enrageRegenMult : 1);
      // The practice dummy keeps its brisk, uncapped self-heal so it refills fast
      // once you stop swinging — but it still honours the lockout, so a committed
      // combo bursts it down (and it pops back up) instead of out-healing you.
      const perSec =
        def.id === 'dummy'
          ? boss.regen * regenMult
          : Math.min(boss.regen * regenMult, boss.maxHp * BOSS_REGEN_MAX_FRAC);
      boss.hp = Math.min(boss.maxHp, boss.hp + perSec * dt);
    }

    // enrage transition
    if (boss.phase === 'normal' && boss.hp / boss.maxHp <= def.enrageThreshold) {
      boss.phase = 'enraged';
      this.events.push({ t: 'enrage', id: boss.id, pos: { ...boss.pos } });
    }

    // Passive affix upkeep (trails, wards, waves, thorns, ramping haste). Runs
    // whether or not the boss is stunned; the "active" ones pause while stunned.
    const stunned = hasBuff(boss, 'stun');
    this.tickBossAffixes(dt, boss, stunned);
    if (stunned) return; // stunned: no movement or actions

    // Twin bosses split their attention: the second boss hunts the 2nd-highest
    // threat when one exists, so a duo can't simply pile onto the tank.
    const target = nthThreatTarget(this.players, index, this.tauntTargetId, this.tauntTimer);

    switch (boss.action.kind) {
      case 'idle': {
        boss.decisionTimer -= dt;
        this.bossMove(dt, boss, def, target);
        this.handleBlink(boss, def);
        if (boss.decisionTimer <= 0) {
          this.bossDecide(boss, def, target);
          boss.decisionTimer = BOSS_DECISION_MIN;
        }
        break;
      }
      case 'windup': {
        boss.action.remaining -= dt;
        if (boss.action.remaining <= 0) this.bossExecute(boss, def);
        break;
      }
      case 'channel': {
        boss.action.remaining -= dt;
        boss.action.channelAccum += dt;
        const ab = boss.action.abilityId ? abilityById(def, boss.action.abilityId) : undefined;
        while (boss.action.channelAccum >= ZONE_TICK_INTERVAL && ab) {
          boss.action.channelAccum -= ZONE_TICK_INTERVAL;
          this.applyVampiric(boss, beamTick(this, boss, ab, boss.action));
        }
        if (boss.action.remaining <= 0) {
          if (ab) boss.cooldowns[ab.id] = this.bossCooldown(boss, def, ab.cooldown);
          this.enterRecover(boss);
        }
        break;
      }
      case 'recover': {
        boss.action.remaining -= dt;
        this.bossMove(dt, boss, def, target);
        if (boss.action.remaining <= 0) boss.action.kind = 'idle';
        break;
      }
    }
  }

  /**
   * Endless "type" modifier aura: a periodic themed pulse layered on the boss so
   * a Frost Dragon chills the party, an Infernal one scorches them, and so on.
   * Cheap, telegraph-light pressure that stacks on top of the boss's own kit.
   */
  private tickModifierAura(dt: number): void {
    for (const boss of this.aliveBosses()) this.tickBossAura(dt, boss);
  }

  private tickBossAura(dt: number, boss: Boss): void {
    if (!boss.modAura) return;
    boss.modAuraTimer = (boss.modAuraTimer ?? 0) + dt;
    if (boss.modAuraTimer < MOD_AURA_INTERVAL) return;
    boss.modAuraTimer = 0;
    const scalar = this.bossDamageScalar() * (boss.dmgScale ?? 1);
    switch (boss.modAura) {
      case 'frost':
        for (const p of this.players) {
          if (p.state === 'alive' && dist(p.pos, boss.pos) <= 340) {
            applyBuff(p, makeBuff('moveSpeed', 0.5, 2.5, 'modFrost'));
          }
        }
        break;
      case 'ember':
        for (const p of this.players) {
          if (p.state === 'alive' && dist(p.pos, boss.pos) <= 250)
            damagePlayer(this, p, 16 * scalar);
        }
        this.events.push({ t: 'telegraph', pos: { ...boss.pos }, shape: 'circle' });
        break;
      case 'shadow':
        boss.hp = Math.min(boss.maxHp, boss.hp + boss.maxHp * 0.025);
        break;
      case 'venom':
        for (const p of this.players) {
          if (p.state === 'alive' && dist(p.pos, boss.pos) <= 300) {
            damagePlayer(this, p, 10 * scalar);
            applyBuff(p, makeBuff('moveSpeed', 0.6, 2, 'modVenom'));
          }
        }
        break;
      case 'storm': {
        const alive = this.players.filter((p) => p.state === 'alive');
        if (alive.length > 0) {
          const t = this.rng.pick(alive);
          this.events.push({ t: 'telegraph', pos: { ...t.pos }, shape: 'circle' });
          for (const p of alive) {
            if (dist(p.pos, t.pos) <= 130) damagePlayer(this, p, 22 * scalar);
          }
        }
        break;
      }
    }
  }

  private bossCooldown(boss: Boss, def: MonsterDef, base: number): number {
    const enrage = boss.phase === 'enraged' ? def.enrageCooldownMult : 1;
    return base * enrage * this.frenzyCooldownMult(boss);
  }

  /** Frenzied affix: attacks ramp faster as HP falls below half (1 above half). */
  private frenzyCooldownMult(boss: Boss): number {
    if (!hasAffix(boss, 'frenzied')) return 1;
    const hpFrac = boss.maxHp > 0 ? boss.hp / boss.maxHp : 0;
    if (hpFrac >= 0.5) return 1;
    const t = Math.min(1, (0.5 - hpFrac) / 0.5); // 0 at half HP → 1 at death
    return 1 - AFFIX_FRENZY_MAX_CDR * t;
  }

  /**
   * Overcharged affix: swell a telegraphed ability's reach/size (returns the SAME
   * object untouched for a non-overcharged boss, so nothing else changes). Applied
   * at every id→numbers lookup — resolution AND the telegraph — so the danger the
   * band sees matches the danger that lands.
   */
  private affixAbility(boss: Boss, ab: BossAbilityDef): BossAbilityDef {
    if (!hasAffix(boss, 'overcharged')) return ab;
    const s = AFFIX_OVERCHARGE_SCALE;
    return {
      ...ab,
      radius: ab.radius != null ? ab.radius * s : ab.radius,
      range: ab.range != null ? ab.range * s : ab.range,
      width: ab.width != null ? ab.width * s : ab.width,
    };
  }

  /**
   * The blink config a boss acts by: its own (Lich/Wraith/…), or a synthetic one
   * granted by the Teleporting affix to a boss that can't normally blink. A real
   * blinker with Teleporting just blinks more often. Null = this boss never blinks.
   */
  private blinkConfigFor(
    boss: Boss,
    def: MonsterDef,
  ): { range: number; threatenRange: number; internalCd: number } | null {
    if (def.blink) {
      return hasAffix(boss, 'teleporting')
        ? { ...def.blink, internalCd: def.blink.internalCd * AFFIX_TELEPORT_CD_MULT }
        : def.blink;
    }
    if (hasAffix(boss, 'teleporting')) {
      return {
        range: AFFIX_TELEPORT_RANGE,
        threatenRange: AFFIX_TELEPORT_THREATEN,
        internalCd: AFFIX_TELEPORT_CD,
      };
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Affix runtime (behaviour for the ids on boss.affixes; visuals live in the
  // renderer / HUD off BossView.affixes). See content/affixes.ts.
  // -------------------------------------------------------------------------

  /**
   * Per-tick affix upkeep: the passive, cadence-driven affixes. `stunned` gates
   * the "active" ones (a stunned boss doesn't split or lash out, but its molten
   * ground and ward still smoulder). Cadence accumulators live in `affixTimers`.
   */
  private tickBossAffixes(dt: number, boss: Boss, stunned: boolean): void {
    // Decay the rolling "recent damage" window a Barbed pulse scales from.
    if (boss.recentDamageTaken) {
      boss.recentDamageTaken = Math.max(0, boss.recentDamageTaken * (1 - dt / AFFIX_BARBED_MEMORY));
    }
    const affixes = boss.affixes;
    if (!affixes || affixes.length === 0) return;
    const timers = (boss.affixTimers ??= {});
    const scalar = this.bossDamageScalar() * (boss.dmgScale ?? 1);

    // Accelerating: a haste that ramps with fight time, refreshed each tick.
    if (affixes.includes('accelerating')) {
      const mult = Math.min(AFFIX_ACCEL_MAX, 1 + AFFIX_ACCEL_RAMP * this.elapsed);
      applyBuff(boss, makeBuff('moveSpeed', mult, 1, 'affixAccel'));
    }

    // Molten: trail a short-lived burning patch (pools under a stationary boss).
    if (affixes.includes('molten')) {
      timers.molten = (timers.molten ?? 0) + dt;
      if (timers.molten >= AFFIX_MOLTEN_INTERVAL) {
        timers.molten = 0;
        this.hazardZone(
          boss.pos,
          AFFIX_MOLTEN_RADIUS,
          AFFIX_MOLTEN_TICK * scalar,
          AFFIX_MOLTEN_ZONE_DURATION,
          AFFIXES.molten.color,
        );
      }
    }

    // Warding: periodically wrap itself in a damage-absorbing ward.
    if (affixes.includes('warding')) {
      timers.warding = (timers.warding ?? 0) + dt;
      if (timers.warding >= AFFIX_WARD_INTERVAL) {
        timers.warding = 0;
        applyBuff(
          boss,
          makeBuff('damageTaken', AFFIX_WARD_DEF_MULT, AFFIX_WARD_DURATION, 'affixWard'),
        );
      }
    }

    if (stunned) return; // the "active" affixes below pause while stunned

    // Splitting: call a fresh add wave on top of the boss's own kit.
    if (affixes.includes('splitting')) {
      timers.splitting = (timers.splitting ?? 0) + dt;
      if (timers.splitting >= AFFIX_SPLIT_INTERVAL) {
        timers.splitting = 0;
        this.spawnAddWave(boss.pos, addCount(this.scaling.playerCount), {
          hpMult: 0.7,
          speedMult: 1.1,
          minR: boss.radius + 40,
          maxR: boss.radius + 130,
        });
      }
    }

    // Barbed: a thorn burst scaled by how much the band has recently soaked in.
    if (affixes.includes('barbed')) {
      timers.barbed = (timers.barbed ?? 0) + dt;
      if (timers.barbed >= AFFIX_BARBED_INTERVAL) {
        timers.barbed = 0;
        this.barbedPulse(boss, scalar);
      }
    }
  }

  /** A short-range retaliation nova; damage scales with recently-soaked damage. */
  private barbedPulse(boss: Boss, scalar: number): void {
    const base = Math.min(AFFIX_BARBED_MAX, (boss.recentDamageTaken ?? 0) * AFFIX_BARBED_FRAC);
    if (base <= 1) return;
    const dmg = base * scalar;
    let hitAny = false;
    for (const p of this.players) {
      if (p.state !== 'alive') continue;
      if (dist(p.pos, boss.pos) <= AFFIX_BARBED_RADIUS + p.radius) {
        damagePlayer(this, p, dmg);
        hitAny = true;
      }
    }
    if (hitAny) this.events.push({ t: 'telegraph', pos: { ...boss.pos }, shape: 'circle' });
  }

  /** Resolve a boss ability, then fire its on-hit affix reactions (vampiric/volatile). */
  private resolveBossAndReact(boss: Boss, ab: BossAbilityDef, action: BossAction): void {
    const dealt = resolveBossAbility(this, boss, ab, action);
    this.applyVampiric(boss, dealt);
    this.applyVolatile(boss, ab, action);
  }

  /** Vampiric affix: heal the boss a fraction of the damage its attack just dealt. */
  private applyVampiric(boss: Boss, dealtToPlayers: number): void {
    if (dealtToPlayers <= 0 || !hasAffix(boss, 'vampiric')) return;
    const before = boss.hp;
    boss.hp = Math.min(boss.maxHp, boss.hp + dealtToPlayers * AFFIX_VAMPIRIC_FRAC);
    const healed = boss.hp - before;
    if (healed > 0) {
      this.events.push({ t: 'heal', pos: { ...boss.pos }, amount: healed, targetId: boss.id });
    }
  }

  /** Volatile affix: drop a lingering pool where a telegraphed impact just landed. */
  private applyVolatile(boss: Boss, ab: BossAbilityDef, action: BossAction): void {
    if (!hasAffix(boss, 'volatile')) return;
    const center = this.volatileImpact(boss, ab, action);
    if (!center) return; // projectile / summon / void / buff / beam: nothing to salt
    this.hazardZone(
      center,
      AFFIX_VOLATILE_RADIUS,
      AFFIX_VOLATILE_TICK * this.bossDamageScalar() * (boss.dmgScale ?? 1),
      AFFIX_VOLATILE_ZONE_DURATION,
      AFFIXES.volatile.color,
    );
  }

  /** Impact point for a Volatile pool, or null for non-impact ability shapes. */
  private volatileImpact(boss: Boss, ab: BossAbilityDef, action: BossAction): Vec2 | null {
    switch (ab.shape) {
      case 'circleAtTarget':
      case 'line':
        return action.targetPos ? { ...action.targetPos } : { ...boss.pos };
      case 'pbaoe':
        return { ...boss.pos };
      case 'cone':
        return vadd(boss.pos, fromAngle(action.aimAngle, (ab.range ?? 300) * 0.5));
      default:
        return null;
    }
  }

  /** Spawn a boss-side damaging ground pool (volatile / molten / vent). */
  private hazardZone(
    pos: Vec2,
    radius: number,
    perTickDamage: number,
    duration: number,
    color?: number,
  ): void {
    spawnZone(this, {
      kind: 'voidZone',
      pos: { ...pos },
      radius,
      side: 'boss',
      ownerId: this.bosses[0]?.id ?? 0,
      damagePerTick: perTickDamage,
      healPerTick: 0,
      duration,
      color,
    });
  }

  /**
   * Spawn a wave of adds around `origin`. Shared by the Splitting affix and the
   * corruption Add-Swarm beat; the boss's own summons stay in abilities.ts.
   */
  spawnAddWave(
    origin: Vec2,
    count: number,
    opts: { hpMult?: number; speedMult?: number; minR?: number; maxR?: number } = {},
  ): void {
    const hp = ADD_HP * (opts.hpMult ?? 1);
    for (let i = 0; i < count; i++) {
      const angle = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(opts.minR ?? 80, opts.maxR ?? 180);
      const pos = wrapPos(vadd(origin, fromAngle(angle, r)));
      const minion: Add = {
        id: this.allocId(),
        pos,
        hp,
        maxHp: hp,
        moveSpeed: ADD_MOVE_SPEED * (opts.speedMult ?? 1),
        radius: ADD_RADIUS,
        targetId: null,
        attackCd: this.rng.range(0.2, 0.8),
        buffs: [],
      };
      this.adds.push(minion);
      this.events.push({ t: 'spawn', id: minion.id, kind: 'add', pos: { ...pos } });
    }
  }

  // -------------------------------------------------------------------------
  // Pending strikes — telegraphed delayed AoE not owned by a boss action. The
  // primitive behind corruption rain / vents / a collapsing arena.
  // -------------------------------------------------------------------------

  /** Queue a telegraphed delayed strike (used by world/corruption.ts). */
  addPendingStrike(opts: {
    pos: Vec2;
    radius: number;
    fuse: number;
    damage: number;
    color?: number;
    slowMult?: number;
    slowDuration?: number;
    leaveZone?: PendingStrike['leaveZone'];
    pull?: PendingStrike['pull'];
  }): void {
    this.pendingStrikes.push({
      id: this.allocId(),
      pos: { ...opts.pos },
      radius: opts.radius,
      fuse: opts.fuse,
      totalFuse: opts.fuse,
      damage: opts.damage,
      color: opts.color,
      slowMult: opts.slowMult,
      slowDuration: opts.slowDuration,
      leaveZone: opts.leaveZone,
      pull: opts.pull,
    });
  }

  private updatePendingStrikes(dt: number): void {
    if (this.pendingStrikes.length === 0) return;
    const keep: PendingStrike[] = [];
    for (const s of this.pendingStrikes) {
      s.fuse -= dt;
      if (s.fuse > 0) {
        keep.push(s);
        continue;
      }
      this.detonateStrike(s);
    }
    this.pendingStrikes = keep;
  }

  private detonateStrike(s: PendingStrike): void {
    for (const p of this.players) {
      if (p.state !== 'alive') continue;
      if (dist(p.pos, s.pos) <= s.radius + p.radius) {
        if (s.damage > 0) damagePlayer(this, p, s.damage);
        if (s.slowMult != null && s.slowMult < 1) {
          applyBuff(p, makeBuff('moveSpeed', s.slowMult, s.slowDuration ?? 2, 'strikeSlow'));
        }
        // Terrain surge: haul a caught hero toward the hazard's heart. A dodge /
        // i-frame slips the grip entirely (never a cheap-shot). Dragged into a
        // bottomless core → a plunge into the void (an environmental kill).
        if (s.pull && !hasBuff(p, 'invuln')) {
          pullToward(this, p, s.pos, s.pull.strength);
          if (s.pull.lethalRadius > 0 && dist(p.pos, s.pos) <= s.pull.lethalRadius) {
            damagePlayer(this, p, s.pull.lethalDamage);
            this.events.push({ t: 'telegraph', pos: { ...p.pos }, shape: 'circle' });
          }
        }
      }
    }
    // Flash the impact + optionally leave a lingering hazard (vent eruptions).
    this.events.push({ t: 'telegraph', pos: { ...s.pos }, shape: 'circle' });
    if (s.leaveZone) {
      spawnZone(this, {
        kind: s.leaveZone.kind,
        pos: { ...s.pos },
        radius: s.radius,
        side: 'boss',
        ownerId: 0,
        damagePerTick: s.leaveZone.tickDamage,
        healPerTick: 0,
        slowMult: s.leaveZone.slowMult,
        slowDuration: s.leaveZone.slowDuration,
        duration: s.leaveZone.duration,
        color: s.color,
      });
    }
  }

  /** Serialize pending strikes (circles) + any forming pack bond (a line) so
   * clients can dodge the surge and read the incoming boss-vs-boss empower. */
  private worldTelegraphs(): Telegraph[] {
    const out: Telegraph[] = this.pendingStrikes.map((s) => ({
      kind: 'circle',
      origin: { ...s.pos },
      angle: 0,
      range: 0,
      radius: s.radius,
      halfAngle: 0,
      width: 0,
      target: { ...s.pos },
      remainingWindup: Math.max(0, s.fuse),
      totalWindup: s.totalFuse,
    }));
    // A forming pack bond rides the wire as a line telegraph between the two
    // bosses, filling as its wind-up burns down (item 28).
    if (this.bond) {
      const caster = this.bosses.find((b) => b.id === this.bond!.casterId);
      const partner = this.bosses.find((b) => b.id === this.bond!.partnerId);
      if (caster && partner && caster.hp > 0 && partner.hp > 0) {
        out.push({
          kind: 'line',
          origin: { ...caster.pos },
          angle: angleOf(sub(partner.pos, caster.pos)),
          range: dist(caster.pos, partner.pos),
          radius: 0,
          halfAngle: 0,
          width: 26,
          target: { ...partner.pos },
          remainingWindup: Math.max(0, this.bond.fuse),
          totalWindup: this.bond.total,
        });
      }
    }
    return out;
  }

  private enterRecover(boss: Boss): void {
    const a = boss.action;
    a.kind = 'recover';
    a.abilityId = null;
    a.remaining = BOSS_RECOVER_TIME;
    a.total = BOSS_RECOVER_TIME;
  }

  private bossMove(dt: number, boss: Boss, def: MonsterDef, target: Player | null): void {
    if (!target) return;
    const d = dist(boss.pos, target.pos);
    // item 9: a rooted boss can't walk (it can still turn to face). Speed 0 freezes
    // its position while it stands in the root zone.
    const speed = isRooted(boss) ? 0 : boss.moveSpeed * buffMult(boss, 'moveSpeed');

    if (def.blink) {
      // kiter: keep within casting range but don't crowd the target
      if (d > 420) {
        const dir = normalize(sub(target.pos, boss.pos));
        boss.pos = vadd(boss.pos, vscale(dir, speed * dt));
        boss.facing = angleOf(dir);
      } else {
        boss.facing = angleOf(sub(target.pos, boss.pos));
      }
      return;
    }

    if (d > def.meleeRange * 0.85) {
      const dir = normalize(sub(target.pos, boss.pos));
      boss.pos = vadd(boss.pos, vscale(dir, speed * dt));
      boss.facing = angleOf(dir);
    } else {
      boss.facing = angleOf(sub(target.pos, boss.pos));
    }
  }

  private handleBlink(boss: Boss, def: MonsterDef): void {
    // item 9: a rooted boss can't blink OR teleport. Because both a native blink and
    // the Teleporting affix resolve through this one path (blinkConfigFor), gating
    // here disables the affix teleport too.
    if (isRooted(boss)) return;
    const cfg = this.blinkConfigFor(boss, def);
    if (!cfg) return;
    if (boss.blinkTimer > 0) return;
    // nearest alive player
    let nearest: Player | null = null;
    let best = Infinity;
    for (const p of this.players) {
      if (p.state !== 'alive') continue;
      const dd = distSq(p.pos, boss.pos);
      if (dd < best) {
        best = dd;
        nearest = p;
      }
    }
    if (!nearest) return;
    if (Math.sqrt(best) > cfg.threatenRange) return;
    let dir = normalize(sub(boss.pos, nearest.pos));
    if (dir.x === 0 && dir.y === 0) dir = fromAngle(this.rng.range(0, Math.PI * 2));
    const from = { ...boss.pos };
    const to = wrapPos({
      x: boss.pos.x + dir.x * cfg.range,
      y: boss.pos.y + dir.y * cfg.range,
    });
    boss.pos = to;
    boss.blinkTimer = cfg.internalCd;
    this.events.push({ t: 'blink', id: boss.id, from, to });
  }

  private bossDecide(boss: Boss, def: MonsterDef, target: Player | null): void {
    const hpFrac = boss.hp / boss.maxHp;
    const distToTarget = target ? dist(boss.pos, target.pos) : Infinity;
    const anyInMelee = this.players.some(
      (p) => p.state === 'alive' && dist(p.pos, boss.pos) <= def.meleeRange,
    );
    const usable = (id: string): boolean => {
      const ab = abilityById(def, id);
      if (!ab) return false;
      if (boss.cooldowns[id] > 0) return false;
      if (ab.minHpFrac != null && hpFrac > ab.minHpFrac) return false;
      return true;
    };
    const choice = def.decide({
      boss,
      hpFrac,
      target,
      distToTarget,
      anyInMelee,
      usable,
      rng: this.rng,
    });
    if (!choice) return;
    const ab = abilityById(def, choice);
    if (!ab) return;
    // Fairness governor: defer a big telegraphed attack rather than compose it
    // into an undodgeable wall with another live telegraph (a twin's cast or a
    // corruption strike). The boss simply re-decides next cycle. Inert for a lone
    // boss with nothing pending, so single-boss fights are byte-for-byte unchanged.
    if (this.wouldWallUnfairly(boss, ab, target)) return;
    this.startBossAbility(boss, def, ab, target);
  }

  /** True if starting `ab` now would stack an unfair telegraph wall (see grammar.ts). */
  private wouldWallUnfairly(boss: Boss, ab: BossAbilityDef, target: Player | null): boolean {
    // Fast path: nothing else can overlap, so a lone boss is never affected.
    if (this.bosses.length < 2 && this.pendingStrikes.length === 0) return false;
    if (!WALLING_SHAPES.has(ab.shape)) return false;
    if (boss.phase === 'enraged') return false; // enrage may deliberately wall
    const center = ab.shape === 'pbaoe' ? boss.pos : (target?.pos ?? boss.pos);
    return overlapsActiveTelegraph(
      center,
      boss,
      this.bosses,
      this.pendingStrikes,
      FAIR_TELEGRAPH_GAP,
    );
  }

  private startBossAbility(
    boss: Boss,
    def: MonsterDef,
    rawAb: BossAbilityDef,
    target: Player | null,
  ): void {
    // Overcharged swells reach/size; a plain boss gets the same object back.
    const ab = this.affixAbility(boss, rawAb);
    const alive = this.players.filter((p) => p.state === 'alive');
    let tgt = target;
    if (ab.targetRandom && alive.length > 0) tgt = this.rng.pick(alive);

    const action = boss.action;
    action.kind = 'windup';
    action.abilityId = ab.id;
    action.remaining = ab.windup;
    action.total = ab.windup;
    action.channelAccum = 0;
    action.targetId = null;
    action.targetPos = null;
    action.aimAngle = boss.facing;

    if (tgt) {
      action.targetId = tgt.id;
      action.targetPos = { ...tgt.pos };
      action.aimAngle = angleOf(sub(tgt.pos, boss.pos));
      boss.facing = action.aimAngle;
    }

    if (ab.shape === 'line' && tgt) {
      const d = dist(boss.pos, tgt.pos);
      const capped = Math.min(d, ab.range ?? 600);
      action.targetPos = vadd(boss.pos, fromAngle(action.aimAngle, capped));
    }

    if (ab.windup <= 0) {
      // instant: resolve now (+ vampiric / volatile reactions)
      this.resolveBossAndReact(boss, ab, action);
      boss.cooldowns[ab.id] = this.bossCooldown(boss, def, ab.cooldown);
      if (boss.action.kind === 'windup') this.enterRecover(boss);
    }
  }

  private bossExecute(boss: Boss, def: MonsterDef): void {
    const id = boss.action.abilityId;
    if (!id) {
      this.enterRecover(boss);
      return;
    }
    const raw = abilityById(def, id);
    if (!raw) {
      this.enterRecover(boss);
      return;
    }
    // Overcharged swells the resolved hit to match the (already-swelled) telegraph.
    const ab = this.affixAbility(boss, raw);
    this.resolveBossAndReact(boss, ab, boss.action);
    boss.cooldowns[ab.id] = this.bossCooldown(boss, def, ab.cooldown);
    // beam ability switches action to 'channel'; otherwise recover
    if (boss.action.kind === 'windup') this.enterRecover(boss);
  }

  // -------------------------------------------------------------------------
  // Adds
  // -------------------------------------------------------------------------

  private updateAdds(dt: number): void {
    const keep: Add[] = [];
    for (const a of this.adds) {
      if (a.hp <= 0) {
        this.events.push({ t: 'death', id: a.id, kind: 'add', pos: { ...a.pos } });
        continue;
      }
      tickBuffs(a, dt);
      tickStunDr(a, dt);
      a.attackCd = Math.max(0, a.attackCd - dt);

      // Frozen / stunned adds hold still and can't attack (Frost Nova's Deep
      // Freeze, Shield Bash, Holy Wrath… now bite minions too, not just the boss).
      if (hasBuff(a, 'stun')) {
        keep.push(a);
        continue;
      }

      // nearest alive player
      let target: Player | null = null;
      let best = Infinity;
      for (const p of this.players) {
        if (p.state !== 'alive') continue;
        const dd = distSq(p.pos, a.pos);
        if (dd < best) {
          best = dd;
          target = p;
        }
      }
      if (target) {
        a.targetId = target.id;
        const d = Math.sqrt(best);
        const reach = a.radius + target.radius + 6;
        if (d > reach) {
          const dir = normalize(sub(target.pos, a.pos));
          const speed = a.moveSpeed * buffMult(a, 'moveSpeed');
          a.pos = vadd(a.pos, vscale(dir, speed * dt));
        } else if (a.attackCd <= 0) {
          damagePlayer(this, target, ADD_DAMAGE);
          a.attackCd = ADD_ATTACK_CD;
        }
      }
      keep.push(a);
    }
    this.adds = keep;
  }

  // -------------------------------------------------------------------------
  // Physics: soft separation + arena clamp
  // -------------------------------------------------------------------------

  private separateAndClamp(): void {
    const movers: Array<Player | Add> = [
      ...this.players.filter((p) => p.state !== 'dead'),
      ...this.adds,
    ];
    const bosses = this.aliveBosses();
    for (let iter = 0; iter < SEPARATION_ITERATIONS; iter++) {
      for (let i = 0; i < movers.length; i++) {
        for (let j = i + 1; j < movers.length; j++) {
          this.separatePair(movers[i], movers[j]);
        }
      }
      for (const b of bosses) {
        for (const m of movers) this.pushOutOfBoss(m, b);
      }
      // Twin bosses shove each other apart too, so a duo can't merge into one
      // unreadable blob of hitboxes.
      for (let i = 0; i < bosses.length; i++) {
        for (let j = i + 1; j < bosses.length; j++) {
          this.separatePair(bosses[i], bosses[j]);
        }
      }
      // Terrain obstacles are solid walls: eject every mover (and the bosses) so
      // nobody — hero, minion or boss — can walk through cover.
      if (this.obstacles.length > 0 || this.totems.length > 0) {
        for (const m of movers) this.pushOutOfObstacles(m);
        for (const b of bosses) this.pushOutOfObstacles(b);
      }
    }
    // Wrap around the torus instead of clamping to walls: an entity that walks
    // off one edge reappears on the opposite edge (infinite scrolling arena).
    for (const p of this.players) p.pos = wrapPos(p.pos);
    for (const a of this.adds) a.pos = wrapPos(a.pos);
    for (const b of this.bosses) b.pos = wrapPos(b.pos);
  }

  private separatePair(a: { pos: Vec2; radius: number }, b: { pos: Vec2; radius: number }): void {
    const min = a.radius + b.radius;
    // Shortest torus delta so pairs near opposite edges are handled correctly.
    const delta = sub(b.pos, a.pos);
    const dx = delta.x;
    const dy = delta.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d === 0) {
      b.pos.x += 0.5; // nudge apart deterministically
      return;
    }
    if (d >= min) return;
    const overlap = (min - d) / 2;
    const nx = dx / d;
    const ny = dy / d;
    a.pos.x -= nx * overlap;
    a.pos.y -= ny * overlap;
    b.pos.x += nx * overlap;
    b.pos.y += ny * overlap;
  }

  private pushOutOfBoss(m: Player | Add, boss: Boss): void {
    const min = m.radius + boss.radius;
    const delta = sub(m.pos, boss.pos);
    const dx = delta.x;
    const dy = delta.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d >= min) return;
    const nx = d > 0 ? dx / d : 1;
    const ny = d > 0 ? dy / d : 0;
    const overlap = min - d;
    m.pos.x += nx * overlap;
    m.pos.y += ny * overlap;
  }

  /** Eject a mover (or a boss) out of any solid cover obstacle / totem it overlaps. */
  private pushOutOfObstacles(m: { pos: Vec2; radius: number }): void {
    for (const o of this.obstacles) this.ejectFromCircle(m, o.pos, o.radius);
    for (const t of this.totems) this.ejectFromCircle(m, t.pos, t.radius);
  }

  private ejectFromCircle(m: { pos: Vec2; radius: number }, center: Vec2, radius: number): void {
    const min = m.radius + radius;
    const delta = sub(m.pos, center);
    const d = Math.sqrt(delta.x * delta.x + delta.y * delta.y);
    if (d >= min) return;
    const nx = d > 0 ? delta.x / d : 1;
    const ny = d > 0 ? delta.y / d : 0;
    const overlap = min - d;
    m.pos.x += nx * overlap;
    m.pos.y += ny * overlap;
  }

  // -------------------------------------------------------------------------
  // Transitions / end conditions
  // -------------------------------------------------------------------------

  private checkDownedTransitions(): void {
    for (const p of this.players) {
      if (p.state === 'alive' && p.hp <= 0) {
        // Phoenix charm (item 21): spend a self-revive to spring straight back up
        // with a short invulnerability window instead of falling. Fires once per
        // charge, before the normal downed transition.
        if ((p.selfRevives ?? 0) > 0) {
          p.selfRevives = (p.selfRevives ?? 0) - 1;
          p.hp = Math.max(1, Math.round(p.maxHp * EPHEMERAL_SELFREVIVE_HP));
          applyBuff(p, makeBuff('invuln', 0, EPHEMERAL_SELFREVIVE_GRACE, 'phoenixCharm'));
          this.events.push({ t: 'revive', id: p.id, pos: { ...p.pos } });
          continue;
        }
        p.state = 'downed';
        p.hp = 0;
        p.downedTimer = DOWNED_BLEEDOUT;
        p.reviveProgress = 0;
        p.reviverId = null;
        p.castTimer = 0;
        p.castSlot = null;
        p.stats.deaths += 1;
        this.events.push({ t: 'downed', id: p.id, pos: { ...p.pos } });
      }
    }
  }

  /**
   * Force the fight to end immediately with the given outcome (host concede /
   * "End Run" from the pause menu). Idempotent; freezes further stepping via the
   * `finished` flag so a stale result can't be produced twice.
   */
  forceFinish(outcome: Outcome): void {
    if (this.finished) return;
    this.finished = true;
    this.outcome = outcome;
    this.endMs = this.elapsed * 1000;
  }

  private checkEndConditions(): void {
    if (this.finished) return;

    // The reward chamber has no bosses and no failure state — it simply lets the
    // party mill about picking up boons, so there is nothing to resolve.
    if (this.scene !== null) return;

    if (this.practice) {
      // Playground: a felled dummy explodes and pops back up; nobody ever
      // "wins" or "loses" the menu.
      for (const b of this.bosses) {
        if (b.hp <= 0) {
          this.events.push({ t: 'death', id: b.id, kind: 'boss', pos: { ...b.pos } });
          b.hp = b.maxHp;
          b.phase = 'normal';
          this.events.push({ t: 'dummyReset', id: b.id, pos: { ...b.pos } });
        }
      }
      return;
    }

    // Announce each boss death as it happens (twin fights continue after the
    // first falls); victory only once EVERY boss is down.
    let anyBossAlive = false;
    for (const b of this.bosses) {
      if (b.hp <= 0) {
        b.hp = 0;
        if (!b.deathAnnounced) {
          b.deathAnnounced = true;
          // Clear any in-flight wind-up/channel so the corpse doesn't keep a
          // frozen telegraph painted on the arena forever.
          b.action.kind = 'idle';
          b.action.abilityId = null;
          b.action.remaining = 0;
          this.events.push({ t: 'death', id: b.id, kind: 'boss', pos: { ...b.pos } });
        }
      } else {
        anyBossAlive = true;
      }
    }
    if (this.bosses.length > 0 && !anyBossAlive) {
      this.finished = true;
      this.outcome = 'victory';
      this.endMs = this.elapsed * 1000;
      const center = this.bosses[0] ? { ...this.bosses[0].pos } : { x: 0, y: 0 };
      this.events.push({ t: 'victory', pos: center });
      return;
    }
    // Hardcore kill-DEADLINE (items 11/21/24/27): past the deadline the band is no
    // longer instantly wiped — the closing chasm in `stepDeadline` devours them over
    // a few seconds, downing/killing everyone (which the wipe check below then ends
    // as a defeat). anyBossAlive is referenced there; kept local for readability.
    void anyBossAlive;
    const anyAlive = this.players.some((p) => p.state === 'alive');
    if (!anyAlive && this.players.length > 0) {
      this.finished = true;
      this.outcome = 'defeat';
      this.endMs = this.elapsed * 1000;
      // If the closing chasm caused this wipe, fire the classic time's-up cue at
      // its centre (items 21/24/27) — the render layer flashes the "TIME'S UP" burst.
      if (this.deadlineChasm) {
        this.events.push({ t: 'deadline', pos: { ...this.deadlineChasm.center } });
      }
    }
  }

  result(): FightResult {
    const victory = (this.outcome ?? 'defeat') === 'victory';
    // Ephemeral coins (item 21): rank heroes by this fight's participation score;
    // the best performer banks the most, the tail banks none. A lost boss (defeat)
    // pays nothing — the run's over anyway.
    const coinByPeer = new Map<string, number>();
    [...this.players]
      .sort((a, b) => this.playerScore(b) - this.playerScore(a))
      .forEach((p, i) => coinByPeer.set(p.peerId, victory ? coinsForRank(i) : 0));
    return {
      outcome: this.outcome ?? 'defeat',
      timeMs: Math.round(this.endMs),
      monsterId: this.monsterDef.id,
      monsterIds: this.bosses.map((b) => b.monsterId),
      stats: this.players.map((p) => ({
        peerId: p.peerId,
        name: p.name,
        classId: p.classId,
        damageDealt: Math.round(p.stats.damageDealt),
        healingDone: Math.round(p.stats.healingDone),
        revives: p.stats.revives,
        deaths: p.stats.deaths,
        score: Math.round(this.playerScore(p)),
        coins: coinByPeer.get(p.peerId) ?? 0,
      })),
    };
  }

  // -------------------------------------------------------------------------
  // Serialization
  // -------------------------------------------------------------------------

  private buildTelegraph(boss: Boss): Telegraph | null {
    if (boss.hp <= 0) return null; // corpses telegraph nothing
    const a = boss.action;
    const def = this.defOf(boss);
    if (a.kind !== 'windup' && a.kind !== 'channel') return null;
    if (!a.abilityId) return null;
    const raw = abilityById(def, a.abilityId);
    if (!raw) return null;
    // Show the Overcharged-swollen shape, so what the band dodges is what lands.
    const ab = this.affixAbility(boss, raw);

    const base: Telegraph = {
      kind: 'circle',
      origin: { ...boss.pos },
      angle: a.aimAngle,
      range: ab.range ?? 0,
      radius: ab.radius ?? 0,
      halfAngle: ((ab.halfAngleDeg ?? 30) * Math.PI) / 180,
      width: ab.width ?? 0,
      target: a.targetPos ? { ...a.targetPos } : { ...boss.pos },
      remainingWindup: Math.max(0, a.remaining),
      totalWindup: a.total,
    };

    switch (ab.shape) {
      case 'cone':
        return { ...base, kind: 'cone', range: ab.range ?? 300 };
      case 'circleAtTarget':
        return { ...base, kind: 'circle', radius: ab.radius ?? 110 };
      case 'pbaoe':
        return { ...base, kind: 'circle', radius: ab.radius ?? 160, target: { ...boss.pos } };
      case 'line':
        return { ...base, kind: 'line', width: ab.width ?? 45 };
      case 'beam':
        return { ...base, kind: 'line', width: ab.width ?? 24, range: ab.range ?? 500 };
      case 'summon':
        // No damage zone, but flash a growing ring around the boss so the party
        // can read the incoming adds during the wind-up (Lich readability fix).
        return { ...base, kind: 'circle', radius: ab.radius ?? 170, target: { ...boss.pos } };
      default:
        return null; // projectile / voidzones: no ground telegraph
    }
  }

  private playerView(p: Player): PlayerView {
    // Purely-visual knockback/pull slide (item 28): the RENDERED position eases in
    // from the pre-shove offset while `slideRemaining` burns down, so the hero
    // travels rather than teleporting. `p.pos` (logic) is untouched.
    const ease = p.slideRemaining && p.slideTotal ? p.slideRemaining / p.slideTotal : 0;
    const rpos =
      p.slideOff && ease > 0
        ? wrapPos({ x: p.pos.x + p.slideOff.x * ease, y: p.pos.y + p.slideOff.y * ease })
        : p.pos;
    return {
      id: p.id,
      peerId: p.peerId,
      name: p.name,
      classId: p.classId,
      pos: { ...rpos },
      aim: { ...p.aim },
      hp: Math.max(0, Math.round(p.hp)),
      maxHp: p.maxHp,
      moveSpeed: p.moveSpeed,
      state: p.state,
      cooldowns: { ...p.cooldowns },
      buffs: p.buffs.map((b) => ({ kind: b.kind, remaining: b.remaining, mult: b.mult })),
      downedTimer: p.downedTimer,
      reviveProgress: p.reviveProgress,
      castSlot: p.castSlot,
      castTimer: p.castTimer,
      score: Math.round(this.playerScore(p)),
      // Only the ACTIVE class's subclass skills cross the wire (item 15): the HUD
      // binds them to sub1/sub2 by index, so a multiclass hero shows the right two.
      subSkills: activeSubSkillIds(p),
      classes: p.classes,
      swapCd: p.swapCd,
      potions: p.potions,
    };
  }

  /** Cumulative participation score: prior bosses (baseScore) + this fight. */
  playerScore(p: Player): number {
    const s = p.stats;
    const fight =
      s.damageDealt +
      s.healingDone * SCORE_HEAL_FACTOR +
      s.revives * SCORE_PER_REVIVE -
      s.deaths * SCORE_PER_DEATH;
    return Math.max(0, (p.baseScore ?? 0) + fight);
  }

  private bossView(b: Boss): BossView {
    return {
      id: b.id,
      monsterId: b.monsterId,
      pos: { ...b.pos },
      facing: b.facing,
      hp: Math.max(0, Math.round(b.hp)),
      maxHp: b.maxHp,
      phase: b.phase,
      telegraph: this.buildTelegraph(b),
      buffs: b.buffs.map((bf) => ({ kind: bf.kind, remaining: bf.remaining, mult: bf.mult })),
      action: b.action.kind,
      abilityId: b.action.abilityId,
      modName: this.modifier?.prefix,
      modColor: this.modifier?.color,
      affixes: b.affixes,
    };
  }

  serialize(): Snapshot {
    return {
      tick: this.tick,
      seed: this.seed,
      players: this.players.map((p) => this.playerView(p)),
      bosses: this.bosses.map((b) => this.bossView(b)),
      adds: this.adds.map((a) => ({
        id: a.id,
        pos: { ...a.pos },
        hp: Math.max(0, Math.round(a.hp)),
        maxHp: a.maxHp,
        buffs: a.buffs.map((b) => ({ kind: b.kind, remaining: b.remaining, mult: b.mult })),
      })),
      projectiles: this.projectiles.map((p) => ({
        id: p.id,
        kind: p.kind,
        side: p.side,
        pos: { ...p.pos },
        vel: { ...p.vel },
      })),
      groundZones: this.groundZones.map((z) => ({
        id: z.id,
        kind: z.kind,
        pos: { ...z.pos },
        radius: z.radius,
        duration: z.duration,
        remaining: z.remaining,
        color: z.color,
      })),
      terrain: this.terrain.map((t) => ({
        id: t.id,
        kind: t.kind,
        pos: { ...t.pos },
        radius: t.radius,
        variant: t.variant,
        lethalRadius: t.lethalRadius,
      })),
      obstacles: this.obstacles.map((o) => ({
        id: o.id,
        pos: { ...o.pos },
        radius: o.radius,
        kind: o.kind,
        variant: o.variant,
      })),
      telegraphs: this.pendingStrikes.length > 0 || this.bond ? this.worldTelegraphs() : undefined,
      events: this.events.slice(),
    };
  }

  toRenderState(localPlayerId: EntityId | null): RenderState {
    const snap = this.serialize();
    return {
      ...snap,
      localPlayerId,
      arena: { w: this.arena.w, h: this.arena.h },
      totems: this.totems.length > 0 ? this.totemViews(localPlayerId) : undefined,
    };
  }

  /** Playground totem views, with `active` set for the local hero's proximity. */
  totemViews(localPlayerId: EntityId | null): TotemView[] {
    const me = this.players.find((p) => p.id === localPlayerId) ?? null;
    return this.totems.map((t) => ({
      id: t.id,
      kind: t.kind,
      pos: { ...t.pos },
      radius: t.radius,
      triggerRadius: t.triggerRadius,
      active: me != null && dist(me.pos, t.pos) <= t.triggerRadius,
    }));
  }
}

export { SIM_DT, PLAYER_RADIUS, vec };
