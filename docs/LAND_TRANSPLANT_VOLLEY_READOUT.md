# Land field transplantation and randomized Volley readouts

The owner merged/tested #172 and reported that Volley's fixed “5 arrows (+2)”
wording no longer matched randomized Multishot counts. The requested text fix is
combined with the scheduled Land B step. One bounded Sol 6.1 high review settled
the field-transplant contract before implementation.

## Volley: state the addition, show the actual result

The native recipe adds **2 projectiles and 8° fan width per rank**. It does not
set the final count to five. Run variation can start Multishot at two, three or
four arrows, giving four, five or six after the first Volley rank. Further native
ranks add the same amounts. Volley's description now states those additions;
the existing resolved offer preview shows the actual resulting count and damage.

The same pass removes assumed final counts on Splintering Thorns (+1 thorn,
+5 damage per thorn, at least a 14° fan) and Twinned Spell (+1 bolt, +4 damage per
bolt). Adjacent Ranger damage, field and Roll descriptions also state additions
rather than pre-randomization final totals. Forge retains its receiver-specific
preview; composition/fan caps are reflected in that resolved result rather than
promising that every forged delivery receives the native count.

Regression tests cover 32 procedural seeds, all five repeat ranks, real projectile
spawns, generated offers and repeated Forge ranks. This is a bounded pass over
these known count/readout cases, not a claim that every old description has now
been audited.

## Eternal Season: reposition the same remaining field

Land A remains controlled-target growth. Land B **Eternal Season** replaces its
scattered movement, healing and direct-slow riders with one territory decision:
**during a field's original running recharge, release and press that source
ability again to transplant the existing field once.**

The destination is fixed ahead along the current aim direction: 460u before the
usual arena-relative placement cap. The authoritative HUD and exact ghost ring
show the actual capped distance. The game supplies an aim direction, not an
arbitrary cursor distance; this does not promise free placement anywhere nearby.
The endpoint wraps with the arena just like ordinary field placement.

The field must have completed its original arming. Transplanting then moves its
existing object immediately, keeping its ID, remaining/full lifetime, radius,
tick accumulator, damage/healing, poison contacts, buffs, root/slow payload and
flight rules. It does not spawn a second field, re-arm, perform an immediate tick,
consume another resource or reset cooldown. The next scheduled tick uses the new
position. Already-applied effects on former occupants expire normally; enemies
are not dragged or freshly rooted just by moving the field.

When the original cooldown becomes ready, normal casting takes priority and the
unused old transplant expires. Held autofire cannot spend a transplant. Stun,
silence, casting, glide and shove block it; root does not, because the player is
not moving. Source replacement, class swaps, downing, expiry and leaving combat
invalidate readiness without refreshing or deleting ordinary remaining fields.

### First picks and existing layers

| Layer / receiver                  | Resulting action                                                                                                                                    |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Starting Entangle                 | Full-health solo route with every first Land pick: control one location, then move the remaining territory after the fight changes position.        |
| Erupting Earth / Gust first picks | Direct skills keep their current roles; starting Entangle supplies the field decision. No unrelated substitute damage rider is added.               |
| Wall of Thorns                    | Move its existing damage/healing field once, preserving the shared tick schedule.                                                                   |
| Healing Spring                    | Can transplant at full health without first performing effective healing. The next ordinary tick heals whoever occupies the new position.           |
| Living Paths                      | Its existing occupancy benefits move with the field; Eternal Season changes where territory sits rather than repeating movement bonuses.            |
| Wandering Briar                   | Transplanting deliberately anchors the field: following stops and cannot reacquire, preventing snapback after a deliberate move.                    |
| Regrowth / recovery groves        | Remain tied to their effective-heal contract; a recovery grove does not silently claim its heal-source slot for transplantation.                    |
| Ordinary/Honed ranks and Haste    | Resolved field payload, radius, duration and original recharge remain authoritative. No new recharge reduction or lifetime extension is introduced. |

Solo: plant Entangle, use its early control, then reposition its remaining ticks
when the boss relocates. In co-op, choose between keeping the party's current
recovery/ward territory and covering a new fighting position. This differs from
Briar's autonomous enemy following and Totem's relay of attack origins: Eternal
Season moves one existing physical field on deliberate input.

### Ownership and Forge

Each source slot tracks its newest accepted cast, and only the first field from
that cast becomes its one-use candidate. Field slots work independently. A late
older projectile bloom cannot steal the newer cast's candidate or give extra
transplants. Runtime provenance stays host-only; snapshots carry detached
readiness, source position, exact destination, radius, lifetime and block reason.

`zoneTransplant` is retained inside the selected Forge zone component and priced
at 12 utility value. It survives decomposition, recomposition, fitting and retained
component refresh, including projectile-to-field blooms. A copied field can use
its own source slot on another class. A composition without that field component
has no transplant and does not advertise one. Eternal Season requires a real field
receiver to be eligible; an earned identity stays banked if a kit has none.

The keyboard and touch HUD show **Transplant** during the running cooldown.
An earned Shadow Return and an unspent Aperture Ember keep their prior action
priority; transplant precedes an awaiting, unearned Return. The renderer marks the
selected live field and its exact destination with distinct rings and a center
cross. An edge cue points toward a destination outside the camera, including on
phones. Relocation produces a brief destination flash, without drawing a false
sweep of damaging territory.

## Verification and next development

Combat tests cover all four first picks, full-health Spring, fresh versus held
input, blocking/lifecycle rules, no lifetime/cooldown/tick reset, Briar anchoring,
independent slots, late impacts, ordinary new casts after recharge, copied fields,
Forge eligibility/value/readouts and detached visuals. HUD/touch tests cover
readiness, block reasons and shared recast priority.

The new browser smoke uses actual grand selection, keyboard/touch controls, the
real renderer and host/remote state on desktop and phone. It checks readiness,
the exact preview destination, relocation of the same field, unchanged remaining
lifetime and damage at the new location for all first picks and a Forge receiver.
Existing nature selection and both production defense/recovery cohorts run beside
it because the HUD is shared. Final results are recorded in the PR.

Land B is implemented pending owner playtesting; it is not declared balanced or
accepted. **Next development is the Abjurer / Draconic / Wild Magic identity
review**, followed by the remaining support identities, whole-system balance,
ordinary-upgrade/progression/graft tuning and the visual milestone. See
[development status](DEVELOPMENT_STATUS.md).
