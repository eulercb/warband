# Great Old One: Whispered Doom / Thought Break

Implemented for owner playtesting. Aperture's placement/cover follow-up (#151)
is merged and accepted: the owner reports Aperture feels good now. This delivery
repairs Whispered Doom's native Surge purpose and Mind Blast grand's redundant
duration claim. **Elder Mind remains provisionally retained attrition and its
identity purpose remains open.** This does not mark the whole pair complete or
claim equal balance from passing tests.

One bounded GPT-6.1 Sol high review supported a scoped boss-action cancellation
rather than adding more weakness, cast slow, fear, illusions or terrain. Useful
simple skills/passive remain; a second new mechanic was not invented to make the
pair look finished.

## What changes in play

Prepare an 8s Surge with Blessing, Entropic Ward or Dissonant Whispers. Basics
preserve it. Hold a marked special until a dangerous boss wind-up or channel
begins, then connect before that action resolves. One successful direct hit can
**break that committed action into ordinary recovery**, starting the interrupted
ability's normal cooldown. The boss gains **8s Thought Break recovery shared
across the party**.

Before: prepare Surge and spend it for +20% damage; native eligible spells had
no wind-up for the advertised faster cast to shorten. After: choose between
spending for damage now and preserving a counterspell opportunity. A ranged
Mind Blast must arrive on time; instant close Rebuke is more responsive but asks
the player to enter its real range. Missing or arriving too late spends the
prepared cast without buying cancellation.

This is not existing stun, which pauses the same queued action, or cast slow,
which stretches its wind-up. Thought Break cancels that action. It neither
changes perceived targets like Whispers nor redirects projectiles through a
fixed lane like Fiend. It leaves the boss in place for allied attacks and
protects everyone from the cancelled action without creating allied damage
reduction or moving the enemy out of melee.

## Layers and first-pick routes

| Layer                   | Useful behavior and marginal contribution                                                                                                                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base kit                | Blessing prepares; Rebuke supplies an always-available native direct special. Hex supplies personal curse territory independently.                                                                                                      |
| Passive                 | Dread Insight's +8% against controlled personal curses remains supporting numerical growth. It is not labeled a new behavioral identity.                                                                                                |
| Mind Blast / Honed      | The psychic projectile weakens personally cursed targets; Honed extends that suppression up to its existing cap. A prior slow can help a later projectile arrive within a wind-up.                                                      |
| Mind Blast grand        | Rending Thought now truthfully says “Mind Blast pierces one foe.” Its old `max(duration, 4s)` contribution was already supplied by one Honed rank; that dead claim is removed. Piercing remains actual coverage, including after Honed. |
| Other individual grands | Tentacle's stronger snare/wind-up delay, following dread territory and Ward's frontal block remain useful separate delivery/support growth. They do not add extra interruption tokens.                                                  |
| Whispered Doom          | A prepared special can cancel one eligible boss action per cast, with a target-wide recovery. It creates a timing/positioning choice even when the skill is already instant.                                                            |
| Elder Mind              | Existing frequent curse/suppression attrition is preserved provisionally. Its duplicate purpose is still the next design question, not a completed redesign.                                                                            |

| Native first pick    | Full-health lone-boss sequence                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------- |
| Mind Blast           | Blessing → preserve readiness → ranged Surged Blast connects during the dangerous action.                       |
| Tentacle of the Deep | Blessing → approach → Surged close burst connects during the action.                                            |
| Dissonant Whispers   | Cast dread territory to prepare → approach and hold base Rebuke as the interrupting special.                    |
| Entropic Ward        | Ward prepares while relocating → use base Rebuke within its real range. Blessing is another preparation source. |

These routes require no adds, kill, injury, second subclass pick or individual
grand. In co-op, another owner cannot immediately cancel the boss's next action
through the same recovery window. In multi-boss bursts, all direct recipients
share one cast token, so one cast cannot cancel several bosses.

## Exact combat and timing rules

- Preparation is spent at **cast reservation**, under the existing Surge rules.
  Its +20% direct damage remains. Half wind-up only matters when a receiving
  spell actually has a wind-up; native Doom no longer claims a speed benefit
  its instant spells cannot use.
- Cancellation needs positive effective **direct boss damage**, a living owner
  in the reserving class, a living boss currently winding up/channeling a known
  ability, and no active Thought Break recovery. An idle/recovering boss is not
  interrupted. Invulnerability or zero damage cannot trigger it.
- One shared resolved-cast token travels through native burst, fan, projectile,
  piercing and impact paths. Only a successful cancellation spends that token.
  A resisted/ineligible recipient cannot create a second token or additional
  damage. Supplemental/echo/zone ticks never inherit this interruption.
