import { boundedAbility } from '../content/abilityLimits';
/** Steering changes heading only; collision, travel budgets and hit provenance remain ordinary. */
import type { World } from '../world/world';
import type { Player, Projectile, GuidanceCast, ExtSlot, Vec2 } from '../core/types';
import type { PlayerAbilityDef } from '../content/classes';
import { guidedSpell, GUIDANCE_DURATION, GUIDANCE_TURN_RATE } from '../content/guidanceRules';
import {
  guidedBurst,
  guideRelay,
  GUIDED_BURST_RANGE,
  GUIDED_BURST_SPEED,
  GUIDED_BURST_MIN,
  GUIDED_BURST_PREMIUM,
} from '../content/guidanceRules';
import { dist, wrapCoord } from '../core/torus';
import { hasBuff } from './combat';
import { blinkArrival } from './warding';
import { abilityForSlot, resolveBurstAt } from './abilities';
function live(w: World, p: Player, c: GuidanceCast): boolean {
  return (
    !w.finished &&
    w.scene === null &&
    p.state === 'alive' &&
    p.hp > 0 &&
    p.classId === c.ownerClass &&
    c.ownerEpoch === (p.castEpoch ?? 0) &&
    abilityForSlot(p, c.slot) === c.source &&
    (guidedSpell(c.source) || guidedBurst(c.source))
  );
}
export function launchGuidance(
  w: World,
  p: Player,
  ab: PlayerAbilityDef,
  slot: ExtSlot,
  aim: Vec2,
): GuidanceCast | undefined {
  if (!guidedSpell(ab)) return undefined;
  const source = abilityForSlot(p, slot);
  if (!source) return undefined;
  const c: GuidanceCast = {
    source,
    ownerEpoch: p.castEpoch ?? 0,
    ownerClass: p.classId,
    ownerId: p.id,
    slot,
    remaining: GUIDANCE_DURATION,
    angle: Math.atan2(aim.y, aim.x),
    activeTick: -1,
  };
  p.guidance = c;
  w.events.push({ t: 'spellGuidance', pos: { ...p.pos } });
  return c;
}
export function advanceGuidance(w: World, dt: number): void {
  for (const p of w.players) {
    const c = p.guidance;
    if (!c || c.burst) continue;
    if (
      !live(w, p, c) ||
      c.remaining <= 0 ||
      !w.projectiles.some((q) => q.guidance === c && !q.apertureTransit)
    ) {
      delete p.guidance;
      continue;
    }
    const elapsed = Math.min(dt, c.remaining);
    const target = Math.hypot(p.aim.x, p.aim.y) > 0.001 ? Math.atan2(p.aim.y, p.aim.x) : c.angle;
    const delta = Math.atan2(Math.sin(target - c.angle), Math.cos(target - c.angle));
    c.angle += Math.max(
      -GUIDANCE_TURN_RATE * elapsed,
      Math.min(GUIDANCE_TURN_RATE * elapsed, delta),
    );
    c.remaining = Math.max(0, c.remaining - dt);
    c.activeTick = w.tick;
  }
  advanceBursts(w, dt);
}
export function steerProjectile(w: World, q: Projectile): void {
  const c = q.guidance,
    p = c && w.players.find((p) => p.id === c.ownerId);
  if (!c || !p || p.guidance !== c || c.activeTick !== w.tick || !live(w, p, c)) return;
  const speed = Math.hypot(q.vel.x, q.vel.y),
    angle = c.angle + (q.spreadOffset ?? 0);
  q.vel = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
}
export function guidanceView(w: World, p: Player) {
  const c = p.guidance;
  if (
    !c ||
    c.remaining <= 0 ||
    !live(w, p, c) ||
    !(c.burst
      ? w.guidedBursts.includes(c)
      : w.projectiles.some((q) => q.guidance === c && !q.apertureTransit))
  )
    return undefined;
  return { remaining: c.remaining, slot: c.slot, angle: c.angle, name: c.source.name };
}
export function guidedProjectileView(w: World, q: Projectile) {
  const c = q.guidance,
    p = c && w.players.find((p) => p.id === c.ownerId);
  if (!c || !p || p.guidance !== c || !guidanceView(w, p)) return undefined;
  return { remaining: c.remaining, angle: c.angle + (q.spreadOffset ?? 0), relayed: c.relayed };
}

