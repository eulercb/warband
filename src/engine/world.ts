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
  TerrainView,
  Obstacle,
  ObstacleView,
  InputCommand,
  GameEvent,
  Snapshot,
  RenderState,
  PlayerView,
  BossView,
  AddView,
  ProjectileView,
  ZoneView,
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
import { getClass } from './classes';
import { applyUpgrades } from './upgrades';
import type { UpgradeId } from './upgrades';
import { getMonster, abilityById } from './monsters';
import type { MonsterDef } from './monsters';
import { computeScaling } from './scaling';
import type { ScalingResult } from './scaling';
import {
  tickBuffs,
  buffMult,
  hasBuff,
  applyBuff,
  makeBuff,
  damageBoss,
  damageAdd,
  damagePlayer,
} from './combat';
import { decayThreat, highestThreatTarget } from './threat';
import {
  resolvePlayerAbility,
  resolveBossAbility,
  beamTick,
} from './abilities';

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
  /** Persistent upgrades this hero has earned this run (applied at spawn). */
  upgrades?: UpgradeId[];
}

export interface WorldInit {
  monsterId: MonsterId;
  seed: number;
  players: WorldPlayerInit[];
}

export class World {
  players: Player[] = [];
  boss: Boss | null = null;
  adds: Add[] = [];
  projectiles: Projectile[] = [];
  groundZones: GroundZone[] = [];
  terrain: TerrainPatch[] = [];
  obstacles: Obstacle[] = [];
  events: GameEvent[] = [];

  rng: Rng;
  arena = { w: ARENA_W, h: ARENA_H };
  tick = 0;
  elapsed = 0; // seconds

  scaling: ScalingResult;
  monsterDef: MonsterDef;

  tauntTargetId: EntityId | null = null;
  tauntTimer = 0;

  finished = false;
  outcome: Outcome | null = null;
  endMs = 0;

  private nextId = 1;

