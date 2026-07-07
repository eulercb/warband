/**
 * Warband — damage / heal application, buff helpers and threat contribution.
 * Pure functions operating on entities + an event sink. No world import (to
 * keep this decoupled and trivially unit-testable).
 */
import type { Player, Boss, Add, Buff, BuffKind, GameEvent, Side, StunDr, Vec2 } from './types';
import { getClass } from './classes';
import { HEAL_THREAT_FACTOR, STUN_DR_FACTOR, STUN_DR_WINDOW, STUN_DR_FLOOR } from './constants';

/** Minimal structural sink so combat needn't import the World. */
export interface EventSink {
  events: GameEvent[];
}

// ---------------------------------------------------------------------------
// Buff helpers
// ---------------------------------------------------------------------------

export function buffMult(entity: { buffs: Buff[] }, kind: BuffKind): number {
  let m = 1;
  for (const b of entity.buffs) if (b.kind === kind) m *= b.mult;
  return m;
}

export function hasBuff(entity: { buffs: Buff[] }, kind: BuffKind): boolean {
  for (const b of entity.buffs) if (b.kind === kind) return true;
  return false;
}

/** Apply/refresh a buff, de-duping by `source`. */
export function applyBuff(entity: { buffs: Buff[] }, buff: Buff): void {
  const existing = entity.buffs.find((b) => b.source === buff.source);
  if (existing) {
    existing.kind = buff.kind;
    existing.mult = buff.mult;
    existing.remaining = buff.remaining;
  } else {
    entity.buffs.push({ ...buff });
  }
}

export function tickBuffs(entity: { buffs: Buff[] }, dt: number): void {
  for (let i = entity.buffs.length - 1; i >= 0; i--) {
    entity.buffs[i].remaining -= dt;
    if (entity.buffs[i].remaining <= 0) entity.buffs.splice(i, 1);
  }
}

// ---------------------------------------------------------------------------
// Stun with diminishing returns
// ---------------------------------------------------------------------------

/** Any entity that can be stunned: players, bosses and adds all match. */
export interface Stunnable {
  buffs: Buff[];
  stunDr?: StunDr;
  id: number;
  pos: Vec2;
}

/**
 * Apply a stun honoring diminishing returns. Each successive stun LANDED on the
 * same target within `STUN_DR_WINDOW` keeps only `STUN_DR_FACTOR` of the
 * previous effective duration; once the effective duration would fall under
 * `STUN_DR_FLOOR` the stun is resisted entirely (a `stunResist` event fires so
 * players can read it — once per window, so rider spam doesn't flood the FX).
 *
 * Two deliberate asymmetries in the defender's favor:
 *  - Only stuns that actually LAND refresh the window. Resisted attempts do
 *    not, so spamming a freeze rider can't hold a target stun-immune forever —
 *    the falloff always recovers `STUN_DR_WINDOW` after the last landed stun.
 *  - A shorter chained stun never overwrites a longer one still ticking: if
 *    the target is already stunned for at least the new effective duration,
 *    the attempt is wasted (returns 0, no DR charge).
 *
 * Returns the effective stun seconds applied (0 = resisted / wasted).
 */
export function applyStun(
  sink: EventSink,
  target: Stunnable,
  seconds: number,
  source: string,
): number {
  if (seconds <= 0) return 0;
  const dr = (target.stunDr ??= { count: 0, window: 0 });
  const effective = seconds * Math.pow(STUN_DR_FACTOR, dr.count);
  if (effective < STUN_DR_FLOOR) {
    if (!dr.announced) {
      dr.announced = true;
      sink.events.push({ t: 'stunResist', id: target.id, pos: { ...target.pos } });
    }
    return 0;
  }
  let longestActive = 0;
  for (const b of target.buffs) {
    if (b.kind === 'stun' && b.remaining > longestActive) longestActive = b.remaining;
  }
  if (longestActive >= effective) return 0; // already stunned for longer
  dr.count += 1;
  dr.window = STUN_DR_WINDOW;
  dr.announced = false;
  applyBuff(target, makeBuff('stun', 0, effective, source));
  return effective;
}

/** Tick a target's stun-DR window; when it runs out, the falloff fully resets. */
export function tickStunDr(target: { stunDr?: StunDr }, dt: number): void {
  const dr = target.stunDr;
  if (!dr || dr.window <= 0) return;
  dr.window -= dt;
  if (dr.window <= 0) {
    dr.count = 0;
    dr.window = 0;
    dr.announced = false;
  }
}

