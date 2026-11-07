# Battlemaster: move the foe or move yourself

Historical PR160 design. Owner testing found activation unreliable; its counter
and portable-mark rules are superseded by [the responsiveness follow-up](BATTLEMASTER_RESPONSIVENESS.md).

Status: implemented and locally verified; **owner live acceptance pending**.
The owner merged/tested #159's silence-marker separation before this delivery.
The earlier [positioning plan](BATTLEMASTER_POSITIONING_PLAN.md) supplied the
candidate pair; a focused prototype and one bounded follow-up review resolved
committed-action timing, projectile ordering and class-swap invalidation.

## The player's two routes

| Route            | Preparation                                                                         | Payoff and decision                                                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Grand Tactician  | Trigger Tactical Opening on a controlled foe, earning its existing 4s melee counter | Counter that marked foe while holding movement to steer it up to 80u. Standing still pushes it away. Choose which enemy to move and where to put it. |
| Perfect Maneuver | Ready a melee counter through control or a guarded hit                              | Connect while holding movement to step up to 90u yourself, after the strike. Standing still holds position. Choose when a counter is also an exit.   |

The existing counter damage remains the counter's ordinary payoff. These
identities replace their old controlled-damage/absorption/slow/ward packages;
they do not add another numerical reward to claim a new identity.

Solo examples:

- A: Bash to stun → a direct hit on the controlled boss opens it → the next melee
  counter steers that boss away from your space or toward useful terrain.
- B: Taunt/Shield Wall → receive a guarded contact → counter while steering out
  of danger. The control → Opening route can prepare it too.

With allies, A repositions a shared enemy; B leaves that enemy available where
teammates expect it while moving the Knight. Both remain useful against one boss
with Trip, Roar, Volley or Rally as the only first pick, including full health.
Neither assumes adds, injury, a second subclass skill or an individual grand.

## Receiving skills and existing upgrades

| Layer                             | Retained behavior and marginal value                                                                                                                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Starting kit                      | Cleave and Bash can spend native counters; Taunt/Shield Wall provide guard routes. Bash's control enables Tactical Opening.                                                                                 |
| Tactical Opening                  | A direct hit on an already controlled foe readies the ordinary counter and applies its existing wind-up slow, on its existing cooldown. A remembers that exact target; B accepts any readied melee counter. |
| Trip / Honed / grand              | Keeps its stun, damage and controlled-target follow-through. Native melee counters can carry the spatial payoff.                                                                                            |
| Menacing Roar / Honed / grand     | Keeps challenge/counter preparation and frontal guard. It does not gain an unrelated movement-on-cast rider.                                                                                                |
| Precision Volley / Honed / grand  | Keeps ranged blades, piercing and slow. It can help prepare Opening, but a native melee counter still finishes the maneuver. No unusable native counter payload is attached to a projectile.                |
| Rally / Honed / grand             | Keeps injured-ally rescue, recovery field and guarded-counter preparation. Full-health play can use the native Bash/basic route.                                                                            |
| Taunt grand / Thunderclap         | Taunt's absorption remains a separate protection choice. Thunderclap's existing pull completes before a later maneuver launches; no opposing displacement is added to that same contact.                    |
| Ordinary/Honed recharge and Haste | Continue to affect their receiving skills. Maneuver recovery stays 6s; it is not shortened by recharge bonuses.                                                                                             |

A counter against the wrong foe retains its ordinary damage and does not move
that foe. A counter prepared by that same multi-target cast cannot supply a
second spatial payoff. Positive-hit provenance and the original counter object
captured at cast start distinguish existing preparation from newly generated
readiness.

## Committed attacks and collision

Grand Tactician requests **queued** displacement when a boss is winding up or
channeling. The maneuver does not change that action's target, aim or origin. A charge
lands at its original destination before the maneuver starts from that landing.
An existing forced-movement slide also finishes first. The request launches in
recover/idle before the next decision; a moving boss cannot start a new action
or early committed preview partway through this travel. Launch occurs only after
the full frame's strikes and riders finish. A new external shove pauses the
remaining distance. Competing forces get at most 1s of waiting outside a committed
attack; continued contention cancels the request into 6s shared recovery, so it
cannot indefinitely reserve the boss's next decision.

A shared **6s enemy recovery begins when movement launches**. Only one request
can wait on a foe, so a long channel cannot let multiplayer requests accumulate
or consume the entire recovery before movement happens. Owner loss, downing,
class changes, target death/conversion, target root or steadfast cancel pending/travel
state. Failed movement does not become extra damage.