export function launchGuidedBurst(
  w: World,
  p: Player,
  ab: PlayerAbilityDef,
  origin: Vec2,
): boolean {
  if (!guidedBurst(ab)) return false;
  const source = abilityForSlot(p, ab.slot);
  if (!source) return false;
  const c: GuidanceCast = {
    source,
    ownerId: p.id,
    ownerClass: p.classId,
    ownerEpoch: p.castEpoch ?? 0,
    slot: ab.slot,
    angle: Math.atan2((ab.flowAim ?? p.aim).y, (ab.flowAim ?? p.aim).x),
    remaining: GUIDANCE_DURATION,
    activeTick: -1,
    burst: {
      id: w.allocId(),
      pos: { ...origin },
      travelLeft: GUIDED_BURST_RANGE,
      payload: { ...ab, damage: ab.damage * GUIDED_BURST_PREMIUM },
      age: 0,
      requested: false,
    },
  };
  w.guidedBursts.push(c);
  p.guidance = c;
  w.events.push({ t: 'spellGuidance', pos: { ...origin } });
  return true;
}
function advanceBursts(w: World, dt: number): void {
  const keep: GuidanceCast[] = [];
  for (const c of w.guidedBursts) {
    const p = w.players.find((p) => p.id === c.ownerId),
      b = c.burst!;
    if (!p || !live(w, p, c)) {
      if (p?.guidance === c) delete p.guidance;
      continue;
    }
    const elapsed = Math.min(
      dt,
      c.remaining,
      b.requested ? Math.max(0, GUIDED_BURST_MIN - b.age) : Infinity,
    );
    if (p.guidance === c) {
      const target = Math.hypot(p.aim.x, p.aim.y) > 0.001 ? Math.atan2(p.aim.y, p.aim.x) : c.angle,
        delta = Math.atan2(Math.sin(target - c.angle), Math.cos(target - c.angle));
      c.angle += Math.max(
        -GUIDANCE_TURN_RATE * elapsed,
        Math.min(GUIDANCE_TURN_RATE * elapsed, delta),
      );
    }
    const move = Math.min(b.travelLeft, GUIDED_BURST_SPEED * elapsed);
    b.pos = {
      x: wrapCoord(b.pos.x + Math.cos(c.angle) * move, w.arena.w),
      y: wrapCoord(b.pos.y + Math.sin(c.angle) * move, w.arena.h),
    };
    b.travelLeft = Math.max(0, b.travelLeft - move);
    b.age += elapsed;
    c.remaining = Math.max(0, c.remaining - elapsed);
    if (c.remaining <= 0 || (b.requested && b.age + 1e-9 >= GUIDED_BURST_MIN)) {
      if (p.guidance === c) delete p.guidance;
      resolveBurstAt(w, p, b.payload, b.pos);
    } else keep.push(c);
  }
  w.guidedBursts = keep;
}
function burstBlocked(p: Player): string | null {
  return hasBuff(p, 'silence')
    ? 'Silenced'
    : hasBuff(p, 'stun')
      ? 'Stunned'
      : p.castTimer > 0
        ? 'Casting'
        : p.glide || p.shove
          ? 'Moving'
          : null;
}
export function tryDetonateBurst(w: World, p: Player, slot: ExtSlot, fresh: boolean): boolean {
  const c = w.guidedBursts.find((c) => c.ownerId === p.id && c.slot === slot && live(w, p, c));
  if (!c) return false;
  if (fresh && !burstBlocked(p)) {
    c.burst!.requested = true;
    if (c.burst!.age + 1e-9 >= GUIDED_BURST_MIN) {
      w.guidedBursts = w.guidedBursts.filter((other) => other !== c);
      if (p.guidance === c) delete p.guidance;
      resolveBurstAt(w, p, c.burst!.payload, c.burst!.pos);
    }
  }
  return true;
}
export function burstControls(w: World, p: Player) {
  return w.guidedBursts
    .filter((c) => c.ownerId === p.id && live(w, p, c))
    .map((c) => ({
      slot: c.slot,
      remaining: c.remaining,
      queued: c.burst!.requested,
      blocked: burstBlocked(p),
    }));
}
export function burstViews(w: World) {
  return w.guidedBursts.flatMap((c) => {
    const p = w.players.find((p) => p.id === c.ownerId);
    if (!p || !live(w, p, c)) return [];
    return [
      {
        id: c.burst!.id,
        ownerId: p.id,
        pos: { ...c.burst!.pos },
        radius: c.burst!.payload.radius ?? 150,
        remaining: c.remaining,
        angle: c.angle,
        queued: c.burst!.requested,
        guided: p.guidance === c,
        relayed: c.relayed,
      },
    ];
  });
}
function relayPlan(w: World, p: Player, to: Vec2, aim: Vec2) {
  const c = p.guidance;
  if (!c || !live(w, p, c) || c.remaining <= 0 || c.relayed) return undefined;
  const angle = Math.atan2(aim.y, aim.x);
  if (c.burst) {
    const distance = dist(c.burst.pos, to);
    return {
      c,
      angle,
      available: c.burst.travelLeft + 1e-9 >= distance,
      burst: { pos: to, distance },
      shots: [],
    };
  }
  const shots = w.projectiles
    .filter((q) => q.guidance === c && !q.apertureTransit && q.rangeLeft > 0 && q.lifetime > 0)
    .map((q) => {
      const a = angle + (q.spreadOffset ?? 0),
        pos = {
          x: wrapCoord(to.x + Math.cos(a) * (p.radius + 4), w.arena.w),
          y: wrapCoord(to.y + Math.sin(a) * (p.radius + 4), w.arena.h),
        };
      return { q, pos, distance: dist(q.pos, pos) };
    });
  if (!shots.length) return undefined;
  return {
    c,
    angle,
    available: shots.every((s) => s.q.rangeLeft + 1e-9 >= s.distance),
    shots,
    burst: undefined,
  };
}
export function relayGuidance(w: World, p: Player, ab: PlayerAbilityDef, from: Vec2): void {
  if (!guideRelay(ab) || ab.guidanceRelayFresh === false || dist(from, p.pos) < 0.001) return;
  const plan = relayPlan(w, p, p.pos, ab.flowAim ?? p.aim);
  if (!plan?.available) return;
  w.events.push({
    t: 'spellRelay',
    from: { ...(plan.c.burst?.pos ?? plan.shots[0].q.pos) },
    to: { ...p.pos },
  });
  plan.c.relayed = true;
  plan.c.angle = plan.angle;
  if (plan.burst) {
    plan.c.burst!.pos = { ...plan.burst.pos };
    plan.c.burst!.travelLeft = Math.max(0, plan.c.burst!.travelLeft - plan.burst.distance);
  }
  for (const { q, pos, distance } of plan.shots) {
    const speed = Math.hypot(q.vel.x, q.vel.y),
      angle = plan.angle + (q.spreadOffset ?? 0);
    q.pos = pos;
    q.rangeLeft = Math.max(0, q.rangeLeft - distance);
    q.vel = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
  }
}
export function relayViews(w: World, p: Player) {
  const out: Partial<Record<ExtSlot, { available: boolean }>> = {};
  for (const slot of ['a1', 'a2', 'a3', 'sub1', 'sub2'] as ExtSlot[]) {
    const ab = abilityForSlot(p, slot);
    if (!ab || !guideRelay(ab)) continue;
    const plan = relayPlan(w, p, blinkArrival(w, p, boundedAbility(ab, w.arena)), p.aim);
    if (plan) out[slot] = { available: plan.available };
  }
  return out;
}
