# Upgrade foundations and grand selections

Current content delivery: [Rogue/Warlock authored four-grand builds](PILOT_GRANDS.md).
Those two classes now have individual skill grands and whole-kit identities; other
classes retain the transitional catalogue described below. Next is the martial
cohort (Knight/Barbarian/Monk), followed by the remaining class cohorts and review.
Earlier counts and missing-fourth-slot statements below describe PR #134.

The owner merged/live-tested PR #133 and reports that cadence/range limits feel good.
Current delivery is [grand selections and earlier rewards](GRAND_SELECTIONS.md):
versioned per-class banks, 2/1/1 selection capacity, host validation, free between-fight
changes, earlier unlocks and a transitional legacy bridge. The fourth bucket's new
individual-skill content is not authored yet. That delivery document is authoritative
for current behavior; catalogue/count/design sections below describe the final target.
Next is Rogue/Warlock content retouching, not another selection-framework patch.

## Ordinary upgrades versus grands

Ordinary class/Honed boons add power or an optional extra interaction without
subtracting the skill's existing behavior. Simple numerical growth is welcome
when its axes fit the actual payload. Delivery conversions, exchanging ground
output for mobile output, large geometry changes and competing build identities
belong to grands. Revisit existing ordinary tradeoffs across the catalogue, not
only named examples. Retain useful work such as Searing Rebuke's proactive trigger.

The merged PR #132 correction pack:

- Deadly Poison keeps 100% ground output and adds its bounded 2s exit poison,
  one field tick per second. Grand Venom keeps its deliberate 60/40 transformation;
  it supersedes the ordinary allocation in either pick order. Same-owner strongest
  poison, three field recipients and the two-second exit gate remain.
- Remaining generic Honed text uses actual tuned fields and first-rank values:
  zone ticks, healing, travel, area or explosion radius only where those fields
  change. No projectile-width or strike promise is invented. Forge regenerates
  the simple reference against its fused skill; live owned/rolled previews remain.
  Existing custom descriptions remain and need review alongside the next recharge pass.
- Test loadout exposes eligible graft-source boons, ranks them to their real caps,
  keeps them through rerenders and removes orphan followups when dropping a graft.
  Non-replacing styles cycle to their actual caps instead of being boolean toggles.
  Replacing picks visibly name the displaced skill. Existing eligibility and one
  replacement per slot remain. No new graft is invented.

That correction did not change cooldown values, generic Haste, reward progression,
grand limits or the grand bank. The old pilot benchmark is historical; do not
claim its ordinary Vial damage figures describe this additive revision. The
regenerated inventory records current deltas.

## Recharge and range: implemented foundation

See [the delivery policy and test evidence](CADENCE_AND_RANGE.md). The owner
explicitly revised the original proposal: **generic Haste counts toward the final
4s special floor**. Persistent effects normally have a 2s recovery gap, with
consumable/stance exceptions documented there. Ordinary recharge uses a shared
native-reference budget; refunds cannot bypass the final protected window.

The generated [current recharge audit](RECHARGE_AUDIT.json) includes generic Haste:
6,144 observations / 2,112 deduplicated profiles. The previous no-Haste audit and
sub-second Shadowstep example were pre-fix evidence, not current gameplay values.

## Approved grand catalogue and four active slots

**Owner decision confirmed:** four equipped grands **per class**, only the active
class's selection applies. Earned choices and saved selections remain available
for other owned classes; switching class does not destroy them.

Owner-approved active categories (capacity implemented; content migration ongoing):

| Category                | Equipped per class | Identity                                               |
| ----------------------- | -----------------: | ------------------------------------------------------ |
| Base-skill grand        |                  2 | Different occupied base skills, including basic attack |
| Subclass-skill grand    |                  1 | One of the two equipped subclass skills                |
| Subclass identity grand |                  1 | One of that subclass's two competing identities        |

Two subclass identity options should change the whole class loop, including base
skills where appropriate, rather than merely amplify the same two specials again.
A subclass-skill grand owns one specific skill. A basic-attack grand must not
become mandatory through overwhelming unconditional DPS; compare its opportunity
cost against taking two active-skill grands. Ordinary Honed upgrades remain
compatible with either grand route. Avoid loadouts requiring unavailable skills,
adds, kill chains or several rare ingredients to function against one boss.

