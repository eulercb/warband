# Upgrade and skill design review gate

Apply this review to every class cohort before implementation and again against
the resolved runtime kit before delivery. The Rogue/Warlock follow-up showed why
functional fields and complete slots alone do not establish build diversity.

## Review the receiving skill, not the list of upgrade names

For each changed skill, list its base behavior, ordinary/Honed boons, individual
grand and both identity choices together. Name the player's new decision at each
layer: setup versus spending, positioning, target selection, timing, coverage,
resource use, party protection or risk. If a reward only repeats an existing
binary mechanic on the same recipient, revise it. More sources of the same flag
are not automatically additional value.

A mechanic may fit several genuinely different skills. Following Hex and following
a dread curse can have different payoffs; giving Hex the same following flag from
both a skill grand and its identity wastes an opportunity. Likewise, changing a
renamed nova's numbers does not distinguish it from another self-centered nova.
Compare delivery, preparation, payoff, counterplay and the sequence a player uses.

## Required review table

| Question                             | Evidence required                                                                                                                                               |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What action changes?                 | One concrete before/after combat sequence; numerical growth can remain where useful, but is not labeled a new playstyle.                                        |
| Does it still add value?             | Compare base, ordinary, grand, identity and their legal combinations. Record the marginal payoff with the related common boon already owned.                    |
| Is the setup available?              | Actual starting kit and every possible first subclass pick against one boss. No assumed adds, rare pair, unavailable resource or nonexistent input.             |
| Is a similar skill already present?  | Compare the whole class, both subclasses, copied skills and recent cohorts; explain a useful overlap or redesign the clone.                                     |
| Does the fantasy match targeting?    | Classify physical ground, aerial/mental effect, aim, flight, obstacles and real recipients explicitly. Visual zone kind alone is not a targeting rule.          |
| Is the effect visible and explained? | Actual center/range, readiness, successful payoff and clear descriptions. Long readouts belong behind accessible details, not on every card at once.            |
| Can it fail safely?                  | Misses, zero damage, immunity, no eligible target, overkill, downing, class changes, protected recovery and ownership isolation.                                |
| Does synthesis preserve it honestly? | Actual Forge synthesis as well as decompose/recompose; fitting, value, scaling, caps and wording. A field carried outside the component budget is insufficient. |
| Does the fallback remain playable?   | Native, copied and composed kits without the ideal partner skill. Any intentional composed variant must say what changes.                                       |

## Execution evidence

Use positive-hit provenance and shared cast tokens for once-per-cast rewards.
Supplemental damage cannot recursively generate or consume direct-hit resources.
A percentage of already-effective damage must not pass through outgoing damage
multipliers again. Party marks require owner isolation unless party benefit is
explicitly intended. Empty-target validation must not mutate targets or spend
cooldowns, preparation or cast resources.

Keep the normal cooldown/recovery and reach/area limits through content work.
Test ordinary ranks and Haste alongside grands, banked versus equipped selections,
class swaps, native/graft reclaim and first-skill bindings. Tests of isolated
registry objects do not replace an actual World cast or real selection UI.

When renaming a skill while keeping its ID, search both names and the ID in UI
selectors and production browser scripts as well as engine tests.

Record rejected overlaps and remaining uncertainties in the delivery note. Passing
checks prove specific contracts, not fun or equal class balance. Owner live testing
is the next review gate. Audit broader related skills rather than limiting the
review to examples named in feedback; defer ambiguous fantasy choices explicitly.

## Editorial delivery gate

Offers state what changes, its material condition, recipient and trade-off.
Do not append unchanged-effect reassurance (“still reaches flyers”, “bonus
remains”), generic shared-budget reminders, or internal tuning vocabulary such
as “power and footprint”. Use % and actual damage, area, count or duration.
Keep distinctions such as ground-only targeting, directional blocks, exclusive
resources and split damage when needed to make the choice accurately.

`tests/description-editorial.test.ts` checks authored upgrades, passives,
starting skills, subclass skills and generated Forge descriptions against known
regressions. Extend its narrow patterns when a recurring copy problem is found;
do not globally strip words at runtime or hide a real mechanic to satisfy it.
General recharge, geometry, barrier and grand rules belong in the expandable
Combat & upgrade rules reference. The text check cannot assess meaning: review
resolved values, changed recipients and collapsed/expanded 320px cards too.
For every changed label search all tests and scripts before delivery.

Identity review now also uses [the purpose rubric](IDENTITY_REVIEW_PLAN.md).
Record a distinct action loop for each route and explain why each rider belongs;
an offensive package and a defensive package alone do not pass this review.
