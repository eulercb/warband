# First class identity milestone: assessment and next review

This assessment accompanies Moon Aspect, the 24th defining subclass passive.
It is grounded in the code, engine/input/browser checks, screenshots and the
player's reported live tests. It is a design assessment, not a human enjoyment
study, a measured tier list or evidence of market demand.

## My assessment

Warband has a coherent foundation: quick browser access, cooperative boss fights,
walkable choices, and a large set of recognizable fantasy roles. The strongest
recent changes make a readable promise and deliver it through actions players
already perform: command a wolf by hitting its victim, protect an actual recipient,
move an aura with its owner, or turn control into an opportunity. Those are better
foundations for builds than several differently named damage circles.

The game still looks and communicates like a prototype. A humanoid or gem-like
body can be technically distinct without convincingly representing a particular
class or boss. Different ability effects often share geometry and differ mostly
by color; terrain and floor treatment do not always explain what is decorative,
hazardous, passable or interactive. The wolf shows that a few deliberate silhouette
features can do more than adding detail everywhere. Visual priorities should be
silhouette, animation timing and effect meaning before sheer ornament or texture.
We should establish a consistent visual language before commissioning/replacing
the whole asset set, or expensive new art may preserve the same confusion.

Mechanically, breadth has outpaced consistency. Twenty-four passives and many
skills do not necessarily mean many comparably useful decisions. Some older
payoffs are largely numerical, while newer ones visibly change behavior. That is
a reason to compare agency, opportunity cost and feedback, not a reason to give
every class a pet, extra resource or equally elaborate rules. Simpler classes
can be excellent when their decisions are strong and their actions feel precise.

I would prioritize coherence/readability and ordinary-run pacing over another
large expansion of mechanics. Claims that one class is numerically weak need
fixed-encounter comparisons and live playtest evidence; plausible-looking numbers
and a passing unit suite cannot establish fun, balance or visual comprehension.
Adaptive difficulty makes uncontrolled comparisons especially misleading.

## Community evidence: explicitly unresolved

There is no representative external player study of this Warband build here.
On 2026-10-18 I attempted to retrieve English Steam review samples for Ravenswatch
(app 2071280) and Ember Knights (1135230), comparable cooperative action games.
The environment rejected the Steam connections with a proxy 403 before reviews
were retrieved. No community opinions, quotations or consensus are inferred from
those attempts. These identifiers document the attempted research, not sources
supporting a conclusion.

A useful later research pass should combine attributable, dated public feedback
from comparable games with actual Warband novice tests. Record sample size,
platform, playtime, positive/negative selection and limitations. Treat discussions
of readability, controls, class identity, progression and difficulty separately;
never turn a few selected reviews into "the community thinks" or extrapolate a
competitor's reception into a prediction about Warband.

For Warband, ask fresh desktop and phone players to identify a boss, explain one
ability after using it, choose an upgrade, and describe why a hit damaged or
protected them. Observe hesitation, accidental inputs, missing feedback and
abandoned runs, alongside subjective enjoyment. Include solo and small-party
sessions; existing experienced testers cannot substitute for first-time players.

## Cross-class review: the next workstream

Inventory all 12 base classes, 24 subclasses and their active/passive skills.
Cover all 48 base skill slots (including basics) and all 96 subclass skills;
counts are authored slots, not the number of possible builds. Include upgrade,
grand and graft compatibility as dependencies, without redesigning those trees
before agreeing on the baseline.

For each class/subclass, record:

- Its intended fantasy and two or three distinct combat decisions.
- A practical solo base-kit loop at default input cadence and real cooldowns.
- A useful route for every individual subclass choice, not only a perfect pair.
- What each active does that its siblings do not; which passive/rider really
  changes choices and which only compensates for a weak or redundant action.
- Effective offense, sustain, protection, mobility and control in fixed encounters,
  then ordinary adaptive runs. Keep raw damage and utility roles distinct.
- What the player can actually see: source, target, range, state, expiry, benefit
  and reason a trigger failed. Assess portrait phone visibility as well as desktop.
- Native/composed/copied behavior, death/revive, swaps, co-op attribution and caps.

Classify each finding as verified bug, player-observed issue, or untested design
hypothesis. Link evidence and compare the early and late cohorts explicitly.
Prioritize few viable decisions, inaccessible triggers, misleading feedback and
repeated roles ahead of cosmetic numeric asymmetry. Warlock's earlier feedback,
Mage subclass/control coverage and Bard's explanation burden deserve examination;
they are candidates for investigation, not predetermined reworks or balance verdicts.
Revisit every plain protection/recovery action, even when a newer rider made it
more useful. Preserve successful work and avoid changing multiple class baselines
and enemy difficulty rules in the same comparison.

## Sequence and review gates

1. Complete Moon form and live-test it as its own delivery.
2. Produce a catalogue audit with evidence, an early/late comparison matrix and
   ranked retouch proposals. Explain the options before starting a broad rewrite.
3. Deliver agreed retouches in focused cohorts, provisionally two to four. Use
   concrete trigger → decision → payoff examples, evaluate two alternatives for
   major redesigns, and test feasible loadouts before implementation. Recheck
   the result against its original purpose before delivery.
4. Agree on the stronger baseline, then start the upgrade/grand/graft audit and
   branching pilot described in UPGRADE_IDENTITY_ROADMAP.md. Fix compatibility
   bugs during earlier work rather than knowingly leaving broken content.
5. Develop a separate visual direction brief and representative scene prototype:
   one hero/form, one boss, offense/heal/barrier/control effects and a readable
   floor/hazard/station set. Test it on a small phone before replacing everything.

After major milestones, provide a candid design assessment, what live tests
confirmed or contradicted, outstanding risks, roadmap changes, and a few targeted
playtest questions. Give research-backed community findings only when verifiable
sources are available. Keep independent judgment distinct from the player's own
reports and from external evidence.

The added review changes the prior estimate: one audit, perhaps two to four
retouch deliveries, and four to six upgrade deliveries imply roughly 7–11 further
PRs after Moon. The audit may reduce or expand this; visual production is not
included in that provisional count.
