# Pack Tactics: held basics and a shared return route

The owner merged/tested #171. Following and committed hunts improved, but holding
basic attack only triggered the first hunt. The smaller wolves could also choose
a different wrapped route home, briefly making the pack look separated.

## Held basic attacks restart idle hunts

The previous one-command-per-press rule deliberately stopped all held attacks
from issuing another command. The basic now has a specific exception: **a later
accepted basic cast can designate a new quarry while the pack is idle**. It still
needs a positive direct hit on a living hostile within 600u. A missed first basic
therefore does not prevent later held basics from starting a hunt.

Each such basic carries its own **idle-only** command token. If another ability
starts a hunt before that basic's projectile arrives, the projectile cannot steal
its target or extend its duration. During an active hunt, continued held basics
do normal attack damage but do not change its target or six-second timer. When
that hunt ends, subsequent basic casts can command again without releasing the
button or casting a special.

New presses still allow deliberate retargeting. Held specials retain their
existing rule, and the normal input/cooldown system still decides whether an
ability actually casts. No independent target scanning or new automatic casting
is introduced. The 2.5s wave recovery, damage, ward rules and full-duration hunt
beyond activation range are unchanged.

## The smaller wolves return with the lead

Previously all three wolves independently chose a shortest torus path to their
owner-relative idle position. Near an arena midpoint, two equally reasonable
shortcuts could point in opposite directions. That was valid wrapping but weaker
pack presentation.

Returning flankers now follow formation points relative to the **lead wolf's
current position**. The lead chooses the route toward the owner; the smaller
wolves regroup around it and follow that route, with enough catch-up speed to
stay nearby. On arrival, their owner-relative idle positions are the same as
before. They travel continuously rather than teleporting. Attack-time flanking
and the arena's torus geometry stay intact.

## Verification and next work

Actual World tests hold basic with autofire across multiple complete hunts and
verify distinct new hunts without extending an active timer. Further checks cover
miss recovery, stale-source rejection, held specials, an in-flight idle-only basic
arriving after a fresh hunt starts, and an adversarial midpoint where the old
independent shortest routes would split the pack. Existing positive-hit, range,
source, lifecycle, ward, damage and remote-pose tests remain in the suite.

The desktop/phone native and Forge hunt smoke now holds basic long enough to prove
multiple hunt starts. It also exercises a distant return near the problematic
wrapped geometry, alongside existing idle, expiry, return and grand-selection
checks. Final local results are recorded in the PR; owner playtesting is the next
acceptance step.

These are focused behavior fixes. **Land B's field-transplant prototype remains
next**, using the candidate and unresolved contracts documented in
[the prior continuity review](PACK_HUNT_CONTINUITY.md#next-development-land-b-prototype).
Remaining caster/support reviews, overall balance/progression/graft tuning and the
visual milestone follow. See [development status](DEVELOPMENT_STATUS.md).
