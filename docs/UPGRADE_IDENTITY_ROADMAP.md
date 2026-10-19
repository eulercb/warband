# Upgrade identity: audit and staged redesign

## Prerequisite: approved class-coherence retouches

Moon Aspect is merged; the [catalogue audit and concrete retouch proposal](CLASS_COHERENCE_AUDIT.md) are complete. Approve and implement the selected retouches before broad upgrade redesign. The audit covers scaling and compatibility risks, not every upgrade replay combination.

The [milestone review gates](CLASS_MILESTONE_REVIEW.md) still apply to these
retouches. Do not design large upgrade trees against class
behavior already scheduled for revision. Keep an inventory of upgrade compatibility
issues during that review and fix breakage immediately; broad branching redesign
waits for the stronger baseline. This applies to base skills, subclass skills,
grands and grafts alike. An added passive/rider does not exempt an older active.

Batch A is merged/live-tested; [Batch B](COHERENCE_BATCH_B.md) is delivered.
Batch C remains before broad upgrade redesign. Continue fixing compatibility
with every active rework rather than postponing it.

## Why this is a separate workstream

The current registry has **350 upgrade definitions**, including **96 per-skill
Honed upgrades**, **182 grands**, **7 source-skill grafts** and **14 graft followups**.
These categories overlap; they must not be summed. This is the current authored
registry, not a count of generated Forge content or distinct viable builds.

The shared `subSkillTune` routine applies +12% magnitude, +8% footprint and -8%
cooldown. Every Honed offer uses the same "strikes harder, reaches wider and
recharges faster" description. The repetition reflects an actual shared mechanic,
not merely weak wording. Numeric growth remains useful, but this layer currently
misses many opportunities to change decisions or connect newer class interactions.

Review **all** base-skill boons, subclass Honed upgrades, class/skill/subclass grands,
graft boons and graft grands, plus how generic stat boons interact with them.
Include copied skills, multiclass use, per-run variance, upgrades after a class
swap, and Forge composition. Neither a recently reworked skill nor a functioning
numeric upgrade is automatically exempt. Preserve stable ownership and replay
behavior unless a deliberate, documented migration is necessary.

## Sequence and review checkpoints

1. **Audit and design milestone.** Begin inventory/research during the remaining
   balance/passive work; finalize each class design once its contracts settle.
   Generate an inventory from the registry and actual replay paths. For every
   upgrade, record what changes, limits, eligibility, source identity, interactions
   and whether its description matches the resolved effect. Identify dead fields,
   repeated offers, redundant choices and upgrade paths that lose new mechanics.
   Trace grands and graft followups separately; a source-skill improvement must
   not depend on owning a passive/resource that the recipient cannot access.
2. **Two-class pilot with related base/subclass paths.** Rogue/Warlock are plausible
   candidates after Fiend tuning because their defining passives already exist;
   choose the pair after the audit, not before researching its branches. Propose concrete build
   examples and compare alternatives before committing to a catalogue rewrite.
   Implement a coherent small set through ordinary boons, a capstone and a copied
   skill path. Review the design checkpoint with the player before broad rollout.
3. **Two to four further implementation batches**, grouped around shared mechanics
   and measured scope, rather than one giant patch or one patch per individual
   skill. Validate and playtest each. Companion/form-dependent upgrades follow
   their system prototypes; avoid designing against an imaginary pet/form API.

Treat this as roughly **four to six additional PRs**, including design and pilot,
not a fixed deadline. The scope may shrink if the audit finds
that existing numeric choices already serve clear roles. Continue including
necessary upgrade compatibility with each current skill rework; do not postpone
broken interactions until this future workstream.

## Research agenda for the design milestone

Compare a small set of relevant patterns before proposing the pilot: Hades weapon
hammers for changes to an action's role; Dead Cells mutations for conditional build
identity; Risk of Rain 2 for stacking/proc-chain opportunities and failure modes;
and Slay the Spire for upgrades that alter cost or tempo rather than output alone.
These are research targets, not claims that their numerical balance transfers to
Warband. Record sources and what each comparison actually supports in the design
proposal. Evaluate differences explicitly: this game has cooldown-based skills,
boss-focused encounters, co-op recipients and adaptive difficulty rather than the
same room-clearing, deck or item-economy assumptions.

Use the current engine's mechanics and actual playtest observations as constraints.
Prototype two competing sequences/builds, compare reward availability and weak-run
fallbacks, then test solo and party value before scaling the design to all classes.
New content should use the existing effect vocabulary; do not turn upgrade research
into an unrequested readability overhaul while that feedback is still being gathered.

## Design directions to investigate, not committed implementations

| Theme                 | Possible branching choice                                                     | Question to answer                                                                   |
| --------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Mage                  | Prepare control for a later burst versus spend control for immediate pressure | Does Abjurer gain multiple useful sequences without invalidating control resistance? |
| Sorcerer              | Spend Surge on safe area pressure versus retain it for a focused cast         | Can defensive and offensive sequences compete without one becoming mandatory?        |
| Rogue                 | Reliable precision preparation versus a positional/risk payoff                | Does each branch change positioning or timing instead of simply multiplying crit?    |
| Warlock               | Curse sustain versus pressure across several cursed enemies                   | Are proc cadence, damage attribution and recursion bounded?                          |
| Knight/Barbarian/Monk | Guard conversion, Momentum cadence and Flow routing                           | Does a branch create a different rhythm rather than more stacks of the same bonus?   |
| Support classes       | Focused rescue/protection versus territory or party coverage                  | Are solo use, ally count and overheal cases priced fairly?                           |
| Grafts                | Preserve a borrowed theme versus adapt it to the receiving kit                | Can the skill operate independently of an unavailable class resource/passive?        |

Broaden themes where they create distinct play, rather than forcing every upgrade
to reference the same resource. Keep some straightforward numeric upgrades for
clarity and recovery from weak builds. More conditional effects do not inherently
mean more depth; players need legible tradeoffs, useful fallback choices and a
reasonable number of concepts to track.

## Acceptance criteria

- Each proposed branch names the changed decision: range, timing, target choice,
  resource expenditure, area placement, ally coverage or risk. A renamed stat
  multiplier is not presented as a new playstyle.
- Give at least two coherent build examples per pilot class, including their
  opportunity costs and a functional baseline before any required reward appears.
- Price throughput, uptime and party scaling; cap recursive procs and multiplicative
  combinations. Explicitly check boss pacing so greater player power is not
  automatically cancelled by a changed estimate. Do not exempt all future upgrades
  from difficulty credit merely because current balance buffs retained old credit.
- Resolve descriptions from the real upgraded payload, including exact scope,
  consumption conditions and caps. Do not claim irrelevant improvements on a heal,
  movement skill or shield. Review offer text, owned-skill text and grands together.
- Test stable IDs, eligibility/exclusivity, stack caps, reward availability, class
  swaps, graft replacement/reclaim, ordered replay, seeded generation and Forge
  refresh. Ordinary, copied and composed skills must preserve their promised effects.
- Separate intentional alternatives from bugs: a branch need not interact with
  every class mechanic, but it must offer comparable value and a distinct purpose.

Readability needs further playtesting. Record observations during upgrade research,
but do not reopen its presentation work solely to accompany this plan.
