# Assassin: Shadow Reprise

Status: implemented for owner playtesting. PR #148's Rogue/Warlock review and
coating repair are merged. This delivery implements Assassin's open behavioral
finding; Fiend and Great Old One remain open. Passing tests does not establish
balance or player acceptance.

## What changes in play

The execution identity, previously Death Incarnate, becomes **Shadow Reprise**
with the same stable ID `ro_assassin_g_a`. Shadowstep leaves a fixed departure
anchor for 6s. A positive prepared direct hit from a **later cast** unlocks one
return for 2s, bounded by the anchor's remaining lifetime. Release and press
Shadowstep again to withdraw. You may instead stay beside the target and let the
return expire. The original cooldown keeps running through both choices.

Before: prepare with Shadowstep, spend precision, remain at the arrival position
until ordinary movement or another cooldown provides escape. After: deliberately
choose a safe departure, approach, connect a prepared strike, then choose whether
to leave before a retaliation. The return is earned by connecting, not by casting
an empty attack. A killing hit qualifies. The mechanic does not require adds,
party members, a damaged player, a kill or an individual skill grand.

This is a personal fixed-point withdrawal, not Whispers' enemy perception control
or Mantle's stationary allied echo. It does not relocate enemies or teammates.
Against a lone boss the player can leave an approaching melee retaliation; the
boss's committed attack keeps its ordinary targeting rules. In co-op, the same
choice can move the Assassin away from the group without granting allies a
teleport, defensive aura or extra damage. A poorly chosen departure remains a
poor destination; returning grants no immunity.

One bounded GPT-6.1 Sol high planning review supported implementation without an
owner checkpoint. One narrow follow-up resolved Forge portability. No model
comparison or parallel design fan-out was used.

## The two routes and their layers

| Layer                  | Shadow Reprise / execution                                                                                                                                                                                              | One with Shadow / poison                                                                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Starting kit           | Shadowstep supplies precision; Backstab spends it. The departure becomes a meaningful position to choose.                                                                                                               | Shadowstep prepares target-bound poison; preserve a stronger Coated Blade preparation.                                                                        |
| Identity               | A later prepared hit earns an optional retreat to that departure. Existing critical and wounded-target execution growth supports the route.                                                                             | Choose when and on whom to deposit poison, then exploit that personally poisoned target. This delivery preserves the accepted coating repair.                 |
| Ordinary upgrades      | Stronger preparation and the ordinary Assassinate refund help connect or recover. A refund cannot create another anchor or refund the return.                                                                           | Ordinary Coated Blade growth matters; a weaker Shadowstep coating cannot downgrade or extend stronger readiness. Duration caps remain real saturation points. |
| Individual skill grand | Death Strike exposes the target for a later cast. Return is movement only and cannot consume that exposure. Throw adds piercing; its precision-consumption flag already supplied by this identity is not counted twice. | Poison/grand duration growth remains bounded numerical support, not a second novel interaction.                                                               |
| Decision               | Commit the prepared hit, then stay for exposure payoff or withdraw before danger. Losing precision or missing can leave the escape unearned.                                                                            | Prepare the stronger coating, choose a useful recipient, maintain attacks on the owned poison route.                                                          |

The existing numerical A bonuses are retained as supporting growth. No ordinary
upgrade or individual grand was rewritten merely to multiply novelty. The
review's Throw precision overlap and coating-duration saturation remain explicit
limits; this patch does not claim to solve every ordinary-upgrade value issue.

### Every native first pick works against one full-health boss

| First pick                        | Available sequence                                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Death Strike `ro_assassin_strike` | Shadowstep → prepared Death Strike → choose return or later exposure payoff.                                                         |
| Deadly Throw `ro_assassin_throw`  | Shadowstep → connecting prepared Throw → optional return. A's existing precision-consumption unlock makes the base throw eligible.   |
| Coated Blade `ro_assassin_poison` | Coated Blade → Shadowstep → prepared Backstab → optional return. The repaired stronger coating is preserved.                         |
| Smoke Bomb `ro_assassin_smoke`    | Smoke → Shadowstep → prepared Backstab → optional return. Suppression remains setup; casting smoke alone does not unlock withdrawal. |

Base Backstab is also an available spender for either offensive first pick. No
second subclass skill, second identity, uncommon pair or hypothetical passive is
assumed. The four actual World routes are covered by tests.

## Input, reach and failure rules

- The owning skill requires a fresh press **after** the hit earns readiness.
  Holding, autofire, the outbound press, a press buffered before the hit, and a
  simultaneous same-tick chord cannot trigger a return. Keyboard/controller
  bindings and touch share host-side button-edge handling.
- Native reach equals resolved outbound blink range, bounded to the arena's
  normal movement envelope. It uses the game's existing torus distances. Walking
  too far blocks returning without spending readiness; walking back into range
  can make the remaining window usable.
