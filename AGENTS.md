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

Before presenting a redesign, describe what a player or enemy actually does
differently, compare it with existing mechanics, and show a useful solo-boss
route as well as co-op behavior. If bosses need limits, preserve the mechanic's
behavioral identity instead of silently substituting damage/mitigation. Test the
risks and telegraph rules; do not reject the idea solely because it requires new
engine work. Resolve routine technical choices autonomously; ask only about
material unresolved player-experience choices.

The owner authorizes one bounded GPT-6.1 Sol high review by default for substantial
design, planning or class-identity reviews; do not ask them to request it again.
Skip delegation for routine fixes, formatting and straightforward implementation.
Respect quota: use one reviewer at a time, no subdelegation or model-comparison
fan-out; reuse a reviewer only for a concrete unresolved issue. The owner prefers
GPT-6.1 Sol high for difficult planning; GPT-6.1 Terra medium/high can be considered
where appropriate. Never select GPT-6 Sol (Sol 6); avoid GPT-6 Astra because of
cost. Present a short checkpoint only for unresolved material gameplay choices.
When the review supports a coherent plan and remaining choices are routine, the
owner authorizes proceeding to implementation, validation and a reviewable result.

Run the final TypeScript check after all code and test edits, including lint
fixes. Passing Vitest or ESLint does not establish TypeScript validity.

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
