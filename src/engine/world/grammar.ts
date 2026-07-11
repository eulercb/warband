/**
 * Warband — attack-pattern fairness governor. PURE TS.
 *
 * Bosses draw their moves from per-boss decision lists (monsters.ts). That keeps
 * each boss legible, but the moment TWO threats share the arena — a twin pair, or
 * a boss plus a live corruption strike — nothing stops their telegraphs from
 * landing on the same spot at the same instant and composing into an undodgeable
 * wall. This module owns the guardrail: "what is fair," separate from the RNG
 * that picks "what happens."
 *
 * The rule is deliberately narrow: a boss defers a big telegraphed attack only
 * when its impact would stack on top of another hostile telegraph already
 * threatening that spot — and never while ENRAGED, when walling the arena is an
 * intended pressure beat. It is completely inert for a lone boss with nothing
 * pending, so it can never change a plain single-boss fight.
 */
import type { Boss, PendingStrike, Vec2 } from '../core/types';
import type { BossAbilityShape } from '../content/monsters';
import { dist } from '../core/torus';

/** Ability shapes that paint a large ground telegraph the band must dodge. */
export const WALLING_SHAPES: ReadonlySet<BossAbilityShape> = new Set<BossAbilityShape>([
  'cone',
  'circleAtTarget',
  'pbaoe',
  'line',
  'beam',
]);

/**
 * True if a new telegraphed impact at `center` would stack unfairly on top of a
 * hostile telegraph already threatening that spot — another boss mid wind-up /
 * channel, or a pending corruption strike — within `threshold` world units.
 * Pure: pass the current bosses and pending strikes explicitly.
 */
export function overlapsActiveTelegraph(
  center: Vec2,
  self: Boss,
  bosses: Boss[],
  pendingStrikes: PendingStrike[],
  threshold: number,
): boolean {
  for (const other of bosses) {
    if (other === self || other.hp <= 0) continue;
    const a = other.action;
    if (a.kind !== 'windup' && a.kind !== 'channel') continue;
    const oc = a.targetPos ?? other.pos;
    if (dist(center, oc) <= threshold) return true;
  }
  for (const s of pendingStrikes) {
    // A pending strike's own radius widens the no-stack zone around it.
    if (dist(center, s.pos) <= threshold + s.radius * 0.5) return true;
  }
  return false;
}
