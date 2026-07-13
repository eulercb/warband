# Chaos Forge — component recombination mode

> Design spike + living reference for the opt-in **Chaos Forge** run mode: a
> procedural mode that _invents_ new skills, upgrades, classes, subclasses,
> bosses and shop items by breaking existing content into mechanical
> **components** and recombining components from different sources into coherent,
> balanced, seed-deterministic new content. Sibling to **Chaos Draft**
> (`kitshuffle.ts`, whole-kit swap) and per-run **numeric variance**
> (`procgen.ts`, jitter-in-place). Forge is the "balanced Frankenstein" the other
> two modes deliberately refused to build.

## 0. The idea in one example (illustration only — never hardcoded)

Take the **projectile delivery** of the Ranger's Multishot (but _not_ its
3-projectile fan), the **area-on-impact** of the Mage's Fireball (as a vehicle,
_not_ its damage), and the **resistance buff** of the Cleric's Blessing (_not_
its bundled damage buff). Fuse: a single projectile that, on impact, blooms an
area that grants a resistance buff to allies standing in it — e.g. "Multiball of
Resisting Bless". Its upgrade fuses Volley (+projectiles), Combustion (+area)
and Exalt (+resist potency) → e.g. "Exalted Vollustion".

The generator _can_ produce those names organically; nothing about them is
special-cased. The real deliverable is the general method below.

## 1. Component model

An ability = **one Delivery** (how the effect reaches targets) + an ordered list
of **Effect components** (what happens at each delivery point). This is a
re-expression of the existing `PlayerAbilityDef` / `BossAbilityDef` field bags,
fine-grained enough to separate the three facets the flagship needs:

- the **projectile delivery** is separable from the **`projCount` fan** (a
  delivery _facet_ we can set independently);
- the **area-on-impact** (`impactRadius`, a delivery facet) is separable from
  **dealing damage** in that area (a `damage` _effect_);
- the **resistance** (`buffDefMult`) is separable from the **damage buff**
  (`buffDamageMult`) bundled into the same `buffAlly` — each buff becomes its own
  `buff` effect component.

### Deliveries (1:1 with the 10 `AbilityKind`s + 9 `BossAbilityShape`s)

`meleeCone · projectile · groundZone · pbaoe · dash · blink · selfBuff ·
buffAlly · heal · taunt` for players; the boss shapes for bosses. Each carries
its geometric facets (range, radius, halfAngle, projSpeed, projCount, spreadDeg,
castTime, impactRadius, maxRange, iframes, zoneKind).

The **new primitive** that unlocks the flagship is not a new delivery but a
**payload on the projectile's impact point**: a projectile whose impact spawns a
zone and/or area-buffs allies. It is expressed as effects attached to a
`projectile` delivery and resolved when the shot lands.

### Effect components (the payload)

`damage · zoneSpawn(kind,duration,tick,radius,slow,root,allyBuff) ·
buff(target=self|allies, def↓/dmg↑/move↑, duration) · stun · freeze · slow ·
root · heal · healOnUse · lifesteal · landingDamage · knockback/pull(boss)`.
Each carries its own numbers and a **balance weight** (see §3).

## 2. Decomposition & round-trip (future-proofing, req. 10)

`decompose(def) → { delivery, effects[] }` reflects over the def's live fields —
it enumerates the field bag rather than a hand-maintained list, so **any future
field flows through the same mapping without per-item wiring**. `recompose` folds
a delivery + effects back into a resolvable `PlayerAbilityDef` (flat fields for
the rest of the engine + a `components` list for the rich executor). Canonical
content decomposes to "its delivery + the effects its fields imply", so authored
skills round-trip through the same path. A field the executor can't yet run is
kept in the flat def and **skipped loudly** by the component path (logged in the
generated description), never silently dropped.

## 3. Balance (req. §7 — synthesis must not mint power)

`componentValue()` extends `procgen.abilityOutput()` with weights for control
(stun/freeze/slow/root seconds) and buffs (def/dmg/move magnitude × duration).
A synthesized skill is priced to the **slot budget** (the output-per-second band
the canonical abilities of that slot occupy): cooldown / castTime / magnitudes
are set so total value lands on budget, exactly mirroring procgen's
"a hotter roll cycles slower" link. Degenerate fusions are capped:

- at most **one hard CC** (stun/freeze/root) per skill; extra CC is dropped;
- buff ceilings reuse procgen's (def-mult floored at 0.2 → never immunity, dmg
  ≤ 1.6×, move ≤ 1.5×); buff duration capped;
- cast/stun/telegraph readability floors preserved (boss wind-up ≥ 85% / ≥ 0.3s).

## 4. Naming (req. §2 — "legible + fun")

`blendNames(a,b)` splits each donor name on vowel-group boundaries and splices
prefix-of-one + suffix-of-other ("Multi"+"ball" → "Multiball", "Vol"+"bustion" →
"Vollustion"), with a seeded connective bank ("… of Resisting X", "Exalted …")
added only when it earns legibility. Deterministic from the seed. Classes are
renamed after the classes that donated the most components (rogue+paladin →
"Palarogue" / "Rodin"), keeping identity tied to sources.

