/**
 * Warband — damage / heal application, buff helpers and threat contribution.
 * Pure functions operating on entities + an event sink. No world import (to
 * keep this decoupled and trivially unit-testable).
 */
import type {
  Player,
  Boss,
  Add,
  Buff,
  BuffKind,
  GameEvent,
  Side,
  StunDr,
  Vec2,
} from '../core/types';
import { getClass } from '../content/classes';
import {
  HEAL_THREAT_FACTOR,
  STUN_DR_FACTOR,
  STUN_DR_WINDOW,
  STUN_DR_FLOOR,
  BOSS_REGEN_LOCKOUT_S,
  REVIVE_TIME,
  REVIVE_MIN_TIME,
  REVIVE_COREVIVE_BONUS,
  REVIVE_COREVIVE_FALLOFF,
} from '../core/constants';

/** Minimal structural sink so combat needn't import the World. */
export interface EventSink {
  events: GameEvent[];
}

/**
 * item 5 — per-hit modifiers a caller (the World, which owns the seeded RNG +
 * positions) computes and hands to the damage functions: an extra outgoing-damage
 * `mult` (crit × backstab) and the flags that drive the floating-combat-text
 * styling. All optional; absent = an ordinary hit.
 */
export interface HitMods {
  mult?: number;
  crit?: boolean;
  backstab?: boolean;
}

/**
 * item 10 — co-revive rate multiplier for `reviverCount` allies reviving the SAME
 * downed hero at once. One reviver is the baseline (1×). Each ADDITIONAL reviver adds
 * a share of REVIVE_COREVIVE_BONUS that decays geometrically by REVIVE_COREVIVE_FALLOFF
 * (the k-th extra reviver contributes BONUS·FALLOFF^(k-1)), so co-reviving helps with
 * diminishing returns rather than stacking without bound. The multiplier is capped so
 * the effective revive can never complete faster than REVIVE_MIN_TIME — never instant.
 * Pure + deterministic (no RNG). `reviverCount <= 1` → 1 (no bonus).
 */
