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
Current delivery: [Land transplantation and randomized Volley readouts](LAND_TRANSPLANT_VOLLEY_READOUT.md).
The owner merged/tested #172. Volley's stale fixed-result wording is corrected:
its native recipe adds two arrows and eight degrees per rank; resolved cards
show the current randomized result. Related projectile-count and Ranger readouts
received the same bounded cleanup.

Land B Eternal Season now gives eligible fields one deliberate transplant during
their original recharge. It preserves lifetime/tick timing and anchors a following
field, with actual destination previews and retained Forge components. It replaces
the duplicate movement and scattered riders. This is implemented pending owner
playtesting. Land A remains growth; Moon stays retained. Hunter/Beast Master
follow-ups are the merged/tested baseline; delayed-damage numbers remain subject
to the future overall balance pass.

Sixteen of 24 subclasses have been inspected. All nature identity decisions now
have an implementation or retention decision; Land B still needs live acceptance.
Eight subclasses await review. Inspection, implementation and acceptance remain
distinct states.

## Next development work, in order

| Stage                        | Concrete work                                                                                                                                                                |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next                         | Live-test Land transplantation and the corrected readouts; next development is the Abjurer / Draconic / Wild Magic identity review.                                          |
| Following                    | After the caster review, review the remaining support identities.                                                                                                            |
| Martial identities           | Six inspected; Champion A and Battlemaster pair implemented. Totem accepted; Open Hand B accepted, A retained as support; Shadow B accepted, A retained as precision growth. |
| Remaining nature identities  | Hunter / Beast Master merged and tested; Land B implemented pending acceptance. A routes retained as growth; Moon retained.                                                  |
| Remaining caster identities  | Abjurer, Draconic and Wild Magic; Evoker stays retained.                                                                                                                     |
| Remaining support identities | Light, Life, Devotion, Vengeance and Valor; Whispers stays accepted.                                                                                                         |
| Whole-system tuning          | Fixed-encounter power comparisons, ordinary-upgrade value, realistic reward acquisition and graft alternatives/compatibility.                                                |
| Visual milestone             | Representative hero/form, boss, arena and attack/heal/barrier/control prototype on desktop and phone, then the broader visual production pass.                               |

Use one bounded Sol 6.1 high design review where substantial planning is needed.
Proceed with a mature authorized plan; surface unresolved material gameplay
choices instead of guessing. Retain sound simple designs and revise the order
when evidence warrants it. Do not force a new mechanic into every slot or count
numerical amplification as identity by itself.

Local verification precedes push. Once only GitHub checks remain, stop polling;
the existing completion action reports the merge/help outcome. No automatic
merge or production deployment is part of this sequence.
