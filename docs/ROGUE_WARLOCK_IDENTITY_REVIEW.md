# Rogue/Warlock identity review and prepared-coating repair

Baseline: merged `6a60750` (#147). The owner accepted Whispers' new mechanics in
live testing. Moon and Evoker remain retained. One bounded Sol 6.1 high review
and source inspection informed this delivery; no agent fan-out or external
research was used. This is the next identity review, not a balance ranking or a
claim that every reviewed pair has passed.

## Decision and scope

| Subclass         | Decision                                                               | Why                                                                                                                                                                                            |
| ---------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Assassin         | Repair combined preparation now; identity pair remains open            | Both identities often use Shadowstep → prepared strike. A amplifies execution; B supplies target poison, but weaker Shadowstep currently overwrites stronger prepared Coated Blade.            |
| Arcane Trickster | Retain                                                                 | Cunning permits ranged Spellblade spending; Sleight reserves melee spending and grants facing-dependent protection/movement for departure. Spacing and the chosen spender differ.              |
| Fiend            | Retain accepted skills/passive; revise identity purpose next           | Hellfire automatically pays damage after a hit count. Pact bundles protection/leech. Both function, but neither counter display nor offense/sustain labels establish two deliberate routes.    |
| Great Old One    | Retain accepted skills/passive as baseline; identity pair remains open | Elder Mind repeats Mind Blast's debuff on additional recipients. Doom banks a later spell, but native eligible spells have no wind-up to shorten, and its preparation model overlaps Sorcerer. |

Useful numerical growth may remain. The review does not add fear, decoys or
conversion to these kits merely because Whispers succeeded with them.

## Identity sheets: preparation and payoff routing

| Identity                              | Actual preparation/cadence                                                                        | Payoff routing and decision                                                                                                                                                                 | Judgment                                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Death Incarnate `ro_assassin_g_a`     | Shadowstep or another precision source prepares a strike; longer preparation tolerates delay.     | Prepared hits execute at 50% HP for +30%, rather than the passive's 35%/+15%, and increase critical bonuses. Pick/position for a wounded foe, but the action order usually stays unchanged. | Numerical specialization. Retain working behavior until a coherent alternative is designed; do not label it a new loop. |
| One with Shadow `ro_assassin_g_b`     | Shadowstep also prepares poison; ordinary Coated Blade can independently prepare stronger poison. | Deliver one owner-bound poison through a connecting direct hit; precision improves that application. A coating collision currently penalizes the natural utility sequence.                  | Repair collision. Compare target-bound pressure with execution before claiming the pair distinct.                       |
| Archmage's Cunning `ro_trickster_g_a` | A non-melee special prepares Spellblade.                                                          | A later ranged direct hit can spend it, letting the player remain outside melee; ordinary preparation/precision and ranged skill grands can support this route.                             | Retain. Slow/suppression numbers support the ranged-spender choice.                                                     |
| Sleight of Time `ro_trickster_g_b`    | Prepare Spellblade through a non-melee special, then arrange a melee connection.                  | Spend in melee, then use frontal protection and movement to leave or reposition. Facing and exposure differ from ranged spending.                                                           | Retain. Protection is supporting payoff, not the only claimed distinction.                                              |
| Hellfire Ascendant `wa_fiend_g_a`     | Hit personally cursed foes; every third positive direct hit triggers hellfire under a 4s gate.    | Counter automatically pays damage. Forked shots can affect hit cadence; three hits do not necessarily mean three deliberate casts. Blessing movement is an additional rider.                | Needs purpose revision. Counter operation is verified behavior, not proof of a decision.                                |
| Infernal Pact `wa_fiend_g_b`          | Blessing and curse-based attacks maintain protection and drain.                                   | Extra absorption, leech, field mitigation and siphon growth improve survival, but mostly reward the existing sequence.                                                                      | Needs purpose revision; preserve functional solo/full-health routes.                                                    |
| Elder Mind `wa_great_old_one_g_a`     | Establish a personal curse, then connect direct hits.                                             | Spreads Mind Blast's suppression to basic/Rebuke and lengthens fields; utility heal is disconnected supporting value.                                                                       | Needs revision; repeated debuff sources are not separate unlocks.                                                       |
| Whispered Doom `wa_great_old_one_g_b` | Blessing or a utility/field prepares Surge; basics preserve it.                                   | Choose a direct subclass spell or close Rebuke as spender. Native eligible spells have zero wind-up, so their speed bonus is inactive; actual forged casts may use it.                      | Investigate/revise its distinct purpose, preserving the useful held-spell choice.                                       |

Source: `content/charUpgrades.ts` identity recipes; `combat/subclassPassives.ts`
for execution/Spellblade; `combat/grandCoherence.ts` for hellfire; and
`combat/spellCombos.ts` for actual Surge spending. IDs above are stable; names
are current display labels. Narrative theme and raw damage are not acceptance
evidence by themselves.

## Every first pick has a solo full-health route

The starting kit remains available; no row assumes adds, a second rare choice,
a kill or deliberate injury. Native behavior is distinguished from altered Forge
payloads below.

| First pick                             | Available route and useful role                                                                                                                     |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Death Strike `ro_assassin_strike`      | Shadowstep prepares precision; the melee strike can spend it.                                                                                       |
| Deadly Throw `ro_assassin_throw`       | Ranged direct attack; its individual grand unlocks precision consumption and piercing.                                                              |
| Coated Blade `ro_assassin_poison`      | Bank poison, use Shadowstep for precision/position, then connect a prepared strike. This is the repaired sequence.                                  |
| Smoke Bomb `ro_assassin_smoke`         | Caster-centered slow/suppression and precision preparation support a base Backstab.                                                                 |
| Mage Hand Bolt `ro_trickster_bolt`     | A connecting bolt prepares precision; Cunning can also spend Spellblade at range.                                                                   |
| Ensnaring Strike `ro_trickster_snare`  | Ranged ground control prepares the non-melee weave; base melee or Cunning's direct route spends it. Its grand changes placement into an escape web. |
| Mirror Cut `ro_trickster_step`         | A precise melee spender with prepared-hit phasing; Poison Vial or Shadowstep supplies Spellblade preparation.                                       |
| Shield Spell `ro_trickster_shield`     | Full-health frontal protection and precision; base skills supply the subsequent strike.                                                             |
| Hurl Flame `wa_fiend_hurl`             | Hex supplies personal curse; Hurl and basics exploit it, with no injury prerequisite for damage.                                                    |
| Fire Pit `wa_fiend_pit`                | Additional ground-only curse territory. Base Hex is the aerial-compatible setup route.                                                              |
| Infernal Claim `wa_fiend_rebuke`       | Aim a remote detonation at a personally cursed foe; failed target validation must preserve resources.                                               |
| Dark Resilience `wa_fiend_resilience`  | A useful barrier at full HP, with additional marked-enemy siphon when available.                                                                    |
| Mind Blast `wa_goo_blast`              | Hex → direct psychic hit applies suppression.                                                                                                       |
| Tentacle of the Deep `wa_goo_tentacle` | Close area/control beside base curse/basic routes.                                                                                                  |
| Dissonant Whispers `wa_goo_whispers`   | Airborne-capable dread territory; normal basics exploit the personal curse.                                                                         |
| Entropic Ward `wa_goo_flee`            | Relocation independently useful at full HP; Doom can prepare through Blessing and spend through base Rebuke.                                        |

Source: `content/classes.ts`, `content/subclasses.ts` and the runtime functions
above. Native ground/aerial eligibility and actual resolved targeting remain
authoritative; a class name alone does not make a field reach flyers.

## Layer value and remaining overlap

- Assassin Death Strike's individual grand creates owner-only exposure for a
  **later** cast; ordinary Assassinate owns the Backstab movement refund. Keep
  those accepted responsibilities. Throw's grand still adds piercing with A,
  but its precision-consumption unlock overlaps A and adds no second such flag.
- Coated Blade's individual grand supplies preparation and damage. One with
  Shadow's duration contribution saturates once ordinary/grand growth reaches
  the 6s cap. This is a bounded growth limit, not new playstyle diversity.
- Trickster Bolt's grand and Cunning both slow: count the actual stronger effect
  and piercing coverage, not two independent slow mechanics. Snare's escape
  placement differs from ranged placement. Mirror's extra same-target damage and
  Shield's stronger charges may remain supporting growth.
- Fiend's remote Claim and its successful-hit ward differ from ordinary proactive
  Rebuke retaliation. Preserve this accepted distinction. Hurl impact coverage
  and stationary Pit allied protection matter with the right recipients; neither
  automatically creates lone-boss build diversity. Resilience's frontal block
  differs from a barrier, but nominal barrier amounts can overlap under caps.
- Mind Blast grand's 4s curse payoff is duplicated by one Honed rank reaching 4s,
  then 5s. Piercing still has coverage value. Following dread territory differs
  from Hex by payload/recipient consequences; it is not a reason to apply the
  same follow rider repeatedly. Ward's frontal protection remains useful.

The review compares ordinary/Honed and the legal one-skill/one-identity selections,
not an impossible all-grand kit. No balance verdict is inferred from these
overlaps. Existing native, graft and Forge fallback work must survive later
identity changes; a fused skill retaining only numerical growth is not evidence
that its native identity was preserved.

## Implemented repair and evidence

`armRetouchEffects()` previously armed `venomReady:<class>` through generic
`applyBuff()`, replacing its payload unconditionally. Coated Blade → One with
Shadow's Shadowstep changed prepared poison from 24+/s to 12/s for 4s. Protection
inside `applyCoating()` only covered poison already applied to the enemy.

The preparation layer now preserves an unexpired coating that dominates the new
one in damage/s and poison duration, with at least one strictly greater. Its
readiness expiry is preserved too: casting a weaker utility cannot bank a better
coating indefinitely. A stronger, equal, expired-replacement or incomparable
short/strong versus long/weak cast can replace it normally. The blink and other
effects of the utility still execute. Ownership remains actor/class scoped.

The regression reproduced the downgrade before the fix across zero-to-five
Honed ranks, with/without the skill grand and actual synthesized payloads. Focused
checks cover reverse order, expiry, equal/tradeoff replacements, immunity,
class/actor isolation and successful prepared application. This is compatibility
repair, not an identity redesign. The existing pilot/coherence suites are also
run; repository-wide gates are left to CI without polling.

Local validation: **161 tests across six relevant suites pass**, including 22
new preparation regressions. Build/typecheck, changed-path lint, full formatting
and both generated audit checks pass. No browser rerun is needed for this
state-only preparation repair; actual casts and Forge synthesis exercise it.
No numerical balance or live-feel result is claimed for the open identity pairs.

## Next development steps after this delivery

1. **Assassin/Fiend behavioral proposal:** turn their open findings into concrete
   alternative sequences with real opportunity costs. Preserve precision, target
   poison, remote Claim and curse-based full-health protection. Avoid merely
   increasing execution, hellfire or leech, and do not import Whispers' fear/decoy
   package. This is the next design task even if the coating repair feels fine.
2. **Implement the mature bounded proposal**, validate receiving kits and collect
   live feedback. Bring back a material unresolved gameplay choice; own routine
   implementation and tuning. Then resolve Great Old One's duplicate suppression
   and native Surge role. These three pairs remain open until that work passes.
3. **Remaining identity cohorts:** Knight/Barbarian/Monk; Hunter/Beast Master/Land;
   Abjurer/Draconic/Wild Magic; Light/Life/Devotion/Vengeance/Valor. Moon, Evoker
   and Whispers are retained/accepted; do not repeat them as unreviewed work.
4. **Whole-system tuning:** compare power with fixed encounters, ordinary-upgrade
   marginal value, realistic reward acquisition and graft alternatives. Recheck
   caps from measured builds, not ideal all-grand assumptions.
5. **Visual direction prototype**, then production: one hero/form, boss, arena
   and distinct attack/heal/barrier/control language on desktop and phone. Clear
   functional feedback continues during mechanics work; the full asset revamp is
   a separate milestone.

Seven of 24 subclasses have now been reviewed in this identity pass. Three of
those remain open; “reviewed” does not mean “identity accepted.” No fixed PR count
or production schedule is implied by the sequence.
