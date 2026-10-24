# Upgrade foundations and grand selections

The owner merged/live-tested PR #131 and revised the design direction. This document
supersedes the pilot's ordinary-boon tradeoff policy. Grand selection below is a
proposal for review, not an implemented limit. Current delivery is the small
correction pack; the next class cohort is paused until recharge foundations are fixed.

## Ordinary upgrades versus grands

Ordinary class/Honed boons add power or an optional extra interaction without
subtracting the skill's existing behavior. Simple numerical growth is welcome
when its axes fit the actual payload. Delivery conversions, exchanging ground
output for mobile output, large geometry changes and competing build identities
belong to grands. Revisit existing ordinary tradeoffs across the catalogue, not
only named examples. Retain useful work such as Searing Rebuke's proactive trigger.

This patch:

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

No cooldown values, generic Haste, reward progression, grand limits or grand bank
are changed in this correction. The old pilot benchmark is historical; do not
claim its ordinary Vial damage figures describe this additive revision. The
regenerated inventory records current deltas.

## Recharge: priority next, across the entire catalogue

[3,072 current special-slot observations](RECHARGE_AUDIT.json) reproduce via
`node scripts/audit-recharge.mjs`. These cover every class and individual subclass
skill at rank 0/1/3/5, with/without all currently compatible native grands, and
**no generic Haste**. The data deduplicates repeated base-slot observations into 1,056 distinct slot
profiles after asserting equal values across those contexts. This is
not 3,072 unique abilities or simulated encounters. Canonical skills only; casts,
refunds and Forge need the implementation pass's separate checks.

A legal current Rogue combination takes Shadowstep from 6s to about **0.124s**.
Only basics have an engine floor (0.3s); specials use their raw reduced cooldown.
Vanish alone at five ranks gives Shadowstep about 1.008s before any grand.
Five generic Honed picks alone multiply cooldown by .92^5 ≈ .659. Vanish compounds
.7 five times, then several grands can compound again. Global class cooldown
boons and active refunds add further opportunity. This is a structural issue,
not just a bad first pick. Autofire can reduce physical mashing but does not
restore deliberate decisions; it is not the fix.

Recommended starting targets for the dedicated recharge patch, **not universal
runtime clamps**:

| Native special recharge | Ordinary upgrade direction                                                                  | Grand review                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Up to 6s                | Prefer magnitude, utility, reach, safety or capped follow-through; normally no repeated CDR | Preserve an intentional action window; avoid sub-4s specials by default                         |
| Over 6s to 12s          | Around 20% total ordinary reduction at most, not 20% on every pick                          | Trade major CDR for a clearly defined alternative; baseline target at least 6s before the grand |
| Over 12s                | Around 30% total ordinary reduction at most                                                 | Larger tempo changes may be useful, but normally keep at least 4s and an actual recovery window |

These are review bands. Pick per-skill targets after measuring mechanics, uptime,
resolved cooldown and cast time. Immunity, blocks, healing, movement and control
need different recovery budgets; do not let duration growth quietly produce
permanent protection. Rage/form stance uptime may legitimately differ from damage
immunity. Basics retain their separate continuous-attack role and current floor.

Implement reductions **before the untouched generic Haste contribution**. A blanket
final cooldown clamp would silently nerf Haste and ignore borrowed/rolled baselines.
Track each native/graft/subclass skill's reference and class-upgrade contribution
through ordered replay; cap combined ordinary/grand reductions and bounded refunds
rather than clamp the whole hero's final multiplier. Review class-wide recharge
boons too. Existing useful refunds can remain only when they cannot recreate the
spam problem. Replace excess CDR with fitting additive value, not one universal
extra-damage rider. Update custom Honed descriptions when their tuning changes.

Before delivery: table every affected skill at 0/1/3/5, each grand, combined class
boons and actual generic Haste separately; test native/graft/Forge, input repetition,
protection uptime and cast/refund gates. Show before/after examples and measured
output/control, not only cooldown numbers. Adaptive difficulty coefficients remain.

## Proposed grand catalogue and four active slots

**Owner decision confirmed:** four equipped grands **per class**, only the active
class's selection applies. Earned choices and saved selections remain available
for other owned classes; switching class does not destroy them.

Recommended active categories:

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

## Rollout and review gates

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
