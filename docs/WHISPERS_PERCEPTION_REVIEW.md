# Whispers: fear and false perception

2026-10-31. Design review, not implementation. Supersedes the payoffs in
`WHISPERS_SECRETS_PROPOSAL.md`. Owner accepts learning a marked enemy's secret
and different interactions through attack, healing, Mantle and Words of Terror.
Owner rejects calling additional damage, mitigation or a renamed slow a new
fear/secret identity. See `AGENTS.md` and the updated review gate for this
persistent criterion and collaboration/model preferences.

One independent GPT-6.1 Sol / high planning review was used, with no delegated
agents beneath it. Recommendations below combine that review with direct code
inspection. No external research, new tests, comparative balance result or
behavior prototype is claimed.

## Correct the design goal

The mark is a useful decision structure, but its payoff must change how the
enemy navigates, perceives targets or chooses sides. Support can come from
peeling a pursuer, opening a route or baiting an attack elsewhere. Damage and
healing can remain ordinary skill functions without carrying the identity.

The first proposal prematurely rejected fleeing and distraction because of
their implementation/co-op risks. Those risks require bounded rules and a
prototype, not automatic substitution with ordinary numerical effects. A fear
must actually move or redirect an enemy when movement/targeting is possible;
an illusion must affect decisions if it is described as a distraction.

## Recommended core: Private Nightmare

Learn one enemy's secret with a successful direct hit. A subsequent deliberate
skill spends it to place an apparition only that enemy believes in. It finishes
its committed action, then makes one short, bounded retreat from the apparition.
The choice is where to put the thing the enemy fears, hence where to open space.
No new button, stacking fear meter or extra damage payout is needed.

| Spend                                           | Apparition location                              | Actual encounter change                                                                                                                                                                                                       |
| ----------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direct Discord special, including Psychic Blade | Bard's position when the spend succeeds          | Drive the marked pursuer away and open space in front of the Bard.                                                                                                                                                            |
| Dedicated Harmony heal                          | Actual selected recipient's position at the cast | Peel the marked enemy away from an ally or yourself; useful even at full HP. Ordinary healing and effective-heal/verse rules remain separate.                                                                                 |
| Mantle                                          | Departure position                               | Blink across or around a pursuer, leaving a nightmare behind. Its retreat direction now depends on where you began the teleport, not where you landed. Preserve accepted travel/phasing and control-resistant grand behavior. |
| Words of Terror                                 | The field's placed area                          | The marked enemy exits the feared area by a valid route. Repeated ticks cannot refresh/reapply retreat. Its unmarked targets retain the ordinary field behavior until separately reviewed.                                    |

Example: a teammate is cornered. Learn the pursuing boss's secret, then heal that
teammate to make the boss recoil from their location. Alternatively, place Words
to open a passage, or use Mantle to choose which side the boss retreats toward.
This is spatial support the player and teammates can observe.

### Rules the prototype must establish

- This is an apparition that repels, not a decoy that attracts attacks. Do not
  claim distraction, invisibility or allegiance conversion from this version.
- A lone mobile boss genuinely retreats, including a ranged boss; leaving melee
  reach is not sufficient to ignore the effect. Adds can use the same action.
  One controlled foe is enough to test usefulness without scattering whole packs.
- Existing wind-ups, channels and projectiles continue. Activate retreat at the
  next eligible movement/decision boundary; show pending fear if delayed. Do not
  let a long existing action consume the whole useful window invisibly. Bound
  pending lifetime and reject an unusable spend without silently replacing it
  with damage. Determine the precise timing through the prototype.
- Movement during retreat takes priority over new attack decisions and automatic
  blinks. No fear-based teleport. Existing hazards and attacks remain dangerous.
- Freeze the apparition's location when spent so the Bard cannot continuously
  steer the boss by running. Fear of Words is initially anchored to its placement
  even if a following-field grand later moves the ordinary field; explain this
  distinction or revise that grand after testing. Do not ship a moving fear cage.
- Use a short travel/time budget and valid local route. At an obstacle or arena
  boundary, test a lateral exit; avoid oscillation, torus wrap exploits, forced
  hazard kills and pushing the boss across the arena. Fear uses movement rather
  than a scripted shove and obeys actual movement restrictions.
