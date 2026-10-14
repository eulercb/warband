# Class identity and subclass roadmap

Status: the Rogue/Warlock skill pilot was merged and playtested. Defining passives
for Assassin, Arcane Trickster, Fiend and Great Old One were merged and playtested.
Mage/Sorcerer differentiation was merged and playtested.
Support-class differentiation is implemented for review.
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
4. **Implemented for review:** separate support identities: Cleric rescue, Paladin frontline protection,
   Druid territory/recovery, Bard sequences/rallies.
5. Develop Knight, Ranger, Barbarian, and Monk loops, reviewing subclass skills
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
