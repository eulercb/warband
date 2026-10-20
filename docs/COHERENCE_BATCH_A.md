# Coherence retouch A: scalable recovery and early-kit payoff

Implements the first approved batch from the [whole-class audit](CLASS_COHERENCE_AUDIT.md).
The audit remains a historical assessment of `ef8de74`; the generated
[class catalogue](CLASS_CATALOGUE.md) reflects this patch's current behavior.

Historical follow-up: [Batch B](COHERENCE_BATCH_B.md) further improves Evoker and
fixes first-control-hit and instant-cooldown ordering. Values below describe
Batch A as delivered.

## Delivered behavior and choices

| System               | Before                                                  | This patch                                                                                                                                                                                                |
| -------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Moon mend            | 4 HP per eligible 1s gate                               | 3% maxHP, minimum 4; same shared gate and close-hit/form requirements                                                                                                                                     |
| Primal Roar          | Damage and movement buffs, duplicating form speed       | Retains +30% damage for 5s; prepares one bramble burst for 6s. Next positive direct hit within 130u + target radius, or bear claw, releases 24 base damage in 125u around caster and slows to 65% for 2s. |
| Fiend Soul Ember     | 5%-maxHP heal and hidden 10% DR for 3s; injury required | Retains the heal, replaces DR with 12%-maxHP absorption (minimum 15) for 6s. Full health can gain the shield. Same 6s gate.                                                                               |
| Fiendish Rebuke      | Larger version of the base counterburst                 | Its retaliation additionally applies a personal searing curse for 4s (+15% owner damage), before dealing its existing 40%-strength counterburst. Base Hellish Rebuke is unchanged.                        |
| Mind Blast           | Ordinary damage projectile                              | Positive direct hit on a personally cursed foe also weakens attacks by 15% and stretches wind-ups by 40% for 3s. It does not interrupt or cancel attacks.                                                 |
| Evoker Cadence       | Removes 1s from running special cooldowns, once per 6s  | Removes 2s; same control predicate, gate, valid-hit rules and zero floor. No refund to basics.                                                                                                            |
| Abjurer Binding Ward | 20 absorption for 5s                                    | 10% maxHP, minimum 20; same duration, gate, shared cap and stronger-pool rules.                                                                                                                           |

**Why these designs:** Roar's prepared burst adds a positioning/timing decision
without extending form toward permanent uptime. A copied Roar can be triggered
by an ordinary nearby direct hit, without requiring the donor's passive. The
Fiend shield is visible and preemptive; retaining existing healing avoids losing
its attrition role. A bigger heal alone would remain difficult to distinguish
from lifesteal. Fiendish Rebuke uses the audit's stationary cursed-counterburst
alternative rather than requiring a movement trail after an incoming hit. This
works within the existing one-hit retaliation window and is easier to control
on touch. Mind Blast supplies hindrance without repeated stun/reset loops.

Mage's resolved baseline Fireball and Frost Nova cooldowns are 14s and 20s,
respectively. The old 1s refund is only 7.1% / 5% of those cooldowns per eligible
trigger. A 2s refund gives 14.3% / 10%, retaining the 6s gate and requiring a
positive direct hit during actual slow/root/stun. This supports a modest increase
without shortening every Mage ability or broadening what counts as burst control.
This is a cadence rationale, not a measured whole-fight damage ranking.

## Scaling evidence and limits

`node scripts/audit-class-catalogue.mjs --check --probe` independently binds all
96 first-choice subclass skills and runs the isolated Moon scaling probes.
Six supplemental claws at one-second intervals in one form window:

| Max HP | Damage multiplier | Claw damage | Old mend | New mend |
| ------ | ----------------- | ----------- | -------- | -------- |
| 140    | 1                 | 84          | 24       | 25.2     |
| 140    | 2                 | 168         | 24       | 25.2     |
| 280    | 1                 | 84          | 24       | 50.4     |
| 280    | 2                 | 168         | 24       | 50.4     |

This is a fixed, stationary target without immunity, other attacks or AI. It
measures the hook, not real-player uptime, ranged Thornlash damage or optimal DPS.
The small fresh-Druid mend change is intentional; Roar adds the more noticeable
close-range payoff while late HP growth now benefits mending. No blanket claw
buff or extra crit/proc chain is introduced.

