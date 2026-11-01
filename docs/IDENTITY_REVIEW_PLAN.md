# Identity review before whole-system tuning

Current execution status is tracked in [Development status](DEVELOPMENT_STATUS.md).
Calibration is complete: Moon/Evoker retained and Whispers reworked/accepted in
owner live testing. The [Rogue/Warlock review](ROGUE_WARLOCK_IDENTITY_REVIEW.md)
retains Trickster, repairs prepared coating, and leaves three identity pairs open.
Historical Whispers examples below describe the problem that prompted calibration,
not its current implementation. Authorized mature proposals proceed through the
bounded Sol high workflow; unresolved material gameplay choices need a checkpoint.

The owner accepted PR145 and requested a stronger purpose for the 48 authored
identity grands. The next whole-system review starts with playstyle identity,
before broad numerical balance, graft alternatives or acquisition/economy work.
This plan does not approve a replacement catalogue or claim that all 48 choices
need changing. The bounded Mantle/description follow-up is separate from that
larger review.

Apply the [combined-build gate](UPGRADE_REVIEW_GATE.md) throughout. Current
behavior is recorded in the [pilot](PILOT_GRANDS.md),
[martial](MARTIAL_GRANDS.md), [nature](NATURE_GRANDS.md),
[caster](CASTER_GRANDS.md), [Sorcerer follow-up](SORCERER_LUCK.md) and
[support](SUPPORT_GRANDS.md) notes; superseding follow-ups take precedence over
older tables. The [upgrade roadmap](UPGRADE_IDENTITY_ROADMAP.md) and
[class roadmap](CLASS_REVAMP_ROADMAP.md) retain historical milestones.

## What constitutes an identity

An identity is a purposeful way of using the kit. Its effects should cooperate
around an action loop that a player can describe, rather than distribute
unrelated benefits among every skill. Useful numerical growth can support that
loop; damage versus leech, shield versus damage, and different collections of
buffs do not establish distinct playstyles by themselves.

Review each subclass's two choices together, recording two concrete mechanism
axes for **each** choice:

1. **Preparation and cadence:** what action creates an opportunity, when to bank
   or spend it, and what interrupts or competes with that sequence? Examples:
   hold a prepared strike versus spend frequent connections; deliberately cross
   a threat versus hold territory; react to an enemy action versus create the
   opening yourself.
2. **Payoff routing:** where does the opportunity go, through which action and
   recipient, and what positioning or targeting does that ask of the player?
   Examples: one quarry versus a firing lane; a departure point versus arrival;
   personal follow-through versus an explicitly eligible ally; mobile territory
   versus an anchored window.

Replace these examples with the actual subclass mechanisms. Do not label the
axes offense/defense, aggressive/safe, DPS/support, or strong/weak. Neither more
conditions nor a compulsory class-resource hook automatically improves a design.
The two identities must produce distinguishable combat sequences and an
understandable opportunity cost. At least one decision must change materially;
both axes must explain coherent player choices rather than list statistics.

One short review sheet per subclass is enough initially:

| Field                 | Required content                                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Pair and role         | Two one-sentence promises, two mechanism axes per identity, and why the player chooses between them.                         |
| Actual loop           | Before/after sequence using starting abilities plus each possible first subclass skill; name setup, spend and positioning.   |
| Coherence             | How each rider contributes to the same loop; flag disconnected riders for removal, relocation or replacement.                |
| Marginal value        | Base, ordinary/Honed, skill grand and identity together; name what still changes with the related common boon already owned. |
| Opportunity cost      | What the competing identity does better or differently; use the same legal four-grand loadout and encounter assumptions.     |
| Compatibility         | Native, copied/grafted and actual Forge paths, missing hooks and honest fallback; preserve active-class ownership.           |
| Evidence and decision | Source locations, observed sequence, uncertainty, retain/adjust/replace/investigate, and bounded recommendation.             |

## Acceptance rubric

Use **pass**, **needs revision**, or **blocked by missing evidence** for each row.
Do not average a failed availability or compatibility contract into a passing
score. A pair advances only when every row passes or an explicit, bounded
remaining question is presented to the owner before implementation.

| Gate                | Pass evidence                                                                                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Distinct decision   | Explain a different action order, timing, target choice, movement or resource decision for the two identities. Renamed attacks and larger numbers alone fail.                                                                                                            |
| Coherent purpose    | Every rider supports the stated loop, supplies a necessary first-pick fallback, or is explicitly identified as supporting growth. An unrelated perk cannot justify the identity.                                                                                         |
| Early usefulness    | A legal starting kit plus **each of four first picks**, against **one boss**, has a useful route. Begin at full health; distinguish unconditional utility from recovery that needs genuine injury. No adds, second rare skill or imagined input.                         |
| Layer value         | Compare no ordinary ranks and the relevant maximum ordinary/Honed ranks, individual grand, identity and their legal combinations. Existing slow, freeze, follow, leech, shield or guard does not become a second new mechanic merely because another source supplies it. |
| Recipient and space | Name the actual center, range, facing, ground/aerial rules, solo fallback and party recipient count. Ally value and owner isolation are explicit; a single shield is not described as group protection.                                                                  |
| Opportunity cost    | Both routes have a purpose in matched scenarios; identify the sacrificed timing, coverage, placement or preparation option. A universal stronger package needs revision, not a thematic name.                                                                            |
| Safe execution      | Miss, zero/immune damage, overkill, expiry, downing and class changes do not spend or duplicate resources incorrectly. Shared-cast and secondary-damage rules prevent recursion.                                                                                         |
| Honest portability  | Exercise actual upgrades and Forge synthesis, not registry flags or decompose/recompose alone. Copied skills work without donor passives/resources; altered payloads receive a useful, accurately described fallback.                                                    |
| Legibility          | A concise offer states the changed decision; expanded details and actual resolved readouts explain values/targeting. Readiness and successful payoff are perceivable on desktop and phone.                                                                               |

