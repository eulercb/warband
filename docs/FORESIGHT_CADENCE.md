# Foresight: clean arcs and bounded reads

Follow-up: PR155 merged and tested. [Two-move foresight](TWO_MOVE_FORESIGHT.md)
changes the single-action window below to two consecutive reveals before the
same quiet interval, addressing fast first moves.

PR154 is merged. Owner testing accepts the new visibility: it is clear what
will happen. Two follow-ups remain: disconnected purple arcs draw unwanted
joining lines, and basic hits keep foresight effectively continuous. This
patch fixes the common drawing primitive and adds a shared recovery window.

## Drawing correction

Pixi continues its current path when `arc` is called. The dashed ring and cone
segments did not first move to their own starting point, so a segment could
connect to a previous path or screen-corner position. Each disconnected arc
now starts with an explicit `moveTo` at its mathematical arc endpoint.

This fixes the shared primitive used by Disintegrate's impact circle, Death
Ray's tracking/range rings, boss-centered circles and cone outlines. The real
beam tether between boss and marked victim remains intentional. No attack aim,
range, impact point or damage changes are part of this drawing fix.

The regression test inspects actual Pixi path instructions for Beholder
Disintegrate, Death Ray and Antimagic Eye. It verifies arc starts, rather than
only checking that a mocked drawing method was called. Browser smoke also
renders the two reported Beholder examples at desktop and phone sizes.

## One action, then eight quiet seconds

A positive direct hit can read one upcoming boss action. Its pending window
still lasts at most 8s, but further hits **cannot refresh it**. Once the action
starts, its existing Revealed cue remains through its ordinary wind-up/channel.
Hits during that action cannot queue the following read.

When that revealed action finishes or is interrupted, the boss gains **Mind
closed for 8s**. No player can read that boss during this shared interval.
Pending reads that expire or become invalid also begin recovery, preventing
held basics from immediately recreating an uninterrupted pending forecast.
After recovery expires, a fresh positive direct hit can read again.

The interval starts after the read ends, not at the initial hit or preview:
a long channel therefore cannot consume the entire quiet interval. It does
not delay, weaken or otherwise change ordinary boss attacks. Independent
bosses have independent recovery. Switching readers/classes cannot bypass a
boss's existing recovery; room/boss death cleanup remains ordinary cleanup.

A compact **Mind closed · Ns** countdown and closed-eye boss badge explain the
gap. READING, FORESEEN and REVEALED keep their existing meanings. The countdown
is recovery time, not a promise of when the boss will attack.

One bounded Sol 6.1 high review supported the shared post-read interval over
special-only activation or an attack-count requirement. It keeps curse-free
basic access for all first picks and copies/Forge carriers. Eight quiet seconds
is initial tuning: live play should judge whether it produces useful openings
with enough ordinary unforecast combat between them. No bonus damage or new
resource compensates for the downtime. The existing component weight is retained
for this limiter; broad comparative pricing remains in the later tuning stage.

## Verification and next work

Local gates pass: **4,480 tests in 175 files**, branch coverage 98%, statements
99.42%, functions 99.64% and lines 99.76%. Build/typecheck, lint, formatting,
upgrade inventory and recharge audits pass. Desktop/320px Chromium checks pass
for the held-basic cadence and both reported Beholder visuals.

Focused checks cover non-refreshing reads, expiry/invalidation, long channels,
interruption, shared party recovery, independent bosses and the visible countdown.
The browser test holds basic attack through the quiet interval and verifies
that reading resumes only after recovery. Existing native/Forge first-pick,
graft, target/aim and production host/client checks remain in the suite.

**Next development after owner acceptance of this follow-up:** Knight,
Barbarian and Monk's six subclasses, then remaining identity reviews,
whole-system power/reward/graft tuning and the visual milestone. See the
[development status](DEVELOPMENT_STATUS.md).
