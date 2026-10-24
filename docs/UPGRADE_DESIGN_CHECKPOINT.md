# Upgrade redesign: audit and pilot proposal

**Historical design checkpoint (PR #130).** The approved pilot is now implemented
in [the pilot delivery](UPGRADE_PILOT.md), which records final tuning changes and
the correction to Hexbrand eligibility. Tables below preserve the starting proposal.
Coherence A/B/C are merged and live-tested. The owner reports improved variety.
This proposal uses that stronger baseline, not an assumption that all classes
are numerically equal. The owner approved the pilot after merging this checkpoint.

## Recommendation

Pilot **Rogue and Warlock** with a small set of ordinary boons, two Honed paths,
two capstones and existing graft routes. They exercise prepared direct hits,
target-bound poison, owned curses, ground territory and different kinds of
cooldown without needing another resource, pet, form, menu or button.

Prefer **soft build routes**: independently useful choices can combine within
shared limits. Do not introduce a mutually exclusive talent tree initially.
Keep simple numerical alternatives. Broader exclusions can be proposed later if
actual stacking tests show an unmanageable combination; never silently discard
an already-owned capstone to enforce a new rule.

Alternative considered: Mage/Sorcerer first. Their control/Surge timing would be
a useful later cohort, but Evoker was just retouched and needs a stable live
baseline. Rogue/Warlock also provide existing Shadowstep/Hex grafts for checking
whether donor upgrades remain useful without donor passives. Coated Blade is not
an existing selectable graft; this plan does not invent one merely to test it.

## What the audit verifies

Reproduce with `node scripts/audit-upgrade-catalogue.mjs --check`.
See the [readable inventory](UPGRADE_INVENTORY.md) and
[complete machine-readable deltas](UPGRADE_INVENTORY.json).

| Category                   | Definitions | Initial direction                                                                            |
| -------------------------- | ----------: | -------------------------------------------------------------------------------------------- |
| Ordinary class boons       |          60 | Retain useful growth; selectively change decisions and repair stale wording.                 |
| Honed subclass-skill boons |          96 | Keep role-aware numeric fallbacks; replace generic promises and selected repeated mechanics. |
| Class grands               |          24 | Differentiate whole-kit roles from slot capstones.                                           |
| Base-skill grands          |          96 | Compare alternatives and interactions, not just combined output.                             |
| Subclass grands            |          48 | Honor actual skill kinds; do not promise leech/control on every payload.                     |
| Graft grands               |          14 | Preserve independent borrowed-skill value, reclaim and source ownership.                     |
| Skill grafts               |           7 | Retain replacement cost and source identity; review their followups.                         |
| Cross-class styles         |           5 | Check coverage and opportunity cost across eligible kits.                                    |
| Generic stat boons         |           9 | Retain accessible growth and weak-run fallback.                                              |

The first eight rows total **350**, including **182 grands**; generic boons are
separate. The script resolves **758 character-upgrade contexts**, plus generic
checks on every class, and first-application/at-cap deltas. Subclass grands are
checked with all four individual choices. Grafts/styles are checked on every
eligible native class. Every character definition changes resolved state in at
least one valid context; this does not mean every field has a live executor payoff.

The inventory's retain/adjust/replace/investigate tags are **triage**, not 350 final
redesign decisions. “Adjust” can mean description or budget work, not a new proc.
No exact equal-delta class/base-skill grand family was found in the selected native
contexts. Near overlap and generic roles remain real findings; do not turn them
into a false assertion of byte-identical implementations.

### Verified findings that change the plan

1. **Progression matters more than the catalogue count.** From an empty single-
   class loadout, a five-boss clear offers a first subclass skill, the next clear
   a second skill, then the class-or-grand step becomes available. A grand is
   therefore not a foundation for the first gauntlet; its earliest ordinary UI
   opportunity is the third clear (15 bosses), assuming no preselected progress.
   Multiclass acquisition can delay it further. `offerableGrands` is eligibility,
   not proof that the current reward screen is in its grand step. Preset loadouts
   and tests can start further along and must be reported separately.
2. **71/96 Honed descriptions still use the common harder/wider/faster sentence.**
   There are already 25 role-specific exceptions, so “all Honed text is identical”
   is outdated. Default tuning remains +12% magnitude/+8% footprint/−8% cooldown;
   a custom sentence alone is not a mechanically different upgrade.
3. **Descriptions and payloads diverge.** `cl_greaterheal` still describes 88 HP,
   but the current authored first upgrade resolves Heal **75 → 103**, plus range
   400 → 450 and rescue bonus .30 → .35. The resolved preview helps, but contradictory
   prose remains a problem. Coated Blade's canonical skill-selection blurb still
   calls it a cloud; rolled-run text regenerates, while canonical text can retain
   this old promise. Pilot descriptions need an ownership-aware resolved readout.
4. **Some broad grand promises cannot apply to every skill.** Assassin grand
   `ro_assassin_g_a` increases Coated Blade's poison **24 → 37** per second; its
   direct-strike lifesteal does not make target-bound poison leech. Keep poison's
   no-recursion rule and narrow the description instead of adding uncontrolled
   poison healing merely to match a generic sentence.
5. **Near overlap is substantial, even without exact duplicates.** Rogue's
   `ro_grand_venom` and `ro_gk_a3_a` both add 22/tick, 65 radius and 4s to Vial;
   the class grand additionally strengthens its slow. Warlock's `wa_grand_ruin`
   adds exactly the Hex package of `wa_gk_a1_a`, plus a Rebuke increase. These
   remain different definitions, but mostly ask how much output to accumulate.
6. **Ordinary graft followups are narrow and source-based.** Shadow Pact offers
   `graftup:a3:ro_vanish`; Hexbrand offers `graftup:a3:wa_hex`. Honed subclass
   upgrades are not automatically graft upgrades. All seven grafts and their
   currently available source boons/grands pass **22** sampled live → reclaim →
   re-graft replay checks in the audit. This covers one eligible recipient per
   graft and individual followups, not every combination/order.
7. **Grands are not exclusive branches today.** Eligible unowned grands can be
   accumulated, including multiple improvements to the same skill. New routes
   must be safe together unless explicit gating/migration is separately approved.

### Availability probes

Actual `rollCharChoices` calls, 2,048 seeds per row, four offers and one choice per
reward. Policy: choose an unowned target if offered, otherwise the first offer.
Current caps, hybrid substitution and eligible Honed boons remain in effect.
No rerolls, shops, multiclass, grands or assumed future IDs.

| Starting state            | Target pair (current analogues)    | Both acquired by 5 rewards | By 10 rewards |
| ------------------------- | ---------------------------------- | -------------------------: | ------------: |
| Rogue base                | Assassinate + Deadly Poison        |                     98.83% |          100% |
| Already-unlocked Assassin | Honed Coated Blade + Deadly Poison |                     91.99% |        99.85% |
| Warlock base              | Deepening Hex + Searing Rebuke     |                     98.73% |          100% |
| Already-unlocked Fiend    | Honed Fire Pit + Deepening Hex     |                     91.31% |        99.71% |

These are **current-pool seeded acquisition probes**, not player success rates,
representative random trials, guaranteed offers or predictions for new content.
The first reward cannot supply two choices. Subclass rows start already unlocked;
“five rewards” there does not mean the first five bosses of a fresh run. Adding
many offers would change these results. Prefer modifying existing IDs over
adding a dozen prerequisites and then needing pity rules to repair availability.
Do not require both targets: each proposed first pick must work independently.

## Proposed pilot: eight mechanical upgrade paths

Numbers below are **starting hypotheses**, not implemented or measured balance.
Keep existing IDs and caps; keep replaying every owned occurrence. First-stack
new rules are not re-added per stack; repeat picks improve their bounded numeric
budget. Test stacks 0/1/3/5, not only the exciting first effect.

### Rogue: deliberate ambush versus poison pursuit

| Existing ID                                     | Proposed job                                                         | Starting contract / tradeoff                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ro_assassin` — Assassinate                     | Reward a prepared connection with another positioning opportunity    | Backstab gains +12 damage/stack and −10% cooldown/stack instead of +24/−22%; retain +.1 crit multiplier/stack. A **prepared positive Backstab hit** removes 1s from running Shadowstep cooldown, once per complete cast and per 4s. Refund does not grow with stacks; a ready Shadowstep, miss or immunity preserves the trigger. More positional tempo, less raw Backstab growth.                                                                                                                                                                                                |
| `ro_poison` — Deadly Poison                     | Let Vial pressure survive a moving enemy leaving it                  | Keep its current per-stack +7 tick damage/+18 radius/+1.5s duration, but move **20% of the resulting field damage** out of ground ticks. A foe that actually took damage from that field may carry a 2s poison on exit, at one post-split field tick's damage per second. Same owner's strongest poison wins: no second pool beside Coated Blade. At most three live field-tail recipients per owner; at most one exit application per target per 2s. Less stationary field pressure, more pursuit value.                                                                         |
| `subup_ro_assassin_poison` — Honed Coated Blade | Offer a longer chase window instead of another identical tune        | At stack n≥1: duration `4 + min(2,n)` seconds; tick damage begins at 24 and grows ×1.12 for each pick after the first; cooldown begins at 9s and grows ×.96 after the first. Keep 6s coating preparation, precision's +50%, target pool and zero/immune/miss preservation. First pick: **24×5/9** theoretical poison output versus current Honed **27×4/8.28**; similar per-cycle raw output, slower delivery. Benchmark every stack and rounding before committing.                                                                                                              |
| `ro_grand_venom` — Grand Venom                  | Convert part of Vial's damage into a poison that follows its victims | Retain the current +22 tick magnitude, +4s field duration, +65 radius and improved slow, but split the resulting field output **60% direct ground ticks / 40% target poison**, poison lingering 2s after the last effective tick. No double-credit: for one eligible recipient, stationary total before rounding remains the original field output; targets beyond the three-recipient budget retain only the ground share. Share the same strongest owner-poison pool and three-recipient field budget. Existing `ro_gk_a3_a` stays the straightforward full-ground alternative. |

**Route A — patient ambush.** Base Shadowstep → prepared Backstab already works.
Assassinate changes how soon another escape can be available after a connection.
With _any_ Assassin first pick this base route still works. If Coated Blade is
chosen, coating → Shadowstep → prepared Backstab applies the stronger following
poison; its Honed path changes damage timing. No grand is required.

**Route B — mobile toxin.** Place Vial where a boss/add group will cross it, then
continue moving and attacking when victims leave. Deadly Poison works with the
base kit before any subclass unlock. Later Grand Venom shifts more of its damage
into following poison. Coated Blade is an optional stronger single-target tool;
it must not be overwritten by a weaker Vial tail. On one stationary boss, the
simpler ground-output grand remains competitive.

**Stacking policy:** both routes can coexist. A Vial tail and coating do not each
start an independent same-owner DoT. Different owners remain separate, with
bounded targets and attribution. At Grand Venom, use the 60/40 split instead of
also applying the common boon's 80% field split: one resolved allocation rule,
not sequential duplicate damage reductions. Duration/cooldown growth from common
boons remains. Stronger Coated poison can suppress the weaker field-poison share;
this is a disclosed opportunity cost of combining both damage families.

**Paper example, not a combat result:** at one Deadly Poison stack, a target
remaining for the full 5.5s gets 20% less field damage than today's upgrade before
rounding. Leaving after 1s gets about 28.8 field + 28.8 tail damage instead of
36 field damage. Actual .5s/1s tick alignment, expiry, curse/damage multipliers,
partial HP, target movement and strongest-pool conflicts must be tested.

### Warlock: persistent marks versus responsive retaliation

| Existing ID                             | Proposed job                                                         | Starting contract / tradeoff                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wa_hex` — Deepening Hex                | Preserve a useful curse/control window after enemies leave territory | Per-stack tick increase +4 (currently +6), duration +1s (currently +1.5), radius +12u (currently +18), retain +1 percentage point owner vulnerability. Set slow/hindrance linger to `min(4,1.5+.5n)` seconds at n≥1, intentionally extending the Hex mark too under current rules. This means **2s at first pick**, not a hidden curse-only duration. Lower raw field growth for a wider pursuit/control window.                                                                                                                                         |
| `wa_rebuke` — Searing Rebuke            | Give the existing retaliation a proactive route                      | Retain +12 damage/+25 radius per stack. After the cast completes, the armed one-use retaliation may also discharge on the owner's **next positive direct hit**, basics included, bursting at that victim. Taking damage keeps the existing caster-centered route. Whichever occurs first consumes the same readiness before resolving secondary damage. No extra charge per target, stack or pellet; ticks, poison, misses and immunity cannot discharge it. Current 3s window and 40%-of-Rebuke damage budget remain. No curse or subclass is required. |
| `subup_wa_goo_blast` — Honed Mind Blast | Extend marked-target disruption rather than invent another resource  | Retain current Honed tuning; increase the existing `cursePayoff` duration from 3s by 1s per pick, capped at 5s. Applies only to the current personally cursed-target payoff; no extra hard interruption. Unmarked hits keep their ordinary damage. Later repeats still improve the numeric tune. Compare practical control uptime against already stronger Hex/dread effects rather than adding every weakening multiplier.                                                                                                                              |
| `wa_grand_ruin` — Word of Ruin          | Make Hex travel briefly instead of only enlarging it                 | Keep +22 Hex tick damage/+4s duration and the current Rebuke +40 damage/+30 radius. Exchange the +65 Hex radius for up to **3s following the first valid damaged enemy**, then anchor for the rest of the field's lifetime. Acquire once: nearest enemy to the field center, ties by ID. If it dies/disappears, anchor at the last valid position; never jump to another foe. Ground/flight and obstacle rules remain those of a ground zone. `wa_gk_a1_a` remains the larger stationary-field alternative.                                              |

**Route A — persistent hunter.** Hex → basics already applies personal curse
pressure and sustains Fiend. Deepening Hex gives a longer window as a boss leaves;
a first Fiend pick need not be Fire Pit. Later following Hex trades coverage for
mobile uptime. Optional Fire Pit/Honed Fire Pit retain a simple damage/coverage
alternative and their independent searing mark; not every Honed needs a new rule.

**Route B — active retort.** Cast Rebuke close when possible, then land a direct
hit during readiness to send the held retaliation to that victim, or preserve it
for incoming damage. A solo boss supplies a target; no kill, add wave, rare skill
pair or extra menu is needed. Hex and GoO Mind Blast can extend pressure/control,
but neither is required to activate the retort. Zone damage cannot consume it.

**Alternative rejected for the pilot:** making Rebuke wait for three curse types,
spending several specials, or an add death. Those routes repeat the unavailable-
setup problem observed with early Spell Weave. Automatic permanent following
Hex was also rejected: the brief follow/anchor rhythm preserves placement and
limits overlap rather than converting territory into an always-on debuff.

## Scope and borrowed skills

Eight IDs above are the proposed mechanical pilot. Add focused offer/owned-text
repairs for those IDs and their related grands, including Assassin's direct-only
leech promise and Coated Blade's canonical blurb. Retain other useful numerical
boons initially; no entire 27-definition class catalogue is promised in one PR.

Exercise **Shadow Pact** (`hy_shadowpact`) on a Knight and **Hexbrand**
(`hy_hexbrand`) on a Ranger, their existing source followups and both graft grands.
Shadowstep still provides escape/healing without Rogue precision consumers.
Hexbrand inherits the proposed `wa_hex` linger through its source boon, without
needing Soul Ember/Dread Insight. Their graft grands remain mobility/heal or
pressure/coverage alternatives; preserve them first rather than add another
borrowed-only resource. A grand affecting native Hex must not leak onto a graft
or a reclaimed native slot. Preserve the stashed skill's own progress on re-graft.

Do not assume ordinary boons automatically tune bound subclass slots, that class
grands receive bound skills, or that subclass Honed boons belong to base-skill
grafts. The current replay paths deliberately separate them. Interactions that
span these boundaries must be carried by an explicit authored payload or hook.

## Engine work required — not assumed to exist

- Generalize the current target-bound poison application to accept an authored
  zone payload while preserving strongest-pool, owner and no-recursion rules.
  Track bounded eligible exits; a hazard/decorative zone is never an enemy target.
- Add a once-per-cast prepared-hit refund route. Direct-hit provenance must carry
  the relevant ability/prepared identity; generic damage alone is insufficient.
- Share consumption of reactive/proactive Rebuke readiness and clear it before a
  supplemental burst. A burst cannot consume/rearm itself or echo another retort.
- Add optional bounded following-target state to ground zones, with last-position
  fallback and explicit host ownership. Keep existing player movement/collision,
  ground targeting and pets unchanged. No target scans after acquisition.
- Give all new payloads explicit Forge fit/value/scale/cap/refresh and description
  support. Following-zone and poison allocation are authored mechanics, not fields
  a generic multiplier may silently invent or drop.

None of these hooks is implemented or simulated as if it already existed here.
The proposal is feasible using current damage, zone, poison, guard and buff
systems, but following-zone/exit-tracking prototypes are the largest uncertainty.

## Validation and budget before delivery

1. Native/copy/composed fixtures at stacks 0/1/3/5; fresh and upgraded HP/damage/
   haste; every individual relevant first subclass choice. Include real keyboard
   and mobile input sequences at **resolved cooldowns**: Rogue Backstab 10s,
   Shadowstep 6s, Coated Blade 9s; Warlock Hex 11s, Rebuke 18s, Mind Blast 5s.
2. Compare old/new fixed 30s encounters: stationary single boss, deterministic
   movement crossing a field edge, ground/flight, zero/immune/dead foes, add group,
   solo and 2/4-player ownership. Measure effective damage, poison uptime, refunded
   seconds actually usable, useful control time, damage avoided, and overkill.
   Then run normal adaptive encounters separately; no tier/fun claim from unit tests.
3. Misses, failed control, no eligible targets and already-ready cooldowns cannot
   spend the refund gate. One refund/retort per cast across multi-hit victims.
   No proc loops; no applied-poison re-crit; no arbitrary ally-count multiplier.
4. Check max-duration/cooldown floors and hard caps with repeated Honed/grands.
   Test both orderings, simultaneous sources, class swaps, down/revive, rooms,
   graft replacement/reclaim/re-seat and seeded Forge/procedural modes. Recompute
   descriptions from effective payloads with explicit recipients, limits and costs.
5. Keep the adaptive controller and coefficients unchanged for the pilot. Price
   new damage allocation once, including conservative lingering opportunity;
   account for capped conditional refunds instead of treating every new field as
   free utility. Compare both `heroPowerRatio` and effective encounter output.
   A stationary ground/poison split is a transfer, not two full damage budgets.
   The target is comparable unprepared value and a modest situational gain,
   not universal numerical equality or automatic cancellation of player progress.

Prototype the two alternatives in fixtures before expanding content. If the
following-zone prototype forces a new subsystem or unstable ownership, split it
from the rest of the pilot and keep the stationary grand until that prototype
passes. Do not quietly replace it with another damage number and call the role done.

## Following cohorts and review gate

| Cohort                    | Directions to test later                                                           | Main constraint                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Knight / Barbarian / Monk | Counter conversion, distinct Momentum expenditure and Flow routing                 | No permanent block/refund loops; skills still work without a perfect pair.          |
| Ranger / Druid            | Piercing lines, close disengagement, wolf ward/commands, form versus spell windows | Use the actual companion/form API; no mandatory pet micromanagement.                |
| Mage / Sorcerer           | Control setup versus available burst; Surge routing and defensive opportunity cost | Include basics and real cooldowns; avoid another impossible setup passive.          |
| Cleric / Paladin / Bard   | Focused rescue, shared protection, territory, aura coverage and verse tempo        | Solo usefulness, bounded party scaling, clear effective-heal versus overheal rules. |

These are cohort hypotheses, not final skill designs. All class/base/subclass,
grand/graft and generic interactions remain in the inventory. Preserve successful
late kits rather than force identical resource interactions everywhere.

**Recommended approval:** the eight-path Rogue/Warlock pilot, soft combinable
routes, stable IDs/caps and a one-time bounded-follow prototype. No mandatory
branch menu, reward-economy rewrite, new graft, class resource or art overhaul.

After this design PR, allow **one pilot plus two to four rollout PRs** (roughly
3–5 implementation PRs), with one extra only if the prototype genuinely needs a
split. Review the pilot's actual availability, numbers and mobile usability before
locking the next cohorts. The owner can redirect the poison/territory tradeoffs
or prefer another pair before implementation; this checkpoint is that opportunity.

## Milestone assessment and evidence limits

The owner's live feedback supports improved variety in the coherence round. My
assessment is that the strongest next opportunity is making rewards express
those existing roles, not inventing another mechanic for every class. Current
Honed tuning often keeps new payloads functional, but it does little to change
why a player chooses one reward over another. More concepts would not necessarily
help; accessible first picks and visible tradeoffs should lead.

Mechanical comparisons and their limitations are in
[the retrieved-source review](UPGRADE_RESEARCH.md). A community Hades catalogue
supports geometry/tempo tradeoffs and explicit prerequisites; a community RoR2
API documents proc-chain tracking. Neither supplies Warband balance numbers or
representative player feedback. Steam/wiki requests remained proxy-blocked; no
Steam/Reddit sentiment or reception prediction is claimed.

This inventory is broad but not exhaustive execution proof. It probes individual
native/at-cap mutations, selected graft replay and current reward acquisition.
It does not certify every late-run combination, all Forge seeds, inactive-class
replay permutations or the unimplemented pilot. Gameplay implementation and live
balance evaluation belong to the next step after review.