Passing this rubric establishes an understandable, functioning proposition. It
does not prove equal strength or enjoyable play. Fixed-encounter comparisons and
owner live testing remain necessary; normal adaptive runs follow those checks.

## Evidence-led shortlist, not a ranking of 48

These are sampling priorities from existing code and delivery notes. They are
not an exhaustive inventory, a failure count, or a claim that a shared primitive
is always redundant.

| Category to inspect                                 | Repository evidence                                                                                                                                | Review question                                                                                                                                                              |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repeated controlled-damage/suppression pairings     | `src/engine/content/charUpgrades.ts`: `kn_battlemaster`, `mg_evoker`, `rg_hunter`, `dr_land`; corresponding martial/caster/nature identity tables. | Does the subclass change how setup is made or spent, or merely assign the same two modifiers to another kit? Compare the complete loop across classes.                       |
| Collections of recipient-specific buffs             | `ba_valor_g_a/b`, `ba_whispers_g_a/b` and `pa_vengeance_g_a/b` in the same registry; support identity table.                                       | Do leech, movement, barrier/guard and heal riders express one deliberate route, or occupy unrelated branches of a delivery-kind switch?                                      |
| Existing mechanics with measurable cadence/geometry | Pilot Assassin/Trickster routes; Moon form timing and claw reach in `NATURE_GRANDS.md`; Sorcerer utility weave in `SORCERER_LUCK.md`.              | Use these as comparison cases, without presuming they pass: does the actual play sequence show the promised distinction and remaining ordinary/grand value?                  |
| Generic Forge fallbacks                             | `pilotIdentity` base/subskill replay split and guarded delivery-specific recipes in `charUpgrades.ts`; nature/support compatibility sections.      | Does a legal altered delivery preserve the purpose or only retain magnitude? If only growth remains, document the boundary instead of claiming the native identity survived. |
| Recovery and party-only value                       | Support effective-heal, rescue and chorus rules; nature relay limits.                                                                              | At full health, solo or with one boss, is there still an accessible first-pick route? Are benefits priced by actual recipients rather than hypothetical allies?              |

For example, current Whispers identities distribute controlled damage, leech,
movement, suppression and post-blink protection among different skills. That is
concrete evidence to ask for a unifying sequence; it is not proof that every
effect is useless. Conversely, Moon reach versus form duration is a plausible
spatial/temporal distinction, not automatic evidence of balance.

## Manageable stages and stop conditions

1. **Agree the lens.** Review this rubric and the owner feedback. Keep the current
   four-grand slots, earned banks, explicit between-fight swaps, health-scaled
   protection and shared recovery/geometry limits. No economy or catalogue
   rewrite is implied by this step.
2. **Calibrate on three subclass pairs.** Start with Whispers, one repeated
   controlled-damage/suppression pairing such as Evoker, and one mechanism-led
   comparison such as Moon. Produce six compact identity sheets and matched
   before/after sequences. Recommend retain/adjust/replace/investigate; do not
   implement six redesigns. Stop for owner review if the rubric yields only
   relabeled offense/defense packages or needs a new control/resource system.
3. **Review the remaining pairs in four-class cohorts.** Apply the calibrated
   sheet to all 24 subclass pairs/48 identities, reusing confirmed system facts.
   Keep one short finding per identity and an overlap map by trigger, cadence,
   delivery and recipient. Each cohort ends in recommendations and explicit
   uncertainties; revise cohort size if actual dependencies demand it. The
   initial sample is included in this total, not a second independent audit.
4. **Approve bounded changes before implementing.** Group genuine changes by
   shared runtime mechanic. Retain sound simple growth; remove or redirect
   disconnected riders only with a clear alternative and replay/compatibility
   plan. Validate each receiving kit, then owner live-test each delivered batch.
5. **Resume whole-system numerical and progression review.** Once identities and
   their intended loops are accepted, compare relative power, ordinary-upgrade
   marginal value, graft alternatives and actual reward availability/costs.
   Measure whether realistic runs can assemble the intended routes; do not tune
   around ideal all-grand builds alone. Specific broken compatibility may be
   fixed earlier, but broad graft/economy retuning waits for identity decisions.

