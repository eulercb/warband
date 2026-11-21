# Warband development status

This is the current sequence; older delivery notes remain historical evidence.
Update it when owner testing accepts or changes a delivery. Each handoff must
name the next development task beyond playtesting.

## Accepted baseline

- All 12 authored class cohorts and the Mantle departure-afterimage follow-up.
- Moon and Evoker retained after calibration.
- Whispers perception (#147) merged and accepted in owner live testing: real
  fear, directed placement, false quarry and bounded add conversion felt good.
  Later tuning can respond to new evidence; acceptance does not prove equal balance.
- Assassin Shadow Reprise (#149) merged and accepted in owner live testing: the
  return was a nice addition and Rogue is working well for now. Trickster stays
  retained; further Rogue redesign is deferred unless new evidence warrants it.

- Fiend Aperture placement/cover follow-up (#151) merged and accepted in owner
  live testing: Aperture feels good now. Further changes respond to new evidence;
  acceptance does not establish equal identity balance.

- Whispered Doom / Thought Break (#152) merged and accepted in owner live
  testing: the reactive interruption felt nice.
- Elder Mind two-move foresight (#156) merged, tested and accepted. Its readable
  two-action window and shared recovery are the current Great Old One baseline.

## Current delivery

[Martial purpose review](MARTIAL_PURPOSE_REVIEW.md) and
[Champion projected shield](CHAMPION_PROJECTED_GUARD.md).
Current delivery is [Champion and Borrowed Anthem tuning](ROLE_TUNING.md), building on [Lich attribution](LICH_COMBAT_ATTRIBUTION.md) and the [reward-choice comparison](REWARD_CHOICE_USEFULNESS.md). See the [class balance coverage plan](CLASS_BALANCE_COVERAGE.md).
See the [Devotion, Vengeance and Valor purpose review](FINAL_SUPPORT_PURPOSE_REVIEW.md)
for the full cohort findings.
Grand Warding escape, Land transplantation, Hunter/Beast Master and Chaos
Crossing departure casting remain accepted. The owner merged/tested #180 and
accepted reflection readiness, return travel and the distinct mirror marker.

All 24 subclasses have completed the first purpose inspection. Light reflection,
both Life identities and the Refuge expulsion follow-up (#184) have been
playtested. The final support review provisionally retains the A choices for
Devotion, Vengeance and Valor. The owner merged and tested Relentless Vengeance and its pursuit tuning (#188). The owner liked Unyielding Faith in #189 and requested independent ally protection and clearer cues. The owner merged and tested #190 and accepted the [Faith follow-up](UNYIELDING_FAITH.md) for now. The owner merged and tested #191, liked the restored chorus and body passage, and found it weak when a ground hazard covered the crossing. The owner merged and tested the flight and passage follow-up (#192) and accepted [Battle Rhapsody](BATTLE_RHAPSODY.md) for now. Inspection does not establish live acceptance or equal power.

## Next development work, in order

The class comparisons are the coverage stage. They validate individual
mechanics and fix clear defects as we find them. Once all classes have
representative results, run two further passes on the same version:

1. **Power and progression.** Compare damage, survival, recovery and
   utility for builds doing comparable jobs, across solo and party sizes,
   encounter types and realistically acquired upgrades. Tune repeatable
   outliers and rerun matched baselines.
2. **Usefulness and choice.** Check whether identities, ordinary ranks
   and grafts are worth their slot or reward in the fights they are meant
   for. Review options that are rarely usable or dominate their
   alternatives. Adjust timing, coverage, cost or numbers as the evidence
   warrants, then verify with live playtests and the full comparison set.

The coverage and diagnostic passes are complete. Tuning remains open.
Use solo through four-player checks, judging DPS, healing and tanking by
their intended contributions. Keep solo more demanding while preserving
meaningful failure risk for full parties. Close the balance milestone only
after the strongest outstanding cases have a verified adjustment or an
explicit retain decision and harder group scenarios have been reviewed.
These passes precede the visual milestone. Once the boss and encounter
revamp changes what fights ask of players, use the established comparison
set for another targeted balance check.

| Stage                        | Concrete work                                                                                                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next                         | Calibrate harder three- and four-player cases, then tune the remaining role and reward outliers.                                                                                    |
| Following                    | Verify the final tuning decisions and live playtesting before the visual prototype.                                                                                                 |
| Martial identities           | Six inspected; Champion A and Battlemaster pair implemented. Totem accepted; Open Hand B accepted, A retained as support; Shadow B accepted, A retained as precision growth.        |
| Remaining nature identities  | Hunter / Beast Master merged and tested; Land B accepted for now. A routes retained as growth; Moon retained.                                                                       |
| Remaining caster identities  | Three inspected; Grand Warding escape accepted; Crossing departure casting accepted. Evoker stays retained.                                                                         |
| Remaining support identities | Light and Life follow-ups accepted. Devotion B and Vengeance B accepted for now. Valor B accepted for now. Whispers accepted.                                                       |
| Whole-system tuning          | 4,458 coverage fights across all subclasses. The first tuning batch adds 384 matched cases from solo through four players. Tuning remains open.                                     |
| Visual milestone             | Representative hero/form, boss, arena and attack/heal/barrier/control prototype on desktop and phone, then the broader visual production pass.                                      |
| Boss and encounter revamp    | After the visual production pass, audit the roster, prototype a boss, and test multi-boss and modifier interactions. See [boss and encounter revamp](BOSS_AND_ENCOUNTER_REVAMP.md). |

Use one bounded Sol 6.2 high design review where substantial planning is needed.
Proceed with a mature authorized plan; surface unresolved material gameplay
choices instead of guessing. Retain sound simple designs and revise the order
when evidence warrants it. Do not force a new mechanic into every slot or count
numerical amplification as identity by itself.

Local verification precedes push. Once only GitHub checks remain, stop polling;
the existing completion action reports the merge/help outcome. No automatic
merge or production deployment is part of this sequence.
