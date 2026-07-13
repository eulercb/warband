/**
 * Warband — CHAOS FORGE: component-recombination content synthesis. PURE TS.
 *
 * The opt-in "Chaos Forge" run mode invents genuinely NEW content (skills,
 * upgrades, classes, subclasses, bosses, shop items) by breaking existing
 * content down into mechanical COMPONENTS and recombining components from
 * different sources into coherent, balanced, seed-deterministic new content.
 * See docs/CHAOS_FORGE.md for the full design. Sibling to Chaos Draft
 * (kitshuffle.ts, whole-kit swap) and per-run numeric variance (procgen.ts,
 * jitter-in-place): Forge is the "balanced Frankenstein" the other two refused
 * to build.
 *
 * This module is the pure generative core. It is import-cycle-free: it takes
 * BASE defs as arguments (only type imports from the content modules) and folds
 * a shared master seed through the same deterministic primitives the rest of the
 * engine uses (Rng / mixSeed / hashStr / fixed roll vectors) — no Math.random,
 * no Date — so the host and every client synthesize IDENTICAL content.
 *
 * FUTURE-PROOFING (req. 10): decomposition reflects over a def's live field bag
 * rather than a hand-maintained allow-list, so a new ability field flows through
 * the same def→components→def mapping without per-item wiring. Where a field
 * would need executor support that does not exist yet, it is kept on the flat def
 * and skipped LOUDLY (surfaced in the generated description), never silently
 * dropped.
 *
 * This file (phase A) provides the taxonomy, the decompose/recompose round-trip,
 * the balance-pricing weight, the component describer and the name blender. The
 * synthesizers and the active-run registry build on these (phase B+).
 */
import type { ZoneKind, ClassId, AbilitySlot } from '../core/types';
import type { PlayerAbilityDef, AbilityKind, ClassDef } from './classes';
import { Rng, mixSeed, clamp } from '../core/math';
import { hashStr } from './procgen';

// ---------------------------------------------------------------------------
// 1. Component taxonomy — a delivery + an ordered list of effect components
// ---------------------------------------------------------------------------

/**
 * How an ability's effect reaches its target(s). 1:1 with the 10 authored
 * `AbilityKind`s, so a canonical ability decomposes to exactly its own delivery.
 * The delivery carries only GEOMETRIC facets (reach / fan / blast / cast); what
 * HAPPENS at a delivery point lives in the effect list, so the two are freely
 * recombinable (take Multishot's projectile delivery WITHOUT its 3-shot fan).
 */
export type DeliveryKind = AbilityKind;

export interface Delivery {
  kind: DeliveryKind;
  /** Cone reach / dash-blink distance / ground-target or auto-target search radius. */
  range?: number;
  /** pbaoe / landing radius (zone radius lives on the zone effect). */
  radius?: number;
  halfAngleDeg?: number;
  projSpeed?: number;
  /** Projectile fan size — a SEPARABLE facet (Multishot's "3" is droppable). */
  projCount?: number;
  spreadDeg?: number;
  /** Rooted cast before firing (Fireball). Priced into the budget. */
  castTime?: number;
  /** Projectile AoE-on-impact radius — the vehicle for an on-impact payload. */
  impactRadius?: number;
  maxRange?: number;
  /** Dash / blink i-frame window. */
  iframes?: number;
}

/**
 * What happens at a delivery point. Each carries its own numbers AND its own
 * balance weight (see componentValue). Buffs are split per AXIS (def / dmg /
 * move) into separate components so the resistance buff is separable from the
 * damage buff bundled into the same authored `buffAlly`.
 */
export type EffectComponent =
  | { kind: 'damage'; amount: number }
  | { kind: 'heal'; amount: number }
  | { kind: 'healOnUse'; amount: number }
  | { kind: 'landingDamage'; amount: number }
  | { kind: 'lifesteal'; frac: number }
  | { kind: 'stun'; seconds: number }
  | { kind: 'freeze'; seconds: number }
  | { kind: 'slow'; mult: number; duration: number }
  | {
      kind: 'buff';
      target: BuffTarget;
      defMult?: number;
      dmgMult?: number;
      moveMult?: number;
      duration: number;
    }
  | { kind: 'zone'; zone: ZoneSpec };

/** Who a buff component lands on. */
export type BuffTarget = 'self' | 'allies';

/**
 * A lingering ground zone spawned by a `groundZone` delivery OR by a projectile
 * on impact (the flagship's "area that grants a resistance buff to allies"). Its
 * `allyBuff` is the recombination seam: a buff-target-allies component fused into
 * a zone becomes the buff the zone refreshes on allies standing inside it.
 */
export interface ZoneSpec {
  zoneKind: ZoneKind;
  duration: number;
  radius: number;
  tickDamage?: number;
  tickHeal?: number;
  slowMult?: number;
  slowDuration?: number;
  roots?: boolean;
  allyBuff?: { defMult?: number; dmgMult?: number; moveMult?: number; duration: number };
}

/** The recombined form of an ability: one delivery + an ordered effect payload. */
export interface AbilityComponents {
  delivery: Delivery;
  effects: EffectComponent[];
}

/** Deliveries whose damage effect lands as a DIRECT strike (not a zone tick). */
const DIRECT_STRIKE = new Set<DeliveryKind>(['meleeCone', 'projectile', 'pbaoe']);

/** Deliveries that buff/heal an ALLY (auto-targeted) rather than the caster. */
const ALLY_DELIVERIES = new Set<DeliveryKind>(['buffAlly', 'heal']);

// ---------------------------------------------------------------------------
// 2. Decomposition — PlayerAbilityDef → components (reflective, future-proof)
// ---------------------------------------------------------------------------

