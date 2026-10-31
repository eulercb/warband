# Cleric, Paladin and Bard: authored upgrade builds

This completes the authored catalogue for **12/12 classes**. Each of these three
classes has four canonical starting-skill grands, eight individual subclass-skill
grands, four identities and eight authored Honed profiles. The loadout stays four
grands per class: two starting skills, one bound subclass skill and one identity.
Earned alternatives remain banked; only explicitly equipped, active-class choices
apply. Owner review and live testing remain necessary before acceptance.

## Identities and first-pick routes

Every row works with **each** of its subclass's four possible first skills against
one boss. Starting abilities supply the route; no second subclass skill, adds or
new input is assumed. Territory, facing and disruption also work at full health.
Effective-heal benefits require injury; overhealing does not manufacture Harmony,
rescue preparation, relay healing or recovery groves.

| Subclass  | Identity A                                                                                                                                                                                                                                                                     | Identity B                                                                                                                                                                                                                                                         | Starting-kit sequence with every first pick                                                                                                                                                                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Light     | **Dawnbreaker:** Smite slows 25% for 2s; Sanctuary grants 20% allied movement. Direct Light strikes gain +25% controlled damage; Flash's rescue becomes +30%; Warding Flare hastes its caster 20%.                                                                             | **Endless Radiance:** Blessing gives its lowest-health recipient 35 absorption/4s; Smite delays wind-ups 30%/3s. Direct Light strikes leech 20%; Flash cleanses; Warding Flare grants its caster 3s hard-control resistance.                                       | With Radiance, Bolt, Flash or Ward first: Sanctuary → Smite → direct Light spell uses A's control and movement. B can Bless at full health, then suppress with Smite; healing is additional recovery when hurt.                                                                                                    |
| Life      | **Font of Life:** effective Heal leaves a 90u, 3s, 4-heal/tick grove; Sanctuary/Life fields grant 20% mitigation. Life heals haste 20%/3s, Preserve heals its caster 20, Reproach leeches 15%.                                                                                 | **Ceaseless Mending:** Heal/Life heals ready a rescued recipient's next direct hit for +25% within 6s. Sanctuary/Life fields grant 25% allied movement; Preserve lifts its caster for 3s; Reproach delays wind-ups 30%/3s.                                         | With Bloom, Cure, Preserve or Reproach first: stand in Sanctuary to use A's protected ground, or cross it using B's movement. Heal → Smite adds the recovery/rescue route after injury; neither identity needs to begin injured.                                                                                   |
| Devotion  | **Covenant of Steel:** Shield blocks one frontal hit/4s and that block readies a +30% melee counter; Consecration grants 20% allied movement. Direct Devotion strikes leech +15%; self utilities guard-counter for 4s; Bless grants 20% mitigation/3s after effective healing. | **Unyielding Faith:** Shield weakens foes within 180u by 20%/4s and readies a counter after the next melee connection; effective Hands hastes 20%/3s. Devotion strikes delay wind-ups 30%/3s, self utilities ward other allies 15% within 180u/4s, Bless cleanses. | With Smite, Weapon, Bless or Aura first: Shield → face a later frontal attack → Holy Strike uses A. B's Shield → Holy Strike → next melee counter works at full health against one boss. Neither route needs a specific subclass attack.                                                                           |
| Vengeance | **Avenging Wrath:** Consecration slows 30%; Holy Strike/direct Vengeance attacks gain +25% controlled damage. Vow grants 3s hard-control resistance; Charge delays enemy wind-ups 30%/3s.                                                                                      | **Relentless Vengeance:** Shield hastes its caster 25%/3s; Holy Strike leeches 15%, direct Vengeance attacks leech 20%; Charge hastes 20%/3s and Vow heals 25.                                                                                                     | With Hunt, Enmity, Charge or Smite first: Consecration → basic supplies A's own setup. B's Shield provides immediate pursuit at full health, followed by basic leech after damage. Charge's native landing has no damage-leech or controlled-damage execution; it receives supported movement/suppression instead. |
| Valor     | **Hero's Ballad:** Mockery/direct Valor strikes gain +25% controlled damage; Whispers leeches 20%; self utilities guard-counter for 4s.                                                                                                                                        | **Battle Rhapsody:** Whispers delays wind-ups 30%/3s; effective Word hastes 20%/3s; direct Valor strikes leech 20%; self utilities ward other allies 15% within 180u/4s.                                                                                           | With Flourish, Hymn, Bolster or Shatter first: Mockery's existing slow → next Mockery uses A immediately. Whispers → reposition uses B at full health. Once hurt, Word supplies Harmony; Whispers supplies Discord, then Inspiration rallies. No overheal-to-Harmony assumption.                                   |
| Whispers  | **Voice of Madness:** Whispers freezes 0.6s, Mockery gains +25% controlled damage; Psychic Blade gains +30% controlled damage, Words suppresses wind-ups 30%, Mantle shields its caster 30/4s, Refrain hastes 20%/3s.                                                          | **Unheard Dirge:** Mockery suppresses wind-ups 30%/3s and Inspiration hastes 20%. Psychic Blade leeches 20%, Words grants 20% allied movement, Mantle blocks one frontal hit/4s, Refrain cleanses.                                                                 | With Words, Blade, Mantle or Refrain first: Whispers/Mockery → another basic or Blade uses A's control. B's Mockery suppression and Inspiration movement work before injury or a chorus.                                                                                                                           |

