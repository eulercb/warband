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
  ExtSlot,
  BossAction,
  ProjectileKind,
  BuffKind,
  ProjectileImpact,
} from '../core/types';
import type { World } from '../world/world';
import type { BossAbilityDef } from '../content/monsters';
import type { PlayerAbilityDef } from '../content/classes';
import type { AbilityComponents, EffectComponent, ZoneSpec, BuffTarget } from '../content/forge';
import { getClass } from '../content/classes';
import {
  add as vadd,
  scale as vscale,
  normalize,
  fromAngle,
  angleOf,
  withLength,
} from '../core/math';
// Toroidal geometry (drop-in for the Euclidean sub/dist/point-in-shape helpers)
// so abilities resolve correctly across the wrap-around seam. See engine/torus.
import {
  sub,
  dist,
  pointInCircle,
  pointInCone,
  pointInSegment,
  wrapCoord,
  nearestCopy,
} from '../core/torus';
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
  isRooted,
} from './combat';
import { forceTopThreat } from './threat';
import { addCount, zoneCount } from '../content/scaling';
import {
  ADD_HP,
  ADD_MOVE_SPEED,
  ADD_RADIUS,
  PLAYER_RADIUS,
  CLASS_COLORS,
  PROJECTILE_MAX_RANGE,
} from '../core/constants';
import type { SkillAreaKind } from '../core/types';

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

// item 2 — dash-nature movers GLIDE instead of teleporting. This is the travel
// speed (world units/sec); a 220-280u dash resolves over ~3-4 fixed 20 Hz ticks, so
// it reads as a fast slide (not a slow walk) while replicating through the normal
// snapshot pipeline. Reach is unchanged — only the instantaneous jump becomes travel.
const GLIDE_SPEED = 1500;

// Tall silhouettes a LEAP cannot clear (it stops at them, like a dash). Low cover —
// rocks and stumps — a leap sails over. Collision itself is always the circle; this
// only decides whether a leap is stopped by a given obstacle's bulk (item 2).
const TALL_OBSTACLES: ReadonlySet<string> = new Set(['pillar', 'monolith', 'crystal', 'totem']);

/**
 * The point at which a glide from `a` toward `b` (hero radius `r`) is first stopped by
 * a movement-blocking obstacle, or null if the path is clear. A dash/roll/charge is
 * stopped by ANY obstacle; a leap (`leap=true`) only by a TALL one. Torus-aware
 * (obstacle centres are projected to their nearest copy of `a`); returns the contact
 * point (hero centre one combined-radius short of the obstacle) so the mover ends
 * flush against cover instead of tunnelling through it.
 */
function firstObstacleStop(world: World, a: Vec2, b: Vec2, r: number, leap: boolean): Vec2 | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;
  const ux = dx / len;
  const uy = dy / len;
  let bestT = Infinity;
  for (const o of world.obstacles) {
    if (leap && !TALL_OBSTACLES.has(o.kind ?? 'rock')) continue; // a leap clears low cover
    const c = nearestCopy(o.pos, a);
    const R = o.radius + r;
    // Ray–circle: smallest t along the unit path where |a + t·u − c| = R.
    const fx = a.x - c.x;
    const fy = a.y - c.y;
    const proj = fx * ux + fy * uy; // dot(f, u)
    const cc = fx * fx + fy * fy - R * R;
    const disc = proj * proj - cc;
    if (disc < 0) continue; // path misses this obstacle
    const t = -proj - Math.sqrt(disc); // entry point
    if (t >= 0 && t <= len && t < bestT) bestT = t;
  }
  if (bestT === Infinity) return null;
  return { x: a.x + ux * bestT, y: a.y + uy * bestT };
}

/**
 * The landing slam of a dash-nature mover (item 2). Fires on TOUCHDOWN — when the
 * glide completes or stops at cover — so a leap/charge slams where it actually lands.
 * A no-op for a mover with no `landingDamage` (a plain roll/dash). Extracted from the
 * old instantaneous dash so the effect is identical, just deferred to the real landing.
 */
