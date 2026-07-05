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
  Vec2,
  AbilitySlot,
  BossAction,
  ProjectileKind,
} from './types';
import type { World } from './world';
import type { BossAbilityDef } from './monsters';
import { getClass } from './classes';
import {
  add as vadd,
  scale as vscale,
  normalize,
  fromAngle,
  angleOf,
  withLength,
} from './math';
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
  makeBuff,
} from './combat';
import { forceTopThreat } from './threat';
import { addCount, zoneCount } from './scaling';
import {
  ADD_HP,
  ADD_MOVE_SPEED,
  ADD_RADIUS,
  PLAYER_RADIUS,
  CLASS_COLORS,
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

function aliveAllies(world: World): Player[] {
  return world.players.filter((p) => p.state === 'alive');
}

function lowestHpAllyInRange(
  world: World,
  from: Vec2,
  range: number,
): Player | null {
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
  const cls = getClass(p.classId);
  const ab = cls.abilities[slot];
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
      if (world.boss && world.boss.hp > 0) {
        if (pointInCone(world.boss.pos, p.pos, aimAngle, range, half, world.boss.radius)) {
          damageBoss(world, p, world.boss, ab.damage);
          if (ab.stun) applyBuff(world.boss, makeBuff('stun', 0, ab.stun, 'stun'));
        }
      }
      for (const a of world.adds) {
        if (a.hp <= 0) continue;
        if (pointInCone(a.pos, p.pos, aimAngle, range, half, a.radius)) {
          damageAdd(world, p, a, ab.damage);
          if (ab.stun) applyBuff(a, makeBuff('stun', 0, ab.stun, 'stun'));
        }
      }
      break;
    }

    case 'projectile': {
      const count = ab.projCount ?? 1;
      const spread = ((ab.spreadDeg ?? 0) * Math.PI) / 180;
      const speed = ab.projSpeed ?? 600;
      const kind = projectileKindFor(p, slot);
      for (let i = 0; i < count; i++) {
        const t = count > 1 ? i / (count - 1) - 0.5 : 0; // -0.5..0.5
        const a = aimAngle + t * spread;
        const dir = fromAngle(a);
        spawnPlayerProjectile(world, p, kind, dir, speed, ab.damage, ab.impactRadius ?? 0);
      }
      break;
    }

    case 'groundZone': {
      if (ab.zoneTickHeal && ab.zoneTickHeal > 0) {
        // Sanctuary: centered on caster
        spawnZone(world, {
          kind: 'sanctuary',
          pos: { ...p.pos },
          radius: ab.radius ?? 140,
          side: 'player',
          ownerId: p.id,
          damagePerTick: 0,
          healPerTick: ab.zoneTickHeal,
          duration: ab.zoneDuration ?? 4,
        });
      } else {
        // Rain of Arrows: ground-targeted toward aim, clamped to range
        const reach = ab.range ?? 500;
        const center = clampToArena(
          world,
          vadd(p.pos, vscale(p.aim, reach)),
          ab.radius ?? 120,
        );
        spawnZone(world, {
          kind: 'rainOfArrows',
          pos: center,
          radius: ab.radius ?? 120,
          side: 'player',
          ownerId: p.id,
          damagePerTick: ab.zoneTickDamage ?? 12,
          healPerTick: 0,
          duration: ab.zoneDuration ?? 3,
        });
      }
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
      if (world.boss && world.boss.hp > 0 && pointInCircle(world.boss.pos, p.pos, radius, world.boss.radius)) {
        damageBoss(world, p, world.boss, ab.damage);
        if (ab.slowMult) applySlow(world.boss, ab.slowMult, ab.slowDuration ?? 3);
      }
      for (const a of world.adds) {
        if (a.hp <= 0) continue;
        if (pointInCircle(a.pos, p.pos, radius, a.radius)) {
          damageAdd(world, p, a, ab.damage);
          if (ab.slowMult) applySlow(a, ab.slowMult, ab.slowDuration ?? 3);
        }
      }
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
      break;
    }

    case 'blink': {
      const dir = normalize(p.aim);
      const from = { ...p.pos };
      const target = vadd(p.pos, vscale(dir, ab.range ?? 250));
      p.pos = clampToArena(world, target, p.radius);
      world.events.push({ t: 'blink', id: p.id, from, to: { ...p.pos } });
      break;
    }

    case 'selfBuff': {
      if (ab.buffDefMult) {
        applyBuff(p, makeBuff('damageTaken', ab.buffDefMult, ab.buffDuration ?? 4, 'shieldWall'));
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
        applyBuff(target, makeBuff('damageDealt', ab.buffDamageMult, ab.buffDuration ?? 6, 'blessingDmg'));
      }
      if (ab.buffDefMult) {
        applyBuff(target, makeBuff('damageTaken', ab.buffDefMult, ab.buffDuration ?? 6, 'blessingDef'));
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
      break;
    }
  }
}

