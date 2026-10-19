# Class identity and subclass roadmap

Current delivery: **coherence retouch A — Moon / Warlock / Mage**.

The first identity round is complete at **24/24 subclass passives**, and the
[whole-class audit](CLASS_COHERENCE_AUDIT.md) is merged. This patch delivers the
[first retouch batch](COHERENCE_BATCH_A.md): scalable Moon mending and a Roar
follow-through, Fiend's visible reserve and cursed retaliation, Mind Blast's
curse payoff, and Mage's bounded control-passive improvements. The [resolved
catalogue](CLASS_CATALOGUE.md) reflects current behavior.

**Next after live verification:** B (Knight / Barbarian / Rogue / Druid active
roles), then C (support alternatives and remaining cadence). Split B only if the
placed-totem prototype requires substantial engine work. Added passives or riders
still do not exempt plain defensive/recovery actives from the review.

Then roughly four to six upgrade design/implementation PRs: **6–8 more PRs after
this batch**, with a possible split. Art direction remains separate. These are
provisional scope estimates; earlier status tables preserve history and are
superseded here. Follow the [milestone review gates](CLASS_MILESTONE_REVIEW.md)
and [public research guidelines](RESEARCH_GUIDELINES.md).

## Goals and boundaries

Give skills different jobs and connect them into recognizable class loops.
Changing a name, radius, or damage value alone is not a new play style. Every
class should function before subclass unlocks, solo and in varied parties.
Maintain current controls and forgiving mobile execution. Support builds should
remain useful without a mandatory healer/tank party composition.

A modest player power increase is welcome. Preserve adaptive boss difficulty
rules in this pilot. Its feedback may compensate some of the increase; do not
promise easier encounters from ability numbers alone. Compare fixed encounters
first, then normal adaptive runs. Do not price every utility interaction as raw
DPS or hide unbounded power outside the estimator.

## Pilot: Rogue and Warlock

- Rogue: Shadowstep prepares one guaranteed precision crit for 4 seconds.
  Backstab and Assassin's Death Strike consume it on a connecting attack; ordinary
  basics, misses, and an invulnerable boss leave it available. It refreshes rather
  than stacks. Arcane Trickster's Misty Step also prepares it. Poison Vial retains
  damage and enemy wind-up slowing and adds a light movement slow, helping hold
  an opportunity open. Assassinate improves crit damage; Vanish extends the
  preparation window. No extra input or resource bar.
- Warlock: Hex marks grounded enemies, granting its owner 15% more damage against
  them, including the owner's damage zones. The mark refreshes and briefly lingers
  after leaving. Separate casters' marks do not multiply together. Deepening Hex
  adds one percentage point per stack. Great Old One's Dissonant Whispers also
  marks enemies. Flight still bypasses ground zones.
- Hellish Rebuke retains its immediate explosion and lifesteal and arms one
  counterburst for 3 seconds. The first damaging, nonlethal hit consumes it:
  40% of the ability's damage in its original radius, with its lifesteal.
  Dodged hits do not consume it. Expiration does not explode; lethal damage
  cannot be rescued by the counterburst. Fiendish Rebuke gains the same behavior.
  This is an optional defensive payoff, not a reason to intentionally take damage.
- Existing cooldowns and base damage are retained. Upgrades, grafts and composed
  abilities carry their own interactions rather than checking the current class
  name. New states use compact timed badges and the existing snapshot pipeline.

These interactions are bounded: no automatic cooldown resets, permanent marks,
extra basic attacks, or infinitely chaining procs. The following milestone adds
bounded passives for the four pilot subclasses; other passives remain deferred.

## Milestone 2: four defining passives

A subclass grants its passive when its first skill is committed, independently
of which skill was chosen. It consumes neither sub1 nor sub2. The existing
persistent subclass-skill roster records the committed subclass, so normal run
progression, loadout presets and the Start message already reproduce ownership.
If unequipping all subclass skills is added later, preserve an explicit subclass
ownership record rather than inferring ownership from the equipped list.

- **Assassin — Death's Opening:** prepared precision strikes gain +0.2× crit
  damage and deal 15% extra damage at or below 35% enemy health. This never creates
  additional preparation or crit chains. Death Strike and base Backstab benefit.
- **Arcane Trickster — Spellblade:** a non-melee special prepares the next
  connecting melee hit for +20% damage within 5 seconds, once per 6 seconds.
  Basic attacks may consume it but never prepare it. Magic, zones and utility
  skills can prepare it; rooted mobility cannot. Misses and invulnerable enemies
  preserve readiness. Base skills, subclass spells and grafted spells work.
- **Fiend — Soul Ember:** effective damage to a personally cursed enemy heals
  5% maximum health (retuned from 2%) and grants 10% mitigation for 3 seconds, once per 6 seconds.
  Direct attacks, zones and counterbursts qualify. Healing is capped at missing
  health and credited normally. Other owners' curses and dead casters cannot proc it.
- **Great Old One — Dread Insight:** personally cursed targets take 8% extra
  damage while slowed, rooted, stunned or suffering longer wind-ups. Ally control
  can establish the opportunity, but only your own curse qualifies. All damaging
  skills can exploit it; expired effects, haste and neutral wind-ups do not count.

Only the active class's committed passive operates. On a class change, passive
readiness and temporary passive wards expire; per-passive cooldowns continue
counting down and never reset on swap or rebind. Ordinary skill effects retain
the pilot's existing behavior. Each new encounter starts fresh combat timers.
Copied skills do not grant a subclass passive. Procedural variants and Forge
retain the chosen subclass's authored passive identity; passives are not Forge
components or donors, and no passive recombination is introduced.

Subclass cards, the loadout editor and pause explain the passive. Combat uses a
small identity icon, existing ward/crit badges, and one timed Spellblade badge.
Readiness travels through existing buff snapshots; proc cooldowns remain private
host state. No new buttons, resource bars, networking messages or difficulty
rules are introduced.

The production browser check is `npm run smoke:passives` after building and
starting the preview server. It selects all four subclasses through real menus
and checks the fight icon and pause description on desktop and a small phone.
CI runs this alongside the existing desktop/mobile and room-navigation checks.

### Passive playtest checklist

Use the single-fight Test loadout panel to choose any one skill of each subclass.
Compare the resulting passive with an unsubclassed character. Try Assassin's
prepared strike above and below 35% boss health; Trickster's utility → blade hit;
Fiend's Hex followed by damage and its six-second reward limit; Great Old One's
curse with and without control. Try second subclass skills, bots, mobile controls,
multiclass swaps, and a normal adaptive run. Review power and clarity separately.

## A defining passive for each subclass

Unlock one passive when the subclass is chosen, without consuming sub1/sub2.
It should alter decisions in the base kit as well as selected subclass skills.
The passive provides a useful baseline regardless of which two extra skills the
player chooses. Keep this separate from skill upgrades and rare grand rewards.
An icon and short description should explain it; avoid another permanent text
panel or making each class require a resource bar.

| Class     | First subclass: proposed passive                                                                                             | Second subclass: proposed passive                                                                                                                   |
| --------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Knight    | Champion — well-timed mitigation prepares one enhanced frontline strike.                                                     | Battlemaster — successful interrupts or displacement prepare a limited tactical follow-up.                                                          |
| Ranger    | Hunter — sustain focus on one quarry for a precision opportunity.                                                            | Beast Master — a companion coordinates with selected attacks and commands; initially prototype a bounded animal follow-up before persistent pet AI. |
| Mage      | Evoker — combining control and damage prepares an enhanced detonation.                                                       | Abjurer — defensive casts build a capped protective ward with a useful ally option.                                                                 |
| Cleric    | Light — offensive spells prepare a small healing opportunity.                                                                | Life — effective healing creates capped, short-lived protective overflow; never reward overheal spam.                                               |
| Barbarian | Berserker — maintain attack momentum during Rage for a capped offensive benefit.                                             | Totem Warrior — active protection grants a brief nearby ally benefit.                                                                               |
| Rogue     | **Implemented:** Assassin — Death's Opening strengthens prepared precision and finishing pressure.                           | **Implemented:** Arcane Trickster — Spellblade connects non-melee specials and blade hits.                                                          |
| Paladin   | Devotion — frontline holy actions provide short, capped nearby protection.                                                   | Vengeance — pursuing the chosen enemy prepares an empowered smite.                                                                                  |
| Druid     | Moon — temporary animal form connects melee actions and recovery; form behavior and input mapping need a separate prototype. | Land — zones generate limited growth that strengthens a subsequent nature effect.                                                                   |
| Bard      | Valor — varied offensive/support actions culminate in a rally.                                                               | Whispers — sustained disruption prepares a focused psychic payoff.                                                                                  |
| Monk      | Open Hand — alternating strike and movement prepares control or a finisher.                                                  | Shadow — repositioning prepares an ambush opportunity, with forgiving timing.                                                                       |
| Sorcerer  | Draconic — breath and flight interact with a capped draconic empowerment.                                                    | Wild Magic — a clearly previewed, bounded surge modifies a future cast.                                                                             |
| Warlock   | **Implemented:** Fiend — Soul Ember grants bounded sustain/protection from personal curse damage.                            | **Implemented:** Great Old One — Dread Insight exploits personally cursed, debilitated foes.                                                        |

The companion belongs most naturally to **Beast Master**; Hunter can remain the
precision-focused alternative. Neither companions nor forms should require
additional tiny mobile buttons. Avoid overlapping pets with ordinary party bots:
pet targeting, collision, death/respawn, owner disconnect, commands, replication,
and rendering need explicit decisions.

## Implementation sequence and review gates

1. Review/playtest this two-class pilot on desktop and mobile. Confirm distinct
   decisions, understandable feedback, and a modest power gain. Compare solo,
   mixed co-op, and bots; ground and flying bosses; early and upgraded builds.
2. **Merged and playtested:** subclass-passive infrastructure and the four pilot
   passives above. Review unlock, swap, ownership, limits and feedback before
   implementing the remaining subclasses.
3. **Merged and playtested:** Mage control-to-burst and Sorcerer prepared spell
   surge, including relevant subclass skills and upgrades (see below).
4. **Merged and playtested:** separate support identities: Cleric rescue, Paladin frontline protection,
   Druid territory/recovery, Bard sequences/rallies.
5. **Implemented for review:** Knight, Ranger, Barbarian, and Monk loops, reviewing subclass skills
   and capstones with each class rather than adding isolated bonus systems.
6. Prototype persistent companions and temporary forms independently. Add broader
   status combinations only when existing loops demonstrably need them.

Use one focused PR per milestone. Review behavior and player feedback before
expanding. Targeted tests during development; the full required CI checks before
PR review. Use a suitable coding model for routine content work; reserve stronger
reasoning for shared combat state, deterministic simulation and networking.
Avoid parallelizing the entire roster or running exhaustive simulations at this
stage.

## Compatibility contract

- Passive ownership is separate from equipped skills. Define whether it follows
  the active class, a copied ability, its owner, or a particular target.
- Grafts retain the copied skill's behavior. Do not grant an entire subclass
  passive merely because one subclass-looking skill was copied.
- Multiclass swaps must explicitly preserve or expire prepared effects. Prevent
  swap-refresh exploits and stale target references.
- Numeric procedural variants retain identity. Draft and Chaos Forge need safe,
  priced combinations and truthful generated descriptions. Prototype conditional
  effects before allowing arbitrary passive recombination.
- Damage/heal attribution, threat, invulnerability, flight, control resistance,
  boss packs, terrain and downed players need regression coverage.
- Tests should assert gameplay outcomes, not just renamed data. Deterministic
  seeds must reproduce outcomes, with no additional unseeded combat randomness.
