/**
 * Warband — ability resolution for players and bosses. Geometric hit tests
 * (math.ts) resolve cones / circles / lines; effects mutate world entities.
 */
import type {
  Player,
  Boss,
  Add,
  Projectile,
  GroundZone,
  ZoneKind,
  Vec2,
  AbilitySlot,
  BossAction,
  ProjectileKind,
  BuffKind,
} from './types';
import type { World } from './world';
import type { BossAbilityDef } from './monsters';
import type { PlayerAbilityDef } from './classes';
import { getClass } from './classes';
import { add as vadd, scale as vscale, normalize, fromAngle, angleOf, withLength } from './math';
// Toroidal geometry (drop-in for the Euclidean sub/dist/point-in-shape helpers)
// so abilities resolve correctly across the wrap-around seam. See engine/torus.
import { sub, dist, pointInCircle, pointInCone, pointInSegment, wrapCoord } from './torus';
import {
  damageBoss,
  damageAdd,
  damagePlayer,
  healPlayer,
  healBoss,
  applyBuff,
  applyStun,
  makeBuff,
  buffMult,
} from './combat';
import { forceTopThreat } from './threat';
import { addCount, zoneCount } from './scaling';
import {
  ADD_HP,
  ADD_MOVE_SPEED,
  ADD_RADIUS,
  PLAYER_RADIUS,
  CLASS_COLORS,
  PROJECTILE_MAX_RANGE,
} from './constants';
import type { SkillAreaKind } from './types';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

// Torus arena: wrap placements/dashes/blinks around the edges instead of
// clamping to walls. `_radius` is kept for call-site compatibility (unused now
// that there are no walls to inset from).
function clampToArena(world: World, pos: Vec2, _radius = 0): Vec2 {
  return {
    x: wrapCoord(pos.x, world.arena.w),
    y: wrapCoord(pos.y, world.arena.h),
  };
}

/** A hero's resolved ability table (per-run character upgrades), else class defaults. */
function abilitiesOf(p: Player): Record<AbilitySlot, PlayerAbilityDef> {
  return p.abilities ?? getClass(p.classId).abilities;
}

function aliveAllies(world: World): Player[] {
  return world.players.filter((p) => p.state === 'alive');
}

function lowestHpAllyInRange(world: World, from: Vec2, range: number): Player | null {
  let best: Player | null = null;
  let bestRatio = Infinity;
  for (const p of aliveAllies(world)) {
    if (dist(from, p.pos) > range) continue;
    const ratio = p.hp / p.maxHp;
    if (ratio < bestRatio) {
      bestRatio = ratio;
      best = p;
    }
  }
  return best;
}

/** Apply a strike's on-hit riders (stun / freeze / chill) to a boss or add.
 * Stuns honor diminishing returns (see combat.applyStun); slow riders let
 * Frostbrand-style upgrades chill through melee swings, not just projectiles. */
function applyStrikeRiders(world: World, target: Boss | Add, ab: PlayerAbilityDef): void {
  if (ab.stun) applyStun(world, target, ab.stun, 'stun');
  if (ab.freeze) applyStun(world, target, ab.freeze, 'freeze');
  if (ab.slowMult != null && ab.slowMult < 1) {
    applySlow(target, ab.slowMult, ab.slowDuration ?? 2);
  }
}

// ---------------------------------------------------------------------------
// Player ability resolution
// ---------------------------------------------------------------------------

/**
 * Apply a player ability's effect immediately. Cooldown gating, casting and
 * stun checks are handled by the World before calling this. `moveDir` is the
 * player's current movement input (used by dashes).
 */