function applyDashLanding(world: World, p: Player, ab: PlayerAbilityDef): void {
  if (!ab.landingDamage || ab.landingDamage <= 0) return;
  const color = CLASS_COLORS[p.classId] ?? 0xffffff;
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
      damageBoss(world, p, b, ab.landingDamage, world.critRoll(p));
      applyStrikeRiders(world, b, ab);
    }
  }
  for (const a of world.adds) {
    if (a.hp <= 0) continue;
    if (pointInCircle(a.pos, p.pos, radius, a.radius)) {
      damageAdd(world, p, a, ab.landingDamage, world.critRoll(p));
      applyStrikeRiders(world, a, ab);
    }
  }
}

/**
 * Begin a dash-nature GLIDE (item 2): the escape effects that fire ON USE — i-frames
 * (extended to cover the whole slide so the hero is never exposed mid-dash) and the
 * escape heal — fire now; the travel plays out over subsequent ticks in
 * `stepPlayerGlide`, and the landing slam fires on touchdown. `dir` is the (already
 * chosen) travel direction; it is normalised here.
 */
function startGlide(
  world: World,
  p: Player,
  ab: PlayerAbilityDef,
  dir: Vec2,
  /** Fire the flat `healOnUse` here. false for a composed dash, whose heal comes from
   *  its own `selfHeal()` component instead (avoids a double heal). */
  fireHeal = true,
): void {
  const range = ab.range ?? 220;
  const d = normalize(dir);
  if (ab.iframes) {
    // Cover at least the travel time so the i-frames span the entire glide.
    const dur = Math.max(ab.iframes, range / GLIDE_SPEED);
    applyBuff(p, makeBuff('invuln', 0, dur, 'dash'));
  }
  if (fireHeal && ab.healOnUse) healPlayer(world, p, p, ab.healOnUse);
  world.events.push({ t: 'dodge', id: p.id, pos: { ...p.pos } });
  p.glide = { dir: d, remaining: range, leap: ab.leap === true, ab };
}

/**
 * Advance a hero's in-progress dash glide by one tick (item 2). Moves along the locked
 * direction at `GLIDE_SPEED`, stopping flush at the first blocking obstacle per the
 * mover's nature (dash/charge → any cover; leap → tall cover only). On touchdown —
 * completed OR stopped — the landing slam fires and the glide clears. Host-authoritative
 * and deterministic; the intermediate positions replicate via the snapshot pipeline.
 */
export function stepPlayerGlide(world: World, p: Player, dt: number): void {
  const g = p.glide;
  if (!g) return;
  // A felled hero drops out of a dash (no ghost-sliding a corpse).
  if (p.state !== 'alive') {
    p.glide = null;
    return;
  }
  const step = Math.min(GLIDE_SPEED * dt, g.remaining);
  const from = { ...p.pos };
  let next = vadd(from, vscale(g.dir, step));
  const stop = firstObstacleStop(world, from, next, p.radius, g.leap);
  let ended = false;
  if (stop) {
    next = stop;
    ended = true; // ran into cover — end the dash here
  }
  p.pos = clampToArena(world, next, p.radius);
  g.remaining -= step;
  if (ended || g.remaining <= 1e-6) {
    applyDashLanding(world, p, g.ab);
    p.glide = null;
  }
}

/** A hero's resolved ability table (per-run character upgrades), else class defaults. */
function abilitiesOf(p: Player): Record<AbilitySlot, PlayerAbilityDef> {
  return p.abilities ?? getClass(p.classId).abilities;
}