  constructor(init: WorldInit) {
    this.rng = new Rng(init.seed);
    this.scaling = computeScaling(init.players.length);
    this.monsterDef = getMonster(init.monsterId);
    this.spawnPlayers(init.players);
    this.spawnBoss();
    this.terrain = generateTerrain(init.monsterId, init.seed, () => this.allocId());
    // Cover obstacles avoid the terrain patches so cover stays readable.
    this.obstacles = generateObstacles(
      init.seed,
      () => this.allocId(),
      this.terrain.map((t) => ({ pos: t.pos, radius: t.radius })),
    );
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
        prevButtons: { basic: false, a1: false, a2: false, a3: false, revive: false },
        lastSeq: -1,
      };
      // Apply this hero's accumulated run upgrades (may raise maxHp, so do it
      // before the player is considered "at full health").
      applyUpgrades(player, pi.upgrades);
      this.players.push(player);
    });
  }

  private spawnBoss(): void {
    const def = this.monsterDef;
    const maxHp = Math.round(def.baseHp * this.scaling.hpMultiplier);
    const cooldowns: Record<string, number> = {};
    for (const ab of def.abilities) cooldowns[ab.id] = 0;
    this.boss = {
      id: this.allocId(),
      monsterId: def.id,
      pos: { x: this.arena.w / 2, y: 300 },
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
      decisionTimer: BOSS_DECISION_MIN,
      regen: def.regen,
      blinkTimer: def.blink ? def.blink.internalCd : 0,
      buffs: [],
    };
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
    this.updateBoss(dt);
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
    const ab = getClass(p.classId).abilities[slot];
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
      proj.pos = vadd(proj.pos, vscale(proj.vel, dt));
      proj.lifetime -= dt;

      // Cover obstacles absorb any ranged attack whose path crosses them
      // (segment test avoids fast projectiles tunneling through) — no damage.
      const consumed = this.projectileHitsObstacle(prev, proj)
        ? true
        : proj.side === 'player'
          ? this.resolvePlayerProjectile(proj)
          : this.resolveBossProjectile(proj);

      if (!consumed && proj.lifetime > 0) {
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
    // find first collision (boss or add)
    let hitBoss = false;
    if (this.boss && this.boss.hp > 0) {
      if (dist(proj.pos, this.boss.pos) <= proj.hitRadius + this.boss.radius) hitBoss = true;
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

    if (proj.impactRadius > 0) {
      // AoE on impact
      const center = proj.pos;
      if (this.boss && this.boss.hp > 0 && dist(center, this.boss.pos) <= proj.impactRadius + this.boss.radius) {
        this.applyProjDamageBoss(owner, proj.damage);
      }
      for (const a of this.adds) {
        if (a.hp <= 0) continue;
        if (dist(center, a.pos) <= proj.impactRadius + a.radius) {
          if (owner) damageAdd(this, owner, a, proj.damage);
          else a.hp -= proj.damage;
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
      this.applyProjDamageBoss(owner, proj.damage);
    } else if (hitAdd) {
      if (owner) damageAdd(this, owner, hitAdd, proj.damage);
      else hitAdd.hp -= proj.damage;
    }
    return true;
  }

  private applyProjDamageBoss(owner: Player | null, base: number): void {
    if (!this.boss) return;
    if (owner) {
      damageBoss(this, owner, this.boss, base);
    } else {
      this.boss.hp -= base;
      this.events.push({
        t: 'hit',
        pos: { ...this.boss.pos },
        amount: base,
        targetId: this.boss.id,
        side: 'boss',
      });
    }
  }

  private resolveBossProjectile(proj: Projectile): boolean {
    for (const p of this.players) {
      if (p.state !== 'alive') continue;
      if (dist(proj.pos, p.pos) <= proj.hitRadius + p.radius) {
        damagePlayer(this, p, proj.damage);
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
      for (const p of this.players) {
        if (p.state !== 'alive') continue;
        if (dist(z.pos, p.pos) <= z.radius + p.radius) damagePlayer(this, p, z.damagePerTick);
      }
      return;
    }
    // player-side zone
    const owner = this.players.find((p) => p.id === z.ownerId) ?? null;
    if (z.damagePerTick > 0) {
      if (this.boss && this.boss.hp > 0 && dist(z.pos, this.boss.pos) <= z.radius + this.boss.radius) {
        this.applyProjDamageBoss(owner, z.damagePerTick);
      }
      for (const a of this.adds) {
        if (a.hp <= 0) continue;
        if (dist(z.pos, a.pos) <= z.radius + a.radius) {
          if (owner) damageAdd(this, owner, a, z.damagePerTick);
          else a.hp -= z.damagePerTick;
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

  private updateBoss(dt: number): void {
    const boss = this.boss;
    if (!boss || boss.hp <= 0) return;
    const def = this.monsterDef;

    tickBuffs(boss, dt);
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

    const target = highestThreatTarget(this.players, this.tauntTargetId, this.tauntTimer);

    switch (boss.action.kind) {
      case 'idle': {
        boss.decisionTimer -= dt;
        this.bossMove(dt, target);
        this.handleBlink();
        if (boss.decisionTimer <= 0) {
          this.bossDecide(target);
          boss.decisionTimer = BOSS_DECISION_MIN;
        }
        break;
      }
      case 'windup': {
        boss.action.remaining -= dt;
        if (boss.action.remaining <= 0) this.bossExecute();
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
          if (ab) boss.cooldowns[ab.id] = this.bossCooldown(ab.cooldown);
          this.enterRecover();
        }
        break;
      }
      case 'recover': {
        boss.action.remaining -= dt;
        this.bossMove(dt, target);
        if (boss.action.remaining <= 0) boss.action.kind = 'idle';
        break;
      }
    }
  }

  private bossCooldown(base: number): number {
    const boss = this.boss!;
    const def = this.monsterDef;
    return base * (boss.phase === 'enraged' ? def.enrageCooldownMult : 1);
  }

  private enterRecover(): void {
    const a = this.boss!.action;
    a.kind = 'recover';
    a.abilityId = null;
    a.remaining = BOSS_RECOVER_TIME;
    a.total = BOSS_RECOVER_TIME;
  }

  private bossMove(dt: number, target: Player | null): void {
    const boss = this.boss!;
    const def = this.monsterDef;
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

  private handleBlink(): void {
    const boss = this.boss!;
    const def = this.monsterDef;
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

  private bossDecide(target: Player | null): void {
    const boss = this.boss!;
    const def = this.monsterDef;
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
    const choice = def.decide({ boss, hpFrac, target, distToTarget, anyInMelee, usable, rng: this.rng });
    if (!choice) return;
    const ab = abilityById(def, choice);
    if (!ab) return;
    this.startBossAbility(ab, target);
  }

  private startBossAbility(ab: import('./monsters').BossAbilityDef, target: Player | null): void {
    const boss = this.boss!;
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
      boss.cooldowns[ab.id] = this.bossCooldown(ab.cooldown);
      if (boss.action.kind === 'windup') this.enterRecover();
    }
  }

  private bossExecute(): void {
    const boss = this.boss!;
    const def = this.monsterDef;
    const id = boss.action.abilityId;
    if (!id) {
      this.enterRecover();
      return;
    }
    const ab = abilityById(def, id);
    if (!ab) {
      this.enterRecover();
      return;
    }
    resolveBossAbility(this, boss, ab, boss.action);
    boss.cooldowns[ab.id] = this.bossCooldown(ab.cooldown);
    // beam ability switches action to 'channel'; otherwise recover
    if (boss.action.kind === 'windup') this.enterRecover();
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
      a.attackCd = Math.max(0, a.attackCd - dt);

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
    for (let iter = 0; iter < SEPARATION_ITERATIONS; iter++) {
      for (let i = 0; i < movers.length; i++) {
        for (let j = i + 1; j < movers.length; j++) {
          this.separatePair(movers[i], movers[j]);
        }
      }
      if (this.boss) {
        for (const m of movers) this.pushOutOfBoss(m);
      }
    }
    // Wrap around the torus instead of clamping to walls: an entity that walks
    // off one edge reappears on the opposite edge (infinite scrolling arena).
    for (const p of this.players) p.pos = wrapPos(p.pos);
    for (const a of this.adds) a.pos = wrapPos(a.pos);
    if (this.boss) this.boss.pos = wrapPos(this.boss.pos);
  }

  private separatePair(a: Player | Add, b: Player | Add): void {
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

  private pushOutOfBoss(m: Player | Add): void {
    const boss = this.boss!;
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
    if (this.boss && this.boss.hp <= 0) {
      this.boss.hp = 0;
      this.finished = true;
      this.outcome = 'victory';
      this.endMs = this.elapsed * 1000;
      this.events.push({ t: 'death', id: this.boss.id, kind: 'boss', pos: { ...this.boss.pos } });
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
      stats: this.players.map((p) => ({
        peerId: p.peerId,
        name: p.name,
        classId: p.classId,
        damageDealt: Math.round(p.stats.damageDealt),
        healingDone: Math.round(p.stats.healingDone),
        revives: p.stats.revives,
        deaths: p.stats.deaths,
      })),
    };
  }

  // -------------------------------------------------------------------------
  // Serialization
  // -------------------------------------------------------------------------

  private buildTelegraph(): Telegraph | null {
    const boss = this.boss;
    if (!boss) return null;
    const a = boss.action;
    const def = this.monsterDef;
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
      state: p.state,
      cooldowns: { ...p.cooldowns },
      buffs: p.buffs.map((b) => ({ kind: b.kind, remaining: b.remaining, mult: b.mult })),
      downedTimer: p.downedTimer,
      reviveProgress: p.reviveProgress,
      castSlot: p.castSlot,
      castTimer: p.castTimer,
    };
  }

  private bossView(): BossView | null {
    const b = this.boss;
    if (!b) return null;
    return {
      id: b.id,
      monsterId: b.monsterId,
      pos: { ...b.pos },
      facing: b.facing,
      hp: Math.max(0, Math.round(b.hp)),
      maxHp: b.maxHp,
      phase: b.phase,
      telegraph: this.buildTelegraph(),
      buffs: b.buffs.map((bf) => ({ kind: bf.kind, remaining: bf.remaining, mult: bf.mult })),
      action: b.action.kind,
      abilityId: b.action.abilityId,
    };
  }

  serialize(): Snapshot {
    return {
      tick: this.tick,
      players: this.players.map((p) => this.playerView(p)),
      boss: this.bossView(),
      adds: this.adds.map((a) => ({
        id: a.id,
        pos: { ...a.pos },
        hp: Math.max(0, Math.round(a.hp)),
        maxHp: a.maxHp,
        buffs: a.buffs.map((b) => ({ kind: b.kind, remaining: b.remaining, mult: b.mult })),
      })) as AddView[],
      projectiles: this.projectiles.map((p) => ({
        id: p.id,
        kind: p.kind,
        side: p.side,
        pos: { ...p.pos },
        vel: { ...p.vel },
      })) as ProjectileView[],
      groundZones: this.groundZones.map((z) => ({
        id: z.id,
        kind: z.kind,
        pos: { ...z.pos },
        radius: z.radius,
        duration: z.duration,
        remaining: z.remaining,
      })) as ZoneView[],
      terrain: this.terrain.map((t) => ({
        id: t.id,
        kind: t.kind,
        pos: { ...t.pos },
        radius: t.radius,
      })) as TerrainView[],
      obstacles: this.obstacles.map((o) => ({
        id: o.id,
        pos: { ...o.pos },
        radius: o.radius,
      })) as ObstacleView[],
      events: this.events.slice(),
    };
  }

  toRenderState(localPlayerId: EntityId | null): RenderState {
    const snap = this.serialize();
    return {
      ...snap,
      localPlayerId,
      arena: { w: this.arena.w, h: this.arena.h },
    };
  }
}

export { SIM_DT, PLAYER_RADIUS, vec };