- Roots, silence, stun, casting, gliding and forced slides block the return.
  The window continues to expire while blocked. Normal blink relocation can pass
  movement cover; the return follows that same spatial contract.
- A return moves only the owner and emits a blink presentation event. It is not a
  second cast: no new precision, coating, healing, Surge, movement buff, cast
  trigger, immunity, cooldown refund or recovery reset.
- Misses, immunity and zero/supplemental damage cannot arm it. Shared cast tokens
  exclude the entire original cast, including delayed projectile, piercing,
  splash and landing hits. A later positive direct hit qualifies even if lethal.
  Multiple qualifying hits cannot refresh the window.
- Downing, death, zero HP, leaving combat, changing class, replacing the exact
  equipped skill, removing its contract, cooldown completion or expiration clear
  the anchor. Another slot or another player's hit cannot use it. Re-equipping a
  skill does not reclaim a spent/cleared anchor.

The host exposes only departure position, owning slot, remaining times,
prepared-hit requirement, armed state and blocking reason. Source objects and
shared cast tokens stay out of network snapshots. The renderer draws a fixed
hollow diamond while waiting and adds an inward chevron when earned. A small local chevron also points toward the departure when it is offscreen. Desktop and
phone buttons show **Return** plus the short window and blocking reason, while
retaining the original cooldown readout. Shared details live in the expandable
Combat & upgrade rules reference.

## Forge and copied kits

`shadowReprise` is a real component: decomposition, recomposition, fitting,
valuation, scaling, caps, upgrade refresh and generated descriptions all handle
it. It is excluded from synthesized basic attacks. A prepared component has
30 base value; the easier portable component has 40, scaled by anchor lifetime
and return window. Pricing can shorten those durations; caps are 6s / 2s and
100–260u for nonblink range. The exact card states the resulting contract.

Actual synthesis explicitly selects the **portable variant** before pricing:
a later positive direct hit suffices, without precision preparation. Equipping
this identity on an already synthesized starting skill installs that same
portable component. This avoids secretly manufacturing precision generation or
consumption on arbitrary copied attacks. Decompose/recompose preserves whichever
variant is already present; it does not silently change native rules.

For a retained nonblink delivery, the departure is its successful cast position:
cast, move, connect another direct cast, optionally return. The original delivery
and its delayed hits cannot unlock their own return. A retained blink component
uses actual blink reach. Components, not an orphaned flat field, authorize the
mechanic. Copies work without owning the donor passive. A native Assassin
identity applies to its native Shadowstep in the skill registry; an unrelated
Fireball graft occupying the slot receives no free anchor. Reclaim restores the
native identity's skill contract.

## Validation and remaining review

The focused tests exercise actual casts and World input steps, all four first
picks, lethal/zero/immune/supplemental hits, original-cast exclusion, held/autofire
edges, expiry, block reasons, ownership cleanup, original cooldown/recovery,
public serialization, Forge synthesis/refresh/copy and native graft/reclaim.
Desktop/touch component tests check the return cue while preserving cooldown and
held button identity. The Chromium smoke drives desktop and 320px phone input
through the host and checks the production renderer's persistent marker. CI
includes this smoke using stable slot/registry-derived skill selection.

Local evidence: the full 170-file regression suite passed (4,289 tests at that
checkpoint), clearing all coverage gates with 98.01% branches. Subsequent focused
checks cover the final direction cue and the remaining cooldown/range fallbacks;
the two new runtime modules reach 100% statements, branches, functions and lines.
The production build, typecheck, lint, format, inventory/recharge audits, the
Rogue/Warlock grand-selection browser cohort and the new desktop/phone smoke pass.

Owner playtesting should judge whether the 6s setup and 2s choice feel deliberate,
whether the departure is readable in a crowded fight, and whether staying for
Death Strike exposure versus withdrawing is a useful decision. Automated checks
cannot establish those judgments or equal power between execution and poison.

## What follows playtesting

**Next development task: Fiend's deliberate aperture proposal/prototype.** Explore
routing only attacks aimed through an aperture, preserving real range, travel,
obstacles and provenance. Resolve aiming/telegraph and projectile rules before
implementation. Automatic remote origins for every attack were rejected because
they erase aiming decisions and overlap Infernal Claim's accepted role. Preserve
Claim, personal curse, Hurl and Pit while evaluating the new route.

Then resolve Great Old One's duplicate suppression/native Surge role, review the
remaining martial, nature, caster and support cohorts, and proceed to measured
whole-system tuning. The separate visual milestone remains player/boss
silhouettes, arenas and skill shapes/motion/impact, with desktop and phone
prototypes before the broader production pass. See [development status](DEVELOPMENT_STATUS.md).