/**
 * Break an authored/rolled ability into its delivery + effect components. Reads
 * the def's live fields, so a NEW field a future update adds flows through here
 * (extend the switch once, and every generator picks it up). The `slot`, `name`
 * and `cooldown` are identity/budget, not components, so they are not carried.
 *
 * PURE: (def) → components. Canonical content round-trips (recompose∘decompose
 * reproduces the resolvable def), so authored skills run through the exact same
 * executor path as synthesized ones when Forge is on.
 */
export function decompose(def: Omit<PlayerAbilityDef, 'slot'>): AbilityComponents {
  const kind = def.kind;
  const delivery: Delivery = { kind };
  if (def.range != null) delivery.range = def.range;
  if (def.halfAngleDeg != null) delivery.halfAngleDeg = def.halfAngleDeg;
  if (def.projSpeed != null) delivery.projSpeed = def.projSpeed;
  if (def.projCount != null) delivery.projCount = def.projCount;
  if (def.spreadDeg != null) delivery.spreadDeg = def.spreadDeg;
  if (def.castTime != null) delivery.castTime = def.castTime;
  if (def.impactRadius != null) delivery.impactRadius = def.impactRadius;
  if (def.maxRange != null) delivery.maxRange = def.maxRange;
  if (def.iframes != null) delivery.iframes = def.iframes;
  // pbaoe / dash-landing radius rides the delivery; a groundZone's radius rides
  // its zone effect instead (see below), so the two never fight over `radius`.
  if (def.radius != null && kind !== 'groundZone') delivery.radius = def.radius;

  const effects: EffectComponent[] = [];

  if (kind === 'groundZone') {
    // The whole zone (footprint, ticks, snare, root, and any ally buff) is one
    // component, so a projectile can adopt it wholesale as an on-impact payload.
    const zone: ZoneSpec = {
      zoneKind: def.zoneKind ?? (def.zoneTickHeal ? 'sanctuary' : 'rainOfArrows'),
      duration: def.zoneDuration ?? 4,
      radius: def.radius ?? 130,
    };
    if (def.zoneTickDamage) zone.tickDamage = def.zoneTickDamage;
    if (def.zoneTickHeal) zone.tickHeal = def.zoneTickHeal;
    if (def.slowMult != null && def.slowMult < 1) {
      zone.slowMult = def.slowMult;
      zone.slowDuration = def.slowDuration ?? 2;
    }
    if (def.roots) zone.roots = true;
    effects.push({ kind: 'zone', zone });
  } else {
    // Direct-strike payload: damage, then on-hit riders.
    if (def.damage > 0 && kind === 'heal') {
      effects.push({ kind: 'heal', amount: def.damage });
    } else if (def.damage > 0 && DIRECT_STRIKE.has(kind)) {
      effects.push({ kind: 'damage', amount: def.damage });
    }
    if (def.landingDamage) effects.push({ kind: 'landingDamage', amount: def.landingDamage });
    if (def.stun) effects.push({ kind: 'stun', seconds: def.stun });
    if (def.freeze) effects.push({ kind: 'freeze', seconds: def.freeze });
    if (def.slowMult != null && def.slowMult < 1) {
      effects.push({ kind: 'slow', mult: def.slowMult, duration: def.slowDuration ?? 2 });
    }
    if (def.lifestealFrac) effects.push({ kind: 'lifesteal', frac: def.lifestealFrac });
    if (def.healOnUse) effects.push({ kind: 'healOnUse', amount: def.healOnUse });
    // Buffs — one component PER axis, so resistance is separable from +damage.
    const target: BuffTarget = ALLY_DELIVERIES.has(kind) ? 'allies' : 'self';
    const dur = def.buffDuration ?? 6;
    if (def.buffDefMult != null) {
      effects.push({ kind: 'buff', target, defMult: def.buffDefMult, duration: dur });
    }
    if (def.buffDamageMult != null) {
      effects.push({ kind: 'buff', target, dmgMult: def.buffDamageMult, duration: dur });
    }
    if (def.buffMoveMult != null) {
      effects.push({ kind: 'buff', target, moveMult: def.buffMoveMult, duration: dur });
    }
  }

  return { delivery, effects };
}

// ---------------------------------------------------------------------------
// 3. Recomposition — components → a resolvable PlayerAbilityDef
// ---------------------------------------------------------------------------

/**
 * Fold a delivery + effects back into flat `PlayerAbilityDef` fields AND stash
 * the component form on `.components`. The flat fields keep every
 * component-unaware consumer working (cooldown gating, HUD, previews, the
 * fallback executor); `.components` drives the rich executor + description. The
 * caller supplies `slot`, `name` and `cooldown` (identity + priced budget).
 *
 * recompose(decompose(def)) reproduces def's resolvable fields (round-trip), so
 * canonical content is unchanged when routed through the component path.
 */
