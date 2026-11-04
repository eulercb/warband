# Elder Mind: visible, actionable foresight

PR153 merged, but **failed owner live acceptance**. The owner saw no useful
forecast and found the curse prerequisite awkward for close-range skills.
Whispered Doom remains accepted. This follow-up repairs Elder Mind before the
martial review; it is implemented for another live test, not yet accepted.

## What went wrong

The forecast did survive production host snapshots and client interpolation.
The only presentation was small boss-bar/nameplate text, normally available
for roughly 1.6s. Starting the attack deleted it. Tentacle's wind-up delay
therefore extended a phase in which the forecast was already gone. The earlier
browser check proved text existed in a staged view, not that the information
was actionable during a real combat sequence.

The personal-curse requirement compounded this: ranged territory had to overlap
a later direct hit. That was unnecessary work for an information mechanic and
made close first picks awkward. The starting basic was technically a carrier,
but that fact did not make the overall setup comfortable or visible.

## New player sequence

**Connect any positive direct hit → see a violet eye and forecast card → use
the arena outline to reposition → the ordinary attack starts along its disclosed
aim → the Revealed cue stays through its wind-up/channel.**

No curse, injury, adds, second subclass skill or grand is required. Starting
basics, Rebuke, Mind Blast and Tentacle can all read. Ward acts on the information
by relocating; Whispers supplies optional territory instead of a compulsory
extra curse opportunity. Zones and supplemental/borrowed damage cannot read.

The card distinguishes **READING NEXT MOVE** (current attack must finish),
**FORESEEN** (next move reserved) and **REVEALED** (that attack has begun).
It includes an action instruction. Violet dashed outlines have no timing fill;
ordinary orange/red telegraphs retain their timing role. A violet eye sits
above the boss, outside its body, and remains during revealed attacks.

## Information now commits something useful

Unlike PR153, the reserved next attack now stores its actual target/aim plan.
Random target selection happens once. Moving afterward does not silently re-aim
an announced cone, ground strike, charge or projectile volley. Normal attacks
without Forethought retain their existing targeting rules. No extra delay,
stun, damage bonus or mitigation package is added.

| Move             | What the player sees and can do                                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cone             | Violet fan boundary in the committed direction; step out. Its origin follows the moving boss.                                                                                               |
| Ground strike    | Fixed impact circle; leave that point.                                                                                                                                                      |
| Charge           | Current boss-to-fixed-destination corridor, clipped by actual tall cover and temporary bulwarks. Width includes the resolver's boss-body allowance.                                         |
| Nearby burst     | Ring follows the boss; move outside it rather than assume the ring is fixed on the ground.                                                                                                  |
| Projectiles      | Dashed committed shot rays/fan; step between or away from their paths. Revealed volleys actually use the reserved angle instead of re-aiming at release. Objects can still intercept shots. |
| Beam             | Marked victim, tracking tether and range ring; that victim must leave reach. The beam is **not** a fixed lane everyone can sidestep.                                                        |
| Hazard pools     | Explicit warning that pools form near players at release; no fabricated exact pool circles.                                                                                                 |
| Summon/self buff | Eye plus intention announcement; no false damage footprint.                                                                                                                                 |

The beam/hazard distinctions come from the actual resolver: beams damage their
victim within range, while pools choose player anchors and random offsets at
release. Copying a normal line outline would falsely promise a safe sidestep.

All preview geometry comes from the host's effective, affix-adjusted ability.
The current attack and next read are separate: hits during a revealed attack can
prepare the following move without erasing the current Revealed cue. Instant
attacks consume their preview when released; their projectiles/hazards then
remain the actual threat.

## Targeting, co-op and compatibility

One boss has one shared next plan. Further readers refresh its 8s read lifetime
without rerolling it. The whole party sees the forecast. Different bosses can
have independent plans. Forecasts preserve ordinary cooldown/HP legality and
fairness deferral. They add no attack timer or recovery extension.

Taunt or a changed illusion invalidates an obsolete pending aim rather than
silently redirecting a promised shape. A fresh hit can read the new situation.
A lost victim, dead/downed reader, class change, room change or expiry also clears
pending reads. Existing quarry is inspected when planning and consumed only
when the real attack starts. Once an attack has started, its Revealed cue belongs
to the committed attack and lasts through that wind-up/channel, even if the reader
can no longer maintain a new read. Adds have no next boss-action forecast.

Native and portable/Forge reads now share the curse-free contract. The existing
priced component, direct-delivery fitting, no-random-basic synthesis rule and
explicit identity basic fallback remain. Legacy conditional components still
copy into the standalone variant. Native graft replacements receive no free
rider; reclaim restores the native read. Simple Honed effects and individual
grands remain useful; no new rider is attached to every utility.

## Validation and next work

Local gates pass: 4,472 tests in 175 files; branch coverage 98.01%, statements
99.42%, functions 99.6% and lines 99.76%. Build/typecheck, lint, formatting,
upgrade inventory and recharge audits pass.

Tests cover curse-free first picks, target/aim reservation, projectile direction,
beam range semantics, all nine boss delivery shapes, moving origins, fixed
impact points, target/taunt/illusion invalidation, quarry consumption, current
Revealed versus next pending reads and host/client interpolation. Browser smoke
uses the actual Host render projection and JSON/client interpolation, with
real input/touch controls on desktop and 320px. It checks both forecast and
revealed stages, rather than only searching for a text row.

Live testing must still judge whether the new cues are salient at gameplay
speed and useful for positioning. Automated checks cannot establish that.

**Next development after this correction receives live acceptance:** review
Knight, Barbarian and Monk's six subclasses. Then the remaining nature/caster/
support identities, whole-system power/reward/graft tuning and the dedicated
visual milestone. See [development status](DEVELOPMENT_STATUS.md).
