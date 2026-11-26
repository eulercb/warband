# Warband development preferences

Read `docs/UPGRADE_REVIEW_GATE.md` before class/skill design and review. The owner
wants the agent to originate designs and handle routine implementation, with
short concrete checkpoints for changes to a class's core loop. Do not ask the
owner to direct every detail.

The owner's 2026-10-31 correction is a persistent design requirement: fantasy
themes must be explored through actual behavior and interactions, not repeatedly
translated into bonus damage, damage reduction or another differently named
slow. Fear can change approach/avoidance; illusion can change perceived targets;
charm can change allegiance. These are examples, not a requirement to add all
three. Simple numerical growth remains useful but is not proof of a new identity.
Apply this criterion across future class work, not only Whispers.
Information mechanics need actionable, salient in-arena cues and clearly distinct
pending/forecast/active states; a short-lived text label alone is insufficient.
Give disruptive control markers a dedicated readable arena lane; keep them clear
of name, HP and ordinary buff rows, avoid duplicate glyphs in that row, and check
crowded simultaneous statuses on desktop and phone.
Defensive escape movement must work without connecting a hit or approaching the
threat first. Prefer one clear activation; distinguish fresh presses from held
autofire, capture direction consistently, and attach charged-block rewards to the
actual charges rather than a separate short-lived, one-use window.
Owner-approved Battlemaster steering starts during active attacks and applies once
per enemy per cast. Do not restore the old one-foe or wait-until-action-finishes gate.
Keep body-bound attacks distinct from placed ground targets, with moving telegraphs
matching hit geometry and ongoing attack timers.
Owner feedback on Battle Rhapsody: preserve the ordinary two-verse party buffs
on cast. An optional pickup should reward the detour with an additional
capability and leave the caster’s existing positioning decision intact.
Check actual targeting semantics before promising a safe area or fixed aim. Do not add
complexity to every skill or discard functioning simple skills merely for novelty.

Owner feedback, 2026-11-08: skill readouts must describe the actual receiving
geometry and active resource mode. Do not list cone reach on a field, promise
projectile reach for Flow, or advertise melee generation while walking replaces
it. Check native, upgraded and Forge readouts together. Reuse the combat resource
calculation for prepared previews rather than duplicating its geometry rules.
Owner follow-up: preparers state preparation/duration without repeating receiver
payoffs. Do not advertise removal of absent windup or geometry/control bonuses
already met or capped; inspect native, upgraded and composed descriptions.
If pruning exposes a spender with no actual attack payoff, fix its resource
interaction rather than restoring an inactive claim. Check resolved prepared
versus unprepared payloads through Honed, grands and retained Forge components.

Owner feedback, 2026-11-13: converting immediate damage into delayed, returning
or poison portions carries a real delivery cost. Budget a modest explicit damage
premium for the extra exposure, evasion and interruption risk; inspect each case
rather than treating equal eventual totals as equal power. Readouts must show the
fraction/rate of each portion and any combined potential honestly. Distinguish
converted damage from already-additive poison, echoes and retorts; do not blanket
buff every damage-over-time effect. Apply this review to future conversions too.

Owner follow-up: Pack Tactics keeps three idle followers. Its 600u range gates
activation, not continuation of the chosen 6s hunt. Preserve new-press command intent through ordinary input gates. Held basics may
start another hunt once the pack is idle; they never retarget or extend an active
hunt, including when an older projectile arrives after a new hunt starts. Held
specials retain the fresh-press rule. Return flankers follow the lead wolf's
route rather than choosing independent owner images. Test actual
autofire repetition, not merely repeated held input with autofire disabled.

Owner follow-up: Grand Warding dispels airborne fields and fields at departure,
with one removal per Blink. Actual departure threats take priority over arrival.
Only the retained dispelling Blink can break silence, adding 2s recharge on an
actual successful break; no continuing immunity or free boss interruption.
Keep the host capability, keyboard HUD and touch silence exception consistent.

Owner feedback, 2026-11-14: mobility interactions must fit actual escape timing
and direction. Catching short-lived friendly shots with a teleport failed live
playtesting despite passing engine checks. Phase now prepares a departure origin
for a later spell. Remote origins must use a world reticle for both launch and
steering; forwarding the player's unit aim creates misleading parallel shots
after sideways escapes. A ready escape always takes priority over a cooldown
recast/cancel action. Test retreat-first use with real pointer/stick controls.

