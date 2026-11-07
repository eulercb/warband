# Player status clarity: silence follow-up

The owner merged and tested #158. The remaining feedback concerns the silence
marker mixing with the other small symbols around a character. No new cover or
silence-mechanics defect was reported; the broad mechanics remain the current
baseline rather than a claim of final balance.

## Cause and fix

The crossed speech bubble occupied the same space above the hero as the floating
name, compact buff row and health bar. It was also drawn in the body/defense pass,
where subsequent layers could cover it. Silence additionally appeared as a tiny
glyph in that crowded row.

The mute marker now uses a dedicated **30px opaque foreground badge beside and
slightly below the character**. A short connector associates it with its owner;
the crossed speech bubble communicates the state without color recognition.
It stays legible at different zoom levels, chooses the roomier side, and clamps
to the viewport edges. Off-screen teammates do not create on-screen badges or
long connectors. Its position respects the larger Moon form body.

The floating player buff row omits the duplicate silence glyph. Other buffs and
the health/name rows retain their presentation. The purple arena ring, prominent
HUD duration/pool-exit notice and special-skill lockout labels remain available.
Silence ending or the hero going down removes the dedicated marker. Boss status
rows and the HUD's ordinary buff chips retain their existing silence information.

This solves overlap within a character's indicators. It does not claim a general
layout solver for arbitrarily overlapping players, labels and scenery; the opaque
badge and short connector improve attribution when players gather.

## Verification

The real renderer browser smoke now adds guard, counter, mitigation, movement slow
and control-resistance states while Beholder silence is active. Desktop and 320px
phone screenshots verify the separate marker lane under that load. Existing smoke
checks still exercise wave cover, remote preview, timed/pool silence, touch labels
and expiry recovery. Geometry checks cover left/right placement, viewport edges,
expiry, zero health and downed state.

Local validation: 4,573 tests in 177 files pass, including the 98% branch-coverage
gate. Build, lint, final TypeScript, formatting and desktop/phone browser checks
pass. These checks establish the rendering contracts; owner live testing remains
the readability acceptance gate.

## Delivery scope and next development

This patch is the focused readability fix. One bounded Sol 6.1 high review also
advanced the next class work; its concrete proposal and unresolved prototype
contract are saved in [Battlemaster positioning plan](BATTLEMASTER_POSITIONING_PLAN.md).
No Battlemaster identity mechanics are changed or counted as implemented here.

Next: prototype deferred enemy displacement and collision-safe personal footwork,
then implement the two Battlemaster identities if their committed-attack and
portable-skill contracts pass. Following stages remain Totem/Monk, other class
reviews, system tuning and the visual revamp. See [development status](DEVELOPMENT_STATUS.md).
