/** Stationary afterimages carry copied skill payloads, never donor passive ownership. */
import type { Buff, Player, Vec2, ExtSlot, Boss, Add } from '../core/types';
import type { PlayerAbilityDef } from '../content/classes';
import type { World } from '../world/world';
import type { HitMods } from './combat';
import { abilityForSlot } from './abilities';
import { applyBuff, damageEcho } from './combat';
import { dist } from '../core/torus';
import { spendSupportChorus } from './support';

export function ownsWhisperRefrain(p: Player, b: Buff): boolean {
  const source = b.whisperRefrainState && abilityForSlot(p, b.whisperRefrainState.slot);
  return (
    b.source === `whisperRefrain:${p.classId}` &&
    source?.kind === 'blink' &&
    source.bardSong === 'chorus' &&
    source.whisperRefrain != null
  );
}

export function armWhisperRefrain(
  world: World,
  p: Player,
  ab: PlayerAbilityDef,
  slot: ExtSlot,
  anchor: Vec2,
): void {
  const r = ab.whisperRefrain;
  if (!r || world.scene !== null || p.state !== 'alive' || p.hp <= 0 || dist(anchor, p.pos) <= 1e-6)
    return;
  if (!spendSupportChorus(world, p, ab)) return;
  // A new successful chorus replaces the old position and budget, never stacks.
  applyBuff(p, {
    kind: 'whisperRefrain',
    mult: Math.max(1, Math.min(4, Math.floor(r.charges))),
    remaining: Math.max(1, Math.min(8, r.duration)),
    source: `whisperRefrain:${p.classId}`,
    whisperRefrainState: {
      anchor: { ...anchor },
      radius: Math.max(1, Math.min(220, r.radius)),
      fraction: Math.max(0, Math.min(0.45, r.fraction)),
      slot,
      usedCasts: [],
    },
  });
  world.events.push({
    t: 'support',
    sourceId: p.id,
    targetId: p.id,
    from: { ...p.pos },
    pos: { ...anchor },
    kind: 'empower',
  });
}

export function onWhisperRefrainHit(
  world: World,
  p: Player,
  target: Boss | Add,
  effective: number,
  pilot?: HitMods['pilot'],
): void {
  if (
    world.scene !== null ||
    p.state !== 'alive' ||
    p.hp <= 0 ||
    effective <= 0 ||
    target.hp <= 0 ||
    !pilot
  )
    return;
  const ready = p.buffs.find((b) => b.kind === 'whisperRefrain' && b.remaining > 0 && b.mult > 0);
  if (!ready) return;
  if (!ownsWhisperRefrain(p, ready)) {
    p.buffs.splice(p.buffs.indexOf(ready), 1);
    return;
  }
  const r = ready.whisperRefrainState!;
  if (r.usedCasts.includes(pilot.cast) || dist(r.anchor, target.pos) > r.radius) return;
  // Raw effective-hit attribution bypasses all direct/proc/leech paths and multipliers.
  const echoed = damageEcho(world, p, target, effective * r.fraction);
  if (echoed <= 0) return;
  r.usedCasts.push(pilot.cast);
  ready.mult -= 1;
  if (ready.mult <= 0) p.buffs.splice(p.buffs.indexOf(ready), 1);
  world.events.push({
    t: 'support',
    sourceId: p.id,
    targetId: target.id,
    from: { ...r.anchor },
    pos: { ...target.pos },
    kind: 'empower',
  });
}
