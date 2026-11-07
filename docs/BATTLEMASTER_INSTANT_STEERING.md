# Battlemaster: steer the whole hit, during the attack

Status: PR161 merged and owner-tested. Most controls felt good; the owner explicitly
requested two changes to Grand Tactician: start moving enemies during their current
action, and steer every enemy hit instead of only one. Perfect Maneuver's responsive,
hit-independent 180u defensive step is retained as the accepted route. This steering
follow-up awaits owner playtesting.

## What the player does differently

A direct special now starts a short steering slide in its hit frame, even while a
boss winds up or channels. Native travel remains up to 80u at 600u/s (about 0.13s).
There is no wait for the boss to finish and no teleport inside hit-recipient loops.
Moving the caster of a narrow cone or body-centred burst can move that attack away
from the party. Its countdown continues; steering itself does not interrupt or
restart the action. A skill's own stun or interruption still has its ordinary effect.

Every eligible enemy actually hit can move: a cone can catch boss plus summons,
and different Volley projectiles can steer different enemies across frames. Each
cast remembers each successful recipient separately. It cannot steer the same foe
a second time even if its recovery expires before another projectile arrives.
A recovering or immune boss does not prevent the same skill from moving its summons.

Hold movement when pressing the skill to choose direction. Standing still pushes
each recipient away from the caster. Each foe keeps its six-second steering recovery,
shared between players. Basic attacks and damage ticks do not steer. Dead, charmed,
rooted, Steadfast or already moving/recovering recipients are rejected independently.
The cast's source class/epoch and living owner still govern delayed hits.

## Active attacks and truthful geometry

| Attack family                   | What moves and what remains committed                                                                                                                                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cones, such as Fire Breath      | Origin follows the boss; the committed direction and countdown remain. This enables a displacement dodge without rotating the attack back onto the party.                                                                                     |
| Body bursts, such as Tail Sweep | Centre follows the boss; size and countdown remain.                                                                                                                                                                                           |
| Charges / line attacks          | The locked heading and travel length follow the moved origin. Hit path and ordinary/foretold preview use the same cover-clipped endpoint and width. Charge landing ends leftover steering/knockback, avoiding a resumed side slide afterward. |
| Ground-targeted circles         | The marked world location stays fixed. Moving the caster does not drag that marker.                                                                                                                                                           |
| Tracking beams                  | Keep their target and current range/cover rules. Their line follows the live target from the moved boss. Sideways motion alone does not evade a tracking beam; moving its caster out of range or behind cover can help.                       |
| Projectiles                     | New shots spawn from the moved boss. Already emitted shots continue independently; ordinary tracking-at-release and Forethought's locked heading keep their existing rules.                                                                   |
| Placed hazards                  | Remain where placed. Steering does not move existing zones.                                                                                                                                                                                   |
| Summons                         | Spawn around the caster's current position.                                                                                                                                                                                                   |

This deliberately supersedes the earlier rule that protected a committed attack's
original origin by queueing steering. Owner feedback authorizes active attack
translation; placed world targets remain distinct from body-bound geometry.
Boss windups/channels continue advancing while moving. Autonomous walking, blinks
and new decisions do not compete with the steering slide. Recovery clocks continue.

Steering and other knockback/pull contributions combine through one collision path;
opposing directions can partly cancel. Solid cover, projected Bulwark collision,
existing-overlap escape and torus wrapping remain authoritative. Multiple players
cannot reverse or stack steering on a foe during its shared recovery.

Remote telegraphs follow the boss's displayed interpolated position. Self centres
and charge paths follow it too; ground marks keep their world coordinates. Tracking
markers follow the displayed/predicted living victim. Foretold shapes use the same
anchors, without mutating the authoritative snapshot. The old queued-after-action
label is removed; arrows show actual travel and the HUD says “Repositioning foes.”

## Receiving skills and build layers

| Skill/layer                     | Steering contribution                                                                                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Starting Shield Bash            | Every positive direct recipient qualifies. Existing damage, stun, ordinary upgrades and individual grand remain their own effects.                                                    |
| Trip Attack                     | Its melee control can steer a group; Honed/grand geometry and recharge continue to determine what it actually hits.                                                                   |
| Precision Volley                | Every blade can steer a different recipient. Repeated blades on the same foe do not produce repeated steering. Pierce/slow layers keep their existing delivery rules.                 |
| Taunt, Shield Wall, Roar, Rally | The accepted alternative identity keeps deliberate defensive travel, rather than adding attack-hit prerequisites.                                                                     |
| Cleave                          | Remains the ordinary basic/counter loop, without identity steering.                                                                                                                   |
| Copied / Forge specials         | Use the same component-authoritative multi-recipient trigger and captured direction, without the donor passive. Fitting, value, scaling and caps remain part of the component budget. |

Every first Battlemaster pick can steer through starting Bash; the ranged first pick
also has Volley. Solo play can shift an incoming body-bound attack. Co-op can move
multiple threats away from an ally, with each target's recovery bounding repeated
control. This does not claim every ability can be dodged by steering or that balance
is established by functional checks.

## Verification and delivery scope

Tests exercise real cone and projectile delivery, multiple victims across frames,
ineligible first recipients, per-target/per-cast deduplication beyond recovery,
shared ownership, copied components, channel cadence, cone/burst dodges, fixed ground
marks, tracking range and targets, translated charge paths and cover, independent
emitted projectiles, additive impulses, lifecycle cancellation and remote interpolation.
Existing defensive-step, first-pick, Forge, ordinary/Honed/grand and boundary tests
remain in the suite. Desktop and 320px touch smoke uses an actual Volley against
boss plus two summons during Fire Breath windup, including decoded peer snapshots.

A bounded Sol 6.1 high review recommended a focused active-attack geometry delivery.
Totem's unresolved B purpose and scattered riders are a separate design problem,
with no already-mature small change to bundle here. After this playtest and any
necessary adjustment, **Totem Warrior is next**, followed by Open Hand and Shadow,
remaining nature/caster/support reviews, system/reward/graft tuning and the dedicated
visual revamp. See [development status](DEVELOPMENT_STATUS.md).

Local results: **4,701 tests across 179 files passed**, with **98.06% branch coverage**
(the 98% floor is unchanged). All six Battlemaster desktop/touch cohorts, both
projected-guard cohorts and both loadout cohorts passed on a fresh-cache server.
Desktop and 320px screenshots were inspected. Catalogue/recharge checks, full lint,
formatting, production build and final TypeScript passed. These establish the
specific movement/geometry contracts; live feel and balance remain the owner's gate.
