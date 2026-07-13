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
import type { ZoneKind } from '../core/types';
import type { PlayerAbilityDef, AbilityKind } from './classes';

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
const STRIKE_DELIVERIES = new Set<DeliveryKind>([
  'meleeCone',
  'projectile',
  'pbaoe',
  'dash',
]);

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
    } else if (def.damage > 0 && STRIKE_DELIVERIES.has(kind)) {
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