### Counting the options

Per complete class catalogue, **including both four-skill subclasses**:

| Native category                           | Today |                                                    Proposed |
| ----------------------------------------- | ----: | ----------------------------------------------------------: |
| Whole-class grands                        |     2 | 0 separate: fold useful designs into skill/identity choices |
| Base-skill grands (basic + three actives) |     8 |                                                           4 |
| Subclass identity grands                  |     4 |                                                           4 |
| Individual subclass-skill grands          |     0 |                                                           8 |
| Total                                     |    14 |                                                          16 |

Thus **+2 per full class**, or +24 across 12 classes: native grands 168 → 192.
With today's 14 separate graft grands provisionally retained, total catalogue
182 → 206. This is not +2 for each selected class/subclass pair: restricted to
one chosen subclass, the potential native pool is 12 → 10; with only two subclass
skills bound, just two of its four skill grands are eligible. If basic attacks
were excluded, the whole-class increase would instead be +1 per class. Including
basics preserves existing basic-focused builds and matches the owner's +2 estimate.

Retiring whole-class entries means redesign/mapping, not silently deleting owned
power. Preserve their best ideas in the new authored capstones, document replacements
and version the migration. Keep legacy stable IDs or explicit aliases while needed.
Do not let old and replacement effects both replay.

### Grafts and styles

A grand for a borrowed base-slot skill should consume one of the **two base-skill
slots** of the active class, at most one grand per occupied skill. Do not create
free fifth/sixth slots. Its source identity remains welded to the borrowed skill,
not the donor's passive. Reclaim stashes that skill's grand choice and restores
only a valid native selection; it never transfers the effect to the replacement.
Existing two graft alternatives can remain banked competing choices until reviewed.
The final graft catalogue count is therefore provisional, not a promise of 206.
Non-replacing styles are separate ordinary wild picks today; review their tradeoffs
and caps explicitly instead of treating them as skill grafts or extra grand slots.

## Ownership, activation and replacements

Separate **earned options**, **equipped selections by class**, and **ordered normal
upgrade history**. Do not implement the cap as offer filtering alone: the replay,
host validator, stats rebuild, subclass bindings, bot presets, UI, room pads,
network state and test editor must agree. Existing classTables/classCooldowns help,
but player-wide stat grands cannot remain applied from every inactive class.

Use one pure selection validator/reducer for menu and walkable choices. Enforce
2/1/1, eligibility, source skill occupancy and one subclass choice on the host.
Version persisted/network loadouts, preserve owned legacy choices as a bank where
possible, and show any migration outcome. Test late joins, old saves and invalid
or duplicate selections. Keep an explicit recoverable menu path on mobile.

Changes are free between fights, **not during combat**. Replacing a selected grand
must remove its old effect before adding the new one, without spending a new normal
boon. Show what is lost and gained; never silently evict a different skill's grand.
Keep class swaps from refreshing charges, healing, resetting counters or granting
an inactive class's aura. Preserve HP proportion/state safely during active stat
rebuild and test closed swap cycles for free-healing exploits.

Recommended lifecycle detail for review: already committed projectiles/zones finish
with their cast-time payload; inactive grands stop generating new passive riders,
readiness or auras. Cancelling every projectile on class swap would be disruptive.
If the owner wants stricter cancellation, make it explicit and test it separately.

## Acquisition and pace

Recommend granting new **banked alternatives after gauntlets**, with free reselection
of already earned choices in between-boss reward rooms. Avoid random per-boss
replacement offers competing with ordinary growth; that makes fixing a build
another RNG gate. At a full bucket, choose the outgoing grand explicitly and preview
the result. Menus and walkable interactions use the same validated transaction.

