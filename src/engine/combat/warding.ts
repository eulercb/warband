/** A paid Blink can reclaim one occupied patch of ground; it never cancels an attack. */
import type { World } from '../world/world';
import type { GroundZone, Player, Vec2, ExtSlot } from '../core/types';
import type { PlayerAbilityDef } from '../content/classes';
import { dist, wrapCoord } from '../core/torus';
import { normalize } from '../core/math';
import { hasBuff, zoneReachesAir } from './combat';
import { abilityForSlot } from './abilities';
export const DISPEL_REACH = 110;
function carriesDispel(ab: PlayerAbilityDef): boolean {
  return (
    ab.kind === 'blink' &&
    (ab.components ? ab.components.effects.some((e) => e.kind === 'dispelField') : !!ab.dispelField)
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
        !zoneReachesAir(z) &&
        (z.damagePerTick > 0 || z.slowMult < 1 || (z.silence ?? 0) > 0) &&
        dist(pos, z.pos) <= DISPEL_REACH,
    )
    .sort((a, b) => dist(pos, a.pos) - dist(pos, b.pos) || a.id - b.id)[0];
}
export function dispelArrivalField(w: World, p: Player, ab: PlayerAbilityDef): void {
  if (!carriesDispel(ab)) return;
  const z = arrivalField(w, p.pos);
  if (!z) return;
  w.groundZones = w.groundZones.filter((field) => field !== z);
  w.events.push({ t: 'fieldDispel', pos: { ...z.pos }, radius: z.radius });
}
/** Public target geometry only; peers use the same target the host will remove. */
export function wardingViews(w: World, p: Player) {
  if (
    p.state !== 'alive' ||
    p.hp <= 0 ||
    p.castTimer > 0 ||
    p.glide ||
    p.shove ||
    (['stun', 'silence', 'root'] as const).some((kind) => hasBuff(p, kind))
  )
    return [];
  const slots: ExtSlot[] = ['a1', 'a2', 'a3', 'sub1', 'sub2'];
  const seen = new Set<number>();
  return slots.flatMap((slot) => {
    const ab = abilityForSlot(p, slot);
    if (!ab || !carriesDispel(ab) || (p.cooldowns[slot] ?? 0) > 0) return [];
    const z = arrivalField(w, blinkArrival(w, p, ab));
    if (!z || seen.has(z.id)) return [];
    seen.add(z.id);
    return [{ id: z.id, pos: { ...z.pos }, radius: z.radius }];
  });
}