export function recompose(
  comp: AbilityComponents,
  meta: { slot: PlayerAbilityDef['slot']; name: string; cooldown: number },
): PlayerAbilityDef {
  const d = comp.delivery;
  const def: PlayerAbilityDef = {
    slot: meta.slot,
    name: meta.name,
    kind: d.kind,
    cooldown: meta.cooldown,
    damage: 0,
    components: comp,
  };
  if (d.range != null) def.range = d.range;
  if (d.radius != null) def.radius = d.radius;
  if (d.halfAngleDeg != null) def.halfAngleDeg = d.halfAngleDeg;
  if (d.projSpeed != null) def.projSpeed = d.projSpeed;
  if (d.projCount != null) def.projCount = d.projCount;
  if (d.spreadDeg != null) def.spreadDeg = d.spreadDeg;
  if (d.castTime != null) def.castTime = d.castTime;
  if (d.impactRadius != null) def.impactRadius = d.impactRadius;
  if (d.maxRange != null) def.maxRange = d.maxRange;
  if (d.iframes != null) def.iframes = d.iframes;

  for (const e of comp.effects) {
    switch (e.kind) {
      case 'damage':
        // `heal`-delivery damage is a heal; every other strike is `damage`.
        def.damage = e.amount;
        break;
      case 'heal':
        def.damage = e.amount;
        break;
      case 'landingDamage':
        def.landingDamage = e.amount;
        break;
      case 'lifesteal':
        def.lifestealFrac = e.frac;
        break;
      case 'healOnUse':
        def.healOnUse = e.amount;
        break;
      case 'stun':
        def.stun = e.seconds;
        break;
      case 'freeze':
        def.freeze = e.seconds;
        break;
      case 'slow':
        def.slowMult = e.mult;
        def.slowDuration = e.duration;
        break;
      case 'buff':
        if (e.defMult != null) def.buffDefMult = e.defMult;
        if (e.dmgMult != null) def.buffDamageMult = e.dmgMult;
        if (e.moveMult != null) def.buffMoveMult = e.moveMult;
        def.buffDuration = e.duration;
        break;
      case 'zone':
        def.zoneKind = e.zone.zoneKind;
        def.zoneDuration = e.zone.duration;
        def.radius = e.zone.radius;
        if (e.zone.tickDamage) def.zoneTickDamage = e.zone.tickDamage;
        if (e.zone.tickHeal) def.zoneTickHeal = e.zone.tickHeal;
        if (e.zone.slowMult != null) {
          def.slowMult = e.zone.slowMult;
          def.slowDuration = e.zone.slowDuration ?? 2;
        }
        if (e.zone.roots) def.roots = true;
        break;
    }
  }
  return def;
}

// ---------------------------------------------------------------------------
// 4. Balance weight — a per-use "output" that synthesis prices to a budget
// ---------------------------------------------------------------------------

/**
 * Weighted per-use output of a component list — the currency synthesis conserves
 * (a hotter fusion cycles slower). Extends procgen.abilityOutput() with weights
 * for control (stun/freeze/slow seconds) and buffs (magnitude × duration), so a
 * fusion cannot smuggle in free power by stacking utility. Zones are
 * commitment-discounted (they take time to pay out), mirroring the balance
 * engine. Pure and monotonic: adding a component never lowers the value.
 */
export function componentValue(comp: AbilityComponents): number {
  const fan = Math.max(1, comp.delivery.projCount ?? 1);
  let v = 0;
  for (const e of comp.effects) {
    v += effectValue(e, fan);
  }
  // A rooted cast is dead time the caster pays for — a small discount so a
  // slow, heavy nuke prices a touch cheaper than an instant one of equal output.
  const cast = comp.delivery.castTime ?? 0;
  return v * (1 - Math.min(0.25, cast * 0.2));
}

/** Output weight of a single effect (see componentValue). */
function effectValue(e: EffectComponent, fan: number): number {
  switch (e.kind) {
    case 'damage':
      return e.amount * fan;
    case 'landingDamage':
      return e.amount;
    case 'heal':
    case 'healOnUse':
      return e.amount;
    case 'lifesteal':
      return e.frac * 60; // ~ a slice of a strike's worth of sustain
    case 'stun':
      return e.seconds * 55; // hard CC is expensive
    case 'freeze':
      return e.seconds * 50;
    case 'slow':
      return (1 - e.mult) * e.duration * 12; // soft CC, priced by depth × time
    case 'buff':
      return buffValue(e);
    case 'zone':
      return zoneValue(e.zone);
  }
}

/** Buff output: each axis' magnitude × duration, def-mitigation weighted highest. */
function buffValue(e: Extract<EffectComponent, { kind: 'buff' }>): number {
  const dur = e.duration;
  let v = 0;
  if (e.dmgMult != null) v += (e.dmgMult - 1) * 100 * dur * 0.25;
  if (e.moveMult != null) v += (e.moveMult - 1) * 100 * dur * 0.2;
  if (e.defMult != null) v += (1 - e.defMult) * 100 * dur * 0.35;
  return v;
}

/** Zone output: ticks × per-tick payout, commitment-discounted (0.6, as procgen). */
function zoneValue(z: ZoneSpec): number {
  const ticks = (z.duration / 0.5) * 0.6;
  let v = ((z.tickDamage ?? 0) + (z.tickHeal ?? 0)) * ticks;
  if (z.slowMult != null) v += (1 - z.slowMult) * z.duration * 10;
  if (z.roots) v += z.duration * 14;
  if (z.allyBuff) {
    v += buffValue({ kind: 'buff', target: 'allies', ...z.allyBuff }) * 0.6;
  }
  return v;
}

// ---------------------------------------------------------------------------
// 5. Component description — auto-generated card text for a fused skill
// ---------------------------------------------------------------------------

const n = (v: number): string => `${Math.round(v)}`;
const s = (v: number): string => `${Math.round(v * 100) / 100}s`;
const pct = (v: number): string => `${Math.round(v)}%`;

/**
 * Regenerate a player-facing effect line from a component list (there is no human
 * to write copy for a procedurally-fused skill). Reads what actually RESOLVES —
 * the delivery vehicle plus every payload effect — so the card never lies. Used
 * by describeAbility when a synthesized ability carries `.components`; canonical
 * abilities keep the authored flat-field walk untouched.
 */
export function describeComposed(comp: AbilityComponents, cooldown: number): string {
  const parts: string[] = [];
  const d = comp.delivery;

  // Lead with the delivery vehicle so the fusion reads as one coherent ability.
  parts.push(deliveryPhrase(d));

  // Every effect yields a non-empty clause, so no gap-filtering is needed.
  for (const e of comp.effects) parts.push(effectPhrase(e));
  parts.push(`${s(cooldown)} cooldown`);
  return parts.join(' · ');
}

