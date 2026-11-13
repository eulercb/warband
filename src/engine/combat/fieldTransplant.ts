/** One owned field, moved once without replaying its payload or lifetime. */
import type { World } from '../world/world';
import type { Player, ExtSlot, FieldTransplantCast, GroundZone } from '../core/types';
import type { PlayerAbilityDef } from '../content/classes';
import { abilityForSlot } from './abilities';
import { hasBuff } from './combat';
import { wrapCoord } from '../core/torus';
import { shadowRepriseView } from './shadowReprise';
export const TRANSPLANT_REACH = 460;
export function hasTransplant(ab: PlayerAbilityDef): boolean {
  return ab.components
    ? ab.components.effects.some((e) => e.kind === 'zone' && e.zone.zoneTransplant)
    : !!ab.zoneTransplant && ab.kind === 'groundZone';
}
function live(w: World, p: Player, c: FieldTransplantCast): boolean {
  return (
    !w.finished &&
    w.scene === null &&
    p.state === 'alive' &&
    p.hp > 0 &&
    p.classId === c.ownerClass &&
    c.epoch === (p.transplantEpoch ?? 0) &&
    abilityForSlot(p, c.slot) === c.source &&
    hasTransplant(c.source) &&
    (p.cooldowns[c.slot] ?? 0) > 0
  );
}
export function reserveFieldTransplant(
  w: World,
  p: Player,
  ab: PlayerAbilityDef,
  slot: ExtSlot,
): FieldTransplantCast | undefined {
  if (!hasTransplant(ab)) {
    if (p.fieldTransplants) delete p.fieldTransplants[slot];
    return undefined;
  }
  const c: FieldTransplantCast = {
    ownerClass: p.classId,
    ownerId: p.id,
    epoch: p.transplantEpoch ?? 0,
    source: ab,
    slot,
    createdTick: w.tick,
    used: false,
  };
  (p.fieldTransplants ??= {})[slot] = c;
  return c;
}
export function registerTransplant(w: World, z: GroundZone, c?: FieldTransplantCast): void {
  if (!c || c.zoneId !== undefined) return;
  const p = w.players.find((p) => p.id === z.ownerId);
  if (!p || p.id !== c.ownerId || p.fieldTransplants?.[c.slot] !== c || !live(w, p, c)) return;
  c.zoneId = z.id;
}
function candidate(w: World, p: Player, c: FieldTransplantCast): GroundZone | undefined {
  if (c.used || !live(w, p, c)) return undefined;
  return w.groundZones.find(
    (z) => z.id === c.zoneId && z.ownerId === p.id && z.remaining > 0 && (z.armRemaining ?? 0) <= 0,
  );
}
function blocked(p: Player): string | null {
  return hasBuff(p, 'stun')
    ? 'Stunned'
    : hasBuff(p, 'silence')
      ? 'Silenced'
      : p.castTimer > 0
        ? 'Casting'
        : p.glide
          ? 'Moving'
          : p.shove
            ? 'Displaced'
            : null;
}
export function transplantDestination(w: World, p: Player) {
  const range = Math.min(TRANSPLANT_REACH, Math.min(w.arena.w, w.arena.h) * 0.4);
  return {
    x: wrapCoord(p.pos.x + p.aim.x * range, w.arena.w),
    y: wrapCoord(p.pos.y + p.aim.y * range, w.arena.h),
  };
}
export function fieldTransplantViews(w: World, p: Player) {
  return Object.values(p.fieldTransplants ?? {}).flatMap((c) => {
    const z = candidate(w, p, c);
    if (!z) return [];
    return [
      {
        reach: Math.min(TRANSPLANT_REACH, Math.min(w.arena.w, w.arena.h) * 0.4),
        slot: c.slot,
        zoneId: z.id,
        from: { ...z.pos },
        to: transplantDestination(w, p),
        radius: z.radius,
        remaining: z.remaining,
        blocked: blocked(p),
      },
    ];
  });
}
export function tryFieldTransplant(w: World, p: Player, slot: ExtSlot, fresh: boolean): boolean {
  const c = p.fieldTransplants?.[slot];
  if (!c) return false;
  const z = candidate(w, p, c);
  if (!z) return false;
  const reprise = shadowRepriseView(w, p);
  if (reprise?.slot === slot && reprise.armed) return false;
  if (!fresh || w.tick <= c.createdTick || blocked(p)) return true;
  c.used = true;
  z.pos = transplantDestination(w, p);
  z.zoneFollow = 0;
  z.followAcquired = true;
  delete z.followId;
  w.events.push({
    t: 'skillArea',
    sourceId: p.id,
    side: 'player',
    color: 0x85e6a1,
    area: {
      kind: 'circle',
      origin: { ...z.pos },
      angle: 0,
      range: 0,
      radius: z.radius,
      halfAngle: 0,
    },
  });
  return true;
}
export function maintainFieldTransplants(w: World): void {
  for (const p of w.players)
    for (const [slot, c] of Object.entries(p.fieldTransplants ?? {}))
      if (
        !live(w, p, c) ||
        c.used ||
        (c.zoneId !== undefined && !w.groundZones.some((z) => z.id === c.zoneId && z.remaining > 0))
      )
        delete p.fieldTransplants![slot as ExtSlot];
}
