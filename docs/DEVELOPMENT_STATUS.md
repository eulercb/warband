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
Current delivery: [Hunter returning shots](HUNTER_RETURNING_SHOTS.md), following
the [Hunter / Beast Master / Land purpose review](NATURE_PURPOSE_REVIEW.md).
Shadow commitment (#167) is merged/tested/accepted by the owner. Shadow A remains
retained precision growth; the working Shadow Rhythm and simple skills remain.
Open Hand and the earlier martial/support baselines remain accepted.

Hunter B now uses outward/return projectile geometry: the caster's live position
routes the second leg, with half the paid damage per leg. Its native Arrow stays
ordinary; equipped-kit fallback handles compatible altered basics. This is
implemented pending owner live acceptance. Hunter A remains controlled-target
growth, not a new behavioral identity.

Beast Master's companion remains useful, but its two identity packages still need
purpose work. Land A remains growth; B duplicates its passive's field movement
and needs a coherent terrain interaction. These are reviewed findings, not shipped
redesigns. Moon stays retained and unchanged.

Sixteen of 24 subclasses have been inspected: the earlier thirteen are
accepted/retained. Of the three new nature reviews, Hunter B is implemented
pending acceptance; Beast Master and Land remain open. Eight subclasses await
review. Inspection, implementation and acceptance remain distinct states.

## Next development work, in order

| Stage                        | Concrete work                                                                                                                                                                |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next                         | Live-test Hunter returning shots; next development is Beast Master purpose work.                                                                                             |
| Following                    | Address Land after Beast Master; then review the remaining caster and support identities.                                                                                    |
| Martial identities           | Six inspected; Champion A and Battlemaster pair implemented. Totem accepted; Open Hand B accepted, A retained as support; Shadow B accepted, A retained as precision growth. |
| Remaining nature identities  | Hunter B implemented pending acceptance; Beast Master and Land reviewed/open. Moon retained.                                                                                 |
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
