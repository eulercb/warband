/** A paid Blink can reclaim one occupied patch of ground; it never cancels an attack. */
import type { World } from '../world/world';
import type { GroundZone, Player, Vec2, ExtSlot } from '../core/types';
import type { PlayerAbilityDef } from '../content/classes';
import { dist, wrapCoord } from '../core/torus';
import { normalize } from '../core/math';
import { hasBuff, isFlying, zoneReachesAir } from './combat';
import { abilityForSlot } from './abilities';
export const DISPEL_REACH = 110;
export const SILENCE_BREAK_RECHARGE = 2;
const WARDING_SLOTS: ExtSlot[] = ['a1', 'a2', 'a3', 'sub1', 'sub2'];
export function wardingSlots(p: Player): ExtSlot[] {
  return WARDING_SLOTS.filter((slot) => {
    const ab = abilityForSlot(p, slot);
    return !!ab && carriesDispel(ab);
  });
}
export function carriesDispel(ab: Omit<PlayerAbilityDef, 'slot'>): boolean {
  return (
    ab.kind === 'blink' &&
    (ab.components
      ? ab.components.delivery.kind === 'blink' &&
        ab.components.effects.some((e) => e.kind === 'dispelField')
      : !!ab.dispelField)
  );
}
export function blinkArrival(w: World, p: Player, ab: PlayerAbilityDef): Vec2 {
  const dir = normalize(ab.flowAim ?? p.aim);
  const range = ab.range ?? (ab.components ? 220 : 250);
  return {
    x: wrapCoord(p.pos.x + dir.x * range, w.arena.w),
    y: wrapCoord(p.pos.y + dir.y * range, w.arena.h),
  };
}
/** Center proximity is intentional: touching a huge pool's edge cannot erase it. */
export function arrivalField(w: World, pos: Vec2): GroundZone | undefined {
  return w.groundZones
    .filter(
      (z) =>
        z.side === 'boss' &&
        z.remaining > 0 &&
        (z.armRemaining ?? 0) <= 0 &&
        (z.damagePerTick > 0 || z.slowMult < 1 || (z.silence ?? 0) > 0) &&
        dist(pos, z.pos) <= DISPEL_REACH,
    )
    .sort((a, b) => dist(pos, a.pos) - dist(pos, b.pos) || a.id - b.id)[0];
}
/** Departure threats take priority over reclaiming a remote landing. */
function departureField(w: World, p: Player, from: Vec2): GroundZone | undefined {
  const departure = w.groundZones.filter(
    (z) =>
      z.side === 'boss' &&
      z.remaining > 0 &&
      (z.armRemaining ?? 0) <= 0 &&
      (z.damagePerTick > 0 || z.slowMult < 1 || (z.silence ?? 0) > 0) &&
      dist(from, z.pos) <= z.radius + p.radius,
  );
  const rank = (z: GroundZone): number =>
    !isFlying(p) || zoneReachesAir(z) ? ((z.silence ?? 0) > 0 ? 0 : 1) : 2;
  return departure.sort(
    (a, b) => rank(a) - rank(b) || dist(from, a.pos) - dist(from, b.pos) || a.id - b.id,
  )[0];
}
export function wardingTarget(w: World, p: Player, from: Vec2, to: Vec2): GroundZone | undefined {
  return departureField(w, p, from) ?? arrivalField(w, to);
}

export function dispelArrivalField(w: World, p: Player, ab: PlayerAbilityDef, from: Vec2): void {
  if (!carriesDispel(ab) || dist(from, p.pos) < 0.001) return;
  const z = wardingTarget(w, p, from, p.pos);
  if (z) {
    w.groundZones = w.groundZones.filter((field) => field !== z);
    w.events.push({ t: 'fieldDispel', pos: { ...z.pos }, radius: z.radius });
  }
  if (hasBuff(p, 'silence')) {
    p.buffs = p.buffs.filter((b) => b.kind !== 'silence');
    p.cooldowns[ab.slot] = (p.cooldowns[ab.slot] ?? 0) + SILENCE_BREAK_RECHARGE;
    const locks = ((p.rechargeLocks ??= {})[p.classId] ??= {});
    locks[ab.slot] = (locks[ab.slot] ?? 0) + SILENCE_BREAK_RECHARGE;
    w.events.push({ t: 'silenceBreak', pos: { ...p.pos } });
  }
}
/** Public target geometry only; peers use the same target the host will remove. */
export function wardingViews(w: World, p: Player) {
  if (
    p.state !== 'alive' ||
    p.hp <= 0 ||
    p.castTimer > 0 ||
    p.glide ||
    p.shove ||
    hasBuff(p, 'stun')
  )
    return [];
  const seen = new Set<number>();
  return wardingSlots(p).flatMap((slot) => {
    const ab = abilityForSlot(p, slot);
    if (!ab || (p.cooldowns[slot] ?? 0) > 0 || (hasBuff(p, 'root') && !ab.steadfastDuration))
      return [];
    // Exchanging copies may adjust their landing around bodies/cover. Do not promise a remote target before that placement resolves.
    const z = ab.swap
      ? departureField(w, p, p.pos)
      : wardingTarget(w, p, p.pos, blinkArrival(w, p, ab));
    if (!z || seen.has(z.id)) return [];
    seen.add(z.id);
    return [{ id: z.id, pos: { ...z.pos }, radius: z.radius }];
  });
}
