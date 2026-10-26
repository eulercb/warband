# Claim: a distinct actionable-target cue

Live feedback on PR #138 showed that even its thicker ring still read as another
curse/area outline. Rendering above effects was necessary, but did not make that
shape distinct enough during play. Keep the useful readiness feedback on the
button and by health; replace the target ring itself.

The ready target now gets a **solid gold diamond with a crosshair and short inward
pointer**, beside its body. The badge is 28 screen pixels across, with dark/white
edges so it remains legible on both dark floors and bright spells. Its size does
not shrink with camera zoom. Placement favors the roomier side of the screen,
keeps the badge inside the viewport, and avoids the usual name/buff rows above
and below the target. It is steady: no flashing, looping pulse, text or full-body
highlight. The previous ring is removed.

Only the local player's actually selected, eligible Claim target is marked, and
only while the skill is recharged and the hero alive. Shared targets are
deduplicated across slots. Losing eligibility, casting, or being downed clears
the cue. No targeting, range, curse, cooldown or damage rules change. Native,
copied and composed Claim still use the host's existing cast query.

## Reusable visual distinction

`src/render/overlays/opportunityMarker.ts` provides a small screen-space drawing
helper for an **action available now on this target**. This differs from a ground
outline showing territory and a status glyph showing an existing debuff. Future
conditional abilities may reuse that distinction after an explicit readability
review. This patch enables it only for Claim, without adding markers to every
enemy or changing other abilities.

## Verification and live check

Focused tests cover side selection, screen-edge clamping, a constant opaque
footprint across enemy sizes/zoom, and the existing eligibility/snapshot contracts.
The desktop/320px native/composed browser checks require a solid opportunity badge
above combat effects and no marker during cooldown. Screenshots include active
curse zones and damage feedback, rather than an isolated marker on an empty floor.
These checks establish presentation contracts; live play remains the readability
acceptance check.

Curse a foe and enter Claim's usable range while facing it: look beside the foe
for the gold crosshair diamond and short pointer. Turn away, leave range, let the
curse expire, or cast: the badge should disappear. Confirm on a phone that it is
noticeable without covering the enemy body, name, or movement controls.

No other class content or Eldritch Blast behavior changes. The next gameplay
cohort stays paused until the owner accepts this cue.
