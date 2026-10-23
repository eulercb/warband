# Coherence retouch C: support choices and growth

Final planned retouch batch after [A](COHERENCE_BATCH_A.md) and
[B](COHERENCE_BATCH_B.md), both merged and live-tested. This completes the
approved coherence sequence, not a claim that every class is equally strong or
that future playtests cannot identify another outlier. Broad upgrade redesign
has not started; its next step is the [design checkpoint](UPGRADE_IDENTITY_ROADMAP.md).

## Distinct active roles

| Skill          | Behavior and decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mass Cure      | Retains 100 primary healing, 5s subclass cooldown and existing rescue/bubble behavior. Relays **35% of effective primary healing** to one other injured living player within **180u of the recipient**, choosing lowest health ratio, then player ID. The caster can be that secondary recipient. No secondary heal when the primary restores zero health; no recursive rescue, overflow, echo, verse or pet triggers from the relay. Position near an injured teammate for spread recovery; solo primary strength is unchanged. |
| Flash of Light | Retains 85 healing, 5s subclass cooldown and rescue/bubbles. A successful heal begun at **35% HP or below** readies the recipient's next connecting direct hit for **+20% damage within 6s**. Basics work; ticks, zero damage and immunity preserve it. Repeated rescues refresh one preparation rather than stacking charges. It works for a copied skill without Light; Light's existing Refulgence remains the caster's separate payoff.                                                                                      |
| Wind Step      | Retains its 280u traversal, i-frames, 22 self-healing, 5s cooldown and Flow preparation. The **first living ally actually crossed**, within 40u plus their collision radius of the travelled path, is cleansed and gains **one frontal block for 3s**. Cover stops the traversal and the support path; no guarding through walls. One ally per dash; stronger guards remain. The rooted caster still cannot dash. Solo reposition/heal/Flow are preserved.                                                                       |
| Hail of Thorns | Retains the 34-damage, 130u close burst and 8s cooldown, adding **90u outward displacement** and **35% slow for 2s**. Creates space to resume shooting rather than duplicating another ranged burst. Existing forced-movement resistance/obstacle rules remain; allies are not displaced. Direct hits still expose Hunter quarry.                                                                                                                                                                                                |
| Quarry Shot    | Presentation rename of Hunter's Mark, retaining stable ID `rg_hunter_mark`, 48 damage, two extra pierces and 6s cooldown. Its old name implied a distinct mark application that the skill did not have; Exposed Quarry already belongs to the subclass's direct-hit passive.                                                                                                                                                                                                                                                     |

Compare with the rejected alternatives: a name-only Mass Cure correction would
leave the single-heal overlap; a blanket Flash damage buff would offer less
rescue timing; an area-wide Wind Step guard would remove the traversal decision;
more Hail damage alone would leave its close-range role unclear. None of these
skills requires the recipient to own a donor class resource/passive.

Rescue follow-through has a visible status badge and uses the existing empowerment
link. Heal relay draws its healing link from the primary to the secondary
recipient, while healing credit remains with the caster. Wind Step uses the
existing protection link and directional shield effect; Hail uses existing shove
and debuff cues. This is compatibility/readability for these actions, not a new
whole-game visual redesign.

## Recipient-aware scaling without extra equivalent pools

Keep the early floors and current gates/durations. Growth belongs to the person
being protected, not a high-health caster shielding every low-health teammate at
that caster's scale.

| Effect                           | New bounded grant/cap                                                                          | 140 HP | 400 HP | 1,000 HP |
| -------------------------------- | ---------------------------------------------------------------------------------------------- | -----: | -----: | -------: |
| Abundance per trigger            | 50% unused primary healing, capped at max(25, 12% recipient max HP)                            |     25 |     48 |      120 |
| Echoed Refrain per echo          | 50% effective dedicated healing, capped at max(35, 12% recipient max HP)                       |     35 |     48 |      120 |
| Spirit Shelter, 3 Momentum       | max(20, 10% recipient max HP); lower stacks use max(8 + 4 × stacks, (4% + 2% × stacks) max HP) |     20 |     40 |      100 |
| Pack Bond's next successful bite | max(12, 8% healed recipient max HP)                                                            |     12 |     32 |       80 |

These are maximum offers, not guaranteed effective recovery. Missing health,
stronger existing barriers and shared caps still limit actual value. Shelter and
Pack Bond keep strongest-pool behavior; Abundance remains additive within the
shared barrier ceiling. No new pool, proc recursion or ally-count multiplier is
introduced.

**Whispers decision:** keep the next-effective-heal echo rather than replacing it
with an automatic delayed heal on chorus. The existing route deliberately directs
a heal to an injured player and avoids spending the echo on full health; a timed
pulse would trade that choice for availability. This batch repairs the verified
late-HP cap issue, while leaving practical chorus/second-heal cadence for live
feedback. A passing contract test does not establish that this setup feels ideal.

**Paladin/Sorcerer decision:** preserve current kits. Aura replacement and
single-extension/gate contracts, effective healing and real three-basic Spell
Weave progression are covered by existing regression suites. No new demonstrated
outlier calls for another rewrite here. Replacing an aura remains a choice, not
permission to stack all aura benefits or refund a paid Surge. Scales/Bend Luck and
all other actives remain in the upgrade inventory.

## Upgrade and generation contracts

Stable IDs, native and component delivery, Honed tuning, subclass grands and
copied-skill behavior are retained. Relay gains strength from actual upgraded
primary healing; Honed/grands enlarge its secondary radius, not its recipient
count. Rescue readiness duration grows up to 8s while its +20% stays fixed.
Wind's crossing width/guard window grow (guard cap 6s), retaining one ally.
Forge effects have explicit decomposition/recomposition, delivery fit, value,
scaling, caps and refresh. A generated rescue follow-through needs no separately
drawn `rescueHeal` bonus; any positive dedicated heal at low HP can ready it.

Adaptive difficulty formulas and baseline support credit remain unchanged.
As before, faster kill pace can influence later encounters; this is not a promise
that every subsequent boss has identical parameters. New upgrades will still
need deliberate power pricing rather than a blanket exemption.

## Review in a live run

- Compare Flash above/below 35% target health; observe recipient readiness, then
  spend it with a basic. Compare solo Light (both personal and rescue preparation)
  with rescuing a teammate (separate recipients).
- Compare Mass Cure alone and in a clustered/spread party. The primary is still
  selected by the existing lowest-health search; the secondary search is centered
  on that primary, not the caster. Secondary range is smaller than primary range.
- Dash across one teammate, two teammates and beside cover with Wind Step. Turn
  the protected teammate toward/away from a direct attack; ground hazards bypass
  directional blocks as usual.
- Use Hail to disengage a closing enemy, then shoot through adds with Quarry Shot.
  Check bosses with displacement resistance and enemies pinned against cover.
- Compare ordinary and high-HP allies with the four scaling effects. Actual shield
  consumption and healing are more useful evidence than the offered maximum.

Automated checks cover native/composed resolution, solo and 2/4-player selection,
seams, obstacle-limited movement, invalid recipients, immunity, expiration/cleanup,
recipient-based growth and generated/upgraded payloads. Existing Paladin/Sorcerer
suites are preservation checks. Whole-run balance, enjoyment and support cadence
remain live-play questions.
