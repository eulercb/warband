/** Owner-scoped, nonrecursive grand payoffs. Only positive direct-hit paths call these. */
import type { Add, Boss, Buff, Player } from '../core/types';
import type { World } from '../world/world';
import { applyBuff } from './combat';

type Mark = { bonus: number; cast: { spent: boolean } };
interface Target {
  hp: number;
  buffs: Buff[];
}
const exposureSource = (p: Player) => `grandOpening:${p.id}`;
/** Called after immunity/zero-damage checks; a cast cannot consume its own mark. */
export function grandDirectMultiplier(
  source: Player,
  target: Target,
  mods?: { direct?: boolean; mark?: Mark },
): number {
  if (
    !mods?.direct ||
    source.state !== 'alive' ||
    source.hp <= 0 ||
    source.classId !== 'rogue' ||
    !source.charUpgradeIds?.includes('ro_assassin_strike_g')
  )
    return 1;
  const mark = target.buffs.find(
    (b) =>
      b.kind === 'grandOpening' &&
      b.remaining > 0 &&
      b.source === exposureSource(source) &&
      b.openingCast !== mods.mark?.cast,
  );
  if (!mark) return 1;
  target.buffs.splice(target.buffs.indexOf(mark), 1);
  return mark.mult;
}

/** Existing World direct-hit routing owns provenance; supplemental damage cannot enter this path. */
export function onGrandDirectHit(
  world: World,
  source: Player,
  target: Boss | Add,
  effective: number,
  prepared?: boolean,
  mark?: Mark,
): void {
  if (
    world.scene !== null ||
    source.state !== 'alive' ||
    source.hp <= 0 ||
    effective <= 0 ||
    target.hp <= 0
  )
    return;
  if (
    prepared &&
    mark &&
    !mark.cast.spent &&
    source.classId === 'rogue' &&
    source.charUpgradeIds?.includes('ro_assassin_strike_g')
  ) {
    mark.cast.spent = true;
    applyBuff(target, {
      kind: 'grandOpening',
      mult: 1 + Math.min(0.25, Math.max(0, mark.bonus)),
      remaining: 4,
      source: exposureSource(source),
      openingCast: mark.cast,
    });
  }
}
