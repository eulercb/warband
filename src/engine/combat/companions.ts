/** A commanded spirit, not a party bot: one host-owned wolf and one pending bite per owner. */
import type { Add, Boss, Player, SpiritCompanion, Vec2 } from '../core/types';
import type { World } from '../world/world';
import { dist, sub, wrapPos } from '../core/torus';
import { isBurstControl } from '../core/control';
import { damageBoss, damageAdd } from './combat';
import { grantAbsorption } from './absorption';

export const PACK_BOND = 'beast_pack_bond';
export const COMPANION_RANGE = 600;
const WARD_SOURCE = 'subclass:packBond';
const active = (p: Player) => p.subclassPassiveId === PACK_BOND && p.state === 'alive' && p.hp > 0;
function home(p: Player): Vec2 {
  return wrapPos({
    x: p.pos.x - p.aim.x * 36 - p.aim.y * 26,
    y: p.pos.y - p.aim.y * 36 + p.aim.x * 26,
  });
}
function ensure(p: Player): SpiritCompanion {
  return (p.spiritCompanion ??= { pos: home(p), facing: Math.atan2(p.aim.y, p.aim.x) });
}

/** Only actual positive direct hits can issue orders. Multi-hit attacks share one gate. */
export function commandCompanion(
  p: Player,
  target: Boss | Add,
  kind: 'boss' | 'add',
  effective: number,
  direct?: boolean,
): void {
  if (
    !active(p) ||
    !direct ||
    effective <= 0 ||
    target.hp <= 0 ||
    dist(p.pos, target.pos) > COMPANION_RANGE ||
    (p.subclassPassiveCooldowns?.[PACK_BOND] ?? 0) > 0
  )
    return;
  const pet = ensure(p);
  pet.order = { targetId: target.id, kind, windup: 0.3, remaining: 0.9 };
  p.subclassPassiveCooldowns ??= {};
  p.subclassPassiveCooldowns[PACK_BOND] = 2.5;
}

/** Nature's Bond (or a copied dedicated heal) links its actually healed recipient. */
export function prepareCompanionWard(p: Player, target: Player, effective: number): void {
  if (!active(p) || effective <= 0 || target.state !== 'alive' || target.hp <= 0) return;
  ensure(p).wardTargetId = target.id;
  p.buffs = p.buffs.filter((b) => b.source !== WARD_SOURCE);
  p.buffs.push({ kind: 'packBond', mult: 1, remaining: 6, source: WARD_SOURCE });
}
function move(pet: SpiritCompanion, to: Vec2, distance: number): void {
  const d = sub(to, pet.pos);
  const length = Math.hypot(d.x, d.y);
  if (length < 0.001) return;
  pet.facing = Math.atan2(d.y, d.x);
  const f = Math.min(1, distance / length);
  pet.pos = wrapPos({ x: pet.pos.x + d.x * f, y: pet.pos.y + d.y * f });
}
function protect(world: World, p: Player, pet: SpiritCompanion): void {
  if (pet.wardTargetId == null) return;
  const ally = world.players.find((a) => a.id === pet.wardTargetId);
  if (!ally || ally.state !== 'alive' || ally.hp <= 0 || dist(p.pos, ally.pos) > 420) return;
  if (grantAbsorption(ally, 12, 4) <= 0) return;
  p.buffs = p.buffs.filter((b) => b.source !== WARD_SOURCE);
  delete pet.wardTargetId;
  world.events.push({
    t: 'support',
    sourceId: p.id,
    targetId: ally.id,
    from: { ...pet.pos },
    pos: { ...ally.pos },
    kind: 'absorb',
  });
}

/** No target scanning, collision, independent aggro, damage zones, crits or recursive orders. */
export function updateCompanions(world: World, dt: number): void {
  for (const p of world.players) {
    if (!active(p) || world.scene !== null) {
      delete p.spiritCompanion;
      p.buffs = p.buffs.filter((b) => b.source !== WARD_SOURCE);
      continue;
    }
    const pet = ensure(p);
    if (!p.buffs.some((b) => b.kind === 'packBond' && b.remaining > 0)) delete pet.wardTargetId;
    const order = pet.order;
    if (order) {
      const target =
        order.kind === 'boss'
          ? world.bosses.find((b) => b.id === order.targetId)
          : world.adds.find((a) => a.id === order.targetId);
      order.remaining -= dt;
      order.windup = Math.max(0, order.windup - dt);
      if (
        !target ||
        target.hp <= 0 ||
        order.remaining <= 0 ||
        dist(p.pos, target.pos) > COMPANION_RANGE
      )
        delete pet.order;
      else {
        // Spirits can cross cover and reach flyers, but never shove or tank attacks.
        move(pet, target.pos, 1800 * dt);
        if (order.windup <= 0 && dist(pet.pos, target.pos) <= target.radius + 18) {
          delete pet.order; // clear before damage callbacks; this strike cannot command itself
          const base = 16 * (target.buffs.some(isBurstControl) ? 1.25 : 1);
          const before = target.hp;
          if (order.kind === 'boss') damageBoss(world, p, target as Boss, base);
          else damageAdd(world, p, target as Add, base);
          if (target.hp < before) protect(world, p, pet);
        }
      }
    }
    if (!pet.order) {
      const rest = home(p);
      if (dist(pet.pos, rest) > COMPANION_RANGE) pet.pos = rest;
      else move(pet, rest, Math.max(420, p.moveSpeed * 1.5) * dt);
    }
  }
}
