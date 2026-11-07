# Martial purpose review: Knight, Barbarian and Monk

Baseline: PR156 merged and owner-tested. Two-move Elder Mind is accepted for
now; further work responds to new evidence. One bounded Sol 6.1 high source
review covers six martial subclasses and their twelve identity routes. This is
an identity review, not a balance ranking or acceptance of every route.

Use [the purpose rubric](IDENTITY_REVIEW_PLAN.md) and
[combined-build gate](UPGRADE_REVIEW_GATE.md). Existing catalogue descriptions in
[MARTIAL_GRANDS.md](MARTIAL_GRANDS.md) are historical where this note or later
deliveries supersede them.

Later implementation: [Battlemaster positioning](BATTLEMASTER_POSITIONING.md)
replaces the Battlemaster packages described below; owner live acceptance is
pending. The table records the original review findings.

## Decisions

| Subclass      | First route                                                                                                                                                    | Alternative route                                                                                                                                                             | Decision                                                                                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Champion      | Unbroken Champion's resistance helps hold a line, but subclass-strike leech is disconnected growth.                                                            | Warlord's Tempo challenges, then a positive melee connection readies the counter, rather than waiting to receive a hit.                                                       | Repair A with finite projected interception. Retain B's proactive counter core; its numerical support is not described as a new mechanic.                                    |
| Battlemaster  | Grand Tactician adds controlled-target damage to the existing control → Tactical Opening → counter sequence.                                                   | Perfect Maneuver spreads slow/ward effects; Shield Bash already stuns, the passive already slows wind-ups, and its Taunt absorption repeats the individual grand's recipient. | Both need purpose revision. Numerical stacking has value but does not establish a different decision. This is the next implementation/design pair.                           |
| Berserker     | Avatar of Fury supports sustained melee contact: build Momentum from hits, commit a finisher, spend Rampage on a basic.                                        | Blood Frenzy replaces hit generation with walking: circle to build, enter for the finisher, then spend Rampage.                                                               | Retain the contact-versus-walking choice. A is supporting growth on the native route, not a newly invented behavior. B's generation replacement has a real opportunity cost. |
| Totem Warrior | Great Spirit supplies accessible frontal guard → counter through Rage; its extra leech and assorted duration riders need later cleanup.                        | Ancestral Might shares utility wards and lengthens Earth territory without a common new preparation/spending decision.                                                        | Preserve A's useful guard core; revise B's purpose and review scattered supporting riders. Two sources of the same shared guard are not extra stacked charges.               |
| Open Hand     | Perfect Harmony extends preparation and reaches the same capped Flow extension sooner; controlled damage stacks onto existing follow-through.                  | Flowing Water adds heal/leech/resistance to the same spending sequence. Step's individual grand already supplies that resistance.                                             | Both need purpose work. Preserve existing Flowguard and Wind Step ally-crossing behavior; do not use a longer holding window or unrelated cleanse to claim a new loop.       |
| Shadow        | Shadow Incarnate commonly adds a critical to the same movement → Flow spender sequence; Cloud offers another setup source but cannot justify every first pick. | Silent Death adds Flow duration, healing and suppression while Shadow Rhythm already rewards spending with mobility recovery.                                                 | Revise both identity claims while preserving useful precision/mobility growth. No mature replacement is promised in this delivery.                                           |

“Retain” means preserve the useful mechanism in this review. It does not silently
count a new identity pair as accepted by owner live testing. Champion A is the
only gameplay identity changed in this delivery; the remaining findings are not
implemented merely because they were reviewed.

## Actual first-pick routes

Every row is assessed against a lone boss, starting at full health, without a
second subclass skill or a rare grand. Optional healing is not assumed effective
at full health.

