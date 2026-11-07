# Battlemaster: positioning identity implementation plan

Status: the candidate plan below is now implemented in
[Battlemaster positioning](BATTLEMASTER_POSITIONING.md), after the focused
prototype and lifecycle review. Owner live acceptance is pending. The historical
proposal below records the reviewed design; the delivery note defines current
receiving-skill, portability and recovery rules.

## Why replace the current packages

Grand Tactician adds controlled-target damage to a sequence already rewarded by
Tactical Opening. Perfect Maneuver repeats Taunt absorption, wind-up slow and
other slow/ward sources. Both have numerical value but do not establish distinct
player decisions. Remove those identity packages when their replacements ship;
do not stack another set of riders onto them.

The proposed distinction is **move the opened enemy** versus **move yourself
after connecting**. Both use existing counter preparation, without new keys or
an additional class resource.

## A: Grand Tactician — direct the opened foe

- A successful Tactical Opening remembers that one target for the existing 4s
  counter window. The marker belongs to its owner.
- A positive melee counter against that target requests an 80u displacement along
  movement input captured at cast start. Stationary input pushes away from the
  caster. A counter against another target remains an ordinary counter.
- Solo sequence: Bash → Opening → approach/steer → connecting Cleave repositions
  the boss. With allies: choose which foe to move away from an ally or into
  existing coverage.
- A boss's committed windup/channel must finish before displacement executes.
  Preserve that action's target, aim and origin. Queue one visible request,
  execute before its next decision, and reject further requests while pending.
  A shared 6s target recovery bounds multiplayer displacement chains.
- Clear pending state on target death/disappearance, owner downing or class change.
  Respect roots/steadfast; failed movement does not become bonus damage. Use the
  authoritative shove and temporary-cover collision rules.

Preparation needs a target bracket and directional arrow. Pending displacement
needs a distinct dashed arrow; neither should look like already active movement.

## B: Perfect Maneuver — strike and leave

- A positive connecting melee counter permits a step up to 90u along movement
  input captured at cast start. Stationary input holds position.
- Resolve the full strike before moving the hero; one step per cast, with a 6s
  owner recovery. A multi-target cleave cannot step repeatedly.
- No invulnerability, extra attack, landing damage or automatic utility recast.
  Roots/stuns prevent the movement; ordinary counter damage still resolves.
- Use collision-safe hero glide, not raw forced impulse: the existing hero shove
  path does not establish equivalent obstacle handling.
- Solo sequence: guard/control → prepare counter → connect while steering out of
  danger. With allies: leave an overlap while keeping the enemy in its position.

Show existing counter readiness plus a short movement arrow while steering.

## Receiving kit and marginal value

Every first pick (Trip, Roar, Volley or Rally) retains the native Bash/basic or
guard/basic sequence, including at full health against a lone boss. No route
assumes adds, a second skill or an individual grand.

Keep Trip's controlled-damage grand, Volley's piercing/slow, Roar's frontal guard
and Rally's rescue behavior. They remain setup/support rather than copies of the
identity payoff. Thunderclap already pulls on Bash: the later counter displacement
must not replace that pull or add an opposing impulse to the same Bash hit.

## Provenance and portable skills

Counter consumption, movement direction and once-per-cast ownership need a shared
cast token. Only positive direct melee hits claim native spatial payoffs. Misses
and immunity preserve readiness, secondary damage cannot trigger it, and corpse
hits cannot move enemies. Delayed projectiles must retain their originating cast
and class rather than reading current input or another class's readiness.

Forge needs separately priced components with distance scaling/caps, delivery
fitting, recompose/refresh support and honest generated text. No unpriced flag
carried outside the synthesis budget is sufficient.

A proposed standalone portable variant uses a two-cast mark: a first positive
direct cast marks a foe for 4s; a later positive direct cast on that foe performs
the selected displacement or step, at most once per 6s. Volley blades from the
same cast cannot prepare and spend it. This altered trigger must be stated in
copy and tested through actual synthesis without the donor passive or native
counter generators. Confirm that this variant is coherent before implementation;
its rules are a proposal, not an already supported engine contract.

## Next bounded prototype and implementation gate

Start with the substantive unresolved risk: **deferred enemy movement when a
committed action ends**, especially charge landing and pending strikes. A focused
World prototype must demonstrate unchanged targeting/telegraph geometry until
execution, a single execution before the next decision, cancellation, recovery,
root/steadfast behavior, cover and torus boundaries. Do not silently ship an
immediate shove that moves an advertised attack footprint through allies.

Then verify personal glide after a complete multi-target strike, with no iframe,
landing payload or duplicate step. Exercise real held movement and stationary
input. Verify portable mark provenance before finalizing the component design.

After these contracts pass, implement the pair, readiness/queued visuals and
copy together. Further design review is needed only for a concrete unresolved
prototype finding; do not repeat the entire review by default. Owner approval is
not required for routine implementation within the ongoing authorization.

Validation must include every first pick, ordinary/Honed/grand combinations,
miss/immune/lethal/multitarget contacts, Volley cast tokens, two owners, roots,
steadfast, downing/class swaps/expiry, cover, torus seams, committed cone/beam/
charge actions, actual Forge synthesis, and desktop/phone presentation. Finish
TypeScript after all code/test edits. Owner live testing remains the acceptance
gate; functional checks do not prove equal balance or fun.

Implementation entry points: `combat/subclassPassives.ts` Tactical Opening,
`combat/martial.ts` counter consumption, `combat/combat.ts` positive-hit provenance,
`combat/abilities.ts` cast/strike completion and glide/shove helpers,
`world/world.ts` action completion, `content/charUpgrades.ts` native/Forge identity
adaptation, and `content/forge.ts` component lifecycle. Read the actual current
source before editing; these are responsibilities rather than fixed line numbers.
