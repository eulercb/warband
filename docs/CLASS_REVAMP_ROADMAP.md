# Class identity and subclass roadmap

Status: the Rogue/Warlock skill pilot was merged and playtested. Defining passives
for Assassin, Arcane Trickster, Fiend and Great Old One were merged and playtested.
Mage/Sorcerer differentiation was merged and playtested.
Support-class differentiation was merged and playtested.
Knight/Ranger/Barbarian/Monk differentiation was merged and playtested.
Martial subclass coherence was merged and playtested.
Cleric absorption and Chain Pull momentum were merged and playtested.
Cleric retuning and Paladin moving auras were merged and playtested.
Ability readability and Paladin aura tuning were merged and playtested; further readability changes are deferred pending more feedback.
Caster defense identity (Mage/Sorcerer) is implemented for review.
Remaining defining passives, companions, forms and later milestones remain proposals.

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
  2% maximum health and grants 10% mitigation for 3 seconds, once per 6 seconds.
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
stage. Quota consumption cannot be predicted reliably.

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
revamp. Its current maximum healing cadence is 2% max HP every 6 seconds (about
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

| Workstream                 | Merged and playtested                | This PR                   | Still outstanding                                    |
| -------------------------- | ------------------------------------ | ------------------------- | ---------------------------------------------------- |
| Base class loops           | 12/12 classes plus martial coherence | None                      | Ongoing tuning                                       |
| Defining subclass passives | 4/24                                 | None                      | 20: 18 in ordinary batches, companion and form       |
| Balance/skill identity     | Feedback collected                   | Caster defensive identity | Catalogue-wide defense/recovery review, Fiend tuning |
| Companion/form systems     | None                                 | None                      | Beast Master companion and Moon form prototypes      |

**Current sequence:**

1. **Merged/playtested:** Cleric absorption, Chain Pull momentum, Cleric tuning and Paladin auras.
2. **Merged/playtested:** Shared ability readability and Paladin aura tuning.
3. **This PR:** Mage/Sorcerer defensive skill identity; first half of the broad balance pass.
4. Balance pass B: remaining defense/recovery identity and Fiend tuning.
   Keep all unnamed candidates in scope; retain useful aura/class interactions.
5. Three batches for the 18 remaining non-companion/non-form subclass passives,
   roughly six passives per PR, with their related skill/upgrade coherence reviewed
   together. Revise each proposed passive around its final class loop first.
6. Beast Master companion prototype plus its defining passive.
7. Moon form prototype plus its defining passive.

After this absorption batch, **about seven further PRs remain** (2 defensive/balance
PRs, 3 passive batches, companion, form), with scope adjusted if playtests justify
combining or splitting related work. It is a scope estimate, not a quota or calendar estimate.
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
not a quota/time promise. Six related passives per batch is a reasonable increase;
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
cohesive passes, which would make seven; this is provisional scope, not a time or
quota estimate. Bear Spirit and the complete mitigation-only inventory remain
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
scope, not slower completion of the old scope or a time/quota commitment. Begin upgrade inventory/research alongside the remaining balance/passive work.
Finalize the pilot once its chosen classes have stable contracts, rather than
waiting for the whole catalogue; companion/form-specific upgrade design follows
those prototypes. Revisit the
batch sizes after the pilot rather than implementing hundreds of upgrades at once.
