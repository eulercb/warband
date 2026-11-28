import type { Add, Boss, GroundZone, Vec2 } from '../core/types';
import { dist, sub, wrapPos } from '../core/torus';
import { add as vadd, scale as vscale } from '../core/math';
import type { World } from '../world/world';
import { isCcImmune } from './combat';
import { circleEntry } from './infernalAperture';
import { isSteadfast } from './defense';

type Enemy = Boss | Add;

function activeCage(zone: GroundZone): boolean {
  return !!zone.mageBind && zone.remaining > 0 && (zone.armRemaining ?? 0) <= 0;
}

function canBind(enemy: Enemy): boolean {
  return (
    enemy.hp > 0 && !('charm' in enemy && enemy.charm) && !isCcImmune(enemy) && !isSteadfast(enemy)
  );
}

function containingCage(world: World, enemy: Enemy): GroundZone | undefined {
  return world.groundZones.find(
    (zone) => activeCage(zone) && dist(enemy.pos, zone.pos) <= zone.radius,
  );
}

function clipCageExit(zone: GroundZone, destination: Vec2): Vec2 {
  const delta = sub(destination, zone.pos);
  const length = Math.hypot(delta.x, delta.y);
  if (length <= zone.radius) return destination;
  return wrapPos(vadd(zone.pos, vscale(delta, (zone.radius - 0.01) / length)));
}

export function recordBoundEnemies(world: World, captured: Map<Enemy, GroundZone>): void {
  if (!world.groundZones.some(activeCage)) return;
  for (const enemy of [...world.bosses, ...world.adds]) {
    if (captured.has(enemy) || !canBind(enemy)) continue;
    const zone = containingCage(world, enemy);
    if (zone) captured.set(enemy, zone);
  }
}

export function enforceBoundEnemies(world: World, captured: Map<Enemy, GroundZone>): void {
  for (const [enemy, zone] of captured) {
    if (world.groundZones.includes(zone) && activeCage(zone) && canBind(enemy))
      enemy.pos = clipCageExit(zone, enemy.pos);
  }
}

/** Grand cages weaken their occupants, regardless of where the victim stands. */
export function prisonDamageFactor(world: World, enemy: Enemy): number {
  const cage = world.groundZones.find(
    (zone) => zone.prison && activeCage(zone) && dist(enemy.pos, zone.pos) <= zone.radius,
  );
  return cage && canBind(enemy) ? 0.8 : 1;
}

export function clipBoundDestination(world: World, enemy: Enemy, to: Vec2): Vec2 {
  const cage = containingCage(world, enemy);
  if (!cage || !canBind(enemy) || dist(cage.pos, to) <= cage.radius) return to;
  const travel = sub(to, enemy.pos);
  const from = vadd(enemy.pos, travel);
  // Work back from the outside to recover the exit along the original lane.
  const entry = circleEntry(from, enemy.pos, cage.pos, cage.radius);
  const fraction = Math.max(0, 1 - (entry ?? 1) - 0.0001);
  return wrapPos(vadd(enemy.pos, vscale(travel, fraction)));
}
