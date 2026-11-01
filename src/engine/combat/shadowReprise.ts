/** A hit earns a choice to withdraw; returning is not another ability cast. */
import type { ExtSlot, Player, PlayerView, Vec2 } from '../core/types';
import type { PlayerAbilityDef } from '../content/classes';
import type { World } from '../world/world';
import type { HitMods } from './combat';
import { abilityForSlot } from './abilities';
import { hasBuff, isRooted } from './combat';
import { dist, wrapCoord } from '../core/torus';

export function resolvedShadowReprise(ab: PlayerAbilityDef) {
  if (!ab.components) return ab.shadowReprise;
  const effect = ab.components.effects.find((e) => e.kind === 'shadowReprise');
  return effect?.kind === 'shadowReprise' ? effect.reprise : undefined;
}

function valid(w: World, p: Player): boolean {
  const r = p.shadowReprise;
  return (
    !!r &&
    w.scene === null &&
    p.state === 'alive' &&
    p.hp > 0 &&
    r.classId === p.classId &&
    abilityForSlot(p, r.slot) === r.source &&
    !!resolvedShadowReprise(r.source) &&
    r.remaining > 0 &&
    (p.cooldowns[r.slot] ?? 0) > 0
  );
}

export function recordShadowReprise(
  w: World,
  p: Player,
  ab: PlayerAbilityDef,
  slot: ExtSlot,
  anchor: Vec2,
): void {
  const r = resolvedShadowReprise(ab);
  const source = abilityForSlot(p, slot);
  if (
    !r ||
    !ab.pilotCast ||
    !source ||
    slot === 'basic' ||
    w.scene !== null ||
    p.state !== 'alive' ||
    p.hp <= 0 ||
    (ab.kind === 'blink' && dist(anchor, p.pos) <= 1e-6)
  )
    return;
  p.shadowReprise = {
    anchor: { ...anchor },
    source,
    cast: ab.pilotCast,
    classId: p.classId,
    slot,
    remaining: Math.min(6, Math.max(0, r.lifetime)),
    window: Math.min(2, Math.max(0, r.returnWindow)),
    returnRemaining: 0,
    range: Math.min(
      ab.kind === 'blink' ? (ab.range ?? r.range) : r.range,
      Math.min(w.arena.w, w.arena.h) * 0.4,
    ),
    prepared: r.prepared,
  };
}

export function tickShadowReprise(w: World, dt: number): void {
  for (const p of w.players) {
    const r = p.shadowReprise;
    if (!r) continue;
    r.remaining -= dt;
    if (r.armedTick !== undefined) r.returnRemaining -= dt;
    if (!valid(w, p) || (r.armedTick !== undefined && r.returnRemaining <= 0))
      delete p.shadowReprise;
  }
}

export function onShadowRepriseHit(
  w: World,
  p: Player,
  effective: number,
  prepared?: boolean,
  pilot?: HitMods['pilot'],
): void {
  const r = p.shadowReprise;
  if (
    !r ||
    !valid(w, p) ||
    effective <= 0 ||
    !pilot ||
    r.cast === pilot.cast ||
    r.armedTick !== undefined ||
    (r.prepared && !prepared)
  )
    return;
  // No target-alive check: a lethal prepared strike earns the same withdrawal.
  r.armedTick = w.tick;
  r.returnRemaining = Math.min(r.window, r.remaining);
}

function blocked(p: Player): string | null {
  if (isRooted(p)) return 'Rooted';
  if (hasBuff(p, 'silence')) return 'Silenced';
  if (hasBuff(p, 'stun')) return 'Stunned';
  if (p.castTimer > 0) return 'Casting';
  if (p.glide || p.shove) return 'Moving';
  if (dist(p.pos, p.shadowReprise!.anchor) > p.shadowReprise!.range + 1e-6) return 'Out of range';
  return null;
}

export function shadowRepriseView(w: World, p: Player): PlayerView['shadowReprise'] {
  if (!valid(w, p)) return undefined;
  const r = p.shadowReprise!;
  return {
    anchor: { ...r.anchor },
    slot: r.slot,
    remaining: r.remaining,
    returnRemaining: r.returnRemaining,
    prepared: r.prepared,
    armed: r.armedTick !== undefined,
    blocked: blocked(p),
  };
}

/** True means the press belongs to reprise, including a blocked/held press. */
export function tryShadowReturn(w: World, p: Player, slot: ExtSlot, fresh: boolean): boolean {
  const r = p.shadowReprise;
  if (!r || r.slot !== slot) return false;
  if (!valid(w, p)) {
    delete p.shadowReprise;
    return false;
  }
  if (r.armedTick === undefined) return true;
  if (!fresh || w.tick <= r.armedTick || r.returnRemaining <= 0 || blocked(p)) return true;
  delete p.shadowReprise; // consume before moving; never invoke cast hooks
  const from = { ...p.pos };
  p.pos = { x: wrapCoord(r.anchor.x, w.arena.w), y: wrapCoord(r.anchor.y, w.arena.h) };
  w.events.push({ t: 'blink', id: p.id, from, to: { ...p.pos } });
  return true;
}
