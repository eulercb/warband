/** Detached original contact. Shadows neither move bodies nor act as targets. */
import type { Player, ShadowCommitCast, ShadowCommitView, ExtSlot, Vec2 } from '../core/types';
import type { World } from '../world/world';
import type { PlayerAbilityDef } from '../content/classes';
import { resolvedShadowCommit } from '../content/classes';
import { SHADOW_COMMIT_DELAY } from '../content/shadowRules';
import { abilityForSlot, releaseShadowCommit } from './abilities';
function live(w: World, p: Player): boolean {
  return !w.finished && w.scene === null && p.state === 'alive' && p.hp > 0;
}
function valid(w: World, p: Player, c: ShadowCommitCast): boolean {
  return (
    live(w, p) &&
    p.classId === c.ownerClass &&
    (p.shadowCommitEpoch ?? 0) === c.epoch &&
    abilityForSlot(p, c.slot) === c.source &&
    resolvedShadowCommit(c.source)
  );
}
export function commitShadow(
  w: World,
  p: Player,
  ab: PlayerAbilityDef,
  slot: ExtSlot,
  origin: Vec2,
  aim: Vec2,
): boolean {
  if (!resolvedShadowCommit(ab) || !live(w, p)) return false;
  const source = abilityForSlot(p, slot);
  if (!source) return false;
  (p.shadowCommits ??= []).push({
    id: w.allocId(),
    slot,
    source,
    ab,
    origin: { ...origin },
    aim: { ...aim },
    ownerClass: p.classId,
    epoch: p.shadowCommitEpoch ?? 0,
    remaining: SHADOW_COMMIT_DELAY,
  });
  return true;
}
export function tickShadowCommits(w: World, dt: number): void {
  for (const p of w.players) {
    if (!p.shadowCommits) continue;
    const due: ShadowCommitCast[] = [];
    p.shadowCommits = p.shadowCommits.filter((c) => {
      if (!valid(w, p, c)) return false;
      c.remaining -= dt;
      if (c.remaining > 1e-8) return true;
      due.push(c);
      return false;
    });
    for (const c of due) if (valid(w, p, c)) releaseShadowCommit(w, p, c.ab, c.origin, c.aim);
  }
}
export function shadowCommitViews(w: World, p: Player): ShadowCommitView[] | undefined {
  const casts = p.shadowCommits?.filter((c) => valid(w, p, c));
  if (!casts?.length) return undefined;
  return casts.map((c) => ({
    id: c.id,
    slot: c.slot,
    origin: { ...c.origin },
    angle: Math.atan2(c.aim.y, c.aim.x),
    kind: c.ab.kind as 'meleeCone' | 'pbaoe',
    range: c.ab.range ?? 70,
    radius: c.ab.radius ?? 150,
    halfAngle: ((c.ab.halfAngleDeg ?? 45) * Math.PI) / 180,
    remaining: c.remaining,
    duration: SHADOW_COMMIT_DELAY,
  }));
}
