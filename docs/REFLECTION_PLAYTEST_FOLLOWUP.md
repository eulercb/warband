# Reflection: reliable preparation, useful returns, a distinct mirror

Accepted: the owner merged and tested #180. The following records that delivery.

The owner merged/tested #179 and liked the reflection idea. Three issues prevent
acceptance: an arena line towards the screen corner, reflected shots disappearing
near the end of their incoming budget, and capped absorption preventing reflection
from preparing. The generic circle marker also needs stronger recognition.

One bounded GPT-6.1 Sol high review supported this focused follow-up. Life’s
identity redesign remains next; these related fixes should get their own live
acceptance rather than being bundled with another new support system.

## Drawing fix and recognition

The old renderer drew a circle, then called `arc` without moving to its start.
Pixi could connect the current/default point to that arc, producing the long
line. The new reflection visual is a separate, testable drawing helper with
explicit starts for every independent line and polygon.

A pale-gold **faceted mirror** replaces the generic readiness rings. Six bright
edges form its outline; edges dim as the four seconds run out. Cyan interior
facets and a side mirror glyph distinguish it from absorption, guards
and other circular statuses. A minimum screen size keeps it visible on phones.
The glyph sits clear of the ordinary buff row. The existing **Reflect 1 · time**
readout remains in its own arena lane. Consumption
removes the mirror, flashes the reflection cue and outlines the friendly return.

Bounds tests render away from the screen origin after a prior path point, then
assert every mark stays local. They cover full/partial/empty countdowns and phone
scale. Checking only that graphics instructions existed did not catch this bug.

## Paid casts prepare reflection at capped absorption

Every eligible committed Blessing or retained Light ward cast grants or refreshes
**one four-second reflection on its actual recipient**, even when that recipient
already has an equal, stronger or maximum absorption pool. Charges never stack.
A later eligible cast replaces the ownership/source snapshot with the newest
caster; losing an earlier caster cannot invalidate the replacement.

Only reflection preparation moves outside the barrier-gain gate. Actual barrier
amounts, the shared 50%-max-HP absorption ceiling, protection cues and Refulgence
rewards retain their real-gain requirement. Thus a capped cast supplies the halo
without inventing absorption or farming a protection-triggered passive.

Recipient selection and skill cooldowns are unchanged. Invalid deliveries or
missing retained positive barrier components do not receive reflection. Native,
upgraded and Forge descriptions now state the capped-shield behavior. The rigid
Forge component stays priced at 32: this repairs its promised opportunity, rather
than adding more contacts or reflected damage.

## A new return leg

On reflection the same projectile reverses velocity, changes allegiance and gets
a fresh **900u return range**. Its lifetime becomes the greater of its old
remaining lifetime or **900 / speed + 0.1 seconds**, so it can use that travel
budget even if the incoming leg was nearly exhausted. Speed, captured damage,
hit/blast geometry and the borrowed-damage contract remain intact.

This is an explicit new return leg, an exception to preserving an existing
friendly cast’s movement budgets. The finite range bounds travel; extra lifetime
cannot add more distance. There is no homing, guaranteed contact, extra damage
premium or repeated reflection. Missed returns expire, and cover can stop them.
Already expired/zero-damage/stationary hostile shots do not spend a halo.

Earlier cover/body/projected-shield contact, recipient invulnerability, personal
guard preservation, hostile rider stripping, and owner/source invalidation remain
covered. Returned damage still cannot crit or consume direct-hit preparation.
The projectile-only niche remains explicit: Troll/Dire Wolf offer no native shot
to reflect, and beams, waves, melee, fields and terrain do not trigger the halo.

## Verification and next development

World regressions cover capped activation/rearming, active refresh, no extra
protection reward, newest-caster replacement, nearly spent range/lifetime returns
that actually hit a distant enemy, and a missed return expiring at its finite
cap. Existing cover, shield, invulnerability, copied/Forge and borrowed-damage
contracts remain regression checks.

Browser scenarios use real keyboard/touch casts and actual Lich projectiles for
Blessing, Warding, ally recipients, synthesis, capped absorption and a nearly
spent incoming leg. Desktop and 320px screenshots expose marker recognition;
public host/client states confirm readiness and the friendly return. Existing
support-grand and defense/recovery checks remain in the release verification.

Final local verification: **5,145 tests in 192 files passed**. All unchanged
98% gates passed: statements 99.38%, branches 98.03%, functions 99.61%, lines
99.73%. Build, lint, final TypeScript, formatting and catalogue/recharge checks
passed. Twelve desktop/phone reflection scenarios passed, with the final larger
mirror rechecked on both viewports. Existing support-grand and focused Shield
Wall/Dimension Door defense/recovery checks passed.

After live acceptance, development resumes with **Life’s identity purpose
follow-up**, then **Devotion/Vengeance/Valor**, broader balance/grafts/progression
and the visual milestone. See [the roadmap](DEVELOPMENT_STATUS.md).