Movement control and wind-up suppression are separate. A same-cast slow/freeze
sets up later attacks; the opening hit does not retroactively gain controlled
bonus. Direct-hit leech repairs injury rather than generating effective heals or
verses. Shared wards explicitly protect **other** allies; the caster still has
its starting-kit route when playing alone.

## Starting skills: all layers together

| Skill and ordinary role                                                                                                            | Canonical grand                                                                                                        | Identity combinations and marginal value                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Smite:** Holy Wrath adds damage and freeze.                                                                                      | `cl_gk_basic_b` **Judgment:** +18 damage, +250 speed, one extra pierce.                                                | Dawnbreaker's slow supplies ranged control even without Holy Wrath; freeze remains a stronger short stop. Endless Radiance adds action suppression. Piercing changes the lane; speed/damage still help against one boss.                                                     |
| **Heal:** Greater Heal adds healing, reach and rescue magnitude.                                                                   | `cl_gk_a1_a` **Miracle:** cleanse, +45 healing, +100u reach.                                                           | Font adds recovery ground; Ceaseless adds the rescued ally's later attack. Cleanse works on a full-health afflicted recipient; the heal-only rewards still need effective healing. Ordinary healing and rescue shield ceilings continue to apply.                            |
| **Sanctuary:** Hallowed Sanctuary increases healing, radius and duration; native overheal already adds absorption.                 | `cl_gk_a2_b` **Consecrated Bastion:** 12 enemy damage/tick, 35% movement slow, +6 healing/tick.                        | Dawnbreaker/Ceaseless add allied movement; Font adds mitigation. The grand creates an enemy-control position; none re-sells the native overflow flag. Ground targeting remains.                                                                                              |
| **Blessing:** Exalt develops its damage/mitigation/time.                                                                           | `cl_gk_a3_b` **Zealotry:** recipient flight for 3s, +15% damage.                                                       | Endless Radiance adds finite absorption rather than immunity or more flight. Flight changes ground-hazard routing while the barrier protects ordinary incoming damage; stronger ordinary mitigation remains useful.                                                          |
| **Holy Strike:** Radiant Strike adds damage, daze and leech.                                                                       | `pa_gk_basic_a` **Radiant Riposte:** +12 damage; a connection readies a +30% melee counter and 0.35s parry.            | Avenging Wrath rewards prior Consecration control; Relentless adds leech magnitude. Covenant's facing block and Riposte's connecting attack prepare the same strongest counter pool, not additive counter stacks; the grand independently adds a parry and damage.           |
| **Consecration:** Hallowed Ground grows its damage/healing/radius/time; native field already mitigates 10%.                        | `pa_gk_a1_b` **Pilgrim Ground:** +4 damage/tick; follows the first effectively damaged grounded foe for up to 6s.      | Covenant grants allied movement, Avenging Wrath slows enemies. Following changes placement and may carry healing toward danger. Larger ordinary coverage/time still matter; flight is not silently targeted.                                                                 |
| **Lay on Hands:** Merciful Hands adds healing and requests bounded recharge reduction; native effective heal starts Renewal.       | `pa_gk_a2_a` **Blessed Hands:** +35 healing; low-health rescue readies recipient's next direct hit for +25% within 6s. | Unyielding adds movement after effective healing. Rescue attack preparation differs from Renewal's healing aura and ordinary magnitude. Full-health casts do not arm the rescue.                                                                                             |
| **Divine Shield:** Greater Aegis extends immunity up to 2s and aura reach/time, with bounded recharge.                             | `pa_gk_a3_a` **Unbreakable:** two frontal blocks/4s plus hard-control resistance/3s.                                   | Covenant adds a 1.3 counter to those blocks; it never requires HP damage through immunity and two blocks. Unyielding adds challenge timing; Relentless adds movement. The grand keeps a finite facing window after immunity instead of promising continuous invulnerability. |
| **Mockery:** Cutting Words adds damage and stronger/longer slow.                                                                   | `ba_gk_basic_b` **Soul-Rending Insult:** two extra pierces, +10 damage, +180 speed.                                    | Ballad/Madness reward existing control; Dirge adds action suppression. Piercing does not replace slow or copy it under another name; damage/speed are useful on one boss.                                                                                                    |
| **Inspiration:** Rousing Anthem improves damage, mitigation and duration; prepared Harmony/Discord already convert it to a chorus. | `ba_gk_a1_b` **Sheltering Cadence:** 45 absorption/4s to the lowest-health ally.                                       | Dirge adds movement. The barrier protects the selected weakest ally even during a chorus; it does not pretend to shield the whole party. This differs from Cleric's flight and retains a useful solo/full-health cast.                                                       |
| **Healing Word:** Song of Rest increases healing and requests bounded recharge.                                                    | `ba_gk_a2_a` **Song of Rebirth:** +20 healing; effective primary heal leaves a 90u grove for 3s, healing 5/tick.       | Rhapsody adds 20% movement/3s so the recipient can leave the grove; staying or crossing is a decision. Neither grove ticks nor leech generate Harmony.                                                                                                                       |
| **Dissonant Whispers:** Thunderous Chord develops damage, radius and movement slow.                                                | `ba_gk_a3_a` **Thunderous Crescendo:** 140u inward pull, +10 damage.                                                   | Ballad leeches; Rhapsody suppresses wind-ups; Madness freezes. Pull changes positioning independently of all three. It draws danger inward rather than becoming another outward peel.                                                                                        |

