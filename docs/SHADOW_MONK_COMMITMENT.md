# Shadow Monk — Silent Death commitment prototype

Baseline: #165's Open Hand Flowing Water loop is accepted. The Wave Flow
correction (#166) is merged; the owner authorized the next step without further
live feedback on that follow-up. One bounded Sol 6.1 high review resolved the
[Shadow purpose findings](SHADOW_MONK_PURPOSE_REVIEW.md) into this implemented
prototype. Its feel and identity acceptance remain open until owner testing.

## The new decision

**Silent Death (B)** leaves a shadow to deliver the original melee special
**0.6s later**, from the place and facing where it was cast. The player can walk,
dash, blink or use other ready abilities during that commitment. The shadow's
attack stays put even as the body moves. An enemy leaving the footprint can make
the attack miss completely.

Instant Stunning/Shadow Strike already allowed movement after contact. Their new
use is interception: leave a cone while a pursuer is outside its reach, withdraw,
and let it enter the saved footprint before release. The body can be out of melee
reach when the committed strike lands. Delaying a target already in range is a
trade-off, not an automatic benefit.

For example, commit Quivering Palm beside a boss that has begun a ground attack,
then use the existing Step or ordinary movement to leave its danger before the
shadow releases. Step prepares Flow for the next commitment. An ally holding the
boss near the shadow can help the strike land while the Monk avoids a different
threat. During pursuit, a badly placed short cone can instead be left behind:
choosing a useful commitment point and facing is the cost of freeing the body.

There is one original attack and its normal damage/control. Flow supplies the
actual receiving reach/radius; it does not shorten the fixed shadow delay. The
receiver's body windup is replaced by commitment, so the readout does not claim
Flow removes a windup that no longer exists. Haste affects ordinary recharge;
Focus does not accelerate this fixed delay.

**Shadow Incarnate (A)** remains the useful precision-growth option. Its setup
and critical spending are retained; they are not presented as a new behavioral
identity. B removes its former extra Step healing/preparation, cast-slow riders
and Shadow Step resistance. Shadow Rhythm's normal Flow-spend mobility refund or
protected-recovery support remains and triggers once at launch.

## Comparison with accepted mechanics

| Existing mechanic | What the prototype changes                                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open Hand         | Contact travels with its real body. Shadow commits future contact at departure and leaves through ordinary controls.                                      |
| Knight footwork   | Adds movement to a utility cast. Shadow frees the body from a pending offensive strike, with no extra dash or movement trigger.                           |
| Assassin Reprise  | Earns an anchor return after another successful hit. Shadow requires no hit to leave and has no return command.                                           |
| Totem Relay       | Reuses a previous station for later burst origins. Each Shadow attack requires visiting its own commitment point; nothing persists as a reusable station. |
| Whispers Refrain  | Adds fractional echoed damage after later direct hits. Shadow delays the original attack and can lose that contact entirely.                              |

The initial attack-and-withdrawal hypothesis was rejected as a new automatic
step: that would repeat existing footwork. The prototype creates freedom through
separating contact from the body rather than introducing another movement system.
Enemy targeting, committed telegraphs and homing/tracking rules remain normal.
The shadow is a visible attack commitment; it supplies no immunity, cover or
party protection by occupying the point.

## Receiving kit and upgrade layers

| Receiver/layer                          | Result                                                                                                                                                                                       |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stunning Strike / Paralyzing Blow       | Fixed aimed cone; the existing stun and controlled-target follow-through land at release. Flow reach is captured at launch.                                                                  |
| Quivering Palm / Death Touch            | Fixed circle with existing stun or inward force. Pull origin is the shadow, and Flow captures its actual enlarged radius.                                                                    |
| Shadow Strike / Honed / Unerring Ambush | Fixed close cone; ordinary leech and grand critical/reach retain their roles at the successful contact.                                                                                      |
| Shadow Dart / Splintering Dart          | Remain a direct ranged Flow/control and impact-area route.                                                                                                                                   |
| Cloud / Creeping Shadow                 | Remain placed ticking territory and its first-foe following grand. Their delivery is not converted into a detached melee strike.                                                             |
| Step / Shadow Step / Guarded Arrival    | Existing movement/preparation and the individual frontal counter guard remain available as normal ready actions.                                                                             |
| Shadow Rhythm                           | The actual launch Flow spend can refund running mobility or trigger its existing protected-recovery support, once under its normal 4s gate. Release does not spend Flow or repeat this hook. |
| Shadow Incarnate                        | Retained precision growth; selecting it replaces B normally through the grand loadout.                                                                                                       |

Every first pick has the starting Stunning Strike/Palm commitment route against
a lone boss, at full health, without adds, another subclass skill or a rare grand.
The body can leave on a miss as well as a hit. Selecting B does not make all four
subclass skills acquire an unrelated rider.

## Cast, timing and interruption contract

Cooldown, silence, stun and normal cast gates apply before launch. The actual
resource resolver commits Flow/Momentum and a bounded payload once, and the
shadow captures its position, aim and geometry. Activation/on-use hooks run at
launch; direct contact, criticals, control, leech and per-cast hit bookkeeping run
at release. Forces and directional melee bonuses use the shadow's real origin.

Multiple ready specials can leave their own paid commitments; a later cast never
replaces an earlier attack. The five nonbasic slots, minimum 4s recharges and
0.6s delay naturally bound pending shadows in normal play. Held autofire uses
ordinary cooldown cadence and cannot change an existing shadow's aim. There is
no new follow-up input, readiness bar or movement button.

Owner stun, root, silence or forced movement **after** commitment affects the body
normally while the independent attack remains. Root may prevent withdrawal.
Downing/death, leaving combat, source removal/replacement and class changes cancel
pending contact. An epoch handles swapping away and back. Spent resources remain
spent. Dead, immune, converted or departed targets follow the receiving strike's
normal contact rules.

The prototype preserves each cone/burst's existing aerial and obstacle rules.
The ghost has no pathing footprint; the player's ordinary movement and escape
skills retain their own collision rules.

## Forge and presentation

`shadowCommit` is a real nonbasic cone/burst component, valued at 40 for this
prototype. Synthesis fitting, decomposition/recomposition, refresh, deduplication,
scaling and caps preserve the fixed timing. Both valuation and recomposition
remove the absent body-windup discount. Copied casts work without donor Flow or
Shadow Rhythm. The ordinary compatible Monk starting-burst synthesis gives every
Forge first pick a receiver. Competing Palm travel, Relay and targeted Infernal
Claim origins cannot combine with commitment.

Public snapshots contain only each shadow's ID, slot, fixed origin/facing,
actual geometry and remaining delay. Owner/source references and cast tokens
stay host-side. A stationary violet silhouette, exact cone/circle and shrinking
commitment ring show the pending attack. Normal attack contact visuals appear
there at release. Ready skill descriptions state the delay and freedom to act.
Remote interpolation preserves the stationary footprint beside the moving body.

## Verification and owner test

Regression tests cover all four first picks, pre-release HP, single direct contact,
actual input withdrawal, predictive interception, captured aim, departure misses, immune/dead targets,
prepared geometry/refund, simultaneous commitments, held input, body control,
ownership/source/class interruption, force origin, copied and synthesized kits,
normalization, component pricing and public visual state.

Cold-cache browser scenarios select B through the production grand manager,
then use World input and actual desktop/320px controls with the Pixi renderer.
All first picks and Forge are exercised: no launch hit, body free, stationary
remote footprint, truthful readout, one original hit. Existing martial-grand and
Open Hand Flow-chain scenarios run alongside it. Final checks are recorded in
the PR; passing them does not establish equal strength or enjoyment.

Try unprepared Palm → Step away before release; then compare a Flow-prepared
commitment. Try aimed Stunning/Shadow Strike while retreating or moving sideways,
and watch whether ordinary boss pursuit makes the delay feel too punishing.
Compare A's immediate precision follow-through with B's committed placement.
Judge whether the fixed shadow footprint and release are easy to read.

If accepted, the next development step is the remaining nature purpose review:
**Hunter, Beast Master and Land**, while Moon remains retained. Then continue
caster/support identities, whole-system power/reward/graft tuning and the visual
revamp. See [development status](DEVELOPMENT_STATUS.md).
