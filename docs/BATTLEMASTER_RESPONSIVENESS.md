# Battlemaster: dependable steering and defensive footwork

Status: follow-up to merged/tested PR160. The owner liked controlled enemy movement
but found both activations confusing; the counter-based pair is **not accepted**.
This delivery replaces its activation rules. Owner playtesting remains the next gate.

## What changes in play

| Route            | Activation                                                                     | Result and useful decision                                                                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Grand Tactician  | Hit with a direct special strike: Shield Bash, Trip Attack or Precision Volley | Steer one living eligible enemy 80u in the movement direction held when pressing the skill. Standing still pushes away. Choose a fighting lane or clear an exit without preparing a particular counter.              |
| Perfect Maneuver | Newly press Taunt, Shield Wall, Menacing Roar or Rally while moving            | Cast the defense at your departure position, then step up to 180u in that direction. No target, hit, counter or missing health required. Escape an unreachable boss, move toward an ally or reposition to intercept. |

Basic attacks activate neither identity. Standing still casts defense normally
without spending movement recovery. Held autofire can repeat ordinary casts but
another step requires a new press. Each skill keeps its normal recharge. Personal
movement has a shared six-second recovery, started at travel launch, not request.
The step grants no immunity, stops at solid cover, and can be interrupted by
incoming knockback, root, stun, downing or changing class. Root leaves the defensive
cast usable while preventing its step. Silence prevents specials as usual.

Enemy movement preserves committed attacks, including charge landing and channel
geometry. A dashed arrow marks a queued request; the foe moves before making its
next decision. It has six seconds of shared recovery across players. Rooted,
Steadfast, charmed, dead or already moving/recovering recipients cannot receive
another request; they do not consume the cast's chance to find an eligible victim.
A cast moves at most one enemy, even with multiple projectiles or targets.
Existing forced movement finishes first; one second of competing pushes outside
an attack cancels the queue into shared recovery. Cover can shorten the movement.
Changing class invalidates old projectiles even after swapping back.

The HUD names each activation and shows queued movement or recovery. Silence,
stun and rooted footwork have explicit text; the dedicated silence notice takes
priority on phones. Direction is captured when the button is pressed, including
cast-time skills. The foe's queued arrow shows the captured direction.

## Why the previous version felt unreliable

- Shield Wall had two frontal charges but only one independent, consumed guard
  window. After spending its first counter, a second successful block could give
  none. Upgraded charges could also outlive that guard window.
- Enemy steering required the exact counter object created by Tactical Opening
  and the same marked target. Ordinary block counters did not qualify. Opening
  could be created after the movement hook, imposing another unexpected hit.
- Personal movement required both a connecting melee counter and captured movement
  input. Expiring/replaced counters, missed hits and stationary input silently
  invalidated attempts; a melee escape consequently needed contact first.

Taunt and Shield Wall now put counter capability on each frontal block charge.
Every successful charged block readies or refreshes one nonstacking +30% melee
counter, throughout its actual charge lifetime. These skills no longer carry a
separate uncharged guard window. Back/side damage does not count as a frontal
block. Overlapping guards preserve the strongest live counter capability, and a
weaker readiness source cannot downgrade a stronger current counter.
Tactical Opening remains a useful ordinary counter source, independently of
identity movement.

## Receiving skills and review layers

| Skill              | Existing behavior/layers                                            | Identity change                                                           |
| ------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Cleave             | Basic melee, consumes ordinary counters                             | No identity movement                                                      |
| Taunt              | Aggro and frontal charge; its own upgrade/grand defenses            | B adds deliberate departure movement, not additional absorption           |
| Shield Wall        | Two frontal charges; Impenetrable adds charges/duration             | B moves while its defense protects; each actual block can ready a counter |
| Shield Bash / Trip | Melee damage/control; existing ordinary/Honed/grand layers          | A adds direction choice immediately on a positive direct hit              |
| Precision Volley   | Ranged direct projectiles; existing pierce/slow layers              | A offers ranged steering, one eligible foe per entire cast                |
| Roar / Rally       | Control/guard or party rescue; existing ordinary/Honed/grand layers | B offers another defensive step without requiring effective healing       |

Every first pick can use A through starting Bash and B through starting Taunt
or Shield Wall against a lone boss. Co-op uses the same rules: shared enemy
recovery prevents relocation chains; utility payloads occur before personal travel.
This does not add a new key, a second-press window, an enemy mark or another meter.
Those alternatives retain the confusing preparation burden and were rejected.

Native, copied and Forge behavior now share the same activation contract. Push
fits direct-strike delivery; step fits defensive utility delivery. Both are priced,
scaled, capped, deduplicated and refreshed as real components. Forge Knight kits
receive a compatible direct special and utility special through normal synthesis
if a role is missing; the basic is never used as a hidden fallback. This also
keeps these identities playable after picking any first subclass skill.

## Verification and next work

Regression coverage exercises real World inputs, all first picks, fresh/held
buttons, distant bosses/full health, cast-time direction, zero/lethal/ineligible
hits, shared recovery and ownership, committed cones/channels/charge landing,
competing shoves, cover/torus seams, class swaps, counter charge reuse and overlap,
copying and actual Forge synthesis. Desktop/phone smoke uses actual skill buttons,
remote snapshots and HUD/arena presentation. Final gate results are recorded in
the PR; local checks cannot establish fun or equal balance.

Local results: **4,674 tests in 178 files passed**, with **98.05% branch coverage**
(the 98% floor is unchanged). All six desktop/phone movement smoke cohorts and
all twelve martial grand/Haste presentation cohorts passed. Screenshots were
inspected at 320px, including the queued foe arrow, defensive-footwork prompt and
silence-priority layout.

After owner testing accepts or adjusts these controls, the next development task
is Totem Warrior's unresolved B purpose and scattered riders. Open Hand and Shadow
follow, then remaining nature, caster and support identities, whole-system reward/
upgrade/graft tuning and the dedicated visual revamp. See
[development status](DEVELOPMENT_STATUS.md).

## PR161 CI follow-up

The martial production smoke still asserted Shield Wall's removed `guard 4s`
window and `Guard` badge. It now checks per-block counter wording and accepts
frontal-charge readiness or a counter already produced by an incoming hit.
The smoke's hero/skill labels now resolve from the registry by class slot or
stable subclass skill ID; behavioral assertions remain explicit. Other CI jobs,
including full coverage/typecheck/build, had passed on the original PR head.
Local verification passed all 18 desktop/touch production martial cohorts and
all six remaining scripts from that CI job: projected guard, Battlemaster movement,
absorption, auras, martial grands and nature grands. Registry contract tests,
changed-script lint/format and final TypeScript also passed. GitHub's completion
action reports the new head's merge/help outcome without continued polling here.

## CI startup follow-up

The next CI run passed all 18 production martial cohorts, then failed while
loading React in the projected-shield fixture. That fixture and eight others
imported generated `node_modules/.vite` cache URLs directly. Local runs against
an already warmed dev server did not establish that those files existed on a
fresh CI server.

The fixtures now use one browser entry with ordinary React package imports;
Vite resolves and versions those dependencies. React, React DOM client and the
JSX runtime are prebundled together. No game mechanics changed. A fast regression
check mounts hooks plus the actual HUD with its own empty cache and rejects
hardcoded dependency-cache imports across smoke scripts. The martial CI job runs
it before the longer production scenarios. The startup regression and selected
shield, Battlemaster and loadout scenarios are verified against a separate fresh
server/cache, rather than relying on the earlier warm-server evidence.