Fiend's base 130 HP now yields a 15.6-point reserve plus up to 6.5 healing per
eligible trigger; at 260 HP this becomes 31.2 plus 13. Abjurer's 20-point floor
holds through 200 HP, then reaches 40 at 400 HP. Tests also cover lower health,
stronger pre-existing shields and zero/expired/immune cases. Absorption still
uses the common 50%-maxHP ceiling; it never stacks equivalent casts. A failed
full-health Fiend shield preserves the gate; useful healing may spend it even
when a stronger shield is preserved. Normal zone damage can trigger Soul Ember,
matching the existing curse-attrition route. New supplemental bramble damage
cannot recursively release another bramble or trigger direct-hit riders.

Equivalent Mind Blast weakness uses the same strongest-only family as dread
curse weakness: 15% and 20% do not multiply. Wind-up slowing follows the existing
factor rules and global cap; equivalent Mind Blast applications refresh one
source rather than multiply per player. Positive hits on another player's curse
alone do not qualify. Ground-zone entities are not included as burst targets.

**Difficulty contract:** no difficulty formula, adaptive coefficients, cooldown
baseline or enemy stats change. Tests compare the power index with and without
the new active metadata and verify passive grants do not increase that estimate.
Honed still earns its ordinary existing magnitude/cooldown credit. Faster kills
can still influence subsequent encounters through the existing pace feedback;
unchanged formulas cannot guarantee an unchanged whole-run difficulty curve.

## Compatibility and validation

Stable skill and passive IDs are preserved. The new active payloads survive
native/composed resolution, component refresh, seeded Forge selection, Honed
magnitude/footprint changes, copying to another class and ordinary serialization.
Host burst/retaliation payloads remain private; peers get normal badges, barriers,
curse ownership, hindrance visuals and the bramble area flash. Pending brambles
expire normally and clear on downing, death, zero HP, class changes and noncombat
rooms. Misses, immunity, distant hits and zone ticks do not spend preparation.
The effect is shared per cast rather than duplicated by projectile count.

Regression coverage includes actual projectile impact, summons, multiple targets,
toroidal range, full health, stronger pools, shared proc gates, under/overhealing,
class/room lifecycle and high haste. Existing Moon/Warlock/Mage tests retain their
assertions with the intentional new values. The upgrade-name regression exposed
colon punctuation being parsed as a skill label; the new effect wording was
corrected without weakening that check.

Browser checks:

- `smoke:coherence`: seven fixed engine/renderer states at desktop 1280×800,
  portrait 320×568 and landscape 844×390. This exercises displayed bear/bramble,
  full-health Fiend shield, cursed retaliation, Mind Blast debuffs and Mage grants.
- `smoke:passives`: production selection, HUD/pause descriptions and real
  keyboard/touch input, including Primal Roar's new readiness and Fiendish Rebuke.
- Existing `smoke:moon-form` retains its lifecycle/render checks with the new mend
  value. The dedicated batch renderer check is also registered in GitHub CI.

These checks establish execution and presentation contracts, not fun, novice
comprehension or optimal numerical balance. Moving-target and normal adaptive
run playtests remain the player-review gate. No public community consensus is
claimed; public feedback handling follows [the research guidelines](RESEARCH_GUIDELINES.md).

## Player verification and next step

1. Moon: compare normal attacks at range with moving close during form. Try Roar
   before a close hit; look for bramble readiness, one green burst and slowed foes.
   Compare a later maxHP-upgraded build; misses should preserve readiness.
2. Fiend: Hex or Fire Pit at full health should grant a bubble on damage. Take a
   small hit to test consumption; Fiendish retaliation should leave searing marks.
   Confirm Dark Resilience still supplies its separate siphon protection.
3. Great Old One: compare Mind Blast against an unmarked enemy and one bearing
   your curse. The latter should show weakened attacks and sluggish wind-ups,
   without teleporting, cancelling or repeatedly stunning the target.
4. Mage: check a control-then-direct-hit sequence and watch running special
   cooldowns; Abjurer's protection should grow in a maxHP build. Check a moving
   boss and a flyer, rather than assuming every ground slow connects.

After this batch is merged and playtested, proceed to **B: Knight / Barbarian /
Rogue / Druid active roles**, then **C: support alternatives and remaining
cadence**. Broad upgrade/grand/graft redesign follows those two retouch batches.
Keep the current successful companion, form, support and aura systems; do not
force a rewrite of every class just to make the patch roster symmetrical.