## Subclass skills: Honed, grand and both identities

Each Honed rank also requests 4% faster recharge through the existing ordinary
budget. Actual recovery respects the persistent-effect floor, Haste and the shared
4s special minimum; it is not a promise of four-percent shorter live recharge at
an already protected floor. The table gives per-rank native growth, up to five
ranks. Grands add the stated payload without duplicating the skill's ordinary
binary flags.

| Skill: base → Honed                                                                                                                     | Individual grand                                                                                                                                       | Combined identity value                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Radiance:** close 36-damage burst → +10% damage, +4u radius.                                                                          | **Dawning Reversal:** +8 damage, 150u outward push.                                                                                                    | Dawnbreaker exploits prior Smite control; Endless leeches. Honed coverage, relocation and either payoff remain separate.                                                                                                                                                     |
| **Guiding Bolt:** charged 60-damage shot → +12% damage, 5% shorter wind-up.                                                             | **Guiding Lance:** two extra pierces, +180 speed.                                                                                                      | Dawnbreaker's setup increases the shot; Endless repairs injury. Ordinary wind-up and grand flight speed improve different delivery phases; boss-only damage still grows.                                                                                                     |
| **Flash of Light:** rescue heal and +20% next-hit preparation → +8% healing, +0.25s rescue readiness (cap 8s).                          | **Afterglow:** +15 healing and 90u/3s/5-heal-tick recovery grove after effective healing.                                                              | Dawnbreaker increases rescue to +30%, not another preparation stack; Endless cleanses. Honed increases the chance to spend the stronger preparation; grand supplies territory.                                                                                               |
| **Warding Flare:** weakest-ally barrier 70/7s → +8u reach, +0.15s barrier time (cap 8s).                                                | **Flareguard:** caster gets one frontal block/4s.                                                                                                      | Dawnbreaker hastes caster; Endless grants caster 3s hard-control resistance. The barrier may cap on a low-health recipient, so Honed does not sell dead extra capacity. Recipient barrier and caster guard differ in party play; both help solo.                             |
| **Blessed Bloom:** healing ground with overflow → +8% healing, +0.25s duration (cap 8s).                                                | **Pilgrim Bloom:** 6 enemy damage/tick and follows its first effectively damaged ground foe up to 6s.                                                  | Font adds mitigation; Ceaseless adds allied movement. Its own new damage enables following without needing a second skill/grand. Unlike planted Sanctuary, it can pull the healing center into a moving boss fight.                                                          |
| **Mass Cure:** rescue heal plus 35% effective-heal relay → +8% healing, +6u relay reach.                                                | **Unburdening Cure:** primary cleanse, +20 healing.                                                                                                    | Font hastes the primary recipient; Ceaseless arms their rescued next hit. Relay remains one other injured recipient and cannot recursively cleanse/prepare/relay. Solo still has primary healing and cleanse.                                                                |
| **Preserve Life:** nearby-ally barrier 55/8s → +6% barrier, +5u reach.                                                                  | **Life's Vigil:** caster gets two frontal blocks/4s.                                                                                                   | Font heals caster 20; Ceaseless lifts caster for 3s. Barrier capacity, finite facing guard and either mobility/recovery payoff differ; native 8s barrier is not extended beyond its cap.                                                                                     |
| **Reproach:** melee daze → +10% damage, +3u reach.                                                                                      | **Reproving Blow:** +10 damage, 140u outward push.                                                                                                     | Font adds 15% leech, Ceaseless suppresses wind-ups. Existing daze controls the immediate action; push changes range and suppression changes subsequent wind-ups.                                                                                                             |
| **Divine Smite:** melee damage with 15% leech → +10% damage, +2% leech (ordinary ceiling 30%).                                          | **Magnetic Oath:** +8 damage, 120u inward pull.                                                                                                        | Covenant adds 15% leech; Unyielding adds suppression. At five ordinary ranks the leech is 25%, then Covenant gives 40%; neither added source is described as a second new mechanic. Pull changes where the next melee happens.                                               |
| **Sacred Weapon:** damage buff plus Pursuit → +3% damage bonus, +0.2s aura (cap 8s).                                                    | **Guarded Weapon:** one frontal block/4s.                                                                                                              | Covenant guards a counter after real damage; the finite block may delay that route, but does not erase the 6s offensive buff/Pursuit. Unyielding protects other allies via a 15% ward. Facing versus party proximity is distinct.                                            |
| **Bless:** heal plus effective-heal Renewal → +8% healing, +0.2s aura (cap 8s).                                                         | **Blessed Reprisal:** +15 healing; effective primary heal grants its recipient +25% damage for 4s.                                                     | Covenant grants the healed ally 20% mitigation/3s; Unyielding cleanses. The four-second damage window asks the recipient to attack after healing; it does not require a low-health rescue or replace Renewal. With Covenant, both heal-buff axes share the longer 4s window. |
| **Aura of Protection:** nearby barrier 40/6s plus Bulwark → +6% barrier, +0.2s aura (cap 8s).                                           | **Unbroken Circle:** caster cleanse and 4s hard-control resistance.                                                                                    | Covenant guard-counters after real damage; Unyielding wards other allies. Finite barrier may defer the real-damage counter, so it is not the sole first-pick route; native Shield's block-counter remains available.                                                         |
| **Hunter's Vow:** damage/movement buff plus Pursuit → +3% damage bonus, +0.2s aura (cap 8s).                                            | **Unflinching Hunt:** one frontal block/4s.                                                                                                            | Avenging adds 3s hard-control resistance; Relentless heals 25. Guard, resistance and healing are independent; no second stun or leech flag is sold on this utility.                                                                                                          |
| **Vow of Enmity:** close snare burst → +10% damage, +0.15s slow (cap 4s).                                                               | **Gather the Guilty:** +10 damage, 140u inward pull.                                                                                                   | Avenging rewards control already present before the strike; this cast's slow sets up a later attack. Relentless leeches. Pull works independently of slow strength/duration.                                                                                                 |
| **Avenging Charge:** physical dash and landing → +10% landing damage, +6u travel.                                                       | **Guardian Crossing:** +40u travel, 25 caster healing, first ally actually crossed is cleansed/guarded for 3s.                                         | Avenging suppresses enemy wind-ups at landing; Relentless hastes the caster 20%/3s. Solo still gains travel/healing. Cover stops the dash; an ally behind cover cannot receive a crossing guard.                                                                             |
| **Wrathful Smite:** melee daze → +10% damage, +3u reach.                                                                                | **Exiling Judgment:** +20u reach and 150u outward push.                                                                                                | Avenging rewards prior control; Relentless adds 20% leech. Reach and force remain below native geometry caps; it does not sell the same base stun again.                                                                                                                     |
| **Blade Flourish:** close Discord strike → +10% damage, +3u reach.                                                                      | **Sweeping Flourish:** +10 damage, 120u outward push.                                                                                                  | Ballad rewards prior Mockery slow; Rhapsody leeches. Push peels the target without replacing Discord preparation or ordinary reach.                                                                                                                                          |
| **Battle Hymn:** self/chorus damage buff → +3% damage bonus, +0.2s duration (cap 8s).                                                   | **Steadfast Hymn:** caster cleanse and 4s hard-control resistance.                                                                                     | Ballad's guarded-damage counter changes when to accept a hit; Rhapsody's other-ally ward changes proximity. Cleanse/resistance apply to the caster, not every chorus recipient.                                                                                              |
| **Bolster:** caster cleanse/resistance/movement, prepared chorus spreads cleanse/haste → +2% movement bonus, +0.2s rally time (cap 8s). | **Resounding Courage:** 24-damage close burst banked for 5s; a positive direct hit within 100u releases the caster-centered 90u burst and 25% slow/2s. | Ballad guard-counters; Rhapsody wards other allies. Grand creates an offensive close approach without re-selling cleanse/resistance; even a close basic triggers it without Flourish. Burst damage remains secondary and cannot recursively prepare itself.                  |
| **Shatter:** close Discord burst → +12% damage, +3u radius.                                                                             | **Shattering Retort:** +10 damage; 4s retort at 40% resolved damage, released by incoming damage or next positive direct hit.                          | Ballad rewards control; Rhapsody leeches. Honed raises the retained retort magnitude; charged follow-through differs from the starting Whispers pull.                                                                                                                        |
| **Words of Terror:** aerial mental damage/slow field → +10% tick damage, +0.25s time (cap 8s).                                          | **Pursuing Dread:** +15u radius; follows first effectively damaged foe up to 6s, including flyers.                                                     | Madness adds wind-up suppression; Dirge adds allied movement. Native movement slow is not sold again. Following territory can track one boss; airborne targeting is preserved explicitly.                                                                                    |
| **Psychic Blade:** ranged Discord shot → +12% damage, +20 projectile speed.                                                             | **Shattering Secret:** +8 damage, 60u impact blast.                                                                                                    | Madness rewards prior control; Dirge leeches. A blast changes target coverage, not another pierce/fan; ordinary speed and damage retain boss value.                                                                                                                          |
| **Mantle:** blink with 0.3s phasing → +8u travel, +0.02s phase (cap 0.6s).                                                              | **Unbound Mantle:** 25 caster healing, 3s hard-control resistance.                                                                                     | Madness adds 30 absorption/4s; Dirge adds one frontal block/4s. Relocation, resistance, repair and post-crossing protection remain separate. Rooted use is permitted by the actual resistance payload, including copies.                                                     |
| **Healing Refrain:** effective heal prepares Harmony → +8% healing, +8u reach.                                                          | **Shared Refrain:** +15 healing and 40% effective-heal relay to one other injured ally within 180u.                                                    | Madness hastes the primary recipient; Dirge cleanses them. Relay does not recursively trigger Harmony/cleanse; primary recovery remains useful solo.                                                                                                                         |