- Roots/anchors need truthful treatment. Test a visible pending response for
  temporary roots; an immobile encounter needs an explicit authored response or
  a clearly disclosed unsupported interaction, not a disguised mitigation buff.
  Do not claim this works on every boss before checking the catalogue.
- Multiple Bards share a target-level retreat recovery and cannot queue an
  endless series. Do not consume another player's secret on a rejected effect.
  Define fear/taunt priority and preserve clear targeting after retreat ends.
- Learning/spending retains one mark and once-per-cast provenance. Held basics
  cannot spend it accidentally. Word ticks cannot learn/spend the same cast's
  mark or rearm it after the effect ends. No recursive triggers or spread by default.
- Existing melee allies may dislike forced displacement. Show the apparition and
  escape direction, keep movement local, and test this as a deliberate tradeoff.
  Its value is opening space, not making every party want every boss constantly feared.

Initially keep the individual skill grands and support foundation. Rewrite both
identity grand recipes only after the behavioral prototype establishes what
choices exist; do not lock them into longer fear or bigger numbers prematurely.
Candidate future distinctions include choosing the retreat destination versus
changing how/where an apparition can be placed. Each must pass the same review.

## Alternative: False Quarry

Spend the secret to create a believable stationary double which the marked enemy
selects for its next eligible targeted attack. Mantle naturally leaves the double
behind; a heal creates a false recipient; Words supplies a lure location. A direct
special could project a false opponent near the impact, subject to safe placement.

The boss turns, approaches or commits an attack at the illusion's location. Adds
chase/strike the double. A lone boss is still deceived: no adds or healing deficit
are required. The attack does normal geometry and damage, so allies standing by
the illusion remain at risk. Existing telegraphs cannot rotate or jump to the
double after commitment. Untargeted attacks do not consume the lure, and an
accepted aim point persists until that attack resolves.

This is stronger illusionism and a good Mantle direction. It requires a real
non-player target representation, rather than an invulnerable fake Player:
phantoms must not count toward alive-party size, threat scores, healing targets,
revival, collisions or victory conditions. Explicit taunt priority, random targets,
projectiles and expiry need consistent rules. It should remain a separate
prototype/alternative, not a hidden second half of the initial fear patch.

## Larger alternative: Stolen Allegiance

A short charm can make an add turn on its own side. This is worth considering,
but not sufficient as the subclass core in a boss game: solo encounters must have
an actual interaction too. Charming a boss into attacking a summoned false enemy
would effectively introduce False Quarry plus extra allegiance rules. Turning a
boss into a party member or stopping its attacks through passive friendliness
risks replacing the encounter outright.

Real conversion needs enemy-on-enemy target selection, damage attribution, faction
checks for areas/projectiles, ownership and restoration after expiry. Do not call
a decoy or stun "conversion". Revisit this as a focused future skill/branch once
perception targets exist and its lone-boss behavior is designed explicitly.

## Feasibility and recommendation

Code inspection: `world.ts:updateBoss` moves/decides during idle and moves during
recovery; wind-ups lock aim/target position. `bossMove` handles approach/kiting;
`handleBlink` independently chooses nearby players. `updateAdds` separately
chases the nearest living Player. Fear must integrate with each actual decision
path, not merely add a buff. Threat functions and several ability execution paths
expect Player targets; some projectiles look up a player again at release. An
illusion needs these paths generalized consistently. Existing generic player
damage/mitigation mechanics do not provide either behavior.

Recommend **Private Nightmare as one bounded first prototype**, with attack,
healing, Mantle and Words as placements of the same behavioral mechanic. Test a
melee boss, ranged boss, obstacle/boundary, root interaction, adds, twin bosses
and an ally trying to remain in melee. Verify actual movement and unchanged
committed telegraphs before tuning durations, redesigning grands or publishing.
If fear's displacement undermines co-op more than it creates useful choices,
evaluate False Quarry next; do not automatically retreat to damage/mitigation.

The owner has requested reconsideration/planning, not approved this specific
revised implementation. Keep the discussion focused on behavioral direction;
the agent should own routine numbers, state design, tests and implementation
after the direction is settled.