// ---------------------------------------------------------------------------
// Threat contribution
// ---------------------------------------------------------------------------

export function addDamageThreat(source: Player, outgoing: number): void {
  const mult = getClass(source.classId).threatMult;
  source.threat += outgoing * mult;
}

export function addHealThreat(source: Player, effectiveHeal: number): void {
  const mult = getClass(source.classId).threatMult;
  source.threat += effectiveHeal * HEAL_THREAT_FACTOR * mult;
}

// ---------------------------------------------------------------------------
// Damage / heal
// ---------------------------------------------------------------------------

/** Player deals damage to the boss. Returns outgoing damage. */
export function damageBoss(
  sink: EventSink,
  source: Player,
  boss: Boss,
  baseDamage: number,
): number {
  // Honor the boss's own damage-taken buffs (Brace / Petrify / Regrow / Aegis…),
  // so a boss defensive cooldown actually mitigates incoming damage.
  const outgoing =
    baseDamage *
    buffMult(source, 'damageDealt') *
    source.damageMult *
    buffMult(boss, 'damageTaken');
  const before = boss.hp;
  boss.hp -= outgoing;
  const effective = Math.max(0, before - Math.max(boss.hp, 0));
  source.stats.damageDealt += effective;
  addDamageThreat(source, outgoing);
  sink.events.push({
    t: 'hit',
    pos: { x: boss.pos.x, y: boss.pos.y },
    amount: outgoing,
    targetId: boss.id,
    side: 'boss',
  });
  return outgoing;
}

/** Player deals damage to an add (no boss threat). Returns outgoing damage. */
export function damageAdd(sink: EventSink, source: Player, add: Add, baseDamage: number): number {
  const outgoing = baseDamage * buffMult(source, 'damageDealt') * source.damageMult;
  const before = add.hp;
  add.hp -= outgoing;
  const effective = Math.max(0, before - Math.max(add.hp, 0));
  source.stats.damageDealt += effective;
  sink.events.push({
    t: 'hit',
    pos: { x: add.pos.x, y: add.pos.y },
    amount: outgoing,
    targetId: add.id,
    side: 'boss',
  });
  return outgoing;
}

/**
 * Damage a player (from boss/adds/zones). `base` should already include boss
 * damage scaling + soft-enrage. Honors i-frames and damage-taken buffs.
 * Returns damage actually dealt (0 if dodged). Downed/dead take no damage.
 */
export function damagePlayer(sink: EventSink, target: Player, base: number): number {
  if (target.state !== 'alive') return 0;
  if (hasBuff(target, 'invuln')) {
    sink.events.push({ t: 'dodge', id: target.id, pos: { ...target.pos } });
    return 0;
  }
  const dmg = base * buffMult(target, 'damageTaken') * target.damageTakenMult;
  target.hp -= dmg;
  sink.events.push({
    t: 'hit',
    pos: { x: target.pos.x, y: target.pos.y },
    amount: dmg,
    targetId: target.id,
    side: 'player',
  });
  return dmg;
}

/**
 * Heal a player. Only alive players can be healed (downed require revive).
 * Overheal is wasted. Returns effective healing. Adds heal-threat for source.
 */
export function healPlayer(
  sink: EventSink,
  source: Player | null,
  target: Player,
  amount: number,
): number {
  if (target.state !== 'alive') return 0;
  const effective = Math.min(amount, target.maxHp - target.hp);
  if (effective <= 0) return 0;
  target.hp += effective;
  if (source) {
    source.stats.healingDone += effective;
    addHealThreat(source, effective);
  }
  sink.events.push({
    t: 'heal',
    pos: { x: target.pos.x, y: target.pos.y },
    amount: effective,
    targetId: target.id,
  });
  return effective;
}

/** Heal the boss (Lich Life Drain). */
export function healBoss(boss: Boss, amount: number): void {
  boss.hp = Math.min(boss.maxHp, boss.hp + amount);
}

// ---------------------------------------------------------------------------
// Buff constructors (shared)
// ---------------------------------------------------------------------------

export function makeBuff(kind: BuffKind, mult: number, duration: number, source: string): Buff {
  return { kind, mult, remaining: duration, source };
}

export type { Side };
