# Elder Mind: two consecutive reveals

PR155 is merged and tested. The owner asks for two reveals because a single
fast action can use up the whole opportunity. This delivery changes the window
to **move 1/2 → move 2/2 → 8s Mind closed**, retaining the accepted readable
geometry, curse-free access and quiet interval. It awaits owner live acceptance.

## What the player gets

A positive direct hit opens move 1/2. When that action finishes or is interrupted,
move 2/2 is read automatically, without another hit. Only after the second action
ends does the shared 8s recovery begin. The forecast card and boss nameplate show
READING, FORESEEN and REVEALED with their **1/2 or 2/2** ordinal.

These are two consecutive actual decisions, shown one at a time. The second
ability is not guessed or shown as a fixed future queue while the first is
still attacking. The boss chooses it using the real cooldowns, health, position,
threat, perception and randomness after move one. Its aim then commits under
the existing foresight rules. This preserves truthful footprints and ordinary
boss timing. No cast or recovery time is added to make a fast move look longer.

An instant first projectile can therefore consume 1/2 immediately, leave its
actual projectile in flight, and open 2/2 for the next decision. The first cue
can still be brief; the useful additional opportunity is the second reveal.

## Boundaries

- Each pending slot has its own maximum 8s lifetime, started internally once.
  Extra hits cannot refresh the timer, add slots, change the reader or skip
  recovery. Basics, close spells and portable/Forge carriers retain access.
- The second pending timer starts when the first revealed action ends. A long
  first channel cannot consume the second slot's waiting time. Long second
  channels retain their cue, then start the full recovery when they end.
- Completion and interruption use the same transition. Interrupting move one
  spends slot one and advances to two; interrupting move two closes the window.
  The interrupting skill retains its own normal limits.
- One window is shared by all readers of a boss. Different bosses remain
  independent. Repeated party hits cannot refill either slot or create a third.
- Source death/downing, zero HP, class loss or a noncombat room prevents an
  unstarted second slot. The current committed attack keeps its cue; when it
  ends, no orphaned second opportunity is created. Dead bosses gain no recovery.
- Expired, illegal or invalidated pending reads close the whole window with
  shared recovery. A taunt/illusion change can still invalidate an obsolete aim;
  this does not award replacement slots.
- Only the current truthful footprint is drawn. Beam tracking, late hazard pool
  placement, cover clipping, clean disconnected arcs and moving boss-centered
  rings retain their previous semantics.

The original reader/class and ordinal are carried only in host action state.
Public snapshots expose the ordinal beside the existing forecast; the actual
host projection and client interpolation preserve it. Optional ordinal fields
keep older snapshots readable. Component fitting, binary caps, direct-hit
provenance and the explicit Forge basic fallback are unchanged. The portable
component's current internal weight remains provisional for later whole-system
tuning; this patch does not claim equal comparative power.

One bounded Sol 6.1 high review supported sequential decisions over a speculative
two-deep AI queue. Gameplay changes stay in this focused follow-up. The next
martial cohort involves separate identity decisions and is not mixed into the
same live test.

## Verification and what follows

Local gates pass: **4,490 tests in 175 files**, branch coverage 98.01%,
statements 99.42%, functions 99.6% and lines 99.76%. Build/typecheck, lint,
formatting, upgrade inventory and recharge audits pass. Desktop/320px Chromium
checks pass for both numbered reveals, recovery and the existing Beholder arcs.

Actual World checks cover automatic second activation, instant first actions,
long first/second channels, interruption of both slots, source loss, party
non-refresh, expiry, separate bosses and normal timing. Chromium checks on
desktop/320px follow both numbered stages through host projection and JSON/client
interpolation without another hit, then verify recovery, rearming and the
accepted Beholder arc rendering.

**Next development after owner acceptance:** go directly to Knight, Barbarian
and Monk's six-subclass purpose review. Retain sound identities and implement
mature findings in bounded deliveries. Then review remaining nature/caster/
support identities, whole-system power/reward/graft tuning and the dedicated
visual milestone. See [development status](DEVELOPMENT_STATUS.md).
