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
Current delivery: [Wave Palm's capped Flow payoff](WAVE_PALM_FLOW.md) and
[Shadow Monk purpose review](SHADOW_MONK_PURPOSE_REVIEW.md).
Open Hand's expanded Flowing Water loop (#165) is merged, tested and accepted.
The owner then identified Wave consuming Flow without an attack bonus: capped
reach and absent windup made its old payoff inert. The +40u existing-force fallback
is implemented pending live acceptance. Accepted Open Hand movement remains.
Totem Ancestral Relay (#163), Battlemaster instant group steering (#162), silence
separation (#159) and Champion projected shield/emitted-wave cover (#157–158)
remain accepted baselines.

Open Hand A remains numerical support; B's movement loop is accepted. Shadow's
source review is complete: both identities remain useful growth on the existing
mobility-refund loop, with their behavioral replacement unresolved. A focused
prototype is next; no Shadow redesign is implemented or accepted.
Warlord's proactive counter core and Berserker's contact-versus-walking distinction
remain retained review findings. Wave follow-up acceptance and Shadow Monk
replacement remain open.

Thirteen of 24 subclasses have been inspected: seven earlier subclasses are
accepted/retained. Among the six martial reviews, Champion, Battlemaster, Totem
and Open Hand are accepted, Berserker is retained, and Shadow remains open. Eleven subclasses await review.
Inspection, implementation and owner acceptance remain distinct states.

## Next development work, in order

| Stage                        | Concrete work                                                                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next                         | Live-test Wave’s real Flow payoff; next development is the bounded Shadow Monk prototype described in its completed purpose review.                                                   |
| Following                    | Continue remaining nature identities after Shadow Monk; retain accepted routes and useful simple skills.                                                                              |
| Martial identities           | Six inspected; Champion A and Battlemaster pair implemented. Totem accepted; Open Hand B accepted, A retained as support; Shadow purpose reviewed, behavioral replacement unresolved. |
| Remaining nature identities  | Hunter, Beast Master and Land; Moon stays retained.                                                                                                                                   |
| Remaining caster identities  | Abjurer, Draconic and Wild Magic; Evoker stays retained.                                                                                                                              |
| Remaining support identities | Light, Life, Devotion, Vengeance and Valor; Whispers stays accepted.                                                                                                                  |
| Whole-system tuning          | Fixed-encounter power comparisons, ordinary-upgrade value, realistic reward acquisition and graft alternatives/compatibility.                                                         |
| Visual milestone             | Representative hero/form, boss, arena and attack/heal/barrier/control prototype on desktop and phone, then the broader visual production pass.                                        |

Use one bounded Sol 6.1 high design review where substantial planning is needed.
Proceed with a mature authorized plan; surface unresolved material gameplay
choices instead of guessing. Retain sound simple designs and revise the order
when evidence warrants it. Do not force a new mechanic into every slot or count
numerical amplification as identity by itself.

Local verification precedes push. Once only GitHub checks remain, stop polling;
the existing completion action reports the merge/help outcome. No automatic
merge or production deployment is part of this sequence.