/** Resolve the ability def for ANY slot — base kit or a subclass slot (item 13). */
export function abilityForSlot(p: Player, slot: ExtSlot): PlayerAbilityDef | undefined {
  if (slot === 'sub1' || slot === 'sub2') return p.subAbilities?.[slot];
  return abilitiesOf(p)[slot];
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
  // item 9 — a direct-hit SLUGGISH rider (envenomed strike / cursed shot) stretches
  // the target's next wind-up for a short window.
  if (ab.castSlow != null && ab.castSlow > 1) {
    applyBuff(target, makeBuff('castSlow', ab.castSlow, ab.castSlowDuration ?? 3, 'castSlow'));
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
export function resolvePlayerAbility(world: World, p: Player, slot: ExtSlot, moveDir: Vec2): void {
  const ab = abilityForSlot(p, slot);
  if (!ab) return; // a sub slot with no bound skill — nothing to resolve
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

  // Chaos Forge — a SYNTHESIZED ability carries a recombined component list; walk
  // that instead of the fixed field switch (so a projectile can spawn an
  // ally-buff zone on impact). Canonical/variance/Chaos-Draft content never has
  // `.components`, so it takes the untouched switch below — byte-for-byte
  // identical when Forge is off. See docs/CHAOS_FORGE.md.
  if (ab.components) {
    resolveComposedAbility(world, p, ab, moveDir, ab.components);
    return;
  }

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
          // item 5: a directional cone strike can crit AND backstab (rear arc).
          dealt += damageBoss(world, p, b, ab.damage, world.meleeHit(p, b));
          applyStrikeRiders(world, b, ab);
        }
      }
      for (const a of world.adds) {
        if (a.hp <= 0) continue;
        if (pointInCone(a.pos, p.pos, aimAngle, range, half, a.radius)) {
          dealt += damageAdd(world, p, a, ab.damage, world.critRoll(p));
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
          // item 5: a point-blank burst can crit (omnidirectional → no backstab).
          dealt += damageBoss(world, p, b, ab.damage, world.critRoll(p));
          applyStrikeRiders(world, b, ab);
        }
      }
      for (const a of world.adds) {
        if (a.hp <= 0) continue;
        if (pointInCircle(a.pos, p.pos, radius, a.radius)) {
          dealt += damageAdd(world, p, a, ab.damage, world.critRoll(p));
          applyStrikeRiders(world, a, ab);
        }
      }
      lifesteal(world, p, ab, dealt);
      break;
    }

    case 'dash': {
      // item 2: a roll / dash / charge is NOT a teleport — begin a multi-tick glide
      // (it visibly travels, stops at the first blocking obstacle, and its landing
      // slam fires on touchdown, all in stepPlayerGlide). A root locks it — a rooted
      // hero can't dash away — matching the boss charge and the root contract.
      if (isRooted(p)) break;
      let dir = moveDir;
      if (dir.x === 0 && dir.y === 0) dir = p.aim;
      startGlide(world, p, ab, dir);
      break;
    }

    case 'blink': {
      // item 2: a teleport stays instant and may pass THROUGH movement-blocking cover
      // — but a root still locks it (blink/teleport are on the root contract).
      if (isRooted(p)) break;
      const dir = normalize(p.aim);
      const from = { ...p.pos };
      const target = vadd(p.pos, vscale(dir, ab.range ?? 250));
      p.pos = clampToArena(world, target, p.radius);
      if (ab.iframes) applyBuff(p, makeBuff('invuln', 0, ab.iframes, 'dash'));
      if (ab.healOnUse) healPlayer(world, p, p, ab.healOnUse);
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
      // item 7 — Dragon Wings & co. lift the caster into the air for a window.
      if (ab.grantsFlight) {
        applyBuff(p, makeBuff('flight', 0, ab.grantsFlight, 'flight'));
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
      // item 7 — a rallying skill can lift its target into the air too.
      if (ab.grantsFlight) {
        applyBuff(target, makeBuff('flight', 0, ab.grantsFlight, 'flight'));
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

// ---------------------------------------------------------------------------
// Chaos Forge — component-driven executor (docs/CHAOS_FORGE.md)
// ---------------------------------------------------------------------------

/** Rally reach for an ally-buff carried by a strike/mobility delivery (a war-cry). */
const FORGE_RALLY_RANGE = 320;

/** Apply the buff components in `effects` that target `who` onto `target`. */
function applyForgeBuffs(
  target: { buffs: import('../core/types').Buff[] },
  effects: EffectComponent[],
  who: BuffTarget,
  src: string,
): void {
  for (const e of effects) {
    if (e.kind !== 'buff' || e.target !== who) continue;
    if (e.defMult != null)
      applyBuff(target, makeBuff('damageTaken', e.defMult, e.duration, `${src}Def`));
    if (e.dmgMult != null)
      applyBuff(target, makeBuff('damageDealt', e.dmgMult, e.duration, `${src}Dmg`));
    if (e.moveMult != null)
      applyBuff(target, makeBuff('moveSpeed', e.moveMult, e.duration, `${src}Move`));
  }
}

/** Map a forge ZoneSpec to a projectile's on-impact payload. */
function zoneToImpact(z: ZoneSpec): ProjectileImpact {
  return {
    kind: z.zoneKind,
    radius: z.radius,
    duration: z.duration,
    tickDamage: z.tickDamage,
    tickHeal: z.tickHeal,
    slowMult: z.slowMult,
    slowDuration: z.slowDuration,
    roots: z.roots,
    castSlow: z.castSlow, // item 9
    airborne: z.airborne, // item 8
    allyBuff: z.allyBuff,
  };
}

/** Spawn a synthesized ability's ground zone (centered heal zones / ground-cast). */
function spawnComposedZone(world: World, p: Player, z: ZoneSpec, range: number): void {
  const centered = z.zoneKind === 'sanctuary' || z.zoneKind === 'consecration';
  const pos = centered
    ? { ...p.pos }
    : clampToArena(world, vadd(p.pos, vscale(p.aim, range)), z.radius);
  spawnZone(world, {
    kind: z.zoneKind,
    pos,
    radius: z.radius,
    side: 'player',
    ownerId: p.id,
    damagePerTick: z.tickDamage ?? 0,
    healPerTick: z.tickHeal ?? 0,
    slowMult: z.slowMult,
    slowDuration: z.slowDuration,
    roots: z.roots,
    castSlow: z.castSlow, // item 9
    airborne: z.airborne, // item 8
    allyBuff: z.allyBuff,
    duration: z.duration,
  });
}

/**
 * Resolve a SYNTHESIZED player ability from its component list. Mirrors the
 * canonical per-kind switch but reads the delivery + effects, so a fusion resolves
 * every payload it carries (a projectile that blooms an ally-buff zone on impact;
 * a cleave that also rallies the band). Reuses the canonical helpers and the flat
 * fields (which recompose keeps in sync) for the parts they already express;
 * components drive only the genuinely-new cross-cutting behaviour (buff targeting,
 * on-impact zones). PURE aside from world mutation.
 */
function resolveComposedAbility(
  world: World,
  p: Player,
  ab: PlayerAbilityDef,
  moveDir: Vec2,
  comp: AbilityComponents,
): void {
  const d = comp.delivery;
  const effects = comp.effects;
  const color = CLASS_COLORS[p.classId];
  const aimAngle = angleOf(p.aim);
  const zoneEff = effects.find((e) => e.kind === 'zone');
  const healEff = effects.find((e) => e.kind === 'heal');
  const healOnUse = effects.find((e) => e.kind === 'healOnUse');
  const dmg = ab.damage;

  // item 7 — a flight rider lifts its recipients airborne for its window.
  const flightEff = effects.find((e) => e.kind === 'flight');
  const applyFlight = (target: { buffs: import('../core/types').Buff[] }): void => {
    if (flightEff && flightEff.kind === 'flight') {
      applyBuff(target, makeBuff('flight', 0, flightEff.duration, 'flight'));
    }
  };
  // Buff the caster with any self-targeted buffs, and heal the caster on-use.
  const buffSelf = (): void => {
    applyForgeBuffs(p, effects, 'self', 'forgeSelf');
    applyFlight(p); // flight on a self-buff / mobility delivery lands on the caster
  };
  const selfHeal = (): void => {
    if (healOnUse && healOnUse.kind === 'healOnUse') healPlayer(world, p, p, healOnUse.amount);
  };
  // Rally: put ally-targeted buffs on EVERY ally in reach (the caster included).
  const buffAllies = (range: number): void => {
    const rallies = effects.some((e) => e.kind === 'buff' && e.target === 'allies');
    if (!rallies && !flightEff) return;
    for (const a of aliveAllies(world)) {
      if (dist(p.pos, a.pos) > range) continue;
      applyForgeBuffs(a, effects, 'allies', 'forgeAlly');
      applyFlight(a);
    }
  };
  const healAlly = (range: number): void => {
    if (!healEff || healEff.kind !== 'heal') return;
    const t = lowestHpAllyInRange(world, p.pos, range);
    if (t) healPlayer(world, p, t, healEff.amount);
  };

  switch (d.kind) {
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
          dealt += damageBoss(world, p, b, dmg, world.meleeHit(p, b));
          applyStrikeRiders(world, b, ab);
        }
      }
      for (const a of world.adds) {
        if (a.hp <= 0) continue;
        if (pointInCone(a.pos, p.pos, aimAngle, range, half, a.radius)) {
          dealt += damageAdd(world, p, a, dmg, world.critRoll(p));
          applyStrikeRiders(world, a, ab);
        }
      }
      lifesteal(world, p, ab, dealt);
      buffSelf();
      buffAllies(FORGE_RALLY_RANGE);
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
          dealt += damageBoss(world, p, b, dmg, world.critRoll(p));
          applyStrikeRiders(world, b, ab);
        }
      }
      for (const a of world.adds) {
        if (a.hp <= 0) continue;
        if (pointInCircle(a.pos, p.pos, radius, a.radius)) {
          dealt += damageAdd(world, p, a, dmg, world.critRoll(p));
          applyStrikeRiders(world, a, ab);
        }
      }
      lifesteal(world, p, ab, dealt);
      buffSelf();
      buffAllies(FORGE_RALLY_RANGE);
      break;
    }

    case 'projectile': {
      const count = ab.projCount ?? 1;
      const spread = ((ab.spreadDeg ?? 0) * Math.PI) / 180;
      const speed = ab.projSpeed ?? 600;
      const impactRadius = ab.impactRadius ?? 0;
      const kind: ProjectileKind =
        impactRadius > 0 || zoneEff ? 'fireball' : projectileKindFor(p, 'a1');
      const maxRange = ab.maxRange ?? PROJECTILE_MAX_RANGE;
      const onImpact = zoneEff && zoneEff.kind === 'zone' ? zoneToImpact(zoneEff.zone) : undefined;
      for (let i = 0; i < count; i++) {
        const t = count > 1 ? i / (count - 1) - 0.5 : 0;
        const a = aimAngle + t * spread;
        spawnPlayerProjectile(world, p, kind, fromAngle(a), {
          speed,
          damage: dmg,
          // A shot that carries a zone needs a positive impact radius so it
          // detonates (and blooms the zone) rather than passing through.
          impactRadius: onImpact ? Math.max(impactRadius, onImpact.radius) : impactRadius,
          maxRange,
          slowMult: ab.slowMult,
          slowDuration: ab.slowDuration,
          freeze: ab.freeze,
          castSlow: ab.castSlow, // item 9
          castSlowDuration: ab.castSlowDuration,
          lifesteal: ab.lifestealFrac,
          onImpact,
        });
      }
      buffSelf();
      break;
    }

    case 'groundZone': {
      if (zoneEff && zoneEff.kind === 'zone')
        spawnComposedZone(world, p, zoneEff.zone, ab.range ?? 500);
      buffSelf();
      break;
    }

    case 'dash':
    case 'blink': {
      // item 2: a composed teleport stays instant and passes THROUGH cover; a composed
      // dash glides and stops at cover, its landing slam firing on touchdown (via the
      // stored ab in stepPlayerGlide). A root locks either. The self-buff + component
      // heal fire on use, exactly as before.
      if (isRooted(p)) break;
      if (d.kind === 'blink') {
        const dir = normalize(p.aim);
        const from = { ...p.pos };
        const target = vadd(p.pos, vscale(dir, ab.range ?? 220));
        p.pos = clampToArena(world, target, p.radius);
        if (ab.iframes) applyBuff(p, makeBuff('invuln', 0, ab.iframes, 'dash'));
        world.events.push({ t: 'blink', id: p.id, from, to: { ...p.pos } });
      } else {
        let dir = moveDir;
        if (dir.x === 0 && dir.y === 0) dir = p.aim;
        startGlide(world, p, ab, dir, false); // composed heal handled by selfHeal()
      }
      buffSelf();
      selfHeal();
      break;
    }

    case 'selfBuff': {
      buffSelf();
      selfHeal();
      break;
    }

    case 'buffAlly': {
      const range = ab.range ?? 400;
      emitSkillArea(world, p.id, color, {
        kind: 'circle',
        origin: { ...p.pos },
        angle: 0,
        range: 0,
        radius: range,
        halfAngle: 0,
      });
      buffAllies(range);
      healAlly(range);
      break;
    }

    case 'heal': {
      const range = ab.range ?? 400;
      emitSkillArea(world, p.id, color, {
        kind: 'circle',
        origin: { ...p.pos },
        angle: 0,
        range: 0,
        radius: range,
        halfAngle: 0,
      });
      healAlly(range);
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
      buffSelf();
      selfHeal();
      break;
    }
  }
}