Planning uses source inspection and small reproducible comparisons. During an
approved implementation, run focused relevant checks once after integration;
use CI for repository-wide gates and diagnose specific failures. Do not run
full suites merely to classify ideas. Do not merge or deploy automatically.

## Mantle direction within the bounded follow-up

Mantle retains its blink. A prepared Harmony + Discord chorus should offer a
purposeful spatial or sequencing payoff, rather than reproduce Mage Dimension
Door's endpoint exchange or teleport allies. Native use without a chorus remains
a useful blink; Harmony still requires effective healing, so the chorus is an
additional route rather than the sole full-health first-pick benefit.

Design candidates, **not approved mechanics or external-source findings**:

- **False Exit:** chorus blink leaves a brief misleading/hushing footprint at
  departure, buying a different enemy-action window while the Bard relocates.
  Prefer a bounded existing control primitive to new decoy AI. Compare departure
  versus arrival placement, aerial eligibility and one-boss value explicitly.
- **Whispered Opening:** chorus blink banks one follow-through; a later positive
  direct hit opens a brief, owner-isolated opportunity on that target. This asks
  when and whom to re-engage. Avoid copying existing Fortune/Loaded Fate or
  merely adding another generic damage buff.
- **Stolen Stage:** chorus relocation establishes a short-lived, bounded control
  area whose value comes from choosing its position. Compare it with Words of
  Terror, following-zone grands and starting Whispers before accepting it; a
  second similar slow zone would repeat the original problem.
- **Misdirection Refrain:** chorus blink leaves a departure afterimage; a few
  later direct casts can spend its finite echo budget when their target remains
  near that image. A basic attack can participate. This makes departure position,
  the next target and spending before expiry matter without moving allies or
  adding decoy AI. Proposed proportional echoes need positive-hit provenance,
  shared-cast tokens, owner isolation and secondary-damage exclusion. Unlike
  Bolster's caster-centered burst or Shatter's retort, the old position must
  remain the meaningful constraint. Echo count, ratio, lifetime and footprint
  are implementation proposals, not established balance values.

The bounded follow-up selects **Misdirection Refrain**: its departure constraint
creates an attack-positioning decision without duplicating the existing terror
field. The other candidates remain rejected comparisons, not promised additions.
See [Whisper Refrain](WHISPER_REFRAIN.md) for resolved behavior and verification.

## Concise descriptions as a continuing contract

Retain the existing expandable combat/upgrade rules reference. Offers explain
their delta and meaningful condition; shared caps and generic preservation
reminders belong in that reference. Keep actual recipient, ground/aerial limits,
resource spending and material tradeoffs where the player needs them. Do not
remove a rule simply to reach an arbitrary character count.

The bounded follow-up adds a lasting copy regression check alongside its text
changes. Future edits search names and IDs across production browser selectors,
tests and shared descriptions. Review both collapsed and expanded phone cards;
keep shared class-rule explanations in one maintained location rather than
append them to every related skill. A text guard supplements semantic review;
it cannot decide whether a new identity has a purpose.

## Public research access ledger

Attempted **2026-10-31 UTC**. Direct requests were denied by the sandbox; the
authorized network attempts then returned proxy **HTTP 403 before content was
received** for all five targets below. No page/PDF was retrieved or read. These
are source targets and open questions, not verified mechanical paraphrases.
The environment configuration has since been diagnosed as a domain allowlist;
a targeted settings draft awaits owner publication. This ledger is provisional
until the parent can retry after publication; do not treat the saved draft as
an already active network change.

| Public source target                                                                       | Question for a later accessible reading                                                                            | Access    |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | --------- |
| [Guild Wars 2 official wiki: Portal Entre](https://wiki.guildwars2.com/wiki/Portal_Entre)  | How does deliberate placement and teammate participation distinguish useful transport from automatic displacement? | Proxy 403 |
| [Blades in the Dark official SRD: teamwork](https://bladesinthedark.com/teamwork)          | How can an action establish an opportunity for a later, differently performed payoff?                              | Proxy 403 |
| [Archives of Nethys: Bard](https://2e.aonprd.com/Classes.aspx?ID=32)                       | Which composition constraints make timing and choice of performance meaningful?                                    | Proxy 403 |
| [d20 SRD: Dimension Door](https://www.d20srd.org/srd/spells/dimensionDoor.htm)             | Which transport decisions are already familiar enough that another teleport would add little purpose?              | Proxy 403 |
| [Wizards public SRD 5.1 PDF](https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf) | Compare stated mobility/action constraints with Warband's cooldown and mobile controls.                            | Proxy 403 |

External inspiration remains an unresolved evidence checkpoint. Retry a small
accessible subset when a genuine research capability is available; record exact
mechanical facts separately from proposed Warband principles. No Reddit, Steam,
GitHub catalogue, pirated book, external artwork or long rules excerpt is used
as evidence in this plan. Public availability is not a claim of permission to
import content. These different games would supply design comparisons, not
Warband player feedback, representative community opinion or transferred balance
numbers. The proposals above rest on repository mechanics and owner goals.
