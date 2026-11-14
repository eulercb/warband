import { reflectiveWard } from '../content/reflectionRules';
/** Recipient-bound, one-contact reflection; returned damage is borrowed, never a direct cast. */
import type { World } from '../world/world';
import type { Player, Projectile } from '../core/types';
import type { PlayerAbilityDef } from '../content/classes';
import { abilityForSlot } from './abilities';
import { damageAdd, damageBoss, hasBuff } from './combat';
import { hostileAdd } from './whispers';
import { dist } from '../core/torus';
export function reflectionView(w: World, target: Player) {
  const r = target.reflectionWard;
  const owner = r && w.players.find((p) => p.id === r.ownerId);
  if (
    !r ||
    r.remaining <= 0 ||
    w.finished ||
    w.scene !== null ||
    target.state !== 'alive' ||
    target.hp <= 0 ||
    !owner ||
    owner.state !== 'alive' ||
    owner.hp <= 0 ||
    owner.classId !== r.ownerClass ||
    (owner.castEpoch ?? 0) !== r.epoch ||
    abilityForSlot(owner, r.slot) !== r.source ||
    !reflectiveWard(r.source)
  )
    return undefined;
  return { remaining: r.remaining };
}
export function armReflection(w: World, owner: Player, target: Player, ab: PlayerAbilityDef): void {
  if (!reflectiveWard(ab) || reflectionView(w, target)) return;
  const source = abilityForSlot(owner, ab.slot);
  if (!source) return;
  target.reflectionWard = {
    ownerId: owner.id,
    ownerClass: owner.classId,
    epoch: owner.castEpoch ?? 0,
    slot: ab.slot,
    source,
    remaining: 4,
  };
}
export function advanceReflection(w: World, dt: number): void {
  for (const p of w.players)
    if (p.reflectionWard) {
      p.reflectionWard.remaining -= dt;
      if (!reflectionView(w, p)) delete p.reflectionWard;
    }
}
export function canReflect(w: World, p: Player, shot: Projectile): boolean {
  return (
    !!reflectionView(w, p) &&
    !hasBuff(p, 'invuln') &&
    shot.side === 'boss' &&
    shot.damage > 0 &&
    shot.rangeLeft > 0 &&
    shot.lifetime > 0 &&
    Math.hypot(shot.vel.x, shot.vel.y) > 0
  );
}
export function reflectContact(w: World, p: Player, shot: Projectile): boolean {
  if (!canReflect(w, p, shot)) return false;
  const ownerId = p.reflectionWard!.ownerId;
  delete p.reflectionWard;
  // Keep the same vehicle and its actual remaining budgets; discard hostile/direct riders.
  const returned: Projectile = {
    id: shot.id,
    kind: shot.kind,
    pos: { ...shot.pos },
    vel: { x: -shot.vel.x, y: -shot.vel.y },
    side: 'player',
    ownerId,
    damage: shot.damage,
    hitRadius: shot.hitRadius,
    impactRadius: shot.impactRadius,
    rangeLeft: shot.rangeLeft,
    lifetime: shot.lifetime,
    reflected: true,
  };
  for (const key of Object.keys(shot)) delete (shot as unknown as Record<string, unknown>)[key];
  Object.assign(shot, returned);
  w.events.push({ t: 'reflection', pos: { ...shot.pos } });
  return true;
}
export function resolveReflected(w: World, shot: Projectile): boolean {
  const owner = w.players.find((p) => p.id === shot.ownerId);
  if (!owner) return true;
  const target = [...w.aliveBosses(), ...w.adds.filter(hostileAdd)].find(
    (e) => dist(e.pos, shot.pos) <= e.radius + shot.hitRadius,
  );
  if (!target) return false;
  const targets =
    shot.impactRadius > 0
      ? [...w.aliveBosses(), ...w.adds.filter(hostileAdd)].filter(
          (e) => dist(e.pos, shot.pos) <= shot.impactRadius + e.radius,
        )
      : [target];
  for (const foe of targets) {
    if ('monsterId' in foe) damageBoss(w, owner, foe, shot.damage, { borrowed: true });
    else damageAdd(w, owner, foe, shot.damage, { borrowed: true });
  }
  if (shot.impactRadius > 0)
    w.events.push({
      t: 'skillArea',
      sourceId: owner.id,
      side: 'player',
      color: 0xffe690,
      area: {
        kind: 'circle',
        origin: { ...shot.pos },
        angle: 0,
        range: 0,
        radius: shot.impactRadius,
        halfAngle: 0,
      },
    });
  return true;
}