/** Heal the caster for a fraction of the damage a lifesteal ability dealt. */
function lifesteal(world: World, p: Player, ab: PlayerAbilityDef, dealt: number): void {
  if (ab.lifestealFrac && dealt > 0) {
    healPlayer(world, p, p, dealt * ab.lifestealFrac);
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
    roots: ab.roots, // item 9: carry the true-root flag onto the spawned zone
    castSlow: ab.castSlow, // item 9: carry the wind-up-slow factor onto the zone
    airborne: ab.airborne, // item 8: carry the airborne-reach flag onto the zone
    duration: ab.zoneDuration ?? 4,
  });
}

function projectileKindFor(p: Player, slot: ExtSlot): ProjectileKind {
  if (p.classId === 'mage') return slot === 'a1' ? 'fireball' : 'arcaneBolt';
  // item 67: cleric is the only projectile-firing owner of Smite; the paladin kit
  // (and both its subclasses) has no projectile, so the old paladin branch was dead.
  if (p.classId === 'cleric') return 'smite';
  // item 58: the expansion casters' bolts each get their own visual instead of
  // funnelling into the Ranger's green arrow.
  if (p.classId === 'warlock') return 'eldritch';
  if (p.classId === 'sorcerer') return 'chaos';
  if (p.classId === 'bard') return 'sonic';
  if (p.classId === 'druid') return 'thorn';
  // ranger / barbarian / rogue (and any unlisted class) keep the plain arrow.
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
  /** item 9 — wind-up-slow factor (≥ 1) applied on hit (a forged cursed bolt). */
  castSlow?: number;
  castSlowDuration?: number;
  /** Fraction of dealt damage healed back to the owner (Vampiric shots). */
  lifesteal?: number;
  /** Chaos Forge — on-impact payload (spawn a zone / ally-buff area on landing). */
  onImpact?: ProjectileImpact;
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
    castSlow: o.castSlow, // item 9
    castSlowDuration: o.castSlowDuration,
    lifesteal: o.lifesteal,
    onImpact: o.onImpact,
  };
  world.projectiles.push(proj);
  world.events.push({ t: 'projectile', kind, pos: { ...origin } });
}