Owner feedback, 2026-11-14: an eligible reflection cast arms/refreshes one 4s
ward even at capped absorption; protection gains and passive rewards still require
a real barrier increase. Reflection starts a new bounded 900u return leg with
enough lifetime for that travel, rather than inheriting a nearly exhausted
incoming budget. Preserve captured damage and borrowed-hit provenance. Give
independent graphics paths explicit starts; an arc can otherwise connect to the
previous/default point and draw a spurious line toward the screen origin.

Owner feedback: Font rescues do not require or spend shared manual revive stock.
Sanctuary has one area-rescue attempt per owner/encounter; Blessed Bloom has its
own single-ally attempt. Capture the cohort when consuming the field, excluding
already rescued bodies and later entrants. Copies/Forge retain the original
rescue family across slots/classes and share its charge, not a fresh copy budget.
A valid Font channel completes free even with manual help or zero stock; manual
stock exhaustion must not skip other Font recoveries in that update.

Owner follow-up: Fortune belongs to the whole spending cast, including its fan,
pierces and direct explosion recipients, once per living foe. Preserve the shared
cast snapshot after readiness is consumed; never spend a later preparation on the
same cast or let it consume its own Loaded Fate marks. Supplemental damage stays
ineligible. New movement/steering behavior must preserve the original cast's
remaining lifetime, travel, hit history and ownership across native and Forge kits.

Owner feedback: randomized skill baselines invalidate fixed resulting totals in
ordinary upgrade prose. State the actual per-rank addition; let resolved native,
graft and Forge previews show the resulting count/damage/geometry and caps.
Check repeat ranks and different procedural seeds before claiming a fixed result.

Before presenting a redesign, describe what a player or enemy actually does
differently, compare it with existing mechanics, and show a useful solo-boss
route as well as co-op behavior. If bosses need limits, preserve the mechanic's
behavioral identity instead of silently substituting damage/mitigation. Test the
risks and telegraph rules; do not reject the idea solely because it requires new
engine work. Resolve routine technical choices autonomously; ask only about
material unresolved player-experience choices.

The owner authorizes one bounded GPT-6.2 Sol high review by default for substantial
design, planning or class-identity reviews; do not ask them to request it again.
Skip delegation for routine fixes, formatting and straightforward implementation.
Respect quota: use one reviewer at a time and no subdelegation. GPT-6.2 Sol
high is the default for difficult planning. A bounded GPT-6.2 Astra high review
is authorized when a difficult visual or animation problem benefits from a
second approach. Use both only when the comparison can inform a decision.
The fixed visual-review rotation is complete. Use Sol 6.2 High for substantial
implementation planning, mechanics-to-animation alignment, and regression review.
Use Astra 6.2 High for difficult silhouette, composition, or motion direction.
Give visual reviewers matched native-size captures when available. Compare both
on the same narrow case only when the choice remains consequential. Name the
reviewer and decision in the delivery notes.
Never select GPT-6 Sol (Sol 6). GPT-6.1 Terra medium/high can be considered
where appropriate. Present a short checkpoint only for unresolved material
gameplay choices.

Treat feedback followed by “go on” as direction to investigate the cause,
compare practical options, choose a scoped batch, implement it, and verify it.
The owner does not need to restate this workflow. Explain the choice and its
limits in the delivery. For visual deliveries, include a few actual in-game
captures when they help show the result. For a rendered design comparison, use
matched camera, viewport, inputs and effect age wherever practical.

When the review supports a coherent plan and remaining choices are routine, the
owner authorizes proceeding to implementation, validation and a reviewable result.

Run ESLint and the TypeScript check after the final code and test edits, including
coverage follow-ups. Passing Vitest does not establish lint or TypeScript validity.

