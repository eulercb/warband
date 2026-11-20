import type { Player } from '../core/types';
import type { World } from '../world/world';
import { dist } from '../core/torus';

export function deferFaithDamage(world: World, target: Player, damage: number): number {
  if (world.scene !== null || world.finished || damage <= 0 || target.faithWound) return damage;
  const owner = world.players
    .filter(
      (p) =>
        p.state === 'alive' &&
        p.hp > 0 &&
        p.paladinAura?.faithReady &&
        p.paladinAura.remaining > 0 &&
        p.paladinAura.classId === p.classId &&
        dist(p.pos, target.pos) <= p.paladinAura.radius,
    )
    .sort((a, b) => a.id - b.id)[0];
  if (!owner) return damage;
  owner.paladinAura!.faithReady = false;
  const amount = Math.min(damage * 0.5, target.maxHp * 0.25);
  target.faithWound = { amount, remaining: 3 };
  world.events.push({
    t: 'support',
    kind: 'protect',
    sourceId: owner.id,
    targetId: target.id,
    from: { ...owner.pos },
    pos: { ...target.pos },
  });
  return damage - amount;
}

/** Healing pays the wound first. Return the amount still available to restore HP. */
export function payFaithWound(target: Player, healing: number): number {
  const wound = target.faithWound;
  if (!wound || healing <= 0) return healing;
  const paid = Math.min(healing, wound.amount);
  wound.amount -= paid;
  if (wound.amount <= 1e-6) delete target.faithWound;
  return healing - paid;
}

export function advanceFaithWound(world: World, target: Player, dt: number): boolean {
  const wound = target.faithWound;
  if (!wound) return false;
  if (target.state !== 'alive' || target.hp <= 0 || world.scene !== null) {
    delete target.faithWound;
    return false;
  }
  wound.remaining -= dt;
  if (wound.remaining > 1e-6) return false;
  delete target.faithWound;
  // This damage already passed mitigation, blocks and absorption at the original hit.
  target.hp -= wound.amount;
  world.events.push({
    t: 'hit',
    side: 'player',
    amount: wound.amount,
    targetId: target.id,
    pos: { ...target.pos },
  });
  return target.hp <= 0;
}