function applySlow(
  entity: { buffs: import('../core/types').Buff[] },
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

export interface SpawnZoneOpts {
  kind: GroundZone['kind'];
  pos: Vec2;
  radius: number;
  side: GroundZone['side'];
  ownerId: number;
  damagePerTick: number;
  healPerTick: number;
  slowMult?: number;
  slowDuration?: number;
  /** item 9 — a true-root zone (immobilises enemies inside). See GroundZone.roots. */
  roots?: boolean;
  /** Seconds of silence re-applied per tick to opposing creatures inside (a
   * standable antimagic pool). Absent = a plain hazard. See GroundZone.silence. */
  silence?: number;
  /** item 9 — wind-up-time factor (≥ 1) re-applied per tick to opposing creatures
   * inside (Hex / Poison Vial). Absent / ≤ 1 = no cast-slow. See GroundZone.castSlow. */
  castSlow?: number;
  /** item 8 — the zone reaches airborne targets too (Rain of Arrows / Otiluke Bind).
   * Absent = a ground effect flyers hover over (default per kind). See GroundZone.airborne. */
  airborne?: boolean;
  /** Chaos Forge — a buff this zone refreshes on allies inside (player-side). */
  allyBuff?: import('../core/types').ZoneAllyBuff;
  duration: number;
  /** Themed tint override (affix/corruption hazards); falls back to the palette. */
  color?: number;
}

/** Spawn a ground zone. Exported so the World can place affix/corruption hazards
 * (volatile/molten pools, vent eruptions, a healing rift) without duplicating the
 * GroundZone construction. */
export function spawnZone(world: World, o: SpawnZoneOpts): void {
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
    roots: o.roots, // item 9
    silence: o.silence,
    castSlow: o.castSlow, // item 9 — wind-up slow refreshed on enemies inside
    airborne: o.airborne, // item 8 — reaches flyers too
    allyBuff: o.allyBuff, // Chaos Forge — buff refreshed on allies inside
    duration: o.duration,
    remaining: o.duration,
    tickAccum: 0,
    color: o.color,
  };
  world.groundZones.push(zone);
}

