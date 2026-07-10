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
  EntityId,
  ClassId,
  MonsterId,
  Outcome,
  FightResult,
  AbilitySlot,
  Vec2,
} from './types';
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
  TWIN_DMG_FRAC,
} from './constants';
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
} from './math';
// Toroidal (wrap-around) geometry — drop-in replacements for the Euclidean
// sub/dist/distSq/pointInSegment so combat measures the shortest path on the
// torus. `wrapPos` canonicalises positions after they move (see §infinite-map).
import { sub, dist, distSq, pointInSegment, wrapPos } from './torus';
import { getClass, cloneAbilities } from './classes';
import { applyUpgrades } from './upgrades';
import type { UpgradeId } from './upgrades';
import { applyCharUpgrades } from './charUpgrades';
import { getMonster, abilityById } from './monsters';
import type { MonsterDef, BossModifier } from './monsters';
import { computeScaling } from './scaling';
import type { ScalingResult } from './scaling';
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
} from './combat';
import { decayThreat, nthThreatTarget } from './threat';
import { resolvePlayerAbility, resolveBossAbility, beamTick } from './abilities';

const SLOTS: AbilitySlot[] = ['basic', 'a1', 'a2', 'a3'];

/** Blast-flash color for projectiles that detonate in an area on impact. */
const PROJECTILE_IMPACT_COLOR: Partial<Record<import('./types').ProjectileKind, number>> = {
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
  /** Score carried in from prior bosses this run (endless accumulates it). */
  baseScore?: number;
}

export interface WorldInit {
  monsterId: MonsterId;
  seed: number;
  players: WorldPlayerInit[];
  /** Endless cycle (0 = first run) — scales boss HP/damage (scaling.ts). */
  cycle?: number;
  /** Endless "type" modifier layered on the boss (Frost, Dark, …). */
  modifier?: BossModifier | null;
  /**
   * Extra bosses sharing the arena (twin encounters). Every boss — lead
   * included — then spawns with TWIN_HP_FRAC of its HP and TWIN_DMG_FRAC of its
   * damage so the duo stays survivable.
   */
  coBosses?: MonsterId[];
  /**
   * Practice mode (the walkable menu playground): the dummy respawns instead of
   * granting victory, the party can never wipe to defeat, and interaction
   * totems are placed around the arena.
   */
  practice?: boolean;
}

/** Interval (s) at which an endless "type" modifier's aura fires. */
const MOD_AURA_INTERVAL = 3.5;

export class World {
  players: Player[] = [];
  /** Every boss in the arena. Solo fights have one; twin encounters have two. */
  bosses: Boss[] = [];
  adds: Add[] = [];
  projectiles: Projectile[] = [];
  groundZones: GroundZone[] = [];
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
  /** Def of the encounter's LEAD boss (terrain theme, legacy single-boss paths). */
  monsterDef: MonsterDef;
  modifier: BossModifier | null;
  /** Practice playground: dummy respawns, party can't wipe. */
  practice: boolean;

  tauntTargetId: EntityId | null = null;
  tauntTimer = 0;

  finished = false;
  outcome: Outcome | null = null;
  endMs = 0;

  private nextId = 1;