export function resolvePlayerAbility(
  world: World,
  p: Player,
  slot: AbilitySlot,
  moveDir: Vec2,
): void {
  const ab = abilitiesOf(p)[slot];
  const aimAngle = angleOf(p.aim);
  const color = CLASS_COLORS[p.classId] ?? 0xffffff;

  world.events.push({
    t: 'cast',
    ability: ab.name,
    sourceId: p.id,
    pos: { ...p.pos },
    side: 'player',
    slot,
  });

  switch (ab.kind) {
    case 'meleeCone': {
      const range = ab.range ?? 70;
      const half = ((ab.halfAngleDeg ?? 45) * Math.PI) / 180;
      emitSkillArea(world, p.id, color, {
        kind: 'cone',
        origin: { ...p.pos },
        angle: aimAngle,
        range,
        radius: 0,
        halfAngle: half,
      });
      let dealt = 0;
      for (const b of world.bosses) {
        if (b.hp <= 0) continue;
        if (pointInCone(b.pos, p.pos, aimAngle, range, half, b.radius)) {
          dealt += damageBoss(world, p, b, ab.damage);
          applyStrikeRiders(world, b, ab);
        }
      }
      for (const a of world.adds) {
        if (a.hp <= 0) continue;
        if (pointInCone(a.pos, p.pos, aimAngle, range, half, a.radius)) {
          dealt += damageAdd(world, p, a, ab.damage);
          applyStrikeRiders(world, a, ab);
        }
      }
      lifesteal(world, p, ab, dealt);
      break;
    }

    case 'projectile': {
      const count = ab.projCount ?? 1;
      const spread = ((ab.spreadDeg ?? 0) * Math.PI) / 180;
      const speed = ab.projSpeed ?? 600;
      // Anything that detonates in an area reads as a fireball — including a
      // Fireball GRAFTED onto a non-mage by a hybrid upgrade (charUpgrades.ts).
      const kind: ProjectileKind =
        (ab.impactRadius ?? 0) > 0 ? 'fireball' : projectileKindFor(p, slot);
      const maxRange = ab.maxRange ?? PROJECTILE_MAX_RANGE;
      for (let i = 0; i < count; i++) {
        const t = count > 1 ? i / (count - 1) - 0.5 : 0; // -0.5..0.5
        const a = aimAngle + t * spread;
        const dir = fromAngle(a);
        spawnPlayerProjectile(world, p, kind, dir, {
          speed,
          damage: ab.damage,
          impactRadius: ab.impactRadius ?? 0,
          maxRange,
          slowMult: ab.slowMult,
          slowDuration: ab.slowDuration,
          freeze: ab.freeze,
          lifesteal: ab.lifestealFrac,
        });
      }
      break;
    }

    case 'groundZone': {
      resolveGroundZone(world, p, ab);
      break;
    }

    case 'pbaoe': {
      const radius = ab.radius ?? 150;
      emitSkillArea(world, p.id, color, {
        kind: 'circle',
        origin: { ...p.pos },
        angle: 0,
        range: 0,
        radius,
        halfAngle: 0,
      });
      let dealt = 0;
      for (const b of world.bosses) {
        if (b.hp <= 0) continue;
        if (pointInCircle(b.pos, p.pos, radius, b.radius)) {
          dealt += damageBoss(world, p, b, ab.damage);
          applyStrikeRiders(world, b, ab);
        }
      }
      for (const a of world.adds) {
        if (a.hp <= 0) continue;
        if (pointInCircle(a.pos, p.pos, radius, a.radius)) {
          dealt += damageAdd(world, p, a, ab.damage);
          applyStrikeRiders(world, a, ab);
        }
      }
      lifesteal(world, p, ab, dealt);
      break;
    }

    case 'dash': {
      let dir = moveDir;
      if (dir.x === 0 && dir.y === 0) dir = p.aim;
      dir = normalize(dir);
      const target = vadd(p.pos, vscale(dir, ab.range ?? 220));
      p.pos = clampToArena(world, target, p.radius);
      if (ab.iframes) applyBuff(p, makeBuff('invuln', 0, ab.iframes, 'dash'));
      world.events.push({ t: 'dodge', id: p.id, pos: { ...p.pos } });
      // Leap-style landing slam.
      if (ab.landingDamage && ab.landingDamage > 0) {
        const radius = ab.radius ?? 120;
        emitSkillArea(world, p.id, color, {
          kind: 'circle',
          origin: { ...p.pos },
          angle: 0,
          range: 0,
          radius,
          halfAngle: 0,
        });
        for (const b of world.bosses) {
          if (b.hp <= 0) continue;
          if (pointInCircle(b.pos, p.pos, radius, b.radius)) {
            damageBoss(world, p, b, ab.landingDamage);
            applyStrikeRiders(world, b, ab);
          }
        }
        for (const a of world.adds) {
          if (a.hp <= 0) continue;
          if (pointInCircle(a.pos, p.pos, radius, a.radius)) {
            damageAdd(world, p, a, ab.landingDamage);
            applyStrikeRiders(world, a, ab);
          }
        }
      }
      if (ab.healOnUse) healPlayer(world, null, p, ab.healOnUse);
      break;
    }

    case 'blink': {
      const dir = normalize(p.aim);
      const from = { ...p.pos };
      const target = vadd(p.pos, vscale(dir, ab.range ?? 250));
      p.pos = clampToArena(world, target, p.radius);
      if (ab.iframes) applyBuff(p, makeBuff('invuln', 0, ab.iframes, 'dash'));
      if (ab.healOnUse) healPlayer(world, null, p, ab.healOnUse);
      world.events.push({ t: 'blink', id: p.id, from, to: { ...p.pos } });
      break;
    }

    case 'selfBuff': {
      if (ab.buffDefMult) {
        applyBuff(p, makeBuff('damageTaken', ab.buffDefMult, ab.buffDuration ?? 4, 'selfBuffDef'));
      }
      if (ab.buffDamageMult) {
        applyBuff(
          p,
          makeBuff('damageDealt', ab.buffDamageMult, ab.buffDuration ?? 4, 'selfBuffDmg'),
        );
      }
      if (ab.buffMoveMult) {
        applyBuff(p, makeBuff('moveSpeed', ab.buffMoveMult, ab.buffDuration ?? 4, 'selfBuffMove'));
      }
      break;
    }

    case 'buffAlly': {
      emitSkillArea(world, p.id, color, {
        kind: 'circle',
        origin: { ...p.pos },
        angle: 0,
        range: 0,
        radius: ab.range ?? 400,
        halfAngle: 0,
      });
      const target = lowestHpAllyInRange(world, p.pos, ab.range ?? 400) ?? p;
      if (ab.buffDamageMult) {
        applyBuff(
          target,
          makeBuff('damageDealt', ab.buffDamageMult, ab.buffDuration ?? 6, 'blessingDmg'),
        );
      }
      if (ab.buffDefMult) {
        applyBuff(
          target,
          makeBuff('damageTaken', ab.buffDefMult, ab.buffDuration ?? 6, 'blessingDef'),
        );
      }
      if (ab.buffMoveMult) {
        applyBuff(
          target,
          makeBuff('moveSpeed', ab.buffMoveMult, ab.buffDuration ?? 6, 'blessingMove'),
        );
      }
      break;
    }

    case 'heal': {
      // Flash the heal's reach so the Cleric (and allies) can read the range.
      emitSkillArea(world, p.id, color, {
        kind: 'circle',
        origin: { ...p.pos },
        angle: 0,
        range: 0,
        radius: ab.range ?? 400,
        halfAngle: 0,
      });
      const target = lowestHpAllyInRange(world, p.pos, ab.range ?? 400);
      if (target) healPlayer(world, p, target, ab.damage);
      break;
    }

    case 'taunt': {
      emitSkillArea(world, p.id, color, {
        kind: 'circle',
        origin: { ...p.pos },
        angle: 0,
        range: 0,
        radius: 150,
        halfAngle: 0,
      });
      forceTopThreat(world.players, p.id);
      world.tauntTargetId = p.id;
      world.tauntTimer = ab.buffDuration ?? 4;
      // Bastion upgrade: taunting also shields the taunter.
      if (ab.buffDefMult) {
        applyBuff(p, makeBuff('damageTaken', ab.buffDefMult, ab.buffDuration ?? 4, 'tauntShield'));
      }
      break;
    }
  }
}