- Compare clear time, survival, effective healing, meaningful control, and input
  clarity. Bot runs provide regression signals, not proof of human balance.

## Pilot playtest checklist

1. Rogue: Shadowstep, approach and Backstab within the dagger badge's window.
   Check that Slash does not consume the badge. Try a miss and let it expire.
2. Compare Backstab with and without preparation and from a boss's rear.
3. Warlock: put a grounded enemy in Hex, then attack it. Compare owner damage
   with an ally's attacks; leave the zone and observe mark expiration.
4. Use Hellish Rebuke nearby, then take one normal hit. Confirm one counterburst;
   dodge instead, or wait past the flame badge, and confirm no counterburst.
5. Try relevant subclass skills and grafted copies, with upgraded abilities.
6. Play a normal multi-fight run with adaptation enabled and report whether
   difficulty still feels excessive. Keep that feedback separate from whether
   the new loops are enjoyable; difficulty tuning may need a later change.

## Milestone 3: Mage and Sorcerer

Mage Fireball deals 25% extra damage against a slowed, rooted or stunned enemy.
The condition is checked at impact, before that shot's own on-hit riders; expired
control and haste do not qualify. Frost Nova, Evoker Cone of Cold and Abjurer Bind
provide setup; ally control can help too. Evoker Lightning Bolt gains a 20% bonus
and Sculpted Blast gains 25%. Combustion adds two percentage points per stack.
Direct spells still reach flying enemies, and boss invulnerability/CC resistance
continue to work normally.

Sorcerer Mirror Image and Arcane Phase prepare one spell surge for 8 seconds.
Meteor consumes it for half wind-up and an extra projectile sharing +20% total
direct damage; ordinary Chaos Bolts leave it available. Dragon Wings and Bend Luck also prepare it.
Chromatic Bolt also gains an extra projectile sharing its enhanced damage budget;
Chaos Surge, Dragon Breath and Tides of Chaos gain +20% damage with their existing
delivery. Greater Mirror Image extends readiness by 0.4 seconds per stack. Preparation refreshes without stacking
or shortening a stronger remaining window. Surge is committed when a cast starts:
its damage stays reserved through the wind-up, even if the readiness window would
expire. A blocked attempt does not spend it; an interrupted committed spell does.
Fused projectile spells with zone payloads retain their original projectile count
to avoid duplicating the zone effects. Swapping classes cancels a pending cast
and its reserved definition, while a still unused surge remains subject to its ordinary expiration. Copied abilities carry
their own interaction flags, and Forge preserves and prices the new components.

Base damage, cooldowns, existing defenses, inputs and boss difficulty rules are
retained. No additional subclass passives are introduced in this milestone. The
new indicator is one compact timed surge badge; descriptions explain the loops
in the existing codex and pause skill list.

Playtest Mage Fireball with and without a Frost Nova/ally-control setup, including
flight and immunity windows. Compare Sorcerer Meteor with and without surge, then
try its subclass spells, upgrades, copied skills, mobile controls and normal runs.
Assess how different the decisions feel as well as clear speed.

## Balance feedback to revisit

Live playtest feedback after milestone 2: some passives feel undertuned or
underwhelming, especially Fiend's Soul Ember. Keep this as a priority for a
separate balance/feel pass rather than silently changing it during another class
revamp. Its original maximum healing cadence was 2% max HP every 6 seconds (about
0.33% max HP/s before missed opportunities/overheal), plus a brief 10% ward.
Investigate both effective strength and whether the reward is noticeable; possible
changes include a stronger sustain/ward payoff or a clearer curse-to-retaliation
interaction. Compare proc frequency, effective healing, survival and feedback
before settling values. No Fiend buff is included in milestone 3.

## Milestone 4: distinct support identities

- **Cleric rescue:** Heal, Light Flash of Light and Life Mass Cure heal 30% more
  when the chosen ally is at or below 35% HP **before** healing. Effective rescue
  also wards that target for 15% less damage for 2 seconds. Ordinary healing remains
  unchanged; overheal/downed targets cannot trigger it. Greater Heal adds five
  percentage points per stack to its rescue bonus. Healing remains automatically
  targeted, capped at missing HP, and credited through the existing heal path.
- **Paladin frontline protection:** Divine Shield retains its personal mitigation
  and shares a 15% ward for 4 seconds with other living allies within 180u **at cast**.
  Devotion Aura of Protection shares 20% for 6 seconds within 220u. These are timed
  cast pulses, not following auras; they do not double-ward the caster. Shared wards
  refresh one source rather than multiplying with each other. Consecration also
  refreshes 10% mitigation for allies standing inside, lingering 0.75s after leaving.
  Greater Aegis increases its shared ward's duration by 1s and reach by 20u per stack.
- **Druid territory/recovery:** Entangle and Land Wall of Thorns retain their enemy
  effects and heal allies inside for 4/tick. Effective Regrowth and Moon Frenzied
  Regen plant a stationary 95u recovery grove at the healed target, healing 4/tick
  for 3 seconds. Each caster can keep **one** recovery grove across these skills,
  including grafts; later effective casts replace that caster's grove, not other
  healing zones. Overheal never creates or replaces it. Wild Growth adds 1/tick
  to Regrowth's grove per stack. Enemy flight still bypasses ground control; friendly
  healing/protection retains existing reach to airborne allies.
- **Bard verses/rallies:** an effective Healing Word or Whispers Healing Refrain
  prepares Harmony for 8 seconds. Casting Dissonant Whispers, Valor Blade Flourish
  or Shatter, or Whispers Psychic Blade/Words of Terror prepares Discord for 8 seconds.
  A cast contributes once; ticks and basic attacks never generate verses. Repeated
  verses refresh without stacking. Inspiration (or Valor Battle Hymn) consumes
  **both different verses** to share its existing buffs with all living allies in
  420u and add 15% speed for the buff duration. Without both, the original targeting
  and effects remain available. Bots prepare available verses before Inspiration.

This adds no support subclass passives, companion/form systems, buttons, permanent
text panels or networking messages. Skills carry their own hooks across grafts,
procedural variants and Forge compositions. Blocked casts never generate or spend
verses; preparation follows ordinary timed-buff expiration across class swaps and
never resets on swapping. Cast targeting uses toroidal distance. New support effects
are priced, capped, described and constrained to suitable deliveries in Forge.
Existing difficulty adjustment rules and weights are retained; the power estimator
includes recovery sustain with the existing territory occupancy discount and rescue
with a conservative 25% opportunity assumption. This estimates output, not human balance.

Playtest critically wounded vs moderately wounded allies; shared wards near and far
from a Paladin; choosing safe territory versus leaving a recovery grove; Bard heal →
disrupt → Inspiration in either verse order. Compare solo, co-op, bots, upgrades,
subclass choices and copied skills. `npm run smoke:support` exercises all four kits
on desktop and a 320px phone; combat tests verify their conditional outcomes.

### Additional balance/feel feedback after milestone 3

The player found the new Mage/Sorcerer interactions interesting, but highlighted
subclass coverage and redundant defenses. Treat these as a dedicated balance/skill
identity pass, preserving current functionality until replacements are reviewed:

- **Abjurer:** Otiluke Bind sets up control, but Fireball is currently its only
  clear burst payoff. Explore a ward-to-release or control-to-protection interaction
  that makes its defensive choices work with the base kit without copying Evoker's
  damage identity. Arcane Ward should offer an active decision or useful ally payoff,
  rather than only a timed reduction in damage taken.
- **Sorcerer:** Draconic Scales and Wild Ward duplicate simple mitigation.
  Give each a distinct themed job, such as draconic retaliation/positioning versus
  a clearly previewed wild-magic alteration of the next cast. Avoid three defenses
  with different names and percentages.
- **Dragon Wings:** already gives flight, speed and surge. Prefer replacing its
  damage reduction with a wing-themed interaction (a takeoff peel, aerial targeting,
  or a landing payoff), rather than adding another bonus on top. Prototype one
  bounded effect and inspect flight/ground-zone and mobile execution behavior.
- Audit other mitigation-only skills as their classes are revisited. Protection
  can remain valuable, but a replacement should add decisions and thematic variety.
  Do not force a damage bonus onto every subclass skill; every offered skill should
  have a legible purpose in its class/subclass loop.

No Abjurer, Sorcerer defense, Dragon Wings or Fiend balance change is included in
milestone 4. The existing proposed subclass passives should be revised alongside
these skill decisions rather than bolted onto redundant defenses unchanged.

## Progress and revised review sequence

The original six milestones grouped work by theme; they did not include every
remaining passive or the balance work discovered during playtests. Avoid treating
“milestone 5 of 6” as “one patch left until everything is finished.”

| Workstream                 | Merged and playtested                | This PR                       | Still outstanding                                    |
| -------------------------- | ------------------------------------ | ----------------------------- | ---------------------------------------------------- |
| Base class loops           | 12/12 classes plus martial coherence | None                          | Ongoing tuning                                       |
| Defining subclass passives | 4/24                                 | None                          | 20: 18 in ordinary batches, companion and form       |
| Balance/skill identity     | Feedback collected                   | Enemy debuffs / Fiend sustain | Catalogue-wide defense/recovery review, Fiend tuning |
| Companion/form systems     | None                                 | None                          | Beast Master companion and Moon form prototypes      |

**Current sequence:**

1. **Merged/playtested:** Cleric absorption, Chain Pull momentum, Cleric tuning and Paladin auras.
2. **Merged/playtested:** Shared ability readability and Paladin aura tuning.
3. **Merged/playtested:** Mage/Sorcerer defensive skill identity.
4. **This PR:** Enemy debuff feedback and the targeted Soul Ember sustain adjustment.
5. Balance pass B: remaining defensive/recovery skill identity; evaluate the new Soul Ember values live.
   Keep all unnamed candidates in scope; retain useful aura/class interactions.
6. Three batches for the 18 remaining non-companion/non-form subclass passives,
   roughly six passives per PR, with their related skill/upgrade coherence reviewed
   together. Revise each proposed passive around its final class loop first.
7. Beast Master companion prototype plus its defining passive.
8. Moon form prototype plus its defining passive.

After this absorption batch, **about seven further PRs remain** (2 defensive/balance
PRs, 3 passive batches, companion, form), with scope adjusted if playtests justify
combining or splitting related work. It is a scope estimate, not a calendar estimate.
Integration/balance checks belong in every batch; a final tuning patch may still
be warranted. Recommend increasing _related content_ per PR (the current four-class
batch and future six-passive batches), while keeping new shared systems independently
reviewable. Combining all mechanics at once would obscure which change caused a
balance or networking regression. These are proposals for the next review gates,
not authorization to implement all remaining systems in this PR.

## Milestone 5: martial decisions

- **Knight guarded counter:** Shield Wall guards for 4s; Battlemaster Rally guards
  for 5s. The first damaging, nonlethal hit in that window readies one +30% melee
  hit for 4s. Existing mitigation remains. Dodges, zero damage and lethal damage
  cannot prepare it; misses, invulnerability and ranged hits preserve the readied
  counter. A cone's first connecting enemy consumes it, not every enemy in the cone.
  Champion's melee skills also spend it. Impenetrable extends the guard window
  alongside Shield Wall's defense duration. This rewards responding to a hit that
  was already guarded, not intentionally standing in a dangerous telegraph.