## Limits, ownership and Forge synthesis

No arena, camera, adaptive-difficulty or shared-limit formula changes are needed.
The common limiter bounds ordinary/melee geometry to the arena's short dimension:
cones 20%, damaging areas 24%, healing/support areas 32%, dash/blink travel 42%.
A standard 1000u short side means 200u cones, 240u damage and 320u support radii;
a smaller 800u arena means 160u/192u/256u. Following does not enlarge a field.
Preserve and Warding respect recipient health growth and the shared 50%-max-health
absorption ceiling. Stronger existing protection is preserved; equivalent casts
do not multiply the pool. Healing overflow remains subject to its own ceiling.

Warding Honed deliberately develops reach and time instead of nominal capacity:
70 absorption already reaches the cap for some low-health recipients. Preserve's
55-point grant still has meaningful capacity growth on its native caster, but
may cap earlier on a frailer ally. Aura has meaningful 40-point capacity growth.
Flight avoids ground hazards; it is not immunity to aerial/mental/direct attacks.
Frontal guard requires facing the real source and finite charges; ordinary
immunity preserves those charges. Covenant adds counter quality while
Unbreakable adds a second block and resistance, rather than stacking one binary
flag twice without a payoff.

Support grand recipes use a shared delivery-and-hook predicate for both actual
mutation and Forge offer wording. Same-kind payloads missing required healing,
aura, absorption, verse, landing or targeting hooks receive the stated generic
25% magnitude / 15% footprint fallback instead of unsupported native riders.
Honed uses the actual native delivery/payload shape and the same live/preview
path; altered shapes use the existing generic Honed tuning and actual first-rank
text. Matching recipes retain their authored recipient rules. Explosive or
zone-carrying Guiding Bolt/Psychic Blade variants use the fallback rather than
claiming an unavailable pierce/impact conversion. Starting skills use the same
bounded recipe wrapper; identities give useful magnitude/coverage growth when
an altered delivery cannot carry a native route.

