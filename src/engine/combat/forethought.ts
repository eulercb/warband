/** Shared next intent with reserved aim; current revealed attacks live on BossAction. */
import type { Boss, BossView, Player } from '../core/types';
import type { World } from '../world/world';
import type { HitMods } from './combat';
import { abilityById } from '../content/monsters';
import { personallyCursed } from '../core/curses';

export function forethoughtLegal(w: World, b: Boss, id: string): boolean {
  const ab = abilityById(w.defOf(b), id);
  return (
    !!ab &&
    (b.cooldowns[id] ?? 0) <= 0 &&
    (ab.minHpFrac == null || b.hp / b.maxHp <= ab.minHpFrac) &&
    w.players.some((p) => p.state === 'alive' && p.hp > 0)
  );
}

function valid(w: World, b: Boss): boolean {
  const f = b.forethought;
  const owner = f && w.players.find((p) => p.id === f.ownerId);
  return (
    !!f &&
    f.remaining > 0 &&
    w.scene === null &&
    b.hp > 0 &&
    !!owner &&
    owner.state === 'alive' &&
    owner.hp > 0 &&
    owner.classId === f.ownerClass &&
    (!f.abilityId || forethoughtLegal(w, b, f.abilityId)) &&
    (!f.plan ||
      ((w.tauntTimer > 0 ? (w.tauntTargetId ?? undefined) : undefined) === f.tauntId &&
        b.perception === f.perception &&
        (f.plan.targetId == null ||
          w.players.some((p) => p.id === f.plan!.targetId && p.state === 'alive' && p.hp > 0))))
  );
}

export function armForethought(
  w: World,
  p: Player,
  b: Boss,
  hit: NonNullable<HitMods['forethought']>,
): void {
  if (
    w.scene !== null ||
    p.state !== 'alive' ||
    p.hp <= 0 ||
    p.classId !== hit.ownerClass ||
    b.hp <= 0 ||
    (hit.requiresCurse && !personallyCursed(p.id, b))
  )
    return;
  // Join an existing plan. Refreshing its lifetime cannot reroll the committed move.
  if (valid(w, b)) {
    b.forethought!.remaining = 8;
    return;
  }
  b.forethought = { ownerId: p.id, ownerClass: p.classId, remaining: 8 };
}

export function tickForethought(w: World, b: Boss, dt: number): void {
  if (!b.forethought) return;
  b.forethought.remaining -= dt;
  if (!valid(w, b)) delete b.forethought;
}

export function forethoughtView(w: World, b: Boss): BossView['forethought'] {
  if (!valid(w, b)) return undefined;
  const f = b.forethought!;
  return {
    remaining: f.remaining,
    abilityId: f.abilityId,
    preview: f.plan ? w.foresightPreview(b, f.plan) : undefined,
  };
}