- **Ranger firing lanes:** each direct Multishot/Volley arrow passes through one
  additional distinct enemy; Hunter's Mark passes through two. Basic Arrow stays
  single-hit. The same arrow never damages the same body again; cover still stops
  it, and its lifetime/range budget is unchanged. Blast/zone-bearing upgrades and
  Forge fusions keep a single impact so payloads cannot duplicate. Rain of Arrows
  adds a 25% movement slow, lingering 0.8s, retaining its airborne reach and damage.
  This favors aligned packs/adds without simply increasing every single-target hit.
  Existing Beast Master snares can help hold a lane; the pet remains deferred.
- **Barbarian momentum:** Rage/Frenzy/Wolf Spirit enables melee-hit momentum for
  its authored window. Actual melee damage earns up to three stacks, at most one
  per 0.4s across all targets. Whirlwind, Reckless Cleave, Ground Slam and Earth
  Totem spend them for +10% direct damage per stack and +8u cone reach or +10u
  burst radius per stack. This is a finisher payout, not a permanent damage buff.
  Momentum expires with its preparation window; a fresh rage clears old stacks.
  Wind-up casts reserve the payout at cast start; interruption spends it without
  a hit/refund. Bots wait for stacks or imminent expiry unless danger calls for
  an immediate finisher.
- **Monk movement/Flow:** Step of the Wind, Open Hand Wind Step and Shadow Step
  prepare Flow for 4s after unrooted mobility. Stunning Strike, Quivering Palm,
  Flurry Barrage, Wave Palm and Shadow Strike spend it to remove wind-up and gain
  +30u cone reach or +35u burst radius. Existing damage, control and movement
  remain. Basics leave Flow available. A committed finisher spends it even on a
  miss; blocked cast attempts preserve it. Wind Walker extends Flow by 0.5s per stack.

Copied/rolled/Forge skills carry their own interaction flags; no new subclass
passives, buttons or resources are unlocked. Existing timed-buff expiration applies
across swaps; swapping never refreshes preparation, and pending casts use the
existing cancellation rules. Enemy immunity, flight, crit/backstab, attribution,
CC resistance and projectile cover remain on their established paths. The adaptive
difficulty rules are unchanged; conditional counters, geometry and piercing are
bounded utility/conditional output rather than new permanent stats.

Bard's status and skill descriptions now explicitly explain that Harmony and
Discord have **no standalone stat effect**. The pause menu provides a readable
recipe (effective heal + disruptive special → Inspiration/Battle Hymn before either
8s verse expires → shared skill buffs and 15% speed). No permanent combat text panel
is added. This is a clarity fix; the Bard's mechanics are unchanged.

### Feedback after support playtesting: prioritize defensive identity

Druid territory felt good. Bard's two preparations were visible but their individual
meaning and payoff were unclear; address that explanation immediately (above).
Cleric rescue mitigation should become absorption; Paladin's brief cast-pulse wards
felt too small/short-lived to establish its role. The following mechanics remain
**planned for the next defensive/balance PRs**, not implemented here:

- **Cleric absorption bubbles:** a separate temporary pool absorbs incoming damage
  before real HP, with any excess reaching HP normally. It is not increased max HP
  and must not count as healing twice. Start with post-mitigation damage consuming
  absorption; explicitly verify immunity, lethal overflow, lifesteal, counterattack
  triggers, death/revive, attribution, swaps and replicated HUD amounts. Show a small
  shield segment/bubble so players understand how much protection remains.
- Replace the rescue ward with a bounded absorption pool, preserving the rescue heal.
  Rework Warding Flare/Preserve Life into distinct targeted or nearby-group bubble
  applications rather than multiple mitigation-only buttons. Keep solo usefulness.
- **Sanctuary overflow:** unused healing can add absorption when health is full,
  capped across overlapping Sanctuaries/casters by a shared target ceiling. Convert
  only the unused healing, not both the entire heal and a full shield. Expire the pool
  after a short window out of the zone, and prevent indefinite pre-fight stockpiling.
  Scale pool generation from healing with a max-HP ceiling; a tank's large HP pool
  should not automatically multiply every healer's output. This gives preemptive
  protection a different job from reactive rescue; it also increases effective
  durability and must be reflected conservatively in the power estimator.
- **Paladin moving auras:** skill use creates a timed area following the Paladin,
  refreshing a short-lived benefit on nearby living allies. Repositioning then
  matters throughout its duration, rather than only at cast. One active aura per
  owner is a useful first constraint; strongest equivalent aura wins across multiple
  Paladins instead of multiplying all sources. End it on expiry, downing or owner
  departure; make class-swap/copy ownership explicit.
- Proposed aura roles: **Divine Shield → Bulwark** (protection, possibly limited
  control-duration reduction rather than full CC immunity); **Sacred Weapon/Hunter's
  Vow → Pursuit** (movement assistance toward combat, with a bounded empowered hit
  rather than another permanent damage multiplier); **Lay on Hands/Bless → Renewal**
  (brief nearby recovery after an effective heal, without generating shields or
  rewarding overheal). Choose concrete delivery/targeting and values in its PR.
  Retain Consecration as stationary holy ground so it does not become redundant
  with a moving recovery aura. Offer visible, restrained aura feedback without
  covering mobile screens with multiple rings and descriptions.

These ideas add distinct defensive decisions, but also risk trivializing sustained
boss pressure if regeneration, absorption and mitigation all stack unchecked.
Prefer replacing redundant effects and shared caps over adding every proposed bonus
on top. Evaluate solo and multi-support parties, fixed encounters and adaptive runs,
and clarity separately from numeric strength. Do not require players to stay inside
an aura at the cost of avoiding a dangerous telegraph.

## Martial subclass coherence follow-up

The twelve base-class loops are now merged and playtested. This follow-up addresses
subclass gaps before starting the defensive foundation:

- Champion Riposte connects to counter readiness: a connecting strike prepares one
  +30% melee hit for 4s and a 0.75s parry reducing incoming damage by 40%. Misses do
  neither; readiness is awarded after the full cone, never chained between victims.
- Berserker Frenzy retains its offensive buffs and hit-built momentum, but costs
  2% maximum HP per second and leeches 20% of effective direct-hit damage. The cost
  stops at 1 HP; zones, retaliation and overkill cannot farm healing.
- Totem Wolf Spirit instead builds momentum through 120 units of actual walking
  per stack, retaining the shared three-stack cap and 0.4s gate. Blocked input,
  jumps, teleports and forced movement do not qualify. Starting another rage mode
  replaces the previous mode and its momentum, preventing stance stacking.
- Shadow Dart spends Flow for an instant cast and a brief 0.6s stun. Cloud of Shadow
  spends Flow for an instant, wider (+35 units) slowing cloud (60% movement, 0.8s).
  Flurry basics extend existing Flow by 0.25s per effective hit, capped at one extra
  second per preparation. Existing stronger control is preserved. These rules also
  survive Forge composition and use existing enemy immunity/resistance paths.
- Beast Master remains unchanged pending its defining companion passive, as agreed.

### Plain recovery skills: review with the defensive work

Avoid adding another full heal on top of every defensive mechanic. Audit actual
current skills rather than assuming every heal is still plain: Druid regeneration
already creates a grove, Bard recovery prepares a verse, and Cleric heals rescue.
The remaining candidates include Second Wind, Nature Bond, Life Transfer, Spirit
Mend, Bless and Wholeness of Body. Proposed directions, not implemented here:

- Second Wind: recovery tied to a guarded counter rather than another mitigation buff.
- Nature Bond: companion mend/recall alongside the future pet, retaining solo use.
- Life Transfer: deliberate protective ward transfer after absorption is available.
- Spirit Mend: momentum-finisher recovery or a distinct recovery totem.
- Bless: the planned Renewal aura rather than a redundant standalone heal.
- Wholeness of Body: Centering Breath, a usable ordinary recovery that can spend
  Flow for healing over time and a limited slow/root cleanse. Decide amounts and
  interruption rules during its defensive pass; do not make recovery require Flow.

### Remaining delivery estimate

After this extra feedback patch, approximately eight reviewable PRs remain at the
current scope: three defensive/balance passes (absorption, auras, remaining defense
and recovery reworks), three batches of non-companion/form defining passives,
then Beast Master's companion and Moon Druid's form. This is a scope estimate,
not a delivery-date promise. Six related passives per batch is a reasonable increase;
keep absorption, moving auras and companion AI separate because each creates new
state, replication and stacking risks. Fiend tuning and the Abjurer/Sorcerer
redundant protection feedback remain on that defensive/balance list.

## Defensive batch 1 (merged/playtested): absorption and the full protection audit

Martial subclass coherence is merged and playtested. This batch implements the
absorption foundation, Cleric rescue/defensive/healing-ground uses, and the small
Chain Pull follow-up. Chain Pull spends the same bounded momentum as other marked
finishers (+10% damage and +8u cone reach per stack); its pull distance stays fixed.
Bear Spirit is deliberately reserved for the protection rework below.

Absorption is temporary protection HP, separate from real HP and maximum HP.
Damage reduction applies first, then absorption, then remaining damage reaches HP.
A single shared target pool caps at 30% max HP; direct casts keep the strongest
amount rather than adding multiple casters' bubbles. A weaker/equal direct cast
cannot refresh a full stronger bubble. Shield grants produce neither healing
score nor healing threat. Real hits absorbed by the pool retain guard/rebuke
reactions; immunity bypasses consumption and reactions, and enemy lifesteal counts
only HP damage. Death/downing and Phoenix revival clear protection. Ordinary
class swapping does not refresh it, and max-HP changes clamp the ceiling.

- Rescue heals keep their low-health healing bonus and replace their old mitigation
  with absorption equal to half the effective heal, capped at 15% max HP, for 3s.
- Warding Flare protects the lowest-health living ally (including the caster) within
  420u: 40 absorption for 4s. Preserve Life protects nearby living allies within
  260u: 30 absorption for 5s. Both use the shared ceiling and retain solo use.
- Sanctuary and Blessed Bloom convert only unused healing into absorption, capped
  at a shared 15% max HP across all overlapping zones/casters. It lingers 3s after
  renewal stops. Overflow cannot extend a larger direct-cast bubble. Druid groves
  and unrelated healing zones retain their own behavior. Copied/Forge zones carry
  the explicit overflow property, including projectile impact zones.
- Protection has a cyan bubble/health strip, a visible local amount and descriptive
  buff badge. Existing snapshot buff fields replicate the amount and remaining time.
- Skill upgrades and Forge budgets include absorption; the power estimator values
  temporary sustain conservatively. Adaptive difficulty formulas are unchanged.

### Scope clarification: audit every mitigation-only skill

The request applies to **the entire authored catalogue**, not only named examples.
The earlier "as their classes are revisited" wording was too weak: explicitly
inventory all base and subclass abilities before the identity/balance pass. Evaluate
copied skills, their Honed/grand upgrades, subclass passives and Forge compatibility
alongside each rework. This is not an instruction to remove every damage reduction
rider: keep useful protection when the skill already has meaningful decisions.

Current remaining primary candidates include:

| Class     | Skills to review                                           | Planned handling                                                                       |
| --------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Knight    | Review Rally/Shield Wall coherence                         | Add a distinct frontline/team purpose; retain existing counter identity                |
| Mage      | Arcane Shield, Arcane Ward                                 | Give warding/control choices useful beyond Fireball                                    |
| Barbarian | **Bear Spirit**                                            | Rework a thematic defensive/rage choice; do not add momentum merely to fill a checkbox |
| Rogue     | Smoke Bomb, Shield Spell                                   | Distinct evasive/control or spellblade decisions; preserve existing passives           |
| Paladin   | Divine Shield, Aura of Protection                          | Reevaluate base wards; retain moving aura roles                                        |
| Bard      | Bolster                                                    | A meaningful Valor protection decision connected to the verse loop                     |
| Sorcerer  | Draconic Scales, Wild Ward; Dragon Wings' mitigation rider | Replace repetitive protection; give Wings an aerial payoff rather than more mitigation |
| Warlock   | Dark Resilience                                            | Fit Fiend's sustain/counter identity and planned tuning                                |