Current single-class progression first offers a grand after the third five-boss
clear (15 bosses), then potentially fills four picks by 30 bosses. Multiclass can
delay it. Four slots alone do not make builds reachable earlier. Review an earlier
first grand alongside skill unlocks as a separate pacing decision, not a silent
reward-economy change in this correction. Offer a viable skip/fallback if no banked
choice can legally equip; reaching a full set must never block advancement. The difficulty estimator must value
only equipped active effects, never every banked grand. Check late-gauntlet expected
growth against the new four-grand ceiling: ordinary upgrades still progress, but
unlocking another alternative is not another simultaneous power increase. Do not
leave boss growth assuming the former accumulation model.

## Original rollout and review gates (historical sequence)

1. **This correction:** additive ordinary Vial, meaningful Honed wording, complete
   graft/style test-loadout controls, current catalogue/recharge evidence.
2. **Next: recharge foundations:** catalogue-wide numeric and rider pass, leaving
   generic Haste intact. Reassess the pilot's Honed Coated Blade tempo here too.
3. **Grand infrastructure:** per-class 2/1/1 selections/bank, authoritative validation,
   swaps/migration and test editor, using a small existing set before content expansion.
4. **Rogue/Warlock grand pilot:** one option for each base/subclass skill, two distinct
   subclass identities, migrate redundant/whole-class entries, live-test availability.
5. **Grouped rollout:** Knight/Barbarian/Monk; Ranger/Druid; Mage/Sorcerer;
   Cleric/Paladin/Bard, combined only where review size remains manageable.
6. **Whole-system review:** solo/2/4, real input, early and late offers, variance/Forge,
   class swaps, saved choices, graft reclaim, protection uptime and mobile fallback.

Expanded scope means roughly **six to eight further implementation PRs after this
correction**, including recharge, infrastructure, pilot, two-to-four content cohorts
and a final system review. It replaces the earlier two-to-four rollout estimate.
There are 96 new individual subclass-skill grands to design; a numerical placeholder
for all of them would repeat the generic-upgrade problem. Keep the pace by reusing
validated mechanisms and reviewing distinct roles before writing each cohort.

Review each design against actual slots/cooldowns, solo viability, additive ordinary
behavior, grand opportunity cost, visible effect, bounded ownership/procs, replay,
text/runtime agreement and an accessible early fallback. Separate an automated gate
from live feel: passing tests cannot prove deliberate timing or fun.

**Review before grand implementation:** include basic attacks; retire/fold the two
whole-class grands; make graft grands share base-slot capacity; free bank swaps
between fights, new alternatives at gauntlets; agree how earlier grand access and
committed effects across class swaps should work. Four-per-class is already decided.

## Approved implementation sequence and pacing

1. **Grand framework and earlier rewards:** separate banked ownership from active
   2/1/1 selections; migrate legacy history, validate on the host, support menus,
   walkable pads, bots and test editor. Only active class selections apply. Include
   basic attacks and grafts in the two base-skill slots. Fold whole-class grands
   into authored skill/identity choices, preserving useful ideas and migration.
2. **Pilot retouch:** revisit Rogue/Warlock against those rules and the new cadence.
   Do not treat the merged pilots as exempt from the wider review.
3. **Remaining class cohorts:** redesign ordinary upgrades and grands on this stable
   framework, grouped by shared systems; then do a cross-class balance/readability
   check. Estimate roughly six to eight implementation PRs from this foundation,
   adjusting cohort size after the framework is verified rather than promising a
   fixed count.

The owner approved earlier grand offers and delegated pacing. Proposed framework
implementation: one grand opportunity at each 5-boss clear, alongside—not replacing—
existing subclass progression. A focused class can fill four slots by clear 20.
Allocate each opportunity among owned classes, not four free unlocks for every class.
Bank earned choices and allow free valid swaps between fights. Verify run reward
frequency, eligibility and fallback before finalizing these thresholds; this patch
does not change reward generation.

New grands may introduce class-specific mechanics when they produce a visible,
reliable payoff with the real equipped kit. Examples worth prototyping include a
short-lived mobile curse relay and a basic-fed spell charge; these are directions,
not authored promises. Prefer mechanics usable against a lone boss, with explicit
ownership, bounded procs, no recursive triggering and understandable mobile input.
Avoid requiring two rare grands or unavailable delivery types to start working.
Each design review should prove a solo early-run fallback, an alternative build,
interaction with base/subclass skills, and a clear tradeoff before implementation.
