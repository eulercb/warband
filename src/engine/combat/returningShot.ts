/** Continuous cast-relative coordinates prevent wrong-image catches and forward laps. */
import type { World } from '../world/world';
import type { Player, Projectile, Vec2 } from '../core/types';
import type { PlayerAbilityDef } from '../content/classes';
import { resolvedReturningShot } from '../content/classes';
import { RETURNING_DAMAGE_PER_LEG, returningTrajectory } from '../content/returningRules';
import { abilityForSlot } from './abilities';
import { sub } from '../core/torus';
import { pointInSegment } from '../core/math';
export function armReturningShot(p: Player, shot: Projectile, ab: PlayerAbilityDef): void {
  if (!resolvedReturningShot(ab) || shot.impactRadius > 0 || shot.onImpact) return;
  const source = abilityForSlot(p, ab.slot);
  if (!source) return;
  const path = returningTrajectory(shot.rangeLeft, Math.hypot(shot.vel.x, shot.vel.y));
  shot.damage *= RETURNING_DAMAGE_PER_LEG;
  shot.hitIds = [];
  shot.rangeLeft = path.outward;
  const hits = 1 + Math.max(0, ab.pierce ?? 0);
  shot.returningShot = {
    phase: 'out',
    turnFlash: 0,
    outLeft: path.outward,
    hitsLeft: hits,
    hitsPerLeg: hits,
    ownerClass: p.classId,
    slot: ab.slot,
    source,
    ...path,
    shotPos: { ...shot.pos },
    ownerPos: { ...p.pos },
    lastOwner: { ...p.pos },
  };
}
/** Every actual physical segment (including a conduit exit) contributes once. */
export function advanceReturningPosition(shot: Projectile, delta: Vec2): void {
  const r = shot.returningShot;
  if (!r) return;
  r.shotPos.x += delta.x;
  r.shotPos.y += delta.y;
  if (r.phase === 'out') r.outLeft -= Math.hypot(delta.x, delta.y);
}
/** Turn before an exhausted outward budget can be discarded by ordinary expiry. */
export function finishReturningStep(shot: Projectile): boolean {
  const r = shot.returningShot;
  if (
    !r ||
    r.phase !== 'out' ||
    shot.apertureTransit ||
    (r.outLeft > 1e-6 && shot.rangeLeft > 1e-6 && shot.lifetime > 1e-6)
  )
    return false;
  r.phase = 'back';
  r.turnFlash = 0.12;
  r.hitsLeft = r.hitsPerLeg;
  shot.hitIds = [];
  shot.rangeLeft = r.backRange;
  shot.lifetime = r.backLifetime;
  const dx = r.ownerPos.x - r.shotPos.x,
    dy = r.ownerPos.y - r.shotPos.y,
    length = Math.hypot(dx, dy) || 1;
  shot.vel = { x: (dx / length) * r.backSpeed, y: (dy / length) * r.backSpeed };
  return true;
}
export function prepareReturningStep(w: World, shot: Projectile, dt: number): number | undefined {
  const r = shot.returningShot;
  if (!r) return dt;
  const owner = w.players.find((p) => p.id === shot.ownerId);
  if (
    w.finished ||
    w.scene !== null ||
    !owner ||
    owner.state !== 'alive' ||
    owner.hp <= 0 ||
    owner.classId !== r.ownerClass ||
    abilityForSlot(owner, r.slot) !== r.source ||
    !resolvedReturningShot(r.source)
  )
    return undefined;
  const delta = sub(owner.pos, r.lastOwner);
  r.ownerPos.x += delta.x;
  r.ownerPos.y += delta.y;
  r.lastOwner = { ...owner.pos };
  r.turnFlash = Math.max(0, r.turnFlash - dt);
  if (shot.apertureTransit) return dt;
  finishReturningStep(shot);
  const speed = Math.hypot(shot.vel.x, shot.vel.y);
  if (r.phase === 'back') {
    const dx = r.ownerPos.x - r.shotPos.x,
      dy = r.ownerPos.y - r.shotPos.y,
      length = Math.hypot(dx, dy);
    if (length <= owner.radius + shot.hitRadius) return undefined;
    shot.vel = { x: (dx / length) * speed, y: (dy / length) * speed };
    return speed > 0 ? Math.min(dt, (length - owner.radius - shot.hitRadius + 1) / speed) : dt;
  }
  return speed > 0 ? Math.min(dt, r.outLeft / speed) : dt;
}
export function returningCaught(w: World, shot: Projectile, from: Vec2): boolean {
  const r = shot.returningShot;
  if (r?.phase !== 'back') return false;
  const owner = w.players.find((p) => p.id === shot.ownerId);
  if (!owner) return false;
  const start = { x: r.shotPos.x - (shot.pos.x - from.x), y: r.shotPos.y - (shot.pos.y - from.y) };
  return pointInSegment(r.ownerPos, start, r.shotPos, owner.radius + shot.hitRadius);
}
