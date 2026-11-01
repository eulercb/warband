# Fiend: Infernal Aperture

Implemented playable prototype, awaiting owner live testing. Shadow Reprise
(#149) is merged and accepted: the owner liked the addition and reports Rogue
working well for now. Further Rogue redesign is deferred unless new evidence
warrants it. Fiend's review is implemented here; Great Old One remains open.

## The decision this adds

Fiend A keeps stable ID `wa_fiend_g_a` and becomes **Infernal Aperture**. Aim
Dark One's Blessing to fix a directed entrance 80u ahead and an exit 320u ahead
for 6s. Move to a useful firing position and aim your projectiles through the
entrance. They emerge along the original setup aim, retaining their authored
fan offsets. Shots aimed elsewhere keep their normal trajectory.

A fresh subsequent press of the owning skill fires one 22-damage ember from
your actual position toward your current aim. It can miss the entrance. This
same action exists in native and copied kits, so the aperture never depends on
a particular ranged partner or donor passive. It consumes neither a second
cooldown nor a second Blessing cast. The original cooldown keeps running;
repressing grants no fresh buffs, immunity, healing or setup triggers.

Before: repeatedly hit a personally cursed foe until an automatic third-hit
burst pays out. After: choose an exit lane, reposition, then deliberately feed
shots through the entrance—or fire normally when the fixed lane is wrong. The
conduit changes firing geometry and bypasses the space between its endpoints;
it does not search for a target, aim for the player or relocate the player.

The automatic 25-damage cadence and its forged neutral curse-seeding fallback
are removed. A's unrelated Hurl wind-up slow and Resilience +12 barrier are also
removed rather than stacked onto this new core. Blessing's movement bonus stays
because repositioning serves the firing lane. Soul Ember, personal curse rules,
Infernal Claim and Fiend's four skills retain their roles. Infernal Pact remains
a supporting sustain route; this delivery does not claim a new behavioral
mechanic for B or prove equal balance between the identities.

One bounded GPT-6.1 Sol high planning review settled the contract. A single
narrow correctness follow-up found coarse torus-sweep and exact exit-budget
collision bugs, both fixed with concrete regressions. No parallel design fan-out
or costly model comparison was used.

## Layers and actual first picks

| Layer            | Aperture route                                                                                                                                                                      | Pact route                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Starting kit     | Blessing fixes the lane; Eldritch Blast is always an available projectile. Hex supplies personal curses independently.                                                              | Blessing grants protection; ordinary blasts and Rebuke sustain through their direct lifesteal.                             |
| Ordinary/Honed   | Damage, coverage and recharge growth improve the existing skill. A fixed entrance/exit still adds geometry after those upgrades are owned.                                          | Protection/siphon growth supports a normal firing position; duration and shared shield caps remain real saturation limits. |
| Individual grand | Hurl's impact payload, Pit's ground territory, Claim's aimed cursed detonation and Resilience's protection keep their separate deliveries. Only projectile deliveries can traverse. | The same skill grands support sustain without installing a conduit.                                                        |
| Identity choice  | Commit to a lane, move and aim through its entrance; abandon the setup when the boss or hazards make it poor.                                                                       | Preserve ordinary firing freedom while budgeting protection and personal-curse sustain.                                    |

| Native first pick | Full-health, lone-boss route                                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Hurl Flame        | Hex → aim Blessing → reposition → aimed Hurl or basic through entrance. Hurl keeps its real wind-up, leech and any owned impact grand. |
| Fire Pit          | Pit or aerial-compatible Hex marks the boss → establish conduit → routed base blasts. Pit remains stationary ground territory.         |
| Infernal Claim    | Hex → aimed Claim for immediate remote payoff; alternatively set a lane for routed blasts. Claim does not traverse the conduit.        |
| Dark Resilience   | Use its barrier at full health → establish lane → ranged follow-through. Its marked siphon remains personal and bounded.               |

No route assumes adds, injury, a kill, a second subclass pick or an individual
grand. The native basic and the one supplied ember make the mechanic available
with every first pick. Against a solo boss the aim lane is useful until the boss
moves away; no boss immunity or substituted damage rule is required. In co-op,
only the owner's shots route. Allied and enemy projectiles, melee, ground zones,
Claim and supplemental damage do not traverse. Existing boss telegraphs remain
committed under their ordinary rules.

## Geometry, travel and collisions

- Both mouths are fixed at successful skill resolution, after any movement
  delivery. Their direction is the setup aim. If cover intersects either mouth,
  aperture placement fails with a brief cast label; the ordinary skill effects
  and cooldown still resolve. Endpoints are not silently moved to a free spot.
- An entrance is a directed segment perpendicular to setup aim. A projectile
  center must cross forward, with positive forward velocity and lateral clearance
  of `24u − hitRadius`. Starting on the mouth is not an entry. The setup cast's
  own shared token cannot route, including delayed descendants.
- Each shot traverses at most once. Incoming lateral offset and authored fan
  offset survive; the player's later aim cannot rotate an admitted shot. A fan
  does not collapse into one output line. The original object, ID, damage,
  speed, impact payload, piercing history and shared hit tokens are preserved.
- The skipped gap costs the shot's original range. Transit takes `gap / speed`
  of actual simulation time while its normal lifetime runs. It is not immediate
  remote damage. In-transit shots are omitted from projectile snapshots.
- A swept nearest-event path checks bodies and cover before entrance, then
  checks the frozen exit and outgoing flight. The imaginary line between mouths
  is deliberately not an ordinary collision path. Cover wins coincident contact.
  Piercing can hit before entry and continue through with its existing budget.
- Range/lifetime can end before entry, during transit or after exit. Contact
  exactly at the final exit budget still resolves before expiry, including
  overlapping piercing recipients. Coarse sweeps inspect neighboring torus images
  so forward bodies/cover are not missed beyond half a tile.
- Gate expiry or replacement stops new entries, while admitted transit finishes
  at its frozen exit. Owner downing/death, changing class, leaving combat, losing
  or replacing the exact owning contract cancels pending transit. Already emerged
  shots follow ordinary projectile lifecycle.

This swept movement is restricted to an aperture owner's candidate shots and
already routed projectiles. Unrelated legacy projectile movement is not broadly
rewritten. Routing itself makes no damage call, crit roll or hit reward. Ordinary
positive direct-hit handling remains authoritative for immunity, lethal hits,
Soul Ember, leech, precision, exposure and other once-per-cast effects.

## Controls, presentation and ownership

Release and freshly press the owning button to emit its one ember. Holding,
autofire, the setup press and a same-tick setup chord cannot emit it. A miss still
spends it. Stun, silence, casting, glide and forced slides block emission without
spending it; the window keeps expiring. Root permits this stationary shot.

Desktop and phone show **Ember**, conduit time and blocking reason while retaining
the original cooldown number. After emission the ordinary skill label returns.
The renderer draws two directed mouths and a thin dashed link, rather than a
filled damage zone. The public view contains endpoint geometry, remaining time,
owning slot and action availability; source objects and shared tokens stay private.
Shared travel/input rules live in the expandable Combat & upgrade rules reference.

A Forge slot can legally carry aperture and Shadow Reprise together. **An earned
Return owns the press; otherwise an unused Ember owns it; otherwise ordinary
reprise/cooldown handling applies.** One press performs one action. The supplied
ember has a distinct token and can earn portable reprise by a later positive hit.
HUD and touch action labels use the same priority.

## Forge, copies and recovery

`infernalAperture` is a real effect component, with fitting, decomposition,
recomposition, value, scaling, caps, upgrade refresh and generated descriptions.
Every nonbasic delivery can carry it; synthesized basics cannot. It carries its
own supplied projectile, so even a copied kit with no other ranged skill remains
playable without the Fiend passive. Actual synthesis and active-Forge identity
installation are tested, not only object roundtrips.

Initial value is `30 × duration / 6 + emberDamage`. Forge scales duration and
ember damage with its budget, capped to 1–6s and 1–22 damage. Geometry stays fixed
within its capped reach/width and normal arena limits. The resulting card states
its entrance/exit distances, duration and ember damage. This utility valuation is
an initial estimate, not measured balance evidence. Duration contributes to
persistent-effect recovery, including composed skills; Haste cannot erase that
floor.

The native identity attaches to its own starting Blessing in the skill registry.
A Shadowstep graft occupying a3 does not receive a free aperture; reclaim restores
the native contract. A genuinely copied component retains the action without
needing the donor's identity. An orphaned flat field cannot authorize it when
components lack the effect.

## Verification and next work

Focused World/input tests cover setup, all four first picks, finite/equivalent
travel timing, miss/backward/inside rejection, cover/body ordering, torus seams,
exact endpoint budgets, piercing/impact provenance, actual native/composed fans,
blocked controls, expiry, source ownership and Forge/reprise combinations.
A routed piercing cast is checked against actual once-per-cast precision reward
handling. UI tests retain cooldowns and select Return/Ember consistently. The
Chromium smoke drives real held/released input and a bent shot after repositioning,
checks hidden transit and an actual exit hit, and renders desktop/320px controls.
The existing grand-selection smoke uses stable IDs and registry-derived labels.

Owner playtesting should judge lane setup, entrance aiming, exit readability,
and whether abandoning/reusing a fixed lane creates worthwhile decisions.
Automated tests cannot establish those judgments or comparative power.

Local verification cleared the full regression suite and all coverage gates
(98.01% branches), production build, typecheck, lint, formatting and the inventory/
recharge audits. Both the new aperture smoke and existing Rogue/Warlock grand
selection cohort pass at desktop and 320px. GitHub CI remains a separate gate;
the existing completion action reports its outcome without agent polling.

After this live test, adjust aperture ergonomics if needed, then proceed to
**Great Old One's duplicate suppression and native Surge role**. Remaining
martial, nature, caster and support identity reviews follow, then measured
whole-system/reward/graft tuning. The separate visual milestone remains
silhouettes, bosses, arenas and distinct ability shapes/motion/impact, prototyped
on desktop and phone before broader production. See [development status](DEVELOPMENT_STATUS.md).
