# Open Hand — travelling Palm and delivery-aware descriptions

Baseline: the owner merged/tested Totem's Ancestral Relay (#163). Its gameplay is
accepted; this delivery also addresses the reported Earth Totem tooltip mismatch.
One bounded Sol 6.1 high review and one narrow travel-speed follow-up supported the
Open Hand plan. Owner live acceptance of the new Palm remains open.

## Identity decision

**Flowing Water (B)** replaces unrelated healing, leech, resistance and cleansing
riders with a body-carried Quivering Palm. Direction is captured when pressed:
movement input wins, otherwise aim. After the ordinary windup, the real body
travels up to 180u at 450u/s (0.4s); the burst footprint moves with it and contacts
each foe once across the entire path. Flow supplies its existing instant launch
and +35u radius, not a shorter travel commitment. Focus affects launch windup;
Haste affects ordinary recharge. Neither speeds the sweep.

The player can hit a nearby boss while retreating, approach during a safe opening,
or sweep across a group's flank. The body takes the risk of that chosen lane.
There is no hit requirement to move, new immunity, extra landing explosion,
remote origin, anchor, secondary timer or repress action. Existing body collision
and solid-cover collision apply. Swept contacts use the entire actual travelled
segment so a small copied footprint cannot skip foes between ticks.

This differs from Knight's utility footwork: the attack occupies the travelling
body rather than resolving a utility at departure. Knight steering moves enemies;
Reprise returns the body; Totem attacks from a stationary remote origin; Whispers
changes perception. The opportunity here is attack geometry during committed
movement. The review rejected adding another generic utility step or a hold-only
Palm that offered no different decision.

**Perfect Harmony (A)** remains a streamlined support choice: existing Flow
preparation lasts +2s, and native direct specials gain +25% damage against
controlled foes. The extra basic extension rate is removed because basic hits
already share the same 1s extension cap. This supports the familiar Step → control
→ stationary Palm route; it is numerical support, not presented as a new action
loop. Forge A gives direct specials +25% damage and extends existing preparation,
with explicit Forge wording so it does not depend on a missing control/setup skill.

## Receiving kit and first picks

| Receiver/layer                                    | Role with the identities                                                                                                                                   |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native Step of the Wind                           | Existing movement, heal and Flow preparation. B adds no extra heal or resistance; ordinary upgrades retain their role.                                     |
| Stunning Strike and its grand                     | Contact control and follow-through remain available for A. Spending Flow here is a choice to reserve Palm for its ordinary windup.                         |
| Quivering Palm, ordinary upgrades and Death Touch | Existing damage, radius, stun and pull attach to one contact per foe. Death Touch pulls toward the actual first-contact centre, not the final destination. |
| Flurry Barrage, Honed and Parting Barrage         | A useful fast Flow strike; its grand's push stays useful. No forced complexity on this first pick.                                                         |
| Wave Palm, Honed and Returning Tide               | Aimed push or its grand's pull reversal remains independent of Palm travel.                                                                                |
| Wind Step, Honed and Sheltered Crossing           | Existing actual ally-crossing support, Flow preparation and the individual barrier remain; B no longer duplicates a resistance rider here.                 |
| Wholeness of Body, Honed and Whole in Spirit      | Full-health-capable Flow setup, recovery and its individual barrier remain; B adds no unrelated cleanse.                                                   |
| Flowguard passive                                 | A single frontal block when this cast spends Flow. Travel does not rerun finisher/passive hooks.                                                           |

Every first Open Hand pick retains native Step and Palm against a lone boss,
without adds, a second subclass skill, injury or a rare grand. Example B route:
Step away/sideways to prepare Flow, then choose a Palm lane that strikes while
retreating or passing the flank. With allies, Wind Step retains its crossing
support and the Palm can clear multiple distinct foes in a corridor.

## Copy, interruption and presentation

The `palmSweep` component is priced, scaled, capped at 30–180u, described and
refreshed through normal Forge paths. It fits non-basic burst delivery. A copied
burst works without Flow or the donor passive and keeps its own windup/recharge.
Monk synthesis supplies a compatible starting burst through normal constrained
synthesis/pricing if the generated kit lacks one. Sweep, targeted Infernal Claim
and Ancestral Relay specify incompatible origins and cannot combine.

The cast reserves direction, exact equipped source, owning class/epoch and shared
hit bookkeeping. Root at launch permits an ordinary local Palm and shows
“Rooted · local Palm”. Root, stun, shove, downing, class change, leaving combat or
losing the source stop an active sweep; consumed Flow and recharge stay consumed.
Immune contacts count as that foe's contact, preventing repeated attempts during
one sweep. Original Palm targeting remains: this does not add a new ground-only
or line-of-sight rule. Cover stops the body; the original burst radius still tests
foes around its actual centre.

Paired arena arcs follow the body throughout travel. The owner sees its direction
and remaining path; the controls distinguish “Moving Palm”, “Sweeping” and rooted
local fallback. There is no new resource meter. The ready preview is hidden while
cooling, and silence retains UI priority. Remote snapshots carry only public
footprint state, not ability references or hit bookkeeping. Prepared footprints
reuse the combat finisher calculation on isolated buff state, including combined
Flow/Momentum and arena caps, without consuming live preparation.

## Description audit

The reported Earth Totem line listed cone reach alongside burst radius on every
Momentum spender. Native and Forge readouts now name the actual receiving shape:
melee reach, burst radius or field radius and tick damage. Flow preparation now
points to the receiver's listed Flow effect instead of promising extra reach to
projectiles. Dashes, blinks and self-centering use their actual setup wording.

A second contradiction affected walking generation: a Hunt could say walking
replaced melee while also advertising melee-hit generation. The formatter now
shows only the active mode, and describes a later melee window if Rage outlasts
the Hunt. Direct arrows omit unrelated blast/zone caveats; a blast carrying a
piercing field explicitly ends at its first impact rather than promising extra
pierced targets. Related grands no longer repeat “Flow still…”/“Momentum still…”
reminders. These are text corrections; resource amounts and targeting rules are
unchanged by the audit.

Regression coverage checks actual native, upgraded and composed receiver text,
walking replacement and later melee generation, and the existing description
editorial gate. The shared helpers make subsequent skills use the same rules.

## Acceptance and sequence

Local verification is recorded in the PR: World casts with every first pick,
prepared/unprepared timing, captured direction, per-foe contact, copied small
footprints, torus seams, interruption, cover, rooted fallback, Forge contracts,
and real renderer/input/remote snapshots at desktop and 320px. Existing Totem and
martial selection scenarios are checked alongside the new sweep. Passing these
checks does not establish equal identity balance or owner enjoyment.

Owner test: compare A's stationary follow-through with B's visible moving Palm;
try retreat and lateral lanes, cover, roots, Flow spent on another special, and
Death Touch's pull during travel. Judge readability and whether the expanded
coverage is worth committing the body.

After acceptance: Shadow Monk, then remaining nature/caster/support purpose
reviews, system tuning and the separate visual revamp. See
[development status](DEVELOPMENT_STATUS.md).

Verification: 4,769 tests across 181 files passed with 98.02% branch coverage at the
unchanged 98% gate. Lint, formatting, production build, final TypeScript and both
catalogue/recharge audits passed. A fresh-cache Node 22.23.4 browser run verified
native/Forge Palm at 1280px and 320px; existing martial selection, Totem relay,
18 production martial casts and both Wholeness recovery scenarios also passed.
GitHub's completion action supplies the external check result after push.
