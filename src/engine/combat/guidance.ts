/** Steering changes heading only; collision, travel budgets and hit provenance remain ordinary. */
import type { World } from '../world/world';
import type { Player, Projectile, GuidanceCast, ExtSlot, Vec2 } from '../core/types';
import type { PlayerAbilityDef } from '../content/classes';
import { guidedSpell, GUIDANCE_DURATION, GUIDANCE_TURN_RATE } from '../content/guidanceRules';
import { abilityForSlot } from './abilities';
function live(w: World, p: Player, c: GuidanceCast): boolean {
  return (
    !w.finished &&
    w.scene === null &&
    p.state === 'alive' &&
    p.hp > 0 &&
    p.classId === c.ownerClass &&
    abilityForSlot(p, c.slot) === c.source &&
    guidedSpell(c.source)
  );
}
export function launchGuidance(
  w: World,
  p: Player,
  ab: PlayerAbilityDef,
  slot: ExtSlot,
  aim: Vec2,
): GuidanceCast | undefined {
  if (!guidedSpell(ab)) return undefined;
  const source = abilityForSlot(p, slot);
  if (!source) return undefined;
  const c: GuidanceCast = {
    source,
    ownerClass: p.classId,
    ownerId: p.id,
    slot,
    remaining: GUIDANCE_DURATION,
    angle: Math.atan2(aim.y, aim.x),
    activeTick: -1,
  };
  p.guidance = c;
  w.events.push({ t: 'spellGuidance', pos: { ...p.pos } });
  return c;
}
export function advanceGuidance(w: World, dt: number): void {
  for (const p of w.players) {
    const c = p.guidance;
    if (!c) continue;
    if (
      !live(w, p, c) ||
      c.remaining <= 0 ||
      !w.projectiles.some((q) => q.guidance === c && !q.apertureTransit)
    ) {
      delete p.guidance;
      continue;
    }
    const elapsed = Math.min(dt, c.remaining);
    const target = Math.hypot(p.aim.x, p.aim.y) > 0.001 ? Math.atan2(p.aim.y, p.aim.x) : c.angle;
    const delta = Math.atan2(Math.sin(target - c.angle), Math.cos(target - c.angle));
    c.angle += Math.max(
      -GUIDANCE_TURN_RATE * elapsed,
      Math.min(GUIDANCE_TURN_RATE * elapsed, delta),
    );
    c.remaining = Math.max(0, c.remaining - dt);
    c.activeTick = w.tick;
  }
}
export function steerProjectile(w: World, q: Projectile): void {
  const c = q.guidance,
    p = c && w.players.find((p) => p.id === c.ownerId);
  if (!c || !p || p.guidance !== c || c.activeTick !== w.tick || !live(w, p, c)) return;
  const speed = Math.hypot(q.vel.x, q.vel.y),
    angle = c.angle + (q.spreadOffset ?? 0);
  q.vel = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
}
export function guidanceView(w: World, p: Player) {
  const c = p.guidance;
  if (
    !c ||
    c.remaining <= 0 ||
    !live(w, p, c) ||
    !w.projectiles.some((q) => q.guidance === c && !q.apertureTransit)
  )
    return undefined;
  return { remaining: c.remaining, slot: c.slot, angle: c.angle, name: c.source.name };
}
export function guidedProjectileView(w: World, q: Projectile) {
  const c = q.guidance,
    p = c && w.players.find((p) => p.id === c.ownerId);
  if (!c || !p || p.guidance !== c || !guidanceView(w, p)) return undefined;
  return { remaining: c.remaining, angle: c.angle + (q.spreadOffset ?? 0) };
}