  constructor(init: WorldInit) {
    this.rng = new Rng(init.seed);
    this.seed = init.seed;
    this.scaling = computeScaling(init.players.length, init.cycle ?? 0);
    this.monsterDef = getMonster(init.monsterId);
    this.modifier = init.modifier ?? null;
    this.practice = init.practice ?? false;
    this.spawnPlayers(init.players);
    const ids: MonsterId[] = [init.monsterId, ...(init.coBosses ?? [])];
    this.spawnBosses(ids);
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
      player.hp = player.maxHp;
      this.players.push(player);
    });
  }

  private spawnBosses(ids: MonsterId[]): void {
    const twin = ids.length > 1;
    ids.forEach((id, i) => {
      const def = getMonster(id);
      const frac = twin ? TWIN_HP_FRAC : 1;
      const maxHp = Math.round(def.baseHp * this.scaling.hpMultiplier * frac);
      const cooldowns: Record<string, number> = {};
      for (const ab of def.abilities) cooldowns[ab.id] = 0;
      // Spread a duo along the top of the arena so they don't spawn stacked.
      const x = (this.arena.w * (i + 1)) / (ids.length + 1);
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
        // Stagger twin decisions so their openers don't land the same tick.
        decisionTimer: BOSS_DECISION_MIN * (1 + i * 0.5),
        regen: def.regen,
        blinkTimer: def.blink ? def.blink.internalCd : 0,
        buffs: [],
        dmgScale: twin ? TWIN_DMG_FRAC : 1,
        modAura: this.modifier?.aura,
        modColor: this.modifier?.color,
        modAuraTimer: 0,
      });
    });
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
    this.updateTerrain(dt);
    this.checkDownedTransitions();
    this.updateBosses(dt);
    this.updateAdds(dt);
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

      const stunned = hasBuff(p, 'stun');
      const casting = p.castTimer > 0;

      if (!stunned && !casting) {
        const move = clampLength(cmd.move, 1);
        const speed = p.moveSpeed * buffMult(p, 'moveSpeed');
        p.pos = vadd(p.pos, vscale(move, speed * dt));

        const moveDir = normalize(move);
        for (const slot of SLOTS) {
          // Edge-triggered by default; with auto-fire, a held button repeats
          // (tryUseAbility still gates on cooldown, so it fires at cadence).
          const held = cmd.buttons[slot];
          const fired = cmd.autofire ? held : held && !p.prevButtons[slot];
          if (fired) this.tryUseAbility(p, slot, moveDir);
        }
      }

      p.prevButtons = { ...cmd.buttons };
    }
  }

  private tryUseAbility(p: Player, slot: AbilitySlot, moveDir: Vec2): void {
    const ab = (p.abilities ?? getClass(p.classId).abilities)[slot];
    if (p.cooldowns[slot] > 0) return;
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

  private updateRevive(dt: number, inputs: Map<string, InputCommand>): void {
    for (const d of this.players) {
      if (d.state !== 'downed') continue;
      let reviver: Player | null = null;
      for (const p of this.players) {
        if (p.state !== 'alive') continue;
        const cmd = inputs.get(p.peerId);
        if (!cmd || !cmd.buttons.revive) continue;
        if (dist(p.pos, d.pos) <= REVIVE_RANGE + p.radius + d.radius) {
          reviver = p;
          break;
        }
      }
      if (reviver) {
        d.reviveProgress += dt;
        d.reviverId = reviver.id;
        if (d.reviveProgress >= REVIVE_TIME) {
          d.state = 'alive';
          d.hp = d.maxHp * REVIVE_HP_FRAC;
          d.reviveProgress = 0;
          d.reviverId = null;
          d.downedTimer = 0;
          reviver.stats.revives += 1;
          this.events.push({ t: 'revive', id: d.id, pos: { ...d.pos } });
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
      for (const p of this.players) {
        if (p.state !== 'alive') continue;
        if (dist(z.pos, p.pos) <= z.radius + p.radius) {
          if (z.damagePerTick > 0) damagePlayer(this, p, z.damagePerTick);
          // Snare zones (Web Snare, Grasping Roots, Thorn Field…) also mire the party.
          if (slows) applyBuff(p, makeBuff('moveSpeed', z.slowMult, z.slowDuration, 'zoneSlow'));
        }
      }
      return;
    }
    // player-side zone
    const owner = this.players.find((p) => p.id === z.ownerId) ?? null;
    const slows = z.slowMult < 1;
    if (z.damagePerTick > 0 || slows) {
      for (const b of this.aliveBosses()) {
        if (dist(z.pos, b.pos) > z.radius + b.radius) continue;
        if (z.damagePerTick > 0) this.applyProjDamageBoss(owner, z.damagePerTick, b);
        if (slows) applyBuff(b, makeBuff('moveSpeed', z.slowMult, z.slowDuration, 'zoneSlow'));
      }
      for (const a of this.adds) {
        if (a.hp <= 0) continue;
        if (dist(z.pos, a.pos) <= z.radius + a.radius) {
          if (z.damagePerTick > 0) {
            if (owner) damageAdd(this, owner, a, z.damagePerTick);
            else a.hp -= z.damagePerTick;
          }
          if (slows) applyBuff(a, makeBuff('moveSpeed', z.slowMult, z.slowDuration, 'zoneSlow'));
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

  private updateBoss(dt: number, boss: Boss, index: number): void {
    if (boss.hp <= 0) return;
    const def = this.defOf(boss);

    tickBuffs(boss, dt);
    tickStunDr(boss, dt);
    for (const id of Object.keys(boss.cooldowns)) {
      boss.cooldowns[id] = Math.max(0, boss.cooldowns[id] - dt);
    }
    boss.blinkTimer = Math.max(0, boss.blinkTimer - dt);

    // regen (troll)
    if (boss.regen > 0) {
      const regenMult =
        this.scaling.trollRegenMult * (boss.phase === 'enraged' ? def.enrageRegenMult : 1);
      boss.hp = Math.min(boss.maxHp, boss.hp + boss.regen * regenMult * dt);
    }

    // enrage transition
    if (boss.phase === 'normal' && boss.hp / boss.maxHp <= def.enrageThreshold) {
      boss.phase = 'enraged';
      this.events.push({ t: 'enrage', id: boss.id, pos: { ...boss.pos } });
    }

    if (hasBuff(boss, 'stun')) return; // stunned: no movement or actions

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
          beamTick(this, boss, ab, boss.action);
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
    return base * (boss.phase === 'enraged' ? def.enrageCooldownMult : 1);
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
    const speed = boss.moveSpeed * buffMult(boss, 'moveSpeed');

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
    if (!def.blink) return;
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
    if (Math.sqrt(best) > def.blink.threatenRange) return;
    let dir = normalize(sub(boss.pos, nearest.pos));
    if (dir.x === 0 && dir.y === 0) dir = fromAngle(this.rng.range(0, Math.PI * 2));
    const from = { ...boss.pos };
    const to = wrapPos({
      x: boss.pos.x + dir.x * def.blink.range,
      y: boss.pos.y + dir.y * def.blink.range,
    });
    boss.pos = to;
    boss.blinkTimer = def.blink.internalCd;
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
    this.startBossAbility(boss, def, ab, target);
  }

  private startBossAbility(
    boss: Boss,
    def: MonsterDef,
    ab: import('./monsters').BossAbilityDef,
    target: Player | null,
  ): void {
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
      // instant: resolve now
      resolveBossAbility(this, boss, ab, action);
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
    const ab = abilityById(def, id);
    if (!ab) {
      this.enterRecover(boss);
      return;
    }
    resolveBossAbility(this, boss, ab, boss.action);
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
    const anyAlive = this.players.some((p) => p.state === 'alive');
    if (!anyAlive && this.players.length > 0) {
      this.finished = true;
      this.outcome = 'defeat';
      this.endMs = this.elapsed * 1000;
    }
  }

  result(): FightResult {
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
    const ab = abilityById(def, a.abilityId);
    if (!ab) return null;

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
    return {
      id: p.id,
      peerId: p.peerId,
      name: p.name,
      classId: p.classId,
      pos: { ...p.pos },
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
      })),
      terrain: this.terrain.map((t) => ({
        id: t.id,
        kind: t.kind,
        pos: { ...t.pos },
        radius: t.radius,
        variant: t.variant,
      })),
      obstacles: this.obstacles.map((o) => ({
        id: o.id,
        pos: { ...o.pos },
        radius: o.radius,
        kind: o.kind,
        variant: o.variant,
      })),
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