After pushing a fix, stop once local verification is complete and only GitHub
checks remain. Do not poll/watch CI or hold the conversation open unless the
owner explicitly requests monitoring. The existing GitHub CI-completion action
reports whether to merge or return for help. Inspect failed checks when asked.
Browser smoke cohorts/selectors should use stable IDs and derive display labels
from the game registry; do not duplicate renamed skill/passive names in CI.
When changing a skill contract, search existing browser scripts for its text and
status expectations and run the affected old smoke alongside the new mechanic smoke.
Production effect smokes must control RAF/timer time: freeze combat during setup
and readback, and advance deliberately for real input and required incoming damage.
Do not let slow browser setup kill the tested hero or expire its effect. Preserve
real production input and game rules rather than patching HP or granting effects.
Transient HUD assertions must start observing before sending cast input and retain
positive rendered evidence; a cooldown or silenced button alone does not prove
an effect. Keep real input, bounded amounts and actual effect assertions. Run both
production defense/recovery cohorts when changing their shared observer or roster;
shared support/HUD changes require reviewing these cohorts even if the new feature
belongs to another class. The fast defensive-smoke contracts check registry labels,
authored wording and short-lived effect observation before browser jobs. They run
automatically before `npm test` and `npm run test:coverage`; when invoking Vitest
directly, run `npm run test:smoke-contracts` first.
Dev-browser fixtures import React through the shared Vite-served entry; never
hardcode generated dependency-cache URLs. Verify startup with an empty cache,
not only a long-running development server. Initialize the actual renderer after
UI/network imports; a React-only mount does not exercise lazy Pixi chunks. Keep
registry readers on private caches and verify dependency versions stay stable.

For balance batches, check that the controller actually exercises the mechanic,
measure the relevant events alongside outcomes, and rerun matched cases after a
confirmed fix. Apply clear fixes without a separate checkpoint. Leave weak or
policy-dependent findings in the delivery notes with a concrete discriminating
test. Bundle adjacent, verifiable work into larger batches and size it so the
implementation and local validation can finish within the available session.

At each delivery, name the next development step after live playtesting and the
following roadmap stages. Record accepted player feedback and distinguish review
completed, mechanics implemented and identities accepted; do not count unresolved
identity findings as finished merely because tests pass.
Keep `docs/DEVELOPMENT_STATUS.md` current as the concise entry point to that sequence.

Keep chat and PR summaries brief, and include direct GitHub links to the fuller
delivery/review notes and development plan when those documents exist. Use the
same verified URLs in both places, not plain repository paths. Prefer immutable
commit permalinks for delivery notes and unmerged plans so links survive branch
deletion; a living roadmap may link to main once merged. Carry this documentation
handoff forward without asking the owner to repeat the preference.

For each visual production batch, apply the pilot acceptance criteria in
`docs/VISUAL_REVAMP.md`. Check the complete pose, attack delivery, hit geometry
and readable recovery, including linked grands with a changed shape or payoff.
Use authored effects to show friendly hit reach without generic outline strokes.
Check actual casts at desktop and phone sizes. Separate simultaneous motions as
needed and record any deliberate combat-timing change.

For the character visual revamp, establish a class's silhouette, hand and prop
anchors, locomotion, turn and downed poses before producing its full skill
animation set. Verify a real basic and linked grand with the production rig.
At each actual impact, align authoritative gameplay delivery, the contact pose,
and the visible reach or hit effect. Use a separate clearly identifiable
telegraph when advance notice is part of the mechanic.

Treat damage before the visible swing or hit as a delivery defect. Check three
moments on every authored attack: preparation without contact, the first
damage tick with its matching pose and effect, and recovery. For changed
timings, use normal input and record health and the visual cue on both sides
of the release. Test the resolved grand and retained Forge delivery when they
change reach, timing or riders. Flag any deliberate exception in playtest notes.

When reporting a named mechanic for playtesting, identify the class, subclass
when applicable, and whether it is a basic, special, passive, skill grand or
identity grand. State how to equip or trigger it when that is easy to miss.

For changes meant to improve visual readability, compare rest, anticipation,
contact and recovery at normal gameplay zoom before delivery. Include phone
and desktop, crowded labels, and at least a side and a near-vertical aim when
the effect rotates. Check the silhouette and contrast in the rendered frame,
not only internal wrist displacement, event receipt or a zoomed crop. Show
matched in-game frames or a brief clip when motion is the subject of feedback.

Before closing a class visual pass, review the basic and each basic grand,
starting specials, every subclass skill and its grand, relevant passives and
identity grands, and ordinary upgrades that change combat behavior. Check the
resolved payload and whether its effect actually applied. Carry open rows in
the visual roadmap through the next class review and before encounter work.
