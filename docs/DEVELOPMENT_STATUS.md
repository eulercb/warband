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
Current delivery: [Held basics and grouped pack return](PACK_BASIC_RESTART.md).
The owner merged/tested #171 and found following/continuity improved. This delivery
lets held basics start new hunts when idle, while preserving active target/timer
commitment. Returning flankers follow the lead's torus route rather than splitting
across separate shortcuts. These fixes are pending owner acceptance.

Delayed-damage premiums remain provisionally accepted for future overall tuning.
Pack activation still requires a positive direct hit within 600u; the chosen hunt
continues beyond that range. Damage, wave recovery and ward behavior are unchanged.

Land A remains growth. Land B's next prototype candidate is a one-time deliberate
field transplant that preserves lifetime and tick timing. Recast, following-field,
healing and Forge contracts still need prototype work; this is not implemented.
Moon stays retained. Sixteen of 24 subclasses have been inspected; eight await
review. Inspection, implementation and acceptance remain distinct.

## Next development work, in order

| Stage                        | Concrete work                                                                                                                                                                |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next                         | Live-test held-basic hunt restarts and the shared return route; next development is the Land B field-transplant prototype.                                                   |
| Following                    | After Land, review the remaining caster and support identities.                                                                                                              |
| Martial identities           | Six inspected; Champion A and Battlemaster pair implemented. Totem accepted; Open Hand B accepted, A retained as support; Shadow B accepted, A retained as precision growth. |
| Remaining nature identities  | Delayed damage accepted provisionally; held-basic / grouped-return fixes pending acceptance; Land B prototype next. A routes retained as growth; Moon retained.              |
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