/** A short noun for the delivery vehicle ("single shot", "120° cleave", …). */
function deliveryPhrase(d: Delivery): string {
  switch (d.kind) {
    case 'meleeCone':
      return d.halfAngleDeg ? `${n(d.halfAngleDeg * 2)}° cleave` : 'cleave';
    case 'projectile': {
      const fan = d.projCount ?? 1;
      const shot = fan > 1 ? `${fan}× shot` : 'single shot';
      return (d.impactRadius ?? 0) > 0 ? `${shot}, ${n(d.impactRadius!)}u blast` : shot;
    }
    case 'groundZone':
      return 'ground zone';
    case 'pbaoe':
      return d.radius ? `${n(d.radius)}u burst` : 'burst';
    case 'dash':
      return d.range ? `${n(d.range)}u dash` : 'dash';
    case 'blink':
      return d.range ? `${n(d.range)}u blink` : 'blink';
    case 'selfBuff':
      return 'self-buff';
    case 'buffAlly':
      return 'ally boon';
    case 'heal':
      return 'targeted heal';
    case 'taunt':
      return 'taunt';
  }
}

/** A short clause for one effect, or '' when it carries no player-facing number. */
function effectPhrase(e: EffectComponent): string {
  switch (e.kind) {
    case 'damage':
      return `${n(e.amount)} dmg`;
    case 'heal':
      return `heal ${n(e.amount)}`;
    case 'healOnUse':
      return `heal ${n(e.amount)} self`;
    case 'landingDamage':
      return `${n(e.amount)} landing dmg`;
    case 'lifesteal':
      return `${pct(e.frac * 100)} lifesteal`;
    case 'stun':
      return `${s(e.seconds)} stun`;
    case 'freeze':
      return `${s(e.seconds)} freeze`;
    case 'slow':
      return `slow to ${pct(e.mult * 100)} for ${s(e.duration)}`;
    case 'buff':
      return buffPhrase(e);
    case 'zone':
      return zonePhrase(e.zone);
  }
}

function buffPhrase(e: Extract<EffectComponent, { kind: 'buff' }>): string {
  const who = e.target === 'allies' ? 'allies' : 'self';
  const bits: string[] = [];
  if (e.dmgMult != null) bits.push(`+${pct((e.dmgMult - 1) * 100)} dmg`);
  if (e.moveMult != null) bits.push(`+${pct((e.moveMult - 1) * 100)} move`);
  if (e.defMult != null) bits.push(`${pct((1 - e.defMult) * 100)} less dmg taken`);
  return `${who} ${bits.join(' & ')} for ${s(e.duration)}`;
}

function zonePhrase(z: ZoneSpec): string {
  const bits: string[] = [];
  if (z.tickDamage) bits.push(`${n(z.tickDamage)}/tick dmg`);
  if (z.tickHeal) bits.push(`${n(z.tickHeal)}/tick heal`);
  if (z.roots) bits.push('roots');
  else if (z.slowMult != null) bits.push(`slow to ${pct(z.slowMult * 100)}`);
  if (z.allyBuff) {
    if (z.allyBuff.defMult != null) bits.push(`allies ${pct((1 - z.allyBuff.defMult) * 100)} less dmg taken`);
    if (z.allyBuff.dmgMult != null) bits.push(`allies +${pct((z.allyBuff.dmgMult - 1) * 100)} dmg`);
    if (z.allyBuff.moveMult != null) bits.push(`allies +${pct((z.allyBuff.moveMult - 1) * 100)} move`);
  }
  const body = bits.length > 0 ? bits.join(', ') : 'zone';
  return `${body} (${n(z.radius)}u, ${s(z.duration)})`;
}

// ---------------------------------------------------------------------------
// 6. Name blending — legible + fun fusions of the donor names (req. §2)
// ---------------------------------------------------------------------------

/**
 * Split a name into rough syllable-ish chunks on vowel-group boundaries, so a
 * blend can splice a prefix of one donor with a suffix of another
 * ("Multi|shot", "Fire|ball", "Vol|ley"+"Com|bus|tion" → "Vollustion"). Keeps
 * the split deterministic and free of external libs.
 */
export function syllables(word: string): string[] {
  const chunks: string[] = [];
  let cur = '';
  const isVowel = (c: string): boolean => 'aeiouyAEIOUY'.includes(c);
  for (let i = 0; i < word.length; i++) {
    cur += word[i];
    // Break AFTER a vowel that is followed by a consonant, so each chunk tends to
    // end on a vowel (open syllable) — the most natural splice point.
    const next = word[i + 1];
    if (isVowel(word[i]) && next != null && !isVowel(next)) {
      chunks.push(cur);
      cur = '';
    }
  }
  if (cur) chunks.push(cur);
  return chunks.length > 0 ? chunks : [word];
}

/**
 * Blend two donor names into one: prefix syllables of `a` + suffix syllables of
 * `b`, choosing the split so the result reads (roughly capped length, always
 * capitalised). Deterministic given `pick` (a 0..1 chooser). Falls back to a
 * clean concatenation for degenerate inputs. Multi-word names use their first
 * word as the blend stem so "Rain of Arrows" blends on "Rain".
 */
