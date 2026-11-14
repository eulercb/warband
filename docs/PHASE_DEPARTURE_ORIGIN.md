# Chaos Crossing: escape first, cast from departure

The owner merged and tested #177. Most changes felt good; Tides and cast-wide
Fortune stay accepted for now. Phase's live-shot relay failed the actual combat
sequence: projectiles expired before a useful opportunity, and teleporting in
an offensive direction undermined the escape. Longer projectile lifetimes would
not fix that direction conflict. Passing engine checks did not establish usability.

One bounded GPT-6.1 Sol high review recommended the replacement below. This is a
focused patch before Light/Life: input targeting and escape priority need their
own live acceptance, rather than being bundled with another class redesign.

## New sequence

**Phase away or sideways → aim at the enemy → cast a guided spell from departure.**
A fresh successful retained Phase leaves one hollow casting-origin marker for
**4s**, within a **600u tether**. The next compatible guided projectile special or
Tides nucleus consumes it at actual release. Basics, Mirror, Bend, Ward and
ineligible deliveries leave it available. A miss spends the released spell
normally. There is one attack, not a duplicate, echo or replay.

The new spell gets its normal damage, range and lifetime from the chosen origin.
Meteor's ordinary/Extinction payload, Chaos Surge's spread, Tides' Honed/Surge/
Gravitic effects and Fortune's shared cast snapshot keep their resolved roles.
Actor buffs and cast hooks stay on the caster. Existing airborne and projectile
cover rules apply; there is no automatic obstacle avoidance or homing.

A **fresh Phase press while cooling down** discards the origin and says **Cast
here** on keyboard/touch. The normal cooldown remains visible. A ready Phase
always performs the escape immediately and replaces the old origin; the cancel
action cannot swallow a recharged escape. A successful held/autofire Phase clears
the old origin without preparing a new one. Existing Return/Ember controls keep
their priority. Losing ownership, downing, class/source changes, finish or expiry
invalidate the origin; leaving its tether also expires it. Invalid or cancelled
origins fall back to ordinary body casting.

## Aim must match the receiving geometry

A unit aim vector measured from the player cannot identify the target under a
mouse cursor after a sideways teleport. Launching a parallel ray from departure
would reproduce the counterintuitive behavior in another form.

Mouse input now carries its finite pointer distance through source sanitization.
The game converts it through the actual camera scale into an optional world
reticle point; the host rejects non-finite or excessively distant points. Touch
and gamepad use an explicit **400u projected reticle** along their live aim.
Only remote-origin casting uses this point; ordinary aiming remains directional.

Both launch and subsequent steering derive heading from the **fixed departure
origin toward the live reticle**, using shortest torus geometry. This is not
tracking an enemy, and steering still turns at 180°/s for up to 1.25s. Fan offsets,
shared cast tokens and hit history remain intact. No existing shot is moved,
reset, suspended or extended.

The arena shows the hollow origin/countdown ring, launch arrow, reticle and
connecting preview; an edge arrow indicates an offscreen origin. HUD/touch shows
the remaining origin time. Once consumed, normal guidance and Tides detonation
cues take over. Allies see the owner's origin but cannot spend or redirect it.

## Layer, alternatives and Forge review

Every Wild first pick has a full-health solo-boss route through starting Meteor
and Phase; Chaos Surge is unnecessary. Tides adds a different remote-area timing
choice. Distant Leap and ordinary ranks keep their range/immunity/recharge value;
Phase Shift keeps its frontal guards. Shortened recharge explicitly takes escape
priority. Mirror and its grand retain their simple defense/preparation roles.
Unbound Chaos remains the Surge-spending route.

Rejected alternatives:

- Extending or suspending current projectiles preserves the awkward catch-first
  sequence and adds projectile preservation rules.
- Routing through Mirror images requires choosing an image and separating its
  attack-origin lifetime from defensive image consumption. It disturbs a useful
  simple preparer without solving the input targeting issue by itself.

The departure origin differs from Mantle's damage echoes, Aperture's repeated
conduit and Shadow Reprise's player return: it relocates one new attack's origin,
without an extra hit, repeated transport or return teleport. Co-op actors retain
their own targeting and movement; bosses need no control-immunity exception.

The stable retained Forge component ID `guideRelay` now represents departure
casting, priced at **32** rather than the old relay's 24. It remains rigid,
nonbasic Blink-only and authoritative through component retention, fitting,
refresh, recomposition and actual synthesis. Its text explains the new behavior.
Copying a Blink alone does not grant guidance to unrelated attacks; an actual
compatible guided receiver is required. Native/copy/composed actor effects stay
on the actor while only eligible attack delivery uses the origin.

## Verification and next review

World checks exercise sideways pointer targeting, anchored steering, Tides,
non-consuming basics/utilities, cancellation, a recharged escape, held/autofire,
expiry/tether and owner/source invalidation, fallback reticles, Fortune and actual
Forge synthesis. Input tests verify pointer distance survives device sanitization.
Browser scenarios use real mouse/touch retreat-first input, host snapshots,
client interpolation and the production renderer. Existing guidance/caster and
shared defense/recovery cohorts remain regression checks. Coverage gates stay 98%.

Final local verification: **5,107 tests in 190 files passed**. Coverage passed
all unchanged 98% gates: statements 99.39%, branches 98.02%, functions 99.64%,
lines 99.73%. Production build, ESLint, final TypeScript, formatting, catalogue
and recharge checks passed. Desktop/320px follow-up, retreat-first, existing
guidance/caster-grand and focused Shield Wall/Dimension Door browser cases passed.

Live testing should compare a retreating Meteor shot and a sideways Tides cast,
then discard an origin and try a recharged Phase. Assess whether four seconds and
the 400u stick projection are clear and useful, and whether the marker obscures
boss telegraphs. This is implemented behavior pending acceptance, not proof of
identity balance or final visual quality.

Next development after acceptance: **Light/Life**, then
**Devotion/Vengeance/Valor**, whole-system balance/grafts/progression and the visual
milestone. See [the development roadmap](DEVELOPMENT_STATUS.md).
