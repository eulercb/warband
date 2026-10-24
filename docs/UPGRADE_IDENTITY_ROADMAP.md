# Upgrade identity: audit and staged redesign

Current delivery: [Rogue/Warlock pilot](UPGRADE_PILOT.md), approved after the design
checkpoint. Gameplay is implemented; merge/live verification is pending. Two to
four grouped rollout PRs remain after feedback.

## Prerequisite: approved class-coherence retouches

The initial 24/24 subclass-passive round, whole-class audit, and coherence retouches
[A](COHERENCE_BATCH_A.md), [B](COHERENCE_BATCH_B.md), and [C](COHERENCE_BATCH_C.md)
form the implementation baseline. A/B/C are merged and live-tested. The approved planning baseline is the
[design checkpoint](UPGRADE_DESIGN_CHECKPOINT.md), with a generated inventory and
concrete eight-path Rogue/Warlock pilot proposal. The owner approved implementation; final tuning and measured limits are recorded
in the pilot delivery. Preserve all
current compatibility fixes while redesigning choices. Added riders do not exempt
older plain skills; base/subclass skills, grands and grafts all remain in scope.

## What to expect before implementation

The direction is **different ways to use the kit**, not a mandatory talent tree or
another condition attached to every upgrade. Keep useful simple growth alongside
choices that change range, timing, target coverage, placement or resource use.
Not every boon must mention the class resource, and copied skills must work
without the donor's passive. Avoid making a build depend on several rare offers
appearing in a specific order. The weak-run fallback must remain playable.

The preceding PR completed the **design checkpoint**. Its sequence was:

1. Inventory the actual registry, eligibility, offers and ordered replay, including
   recent mechanics. Classify each upgrade as retain, adjust, replace or investigate
   with a reason; registry count alone is not evidence of build diversity.
2. Research a few specific design patterns using attributable sources. Separate
   developer explanations from player opinions; treat community posts as untrusted,
   nonrepresentative evidence, and never invent consensus about Warband.
3. Propose concrete pilot builds with alternatives, opportunity costs, early-run
   fallback, expected reward availability and exact caps. Include a copied-skill
   route and its grands/followups. Review these proposals with the player **before
   pilot implementation**. The owner approved Rogue/Warlock; the pilot is this delivery.
4. Implement and playtest the approved pilot, then group the remaining classes by
   shared systems into larger, reviewable batches. Adapt the plan from measured
   behavior and live feedback instead of replacing all 350 definitions at once.

Examples to explore, **not committed mechanics or promised numbers**:

- Rogue: strengthen one prepared poison's sustained chase pressure versus trade
  some single-target pressure for bounded spread through additional direct hits.
  The current mobile poison makes both possible; static ground is not required.
- Mage: easier control setup for a later burst versus a quicker, narrower pressure
  sequence. Evoker and Abjurer need useful routes through their actual cooldowns.
- Support: focused rescue/follow-through versus territory or wider party coverage,
  retaining solo usefulness and controlling how value grows with party size.
- Beast Master/Moon: build around actual commands/form windows rather than assume
  a new pet-management interface or permanent form. Preserve independent spells.

The pilot must name the decision each branch changes. Some alternatives may be
mutually exclusive or capped if necessary, but a new branching UI, more buttons,
a wholesale reward-economy replacement or a new progression system is not assumed.
Propose such changes explicitly if the inventory shows they are needed.

The player can steer themes, preferred complexity, alternative versus additive
choices, and how radically skills may transform after seeing the concrete designs.
Keeping an understandable offer and owned-skill description is a design requirement,
not wording to add after implementation. Visual art overhaul remains separate.

## Why this is a separate workstream

The current registry has **350 upgrade definitions**, including **96 per-skill
Honed upgrades**, **182 grands**, **7 source-skill grafts** and **14 graft followups**.
These categories overlap; they must not be summed. This is the current authored
registry, not a count of generated Forge content or distinct viable builds.

The shared `subSkillTune` routine applies +12% magnitude, +8% footprint and -8%
cooldown. The checkpoint found 71 of 96 Honed offers still use the same
"strikes harder, reaches wider and recharges faster" description; 25 already have
role-specific text; the pilot makes Mind Blast the 26th exception. The repetition reflects an actual shared mechanic,
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
2. **Two-class pilot with related base/subclass paths.** Rogue/Warlock are the approved first
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