| Subclass / first picks                                      | Available starting route and what changes                                                                                                                                                                                                                   |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Champion: Earthshaker, Bull Rush, Second Wind, Riposte      | Taunt/Shield Wall → face and receive a guarded contact → Cleave counter is always available. New A projects the finite guard into shot paths; B can challenge → connect → counter before an enemy attacks. No Second Wind injury is required.               |
| Battlemaster: Trip, Roar, Volley, Rally                     | Base Bash → positive direct hit creates Tactical Opening → melee counter. Trip/Volley can establish control differently; Roar prepares a challenge. Rally's heal needs injury but its guard setup does not. Existing identities largely amplify this route. |
| Berserker: Frenzy, Reckless Cleave, Ground Slam, Chain Pull | Base Rage → Momentum → Whirlwind → Rampage basic. A stays in contact; B earns stacks by resolved walking instead of melee. Neither requires the first skill's grand.                                                                                        |
| Totem: Bear, Wolf, Earth, Mend                              | Base Rage/Whirlwind and Spirit Shelter remain available. Great Spirit's Rage guard works independently of Bear/Wolf grands. Full-health Mend can still supply control resistance; effective healing is not the only route.                                  |
| Open Hand: Flurry, Wave, Wind, Wholeness                    | Base Step → Stunning Strike/Palm → Flowguard. Existing identities change durations/values rather than supplying a consistent alternative sequence. Preserve useful first skills and movement delivery while revising identity purpose.                      |
| Shadow: Dart, Shadow Step, Cloud, Shadow Strike             | Base Step → special → Shadow Rhythm mobility refund. Precision can support this, but Cloud cannot be an assumed second setup skill for the other three first picks.                                                                                         |

## Layer and overlap evidence

- Champion's ordinary Shield Wall boon adds blocks/duration under its cap. Aegis
  Eternal wards nearby allies; Bull Rush's grand adds a body guard; Riposte's grand
  adds reach/leech; Victorious Reprise heals a connecting readied melee counter
  under its own cooldown. New interception uses the existing finite pool and
  removes A's extra strike leech. It does not duplicate those individual roles.
- Battlemaster's Trip grand adds damage/controlled follow-through, Volley adds
  piercing/slow, Roar adds frontal counter-blocks and Rally offers an injured
  rescue route. These receiving skills must be compared together with Tactical
  Opening and each candidate identity, not assessed as a list of names.
- Berserker's ordinary/Honed Frenzy extends availability; it does not replace
  walking generation. Slam/Chain control grands can make Blood Frenzy's extra
  Whirlwind slow less marginal. The core identity difference is how stacks are
  earned, not that slow rider.
- Totem's Wolf grand and Bear guard provide another guard cast, with legitimate
  cadence value, but share one readiness/block pool. Bloodthirst already grows
  basic/Whirlwind leech. Earth and Mend should not receive unrelated riders just
  to make every bound skill mutate under an identity.
- Open Hand's extension budget stays 1s even if preparation/extension rates grow.
  Gale Walker repeats B's Step resistance; Stunning Strike's grand already
  supplies controlled-target follow-through. Existing ally crossing is real
  positioning behavior and should survive any later identity replacement.
- Shadow Strike's Honed leech/critical grand and ordinary Flow preparation
  reduce the novelty of the existing identity packages. A larger critical or
  another source of cast-slow is useful growth, not evidence of a new action loop.

Relevant execution sources: `content/classes.ts` (starting kits),
`content/subclasses.ts` and `content/subclassPassives.ts`,
`content/charUpgrades.ts` (ordinary/Honed, skill grands and identity recipes),
`combat/martial.ts`, `combat/subclassPassives.ts`, `combat/defense.ts` and
`combat/support.ts`. Runtime receiving-kit checks accompany the implemented
Champion route in [projected guard notes](CHAMPION_PROJECTED_GUARD.md).

## Delivery order

1. Implement/test Champion A's clear interception proposal; owner live test.
2. Resolve Battlemaster's pair with a coherent tactical choice, then implement
   mature findings. Do not silently retain both numerical packages as complete.
3. Address Totem and the two Monk pairs in bounded deliveries. Preserve the
   Berserker distinction and useful simple skills; follow later evidence for tuning.
4. Remaining nature, caster and support identities; whole-system power/reward/
   graft tuning; separate visual milestone.

No speculative replacement catalogue is authorized by this review. Mature plans
within the ongoing task can proceed; unresolved material gameplay choices need
a short checkpoint. Current acceptance and implementation status live in
[DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md).