// ---------------------------------------------------------------------------
// Boss ability resolution
// ---------------------------------------------------------------------------

/**
 * The shared movement-impulse primitive (item 28): shove `target` `distance`
 * world-units along `dir`, wrapped around the torus. A degenerate direction
 * falls back to +x so an impulse is never a no-op. Knockbacks (push away) and
 * pulls (drag toward) both build on this; terrain surges and boss grabs reuse it.
 */
/** Below this a shove isn't worth animating; above it eases in over SHOVE_TIME. */
const SHOVE_MIN = 24;
const SHOVE_TIME = 0.18;

export function applyImpulse(
  world: World,
  target: {
    pos: Vec2;
    slideOff?: Vec2;
    slideRemaining?: number;
    slideTotal?: number;
  },
  dir: Vec2,
  distance: number,
): void {
  const n = normalize(dir);
  const d = n.x === 0 && n.y === 0 ? { x: 1, y: 0 } : n;
  target.pos = clampToArena(world, vadd(target.pos, vscale(d, distance)));
  // Record a purely-visual slide-IN so the hero travels rather than teleporting
  // (item 28). The authoritative pos above is final; only `playerView` reads this.
  if (distance >= SHOVE_MIN) {
    target.slideOff = { x: -d.x * distance, y: -d.y * distance };
    target.slideRemaining = SHOVE_TIME;
    target.slideTotal = SHOVE_TIME;
  }
}

