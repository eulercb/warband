/** One-way bodily exclusion. This never participates in attack/cover queries. */
import type { World } from '../world/world';
import type { GroundZone, Player, RefugeSource, Vec2 } from '../core/types';
import type { PlayerAbilityDef } from '../content/classes';
import { refugeField } from '../content/refugeRules';
import { abilityForSlot, applyImpulse, firstObstacleStop } from './abilities';
import { dist, sub, wrapPos } from '../core/torus';
import { circleEntry } from './infernalAperture';
import { damageAdd, damageBoss, isFlying, zoneReachesAir } from './combat';
import { SHOVE_MIN } from '../core/constants';
import { isSteadfast } from './defense';
import { hostileAdd } from './whispers';
export function reserveRefuge(
  _w: World,
  p: Player,
  ab: PlayerAbilityDef,
): RefugeSource | undefined {
  const source = abilityForSlot(p, ab.slot);
  return refugeField(ab) && source
    ? { source, slot: ab.slot, ownerClass: p.classId, epoch: p.castEpoch ?? 0, remaining: 4 }
    : undefined;
}
export function refugeLive(w: World, z: GroundZone): boolean {
  const r = z.refuge,
    p = w.players.find((p) => p.id === z.ownerId);
  return (
    !!r &&
    r.remaining > 0 &&
    z.remaining > 0 &&
    (z.armRemaining ?? 0) <= 0 &&
    z.side === 'player' &&
    z.healPerTick > 0 &&
    !z.zoneFollow &&
    !w.finished &&
    w.scene === null &&
    !!p &&
    p.state === 'alive' &&
    p.hp > 0 &&
    p.classId === r.ownerClass &&
    (p.castEpoch ?? 0) === r.epoch &&
    abilityForSlot(p, r.slot) === r.source &&
    refugeField(r.source)
  );
}
export function tickRefuges(w: World, dt: number): void {
  for (const z of w.groundZones)
    if (z.refuge) {
      if ((z.armRemaining ?? 0) > 0) continue;
      z.refuge.remaining = Math.max(0, z.refuge.remaining - dt);
      if (!refugeLive(w, z)) delete z.refuge;
    }
}
export function refugeViews(w: World) {
  return w.groundZones
    .filter((z) => refugeLive(w, z))
    .map((z) => ({
      id: z.id,
      pos: { ...z.pos },
      radius: Math.min(180, z.radius),
      remaining: Math.min(z.remaining, z.refuge!.remaining),
    }));
}
export function registerRefuge(w: World, z: GroundZone): void {
  if (!z.refuge) return;
  for (const other of w.groundZones)
    if (other !== z && other.ownerId === z.ownerId) delete other.refuge;
}
/** Displace occupants through normal enemy shove movement, including rooted foes. */
const paidExpulsions = new WeakMap<GroundZone, Set<number>>();

export function expelRefugeOccupants(w: World): void {
  const fields = w.groundZones.filter((z) => refugeLive(w, z));
  if (!fields.length) return;
  for (const foe of [...w.aliveBosses(), ...w.adds.filter(hostileAdd)]) {
    if (foe.shove || foe.maneuverMotion || isSteadfast(foe)) continue;
    for (const z of fields) {
      const offset = sub(foe.pos, z.pos);
      const distance = Math.hypot(offset.x, offset.y);
      const radius = Math.min(180, z.radius) + foe.radius;
      if (distance >= radius - 1e-5) continue;
      const outward =
        distance > 1e-5 ? Math.atan2(offset.y, offset.x) : ((foe.id % 8) * Math.PI) / 4;
      // Prefer the shortest outward route. Try nearby angles when cover blocks it.
      for (const turn of [0, 1, -1, 2, -2, 3, -3, 4]) {
        const angle = outward + (turn * Math.PI) / 4;
        const direction = { x: Math.cos(angle), y: Math.sin(angle) };
        const projection = offset.x * direction.x + offset.y * direction.y;
        const length = Math.max(
          SHOVE_MIN,
          Math.sqrt(projection ** 2 + (radius + 4) ** 2 - distance ** 2) - projection,
        );
        const end = { x: foe.pos.x + direction.x * length, y: foe.pos.y + direction.y * length };
        if (firstObstacleStop(w, foe.pos, end, foe.radius, false)) continue;
        applyImpulse(w, foe, direction, length);
        foe.buffs = foe.buffs.filter((buff) => buff.kind !== 'root');
        const paid = paidExpulsions.get(z) ?? new Set<number>();
        const owner = w.players.find((p) => p.id === z.ownerId);
        if (owner && z.damagePerTick > 0 && !paid.has(foe.id)) {
          if ('monsterId' in foe) {
            if (!w.bossFlying(foe) || zoneReachesAir(z)) damageBoss(w, owner, foe, z.damagePerTick);
          } else if (!isFlying(foe) || zoneReachesAir(z)) {
            damageAdd(w, owner, foe, z.damagePerTick);
          }
          paid.add(foe.id);
          paidExpulsions.set(z, paid);
        }
        break;
      }
      break;
    }
  }
}

/** Only actual hostile bodies are excluded. */
export function refugeHostile(w: World, body: { pos: Vec2; radius: number }): boolean {
  const boss = w.aliveBosses().find((e) => e === body);
  if (boss) return true;
  const add = w.adds.find((e) => e === body);
  return !!add && hostileAdd(add);
}
export function clipRefugeStep(
  w: World,
  body: { pos: Vec2; radius: number },
  to: Vec2,
  from: Vec2 = body.pos,
): { pos: Vec2; stopped: boolean } {
  if (!refugeHostile(w, body)) return { pos: wrapPos(to), stopped: false };
  let first = 1,
    stopped = false;
  for (const z of w.groundZones) {
    if (!refugeLive(w, z)) continue;
    const radius = Math.min(180, z.radius) + body.radius;
    // Leave outbound movement open, including the refuge’s own shove.
    if (dist(from, z.pos) < radius - 1e-5) continue;
    const t = circleEntry(from, to, z.pos, radius);
    if (t !== null && t <= first) {
      first = t;
      stopped = true;
    }
  }
  return {
    pos: wrapPos({
      x: from.x + (to.x - from.x) * Math.max(0, first - (stopped ? 1e-7 : 0)),
      y: from.y + (to.y - from.y) * Math.max(0, first - (stopped ? 1e-7 : 0)),
    }),
    stopped,
  };
}
