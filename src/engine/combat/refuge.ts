/** One-way bodily exclusion. This never participates in attack/cover queries. */
import type { World } from '../world/world';
import type { GroundZone, Player, RefugeSource, Vec2 } from '../core/types';
import type { PlayerAbilityDef } from '../content/classes';
import { refugeField } from '../content/refugeRules';
import { abilityForSlot } from './abilities';
import { dist, wrapPos } from '../core/torus';
import { circleEntry } from './infernalAperture';
import { isFlying } from './combat';
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
/** Only actual grounded hostile bodies are excluded, including timed/static flight. */
export function refugeHostile(w: World, body: { pos: Vec2; radius: number }): boolean {
  const boss = w.aliveBosses().find((e) => e === body);
  if (boss) return !w.bossFlying(boss);
  const add = w.adds.find((e) => e === body);
  return !!add && hostileAdd(add) && !isFlying(add);
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
    // A field cannot eject or imprison a body that starts within/overlapping it.
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