All added payloads use existing priced Forge components: barrier, flight,
cleanse, resistance, guard/counter, relay, rescue, recovery, challenge, suppression,
forced movement, retort, close burst and following-zone contracts. The parent
integration must verify actual synthesis, not only decompose/recompose. Native
and graft/reclaim replay retain source IDs and shared grand slots; no migration
changes to banks or class selection are introduced here.

Misses, zero/immune damage and dead targets cannot acquire following territory or
release a close burst. Heal-only fields gain their own damage before following;
Consecration already damages. Mantle's resistance is an actual copied payload,
not a subclass-passive dependency. Ground-only following cannot acquire flyers;
Words explicitly retains aerial mental targeting. Shared wards exclude caster,
while finite guards/barriers name the actual recipient. Class changes/downing
continue to use existing readiness and protection cleanup.

Rejected overlaps: another Holy Strike stun after ordinary Radiant Strike;
Cleric/Bard starting grands both granting flight; dead cooldown promises for
4s/recovery-limited heals; increasing capped Warding capacity; heal-only following
that never acquires a foe; an unsupported Charge controlled-damage/leech rider;
an echo requiring unavailable precision; and a Shield counter requiring real HP
damage through immunity plus two new blocks. Overlapping numerical leech/control
bonuses are retained where they add magnitude; they are not called new playstyles.

