# Chaos Crossing: guide the burst, relay the spell

The owner merged and tested initial guidance (#176). Steering felt interesting,
but only Meteor and optional Chaos Surge participated. This follow-up expands the
same positioning decision to Tides and Arcane Phase, and makes Bend Luck useful
across an entire spending cast. One bounded GPT-6.1 Sol high review supported the
design; no parallel model comparisons were used. Light/Life is deferred until
this focused follow-up is live-tested, then Devotion/Vengeance/Valor follow.

## What the player does differently

- **Tides of Chaos:** launch a visible moving burst nucleus, guide it with live
  aim, then press its slot again to detonate at the chosen position. This lets
  the Sorcerer deliver its area away from their own body. The nucleus passes
  bodies and cover without contact damage; only its final burst hits.
- **Arcane Phase:** escape instantly as before, but a fresh successful Phase
  also gathers the latest guided spell at the arrival and redirects it along
  the Phase press aim. This offers a new lane after the original launch. It
  relocates the same spell objects, not copies or a second attack.
- **Bend Luck:** prepare Fortune, then choose a fan, burst, basic volley or
  other direct cast. Each living foe that cast damages receives Fortune once;
  landing the first bolt on an add no longer wastes its boss application.

Mirror Image remains a simple defense/preparation skill. Phase is the better
partner because moving the caster and changing the firing origin form one
legible action, without another illusion resource or damage rider. Unbound
Chaos retains its utility-to-Surge spending loop. Crossing's loop is choosing
launch lanes, steering and repositioning existing spells.

## Tides timing and damage

The nucleus travels at **240u/s**, for at most **1.25s / 300u**, turning at the
same **180°/s** limit as guided shots. A fresh second press requests detonation:
the earliest burst is **0.20s** after launch. Earlier presses queue, with an
explicit **Queued** control label. Holding the button/autofire never requests a
burst. The button says **Detonate** while the original cooldown runs; this is
not a new cast or a recharge reset. Silence, stun, another wind-up and controlled
movement prevent a new request; already queued/automatic detonation continues.

At expiry it bursts automatically. A newer guided launch takes steering control;
an older nucleus continues on its current heading and still detonates. It never
silently disappears because Meteor took control. If travel is spent first, it
hovers until its request/expiry. Downing, disconnect, finish, class/source change
or ownership epoch invalidation cancels it without a refund or explosion.

The final burst deals **115% of resolved damage** (native 40 becomes 46). This is
a modest premium for converting immediate area damage into a delayed payload,
with exposure to enemy movement and owner cancellation. Radius, Honed, Surge's
radius/damage/control and Gravitic Tides' pull use the resolved original payload.
Direct area targeting, including airborne recipients, is unchanged. No damage
occurs in transit, no hostile-field object is created, and the friendly footprint
shows the actual final radius. Co-op allies do not acquire steering control.

## Phase relay limits

Only the latest owned, live guided cast can relay, once per shared cast. Phase
keeps its native escape range, immunity and cooldown; holding it can escape but
does not trigger relay. Fan offsets, speed, damage, pierce history, lifetime,
minimum burst age and detonation requests survive. Projectiles emerge just ahead
of the arrival; a nucleus moves to the arrival itself. Torus displacement is
charged against each vehicle's remaining travel. Every eligible bolt must afford
the relocation, or the whole spell stays put while Phase still escapes.

The HUD shows **Relay ready** or **Relay out of reach** when relevant. Success
flashes the departure/arrival, and remote rendering snaps the actual relocation
instead of drawing the spell sliding across the intervening arena. Aperture
transit vehicles cannot be gathered. No aim assist, homing, automatic obstacle
avoidance, lifetime extension or free range accompanies relay.

## Fortune ownership

The first positive direct hit on a surviving recipient claims the current
preparation into the shared cast token. Misses, zero/immune damage, lethal-only
hits and supplemental/tick damage preserve readiness, retaining the old claim
condition. The claimed cast snapshots Fortune values and records recipient IDs:
other fan bolts, pierces and direct blast recipients can apply that snapshot,
but repeated hits on one foe do not refresh it.

A cast that already connected without readiness cannot adopt a later Bend.
A claimed cast never spends another preparation. Loaded Fate marks each recipient
but cannot be consumed by another bolt of the same cast: its bonus requires a
later cast. Owner/class/source/epoch guards prevent stale or foreign claims after
class changes or downing. Debuff magnitudes and durations remain unchanged;
Fortune remains one fixed support component with wider recipient coverage, not
one paid component per fan bolt.

## Layer and Forge review

| Receiving route              | Value with existing layers                                                                                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Meteor + any first Wild pick | Guided projectile works from full health against a lone boss; Phase can relay it without requiring Chaos Surge. Extinction/ordinary bonuses remain on the same vehicle. |
| Tides first                  | New remote-area timing choice immediately; Honed/Surge/Gravitic retain their own damage, size and pull contributions.                                                   |
| Chaos Surge                  | Shared fan steering and Phase relay preserve spread instead of converging all bolts; Fortune covers each recipient.                                                     |
| Bend first                   | Existing Meteor/Phase supplies the Crossing loop, while a basic volley can spend Fortune across boss and summons.                                                       |
| Wild Ward first              | Meteor/Phase still supplies the loop; Ward retains its support job.                                                                                                     |
| Mirror                       | Simple preparation/defense retained; no competing copy/relay controller.                                                                                                |
| Copied/composed kits         | Actual compatible pbaoe retains a priced nucleus; actual Blink retains a priced relay even outside Sorcerer. No free identity flag masquerades as a retained component. |

Forge values nucleus control at **32**, plus the actual **15% damage premium**
in its damage component, and relay at **24**. These are rigid effects, not rank
scaled multipliers. Decomposition, synthesis, recomposition, fitting, caps,
refresh and readouts agree. Nucleus requires positive nonbasic pbaoe and rejects
competing Shadow Commit, Palm Sweep, Ancestral Relay, Infernal Claim, Shadow
Reprise and Aperture controllers. Relay requires Blink; retaining relay alone
does not claim that Crossing has a usable damage route. A body-bound copied
burst advertises its nucleus only when the component actually survives synthesis.

## Verification and remaining review

Engine checks exercise real World casts, early/held input, expiry, newer-cast
ownership, cancellation, relay success/failure, shared fan identity and range
budgets, native/Honed/Surge/Gravitic payloads, actual Forge synthesis and Fortune
across bosses/summons/Loaded Fate. UI checks cover cooldown detonation, queued and
blocked states plus relay availability. Interpolation checks distinguish ordinary
travel from relay jumps.

Desktop and 320px browser checks use actual keyboard/touch input, production
renderer initialization, host snapshots and client interpolation. They cover
native/composed nuclei, Phase relay, queued detonation and cast-wide Fortune;
the existing guidance/caster smoke remains a regression check. Shared HUD defense
and recovery cases are reviewed too. Generated catalogue/recharge evidence and
the unchanged 98% coverage gates are part of delivery validation.

Final local verification: **5,103 tests / 190 files passed**. Coverage passed
all unchanged 98% gates: statements 99.39%, branches 98%, functions 99.6%,
lines 99.73%. TypeScript, ESLint, formatting, production build, catalogue/recharge
audits and CI-completion/workflow contracts passed. Browser runs passed the new
follow-up, existing guidance and caster-grand cohorts, plus focused Shield Wall
and Dimension Door defense/recovery cases on both desktop and phone.

Live testing should assess whether Tides' 0.20–1.25s control window and Phase's
remaining-travel constraint feel useful rather than fiddly. The premium is an
initial delivery-cost allowance; it does not establish equal identity power.
After acceptance, development resumes with **Light/Life**, then
**Devotion/Vengeance/Valor**, broad balance/grafts/progression and the dedicated
visual milestone. See [the development roadmap](DEVELOPMENT_STATUS.md).