function projectileKindFor(p: Player, slot: AbilitySlot): ProjectileKind {
  if (p.classId === 'mage') return slot === 'a1' ? 'fireball' : 'arcaneBolt';
  if (p.classId === 'cleric') return 'smite';
  return 'arrow';
}

function spawnPlayerProjectile(
  world: World,
  p: Player,
  kind: ProjectileKind,
  dir: Vec2,
  speed: number,
  damage: number,
  impactRadius: number,
): void {
  const origin = vadd(p.pos, vscale(dir, p.radius + 4));
  const proj: Projectile = {
    id: world.allocId(),
    kind,
    pos: origin,
    vel: vscale(dir, speed),
    ownerId: p.id,
    side: 'player',
    damage,
    impactRadius,
    hitRadius: impactRadius > 0 ? 10 : 8,
    lifetime: 3,
  };
  world.projectiles.push(proj);
  world.events.push({ t: 'projectile', kind, pos: { ...origin } });
}

function applySlow(entity: { buffs: import('./types').Buff[] }, mult: number, duration: number): void {
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
  const dmg = ab.damage * world.bossDamageScalar();
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
        }
      }
      world.events.push({ t: 'telegraph', pos: { ...boss.pos }, shape: 'cone' });
      break;
    }

    case 'circleAtTarget': {
      const center = action.targetPos ?? { ...boss.pos };
      const radius = ab.radius ?? 110;
      for (const p of alivePlayers) {
        if (pointInCircle(p.pos, center, radius, p.radius)) damagePlayer(world, p, dmg);
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
        }
      }
      boss.pos = clampToArena(world, to, boss.radius);
      world.events.push({ t: 'telegraph', pos: to, shape: 'line' });
      break;
    }

    case 'projectile': {
      const target = action.targetId != null
        ? world.players.find((p) => p.id === action.targetId && p.state === 'alive')
        : null;
      const aimAt = target ? target.pos : action.targetPos ?? vadd(boss.pos, fromAngle(action.aimAngle, 100));
      const dir = normalize(sub(aimAt, boss.pos));
      const speed = ab.projSpeed ?? 420;
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
      });
      world.events.push({ t: 'projectile', kind: 'shadowBolt', pos: { ...origin } });
      break;
    }

    case 'summon': {
      const n = ab.countScaling === 'adds' ? addCount(world.scaling.playerCount) : 1;
      for (let i = 0; i < n; i++) {
        const angle = world.rng.range(0, Math.PI * 2);
        const r = world.rng.range(60, 140);
        const pos = clampToArena(
          world,
          vadd(boss.pos, fromAngle(angle, boss.radius + r)),
          ADD_RADIUS,
        );
        const skeleton: Add = {
          id: world.allocId(),
          pos,
          hp: ADD_HP,
          maxHp: ADD_HP,
          moveSpeed: ADD_MOVE_SPEED,
          radius: ADD_RADIUS,
          targetId: null,
          attackCd: world.rng.range(0.2, 0.8),
          buffs: [],
        };
        world.adds.push(skeleton);
        // Spawn burst so summoned skeletons visibly "arrive" (Lich readability).
        world.events.push({ t: 'spawn', id: skeleton.id, kind: 'add', pos: { ...pos } });
      }
      break;
    }

    case 'voidzones': {
      const n = zoneCount(world.scaling.playerCount);
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
          damagePerTick: (ab.zoneTickDamage ?? 12) * world.bossDamageScalar(),
          healPerTick: 0,
          duration: ab.zoneDuration ?? 8,
        });
      }
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
export function beamTick(
  world: World,
  boss: Boss,
  ab: BossAbilityDef,
  action: BossAction,
): void {
  const target =
    action.targetId != null
      ? world.players.find((p) => p.id === action.targetId && p.state === 'alive')
      : null;
  if (!target) return;
  if (dist(boss.pos, target.pos) > (ab.range ?? 500)) return; // out-ranged: broken
  const dealt = damagePlayer(world, target, ab.damage * world.bossDamageScalar());
  if (ab.healSelf) healBoss(boss, dealt);
}

// re-export for convenience / potential external tuning
export { PLAYER_RADIUS };
export type { Vec2, Add };
export { withLength };
