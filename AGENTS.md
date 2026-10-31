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
Apply this criterion across future class work, not only Whispers. Do not add
complexity to every skill or discard functioning simple skills merely for novelty.

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

After pushing a fix, stop once local verification is complete and only GitHub
checks remain. Do not poll/watch CI or hold the conversation open unless the
owner explicitly requests monitoring. The existing GitHub CI-completion action
reports whether to merge or return for help. Inspect failed checks when asked.
Browser smoke cohorts/selectors should use stable IDs and derive display labels
from the game registry; do not duplicate renamed skill/passive names in CI.