Also review skills bundling mitigation with damage, movement or shared protection
(e.g. Blessing, Inspiration, Mirror Image, Rally and Battle Hymn variants) for
redundancy and clarity. Keep their useful existing interactions unless a rework
improves their role. Review all newly found candidates even if absent from this
inventory; membership is determined by actual effects, not this finite name list.

### Updated remaining sequence

After this batch is merged/playtested: approximately seven PRs remain at the
previous pace — Paladin auras; the catalogue-wide defensive/recovery/identity
balance pass; three batches of non-companion/form passives; Beast Master companion;
Moon form. The broad balance pass may need splitting after its audit: keep the
estimate provisional rather than promising a fixed patch count. The plain-heal
review and Fiend tuning remain included in that pass.

## Support batch 2: Cleric tuning and Paladin moving auras

The first bubbles were too restrictive in playtests. Their small caps and short
expiry limited visible value, and rescue-only delivery made ordinary healing feel
unrewarding. Include Cleric tuning immediately alongside the related Paladin work.
Smite also needs a modest increase: bubbles alone do not shorten weak solo fights.

| Cleric effect                            | Previous                                         | This batch                                                                |
| ---------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------- |
| Shared absorption ceiling                | 30% target max HP                                | 50%                                                                       |
| Healing-ground overflow ceiling / linger | 15% / 3s                                         | 30% / 6s                                                                  |
| Warding Flare                            | 40 protection / 4s                               | 70 / 7s                                                                   |
| Preserve Life                            | 30 protection / 5s                               | 55 / 8s                                                                   |
| Effective ordinary direct heal           | No bubble                                        | Adds 25% effective healing, capped at 15% max HP                          |
| Effective rescue direct heal             | 50% effective healing, capped at 15% max HP / 3s | Ordinary bubble **plus** 75% effective healing, extra cap 30% max HP / 6s |
| Smite                                    | 12 damage                                        | 16                                                                        |
| Heal                                     | 60                                               | 75                                                                        |
| Flash of Light / Mass Cure               | 70 / 80                                          | 85 / 100                                                                  |
| Sanctuary / Blessed Bloom                | 10 / 14 heal per tick                            | 14 / 18                                                                   |

Heal-generated bubbles add to existing protection within the shared ceiling;
ordinary and rescue contributions combine in one cast. They require effective
healing, preserving Sanctuary's distinct role as preemptive protection at full HP.
Adding protection does not shorten an existing longer-lived pool. Ordinary direct
shield casts retain strongest-amount behavior rather than adding multiple casters.

These authored buffs retain their **pre-tuning party-power credit**, including
copied skills and Forge composition. The estimator uses explicit tuning metadata;
Forge's content budget still prices the real effects. Upgrade and seeded rounding
must not turn this balance buff into a higher party-power difficulty charge.
Wave progression and the existing performance/pace feedback remain unchanged;
this is not a promise that subsequent encounters never scale in a faster run.

Paladin skills now activate one following field per caster:

- **Bulwark:** Divine Shield and Aura of Protection give nearby living allies 10%
  damage reduction and 25% shorter new stuns, roots, slows and silence. Retain each
  skill's existing personal defense. This is proactive control resistance, not cleanse.
- **Pursuit:** Sacred Weapon and Hunter's Vow give nearby allies 12% movement speed
  and one +15% connecting melee hit per activation. Reentering does not replenish
  the hit. Overlapping equivalent fields do not multiply the preparation.
- **Renewal:** an effective Lay on Hands or Bless starts 6 HP/s nearby recovery.
  Equivalent recovery fields share one pulse; healing attribution is stable rather
  than rewarding the number of overlapping Paladins. Recovery pulses cannot trigger
  rescue bubbles or recursively restart the aura.

Default radius 220u, duration 5s; Aura of Protection uses 240u / 6s. Fields move
with the owner and stop on expiry, downing/death, departure, scene change or class
swap. New activation replaces the previous field. Allied recipients use strongest
equivalent effects; fields and readiness are visible through restrained rings,
status badges and pause descriptions. Existing legacy shared-ward components remain
functional for copied/composed data. Honed/grand and Divine Shield upgrades preserve
and improve their applicable field geometry/duration.

### Pace and remaining scope

This larger support batch pairs a planned shared system with related playtest
feedback. Continue grouping related skill tuning with each six-passive batch;
keep companion AI and transformation state in separate PRs. Approximately **six
planned PRs** remain after this batch (broad identity/balance pass, three passive
batches, companion, form). The full defensive/recovery audit may warrant two
cohesive passes, which would make seven; this is provisional scope, not a delivery-date estimate. Bear Spirit and the complete mitigation-only inventory remain
part of that audit, alongside plain-heal reworks and Fiend tuning.

## Readability batch: actual recipients and recognizable effects

Insert this focused presentation patch before the broad identity/balance pass.
It addresses playtest feedback across the shared base/subclass/Forge paths, rather
than waiting for every class to be reworked. See [the full audit and visual
language](ABILITY_READABILITY.md). Cleric bubbles and Paladin auras have been merged
and playtested; their historical numbers above describe those earlier patches.

- Faint hollow reach hints are distinct from actual recipient feedback. Healing,
  empowerment, mitigation, speed and absorption have different geometric symbols.
- Actual applications produce short caster-to-recipient links and grouped symbols;
  full-health direct heals and unsuccessful bubble refreshes do not claim receipt.
- Bubbles have a visible enclosing shell; positive states have small persistent
  symbols. Friendly healing/mixed ground effects identify their actual payloads.
- Bulwark uses shield posts; Pursuit rotating chevrons; Renewal crosses. Each
  keeps an exact circular range boundary and recipient status cues.
- Aura tuning: Bulwark 15% damage reduction / 35% shorter new control; Pursuit
  18% speed / one 25% prepared hit; Renewal 10 HP/s. Radius, duration and strongest
  equivalent rules stay unchanged. No new party-power charge is introduced;
  existing wave/pace feedback remains active. Forge budgets price real effects.

**Rework eligibility is based on the original job and actual gameplay decisions,
not whether another system added a rider.** Divine Shield and Aura of Protection
still require base-skill evaluation while preserving their auras. Apply this rule
to every class, upgrade and copied/composed skill. Stand as One belongs to Ranger;
include it in that class's defensive/recovery audit, correcting the earlier Knight
inventory attribution. All other candidates, including Bear Spirit, plain heals,
Dragon Wings and Fiend tuning, remain in scope.

After this additional readability patch, approximately six planned PRs remain:
the broad identity/balance audit, three passive batches, companion, and form.
Split the broad audit into two if its size warrants it (seven remaining). This
patch adds a deliberate review checkpoint; continue bundling related tuning,
without combining companion AI or form state with unrelated systems.

## Balance pass A: caster defensive identity

The broad pass is deliberately split into coherent reviews. This first batch
reworks five repetitive Mage/Sorcerer defenses, retaining IDs and compatible
upgrade/Forge paths. It does not implement new subclass passives or revisit the
readability presentation, which needs more live testing.

| Skill                  | New job                                                                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arcane Shield (Evoker) | 180u directional cone, 28 damage and 90u knockback, plus 35 self absorption for 4s. A peel rather than another generic mitigation timer.                         |
| Arcane Ward (Abjurer)  | 50 self absorption for 6s and a 150u burst for 24, +35% against already controlled foes; applies 50% slow for 3s to prepare the next spell.                      |
| Dragon Wings           | 7s flight and 40% movement speed, retaining 8s Surge preparation; removes the mitigation rider. Mobility and ground-hazard avoidance are its defensive identity. |
| Draconic Scales        | 55 self absorption for 6s with a 145u burst for 22. Can spend Surge on the burst; the shield does not multiply with Surge.                                       |
| Wild Ward              | A centered 125u, 4s recovery field: 10 healing/tick, enemies slowed to 65%; prepares Surge for 8s. Territory/party sustain instead of a third mitigation timer.  |

Self bubbles retain the common 50%-max-HP cap and strongest-cast rules; they do
not divert to a nearby injured ally. Ground-zone slowing respects existing flight
and ground rules. Current Honed/grand behavior remains compatible pending the
larger upgrade redesign. Fix cone range being scaled twice by a shield-bearing
upgrade; do not silently add an extra growth multiplier.

The previous pure defenses carried no damage/healing party-power credit. New
payloads retain that pre-rework credit through existing tuning metadata, including
upgrades and composition. Forge budgets price the real effects. Wave/kill-pace
feedback remains active. This is a balance decision for these replacements, not
blanket permission to make future upgrade growth free in the estimator.

**Next:** balance pass B retains all remaining defensive/recovery candidates,
including base Paladin wards despite their auras, Knight/Ranger defenses, Bear
Spirit, Rogue defenses, Bard Bolster, Warlock resilience/Fiend tuning and the
plain-heal inventory. Review related redundant bundled skills too; these names
are examples, not the boundary of the audit. Then resume the three passive batches,
companion and form work, retaining useful interactions and doing necessary upgrade
compatibility alongside each implementation.

## New workstream: upgrade identity and branching builds

The request includes the entire upgrade catalogue: base and subclass skills,
Honed upgrades, grands, grafts and their followups. See
[Upgrade identity roadmap](UPGRADE_IDENTITY_ROADMAP.md) for the measured inventory,
research/design checkpoint, candidate branches, compatibility requirements and
staged rollout. This is a larger design task; do not disguise generic numerical
scaling with more colorful descriptions or make every branch depend on the same
class mechanic.

After this patch, **six skill/passive/system PRs** remain at the current grouping:
balance pass B, three passive batches, companion and form. The upgrade workstream
adds an estimated **four to six PRs** (audit/design, pilot and two to four followup
batches), bringing the provisional total to **ten to twelve**. This is revised
scope, not a delivery-date commitment. Begin upgrade inventory/research alongside the remaining balance/passive work.
Finalize the pilot once its chosen classes have stable contracts, rather than
waiting for the whole catalogue; companion/form-specific upgrade design follows
those prototypes. Revisit the
batch sizes after the pilot rather than implementing hundreds of upgrades at once.

## Enemy debuff feedback and Fiend sustain tuning

Additional live feedback identified enemy debuffs as hard to read under damage
numbers. This requested visibility checkpoint precedes the broader balance-B
skill reworks; it does not mark balance B complete.

- Draw enemy status cues in a separate foreground layer above combat numbers and
  particles, for all boss/add body paths. Cyan corner brackets mean live slow,
  root or stun, using the same predicate as control-burst damage at impact.
- Distinct backed geometric badges identify primary control, slower casting,
  silence, curses, weakened damage and vulnerability. Stun takes display priority
  over root/slow in the original implementation; this was a visibility defect,
  corrected below. The control window persists while any qualifying control remains.
  The original six-boss/two-add caps are also removed; no extra floating text is added.
- A dot identifies a personal curse. Serialize an optional numeric curse owner
  on enemy buff views, without private source/proc fields. Old snapshots display
  a generic curse rather than claiming ownership.
- Match real remaining durations, clamp badge rows to the viewport, clear on
  expiry/death, and explain the symbols in the collapsed pause key. Casting slow
  and curse alone must not imply Fireball's control bonus; bonuses check on hit.
