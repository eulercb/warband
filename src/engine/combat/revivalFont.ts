/** One owner-wide field rescue; downing the preparer does not erase the prepared aid. */
import type { World } from '../world/world';
import type { Player, GroundZone, FontSource, FontRescue } from '../core/types';
import type { PlayerAbilityDef } from '../content/classes';
import { revivalFont } from '../content/fontRules';
import { REVIVE_TIME } from '../core/constants';
import { dist } from '../core/torus';
import { abilityForSlot } from './abilities';
function sourceLive(w: World, ownerId: number, s: FontSource): boolean {
  const p = w.players.find((p) => p.id === ownerId);
  return (
    !w.finished &&
    w.scene === null &&
    !w.deadlineActive &&
    w.reviveBudget > 0 &&
    !!p &&
    p.state !== 'dead' &&
    p.classId === s.ownerClass &&
    (p.fontEpoch ?? 0) === s.epoch &&
    abilityForSlot(p, s.slot) === s.source &&
    revivalFont(s.source)
  );
}
export function reserveFont(w: World, p: Player, ab: PlayerAbilityDef): FontSource | undefined {
  if (!revivalFont(ab) || w.fontSpent.has(p.id)) return undefined;
  const source = abilityForSlot(p, ab.slot);
  if (!source) return undefined;
  return { source, slot: ab.slot, ownerClass: p.classId, epoch: p.fontEpoch ?? 0 };
}
export function fontAvailable(w: World, z: GroundZone): boolean {
  return (
    !!z.revivalFont &&
    z.side === 'player' &&
    z.healPerTick > 0 &&
    z.remaining > 0 &&
    (z.armRemaining ?? 0) <= 0 &&
    !w.fontSpent.has(z.ownerId) &&
    w.fontRescues.filter((r) => rescueLive(w, r)).length < w.reviveBudget &&
    sourceLive(w, z.ownerId, z.revivalFont)
  );
}
function rescueLive(w: World, r: FontRescue): boolean {
  const p = w.players.find((p) => p.id === r.targetId);
  return (
    r.remaining > 0 &&
    sourceLive(w, r.ownerId, r.source) &&
    !!p &&
    p.state === 'downed' &&
    p.downedTimer > 0 &&
    dist(p.pos, r.pos) <= r.radius + p.radius
  );
}
export function fontForTarget(w: World, p: Player): FontRescue | undefined {
  return w.fontRescues.find((r) => r.targetId === p.id && rescueLive(w, r));
}
export function claimFonts(w: World): void {
  w.fontRescues = w.fontRescues.filter((r) => rescueLive(w, r));
  const used = new Set<number>();
  for (const z of w.groundZones) {
    if (!fontAvailable(w, z)) continue;
    const target = w.players
      .filter(
        (p) =>
          p.state === 'downed' &&
          p.downedTimer > 0 &&
          dist(p.pos, z.pos) <= z.radius + p.radius &&
          !w.fontRescues.some((r) => r.targetId === p.id),
      )
      .sort((a, b) => a.downedTimer - b.downedTimer || a.id - b.id)[0];
    if (!target) continue;
    w.fontSpent.add(z.ownerId);
    used.add(z.id);
    w.fontRescues.push({
      ownerId: z.ownerId,
      targetId: target.id,
      source: z.revivalFont!,
      pos: { ...z.pos },
      radius: z.radius,
      remaining: REVIVE_TIME,
    });
    w.events.push({ t: 'fontRescue', pos: { ...target.pos } });
  }
  if (used.size) w.groundZones = w.groundZones.filter((z) => !used.has(z.id));
}
export function advanceFonts(w: World, dt: number): void {
  for (const r of w.fontRescues) r.remaining = Math.max(0, r.remaining - dt);
  w.fontRescues = w.fontRescues.filter((r) => rescueLive(w, r));
}
export function fontCanSaveWipe(w: World): boolean {
  return w.fontRescues.some((r) => {
    if (!rescueLive(w, r)) return false;
    const p = w.players.find((p) => p.id === r.targetId)!;
    const needed = Math.max(0, REVIVE_TIME - p.reviveProgress);
    return needed <= r.remaining + 1e-8 && needed <= p.downedTimer + 1e-8;
  });
}
export function fontRecoveryView(w: World, p: Player) {
  return fontForTarget(w, p)
    ? { progress: Math.min(1, p.reviveProgress / REVIVE_TIME) }
    : undefined;
}

export function fontRescueViews(w: World) {
  return w.fontRescues
    .filter((r) => rescueLive(w, r))
    .map((r) => ({
      ownerId: r.ownerId,
      targetId: r.targetId,
      pos: { ...r.pos },
      radius: r.radius,
    }));
}