/**
 * Drag `target` toward `center` by up to `distance`, never overshooting the
 * centre (a pull can't fling you out the far side). Torus-aware. Returns the
 * distance actually moved, so callers can tell how deep the drag went.
 */
export function pullToward(
  world: World,
  target: { pos: Vec2 },
  center: Vec2,
  distance: number,
): number {
  const delta = sub(center, target.pos); // shortest torus vector to the centre
  const d = Math.hypot(delta.x, delta.y);
  if (d < 1e-3) return 0;
  const move = Math.min(distance, d);
  applyImpulse(world, target, delta, move);
  return move;
}

/** Push a player away from `center` by `distance`, wrapped around the arena. */
function knockback(world: World, p: Player, center: Vec2, distance: number): void {
  applyImpulse(world, p, sub(p.pos, center), distance);
}

/**
 * Apply a boss strike's on-hit riders to a player: a frost SLOW, a caster
 * SILENCE (item 28 — a silenced hero can use only their basic attack) and/or a
 * signature PULL that drags the hero toward the boss (the Kraken's tentacle grab
 * from the deep). `pull` and `knockback` are mutually exclusive per ability.
 */
function bossHitRider(world: World, boss: Boss, p: Player, ab: BossAbilityDef): void {
  if (ab.slowMult && ab.slowMult < 1) {
    applyBuff(p, makeBuff('moveSpeed', ab.slowMult, ab.slowDuration ?? 2, 'bossSlow'));
  }
  if (ab.silence && ab.silence > 0) {
    applyBuff(p, makeBuff('silence', 0, ab.silence, 'bossSilence'));
  }
  if (ab.pull && ab.pull > 0) {
    pullToward(world, p, boss.pos, ab.pull);
  }
}

/**
 * Resolve a boss ability's effect at execute time. `action` carries the
 * targeting locked at wind-up start (aimAngle / targetPos / targetId).
 *
 * Returns the total damage dealt to players by this resolution, so the World can
 * drive on-hit affix reactions (a `vampiric` boss heals a fraction of it). AoE
 * DoTs (void zones) and channels return 0 here — those tick later.
 */
