/** Two physical legs share their paid damage and cast tokens. */
import type { World } from '../world/world';
import type { Player, Projectile } from '../core/types';
import type { PlayerAbilityDef } from '../content/classes';
import { resolvedReturningShot } from '../content/classes';
import { RETURNING_DISTANCE } from '../content/returningRules';
import { abilityForSlot } from './abilities';
import { dist, sub, pointInSegment } from '../core/torus';
export function armReturningShot(p: Player, shot: Projectile, ab: PlayerAbilityDef): void {
  if (!resolvedReturningShot(ab) || shot.impactRadius > 0 || shot.onImpact) return;
  const source = abilityForSlot(p, ab.slot);
  if (!source) return;
  shot.damage *= 0.5;
  shot.hitIds = [];
  const hits = 1 + Math.max(0, ab.pierce ?? 0);
  shot.returningShot = {
    phase: 'out',
    turnFlash: 0,
    outLeft: Math.min(RETURNING_DISTANCE, shot.rangeLeft / 2),
    hitsLeft: hits,
    hitsPerLeg: hits,
    ownerClass: p.classId,
    slot: ab.slot,
    source,
  };
}
/** Undefined means the owner/cast is gone or the return was caught. */
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
  r.turnFlash = Math.max(0, r.turnFlash - dt);
  if (shot.apertureTransit) return dt;
  if (r.phase === 'out' && r.outLeft <= 1e-6) {
    r.phase = 'back';
    r.turnFlash = 0.12;
    r.hitsLeft = r.hitsPerLeg;
    shot.hitIds = [];
  }
  const speed = Math.hypot(shot.vel.x, shot.vel.y);
  if (r.phase === 'back') {
    const d = sub(owner.pos, shot.pos),
      length = dist(owner.pos, shot.pos);
    if (length <= owner.radius + shot.hitRadius) return undefined;
    shot.vel = { x: (d.x / length) * speed, y: (d.y / length) * speed };
    return speed > 0 ? Math.min(dt, (length - owner.radius - shot.hitRadius + 1) / speed) : dt;
  }
  return speed > 0 ? Math.min(dt, r.outLeft / speed) : dt;
}
export function returningCaught(w: World, shot: Projectile, from: Projectile['pos']): boolean {
  if (shot.returningShot?.phase !== 'back') return false;
  const owner = w.players.find((p) => p.id === shot.ownerId);
  return !!owner && pointInSegment(owner.pos, from, shot.pos, owner.radius + shot.hitRadius);
}
