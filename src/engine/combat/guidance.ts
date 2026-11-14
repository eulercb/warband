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
import { dist, wrapCoord, sub } from '../core/torus';
import { hasBuff } from './combat';
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
    origin: ab.guidanceOrigin,
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
    if (p.phaseOrigin) {
      p.phaseOrigin.remaining -= dt;
      if (!originLive(w, p)) delete p.phaseOrigin;
    }
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
    const target = steeringAngle(p, c);
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
  return { remaining: c.remaining, angle: c.angle + (q.spreadOffset ?? 0) };
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
    origin: ab.guidanceOrigin,
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
      const target = steeringAngle(p, c),
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
      },
    ];
  });
}

const ORIGIN_DURATION = 4;
const ORIGIN_TETHER = 600;
export function aimPoint(p: Player): Vec2 {
  return p.aimPoint ?? { x: p.pos.x + p.aim.x * 400, y: p.pos.y + p.aim.y * 400 };
}
function originLive(w: World, p: Player): boolean {
  const o = p.phaseOrigin;
  return (
    !!o &&
    !w.finished &&
    w.scene === null &&
    p.state === 'alive' &&
    p.hp > 0 &&
    o.remaining > 0 &&
    o.epoch === (p.castEpoch ?? 0) &&
    abilityForSlot(p, o.slot) === o.source &&
    guideRelay(o.source) &&
    dist(p.pos, o.pos) <= ORIGIN_TETHER
  );
}
export function armPhaseOrigin(w: World, p: Player, ab: PlayerAbilityDef, from: Vec2): void {
  if (!guideRelay(ab) || dist(from, p.pos) < 0.001) return;
  delete p.phaseOrigin;
  if (ab.guidanceOriginFresh === false) return;
  const source = abilityForSlot(p, ab.slot);
  if (!source) return;
  p.phaseOrigin = {
    pos: { ...from },
    remaining: ORIGIN_DURATION,
    source,
    slot: ab.slot,
    epoch: p.castEpoch ?? 0,
  };
  w.events.push({ t: 'phaseOrigin', from: { ...from }, to: { ...p.pos } });
}
export function takeGuidanceOrigin(w: World, p: Player, ab: PlayerAbilityDef): Vec2 | undefined {
  if (!(guidedSpell(ab) || guidedBurst(ab)) || !originLive(w, p)) return undefined;
  const pos = { ...p.phaseOrigin!.pos };
  delete p.phaseOrigin;
  const direction = sub(aimPoint(p), pos),
    length = Math.hypot(direction.x, direction.y);
  ab.flowAim = length > 0.001 ? { x: direction.x / length, y: direction.y / length } : { ...p.aim };
  return pos;
}
export function tryDiscardOrigin(w: World, p: Player, slot: ExtSlot, fresh: boolean): boolean {
  if (!originLive(w, p) || p.phaseOrigin!.slot !== slot || (p.cooldowns[slot] ?? 0) <= 0)
    return false;
  if (fresh) delete p.phaseOrigin;
  return true;
}
export function originView(w: World, p: Player) {
  if (!originLive(w, p)) return undefined;
  return {
    pos: { ...p.phaseOrigin!.pos },
    target: aimPoint(p),
    remaining: p.phaseOrigin!.remaining,
    slot: p.phaseOrigin!.slot,
  };
}
function steeringAngle(p: Player, c: GuidanceCast): number {
  const d = c.origin ? sub(aimPoint(p), c.origin) : p.aim;
  return Math.hypot(d.x, d.y) > 0.001 ? Math.atan2(d.y, d.x) : c.angle;
}
