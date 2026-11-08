import { boundedAbility } from './abilityLimits';
import type { AbilityKind, PlayerAbilityDef } from './classes';
export const BLOOD_PRICE = 0.02;
export const BLOOD_LEECH = 0.2;
export const HUNT_STEP = 120;
export const FLOW_EXTENSION_CAP = 1;
export const FLOW_REACH = 30,
  FLOW_AREA = 35,
  FLOW_STUN = 0.6;
export const FLOW_FORCE = 40,
  FLOW_FORCE_CAP = 260;
/** Resolve capped cone reach and its existing-force fallback for both combat and readouts. */
export function flowConeEffects(ab: Partial<PlayerAbilityDef>): {
  range: number;
  knockback?: number;
  pull?: number;
} {
  const base = {
    ...ab,
    name: '',
    slot: ab.slot ?? ('sub1' as const),
    kind: 'meleeCone' as const,
    cooldown: 0,
    damage: 0,
    range: ab.range ?? 70,
  };
  const range = base.range + FLOW_REACH;
  if (boundedAbility({ ...base, range }).range > boundedAbility(base).range) return { range };
  if ((ab.knockback ?? 0) > 0)
    return {
      range,
      knockback: Math.max(ab.knockback!, Math.min(FLOW_FORCE_CAP, ab.knockback! + FLOW_FORCE)),
    };
  if ((ab.pull ?? 0) > 0)
    return { range, pull: Math.max(ab.pull!, Math.min(FLOW_FORCE_CAP, ab.pull! + FLOW_FORCE)) };
  return { range };
}

export function flowPayoff(
  kind: AbilityKind,
  windup = 0,
  geometry: Partial<PlayerAbilityDef> = {},
): string {
  const parts: string[] = [];
  if (windup > 0) parts.push('no wind-up');
  const base = {
    ...geometry,
    name: '',
    slot: geometry.slot ?? ('sub1' as const),
    kind,
    cooldown: 0,
    damage: 0,
  };
  if (kind === 'projectile') {
    if ((geometry.freeze ?? 0) < FLOW_STUN) parts.push('at least 0.6s stun on hit');
  } else if (kind === 'meleeCone') {
    const before = boundedAbility({ ...base, range: geometry.range ?? 70 }).range;
    const effects = flowConeEffects(geometry);
    const after = boundedAbility({ ...base, ...effects }).range;
    if (after > before) parts.push(`+${Math.round(after - before)}u cone reach`);
    const push = (effects.knockback ?? geometry.knockback ?? 0) - (geometry.knockback ?? 0);
    const pull = (effects.pull ?? geometry.pull ?? 0) - (geometry.pull ?? 0);
    if (push > 0) parts.push(`+${Math.round(push)}u push`);
    else if (pull > 0) parts.push(`+${Math.round(pull)}u pull`);
  } else {
    const before = boundedAbility({
      ...base,
      radius: geometry.radius ?? (kind === 'groundZone' ? 130 : 150),
    }).radius;
    const after = boundedAbility({ ...base, radius: (geometry.radius ?? 130) + FLOW_AREA }).radius;
    if (after > before)
      parts.push(
        `+${Math.round(after - before)}u ${kind === 'groundZone' ? 'field' : 'burst'} radius`,
      );
    if (
      kind === 'groundZone' &&
      ((geometry.slowMult ?? 1) > 0.6 || (geometry.slowDuration ?? 0) < 0.8)
    )
      parts.push('slow to 60% for at least 0.8s');
  }
  return parts.length ? `spend Flow for ${parts.join(' and ')}` : 'consumes Flow';
}

/** Name only the geometry and payload that the receiving finisher actually uses. */
export function momentumPayoff(kind: AbilityKind): string {
  if (kind === 'meleeCone') return 'spend Momentum for +10% damage and +8u reach per stack';
  if (kind === 'groundZone')
    return 'spend Momentum for +10% damage per tick and +10u field radius per stack';
  if (kind === 'pbaoe') return 'spend Momentum for +10% damage and +10u burst radius per stack';
  return 'spend Momentum for +10% damage per stack';
}
export function flowPreparation(kind: AbilityKind, duration: string): string {
  const trigger =
    kind === 'dash'
      ? 'dashing'
      : kind === 'blink'
        ? 'blinking'
        : kind === 'selfBuff'
          ? 'centering yourself'
          : 'casting';
  return `${trigger} readies Flow for ${duration}`;
}

export function momentumPreparation(duration: number, hunt = 0): string | null {
  const seconds = (v: number) => `${Math.round(v * 100) / 100}s`;
  if (hunt >= duration) return null;
  if (hunt > 0)
    return `after the ${seconds(hunt)} hunt, melee hits build Momentum for the final ${seconds(duration - hunt)}`;
  return `melee hits build up to 3 momentum during ${seconds(duration)}; marked finishers gain +10% dmg per stack (at most 1 stack per 0.4s)`;
}
