# Rogue/Warlock coherence and grand presentation follow-up

The owner merged and tested PR #135, then requested a correction before continuing
to the next classes. The previous pass supplied working mechanics and full slots
but repeated several same-skill effects. This delivery reviews their combined value
and the selection presentation. It does not advance the martial cohort.

## Presentation

The test-loadout grand panel starts collapsed and keeps the earned bank when
opened/closed or when other loadout options change. The central manager used by
editor, result screen and reward-room fallback shows the equipped 2/1/1 groups
first. Full descriptions, unlocked-option readouts, banked choices and replacement
previews open on demand. Native selects, controller browsing, explicit free swaps
and the menu fallback remain available. Transitional whole-kit grands still appear
in the identity group and can be inspected or removed.

## Distinct responsibilities

| Mechanic or skill                       | Revised responsibility                                                                                                                                                |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shadowstep refund                       | Ordinary Assassinate keeps the bounded Backstab refund; Assassin identity and Death Strike grand no longer repeat it.                                                 |
| Assassin identity                       | Prepared execution against weakened foes, rather than another movement refund.                                                                                        |
| Death Strike grand                      | A prepared connection exposes that foe for the same owner's next direct hit, once per cast. The originating cast cannot spend its own mark.                           |
| Mage Hand Bolt                          | A connecting positive hit prepares precision, providing ranged setup for a melee spender.                                                                             |
| Mirror Cut (old Misty Step ID)          | An arcane melee precision spender with brief phasing on a prepared connection. Its grand adds a bounded prepared echo rather than another teleport/coating.           |
| Sleight of Time                         | Melee Spellblade follow-through grants a frontal block and brief movement, rather than repeating the Shadowstep refund.                                               |
| Hex grand                               | Owns following Hex. Fiend identity no longer provides the same following flag.                                                                                        |
| Fiend identity                          | Three connecting direct hits on personally cursed foes release bounded hellfire; ticks and supplemental damage cannot build it.                                       |
| Ordinary Searing Rebuke                 | Owns proactive retaliation from a later direct hit.                                                                                                                   |
| Rebuke grand                            | Adds a defensive aftermath to a successful retort, so ordinary plus grand still adds value.                                                                           |
| Infernal Claim (old Fiendish Rebuke ID) | Remote detonation of an aimed, personally cursed target, rather than a second caster-centered counterburst. Its grand also turns some primary damage into protection. |

Existing skill, Honed and grand IDs remain readable; names/descriptions and resolved
payloads change together. Old Misty Step and Fiendish Rebuke loadouts acquire the
new actions. There are no extra active slots or new input buttons. Existing grand
banks, aliases, grafts and the reward-reroll correction remain intact.

## Fantasy and flight review

Hex and mental curse fields explicitly reach flying targets. Their visual zone
category is also used by ground effects, so it cannot determine altitude. Following
uses the actual zone's reach policy, including a target gaining flight mid-effect.
Fire Pit and physical roots remain ground effects. Falling arrows and Otiluke's
floating cage already had appropriate air reach and receive regression coverage.
Explicit ground overrides must survive Forge even when their value is false.
Smoke and ordinary poison-cloud altitude remain ambiguous; this patch does not
reinterpret every physical field as an aerial effect.

## Why the earlier review missed it

The code confirms that ordinary upgrades, identities and grands assigned the same
flags to the same skill. Reusing supported payloads made implementation feasible,
but the review did not sufficiently test the new decision or marginal benefit of
the combined build. Functional tests and catalogue counts did not catch that design
shortcoming. The remedy is the [explicit design review gate](UPGRADE_REVIEW_GATE.md),
used both before coding and on the resolved kit before delivery.

## Validation

Local validation passes: 4,029 tests across 155 files, with 98.01% branch coverage
against the unchanged 98% gate. Build, lint, formatting and generated catalogue /
recharge audits pass. Desktop and 320px phone fixtures verify compact selections,
full pilot builds, revised native/composed skills and rendered effects; host reward
progression and production menu-to-fight/input smoke also pass. Final GitHub CI
rechecks the published commit before the PR is marked ready.

Forge regression tests include a retort's actual arming dependency, contract
pricing/caps, and live retaliation. The tests also exercise owner-only exposure,
shared projectile cast identity, deterministic remote targeting, missing loadout
fields, and echo immunity/overkill without a second outgoing damage multiplier.

## Live review

Open and close the editor's grand panel while editing other options, then compare
both identities with the same subclass pair. Use Bolt into Backstab/Mirror Cut;
compare ranged setup with Assassin's ranged spender. Check prepared Death Strike
into another direct hit and verify a teammate does not consume its payoff. Test
Hex and its following grand against static and temporary flyers; Fire Pit should
still miss airborne foes. Use Hellish Rebuke's retaliation separately from Infernal
Claim's remote curse payoff. Try Claim without an eligible target: native casting
must preserve cooldown and readiness. Test the actual composed variant too, whose
fallback is described by its generated readout.

Next remains Knight/Barbarian/Monk after this correction is accepted in live play,
then the other class cohorts and a whole-system review. This feedback changes the
review process for all future cohorts, not only the explicitly named pilot skills.