Enemy movement uses torus-aware swept stops against ordinary solid obstacles
and Aperture barricades. A large boss already touching/overlapping cover may
escape it, but cannot move deeper into it. Existing fear/lure/charm AI cannot add
another movement path during maneuver travel; conversion removes hostility and
cancels the request.

Perfect Maneuver starts an inert hero glide **after all contacts in the strike**.
It supplies no iframe, landing attack, heal, guard, utility recast or duplicate
step. Solid cover stops it. Roots, stuns, casting or another active movement
prevent launch; root/stun, an incoming shove, lethal damage or class change stop the maneuver
glide afterward.
It has **6s owner recovery**. Movement direction is captured when the attack is
cast, including cast-time and delayed deliveries; it does not read unrelated
later input at impact.

## Copied and Forge skills

Components use a standalone **two-cast mark** rather than requiring the donor
passive or native Knight counters. A positive direct cast carrying the component
marks its first living foe for 4s. A later positive direct cast on that foe,
including a basic, requests the chosen maneuver. One cast's Volley blades or
multiple recipients cannot prepare and spend the mark together.

The finishing basic need not carry the component, so a copied special with a
longer cooldown than the mark window remains usable. Push uses shared enemy
recovery; step uses owner recovery. Their descriptions state the altered trigger,
recipient, actual distance and stationary behavior. Utilities retain their useful
roles; direct receiving starting/Forge skills carry the portable contract.

Cast order is monotonic per owner. An older delayed shot cannot spend or replace
newer preparation, including after its expiry. Successful class changes increment
an invalidation epoch and immediately discard marks, pending steps and owned foe
motion; swapping away and back cannot revive old projectiles. Recovery is not
reset by class swaps.

A maneuver is a priced Forge component (12 + distance × 0.25), fitted to direct
strikes. Distance scales with budget and caps at 30–80u for push / 30–90u for step;
timing and provenance rules remain fixed. Decomposition, recomposition, refresh,
scaling, caps and generated copy carry it. Recomposition keeps one maneuver
contract when donor paths converge. Actual synthesis is tested without the
Knight passive or native counter generators.

## Readable states

- Prepared target: corner brackets plus a solid direction arrow; only the local
  owner's prepared target is emphasized to avoid duplicate party markers.
- Pending displacement: dashed arrow and **Reposition after action** at the foe,
  plus a queued HUD notice. Waiting is not presented as already moving.
- Travel: solid arrow following the actual moving foe.
- Personal footwork: direction arrow while steering a readied counter; portable
  footwork separately brackets its marked enemy, without suggesting enemy movement. An
  explicit HUD reminder that stationary input holds position.
- Recovery: host-authoritative remaining time, including feedback when another
  owner has already moved the attempted target; enemy recovery is shared, owner
  recovery belongs to the stepping player. Remote snapshots carry public cue data
  without exposing cast tokens or counter references.

The existing status-name/HP lanes are retained. Silence badges render above
action arrows. On phones, a silence notice takes priority over the maneuver
hint to keep health and touch controls clear; arena movement/target cues remain
visible. Phone/desktop screenshots exercise
actual Bash → controlled hit → counter input and both positional payoffs; they
also verify the queued attack remains fixed and the footwork grants no immunity.

## Validation and handoff

Prototype and regression tests cover committed cones/channels/charges, contact
ordering, positive/missed/immune/zero/lethal-safe paths, full-health first picks,
ordinary/Honed/grand receiving layers, target/owner state loss, delayed ordering,
class-swap return, root/steadfast, competing movement, cover and copied/actual
synthesized skills. The real browser smoke is part of CI alongside the existing
martial cohort and projected-guard smokes. Functional checks establish these
contracts, not fun or equal balance; owner playtesting is the acceptance gate.

Local verification: **4,659 tests / 178 files pass**, with **98.06% branch
coverage** against the unchanged 98% floor. Final TypeScript/build, lint,
formatting, inventory/recharge checks, all six native/Forge desktop/phone maneuver
smokes and the twelve martial grand-selection/Haste browser cohorts pass.
The focused maneuver file contains 79 prototype/lifecycle/receiving-kit cases;
seven additional HUD cases distinguish native/portable readiness, queue, travel
and recovery.

After playtesting, address **Totem Warrior's unresolved identity package and
scattered riders**, then the Open Hand/Shadow findings in bounded deliveries.
Remaining nature/caster/support reviews follow, then system/reward/graft tuning
and the dedicated visual revamp. See [development status](DEVELOPMENT_STATUS.md).
