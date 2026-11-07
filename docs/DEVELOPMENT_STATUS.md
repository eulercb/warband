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
Current delivery: [Battlemaster positioning](BATTLEMASTER_POSITIONING.md).
The owner merged/tested the silence-marker separation (#159); that readability
follow-up is the current baseline, with future changes responding to feedback.
Champion's projected shield and emitted-wave cover (#157–158) remain merged/tested.

Battlemaster A now repositions its Tactical Opening target after a connecting
counter; B steps the Knight after a connecting counter. Committed-attack,
collision and portable-cast prototypes are implemented and regression-tested;
owner live acceptance remains pending. The old numerical packages are removed.
Warlord's proactive counter core and Berserker's contact-versus-walking distinction
remain retained review findings. Totem and Monk purpose findings remain open.

Thirteen of 24 subclasses have been inspected: seven earlier subclasses are
accepted/retained, six martial subclasses now have review findings (one new
Champion implemented and Battlemaster pair now awaiting live acceptance), and 11 await
review. Inspection,
implementation and owner acceptance remain distinct states.

## Next development work, in order

| Stage                        | Concrete work                                                                                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Next                         | Live-test Battlemaster's two positioning routes, then repair Totem Warrior's unresolved package and scattered riders.                          |
| Following                    | Address Totem and Monk findings in bounded deliveries; retain the Berserker distinction and useful simple skills.                              |
| Martial identities           | Six inspected; Champion A and Battlemaster pair implemented. Totem/Monk findings remain open.                                                  |
| Remaining nature identities  | Hunter, Beast Master and Land; Moon stays retained.                                                                                            |
| Remaining caster identities  | Abjurer, Draconic and Wild Magic; Evoker stays retained.                                                                                       |
| Remaining support identities | Light, Life, Devotion, Vengeance and Valor; Whispers stays accepted.                                                                           |
| Whole-system tuning          | Fixed-encounter power comparisons, ordinary-upgrade value, realistic reward acquisition and graft alternatives/compatibility.                  |
| Visual milestone             | Representative hero/form, boss, arena and attack/heal/barrier/control prototype on desktop and phone, then the broader visual production pass. |

Use one bounded Sol 6.1 high design review where substantial planning is needed.
Proceed with a mature authorized plan; surface unresolved material gameplay
choices instead of guessing. Retain sound simple designs and revise the order
when evidence warrants it. Do not force a new mechanic into every slot or count
numerical amplification as identity by itself.

Local verification precedes push. Once only GitHub checks remain, stop polling;
the existing completion action reports the merge/help outcome. No automatic
merge or production deployment is part of this sequence.