export function coReviveSpeed(reviverCount: number): number {
  const extra = Math.max(0, Math.floor(reviverCount) - 1);
  if (extra === 0) return 1;
  // Closed-form geometric sum of the diminishing per-reviver bonuses.
  const bonus =
    (REVIVE_COREVIVE_BONUS * (1 - Math.pow(REVIVE_COREVIVE_FALLOFF, extra))) /
    (1 - REVIVE_COREVIVE_FALLOFF);
  const maxSpeed = REVIVE_TIME / REVIVE_MIN_TIME; // cap → the minimum-time floor
  return Math.min(1 + bonus, maxSpeed);
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

/**
 * item 9 — is this entity ROOTED? A rooted boss/add cannot self-move: base
 * movement AND blink / charge / teleport abilities (including the Teleporting
 * affix) are gated while the root holds. It can still turn, cast and be shoved.
 */
export function isRooted(entity: { buffs: Buff[] }): boolean {
  return hasBuff(entity, 'root');
}

/**
 * item 1 — the buff `source` tag on a boss's temporary-invulnerability window
 * (world.tickBossInvuln). A window carrying THIS source also grants crowd-control
 * immunity + cleanse; player i-frames (source 'dash' / 'phoenixCharm') carry the
 * same `invuln` KIND but a different source, so they never gain CC immunity.
 */
export const BOSS_INVULN_SOURCE = 'bossInvuln';

/**
 * item 1 — the crowd-control family a boss invuln window cleanses on entry and
 * blocks for its duration: stun, root, silence and a movement SLOW (moveSpeed
 * < 1). A haste (moveSpeed > 1) or any non-control buff is left untouched, so a
 * boss self-haste / affix accel survives and only the paralysing debuffs are
 * purged. Derived from the buff KIND, so a future control debuff routed through
 * `applyBuff` is caught here without per-call-site wiring.
 */
export function isControlBuff(b: Buff): boolean {
  return (
    b.kind === 'stun' ||
    b.kind === 'root' ||
    b.kind === 'silence' ||
    (b.kind === 'moveSpeed' && b.mult < 1)
  );
}

/**
 * item 1 — is this entity currently immune to crowd control? True only while a
 * boss's invuln window (source BOSS_INVULN_SOURCE) is up. Scoped to the boss
 * mechanic on purpose: player i-frames don't confer CC immunity.
 */
export function isCcImmune(entity: { buffs: Buff[] }): boolean {
  for (const b of entity.buffs) {
    if (b.kind === 'invuln' && b.source === BOSS_INVULN_SOURCE) return true;
  }
  return false;
}

/**
 * item 1 — strip every crowd-control debuff (see isControlBuff) from an entity.
 * Called when a boss invuln window opens so a boss frozen/slowed/rooted going in
 * comes out of it free to act; leaves beneficial buffs (haste, wards) in place.
 */
export function cleanseControl(entity: { buffs: Buff[] }): void {
  for (let i = entity.buffs.length - 1; i >= 0; i--) {
    if (isControlBuff(entity.buffs[i])) entity.buffs.splice(i, 1);
  }
}

/** Apply/refresh a buff, de-duping by `source`. */
export function applyBuff(entity: { buffs: Buff[] }, buff: Buff): void {
  // item 1 — a CC-immune target (a boss in its invuln window) rejects incoming
  // crowd control outright. Cheap KIND check first, so non-control buffs (and
  // every player, who is never CC-immune) skip the buff scan entirely.
  if (isControlBuff(buff) && isCcImmune(entity)) return;
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
 * Apply a stun honoring diminishing returns. The falloff is MAGNITUDE-RELATIVE:
 * every landed stun banks its requested `seconds` onto the target's rolling
 * `load`, and an incoming stun keeps only `STUN_DR_FACTOR ^ (load / seconds)` —
 * the load already banked within `STUN_DR_WINDOW`, measured in units of THIS
 * stun's own duration. So a rare, long stun divides a small banked load by its
 * big duration and lands almost full, even while a stream of short, frequent
 * stuns keeps the window alive — the frequent-weak-starves-rare-strong bug — yet
 * a chain of the SAME duration still halves each time (`load/seconds` equals the
 * chain length, so a uniform chain is byte-identical to the old count falloff).
 * Once the effective duration would fall under `STUN_DR_FLOOR` the stun is
 * resisted entirely (a `stunResist` event fires so players can read it — once per
 * window, so rider spam doesn't flood the FX).
 *
 * Two deliberate asymmetries in the defender's favor:
 *  - Only stuns that actually LAND bank load / refresh the window. Resisted
 *    attempts do not, so spamming a freeze rider can't hold a target stun-immune
 *    forever — the falloff always recovers `STUN_DR_WINDOW` after the last land.
 *  - A shorter chained stun never overwrites a longer one still ticking: if the
 *    target is already stunned for at least the new effective duration, the
 *    attempt is wasted (returns 0, banks no load).
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
  // item 1 — a boss in its invuln window shrugs off stuns/freezes entirely. Guard
  // here (before the DR bookkeeping) so a blocked attempt banks no load and the
  // caller sees 0; a one-shot "Resisted" cue keeps the immunity readable.
  if (isCcImmune(target)) {
    const dr0 = (target.stunDr ??= { load: 0, window: 0 });
    if (!dr0.announced) {
      dr0.announced = true;
      sink.events.push({ t: 'stunResist', id: target.id, pos: { ...target.pos } });
    }
    return 0;
  }
  const dr = (target.stunDr ??= { load: 0, window: 0 });
  const effective = seconds * Math.pow(STUN_DR_FACTOR, dr.load / seconds);
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
  dr.load += seconds; // bank this stun's requested seconds (uniform chain ⇒ old falloff)
  dr.window = STUN_DR_WINDOW;
  dr.announced = false;
  applyBuff(target, makeBuff('stun', 0, effective, source));
  return effective;
}

/** Tick a target's stun-DR window; when it runs out, the banked load fully resets. */
export function tickStunDr(target: { stunDr?: StunDr }, dt: number): void {
  const dr = target.stunDr;
  if (!dr || dr.window <= 0) return;
  dr.window -= dt;
  if (dr.window <= 0) {
    dr.load = 0;
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
  mods?: HitMods,
): number {
  // Boss temporary-invulnerability (item 5): while an 'invuln' window is up the
  // boss soaks nothing — no HP change, no threat, no regen-lockout. A muted "0"
  // hit still spawns so the strike reads as absorbed rather than dropped.
  if (hasBuff(boss, 'invuln')) {
    sink.events.push({
      t: 'hit',
      pos: { x: boss.pos.x, y: boss.pos.y },
      amount: 0,
      targetId: boss.id,
      side: 'boss',
    });
    return 0;
  }
  // Honor the boss's own damage-taken buffs (Brace / Petrify / Regrow / Aegis…),
  // so a boss defensive cooldown actually mitigates incoming damage. `mods.mult`
  // folds in the crit × backstab bonus (item 5).
  const outgoing =
    baseDamage *
    (mods?.mult ?? 1) *
    buffMult(source, 'damageDealt') *
    source.damageMult *
    buffMult(boss, 'damageTaken');
  const before = boss.hp;
  boss.hp -= outgoing;
  const effective = Math.max(0, before - Math.max(boss.hp, 0));
  source.stats.damageDealt += effective;
  // Record recently-soaked damage so a `barbed` affix can scale its thorn burst
  // to how hard the band is hitting (decays each tick in world.tickBossAffixes).
  boss.recentDamageTaken = (boss.recentDamageTaken ?? 0) + effective;
  // Suppress passive regen while the band keeps up the pressure (world.updateBoss
  // gates on this), so a regenerating boss can never out-heal a committed party.
  if (effective > 0) boss.regenLockout = BOSS_REGEN_LOCKOUT_S;
  addDamageThreat(source, outgoing);
  sink.events.push({
    t: 'hit',
    pos: { x: boss.pos.x, y: boss.pos.y },
    amount: outgoing,
    targetId: boss.id,
    side: 'boss',
    crit: mods?.crit,
    backstab: mods?.backstab,
  });
  return outgoing;
}

/** Player deals damage to an add (no boss threat). Returns outgoing damage. */
export function damageAdd(
  sink: EventSink,
  source: Player,
  add: Add,
  baseDamage: number,
  mods?: HitMods,
): number {
  const outgoing =
    baseDamage * (mods?.mult ?? 1) * buffMult(source, 'damageDealt') * source.damageMult;
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
    crit: mods?.crit,
    backstab: mods?.backstab,
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
    // Score credit is uniform for any attributed heal (#60): whether it's a
    // dedicated heal, a `healOnUse` on a mobility skill, or a `lifestealFrac`
    // drain, the caster's participation score counts the same. Threat, however,
    // only accrues for healing SOMEONE ELSE — a self-heal (source === target)
    // generates none, so a hero can't passively tank the boss by patching itself.
    // Previously the self-heal levers passed source = null and so scored/threated
    // nothing, splitting a heal's bookkeeping by which era its mechanic shipped in.
    source.stats.healingDone += effective;
    if (source !== target) addHealThreat(source, effective);
  }
  sink.events.push({
    t: 'heal',
    pos: { x: target.pos.x, y: target.pos.y },
    amount: effective,
    targetId: target.id,
  });
  return effective;
}

/**
 * Heal the boss (burst self-heal / Life-Drain). The single choke point for a
 * boss's ACTIVE healing, so progression-aware damping (item 2, `boss.healScale`)
 * applies here — an early/weak fight keeps only a fraction of the heal, a late
 * fight keeps it all. Passive regen has its own lockout+cap path and is untouched.
 */
export function healBoss(boss: Boss, amount: number): void {
  boss.hp = Math.min(boss.maxHp, boss.hp + amount * (boss.healScale ?? 1));
}

// ---------------------------------------------------------------------------
// Buff constructors (shared)
// ---------------------------------------------------------------------------

export function makeBuff(kind: BuffKind, mult: number, duration: number, source: string): Buff {
  return { kind, mult, remaining: duration, source };
}

export type { Side };