/** Heal the caster for a fraction of the damage a lifesteal ability dealt. */
function lifesteal(world: World, p: Player, ab: PlayerAbilityDef, dealt: number): void {
  if (ab.lifestealFrac && dealt > 0) {
    healPlayer(world, null, p, dealt * ab.lifestealFrac);
  }
}

/** Resolve a `groundZone` ability into a spawned zone (centered or ground-targeted). */
function resolveGroundZone(world: World, p: Player, ab: PlayerAbilityDef): void {
  const healPerTick = ab.zoneTickHeal ?? 0;
  const dmgPerTick = ab.zoneTickDamage ?? 0;
  const slowMult = ab.slowMult ?? 1;
  const slowDuration = ab.slowDuration ?? 0;
  const kind: ZoneKind = ab.zoneKind ?? (healPerTick > 0 ? 'sanctuary' : 'rainOfArrows');
  const centered = kind === 'sanctuary' || kind === 'consecration';
  const radius = ab.radius ?? 130;
  const pos = centered
    ? { ...p.pos }
    : clampToArena(world, vadd(p.pos, vscale(p.aim, ab.range ?? 500)), radius);
  spawnZone(world, {
    kind,
    pos,
    radius,
    side: 'player',
    ownerId: p.id,
    damagePerTick: dmgPerTick,
    healPerTick,
    slowMult,
    slowDuration,
    duration: ab.zoneDuration ?? 4,
  });
}