- **Soul Ember:** heal 5% max HP rather than 2% from personal-curse damage, once
  per 6s; retain its 10% mitigation for 3s and all effective-damage/death/ownership
  gates. This is the targeted Fiend sustain adjustment already on the balance
  list, not a rewrite of its defensive skills. Passive power credit and difficulty
  formulas are unchanged; normal wave/kill-pace feedback remains active.

Validation includes debuff/control-condition parity, overlapping/expiring states,
personal versus other/unknown curses, snapshot boundaries, bounded geometry and a
real-renderer browser fixture under dense hit-number traffic at desktop, portrait
mobile and landscape sizes. The fixture is development-only; it adds no production
combat/debug controls.

**Next remains the broader defensive/recovery balance batch**, including Dark
Resilience and Paladin base wards despite their useful new interactions, the other
recorded mitigation-only candidates and plain heals. Fiend sustain tuning is now
implemented; evaluate it live before adding more passive power. Keep the upgrade
research/pilot workstream and remaining passive/companion/form sequence from
[the upgrade roadmap](UPGRADE_IDENTITY_ROADMAP.md). The provisional future count
remains six skill/system batches plus four to six upgrade batches, subject to
scope and playtesting; this new feedback patch does not silently complete the
remaining skill reworks.

## Simultaneous effects correction and class-coherence checkpoint

Live testing exposed a flawed display compromise: root/stun suppressed slow, and
boss/add limits hid other still-active categories. This patch shows all eight
supported harmful categories together, grouping repeated sources by **effect type**,
not choosing one ability or one caster. Control comes first, personal curse next,
then other team state. Adds use a shorter four-column grid. The curse badge lasts
through any remaining caster's mark, while its personal dot expires independently.
No combat magnitude, duration, passive or difficulty calculation changes here.

Only curses currently replicate reliable ownership. Do not label unowned slow/root
as yours or infer ownership from the current class. Their categories remain visible
regardless of origin. Per-caster attribution for every debuff is a separate engine
contract, not something the renderer can safely invent. A single slow badge denotes
an active slow; it does not promise that multiple sources stack multiplicatively.
Regression checks cover both root/slow expiry orders, mixed ownership, eight badges
on bosses and adds, and the real foreground renderer on three viewport sizes.

### Balance B1 design brief — Warlock kit coherence (implementation below)

The existing pilot improved the base loop but did not sufficiently distinguish
subclass choices. Code inspection confirms Hex and Dissonant Whispers are both
personal-curse damage zones with movement slowing; Hex also slows wind-up. Fire
Pit is currently only a damage zone, and Dark Resilience remains a 45%-mitigation
self buff. The recent Soul Ember increase does **not** complete this work.

Review these four contracts together before coding the next balance batch:

| Skill              | Design direction to prototype                                                                         | Required distinction / guardrail                                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Hex                | Keep the baseline hindering curse and owner damage access                                             | Useful without a subclass; retain wind-up/slow identity and flight rules                                                                        |
| Dissonant Whispers | A debilitating curse that weakens enemy outgoing damage instead of duplicating Hex's movement slow    | A team-facing enemy effect, with capped/nonmultiplying overlap; compare value against interrupt/control needs                                   |
| Fire Pit           | A searing curse zone, giving Fiend another personal-mark source and deliberate area placement         | Sustain/pressure access rather than another copy of Hex's hindering package; do not add unlimited healing per tick or per enemy                 |
| Dark Resilience    | Prototype a bounded curse-siphon defensive action, e.g. a short barrier drawn from nearby marked foes | Must still work in a boss-only encounter and weak builds; cap enemy-count scaling, preserve curse access and give meaningful timing/positioning |

These are prototype directions, not shipped promises or final numbers. Compare an
alternative if the siphon merely creates another automatic bubble with no changed
decision. Retain stable skill IDs and existing useful counterburst interactions.
Check Hurl Flame, Mind Blast, Tentacle and Entropic Ward in the same kit review:
not every skill must apply a curse, but each must have an understandable role and
an intentional relationship or useful alternative to the subclass loop.

Before implementing differentiated marks, resolve the engine contract explicitly:
currently personal curses share `curse:<owner>` and refresh by source; the damage
multiplier reads that single refreshed personal mark rather than multiplying marks.
Multiple curse _riders_ must not accidentally overwrite one another, amplify other
players' damage, or disappear in copied/composed skills. Specify overlap, expiry,
flight, ownership, proc cadence and effective-hit rules first. New curse categories
must also have legible feedback; simply tinting identical zones is insufficient.
Keep Soul Ember at its current 5%-max-HP / 6s gate until testing this full kit. A
stronger passive cannot substitute for meaningful active choices.

### Remaining balance B2 and catalogue-wide audit

Dark Resilience remains mandatory in B1. B2 covers remaining mitigation/plain-heal
and redundant defensive candidates **across the catalogue**, including unmentioned
ones. An aura, preparation effect or other new rider does not clear the underlying
rework debt. The current authored `buffDefMult` search also identifies Shield Wall,
Rally, Stand as One, Bear Spirit, Smoke Bomb, Shield Spell, Divine Shield, Aura of
Protection, Bolster and Mirror Image; inspect mixed Blessing/Inspiration as well,
without assuming every mitigation rider should be removed. Retain useful class
interactions and assess the base action itself. Search recovery-only skills and
upgrades too; the names above are a starting inventory, not a whitelist.

Add a cross-class coherence review to each planned passive/upgrade batch, prioritizing
early Rogue/Warlock, then Mage/Sorcerer, support and martial loops. Look for duplicate
jobs, unreachable subclass payoffs, insufficient setup choices and misleading
upgrade text. Intentional alternatives need comparable value, not forced interaction
with every resource. Avoid turning every defense into a bubble, every attack into
a spender or every subclass into the same class loop with a different color.

### Pre-delivery design review (in addition to correctness tests)

For each touched class, record a short review in its PR:

1. **Decision and alternatives:** state what changes in timing, placement, target or
   risk; compare with the nearest existing skill. If only names/numbers differ,
   justify that simplicity or revise the design.
2. **Access and payoff:** map base kit and both subclasses separately. Demonstrate
   two useful sequences per subclass and a fallback when a reward/setup is absent.
   Check boss-only, adds, solo and cooperative cases; a full-catalogue average can
   hide a subclass with no access to the advertised mechanic.
3. **Adversarial examples:** try overlapping sources, early expiry, resisted control,
   flight, no effective damage/healing, no injured allies, and capped resources.
   Verify the displayed promise still matches actual behavior. This patch's example:
   root must not conceal an independently active slow, even though both enable burst.
4. **Integration and balance:** inspect Honed/grand/graft/Forge/native/composed paths,
   attribution, recursion, stacking and party-power credit; compare a fixed encounter
   before adaptive runs. Keep meaningful bounds instead of blanket difficulty exemptions.
5. **Evidence and limits:** cite relevant tests and desktop/touch observations; state
   what still needs human playtesting. Passing tests proves contracts, not fun or balance.

Apply this review to the current visibility fix: every active category survives the
priority policy; duplicate-source badges stay bounded; curse ownership expiry is
independent of other casters; boss/add and portrait/landscape cases are exercised.
No extra unverified ownership labels or unrelated numerical buffs are introduced.

For larger redesigns, research specific decisions in comparable games (curse limits,
overlap, defensive counterplay, build opportunity costs), recording sources and why
they fit this game's boss/co-op/mobile constraints. Prior research targets remain
in the upgrade roadmap; they are not evidence that those mechanics were validated
here. Do not copy complexity or claim external research without checking sources.

**Progress:** this is a corrective visibility patch, not completed balance B.
Split the former broad B into **B1 Warlock coherence**, then **B2 remaining defenses**.
That makes seven planned core/system batches (B1, B2, three passive batches,
companion and form), plus four to six upgrade batches: roughly **11–13 future PRs**.
Coherence review is part of those deliveries, not a new chain of audit-only PRs.
Revisit grouping after B1 playtesting; do not enlarge a patch merely to reduce its count.

## Balance B1 delivered for review — Warlock curse coherence

This batch implements the Warlock kit checkpoint. It does not complete B2, the
other plain-defense/plain-heal candidates, or the larger branching-upgrade redesign.

| Ability / passive  | Implemented role and bounds                                                                                                                                                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hex                | Baseline hindering curse: movement to 70%, wind-up +40%, personal damage +15%. Existing damage/cooldown/flight rules stay.                                                                                                                                |
| Fire Pit           | Searing pressure curse: existing 13/tick zone plus +15% owner damage mark, lingering at least 4s. No extra movement slow or per-tick healing proc.                                                                                                        |
| Dissonant Whispers | Dread zone: existing 11/tick, +15% owner damage and 20% weaker enemy attacks, at least 2s linger. Replaces its movement slow; equivalent dread weakness uses only the strongest instance.                                                                 |
| Dark Resilience    | Replaces 45% damage reduction with 30 self absorption for 6s. Siphons up to two distinct personally cursed enemies within 300u for 20 base damage each; each successful damaging hit adds 20 protection. 50% max-HP shared shield cap; no marks consumed. |
| Soul Ember         | Retains 5% max-HP heal, 10% mitigation for 3s, and 6s cooldown. Requires missing health, so full-health damage no longer spends the trigger **or grants the mitigation**. Effective damage, alive-caster and ownership gates remain.                      |
| Dread Insight      | Retains +8%; personally cursed foes with weakened damage now qualify as well as slow/root/stun/wind-up slow. Whispers therefore enables its own subclass payoff. Weakness alone does not enable Fireball control-burst.                                   |

### Overlap, ownership and combat boundaries

Each curse cast has an independent owner/family/zone source. Repeated ticks refresh
that cast; a weaker overlapping cast, including another cast of the same family,
cannot overwrite a stronger mark or prolong its strength. Damage uses the strongest
active **personal** mark across all casts, never their product and never another
player's mark. Legacy `curse:<owner>` sources still work. Optional numeric ownership
continues to cross the snapshot boundary without private source labels.

Dread weakening is independently timed per cast and takes its strongest multiplier
across casters, while ordinary unrelated damage buffs retain their existing rules.
It affects ordinary boss ability execution (including committed projectiles/zones)
and add attacks. It does not retroactively weaken already-launched attacks or
claim to suppress environmental terrain/affix damage. Ground curse zones still
respect boss flight and ranged arming; airborne composed zones retain reach.
Hex wind-up slowing now also reaches adds in range, matching its snapshot/payload,
though ordinary adds have no ability wind-up to slow.

Siphon has no recursive damage or shield tick. It targets at most two bodies,
regardless of mark count, and earns no bonus from invulnerable targets, allied
marks, expired marks, dead enemies or out-of-range enemies. The 30 baseline works
without setup; a marked solo boss normally gives 50, two hits give 70 before the
shared cap (65 on an unupgraded 130-HP Warlock). Existing stronger shields cannot
be prolonged by weaker casts. Its damage can trigger the usual gated Soul Ember,
but does not create a separate unlimited leech loop. Existing Hellish/Fiendish
Rebuke behavior remains: real shield-absorbed contact can release the armed
counterburst, so the barrier does not disable that interaction.

### Readability and compatibility

Curse zones use linked-diamond, flame and eye seals for Hex, searing and dread,
respectively. B2a replaces their original repeated rim badges with a central
watermark and friendly/hostile boundaries; tint remains secondary.
Dread also shows the existing weakened-attack badge. Dark Resilience uses the
visible absorption shell plus brief incoming protection links from contributing
marks. The collapsed pause symbol key explains these cues.