## Compatibility aliases

These 18 IDs remain lookup-only aliases and cannot appear as separate offers or
consume duplicate bank/grand capacity. Alias replay resolves the canonical skill
rather than preserving retired whole-class stat packages.

| Retired ID          | Canonical ID    |
| ------------------- | --------------- |
| `cl_grand_beacon`   | `cl_gk_a1_a`    |
| `cl_grand_avatar`   | `cl_gk_a3_b`    |
| `cl_gk_basic_a`     | `cl_gk_basic_b` |
| `cl_gk_a1_b`        | `cl_gk_a1_a`    |
| `cl_gk_a2_a`        | `cl_gk_a2_b`    |
| `cl_gk_a3_a`        | `cl_gk_a3_b`    |
| `pa_grand_aegis`    | `pa_gk_a3_a`    |
| `pa_grand_dawn`     | `pa_gk_basic_a` |
| `pa_gk_basic_b`     | `pa_gk_basic_a` |
| `pa_gk_a1_a`        | `pa_gk_a1_b`    |
| `pa_gk_a2_b`        | `pa_gk_a2_a`    |
| `pa_gk_a3_b`        | `pa_gk_a3_a`    |
| `ba_grand_symphony` | `ba_gk_a1_b`    |
| `ba_grand_ballad`   | `ba_gk_basic_b` |
| `ba_gk_basic_a`     | `ba_gk_basic_b` |
| `ba_gk_a1_a`        | `ba_gk_a1_b`    |
| `ba_gk_a2_b`        | `ba_gk_a2_a`    |
| `ba_gk_a3_b`        | `ba_gk_a3_a`    |

