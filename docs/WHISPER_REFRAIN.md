# Mantle of Whispers: departure refrain

Mantle retains its 260u blink and 0.3s phasing without verses. With both valid
Harmony and Discord verses, the blink spends them once and leaves an afterimage
at its **departure** for 6s. The next three distinct positive direct casts against
a living victim within 180u of that position echo 35% of the effective primary
hit. Basics participate. The Bard can relocate away while continuing to exploit
the old position, or choose a departure near the next intended engagement.

This chorus does not move allies, exchange endpoints, create decoy AI or add the
ordinary group movement rally. It still calls the existing subclass chorus hook
once, so Whispers' separate dedicated-healing echo remains available. A first
Mantle pick still has its plain blink at full health; a prepared chorus needs
genuine healing for Harmony. Overhealing does not manufacture verses.

## Receiving layers

- **Honed:** each rank adds 2 percentage points to the echo fraction, up to 45%,
  plus the retained +8u travel and +0.02s phasing within the existing 0.6s limit
  and ordinary recharge budget.
- **Lingering Performance:** the bound-skill grand adds one echo charge, for four
  total. It replaces the former unrelated heal/control-resistance package.
- **Identities:** existing Whispers identity riders remain in their own layer;
  they do not replace the departure anchor or grant extra casts. The broader
  purpose of those identities is covered by the forthcoming identity review.

## Runtime, ownership and failure contracts

Each resolved ability owns one host cast token shared by its projectiles,
pierces and other direct victims. The afterimage retains the finite list of
tokens already spent, rather than only the most recent token: a delayed shot
from an earlier interleaved fan cannot spend twice. The list has at most three
entries natively, or four with the grand. The first eligible positive direct hit
from a cast spends one charge; later victims of that cast do not echo again.
The victim's center must be within the departure radius using wrapped distance.
The caster's current position and the victim's body radius do not enlarge it.

Misses, immune/zero hits, damage ticks, supplemental damage, victims outside the
footprint and a primary hit that has already killed its victim preserve charges.
The echo uses `damageEcho` attribution on already effective damage. Outgoing,
critical, curse and damage-taken multipliers are not applied again. The echo
cannot generate direct-hit procs, leech, additional verses or recursive echoes.
Rooted native casts are rejected before verses or cooldown are spent.

A successful later chorus replaces the former anchor, duration, cast history and
budget; images never stack. Expiry, downing, scene transitions, class changes and
loss of the source payload clear readiness. The active-class source and source
slot are checked again at payoff. A copied skill carries its own effect and does
not import the Whispers passive.

## Forge and presentation

`whisperRefrain` is a priced blink-only component. It includes the required
chorus capability, so selecting the afterimage without a separate chorus donor
cannot orphan its spender. It grants no Harmony or Discord source by itself;
the receiving kit must prepare real verses, and retains its blink without them.
Actual synthesis includes the component in its budget. Scaling changes its echo
fraction; refreshing components preserves actual upgrade changes. Forge caps
are 1–8s duration, 80–220u radius, 5–45% fraction and 1–4 charges, with the shared
damaging-area geometry ceiling applied at cast time. Incompatible deliveries
drop this component instead of promising a nonfunctional image.

The snapshot exposes only anchor, radius and remaining charges, alongside normal
buff duration. Fraction, source slot and cast identities stay host-private. A
persistent small mask, thin exact boundary and charge notches mark the departure;
existing support links show each successful echo from that position to its
victim. No new combat button or large text panel is added.

## Verification scope

`tests/whisper-refrain.test.ts` exercises real World/native and composed casts,
all Whispers first picks against one boss, full-health fallback, effective-heal
preparation, root rejection, basic spending, interleaved shared-cast fans,
no-double-multiplier attribution, ownership and nonrecursive/no-leech behavior,
stationary/wrapped range, expiry/downing/class/scene/source cleanup, public render
projection, actual synthesis and grand/Honed combinations. Desktop and phone
browser evidence and repository-wide gates belong to the parent integration.
These contracts do not establish final balance or owner acceptance of play feel.

Integration also checks that grand/Honed previews replace their nested payload
rather than mutating the authored skill shared by later heroes. The existing
support grand UI smoke now binds Mantle and Refrain for Whispers; the dedicated
renderer smoke performs real healing/Discord preparation and captures the
persistent cue after transient cast flashes settle at desktop and 320px widths.