Fields survive authored, copied, upgraded, composed-ground and projectile-impact
zone paths. Self absorption is already a portable component; its siphon payload
is preserved and priced for **maximum barrier plus maximum damage** in Forge.
Honed/grands scale base shield, siphon damage/protection and reach while retaining
the target cap. Updated the three touched Honed descriptions and Fiend grand copy
so they do not claim a barrier itself strikes or that a zone receives direct-hit
lifesteal. This is compatibility work, not completion of the full upgrade catalogue.

Dark Resilience keeps its pre-rework zero healing/damage party-power credit through
existing `balanceAmount: 0`; new curse utility uses the existing mark estimator
contract. No difficulty formula is changed. Normal kill-pace feedback can still
respond. A capped shield will differ from percentage mitigation under heavy focus;
playtest its timing and survivability rather than assuming it is universally stronger.

### Pre-delivery coherence review

- **Fiend sequence A:** Fire Pit tags a route, then Hurl Flame/Eldritch Blast pressure
  the marked boss while repositioning; the longer mark leaves a sustain window
  outside the zone. **Sequence B:** Hex/Fire Pit setup, approach within 300u, then
  Dark Resilience to siphon and absorb the next threat; base Rebuke can then
  counterburst even on absorbed contact. Fiendish Rebuke is the stronger subclass
  strike alternative for a closer-range loadout. All examples respect
  the two equipped subclass slots; base Hex/Rebuke remain available.
- **Great Old One sequence A:** Whispers weakens attacks and enables Dread Insight,
  then Mind Blast applies focused pressure. **Sequence B:** Hex plus Tentacle snares
  a nearby target for controlled curse damage; Entropic Ward is the repositioning
  alternative. No particular random upgrade is required for either route.
- **Distinct jobs:** Hurl Flame is a charged leech strike, Mind Blast a quicker
  focused shot, Tentacle close snare, Entropic Ward blink/recovery. Each supplies
  pressure, setup or repositioning rather than another mandatory curse button.
- **Counterexamples exercised:** same-family and mixed-family overlaps, weaker
  cast arrival, independent expiry, another caster, zero effective damage, flight,
  boss-only and adds, no marks, cap saturation, existing shields, full HP, and
  copied abilities on another active class. Passing contracts does not prove balance.

**Next: balance B2**, covering the remaining catalogue-wide defensive/recovery
inventory, including skills with useful riders. Then the three remaining passive
batches, companion and form work. That is **six remaining core/system batches**,
plus **four to six upgrade batches**, roughly **10–12 future PRs**. The class-loop
coherence review remains embedded in those deliveries. Reassess Soul Ember and
shield values after B1 live testing before adding another numerical buff.

## Balance B2a delivered for review — active defense and recovery

The catalogue audit found too much remaining work for one coherent B2 patch.
This first cohort covers eight skills, preserving earlier class-loop and aura
interactions. B2 is **not complete**.

| Skill              | New job and limits                                                                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shield Wall        | Two frontal damage blocks within a 120° facing arc for 4s. Charge pips follow aim; rear attacks and ground damage bypass. Control riders still apply. Actual blocked contact still readies the existing counter.                           |
| Second Wind        | Existing 90 self-heal plus 30% movement for 4s; reliable self targeting even beside an injured ally.                                                                                                                                       |
| Rally              | 45 healing to the lowest-health ally within 280u; effective healing plants a 180u, 3s recovery field healing 6 per tick. One field per caster. Retains 5s counter preparation even when nobody needs healing.                              |
| Stand as One       | Centered 170u, 4s arrow field: 6/tick, slows enemies to 60%, grants allies 20% movement. Reaches airborne enemies. A kiting/repositioning option, distinct from ranged damage zones and piercing shots.                                    |
| Bear Spirit        | Retains its 40% mitigation rider for 6s, but its defining job is releasing roots/ongoing shoves and resisting new roots, stuns, pushes and pulls. Slows and damage remain threats. Cast before a stun; normal casting restrictions remain. |
| Spirit Mend        | Existing 80 self-heal plus control/movement cleanse and 2s steadfast resistance. Cleanse works even at full health. Does not cleanse unrelated debuffs or grant damage immunity.                                                           |
| Divine Shield      | Replaces prolonged percentage mitigation with a timed 1.25s damage immunity. Existing 5s Bulwark aura remains, with its original recipient/range rules. Greater/Eternal Aegis adapt to immunity, capped at 2s.                             |
| Aura of Protection | Immediate 40-point, 6s barriers to living allies within 240u, alongside existing following Bulwark. Shared 50%-max-HP cap and strongest direct barrier rules; does not replace Cleric's stronger barriers.                                 |

### Coherence and boundaries

- Knight can face a direct threat with Shield Wall and answer with the prepared
  counter, or Rally an injured ally and fight in the recovery territory. Champion
  can instead recover/reposition with Second Wind and re-enter using Bull Rush.
- Hunter can hold a skirmish field, reposition with its movement advantage and line
  up piercing shots. Totem can preempt a control-heavy sequence with Bear Spirit,
  or recover from roots/slows with Spirit Mend before rebuilding momentum.
- Paladin chooses precise personal damage immunity or immediate party barriers.
  Both retain following auras; neither becomes another copy of a long percentage
  reduction. Existing Consecration/Pursuit/Renewal choices remain relevant.
- Guard charges resist damage, not stun/pull. Steadfast resists hard displacement
  and control, not damage or slow. This separation gives the tools distinct jobs.
- Forge carries, prices, caps and describes the new payloads. Native, copied and
  composed casts are covered; self-heals fire once. Honed and affected base/grand
  upgrades tune the actual new effects. Forged replacements without directional
  guard/immunity receive a recharge improvement from the affected base upgrades.
- Added Rally healing, the skirmish-field damage and Protection barriers retain
  their former zero party-power credit. Existing Second Wind/Spirit Mend healing
  credit is preserved. No boss scaling formula changes; real kill pace still matters.
- Bear Spirit and Shield Wall have different weaknesses from their former broad
  mitigation. Playtest them against burst, repeated projectiles and ground-heavy
  bosses; this is a gameplay redesign, not a promise of uniformly higher defense.

### Hazard/curse readability correction

Lich **Void Zones** are temporary damaging/strong-slow pools (canonical 8s,
90u, 12 damage per 0.5s, speed to 30%). Its arena can also contain persistent
**Deathfog** terrain (6 damage per 0.5s, speed to 85%) and ice. Encounter scaling
and procedural content can change values. Neither pools nor terrain are curse
targets; only living bosses/adds receive marks.

The small black-backed curse seals repeated on friendly field rims could look like
status icons attached to overlapping hostile pools. Friendly curse fields now use
one large unbacked central watermark and a broken boundary; hostile zones use a
solid pink boundary and reject curse metadata. Creature status plates remain.
This applies to every boss-side ground zone, including affix/corruption hazards,
not just Lich spells. The symbol key explains ownership without adding battle text.

### Next and remaining scope

**B2b is next:** Rogue, Bard and Sorcerer defenses (including Smoke Bomb,
Shield Spell, Bolster and Mirror Image), plus remaining plain recovery skills such
as Nature's Bond, Life Transfer and Wholeness of Body. Continue the catalogue-wide
check: an added aura, passive or other rider does not cancel a base rework debt.
Mixed skills such as Blessing/Inspiration need an explicit retain/rework decision,
not automatic deletion of every mitigation rider. Reassess early kits and subclass
coverage as part of the same coherence gate.

After this cohort: **six core/system batches** (B2b, three passive cohorts,
companion and form), plus **four to six upgrade batches**: about **10–12 further
PRs**. The count stays similar because B2 was larger than its original estimate.
Upgrade branching/grands/grafts remain a dedicated later programme, not completed
by the compatibility adjustments here. Enemy-debuff and general readability polish
remain under live testing; no further unrelated Warlock passive buff in this batch.

## Balance B2b delivered for review — remaining defenses and plain recovery

This closes the audited base/subclass plain-defense/plain-heal cohort. These are
base-skill redesigns, not merely passive riders that waive the rework debt.

| Skill             | Role and limits                                                                                                                                                                                                                                                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Smoke Bomb        | Centered 120u smoke for 4s; enemies move at 65% and wind up 40% slower, allies gain 25% movement, caster prepares precision for 4s. No damage, curse, invisibility or immunity. Enables an escape/return strike rather than another mitigation timer.                                                                                        |
| Shield Spell      | One 4s frontal damage block and 4s precision preparation. Same facing/ground/control rules as Shield Wall, without Knight counter preparation. An arcane parry/re-entry option alongside Trickster's teleport.                                                                                                                               |
| Bolster           | Self cleanse, 3s steadfast and 20% movement for 5s. With Harmony and Discord ready, consumes both to spread movement and cleanse to nearby living allies; steadfast stays personal. Movement/recovery chorus contrasts with Battle Hymn's damage chorus.                                                                                     |
| Mirror Image      | Three images for 5s; each reduces one direct hit by 60% and breaks. Ground damage bypasses, immunity/front blocks preserve charges. Retains movement and spell-surge preparation. Upgrades cap at five images/9s.                                                                                                                            |
| Nature's Bond     | Existing 60 targeted heal plus recipient control cleanse; effective healing grants that recipient 25% movement for 4s. Full-health casts can cleanse but do not grant haste; equal-HP ties prefer an ally with active control over a healthy caster. Future companions can reuse recipient support semantics rather than being required now. |
| Life Transfer     | Existing 55 targeted heal plus a 20-point, 5s preemptive barrier to the lowest-health ally, including at full health. Existing stronger shields and shared caps win. A small portable Abjuration support ward, distinct from Cleric's larger dedicated barriers.                                                                             |
| Wholeness of Body | Existing 80 self-heal plus 4s Flow preparation, including at full health. Reliable self targeting; Flow is spent by the next marked special. A centering option alongside Open Hand's movement preparation.                                                                                                                                  |

### Readability follow-up incorporated here

- Shield Wall's cyan 120° arc now carries one visible shield plate per charge,
  following aim. Each consumed charge removes a plate; expiry removes the state.
  It also explains the shared frontal-block vocabulary for Shield Spell.
- Divine Shield has a gold hexagonal shell, white inner ring and short radiant
  rays. A public semantic tag distinguishes its timed self-immunity from dash
  invulnerability; no private source labels cross the wire. The shell ends with
  the actual immunity, not the longer Bulwark aura.
- Mirror Image shows one translucent silhouette per remaining image.
- Taunt exports its actual forced target and remaining time on living bosses.
  A foreground bullseye identifies affected bosses; gold means the local player
  is taunting, cyan an ally, and the short arrow points toward the taunter.
  Markers disappear on expiry, loss of the caster or boss death. No long tethers
  or extra floating text obscure combat.

Taunt behavior is preserved: global boss focus (including both twins), no 150u
range restriction, and threat set to the current party maximum plus 100 before
ordinary decay. Canonical duration is 4s (upgrades/procedural tuning can change it).
New movement/attack choices use that focus; committed wind-ups/channels retain
locked targets. Summons select their nearest living player and are not taunted.
A later taunt replaces ownership. After expiry ordinary threat targeting resumes,
so the Knight can retain focus without an active forced-target marker.

### Audit decisions and coherence check

Only Bear Spirit (active control resistance), Blessing (targeted offensive boon)
and Inspiration (party boon/chorus spender) retain native mitigation fields.
They were explicitly reviewed and retained for those mixed roles; a future numeric
balance or upgrade pass can still revisit them. Direct heals with rescue, recovery,
Renewal, Harmony or drain effects retain those distinct interactions. Generated
boons/stat passives are outside the plain active-skill inventory, not forgotten.