## Review and validation

Focused catalogue checks cover formatting, TypeScript and registry shape. Parent
integration owns runtime casts, real Forge synthesis, ordinary/grand/identity
combinations, all first picks, native/graft/reclaim/class swaps, Haste/recovery,
fixtures/audits and desktop/phone control evidence. Release results belong here
once those checks finish; no pending check is represented as passed.

Owner live-test priorities: facing Shield after immunity; moving a follow-heal
field into danger; choosing to stay in or leave recovery territory; immediate
full-health Bard routes before Harmony; Bolster's close follow-through; and the
selected-recipient barrier versus group chorus. Equal balance and play feel
remain open to that review. The next roadmap step is whole-system balance,
acquisition, graft and compatibility review after this cohort is accepted.

Existing Forge recipient distinction: composed `buffAlly` is a rally to living
allies in range, while a native `buffAlly` chooses the lowest-health recipient.
Zealotry flight follows that delivery. Sheltering Cadence absorption still goes
to only the lowest-health recipient on either path; a chorus/rally does not
turn its single barrier into a separate shield for every party member.

## Owner live-test guide

Start with three short comparisons when the relevant choices are available:

1. **Cleric:** compare planted Sanctuary with Pilgrim Bloom. Bloom should acquire
   its own ground target, follow it and carry healing with it. Try Miracle on an
   afflicted ally, and Zealotry on a chosen recipient. Flare's finite block
   protects the caster while its barrier can protect a different ally.
2. **Paladin:** combine Covenant of Devotion with Unbreakable. After immunity,
   a frontal hit during the remaining block window should ready a counter
   without hurting you. The four-second blocks start on cast; immunity preserves
   charges while their timer continues. Compare Avenging Wrath's control setup
   with Relentless Vengeance's sustain/movement. Blessed Reprisal should put its
   damage buff on the healed recipient alongside the caster's Renewal aura.
3. **Bard:** compare the two identities before obtaining a chorus; Mockery and
   Whispers should already supply useful routes at full health. Sheltering
   Cadence shields its selected recipient. With Resounding Courage, Bolster
   readies a burst that a nearby direct attack releases once; distant hits leave
   it ready. Then check ordinary Harmony/Discord → chorus with the new choices.

Across all three, earn an alternative identity, bank it, swap explicitly between
fights, and confirm that the outgoing identity's effects leave the active kit.
Try one grand alongside five Honed ranks and Haste. Shared limits remain visible
in the optional rules reference instead of repeated on every card.

## Release verification

- Final full serial run: **4,142/4,143 tests pass** across 165 files. The sole
  failure is an existing grand-menu replacement test exceeding its unchanged
  5s timeout under local load. Its whole eight-test file passes unchanged in
  isolation (568ms test time). CI must confirm a complete green run.
- All unchanged 98% coverage gates pass: branches **98.06%**, statements 99.43%,
  functions 99.66%, lines 99.78%.
- Build/typecheck, full lint followed by changed-path lint, full formatting and
  both generated audit checks pass. Catalogue: 374 canonical definitions, 72
  lookup aliases. Recharge audit: 6,144 observations / 2,688 profiles, 4–21.2s.
- New support integration covers 144 legal native/actual Forge builds, every
  first pick, 24 Honed profiles through five ranks, native/composed recipients
  and runtime payoffs, and healing-projectile fallback without phantom attack
  riders. The two new catalogue-wide matrices have explicit 60s/30s budgets;
  pre-existing UI test timeouts remain unchanged.
- All twelve support grand browser cases pass on desktop and 320px phone touch.
  Expanded phone identity/grand descriptions were inspected and fit without
  horizontal overflow. Existing repository-wide browser gates remain in CI.

Remaining balance questions include relative identity power, overlapping counter
preparation sources, reward availability and graft alternatives. The complete
catalogue makes those comparisons possible in the next review; this delivery
establishes specific functioning combinations, not equal power or final balance.
