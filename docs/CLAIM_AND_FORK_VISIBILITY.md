# Claim and Eldritch Blast visibility corrections

The owner found the target ring insufficient in live play. Its replacement is
documented in [Claim's opportunity marker](CLAIM_OPPORTUNITY_MARKER.md); the button
feedback and Eldritch Blast correction below remain in effect.

The owner could not perceive Infernal Claim's first readiness cue in live play.
The eligibility data was present, but its thin ring sat below actors and combat
effects, and the button text was only 8px. The earlier browser assertion checked
drawing instructions without checking their layer position or practical contrast.

Claim now uses a dedicated layer above actors, particles, damage numbers and
enemy-status graphics. Its notched ring has a dark backing, bright violet/white
edges and a minimum screen-space radius. The ready button gains a solid violet
background and bright border. A compact, readable readiness/help panel sits by
local health, outside the desktop ability row that mobile deliberately hides.
It clears during cooldown or when downed/dead. The actual cast-target query and
normal cooldown behavior remain unchanged. Held touch inputs survive cue changes.

Pact of the Fiend did create a second Eldritch Blast projectile, but it supplied
no spread, so both bolts occupied the same trajectory. The grand now uses a modest
12-degree fan (six degrees each side). Projectile count, per-bolt damage and
lifesteal are unchanged. The fan changes coverage/aim slightly; both bolts can
still hit a sufficiently close or large target. Composed versions retain it.

## Verification and live checks

Focused engine/component tests cover both real bolt trajectories, native/composed
delivery, Claim eligibility and lifecycle, readable HUD states, and held touch
input. Real browser checks at desktop and 320px phone widths verify that Claim's
marker sits above combat effects and disappears during recharge. Screenshots
also verify the full HUD and separately visible bolts.

Live check: curse a foe, face it and enter Claim range. Look for the bright
notched target and the highlighted button; the health-adjacent panel should say
"Infernal Claim READY". Turn away or leave range to lose readiness, then cast to
check cooldown. With Pact equipped, basic attacks should visibly split left and
right instead of drawing on top of each other.

This patch changes only these visibility issues. The next content cohort remains
Knight/Barbarian/Monk after owner acceptance. Mage Hand Bolt is unchanged.
