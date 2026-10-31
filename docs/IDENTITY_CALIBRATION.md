# Identity calibration: Whispers, Evoker and Moon

Review date: 2026-10-31. Code baseline: `a34c4f7` (#145).
Historical #145 review; #146 Mantle afterimage and its new grand are retained by
the [current delivery](WHISPERS_DELIVERY.md).
Scope: recommendations before implementation. No combat values, skills, rewards
or assets are changed by this review. The owner reports the final authored cohort
felt okay after merging and testing; the concerns below are code-grounded design
hypotheses, not newly reported player problems or a measured balance ranking.

## Recommendation and delivery order

1. Retain Moon as the clearest calibration example: longer close-form commitment
   versus more forgiving reach and disruption. Test opportunity cost before tuning.
2. Retain Evoker's control-to-burst baseline. Investigate its identity choices
   with a one-boss comparison before replacing a useful simple damage option.
3. Review Whispers first for a focused identity proposal. Its fear/secrets theme
   and healing-echo passive pull in different directions; its healing grand adds
   another automatic relay. Preserve the accepted Mantle behavior while choosing
   a direction. Explain options to the owner before implementation.
4. Then review Rogue/Warlock, Knight/Barbarian/Monk, Ranger/Land,
   Abjurer/Sorcerer, and Cleric/Paladin/Valor in bounded groups. Reuse these
   questions, adapting group size to findings; do not infer a fixed PR count.

## What the three subclasses actually ask the player to do

| Subclass | Ordinary combat sequence                                                                                                                                                                                                                                    | What changes with identity A                                                                                                                                                                                                                                           | What changes with identity B                                                                                                                                                                                         |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Whispers | Effective Healing Word prepares Harmony; cast Dissonant Whispers (or another Discord special), then Inspiration within the verse windows to complete a chorus. A later effective dedicated heal spends the prepared echo. Mockery already slows its target. | Voice of Madness adds a short freeze to Whispers, controlled-target damage to Mockery/Blade, and different protection/utility riders to each other pick. It strengthens an existing control route; the freeze is not required to make Mockery's slow count as control. | Unheard Dirge lets Mockery delay wind-ups and Inspiration add movement; Blade leeches, Words speeds allies, Mantle grants a frontal block and Refrain cleanses. Its base-kit effects work before a chorus or injury. |
| Evoker   | Hit with Frost Nova, then exploit control with a direct hit. Cadence refunds running nonbasic cooldowns and prepares a later damaging nonbasic spell for +25% damage and half wind-up. Choose which eligible spell spends that preparation.                 | Arch-Evoker increases controlled-target damage on Bolt/Fireball and direct subclass strikes. This is useful numerical specialization, not a new combat sequence.                                                                                                       | Overchannel adds slow to Arcane Bolt, allowing ranged Cadence setup without entering Nova range; Nova and subclass direct strikes also delay wind-ups.                                                               |
| Moon     | Cast a special when form is ready, enter the close aimed-claw window, aim basic casts at nearby threats and decide when to disengage. Thornlash still fires; close positive hits mend at most once per second.                                              | Primal Avatar extends form/stride from 6s to 8s on the same 12s entry interval, adds Cyclone/strike leech and wider recovery groves. More time committed close, with sustain.                                                                                          | Feral Swiftness extends claws from 95u to 125u and adds skill-specific disruption, cleansing, mobility healing or bramble reach. Safer spacing, not a second duration upgrade.                                       |

Source: `src/engine/content/classes.ts`, `subclasses.ts`, `subclassPassives.ts`,
`charUpgrades.ts`; `src/engine/combat/support.ts`, `subclassPassives.ts`,
`spellCombos.ts`, `moonForm.ts` and `src/engine/core/control.ts`.
Values above are authored baseline values, not a promise about procedural kits,
Haste, final recharge, buffs, resistance or damage in an adaptive encounter.

### Compare the other subclass before adding mechanics

| Pair             | Existing distinction                                                                                                                                  | Review consequence                                                                                                                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Whispers / Valor | Both use the Bard verse/chorus engine. Valor rewards a chorus with party frontal protection; Whispers prepares a later healing echo.                  | These are mechanically different support payoffs, but Whispers' fear/secrets theme is less evident in its passive. A proposed offensive payoff must distinguish itself from Valor's martial strikes and shared base control. |
| Evoker / Abjurer | Both can exploit controlled-target direct hits. Evoker converts them into recharge and a prepared attack; Abjurer converts them into self-absorption. | Shared setup is useful class coherence. Preserve the offensive versus protective payoff rather than inventing a second unrelated resource.                                                                                   |
| Moon / Land      | Moon rewards timed close-range form pressure; Land makes friendly ground territory speed allies and suppress enemy wind-ups.                          | Preserve mobile close commitment versus maintained territory. Neither another generic circle nor a second sustain source alone strengthens this distinction.                                                                 |

## Every possible first subclass pick against one boss

The base kit remains available. No row requires adds, a second subclass pick or a
rare reward. Use real input and encounter placement in subsequent live tests.

| First pick         | Immediate role and setup                                                                                                                                                  | Limitation to inspect                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Words of Terror    | Ranged mental field slows a boss; it carries Discord and explicitly reaches flyers despite its zone primitive. Base Healing Word and Inspiration supply the chorus route. | Field ticks do not turn it into Psychic Blade's direct-strike identity route; following-field grand should be compared with a mobile boss.           |
| Psychic Blade      | Ranged direct strike for 50; Mockery or Whispers provides control for Madness. It supplies Discord.                                                                       | Its native delivery is another projectile, so mechanical utility does not prove visual recognition.                                                  |
| Mantle of Whispers | 260u blink with 0.3s phasing; base skills provide verses and healing. Honed improves travel/phasing; Unbound Mantle adds healing and hard-control resistance.             | Plain Mantle is not itself a verse or a dedicated heal. Neither its use-heal nor leech should be described as automatically spending Echoed Refrain. |
| Healing Refrain    | Dedicated 65 heal on 5s authored cooldown; prepares Harmony after effective healing and can spend an echo.                                                                | Competes directly with base Healing Word's 50 heal on 4s cooldown; its grand repeats an automatic second-recipient healing role.                     |
| Lightning Bolt     | Fast 40 direct shot, +20% against controlled foes; Nova supplies control.                                                                                                 | Piercing grand has no extra-recipient payoff against a lone boss; speed still has travel-time value.                                                 |
| Cone of Cold       | 210u aimed cone, 30 damage and slow; supplies its own control-on-hit Cadence route.                                                                                       | Compare a directional medium-range cone with Nova; the grand's freeze is harder control, not a new prerequisite for Cadence.                         |
| Sculpted Blast     | Charged self-centered 170u detonation for 58, +25% against controlled foes; Nova supplies setup and Cadence preparation shortens its charge.                              | Close detonation overlaps Nova's delivery. Damage and a retort do not by themselves create a different positioning decision.                         |
| Arcane Shield      | Directional 180u peel with knockback and a 35/4s self-barrier; Nova still supplies Cadence setup.                                                                         | Knockback alone is not the slow/root/stun condition. Moving a boss away can alter the follow-up; do not assume an unconditional refund.              |
| Dire Maul          | Close swipe for 46 with leech; the cast can enter form.                                                                                                                   | Basic claws and Maul overlap in range, but Maul is an independent strike; circular grand changes rear coverage.                                      |
| Feral Pounce       | Leap with landing damage; positions the player for claws and enters form when legal.                                                                                      | A rooted movement cast cannot start the ordinary route. Its control-resistant grand must be distinguished from base behavior.                        |
| Primal Roar        | Damage buff plus a prepared close-hit bramble burst; enters form without needing injury or adds.                                                                          | Must actually connect at close range to release brambles; group ward grand has no other-ally benefit in solo play.                                   |
| Frenzied Regen     | Large self-heal and recovery grove; enters form even at full health.                                                                                                      | At full health the heal can be wasted while form remains useful. Compare with base Regrowth rather than treating another heal as a new playstyle.    |

## Combined rewards: marginal value and overlap

Honed is ordinary role growth. More damage or protection remains useful, but does
not establish a new decision. Legal grand capacity is two starting skills, one
bound subclass skill and one identity; do not compare builds that equip both
identities or every subclass grand simultaneously.

| Combination                                                  | Marginal value after ordinary growth                                                                                                                                                               | Judgment                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Whispers Words: Honed + Pursuing Dread + either identity     | Honed grows tick damage/duration; grand follows the first damaged foe and widens the field. Madness adds enemy wind-up suppression; Dirge gives allied movement.                                   | Distinct recipient/delivery effects. Retain pending mobile-boss readability and party-position tests.                                                                                                                                                      |
| Whispers Blade: Honed + Shattering Secret + Madness          | Honed grows damage/speed; grand adds an impact burst; identity adds conditional damage already enabled by Mockery.                                                                                 | Positive numerical value on one boss, new target coverage only with nearby enemies. Do not call all three layers distinct playstyles.                                                                                                                      |
| Whispers Mantle: Honed + Unbound Mantle + either identity    | Travel/phasing, use-heal/control resistance, then absorption or a frontal block are different protection axes.                                                                                     | Retain. A frontal block needs aim and excludes rear/ground damage; it is not equivalent to absorption.                                                                                                                                                     |
| Whispers Refrain: Honed + Shared Refrain + Echoed Refrain    | Honed increases primary healing/reach; grand adds +15 primary healing and a 40% nearby relay; passive adds a prepared 50% capped echo.                                                             | Both second-recipient heals can have value, but share a job. Runtime applies the relay before choosing the passive's target: filling an ally can redirect the echo or preserve its readiness. This is overlap/ordering, not proven double-healing failure. |
| Evoker Lightning: Honed + Conducting Lance + either identity | Honed increases damage/control bonus; grand increases speed/piercing; A increases conditional damage while B supplies ranged setup through the basic.                                              | Retain the baseline. A is primarily amplification and piercing's target-count value is encounter-dependent.                                                                                                                                                |
| Evoker Cone/Blast/Shield + their grand + either identity     | Freeze/reach, a held retort, or damage-based repair respectively remain additional to ordinary growth. A rewards controlled hits; B suppresses wind-ups.                                           | No demonstrated redundant binary unlock. Review Blast/Nova delivery overlap and compare A's damage specialization with B's safer access.                                                                                                                   |
| Moon Maul/Pounce/Roar/Regen + their grand + either identity  | Circular coverage, protected entry, an other-ally ward or a nearby healing relay add different roles beyond ordinary magnitude/recharge growth. Neither grand changes the 12s form-entry interval. | Retain; group-only portions need explicit solo opportunity-cost evaluation.                                                                                                                                                                                |

## Alternatives to discuss before mechanical changes

**Whispers — recommended next proposal.** Option A keeps the healing-echo passive
and makes Refrain's grand do something other than another relay, positioning
Whispers as a sinister support/conductor. This preserves the current loop with a
smaller migration. Option B keeps the general Bard healing/chorus base but gives
Whispers a fear/secret exploitation passive: a chorus prepares one clearly visible
offensive/control payoff on a later positive direct hit. This better matches the
named fantasy, but needs a complete trigger/recipient/expiry/copying specification
and comparison with Valor, Evoker and Warlock before choosing values. Prefer B
as a design direction to investigate, not as an approved implementation. Keep
Mantle, the full-health fallback and every first-pick base-kit route intact.

**Evoker.** Option A retains Arch-Evoker as the straightforward burst choice and
Overchannel as ranged setup/disruption; improve explanations and test actual
choices. This is the recommended default. Option B replaces one identity with
a deliberate single-target versus coverage tradeoff on a prepared spell. Do not
start B unless A repeatedly produces the same sequence/choice in controlled tests;
avoid simply adding another on-hit proc or removing simple growth for complexity.

**Moon.** Option A retains the present duration-versus-reach choices and tests
them on mobile, against a moving boss, and in an interrupted form window. This
is recommended. Option B makes form entry deliberate rather than any eligible
special automatically starting it. That could improve timing agency but changes
the accepted input/kit contract; prototype only if players report unwanted early
entries. No new transformation button or permanent bear form is assumed.

## Verification, boundaries and next live questions

Full suite: **165 files / 4,143 tests pass** with
`node node_modules/vitest/vitest.mjs run --pool=threads --maxWorkers=1`
(73.79s). A jsdom canvas-not-implemented diagnostic is emitted, but no test fails.
The production build and TypeScript checks passed during recovery at this same
code baseline; this delivery changes documentation only.

Focused engine run: seven files / 176 tests pass with
`node node_modules/vitest/vitest.mjs run tests/spell-combos.test.ts tests/subclass-passives.test.ts tests/moon-form.test.ts tests/support-grand-redesign.test.ts tests/nature-grand-redesign.test.ts tests/caster-grand-redesign.test.ts tests/support-loops.test.ts --pool=threads --maxWorkers=1`.
The default process pool stalled in this environment; a single version test and
the focused engine run complete with threads. This is a working test invocation,
not a diagnosed root cause or a reason to change repository-wide test defaults.

Existing runtime fixtures include actual World casts, effective-hit validation,
first-pick tables, real Forge builds, Honed ranks/recharge limits, Moon geometry
and cleanup, and held retaliation. `caster-subclass-passives.test.ts` separately
covers Evoker refunds and Whispers echo ownership, overheal, solo fallback and
composed support. Those contracts are narrower than live enjoyment and balance.

No new browser, live-site, co-op, visual recognition or comparative DPS result is
claimed. No external Dota 2 research has been performed for this review. Preserve
positive-hit provenance, once-per-cast budgets, recipient-health barrier scaling,
copy/Forge fallback and bank/equipped semantics in any later implementation.

Next live checks, using the same boss, seed/difficulty and comparable loadouts:

- Whispers: can the player explain the passive without reading a long tooltip?
  Does Refrain plus relay plus echo feel like a choice distinct from Healing Word,
  solo and with two wounded players? Do not take damage deliberately as required setup.
- Evoker: do A and B change spacing and the spell chosen for preparation, or does
  one become an automatic selection? Repeat with each first pick, including
  Lightning against one boss and Shield without a damaging second pick.
- Moon: does 8s duration versus 125u claws change commitment and successful hits?
  Does opening with Regrowth accidentally spend form before reaching the boss?
  Check touch aiming, interruption, a flyer and recovery between windows.

Keep enemy tuning fixed while making these comparisons. Record observations,
rejected alternatives and the next decision before expanding the review cohort.