- Adds have an attack cooldown but no committed wind-up/channel in this engine.
  **They are not interrupted.** Native Surged spells still deal their actual
  +20% damage to them; no renamed add slow is substituted.
- The cancelled ability receives the boss's normal cooldown policy, including
  phase/scaling modifiers; existing longer cooldowns are not shortened. The boss
  enters ordinary recovery and can pursue during it. This is not a stun lock.
- The target-wide 8s resistance is a distinct recovery state, not ordinary stun
  DR. Steadfast's root/stun/displacement protection is not silently extended to
  this different mechanic; damage immunity still prevents the required hit.
- Already emitted projectiles, zones and independent pending strikes remain.
  A cancelled channel produces no further ticks from that action. A completed
  attack cannot be cancelled retroactively or secretly retargeted.

The current telegraph disappears with cancellation and a **“Thought broken”**
cast cue appears. A distinct public enemy recovery badge communicates the shared
8s resistance; its tooltip names Thought Break. Native consuming slots show
“Thought Break prepared” on desktop and “Break prepared” on touch while the
Surge is live. Cooldown readouts remain visible. Cast tokens and owner-class
reservation metadata stay out of public snapshots.

## Copied skills and actual Forge kits

A copied/native interruption cannot rely on an absent donor preparation source.
The component boundary therefore has an explicit portable variant:

- Native `surgeStrike` with `interrupt: true` is conditional on spending Surge.
- **Recomposition/copy and synthesis convert that payload into `thoughtBreak`:**
  a self-contained direct hit can interrupt under the same once-per-cast and
  target-wide 8s rules. This component requires no Surge and itself grants no
  Surge damage or cast-speed bonus. Any separately retained Surge component
  remains an independent contract.
- Conversion occurs before synthesis pricing. A native conditional rider carries
  25 utility value; the self-contained portable effect carries 40. Its fixed
  interruption contract is not made arbitrarily stronger by budget scaling.
  Multiple donor paths converging on Thought Break are deduplicated so value and
  execution both contain one actual interruption contract.
- The effect has explicit decomposition, recomposition, fitting, refresh,
  description and cap/scaling handling. It fits direct melee/burst/projectile
  deliveries; it does not ride zone ticks. Random synthesized basics exclude it.
- Equipping Doom on an active Forge kit installs it on the starting direct special.
  If that random special cannot hit directly, the basic receives the priced
  standalone contract as an explicit identity fallback. Direct GOO receiving
  skills also receive it; utility-only copies are not falsely advertised as
  interrupting attacks. Forge offers and actual skill descriptions disclose the
  altered preparation/damage behavior and basic fallback.
- The native identity remains attached to its native skill registry. A Fireball
  graft occupying Rebuke's slot receives no free native rider; reclaim restores
  it. A genuinely copied Thought Break component works without the GOO passive.
  Removing native partners can carry a real graft opportunity cost.

This altered Forge/copy contract is intentionally explicit. An orphaned flat
`thoughtBreak` field cannot authorize the effect when the composed list lacks
its component. Ordinary canonical recomposition retains its existing fields and
component reference rather than cloning everything for this one exception.

## Verification and what follows

Local delivery checks pass: 173 test files / 4,406 tests; branch coverage 98%,
statements 99.42%, functions 99.63% and lines 99.76%. Build, lint, formatting,
upgrade inventory and recharge audits pass.

Focused actual World tests cover all four first picks, held preparation/basics,
wind-up and real channel cancellation, ordinary cooldowns, retained hazards,
misses, expiry, immunity/zero/lethal hits, source state/class, two-boss shared
casts and party-wide recovery. Tests compare stun's paused action with the new
cancelled one. Zero/five Honed ranks, Haste, banked/selected grands, native/graft
reclaim, real Forge synthesis, copied no-passive use, basic fallback and duplicate
component pricing are checked. Sorcerer/shared Surge behavior remains in the
regression suite.

The Chromium smoke drives preparation and spending through host input at desktop
and 320px, observes the ground telegraph before cancellation, checks normal
cooldown and public recovery afterward, and renders the real preparation/status
cues. Existing grand-selection smoke uses stable IDs and registry-derived names.

Owner playtesting should judge whether holding a spell for interruption is a
useful choice, whether projectile timing/close range is readable, and whether
8s shared recovery prevents excessive control without making the effect feel
unavailable. Automated checks cannot settle fun or comparative power.

**Next development task after this test: finish Elder Mind's remaining purpose
review against the now-reactive Doom route.** Do not advance the whole GOO pair
merely because this patch passes tests. Once that question is resolved, move to
Knight/Barbarian/Monk's six subclasses, then remaining nature/caster/support
reviews, whole-system/reward/graft tuning and the separate visual milestone.
See [development status](DEVELOPMENT_STATUS.md).