function projectileKindFor(p: Player, slot: AbilitySlot): ProjectileKind {
  if (p.classId === 'mage') return slot === 'a1' ? 'fireball' : 'arcaneBolt';
  if (p.classId === 'cleric' || p.classId === 'paladin') return 'smite';
  if (
    p.classId === 'ranger' ||
    p.classId === 'druid' ||
    p.classId === 'barbarian' ||
    p.classId === 'rogue'
  )
    return 'arrow';
  return 'arrow';
}

interface SpawnProjOpts {
  speed: number;
  damage: number;
  impactRadius: number;
  maxRange: number;
  slowMult?: number;
  slowDuration?: number;
  freeze?: number;
  /** Fraction of dealt damage healed back to the owner (Vampiric shots). */
  lifesteal?: number;
}

function spawnPlayerProjectile(
  world: World,
  p: Player,
  kind: ProjectileKind,
  dir: Vec2,
  o: SpawnProjOpts,
): void {
  const origin = vadd(p.pos, vscale(dir, p.radius + 4));
  const proj: Projectile = {
    id: world.allocId(),
    kind,
    pos: origin,
    vel: vscale(dir, o.speed),
    ownerId: p.id,
    side: 'player',
    damage: o.damage,
    impactRadius: o.impactRadius,
    hitRadius: o.impactRadius > 0 ? 10 : 8,
    lifetime: 3,
    rangeLeft: o.maxRange,
    slowMult: o.slowMult,
    slowDuration: o.slowDuration,
    freeze: o.freeze,
    lifesteal: o.lifesteal,
  };
  world.projectiles.push(proj);
  world.events.push({ t: 'projectile', kind, pos: { ...origin } });
}

function applySlow(
  entity: { buffs: import('./types').Buff[] },
  mult: number,
  duration: number,
): void {
  applyBuff(entity, makeBuff('moveSpeed', mult, duration, 'slow'));
}

/** Push a one-shot `skillArea` event so the renderer can flash an ability's
 * effect region (cone / circle / line). Cosmetic — purely for readability. */
function emitSkillArea(
  world: World,
  sourceId: number,
  color: number,
  area: {
    kind: SkillAreaKind;
    origin: Vec2;
    angle: number;
    range: number;
    radius: number;
    halfAngle: number;
  },
): void {
  world.events.push({ t: 'skillArea', sourceId, side: 'player', color, area });
}

interface SpawnZoneOpts {
  kind: GroundZone['kind'];
  pos: Vec2;
  radius: number;
  side: GroundZone['side'];
  ownerId: number;
  damagePerTick: number;
  healPerTick: number;
  slowMult?: number;
  slowDuration?: number;
  duration: number;
}

function spawnZone(world: World, o: SpawnZoneOpts): void {
  const zone: GroundZone = {
    id: world.allocId(),
    kind: o.kind,
    pos: o.pos,
    radius: o.radius,
    side: o.side,
    ownerId: o.ownerId,
    damagePerTick: o.damagePerTick,
    healPerTick: o.healPerTick,
    slowMult: o.slowMult ?? 1,
    slowDuration: o.slowDuration ?? 0,
    duration: o.duration,
    remaining: o.duration,
    tickAccum: 0,
  };
  world.groundZones.push(zone);
}

// ---------------------------------------------------------------------------
// Boss ability resolution
// ---------------------------------------------------------------------------

/** Push a player away from `center` by `distance`, clamped to the arena. */
function knockback(world: World, p: Player, center: Vec2, distance: number): void {
  const dir = normalize(sub(p.pos, center));
  const d = dir.x === 0 && dir.y === 0 ? { x: 1, y: 0 } : dir;
  p.pos = clampToArena(world, vadd(p.pos, vscale(d, distance)), p.radius);
}

/** Apply a boss strike's on-hit slow rider to a player (frost bosses). */
function bossSlowRider(p: Player, ab: BossAbilityDef): void {
  if (ab.slowMult && ab.slowMult < 1) {
    applyBuff(p, makeBuff('moveSpeed', ab.slowMult, ab.slowDuration ?? 2, 'bossSlow'));
  }
}

