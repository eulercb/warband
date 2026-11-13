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
Current delivery: [Delayed damage and Pack Tactics follow-up](DELAYED_DAMAGE_PACK_FOLLOWUP.md).
The owner merged/tested #169 and accepted the restored returning-arrow reach.
The returning mechanic and chosen-quarry behavior were liked, with damage concerns:
this delivery adds case-specific delayed damage premiums and two smaller flanking
wolves to Pack Tactics. Those damage/pack changes remain pending owner acceptance.

Returning shots deal 60% per leg. Grand Venom and Clinging Snare receive distinct
conversion premiums; Silent Death's primary delayed strike gains 10%. Already
additive poison, echoes and retorts retain their output. Native/Forge descriptions
show the relevant fractions and actual poison rates.

Beast Master B keeps its 6s fresh-cast quarry command and 2.5s wave recovery:
a 16-damage lead wolf and two 4-damage flankers supply pack pressure while the
owner acts elsewhere. A remains controlled-companion and player-strike growth.
Land A remains growth; B still needs a terrain interaction rather than another
copy of Living Paths movement. Moon stays retained.

Sixteen of 24 subclasses have been inspected. Hunter and Beast Master behavior
were liked, with this damage follow-up pending acceptance. Land remains open;
eight subclasses await review. Inspection, implementation and acceptance remain
distinct states.

## Next development work, in order

| Stage                        | Concrete work                                                                                                                                                                |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next                         | Live-test delayed damage and the flanking pack; next development remains Land B purpose work.                                                                                |
| Following                    | After Land, review the remaining caster and support identities.                                                                                                              |
| Martial identities           | Six inspected; Champion A and Battlemaster pair implemented. Totem accepted; Open Hand B accepted, A retained as support; Shadow B accepted, A retained as precision growth. |
| Remaining nature identities  | Hunter / Beast Master damage follow-up pending acceptance; Land B open. A routes retained as growth; Moon retained.                                                          |
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