## 5. Determinism (req. §7)

Everything derives from the master seed through the existing primitives (`Rng`
/`mulberry32`, `mixSeed`, `hashStr`, fixed-size roll vectors). Forge adds
per-domain `SALT` entries and a `forge*` active-run registry mirroring
`setProceduralSeed`; the host bakes drafted content into `StartMsg`/roster and
every client re-derives identically from `runSeed`. No `Math.random`, no `Date`.

## 6. Executor & world hooks (gated, canonical byte-identical)

Synthesized abilities carry a `components` list; `resolvePlayerAbility` dispatches
to a new `resolveComposedAbility` when it is present, else the untouched switch —
so canonical/variance/Chaos-Draft content is byte-for-byte unchanged. Two small,
_data-gated_ world hooks (optional fields, so canonical entities never trip them):

- `Projectile.onImpact` → on a player projectile's impact, spawn its zone /
  area-buff allies (resolves the flagship's projectile→area→ally-buff chain);
- `GroundZone.allyBuff` → a zone that refreshes an ally buff per tick to allied
  players inside (the "area that grants a resistance buff" made lingering).

## 7. Integration surface

Forge is expressed as a **synthesis layer inside the content getters**, gated by
the forge active-run flag: when Forge is live, `getClass(id)` returns a
synthesized class (fused kit + fused name) keyed by `id`, `getCharUpgrade`,
`getSubclass`/`getSubSkill`, `getMonster`, and the shop getter return synthesized
content. This reuses the entire run plumbing (spawn, HUD, previews, upgrade
offers key on `classId`+`slot`). The mode boolean mirrors `randomKits` across
`store` → `session` → `host` → `protocol` → `HostSetup`.

## 8. Bots (req. 8)

A capability classifier tags each ability from its components (`offensiveRanged /
offensiveMelee / control / heal / allyBuff / selfDefense / mobility`); a generic
casting policy keyed on those tags + world signals replaces the per-`classId`
heuristics whenever Forge content is live (canonical runs keep the hand-tuned
switch). Synthesized upgrades carry an `UpgradeRole` tag so `botRoleWeight`
personalities pick them well. `sub1`/`sub2` are included in the cast set.

## 9. Scope status (this branch)

Landed incrementally, each commit green (typecheck + lint + build + smoke + the
98% coverage gate). A seeded end-to-end run was verified: kits synthesize, cards
read sensibly, the flagship projectile→area→ally-resist surfaces organically,
forged bosses cast, the shop rerolls, and a typed seed reproduces the world.

**Landed**

- Component model (delivery + effect payload), `decompose`/`recompose` round-trip,
  `componentValue` balance pricing, `describeComposed`, name blending (§1–6).
- Component executor + two gated world hooks (projectile on-impact zone, ally-buff
  zone tick); canonical/variance/Chaos-Draft content byte-for-byte unchanged.
- Skill synthesis (≥2 components, cross-source, CC/buff-capped, priced to the slot
  budget) + the flagship, producible not hardcoded.
- Class synthesis + rename after the top donor classes (`getClass`).
- Boss synthesis: fused kits from donor abilities + rider grafts + a generated
  `decide` rule set + blended name (`getMonster`); reuses the 9 shapes, so the
  boss executor + bot dodge are unchanged.
- Shop synthesis: per-run re-price + re-flavour (`getEphemeral`), routed through
  every consumer so displayed and charged prices agree.
- Opt-in mode wiring (store → session → host → protocol → HostSetup toggle),
  seed-deterministic across host and clients.
- Data-driven bots: capability classifier + generic casting policy over every slot
  incl. sub1/sub2, engaged whenever Forge is live.

**Deliberately deferred (with rationale)**

- **Char-upgrade *synthesis* (blended-name / rebalanced-delta upgrade defs).** In a
  Forge run the canonical char-upgrades still apply to the fused kit (they tug the
  same `PlayerAbilityDef` levers), so bots + players can pick and apply upgrades to
  synthesized skills — the functional requirement holds. What's deferred is
  regenerating each upgrade's *name + description + delta* to match the fused skill,
  which needs a `getCharUpgrade` getter + rerouting `rollCharChoices`/the replay
  engine (char-upgrades are keyed by string id and looked up directly today). A
  focused follow-up; not landed here to keep the change reviewable.
- **Subclass *synthesis*.** Subclass skills already route through procgen
  (`getSubSkill` → numeric variance), so they vary per run; full component
  synthesis of sub-skills + their grands is the same follow-up shape as upgrades.
- **Affix / corruption / terrain magnitude variance (§3.7 audit).** Left static:
  their id→behaviour binding is host-side code, not data, so recombination would
  need executor work, and their magnitudes are tuned balance constants. *Selection*
  of which affixes/beats appear is already seeded. Folding these in is safe
  magnitude-jitter work, deferred as lower value than the families above.
- **Shop passive-buff magnitudes.** Held constant (spawn-time balance constants
  with no unit-test surface); Forge varies the economics + flavour instead (§7).

Nothing is silently dropped: where the generator declines a family the reason is
noted inline, and an executor-unsupported field is surfaced in the generated
description rather than ignored.
