/** Following support fields. Only one field per owner; equivalent effects never stack. */
import type { Player } from '../core/types';
import type { PlayerAbilityDef } from '../content/classes';
import type { World } from '../world/world';
import { dist } from '../core/torus';
import { applyBuff, healPlayer, makeBuff } from './combat';
export function armPaladinAura(world: World, p: Player, ab: PlayerAbilityDef): void {
  const a = ab.paladinAura;
  if (!a || p.state !== 'alive' || p.hp <= 0) return;
  p.paladinAura = {
    ...a,
    id: world.allocId(),
    classId: p.classId,
    remaining: a.duration,
    spent: [],
  };
  updatePaladinAuras(world, 0, 0);
}
/** Called after movement/casts and again with dt=0 after combat to remove invalid owners. */
export function updatePaladinAuras(world: World, dt: number, clock: number): number {
  const owners = world.players.filter((p) => {
    const a = p.paladinAura;
    if (!a) return false;
    if (
      p.state !== 'alive' ||
      p.hp <= 0 ||
      a.remaining <= 0 ||
      a.classId !== p.classId ||
      world.scene !== null
    ) {
      delete p.paladinAura;
      return false;
    }
    return true;
  });
  const ids = new Set(owners.map((p) => p.paladinAura!.id));
  for (const p of world.players)
    p.buffs = p.buffs.filter(
      (b) =>
        !b.source.startsWith('paladinField') &&
        !(
          b.source.startsWith('paladinStrike:') &&
          (!ids.has(Number(b.source.split(':')[1])) || p.state !== 'alive')
        ),
    );
  const renewals = new Map<Player, Player>();
  for (const owner of owners) {
    const a = owner.paladinAura!;
    for (const target of world.players) {
      if (target.state !== 'alive' || target.hp <= 0 || dist(owner.pos, target.pos) > a.radius)
        continue;
      if (a.kind === 'bulwark')
        applyBuff(target, makeBuff('auraBulwark', 0.85, 0.35, 'paladinFieldBulwark'));
      if (a.kind === 'pursuit') {
        applyBuff(target, makeBuff('moveSpeed', 1.18, 0.35, 'paladinFieldPursuit'));
        if (!a.spent.includes(target.id)) {
          a.spent.push(target.id);
          if (!target.buffs.some((b) => b.kind === 'auraStrike' && b.remaining > 0))
            applyBuff(
              target,
              makeBuff('auraStrike', 1.25, Math.min(4, a.remaining), `paladinStrike:${a.id}`),
            );
        }
      }
      if (a.kind === 'renewal') {
        applyBuff(target, makeBuff('auraRenewal', 10, 0.35, 'paladinFieldRenewal'));
        // Stable owner selection attributes one equivalent recovery pulse, never one per caster.
        if (!renewals.has(target) || owner.id < renewals.get(target)!.id)
          renewals.set(target, owner);
      }
    }
  }
  const next = clock + dt;
  if (next >= 1)
    for (const [target, owner] of renewals) healPlayer(world, owner, target, 10 * Math.floor(next));
  return next % 1;
}