export function resolveBossAbility(
  world: World,
  boss: Boss,
  ab: BossAbilityDef,
  action: BossAction,
): number {
  // Boss offensive self-buffs (War Cry / Frenzy / Power of Night…) empower its
  // hits; twin bosses swing at a fraction of solo strength (dmgScale).
  const dmg =
    ab.damage * world.bossDamageScalar() * (boss.dmgScale ?? 1) * buffMult(boss, 'damageDealt');
  const alivePlayers = world.players.filter((p) => p.state === 'alive');
  let dealtToPlayers = 0;

  world.events.push({
    t: 'cast',
    ability: ab.name,
    sourceId: boss.id,
    pos: { ...boss.pos },
    side: 'boss',
    // item 63: carry the telegraph shape + damage so the FX layer can weigh the
    // cast-shake from data (any heavy expansion windup shakes, no fx.ts edit).
    shape: ab.shape,
    damage: ab.damage,
  });

  switch (ab.shape) {
    case 'cone': {
      const range = ab.range ?? 300;
      const half = ((ab.halfAngleDeg ?? 30) * Math.PI) / 180;
      for (const p of alivePlayers) {
        if (pointInCone(p.pos, boss.pos, action.aimAngle, range, half, p.radius)) {
          dealtToPlayers += damagePlayer(world, p, dmg);
          bossHitRider(world, boss, p, ab);
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
          dealtToPlayers += damagePlayer(world, p, dmg);
          bossHitRider(world, boss, p, ab);
        }
      }
      world.events.push({ t: 'telegraph', pos: center, shape: 'circle' });
      break;
    }

    case 'pbaoe': {
      const radius = ab.radius ?? 160;
      for (const p of alivePlayers) {
        if (pointInCircle(p.pos, boss.pos, radius, p.radius)) {
          dealtToPlayers += damagePlayer(world, p, dmg);
          if (ab.knockback) knockback(world, p, boss.pos, ab.knockback);
          bossHitRider(world, boss, p, ab);
          if (ab.stun) applyStun(world, p, ab.stun, 'bossStun');
        }
      }
      world.events.push({ t: 'telegraph', pos: { ...boss.pos }, shape: 'circle' });
      break;
    }

    case 'line': {
      // Charge: dash from boss to the locked target position, hitting anyone
      // along the path, then relocate the boss to the target.
      // item 9: a rooted boss can't charge — the whole dash (its path damage AND the
      // relocation) fizzles while the roots hold.
      if (isRooted(boss)) break;
      const from = { ...boss.pos };
      let to = action.targetPos ?? vadd(boss.pos, fromAngle(action.aimAngle, ab.range ?? 600));
      // item 2: parity with the hero dash — a charge can't tunnel through TALL cover.
      // It stops flush at the first pillar/monolith/crystal along its path (both its
      // path damage and its relocation end there), while still trampling low rubble.
      const chargeStop = firstObstacleStop(world, from, to, boss.radius, true);
      if (chargeStop) to = chargeStop;
      const halfWidth = (ab.width ?? 45) + boss.radius * 0.5;
      for (const p of alivePlayers) {
        if (pointInSegment(p.pos, from, to, halfWidth, p.radius)) {
          dealtToPlayers += damagePlayer(world, p, dmg);
          if (ab.knockback) knockback(world, p, from, ab.knockback);
          bossHitRider(world, boss, p, ab);
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
      // item 58: every boss bolt used to render as the Lich's purple shadow bolt.
      // Keep the shadowBolt shape/trail but tint it by the firing boss's own colour
      // so, e.g., a Kobold's fire spark and a Kraken's brine bolt read apart in a
      // twin fight. `defOf` resolves the acting boss's def (twins included).
      const projColor = world.defOf(boss).color;
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
          color: projColor,
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
          // A void ability can stamp a signature zone kind (an antimagic silence
          // pool); it defaults to the plain damaging void.
          kind: ab.zoneKind ?? 'voidZone',
          pos,
          radius: ab.radius ?? 90,
          side: 'boss',
          ownerId: boss.id,
          damagePerTick:
            (ab.zoneTickDamage ?? 12) * world.bossDamageScalar() * (boss.dmgScale ?? 1),
          healPerTick: 0,
          slowMult: ab.slowMult,
          slowDuration: ab.slowDuration,
          silence: ab.zoneSilence,
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
      // item 7 — a periodic take-off: the boss soars, shrugging off ground zones.
      if (ab.buffFlight) applyBuff(boss, makeBuff('flight', 0, ab.buffFlight, 'flight'));
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

  return dealtToPlayers;
}

/**
 * One Life-Drain tick: damage the locked target (if in range) and heal boss.
 * Returns the damage dealt so the World can drive a `vampiric` affix on top of
 * the ability's own `healSelf`.
 */
export function beamTick(world: World, boss: Boss, ab: BossAbilityDef, action: BossAction): number {
  const target =
    action.targetId != null
      ? world.players.find((p) => p.id === action.targetId && p.state === 'alive')
      : null;
  if (!target) return 0;
  if (dist(boss.pos, target.pos) > (ab.range ?? 500)) return 0; // out-ranged: broken
  const dealt = damagePlayer(
    world,
    target,
    ab.damage * world.bossDamageScalar() * (boss.dmgScale ?? 1) * buffMult(boss, 'damageDealt'),
  );
  if (ab.healSelf) healBoss(boss, dealt);
  return dealt;
}

// re-export for convenience / potential external tuning
export { PLAYER_RADIUS };
export type { Vec2, Add, BuffKind };
export { withLength };
