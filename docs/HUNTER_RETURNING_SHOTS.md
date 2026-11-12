# Hunter — Relentless Hunt returning shots

Historical first delivery. The owner liked this mechanic after merging #168;
the short outward range below is superseded by the
[ordinary-reach correction](BEAST_MASTER_PURPOSE.md).

Baseline: Shadow commitment (#167) is merged, tested and accepted. The
[nature purpose review](NATURE_PURPOSE_REVIEW.md) found Hunter B lacked a coherent
attack loop. This delivery implements its replacement; player acceptance of the
new trajectory remains open. Apex Predator is retained as conditional growth.

## The new action loop

Eligible plain projectile specials travel outward, then return toward the
caster's **current body position**. Walking or Roll changes the return lane.
Each leg carries **50% of the original projectile damage**, so the player commits
both an initial shot and a later route instead of receiving another full-damage
attack. Each projectile keeps its normal hit/piercing count separately per leg.

For example, shoot Multishot past a boss, then Roll sideways: arrows still travel
out along the aimed fan, but converge back toward the new body position. They
can hit foes that were outside the original firing lane. An ally can use the
resulting pressure without being moved or receiving a hidden protection effect.
The caster remains responsible for that chosen position and for ordinary enemy
attack tracking.

The outward distance is `min(360u, original travel cap / 2)`, reserving travel for
the return even on shorter copied shots. The original total range budget and 3s
lifetime remain finite. Catching the owner ends a returning shot; cover absorbs
either leg. Teleporting away can leave a shot unable to catch its owner before
its travel budget expires.

A shot that spends its outbound piercing allowance continues harmlessly to the
turn point. It does **not** turn inside the struck body and produce an automatic
second hit there. The return receives a fresh copy of the authored hit count,
and each hostile can be hit once per leg. Dead and converted adds retain normal
eligibility rules; immunity consumes the contact as for ordinary shots.

## Receiving kit and trade-offs

| Layer                                                 | Role                                                                                                                                                                          |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ordinary Arrow                                        | Keeps full damage and normal outward range in the native kit; it remains straightforward pressure beyond the return route's shorter outward reach.                            |
| Multishot / ordinary fan, speed, damage / Frostvolley | Starting return route with every first Hunter pick. Fan and piercing retain value on both legs; existing control applies at real contacts. Windup and recharge remain normal. |
| Hail / Driving Hail                                   | Existing close push/slow and stronger displacement remain. No unrelated return rider is placed on a burst.                                                                    |
| Quarry / Honed                                        | Plain piercing Quarry receives the route; damage/speed/piercing still matter.                                                                                                 |
| Shattering Quarry                                     | Its explosion retains the ordinary impact payload and opts out of returning. Starting Multishot still supplies the route.                                                     |
| Stand / Sheltering Stand                              | Overhead territory, ally movement and grand mitigation retain their purpose. B's extra field-movement increment is removed.                                                   |
| Volley / Concentrated Volley                          | Its ordinary or narrowed fan shapes both legs; the original damage budget is split per arrow.                                                                                 |
| Roll                                                  | Existing B sprint (+25% for 4s) and 2s hard-control resistance help the caster shape the return route. They are retained tools, not the identity claim by themselves.         |
| Exposed Quarry                                        | Existing party-shared vulnerability refreshes on real direct contacts, without stacking marks or becoming a second passive.                                                   |
| Apex Predator (A)                                     | Retained controlled-target growth with Rain setup; no claim of a new behavioral identity.                                                                                     |

B removes the previous disconnected Hunter direct-hit windup suppression and
extra field movement. The real trade-offs are half immediate damage, shorter
outward reach, the need to route/catch the second leg and possible cover losses.
Criticals, marks and normal hit/control riders can affect final damage on each
contact; the 50/50 split describes the original damage budget, not a guarantee
that final damage will be identical under different buffs.

## Ownership, copy and component rules

`returningShot` is a priced projectile routing component, initially valued at 15.
It preserves the fixed split and turn bound through decomposition, recomposition,
refresh, fitting, scaling, caps and actual synthesis. Damage is valued once;
normal rooted windup remains priced and executed. Explosions and on-impact zones
cannot acquire the route: otherwise a return could duplicate an entire area or
support payload. An explosive upgrade removes the unavailable return component
from a refreshed readout.

Actual equipped starting specials are checked after graft replay. If none can
receive the route, a compatible plain basic receives it instead. Reclaiming the
normal Multishot restores the native special-shot route. A composition with no
suitable projectile retains its useful payloads rather than minting an extra
free shot; the ability readouts show exactly which retained receiver returns.
Copied return components use the caster's active class and source, without a
Hunter passive requirement.

The two legs keep the same original cast/refund/mark tokens. Resetting the
per-leg hit list does not mint a new cast or repeat once-per-cast rewards.
Downing/death, leaving combat, class changes or loss/replacement of the source
cancel the returning shot. Ordinary player movement steers the return; the
feature adds no automatic displacement. Existing firing conduits retain their
range cost, and spent harmless contacts cannot trap their collision loop.

## Readability and verification

Outward shots have a spear/shaft silhouette and warm trail. Returning shots have
a second chevron and cool trail, with a brief turn ring. These shapes override
the ordinary projectile sprite for this trait, so the phase distinction does not
rely only on color. Public snapshots carry phase/turn state and actual position
and velocity; owner/source references remain host-side.

Tests cover split damage, per-leg hit counts, spent harmless travel, moved-owner
lanes, cover, short travel caps, swept catch, conduit-routed catch, expiry,
ownership, immunity, cast tokens, marks, Honed/grand combinations, real graft and
reclaim, copied/retained components and actual Forge synthesis. Browser scenarios
select B through production grand controls and use actual desktop/320px inputs,
Roll or ordinary Forge movement, remote snapshots and the Pixi renderer. They
show a return recipient outside the original lane. Existing nature-grand and
conduit scenarios run alongside them; final checks are recorded in the PR.

Owner test: compare full-range Arrow with the shorter two-leg Multishot, change
the return line with lateral movement/Roll, try Quarry's explosive grand versus
plain Quarry, and test both sides of cover. Judge whether committing the second
lane is useful enough to justify the split immediate damage.

After acceptance: Beast Master purpose work, then Land; remaining caster/support
identities, whole-system power/reward/graft tuning and the visual revamp follow.
See [development status](DEVELOPMENT_STATUS.md).
