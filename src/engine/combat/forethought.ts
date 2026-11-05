/** Shared next intent with reserved aim; current revealed attacks live on BossAction. */
import type { Boss, BossView, Player } from '../core/types';
import type { World } from '../world/world';
import { applyBuff, makeBuff, hasBuff, type HitMods } from './combat';
import { abilityById } from '../content/monsters';
import { personallyCursed } from '../core/curses';

export const FORETHOUGHT_RECOVERY = 8;
export function closeForethought(b: Boss): void {
  if (b.hp > 0)
    applyBuff(b, makeBuff('forethoughtRecovery', 1, FORETHOUGHT_RECOVERY, 'forethoughtRecovery'));
}

/** Completion and interruption spend one slot; no player input is needed for slot two. */
export function finishForethought(w: World, b: Boss): void {
  const read = b.action.forethoughtRead;
  const owner = read && w.players.find((p) => p.id === read.ownerId);
  if (
    read?.index === 1 &&
    w.scene === null &&
    b.hp > 0 &&
    owner?.state === 'alive' &&
    owner.hp > 0 &&
    owner.classId === read.ownerClass
  ) {
    b.forethought = { ownerId: read.ownerId, ownerClass: read.ownerClass, remaining: 8, index: 2 };
  } else closeForethought(b);
}

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
  // One shared two-action window, then recovery; hits cannot refill or extend it.
  if (b.action.forethought || hasBuff(b, 'forethoughtRecovery')) return;
  if (b.forethought) {
    if (valid(w, b)) return;
    closeForethought(b);
    delete b.forethought;
    return;
  }
  b.forethought = { ownerId: p.id, ownerClass: p.classId, remaining: 8, index: 1 };
}

export function tickForethought(w: World, b: Boss, dt: number): void {
  if (!b.forethought) return;
  b.forethought.remaining -= dt;
  if (!valid(w, b)) {
    if (w.scene === null) closeForethought(b);
    delete b.forethought;
  }
}

export function forethoughtView(w: World, b: Boss): BossView['forethought'] {
  if (!valid(w, b)) return undefined;
  const f = b.forethought!;
  return {
    remaining: f.remaining,
    index: f.index,
    abilityId: f.abilityId,
    preview: f.plan ? w.foresightPreview(b, f.plan) : undefined,
  };
}