/**
 * Resolve a boss ability's effect at execute time. `action` carries the
 * targeting locked at wind-up start (aimAngle / targetPos / targetId).
 */
export function resolveBossAbility(
  world: World,
  boss: Boss,
  ab: BossAbilityDef,
  action: BossAction,
): void {
  // Boss offensive self-buffs (War Cry / Frenzy / Power of Night…) empower its
  // hits; twin bosses swing at a fraction of solo strength (dmgScale).
  const dmg =
    ab.damage * world.bossDamageScalar() * (boss.dmgScale ?? 1) * buffMult(boss, 'damageDealt');
  const alivePlayers = world.players.filter((p) => p.state === 'alive');

  world.events.push({
    t: 'cast',
    ability: ab.name,
    sourceId: boss.id,
    pos: { ...boss.pos },
    side: 'boss',
  });

  switch (ab.shape) {
    case 'cone': {
      const range = ab.range ?? 300;
      const half = ((ab.halfAngleDeg ?? 30) * Math.PI) / 180;
      for (const p of alivePlayers) {
        if (pointInCone(p.pos, boss.pos, action.aimAngle, range, half, p.radius)) {
          damagePlayer(world, p, dmg);
          bossSlowRider(p, ab);
          if (ab.stun) applyStun(world, p, ab.stun, 'bossStun');
        }
      }
      world.events.push({ t: 'telegraph', pos: { ...boss.pos }, shape: 'cone' });
      break;
    }

    case 'circleAtTarget': {
      const center = action.targetPos ?? { ...boss.pos };
      const radius = ab.radius ?? 110;
      for (const p of alivePlayers) {
        if (pointInCircle(p.pos, center, radius, p.radius)) {
          damagePlayer(world, p, dmg);
          bossSlowRider(p, ab);
        }
      }
      world.events.push({ t: 'telegraph', pos: center, shape: 'circle' });
      break;
    }

    case 'pbaoe': {
      const radius = ab.radius ?? 160;
      for (const p of alivePlayers) {
        if (pointInCircle(p.pos, boss.pos, radius, p.radius)) {
          damagePlayer(world, p, dmg);
          if (ab.knockback) knockback(world, p, boss.pos, ab.knockback);
          bossSlowRider(p, ab);
          if (ab.stun) applyStun(world, p, ab.stun, 'bossStun');
        }
      }
      world.events.push({ t: 'telegraph', pos: { ...boss.pos }, shape: 'circle' });
      break;
    }

    case 'line': {
      // Charge: dash from boss to the locked target position, hitting anyone
      // along the path, then relocate the boss to the target.
      const from = { ...boss.pos };
      const to = action.targetPos ?? vadd(boss.pos, fromAngle(action.aimAngle, ab.range ?? 600));
      const halfWidth = (ab.width ?? 45) + boss.radius * 0.5;
      for (const p of alivePlayers) {
        if (pointInSegment(p.pos, from, to, halfWidth, p.radius)) {
          damagePlayer(world, p, dmg);
          if (ab.knockback) knockback(world, p, from, ab.knockback);
          bossSlowRider(p, ab);
        }
      }
      boss.pos = clampToArena(world, to, boss.radius);
      world.events.push({ t: 'telegraph', pos: to, shape: 'line' });
      break;
    }

    case 'projectile': {
      const target =
        action.targetId != null
          ? world.players.find((p) => p.id === action.targetId && p.state === 'alive')
          : null;
      const aimAt = target
        ? target.pos
        : (action.targetPos ?? vadd(boss.pos, fromAngle(action.aimAngle, 100)));
      const baseAngle = angleOf(sub(aimAt, boss.pos));
      const speed = ab.projSpeed ?? 420;
      const count = ab.projCount ?? 1;
      const spread = ((ab.spreadDeg ?? 0) * Math.PI) / 180;
      const maxRange = ab.range ?? 900;
      for (let i = 0; i < count; i++) {
        const t = count > 1 ? i / (count - 1) - 0.5 : 0;
        const ang = baseAngle + t * spread;
        const dir = fromAngle(ang);
        const origin = vadd(boss.pos, vscale(dir, boss.radius + 6));
        world.projectiles.push({
          id: world.allocId(),
          kind: 'shadowBolt',
          pos: origin,
          vel: vscale(dir, speed),
          ownerId: boss.id,
          side: 'boss',
          damage: dmg,
          impactRadius: 0,
          hitRadius: 12,
          lifetime: 4,
          rangeLeft: maxRange,
          slowMult: ab.slowMult,
          slowDuration: ab.slowDuration,
        });
      }
      world.events.push({ t: 'projectile', kind: 'shadowBolt', pos: { ...boss.pos } });
      break;
    }

    case 'summon': {
      const base = ab.countScaling === 'adds' ? addCount(world.scaling.playerCount) : 1;
      const n = base + (ab.addCountBonus ?? 0);
      const hp = ADD_HP * (ab.addHpMult ?? 1);
      for (let i = 0; i < n; i++) {
        const angle = world.rng.range(0, Math.PI * 2);
        const r = world.rng.range(60, 140);
        const pos = clampToArena(
          world,
          vadd(boss.pos, fromAngle(angle, boss.radius + r)),
          ADD_RADIUS,
        );
        const minion: Add = {
          id: world.allocId(),
          pos,
          hp,
          maxHp: hp,
          moveSpeed: ADD_MOVE_SPEED * (ab.addSpeedMult ?? 1),
          radius: ADD_RADIUS,
          targetId: null,
          attackCd: world.rng.range(0.2, 0.8),
          buffs: [],
        };
        world.adds.push(minion);
        world.events.push({ t: 'spawn', id: minion.id, kind: 'add', pos: { ...pos } });
      }
      break;
    }

    case 'voidzones': {
      const n = zoneCount(world.scaling.playerCount) + (ab.zoneCountBonus ?? 0);
      const pool = alivePlayers.length > 0 ? alivePlayers : world.players;
      for (let i = 0; i < n; i++) {
        const anchor = pool.length > 0 ? world.rng.pick(pool).pos : boss.pos;
        const jitter = fromAngle(world.rng.range(0, Math.PI * 2), world.rng.range(0, 60));
        const pos = clampToArena(world, vadd(anchor, jitter), ab.radius ?? 90);
        spawnZone(world, {
          kind: 'voidZone',
          pos,
          radius: ab.radius ?? 90,
          side: 'boss',
          ownerId: boss.id,
          damagePerTick:
            (ab.zoneTickDamage ?? 12) * world.bossDamageScalar() * (boss.dmgScale ?? 1),
          healPerTick: 0,
          slowMult: ab.slowMult,
          slowDuration: ab.slowDuration,
          duration: ab.zoneDuration ?? 8,
        });
      }
      break;
    }

    case 'buffSelf': {
      if (ab.buffMoveMult)
        applyBuff(boss, makeBuff('moveSpeed', ab.buffMoveMult, ab.buffDuration ?? 5, 'bossHaste'));
      if (ab.buffDamageMult)
        applyBuff(
          boss,
          makeBuff('damageDealt', ab.buffDamageMult, ab.buffDuration ?? 5, 'bossFrenzy'),
        );
      if (ab.buffDefMult)
        applyBuff(boss, makeBuff('damageTaken', ab.buffDefMult, ab.buffDuration ?? 5, 'bossWard'));
      if (ab.selfHealFrac) healBoss(boss, boss.maxHp * ab.selfHealFrac);
      break;
    }

    case 'beam': {
      // Enter a channel; ticks are applied in world boss update.
      action.kind = 'channel';
      action.abilityId = ab.id;
      action.remaining = ab.channelDuration ?? 2;
      action.total = ab.channelDuration ?? 2;
      action.channelAccum = 0;
      break;
    }
  }
}

/** One Life-Drain tick: damage the locked target (if in range) and heal boss. */
export function beamTick(world: World, boss: Boss, ab: BossAbilityDef, action: BossAction): void {
  const target =
    action.targetId != null
      ? world.players.find((p) => p.id === action.targetId && p.state === 'alive')
      : null;
  if (!target) return;
  if (dist(boss.pos, target.pos) > (ab.range ?? 500)) return; // out-ranged: broken
  const dealt = damagePlayer(
    world,
    target,
    ab.damage * world.bossDamageScalar() * (boss.dmgScale ?? 1) * buffMult(boss, 'damageDealt'),
  );
  if (ab.healSelf) healBoss(boss, dealt);
}

// re-export for convenience / potential external tuning
export { PLAYER_RADIUS };
export type { Vec2, Add, BuffKind };
export { withLength };