Assassin can smoke/reposition then spend precision on a marked strike; Trickster
can choose a mobile Misty Step setup or a stationary frontal parry. Valor can build
verses with heal/disruption then choose a recovery/movement or offensive chorus.
Sorcerer can prepare surge behind finite images, reposition and cast its payoff;
rapid direct hits and ground pressure remain weaknesses. Beast Master can free and
mobilize an injured ally; Abjurer can pre-ward an ally while healing; Open Hand can
center then spend Flow on a controlled finisher. None requires a random upgrade.

New utility retains prior party-power credit; Life Transfer's added barrier has
zero added credit. No boss difficulty formula changes. Forge prices the actual
new payloads, carries/caps them through recomposition and updates affected Honed
and Mirror Image grands. Targeted heal buff components now reach the actual healed
recipient rather than silently disappearing; they never become a free party buff.
The larger branching-upgrade/grand/graft redesign remains future work.

**Next: the first remaining subclass-passive cohort.** Five core/system batches
remain (three passive cohorts, companion and form), plus four to six upgrade
batches: roughly **9–11 further PRs**. Assess the new reactive defenses in live play;
readability feedback remains part of the existing delivery review, not a separate
open-ended graphics project.

## Dimension Door corrective patch

Playtesting exposed that the old “swap” was actually a shove reflected around the
arrival point. Crossing slides, roots, collision separation and a missing composed
path produced inconsistent results. Repair this separately from six new passives;
this is a corrective detour, not completion of the next passive milestone.

- A single pre-movement snapshot identifies departure and arrival enemies.
  Arrival wins when the circles overlap; each living boss/add is processed once.
- Arrival enemies teleport back near the departure point, preserving their offset
  direction. Departure enemies teleport outward along their original radial
  direction, at least 100u farther and beyond the departure radius. Exact-center
  enemies use the caster's aim. Stable IDs resolve crowded placements consistently.
- Endpoints check solid cover, totems, allies and enemies, including bosses of
  different sizes. A bounded, deterministic nearby search finds a clear pocket;
  an enemy with no safe pocket stays put. If the caster cannot land, all planned
  relocations are rolled back. Teleports pass through intervening cover.
- Rooted/control-resistant enemies remain anchored. Root still prevents the
  caster's teleport. A successful relocation cancels the old shove and emits
  familiar violet departure/arrival flashes. Existing locked boss attack targeting
  remains intact; this is relocation, not a stun or attack cancellation.
- Moved enemies receive a 35% movement slow for 2s, using existing slow readability
  and enabling Fireball's control-burst payoff. No additional stun chain, damage,
  party-power scaling adjustment, or new input is introduced.
- Native, copied and Forge-composed blink deliveries retain the exchange;
  composed descriptions explain it and synthesis budgets price the utility.

Review: mixed departure/arrival groups, overlaps and exact centers, cover and
wrap seams, roots/control resistance, dead enemies, crowded/failed landings,
previous shoves, and native/composed parity. Recheck against a live mobile boss
and summons after merge; safety adjustments may move a landing slightly away
from the exact aim endpoint.

**Next remains:** first six ordinary defining passives. There are still 18 ordinary
passives in three cohorts, then the separate companion and form systems, followed
by four to six upgrade/grand/graft batches (about 9–11 planned feature PRs).
The earlier solo-Taunt limitation belongs to Knight's passive/kit review: a pure
taunt adds little with one player and needs a useful solo expression, without
changing forced aggro or locked attack rules accidentally.

## Defining passives — cohort 1: Mage, Sorcerer and Bard

The first of the three six-passive cohorts builds on the now-playtested class
loops. A subclass grants its passive with **any** of its skills, without taking
another slot. Authored identity survives variance and Forge; grafting a skill does
not grant its donor's subclass passive. Personal readiness clears when changing
active subclass, while proc cooldowns continue, so swapping cannot reset gates.

| Subclass            | Passive         | Implemented loop and bounds                                                                                                                                                                                                                                                                                                            |
| ------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Evoker              | Arcane Cadence  | A positive direct hit on a currently slowed/rooted/stunned foe removes 1s from each running special cooldown, never the basic. Once per 6s across all targets/shots.                                                                                                                                                                   |
| Abjurer             | Binding Ward    | The same control follow-through grants 20 self absorption for 5s, once per 6s. Uses the shared 50%-max-HP cap and strongest-direct-grant rule. A stronger existing pool neither shrinks nor spends the trigger.                                                                                                                        |
| Draconic Bloodline  | Surge Ascent    | Actually spending Surge grants 2s flight. If already flying, extend the longest live flight by 1s, capped at 9s remaining without shortening longer flight. Once per 6s. Ground hazards are bypassed; direct attacks still connect.                                                                                                    |
| Wild Magic          | Spell Weave     | Two different special delivery types within 8s prepare a single 8s Surge, once per 8s. Basics and rooted movement do not count. Already-held Surge and native Surge preparation do not waste the trigger. Newly prepared Surge is for a later cast.                                                                                    |
| College of Valor    | Rallying Chorus | A completed two-verse chorus grants living allies in the chorus range, including the caster, one frontal block for 3s. Once per 8s. Existing active guards are preserved, not stacked or refreshed; rear/ground damage still bypasses them.                                                                                            |
| College of Whispers | Echoed Refrain  | A completed chorus readies the next effective dedicated heal for 8s. Echo 50% of effective healing, capped at 35, to the most injured other living ally in 420u; otherwise return it to the original recipient if still injured. Once per 8s. No echo recursion, extra verse or rescue trigger; no target to heal preserves readiness. |

### Coherence review before delivery

- **Every choice retains a path into the passive:** Mage's base Frost Nova sets up
  direct follow-through, while Evoker Cold and Abjurer Bind/Ward/Door add alternatives.
  All Sorcerers retain preparation and spending in their base kits; Wings also
  benefits from Ascent through its bounded extension. All Bards retain healing,
  Discord and Inspiration, including Whispers' movement or offensive selections.
- **Different decisions:** Evoker seeks spell cadence, Abjurer trades control for
  personal protection, Draconic times aerial exposure, Wild varies delivery rather
  than repeating a single nuke, Valor times frontal cover, and Whispers holds a
  follow-up heal. No generic passive damage multiplier is added in this cohort.
- **Bounded proc sources:** damage zones cannot trigger Mage gates, multiple direct
  targets share one gate, and Surge spending happens once at cast reservation.
  A native preparation and a passive preparation maintain one shared charge. An
  echo uses ordinary healing directly, avoiding dedicated-heal recursion/rescue.
- **Solo and co-op:** Valor includes the caster. Whispers can echo back into its
  solo recipient; effective healing, recipient HP and party availability bound it.
  Barriers and guards preserve stronger effects from other classes.
- **Readability:** existing flight, absorption and physical frontal-block visuals
  carry their actual effects. A control follow-through emits the appropriate
  absorb/empower cue. Wild's timed badge identifies the previous delivery type;
  Echoed Refrain has a distinct ready badge. Full passive descriptions are available
  before selection and in pause, with compact combat icons.
- **Compatibility:** direct native/composed impacts share the hit gate; composed
  chorus/heal paths retain their payoff. Grands/multishot cannot multiply gates.
  Adaptive boss rules and existing ability power-credit metadata are unchanged.
  Full branching upgrades, grands and graft redesigns remain the planned workstream;
  these passive riders do not erase any active-skill/redundancy review debt.

Validate fixed encounters first, then adaptive live runs. Pay particular attention
to aerial uptime against ground-heavy bosses, the value of a short frontal block,
Echo's solo versus party healing, and whether Cadence visibly improves spell rhythm.
Numbers are bounded starting values for playtesting, not a claim of final balance.

**Next:** Knight/Cleric/Paladin cohort, with the recorded solo-Taunt limitation and
protection/aura interactions reviewed together. The remaining ordinary cohort then
covers Barbarian/Monk/Hunter/Land Druid; pet AI and Moon form stay separate systems.

## Cohort 2 — practical passives, Spell Weave and solo Taunt

### Spell Weave rework and design correction

Playtesting showed that delivery matching was too restrictive and did not reliably
produce useful extra Surge opportunities in ordinary play. Basics did not count,
while the base defensive spells already prepared Surge themselves. A theoretical
sequence in an engine test was insufficient evidence of practical value with a
small equipped kit and mobile controls.

Spell Weave now counts **three basic casts within 8s** to prepare one 8s Surge.
A two-bolt basic is one cast; no special, hit, delivery change or particular
subclass skill is required. It counts casts deliberately, so misses and a boss's
invulnerability do not obstruct preparation; existing defensive preparation can
already be used before an enemy is vulnerable. The third cast prepares a future
Surge, not a retroactive bonus to that cast. The trigger has an 8s cooldown.
Basics build no progress while Surge is held or the gate is cooling down;
unfinished progress expires after 8s. Native preparation never spends the passive
trigger, and preparation still maintains one shared charge. Disabled rooted
movement cannot build progress if a basic is replaced by a movement ability.

The badge reports **1/3 or 2/3 basic casts** instead of a delivery taxonomy.
Tests cover all four individual Wild choices using only basics, a forged basic,
held/native Surge, cooldown, expiry, rooted movement, and real desktop/touch input
through preparation and consumption. This replaces the old cohort-1 Weave spec.

### Six defining passives

| Subclass     | Passive               | Payoff                                                                                                                                                                                         | Available route with any one subclass choice                                                                            |
| ------------ | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Champion     | Victorious Reprise    | A connecting readied melee counter heals 8% max HP, capped at 20, once per 6s. Full HP does not spend the gate.                                                                                | Base Taunt or Shield Wall → frontal block/guard → basic counter. Riposte adds another route.                            |
| Battlemaster | Tactical Opening      | A direct hit on a slowed/rooted/stunned foe readies a 4s counter and gives that foe 30% slower wind-ups for 3s, once per 6s. An unspent counter is preserved.                                  | Base Shield Bash → basic hit → counter. Trip and throwing blades add options.                                           |
| Light        | Refulgence            | Effective dedicated healing or a successful direct barrier grant readies a 6s charge. The next connecting direct hit gains 25% damage and slows the victim's wind-ups 30% for 3s. Once per 6s. | Base Heal after real damage → basic Smite; Warding Flare also prepares it at full HP. Zones cannot spend the charge.    |
| Life         | Abundance             | Dedicated heals convert 50% of unused healing into additive absorption, capped at 25 per trigger for 6s, once per 6s. Shared 50%-max-HP cap; failed grants preserve the gate.                  | Base Heal at full health or with partial overheal. Every Life choice retains this preemptive use.                       |
| Devotion     | Oath Anchor           | Starting any aura cleanses nearby living allies, including the caster, and grants 2s Steadfast against roots/stuns/forced movement, once per 8s. Activation only, not aura pulses.             | Base Divine Shield; effective Lay on Hands also starts an aura. No injured ally or specific subclass aura is mandatory. |
| Vengeance    | Relentless Procession | The first positive direct melee hit during an aura adds 2s to its remaining duration and slows its victim 25% for 2s. Once per aura activation; no Pursuit-strike reset.                       | Base Divine Shield → basic Holy Strike, regardless of subclass choice. Any aura type benefits.                          |

All six unlock with any skill from their subclass. Authored identity persists
through variance and Forge; copied skills do not grant a donor passive. Personal
readiness clears on a class change and proc gates do not reset. Vengeance's one-use
activation flag is host-only and expires with the existing aura object.

### Solo Taunt and shared guard safety

Taunt retains its existing global boss threat/focus behavior, locked-attack rules
and summon exception. It additionally grants **one frontal block for 4s and a 4s
guard window**; blocking the incoming hit can ready the ordinary melee counter.
It therefore has a useful solo role while retaining its party role. Rear attacks,
ground hazards and control still bypass the block. No invulnerability is added.

