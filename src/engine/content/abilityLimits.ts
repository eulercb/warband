/** Shared player-only cadence/geometry rules. Bosses, world size and camera are unchanged. */
import type { PlayerAbilityDef } from './classes';
import type { Player, ExtSlot } from '../core/types';
import { ARENA_W, ARENA_H, BASIC_CD_FLOOR, ATTACK_CD_SCALE, ZONE_ARM_MAX } from '../core/constants';
export const SPECIAL_CD_FLOOR = 4;
export const EFFECT_RECOVERY = 2;
const nativeScale = (a: Omit<PlayerAbilityDef, 'slot'> & { slot?: ExtSlot }) =>
  a.slot && !a.slot.startsWith('sub') && ['meleeCone', 'projectile', 'pbaoe'].includes(a.kind)
    ? ATTACK_CD_SCALE
    : 1;
/** Ordinary ability reductions share one budget; grands cannot reset its spent fraction. */
export function ordinaryRecharge(a: PlayerAbilityDef, factor: number): void {
  if (a.slot === 'basic') {
    a.cooldown *= factor;
    return;
  }
  const base = (a.rechargeBase ?? a.cooldown) * nativeScale(a);
  const minimum = base <= 6 ? 1 : base <= 12 ? 0.8 : 0.7;
  const previous = a.ordinaryRecharge ?? 1;
  const next = Math.max(minimum, previous * factor);
  a.cooldown *= next / previous;
  a.ordinaryRecharge = next;
}
/** Readiness, target poison and finite bubbles are consumable payloads, not continuous protection. */
export function persistentDuration(a: Omit<PlayerAbilityDef, 'slot'>): number {
  let duration = Math.max(
    a.components ? 0 : (a.zoneDuration ?? 0),
    a.recoveryZone?.duration ?? 0,
    a.frontGuard?.duration ?? 0,
    a.mirrorImages?.duration ?? 0,
    a.components ? 0 : (a.grantsFlight ?? 0),
    a.iframes ?? 0,
    a.steadfastDuration ?? 0,
    a.stun ?? 0,
    a.freeze ?? 0,
    a.bloodRage ?? 0,
    a.wolfHunt ?? 0,
    a.paladinAura ? a.paladinAura.duration + 2 : 0,
  );
  if (!a.components && (a.buffDamageMult || a.buffDefMult || a.buffMoveMult))
    duration = Math.max(duration, a.buffDuration ?? (a.kind === 'buffAlly' ? 6 : 4));
  for (const e of a.components?.effects ?? []) {
    if (e.kind === 'zone') duration = Math.max(duration, e.zone.duration);
    if (e.kind === 'buff' || e.kind === 'flight') duration = Math.max(duration, e.duration);
  }
  return duration;
}
export function rechargeFloor(
  a: Omit<PlayerAbilityDef, 'slot'>,
  slot?: ExtSlot,
  castMult = 1,
): number {
  if (slot === 'basic') return BASIC_CD_FLOOR;
  const duration = persistentDuration(a);
  // A rooted cast or arming marker delays when a persistent effect actually starts.
  return Math.max(
    SPECIAL_CD_FLOOR,
    duration > 0
      ? duration +
          EFFECT_RECOVERY +
          (a.castTime ?? 0) * castMult +
          (a.zoneDuration ? ZONE_ARM_MAX : 0)
      : 0,
  );
}
export function effectiveRecharge(
  a: Omit<PlayerAbilityDef, 'slot'> & { slot?: ExtSlot },
  cdMult = 1,
  castMult = 1,
  slot = a.slot,
): number {
  return Math.max(rechargeFloor(a, slot, castMult), a.cooldown * cdMult);
}
export function refundRecharge(p: Player, slot: ExtSlot, seconds: number): number {
  const before = p.cooldowns[slot] ?? 0;
  const after = Math.max(p.rechargeLocks?.[p.classId]?.[slot] ?? 0, before - seconds, 0);
  p.cooldowns[slot] = Math.min(before, after);
  return before - p.cooldowns[slot];
}
/** Keep each endpoint in an unambiguous short arc of the torus, even after stacked upgrades. */
export function boundedAbility<T extends Omit<PlayerAbilityDef, 'slot'>>(
  a: T,
  arena = { w: ARENA_W, h: ARENA_H },
): T {
  const short = Math.min(arena.w, arena.h, ARENA_H);
  const out = { ...a };
  const reach =
    a.kind === 'blink' || a.kind === 'dash'
      ? short * 0.42
      : a.kind === 'groundZone'
        ? short * 0.4
        : a.kind === 'meleeCone'
          ? short * 0.2
          : undefined;
  const area =
    short *
    ((a.zoneTickHeal ?? 0) > 0 ||
    a.kind === 'heal' ||
    (a.absorption != null && a.absorption.target !== 'self')
      ? 0.32
      : 0.24);
  if (out.range != null && reach != null) out.range = Math.min(out.range, reach);
  if (out.radius != null) out.radius = Math.min(out.radius, area);
  if (out.maxRange != null) out.maxRange = Math.min(out.maxRange, short * 0.9);
  if (out.impactRadius != null) out.impactRadius = Math.min(out.impactRadius, short * 0.24);
  if (out.allyWard)
    out.allyWard = { ...out.allyWard, range: Math.min(out.allyWard.range, short * 0.32) };
  if (out.relayHeal)
    out.relayHeal = { ...out.relayHeal, radius: Math.min(out.relayHeal.radius, short * 0.32) };
  if (out.crossingGuard)
    out.crossingGuard = {
      ...out.crossingGuard,
      width: Math.min(out.crossingGuard.width, short * 0.12),
    };
  if (out.absorption?.curseSiphon)
    out.absorption = {
      ...out.absorption,
      curseSiphon: {
        ...out.absorption.curseSiphon,
        range: Math.min(out.absorption.curseSiphon.range, short * 0.24),
      },
    };
  if (out.recoveryZone)
    out.recoveryZone = {
      ...out.recoveryZone,
      radius: Math.min(out.recoveryZone.radius, short * 0.32),
    };
  if (out.paladinAura)
    out.paladinAura = {
      ...out.paladinAura,
      radius: Math.min(out.paladinAura.radius, short * 0.32),
    };
  if (out.warCry) out.warCry = { ...out.warCry, radius: Math.min(out.warCry.radius, short * 0.24) };
  if (out.closeBurst)
    out.closeBurst = {
      ...out.closeBurst,
      radius: Math.min(out.closeBurst.radius, short * 0.24),
      range: Math.min(out.closeBurst.range, short * 0.2),
    };
  if (out.components)
    out.components = {
      ...out.components,
      delivery: {
        ...out.components.delivery,
        range: out.range,
        radius: out.radius,
        impactRadius: out.impactRadius,
        maxRange: out.maxRange,
      },
      effects: out.components.effects.map((e) =>
        e.kind === 'zone'
          ? {
              ...e,
              zone: {
                ...e.zone,
                radius: Math.min(e.zone.radius, short * ((e.zone.tickHeal ?? 0) > 0 ? 0.32 : 0.24)),
              },
            }
          : e.kind === 'allyWard' && out.allyWard
            ? { ...e, ward: { ...out.allyWard } }
            : e.kind === 'relayHeal' && out.relayHeal
              ? { ...e, relay: { ...out.relayHeal } }
              : e.kind === 'crossingGuard' && out.crossingGuard
                ? { ...e, guard: { ...out.crossingGuard } }
                : e.kind === 'absorption' && out.absorption
                  ? { ...e, grant: { ...out.absorption } }
                  : e.kind === 'paladinAura' && out.paladinAura
                    ? { ...e, aura: { ...out.paladinAura } }
                    : e.kind === 'warCry' && out.warCry
                      ? { ...e, cry: { ...out.warCry } }
                      : e.kind === 'closeBurst' && out.closeBurst
                        ? { ...e, burst: { ...out.closeBurst } }
                        : e.kind === 'recovery' && out.recoveryZone
                          ? { ...e, grove: { ...out.recoveryZone } }
                          : e,
      ),
    };
  return out;
}