export function blendNames(a: string, b: string, pick: (n: number) => number): string {
  const stemA = firstWord(a);
  const stemB = firstWord(b);
  const sa = syllables(stemA);
  const sb = syllables(stemB);
  // Take at least the first syllable of A and the last of B; vary how much of
  // each so blends aren't all identical across a run.
  const takeA = 1 + pick(sa.length); // 1..sa.length
  const dropB = pick(sb.length); // 0..sb.length-1 dropped from the front of B
  const head = sa.slice(0, Math.min(takeA, sa.length)).join('');
  const tail = sb.slice(Math.min(dropB, sb.length - 1)).join('');
  let blended = head + tail;
  // De-stutter a doubled boundary letter ("Frostt" → "Frost").
  blended = blended.replace(/(.)\1{2,}/g, '$1$1');
  if (blended.length < 3 || blended.length > 14) blended = head + capitalize(stemB);
  return capitalize(blended);
}

/** Connective-word banks that add legibility/fun to a fused name (seeded use). */
const CONNECTIVE_PREFIX = ['Exalted', 'Vicious', 'Hexed', 'Blessed', 'Savage', 'Arc'];
const CONNECTIVE_OF = ['Resisting', 'Warding', 'Rending', 'Mending', 'Binding', 'Searing'];

/**
 * Compose a full skill/upgrade name from donor names + a seeded chooser. Blends
 * the two biggest donors, then — only sometimes, where it earns legibility —
 * adds a connective ("… of Resisting X" / "Exalted …"). `pick(k)` returns an
 * int in [0,k). Deterministic.
 */
export function forgeName(
  donors: string[],
  pick: (n: number) => number,
  opts: { connectiveChance?: number } = {},
): string {
  const uniq = dedupe(donors.filter((x) => x.length > 0));
  if (uniq.length === 0) return 'Forged Rite';
  if (uniq.length === 1) return capitalize(firstWord(uniq[0]));
  const blended = blendNames(uniq[0], uniq[1], pick);
  const chance = opts.connectiveChance ?? 0.5;
  // pick(1000)/1000 gives a stable uniform in [0,1).
  const roll = pick(1000) / 1000;
  if (roll >= chance) return blended;
  // Half the connectives lead ("Exalted Vollustion"), half trail using a third
  // donor's flavour ("Multiball of Resisting Bless").
  if (pick(2) === 0) {
    return `${CONNECTIVE_PREFIX[pick(CONNECTIVE_PREFIX.length)]} ${blended}`;
  }
  const of = CONNECTIVE_OF[pick(CONNECTIVE_OF.length)];
  const third = uniq[2] ?? uniq[0];
  return `${blended} of ${of} ${capitalize(firstWord(third))}`;
}

// ---------------------------------------------------------------------------
// Small string helpers
// ---------------------------------------------------------------------------

function firstWord(name: string): string {
  // Skip articles/prepositions so "the Ravenous" blends on "Ravenous" and "Rain
  // of Arrows" blends on "Rain".
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0 && !/^(the|a|an|of)$/i.test(w));
  return words[0] ?? name.trim();
}

function capitalize(word: string): string {
  if (word.length === 0) return word;
  return word[0].toUpperCase() + word.slice(1);
}

