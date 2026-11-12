# Beast Master purpose and Hunter range follow-up

The owner accepted Hunter returning arrows as interesting, but found their outward
reach too short. One bounded Sol 6.1 high review covered that correction and the
next scheduled Beast Master purpose work. This delivery implements both, pending
owner playtesting. Moon and the accepted martial identities remain unchanged.

## Hunter: ordinary reach, then a quick return

The old `min(360u, travel cap / 2)` outbound leg unnecessarily surrendered firing
range. The new leg reaches the distance an ordinary shot can travel within its
normal range cap and 3s lifetime: `D = min(capped range, speed × 3s)`. Native
Multishot therefore travels 820u outward. A short 180u Forge receiver remains
180u; a slow receiver cannot exceed its ordinary lifetime-limited reach.

The return has a separate finite budget: `min(1.5D, D + 360u)`, at speed
`max(1.5 × outward speed, 2D per second)`. Its lifetime is that budget divided by
speed, plus 0.05s. Native Multishot returns at 1640u/s with 1180u of return travel.
Damage stays split 50% per leg, with ordinary piercing separately on each leg.
Cover blocks either leg. Movement still changes the return lane; this correction
adds neither another cast nor a second full damage budget.

Continuous cast-relative coordinates keep the return pointed toward the correct
owner image when a shot or owner wraps across an arena edge. Physical segments
and aperture emergence contribute once; the leg changes before ordinary expiry
can discard a shot at its outward boundary. Native and Forge previews use the
same trajectory calculation as combat.

## Beast Master: choose a quarry, then act independently

Pack Tactics (B) replaces its scattered Rain mitigation, Roll healing and
field/leech riders with a command behavior. A **fresh direct cast's first positive
hit on a living hostile within 600u** designates that foe for a **6s hunt**.
The existing wolf keeps biting that target at its ordinary cadence while the
hero dodges, heals, controls enemies or attacks elsewhere. Held/autofire casts
cannot designate, retarget or renew a hunt. After expiry the wolf rests until
another fresh command. A missed cast costs its normal recharge without selecting
a target.

A solo player can shoot the boss once, stop firing and use the hunt window for
positioning. In co-op, the player can keep the wolf on the boss while supporting
an ally. This changes target commitment and attention rather than adding another
named damage/mitigation package.

| Layer               | Resulting decision                                                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pack Bond without B | Direct hits command individual bites, gated once per 2.5s.                                                                                          |
| Pack Tactics B      | Fresh cast chooses a quarry; held attacks cannot redirect it. Retarget during recovery without refunding that recovery.                             |
| Alpha’s Fury A      | Retained faster windup and stronger controlled bites, honestly classified as growth.                                                                |
| Pounce / Bite       | Direct contact can issue a fresh command; their individual damage/heal and Honed upgrades retain value.                                             |
| Snare / Rain        | Existing control strengthens the wolf's controlled-target bite; periodic field ticks cannot designate.                                              |
| Nature's Bond       | Actual healing prepares the existing recipient ward, consumed by a successful wolf bite. No injury is required to begin a hunt.                     |
| Forge / graft       | An active Beast Master owner can command through real direct native or composed hits. Copying a skill never grants a wolf or the subclass identity. |

The wolf remains one host-owned spirit, with 16 ordinary bite damage, 0.3s windup,
2.5s gate and 600u owner leash. Fan contacts and returning legs share a command
token: one designation per accepted cast. Retargeting cancels an old pending bite
without resetting its gate. Death, charm, leaving range, owner downing, scene/end,
class/passive changes or replacing the command's source cancel the hunt.

The replicated visual contains only a detached quarry position, radius and lease,
never the host command token. A target ring, fang mark, shrinking lease arc and
short wolf tether make the command visible in the arena. Its geometry uses the
nearby wrapped target image, avoiding a line from a distant map corner. The
passive tooltip describes the active manual-command rule.

The flat-field upgrade inventory reports no ability/stat delta for B because its
behavior belongs to the owner passive. The command execution tests verify that
hook; adding unrelated numeric riders to make the inventory change would obscure
the identity again.

## Description cleanup

Removed Pursuing Rain's redundant flyer reminder and similar preservation clauses
on Frost Nova, Whirlwind, Mirror Image, Shadowstep and Dimension Door. Earthshaker
and Wave Palm describe their actual added pull and damage instead of saying that
Honed force is retained. Important targeting restrictions and nearby-player danger
remain explicit. Catalogue and resolved Forge readouts have regression coverage.

## Validation and next work

Focused combat tests cover fresh versus held input, repeated bites, lease expiry,
retargeting without a gate reset, invalid contacts, lifecycle cancellation,
detached replication, active tooltips, full outward reach, short/slow receivers,
wrapped returns and existing cover/aperture behavior. Browser checks exercise real
grand selection, host/snapshot rendering and desktop/phone readouts for every
native first pick and a Forge receiver, alongside existing nature/aperture and
companion checks. Final verification results are recorded in the PR.

After owner playtesting, the next development task is **Land B purpose work**:
its field movement currently duplicates Living Paths. Keep Land A as growth and
retain its useful simple terrain/healing tools. Then review Abjurer, Draconic and
Wild Magic, followed by Light, Life, Devotion, Vengeance and Valor. Broad balance,
progression/graft tuning and the dedicated visual milestone follow; see
[development status](DEVELOPMENT_STATUS.md).