Front guards use one shared pool: Taunt cannot erase Shield Wall's two charges,
add a separate pool behind another caster's guard, or prolong a stronger pool.
A stronger cast replaces the weaker pool, and an equal cast can refresh only to
its own authored duration. Native/composed and Forge Taunt retain the guard facets.
Existing Bastion mitigation upgrades remain intact for the later upgrade audit.

### Feasibility and integration gate for future cohorts

Before delivery, verify an ordinary route with **every individual subclass choice**
and the actual always-equipped base kit. Include basic attacks, available slots,
real cooldowns, normal target/HP conditions and mobile execution in the assessment.
Do not call a passive useful merely because one specially constructed sequence
can trigger it. Distinctive advanced interactions may still be proposed, but must
include the extra game support they require rather than assuming it exists.

This cohort has an engine matrix for all 24 new subclass choices and all four
Wild choices, plus native/composed paths, immunity/expiry, stronger protection,
solo/party scope and proc bounds. Production checks cover passive selection and
pause descriptions, and perform the new basic-only Weave sequence on desktop and
touch. Review the numbers through fixed encounters and normal adaptive runs.

Readability reuses physical frontal guards, absorption, Steadfast and enemy
slow/sluggish indicators; Refulgence has a distinct ready badge. Vengeance extends
the real aura shown to players. Adaptive boss rules/power credit are unchanged.
These riders do not erase the catalogue-wide active-skill or upgrade review debt.

**Next:** final six ordinary passives (Barbarian, Monk, Hunter, Land Druid), followed
by companion/form systems and the separate upgrade/grand/graft workstream. The
full-kit practical-use gate above also applies to those designs.

## Final ordinary passive cohort: playability before complexity

Each of the 24 individual subclass choices below has a base-kit activation route.
No trigger requires acquiring both subclass skills or a particular Forge donor.

| Subclass      | Defining passive                                                                                                                                                                   | Reliable base-kit route                                                    |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Berserker     | Rampage: spending Momentum prepares the next basic cast for +10% damage and +8u melee reach per stack, up to three; lasts 4s, consumed even on a miss.                             | Rage → connecting basics → Whirlwind → basic.                              |
| Totem Warrior | Spirit Shelter: a Momentum spender grants self and allies within 180u 8 + 4 absorption per stack (up to 20) for 4s, once per 6s. Existing stronger barriers and shared caps apply. | Rage → basics → Whirlwind; Wolf walking also works.                        |
| Open Hand     | Flowguard: spending Flow grants one 3s frontal block. Stronger guards survive; no charge stacking or automatic Knight counter.                                                     | Step of the Wind → Stunning Strike or Quivering Palm.                      |
| Shadow        | Shadow Rhythm: spending Flow removes 2s from running dash/blink special cooldowns in the active kit, once per 4s. An unused trigger is preserved.                                  | Step of the Wind → either base Flow spender.                               |
| Hunter        | Exposed Quarry: positive direct hits mark foes for 3s, granting the party +10% damage taken; a shared refreshing mark, never multiplied between Hunters.                           | Basic arrows, including pierced victims. Zone ticks cannot apply the mark. |
| Land          | Living Paths: friendly zones give allies +20% movement speed and foes +25% wind-up duration; stronger authored zone parameters survive. No change to flight/arming/affiliation.    | Entangle; recovery groves and subclass zones also qualify.                 |

Feedback reuses the existing shield arc, absorption shell, enemy vulnerability and
wind-up status cues. Rampage has an explicit next-basic HUD badge; cooldown
reductions emit empowerment feedback. Full passive explanations remain in loadout,
reward and pause menus without adding combat text clutter.

### Check failures investigated

- The enemy-debuff smoke fixture still assumed Taunt granted zero guards. It now
  expects the intentional one-block state and genuinely expires its buff in the
  expired-state fixture. Downed rendering remains suppressed.
- Life Transfer's recovery check separately waited for the barrier and then read
  its attributes, allowing a boss hit to remove it between operations. The check
  now validates a positive, bounded meter value atomically and verifies the
  preemptive full-health cast, which is an intended part of the ability.
- Passive browser loadouts run in four parallel CI cohorts, retaining all desktop
  and touch cases. Unknown cohort names fail immediately instead of passing with
  zero cases. The general smoke job retains its existing non-passive scenarios.

Summoned enemies now honor damage-taken modifiers, making Hunter vulnerability
consistent with bosses. Difficulty scaling formulas and enemy stats are unchanged.

Before delivery, review each passive for solo/base-kit feasibility, actual cooldown
cadence (including the global attack slowdown), caps/stacking, native/composed
resolution and clear feedback. The remaining companion/form systems require
separate lifecycle, targeting, multiplayer and mobile control checks; they are not
squeezed into this cohort. Continue observing earlier readability and Warlock
balance feedback during playtests rather than declaring those permanently solved.

## Beast Master: commanded spirit companion prototype

Pack Bond is granted with any of the four Beast Master choices. A visible spirit
wolf follows its Ranger, including walking and wrap-around movement. A connecting
positive direct hit orders a single bite at that victim within 600u. Basics provide
a reliable solo route with every choice; no additional button, second subclass
skill, kill or special loadout is needed. Multiple arrows/victims share a 2.5s
owner gate. There is no autonomous target search or attack while the Ranger is idle.

The spirit travels toward the victim, with a minimum 0.3s wind-up and 0.9s maximum
pursuit. It bites once for 16 base damage, increased to 20 against a currently
slowed, rooted or stunned foe. Rain of Arrows and Snare supply control; Pounce's
landing and Savage Bite can directly command it. Wind-up slowing alone does not
qualify. Bites use the owner's damage modifiers and ordinary enemy defenses,
credit the owner, and cannot crit, generate direct-hit procs, lifesteal or recursively
issue commands. Dead, missing, distant and immune victims never produce phantom
successful hits; a canceled command still spends its gate.

Effective dedicated healing (Nature's Bond, including composed/copy routes)
prepares a 6s link to the actually healed recipient. The next successful bite grants
that living ally 12 absorption for 4s if within 420u of the owner. Full-health
casts and lifesteal do not prepare links. One link at a time; the last effective
recipient replaces the previous one. Stronger barriers are preserved, and failed
barrier grants leave the link available until expiry. Solo self-heals work too.

### Explicit system decisions

- One host-owned spirit state per active Beast Master, separate from party bots,
  adds and living-party counts. It never holds aggro, collides, tanks, takes hazard
  damage, needs reviving, or affects wipe/revive rules. Spiritual movement crosses
  cover and reaches flying targets; there is no pathfinding or physical pet AI.
- Downing, death, zero HP, class/passive changes, room transitions and disconnects
  remove the pending bite and healing link. Recovery creates a following spirit,
  never a stale attack; its command gate survives class swaps/downing. Each new
  fight starts a fresh companion with ordinary fresh-fight cooldowns.
- Long owner teleports recall the spirit; normal movement follows smoothly on
  the torus. Leash checks occur both at command and impact. Owner positioning,
  controls, enemies and collision resolution are untouched.
- Snapshots contain only position, facing, attack pose and link readiness. Orders,
  recipients and timers stay host-only. Client interpolation moves the spirit's
  position independently and respects appearance/removal from newer snapshots.
- A turquoise wolf silhouette, attack ring and golden prepared-link glow identify
  the companion. The HUD shows a paw readiness badge for the next protective bite;
  ordinary absorption shells identify its actual beneficiary. Full explanations
  remain in loadout/reward/pause views instead of adding floating combat text.

The bounded ceiling is 6.4 base single-target DPS, or 8 against controlled foes,
plus at most one non-stacking 12-HP barrier per effective heal/connecting bite cycle.
Owner upgrades can increase damage normally; this is player power, not an enemy
stat increase. Adaptive difficulty formulas remain unchanged. Independently
surviving, targetable pets, pet skill bars, autonomous AI, multiple companions and
pet-specific upgrades are deferred, rather than partially implemented here.

Review/playtest priorities: all four individual choices, solo and party recipients,
several Beast Masters, direct versus zone hits, native/composed damage and healing,
multishot gating, victim disappearance/immunity, owner down/revive/swap/disconnect,
room transitions, cover/flight/torus/teleport, remote interpolation and small screens.
Do not treat a pet's presence or a passive icon alone as proof its command works.

CI also exposed an existing Rally smoke assertion that accepted only the initial
Guard badge. A real incoming hit can validly consume Guard and prepare Counter
before the browser reads it. The check now accepts either state while retaining
the injured-player setup and cast/description assertions; failure output includes
actual HUD/badge state. Existing engine tests verify Rally's guard-to-counter
transition. No Knight gameplay change is included in this correction.

## Moon Druid: Moon Aspect closes the first identity round

Any special cast enters bear form for 6s, once per 12s. Full-health Regrowth works
with each individual Moon choice, and Maul/Pounce/Roar/Regeneration can each activate
it independently. A rooted movement cast cannot activate it. The transformation
occurs on resolution, not while an interruptible cast is merely winding up.

The bear retains Thornlash and every equipped spell, subclass skill and Forge
payload. No hotbar replacement, extra button, forced melee-only period, health
pool, damage immunity, altered collision radius or resource bar is introduced.
Form grants 20% movement speed and one aimed 95u/55° supplemental claw for 14 base
damage per basic cast. Multishot cannot multiply the swipe. Claws use ordinary
owner/enemy damage modifiers but do not crit, backstab, consume counters or trigger
direct-hit riders. Positive claws or direct hits within 130u plus enemy radius
mend 4 HP, once per 1s across all victims and skills. Full health, misses, immunity,
zone ticks and distant hits do not spend the mend gate; mending cannot trigger
dedicated-heal loops or create a recovery grove.

Entangle and Cyclone help hold a safe approach; Maul and Pounce can mend through
actual connecting hits. Roar retains its damage/movement buff; Frenzied Regen
retains its heal and recovery field. Natural mending complements these effects
rather than replacing them. Outside claw range, Thornlash remains an effective
ranged basic, so a full-health heal does not accidentally disable ranged play.

Downing, death, zero HP, passive/class changes and noncombat rooms clear form and
stride. Cooldowns survive swaps/downing; re-entering combat never restores a stale
form. A rest badge shows the remaining recovery after the six-second form ends,
including after returning to the class. Form has a distinct moon-marked bear body;
the humanoid rig/sprite is removed, normal health/status overlays remain, and
position interpolation is unchanged. Snapshots carry the public form tag and buff
countdowns; private gates stay host-owned.

At an unmodified 1s basic cadence, six successful close swipes add at most 84 base
damage per 12s cycle; mending adds at most roughly 24 HP in that form window.
Timing, misses, enemy defenses, upgrades and actual contact matter. These are
bounded design ceilings, not a measured class balance verdict. Adaptive difficulty
formulas and enemy stats remain unchanged.

### New order of work after this milestone

The catalogue review covers every class and all active/passive skills, including
previously reworked defensive skills and recently added riders. No class is exempt
because its tests pass or it received a recent passive. Review base-kit viability,
each individual subclass pick, class/subclass interactions, redundant actions,
control/burst access, real input/cooldown cadence, power and visual comprehension.
An interesting passive must not hide an uninteresting active skill underneath it.

Prior user feedback (Warlock/Fiend, Bard explanations, Mage/control access, plain
protection skills, Paladin impact, upgrade disconnection and visual clutter)
remains audit input, not an automatic mandate to rewrite all those systems again.
Separate confirmed defects, observed playtest issues and design hypotheses. Freeze
class behavior after agreed retouches before mapping the broad upgrade branches;
necessary bug/compatibility fixes remain allowed throughout.