function dedupe(xs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    const key = firstWord(x).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(x);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 7. Synthesis — recombine donor components into new, balanced abilities
// ---------------------------------------------------------------------------

/** Domain salts (independent streams per generative family, as procgen.SALT). */
const FORGE_SALT = { ability: 0xf0f0, className: 0xf1a5 } as const;

/**
 * A component donor — one authored/canonical ability tagged with its source, the
 * raw material synthesis draws from. Passed in by the caller (getters in
 * classes.ts) so this module stays import-cycle-free and AUTOMATICALLY absorbs
 * any ability a future update adds to the pool — no per-item wiring (req. 10).
 */
export interface Donor {
  /** The donor ability's display name (fuels the blended name). */
  name: string;
  classId: ClassId;
  /** The donor class's display name (fuels the class rename). */
  className: string;
  slot: string;
  def: Omit<PlayerAbilityDef, 'slot'>;
}

/** A synthesized ability plus the classes that donated its components. */
export interface SynthAbility {
  def: PlayerAbilityDef;
  donorClasses: ClassId[];
  donorNames: string[];
}

interface Pooled {
  effect: EffectComponent;
  donor: Donor;
}

/** Cooldown bands per slot (a basic spams; specials cycle) — the pricing clamp. */
const COOLDOWN_BAND: Record<AbilitySlot, [number, number]> = {
  basic: [0.35, 1.3],
  a1: [3.5, 16],
  a2: [3.5, 18],
  a3: [3.5, 18],
};

/** Can effect `e` be delivered by delivery `kind`? Keeps fusions coherent. */
function effectFitsDelivery(kind: DeliveryKind, e: EffectComponent): boolean {
  switch (e.kind) {
    case 'damage':
      return DIRECT_STRIKE.has(kind);
    case 'landingDamage':
      return kind === 'dash';
    case 'stun':
    case 'freeze':
    case 'slow':
    case 'lifesteal':
      return DIRECT_STRIKE.has(kind);
    case 'heal':
      return kind === 'heal' || kind === 'buffAlly';
    case 'healOnUse':
      return kind === 'dash' || kind === 'blink' || kind === 'selfBuff' || kind === 'taunt';
    case 'buff':
      return true; // buffs fit anywhere (folded into a zone / rallied / self)
    case 'zone':
      return kind === 'groundZone' || kind === 'projectile';
  }
}

/** Is this a hard crowd-control effect (capped to one per fusion)? */
const isHardCC = (e: EffectComponent): boolean => e.kind === 'stun' || e.kind === 'freeze';

/**
 * A BASIC attack must stay light and spammable — it can't afford a zone, a hard
 * CC or a buff on its ~1s cooldown (a permanent-uptime root-zone basic would be
 * degenerate AND unpriceable). Restrict basics to damage + a light strike rider;
 * specials (a1/a2/a3) may carry anything. */
function slotAllowsEffect(slot: AbilitySlot, e: EffectComponent): boolean {
  if (slot !== 'basic') return true;
  return e.kind === 'damage' || e.kind === 'slow' || e.kind === 'lifesteal';
}

/** The natural "primary" payload predicate for a delivery kind. */
function primaryWant(kind: DeliveryKind): (e: EffectComponent) => boolean {
  switch (kind) {
    case 'meleeCone':
    case 'pbaoe':
      return (e) => e.kind === 'damage';
    case 'projectile':
      return (e) => e.kind === 'damage' || e.kind === 'zone';
    case 'groundZone':
      return (e) => e.kind === 'zone';
    case 'heal':
      return (e) => e.kind === 'heal';
    case 'buffAlly':
    case 'selfBuff':
      return (e) => e.kind === 'buff';
    case 'dash':
    case 'blink':
      return (e) => e.kind === 'landingDamage' || e.kind === 'healOnUse' || e.kind === 'buff';
    case 'taunt':
      return (e) => e.kind === 'buff';
  }
}

/**
 * Synthesize one new ability for `slot` by recombining donor components. Picks a
 * slot-appropriate delivery from one donor, a natural primary payload + 1-2
 * cross-source secondary effects (hard-CC-capped) from others, folds ally buffs
 * into a spawned zone where possible, prices the whole thing to the slot budget,
 * and blends a name. Deterministic: (seed, key) → the same fusion for every peer.
 */
export function synthesizeAbility(
  seed: number,
  key: string,
  slot: AbilitySlot,
  donors: Donor[],
): SynthAbility {
  const rng = new Rng(mixSeed(seed, FORGE_SALT.ability, hashStr(key)));

  // 1. Delivery: a donor from this slot (basics stay light strikes by construction).
  const deliveryPool = donors.filter((d) => d.slot === slot);
  const src = deliveryPool.length > 0 ? deliveryPool : donors;
  const deliveryDonor = rng.pick(src);
  const delivery: Delivery = { ...decompose(deliveryDonor.def).delivery };

  // 2. Effect pool from ALL donors (so a projectile can adopt a groundZone's zone).
  const pool: Pooled[] = donors.flatMap((d) =>
    decompose(d.def).effects.map((effect) => ({ effect, donor: d })),
  );

  // 3. Primary payload — the thing this delivery naturally does.
  const chosen: Pooled[] = [];
  const usedSources = new Set<string>();
  const wantPrimary = primaryWant(delivery.kind);
  const primaryOptions = pool.filter(
    (x) => wantPrimary(x.effect) && slotAllowsEffect(slot, x.effect),
  );
  if (primaryOptions.length > 0) {
    const p = rng.pick(primaryOptions);
    chosen.push(p);
    usedSources.add(p.donor.name);
  }

  // 4. Secondary effects — 1..2 more that FIT, from fresh sources, CC-capped.
  const extra = rng.int(1, 2);
  let hardCC = chosen.some((x) => isHardCC(x.effect)) ? 1 : 0;
  for (let i = 0; i < extra; i++) {
    const options = pool.filter(
      (x) =>
        effectFitsDelivery(delivery.kind, x.effect) &&
        slotAllowsEffect(slot, x.effect) &&
        !usedSources.has(x.donor.name) &&
        !(isHardCC(x.effect) && hardCC >= 1) &&
        // avoid a second zone / a duplicate primary damage pile-up
        !(x.effect.kind === 'zone' && chosen.some((c) => c.effect.kind === 'zone')),
    );
    if (options.length === 0) break;
    const pick = rng.pick(options);
    chosen.push(pick);
    usedSources.add(pick.donor.name);
    if (isHardCC(pick.effect)) hardCC += 1;
  }

  // 5. A single-shot vehicle reads cleaner when it carries a zone (the flagship).
  if (delivery.kind === 'projectile' && chosen.some((c) => c.effect.kind === 'zone')) {
    delivery.projCount = 1;
    delivery.spreadDeg = 0;
  }

  // 6. Assemble + recombine (fold ally buffs into a zone / retarget orphans).
  let effects = chosen.map((c) => c.effect);
  effects = foldAllyBuffsIntoZone(effects);
  effects = retargetOrphanAllyBuffs(delivery, effects);
  const assembled: AbilityComponents = { delivery, effects };

  // 7. Price to the slot budget, then cap + quantize magnitudes.
  const { comp, cooldown } = priceToBudget(assembled, slotBudget(donors, slot), slot);

  // 8. Blend a name from the contributing donor names.
  const donorNames = [deliveryDonor.name, ...chosen.map((c) => c.donor.name)];
  const name = forgeName(donorNames, (k) => (k <= 0 ? 0 : rng.int(0, k - 1)));

  const def = recompose(comp, { slot, name, cooldown });
  return {
    def,
    donorClasses: [deliveryDonor.classId, ...chosen.map((c) => c.donor.classId)],
    donorNames,
  };
}

/** Merge every ally-targeted buff into the effect list's zone (if any), as its
 * refreshed allyBuff — the recombination seam that makes "a zone that buffs
 * allies" (the flagship's resistance area). */
function foldAllyBuffsIntoZone(effects: EffectComponent[]): EffectComponent[] {
  const zone = effects.find((e) => e.kind === 'zone');
  if (!zone || zone.kind !== 'zone') return effects;
  const allyBuffs = effects.filter(
    (e): e is Extract<EffectComponent, { kind: 'buff' }> => e.kind === 'buff' && e.target === 'allies',
  );
  if (allyBuffs.length === 0) return effects;
  const merged: NonNullable<ZoneSpec['allyBuff']> = { duration: 0 };
  let dur = 0;
  for (const b of allyBuffs) {
    if (b.defMult != null) merged.defMult = b.defMult;
    if (b.dmgMult != null) merged.dmgMult = b.dmgMult;
    if (b.moveMult != null) merged.moveMult = b.moveMult;
    dur = Math.max(dur, b.duration);
  }
  merged.duration = dur;
  const foldedZone: EffectComponent = { kind: 'zone', zone: { ...zone.zone, allyBuff: merged } };
  return effects
    .filter((e) => !(e.kind === 'buff' && e.target === 'allies'))
    .map((e) => (e === zone ? foldedZone : e));
}

/** Retarget ally buffs that a non-rallying delivery can't deliver, onto the caster. */
function retargetOrphanAllyBuffs(
  delivery: Delivery,
  effects: EffectComponent[],
): EffectComponent[] {
  const canRally =
    delivery.kind === 'meleeCone' || delivery.kind === 'pbaoe' || delivery.kind === 'buffAlly';
  if (canRally) return effects;
  return effects.map((e) =>
    e.kind === 'buff' && e.target === 'allies' ? { ...e, target: 'self' as const } : e,
  );
}

// --- Balance pricing --------------------------------------------------------

/** Median output-per-second of the donors in this slot — the target budget. */
function slotBudget(donors: Donor[], slot: AbilitySlot): number {
  const vals = donors
    .filter((d) => d.slot === slot)
    .map((d) => componentValue(decompose(d.def)) / Math.max(0.1, d.def.cooldown))
    .sort((a, b) => a - b);
  if (vals.length === 0) return 20;
  return vals[Math.floor(vals.length / 2)];
}

/** Effect kinds whose magnitude can be diluted to hit budget (pure output). Buffs
 * / CC / zones are NOT diluted — watering them to a floor would misprice them, so
 * they are DROPPED instead (keeps fusions to a few MEANINGFUL components). */
const ANCHOR_KINDS = new Set<EffectComponent['kind']>([
  'damage',
  'landingDamage',
  'heal',
  'healOnUse',
]);

/**
 * Price a fusion to its slot budget without minting power (req. §7):
 *  1. shed the cheapest rigid (buff/CC/zone) effects until what CAN'T be diluted
 *     fits under the slot's max cooldown — so nothing gets watered to a floor;
 *  2. scale the pure-damage anchors down so the total lands on budget;
 *  3. set the cooldown to totalValue ÷ budget within the slot's band.
 * Then cap + quantize so the numbers read hand-tuned.
 */
function priceToBudget(
  comp: AbilityComponents,
  budget: number,
  slot: AbilitySlot,
): { comp: AbilityComponents; cooldown: number } {
  const [lo, hi] = COOLDOWN_BAND[slot];
  const ceiling = budget * hi; // most value the slot can carry (at max cooldown)
  let effects = comp.effects.slice();
  // 1. Drop the cheapest effect while the rigid (un-dilutable) value alone busts
  //    the ceiling — never below one effect.
  while (effects.length > 1 && rigidValue(effects) > ceiling) {
    effects = dropCheapest(effects);
  }
  let scaled: AbilityComponents = { delivery: comp.delivery, effects };
  // 2. Dilute the damage anchors so the total sits on budget.
  const total = componentValue(scaled);
  if (total > ceiling) {
    const rigid = rigidValue(effects);
    const anchor = total - rigid;
    const f = anchor > 0 ? clamp((ceiling - rigid) / anchor, 0.05, 1) : 1;
    scaled = { delivery: comp.delivery, effects: effects.map((e) => scaleAnchor(e, f)) };
  }
  // 3. Cooldown from the priced value.
  const cooldown = roundCd(clamp(componentValue(scaled) / Math.max(0.1, budget), lo, hi), slot);
  return { comp: capComponents(scaled), cooldown };
}

/** Total value of the effects that CANNOT be diluted (buffs, CC, slow, zones). */
function rigidValue(effects: EffectComponent[]): number {
  const fan = 1; // rigid effects carry no fan multiplier
  return effects.filter((e) => !ANCHOR_KINDS.has(e.kind)).reduce((s, e) => s + effectValue(e, fan), 0);
}

/** Drop the single lowest-value effect (keeps the priciest, most-defining ones). */
function dropCheapest(effects: EffectComponent[]): EffectComponent[] {
  let idx = 0;
  let min = Infinity;
  for (let i = 0; i < effects.length; i++) {
    const v = effectValue(effects[i], 1);
    if (v < min) {
      min = v;
      idx = i;
    }
  }
  return effects.filter((_, i) => i !== idx);
}

/** Scale only a damage ANCHOR's magnitude by `f`; leave rigid effects untouched. */
function scaleAnchor(e: EffectComponent, f: number): EffectComponent {
  switch (e.kind) {
    case 'damage':
    case 'landingDamage':
    case 'heal':
    case 'healOnUse':
      return { ...e, amount: e.amount * f };
    default:
      return e;
  }
}

const round05 = (x: number): number => Math.round(x * 20) / 20;
const round1 = (x: number): number => Math.round(x * 10) / 10;
const round2 = (x: number): number => Math.round(x * 100) / 100;
const round5 = (x: number): number => Math.round(x / 5) * 5;
const roundCd = (x: number, slot: AbilitySlot): number =>
  slot === 'basic' ? round05(x) : round1(x);

// --- Caps + quantization (identity-true ceilings, clean numbers) ------------

function capComponents(comp: AbilityComponents): AbilityComponents {
  return { delivery: comp.delivery, effects: comp.effects.map(capEffect) };
}

function capEffect(e: EffectComponent): EffectComponent {
  switch (e.kind) {
    case 'damage':
    case 'landingDamage':
    case 'heal':
    case 'healOnUse':
      return { ...e, amount: Math.max(1, Math.round(e.amount)) };
    case 'lifesteal':
      return { ...e, frac: Math.min(0.35, round2(e.frac)) };
    case 'stun':
    case 'freeze':
      return { ...e, seconds: clamp(round05(e.seconds), 0.3, 1.4) };
    case 'slow':
      return { ...e, mult: clamp(round05(e.mult), 0.2, 0.95), duration: clamp(round1(e.duration), 1, 4) };
    case 'buff':
      return capBuff(e);
    case 'zone':
      return { kind: 'zone', zone: capZone(e.zone) };
  }
}

function capBuff(e: Extract<EffectComponent, { kind: 'buff' }>): EffectComponent {
  const out = { ...e, duration: clamp(round1(e.duration), 2, 10) };
  if (out.defMult != null) out.defMult = clamp(round2(out.defMult), 0.2, 0.95);
  if (out.dmgMult != null) out.dmgMult = clamp(round2(out.dmgMult), 1.05, 1.6);
  if (out.moveMult != null) out.moveMult = clamp(round2(out.moveMult), 1.05, 1.5);
  return out;
}

function capZone(z: ZoneSpec): ZoneSpec {
  const out: ZoneSpec = {
    ...z,
    radius: clamp(round5(z.radius), 60, 200),
    duration: clamp(round1(z.duration), 2, 8),
  };
  if (out.tickDamage != null) out.tickDamage = Math.max(1, Math.round(out.tickDamage));
  if (out.tickHeal != null) out.tickHeal = Math.max(1, Math.round(out.tickHeal));
  if (out.slowMult != null) out.slowMult = clamp(round05(out.slowMult), 0.2, 0.95);
  if (out.allyBuff) out.allyBuff = capAllyBuff(out.allyBuff);
  return out;
}

function capAllyBuff(b: NonNullable<ZoneSpec['allyBuff']>): NonNullable<ZoneSpec['allyBuff']> {
  const out = { ...b, duration: clamp(round1(b.duration), 2, 8) };
  if (out.defMult != null) out.defMult = clamp(round2(out.defMult), 0.2, 0.95);
  if (out.dmgMult != null) out.dmgMult = clamp(round2(out.dmgMult), 1.05, 1.6);
  if (out.moveMult != null) out.moveMult = clamp(round2(out.moveMult), 1.05, 1.5);
  return out;
}

// --- Class synthesis + renaming ---------------------------------------------

/**
 * Synthesize a whole class kit: a fused ability in each slot, then RENAME the
 * class after the two classes that donated the most components (rogue + paladin
 * → "Palarogue" / "Rodin" …), keeping the new identity tied to its sources. Id,
 * colour, role, radius, threat and stats are preserved. Deterministic.
 */
export function synthesizeClass(seed: number, base: ClassDef, donors: Donor[]): ClassDef {
  const abilities = {} as Record<AbilitySlot, PlayerAbilityDef>;
  const tally = new Map<ClassId, number>();
  const classNames = new Map<ClassId, string>();
  for (const d of donors) classNames.set(d.classId, d.className);
  const SLOTS: AbilitySlot[] = ['basic', 'a1', 'a2', 'a3'];
  for (const slot of SLOTS) {
    const syn = synthesizeAbility(seed, `${base.id}.${slot}`, slot, donors);
    abilities[slot] = syn.def;
    for (const c of syn.donorClasses) tally.set(c, (tally.get(c) ?? 0) + 1);
  }
  // Top donor classes, ties broken by id for determinism. Every tallied class is
  // a donor, so its display name is always in the map.
  const top = [...tally.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map((e) => classNames.get(e[0])!);
  const rng = new Rng(mixSeed(seed, FORGE_SALT.className, hashStr(base.id)));
  const name = forgeName(top, (k) => (k <= 0 ? 0 : rng.int(0, k - 1)), { connectiveChance: 0.35 });
  return { ...base, name, abilities };
}

// ---------------------------------------------------------------------------
// 8. Active-run registry — mirrors procgen's, gating Chaos Forge synthesis
// ---------------------------------------------------------------------------

let forgeSeedVal: number | null = null;
/** Synthesized content for the active Forge seed, keyed `<kind>:<id>` (lazy). */
const forgeCache = new Map<string, unknown>();

/**
 * Activate (or clear, with `null`) the Chaos Forge run whose SYNTHESIZED content
 * every getter should resolve. Set from the shared master seed on the host AND
 * every client (alongside setProceduralSeed) when Chaos Forge mode is on, so all
 * peers synthesize identical kits/monsters/boons/shop. Cheap + idempotent; the
 * cache is kept while the seed is unchanged. When null, getters fall back to the
 * numeric-variance (procgen) or canonical content — Forge layers ON TOP, it does
 * not replace the other modes.
 */
export function setForgeSeed(seed: number | null): void {
  if (seed === forgeSeedVal) return;
  forgeSeedVal = seed;
  forgeCache.clear();
}

/** The active Forge seed, or null when Forge synthesis is off. */
export function forgeSeed(): number | null {
  return forgeSeedVal;
}

/**
 * Resolve the active Forge run's synthesized variant of one content entry,
 * generating + caching it on first use — or `null` when Forge is off, which tells
 * the content getter to fall through to procgen/canonical. Mirrors
 * procgen.procVariant so the run plumbing (getClass/getMonster/…) composes.
 */
export function forgeVariant<T>(kind: string, id: string, make: (seed: number) => T): T | null {
  if (forgeSeedVal === null) return null;
  const key = `${kind}:${id}`;
  let hit = forgeCache.get(key) as T | undefined;
  if (hit === undefined) {
    hit = make(forgeSeedVal);
    forgeCache.set(key, hit);
  }
  return hit;
}
