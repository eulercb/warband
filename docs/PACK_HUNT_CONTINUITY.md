# Pack Tactics: following, reliable commands and hunt continuity

Historical delivery (#171), merged/tested. The
[held-basic and grouped-return follow-up](PACK_BASIC_RESTART.md) supersedes the
all-held-attacks restriction and independent follower return paths below.

The owner merged/tested #170. Delayed-damage premiums are accepted for now,
subject to future overall balance. The smaller flanking wolves were liked, with
requests that they follow between hunts and remain on a chosen quarry when the
owner moves away. One bounded Sol 6.1 high review checked the activation failure
and the scope of the next Land task.

## What was happening

Two separate 600u checks cancelled an active hunt or its pending lead bite when
the owner moved too far away. That contradicted using the hunt window to act
elsewhere. Flankers were created at attack scheduling and deleted without a
quarry, making both idle play and the wait for an existing wave recovery look
like the pack had disappeared.

A separate input issue consumed the fresh button edge while an ability was on
cooldown, or the hero was casting, stunned or rolling. With autofire held, the
later accepted cast had no fresh-command provenance. It could hit normally but
fail to designate a quarry.

## New behavior

- **Three persistent followers:** with Pack Tactics active, the lead and two
  smaller wolves follow in a formation behind the owner between hunts. They do
  not acquire targets on their own. At hunt expiry they travel back to the owner
  and resume following, rather than despawning or snapping back across the map.
- **600u for activation only:** the first positive direct hit of the commanded
  cast must damage a living hostile within 600u. Once chosen, that target keeps
  the full 6s hunt even if the owner moves beyond that distance. Both the lead
  and flankers remain committed. The 2.5s wave recovery and damage stay unchanged.
- **One press, one accepted cast:** a held press retains its command intent
  through ordinary input gates. The first accepted cast of that slot receives
  the token once; subsequent held autofire casts do not renew or redirect a hunt.
  Releasing before acceptance cancels the intent. A miss, immunity or out-of-range
  contact does not transfer the command into later held casts. Existing multi-shot
  projectiles of that first cast still share its one command token.

This does not add automatic ability execution when autofire is disabled. It
preserves command intent for the casts that the normal input system actually
accepts. Manual input still follows the game's normal readiness rules. A retarget
can also wait for the existing wave recovery; that wait is intentional, and the
persistent pack and quarry marker remain visible meanwhile.

Death, charm, expiry, owner downing, scene/end, class/passive changes and replacing
the command source still end a hunt. An out-of-range new command cannot cancel an
already active hunt. The older nonhunt Pack Bond / Alpha’s Fury commands retain
their range check. The prepared healing ward keeps its own 420u recipient limit;
distant pack damage does not silently extend ally protection.

Host snapshots now include idle helper poses. They remain detached visual data,
without pending input, attack orders or command tokens. Existing wrapped movement,
remote interpolation and smaller silhouettes are reused. The active passive and
native/Forge identity descriptions explain following and activation-only range.

## Verification

Actual World input tests cover cooldown, casting, stun and glide gates with
`autofire: true`; they positively verify further held casts/hits occur without
renewing the hunt. Further tests cover release, missed first casts, source
replacement, manual non-autofire behavior, idle following, out-of-range activation
and retarget rejection, full-duration distant attacks, pack return, invalidation,
replication and wrapped interpolation. Legacy companion tests remain unchanged.

The existing desktop/phone hunt smoke now asserts idle followers before input,
moves the owner beyond 600u during a real hunt, checks continued host/remote quarry
state and damage, then verifies expiry, no extra attacks and all three returning.
Existing companion and nature-selection smokes run alongside it. Final local
verification results are recorded in the PR; owner playtesting remains the next
acceptance step.

## Next development: Land B prototype

Land B implementation remains separate. Its review produced a concrete candidate:
**one deliberate transplant of an existing field**, without resetting duration,
tick timing, radius or payload. A fresh press of that field's source slot would
place it at a fixed aimed ground destination. Starting Entangle makes a solo,
full-health route available with every first Land skill.

That changes where territory sits rather than repeating Living Paths' movement
bonus. Solo play can move useful ground after a boss relocates; co-op must decide
whether to retain the party's existing position or cover a new one. It differs
from Wandering Briar's automatic enemy following and Totem's attack-origin relay.

This is a prototype candidate, not a shipped or final contract. The next bounded
step must resolve recast readiness, interaction with Wandering Briar, roots,
healing fields and clear placement feedback. Forge needs a priced, retained zone
component and honest nonfield behavior. Combining that engine/UI/Forge work with
this responsiveness fix would make testing less focused.

After Land: remaining caster/support reviews, system balance and progression/graft
tuning, then the visual milestone. See [development status](DEVELOPMENT_STATUS.md).
