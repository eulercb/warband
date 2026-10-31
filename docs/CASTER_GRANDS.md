# Mage and Sorcerer: authored upgrade builds

**Sorcerer follow-up:** [Weaving and favorable outcomes](SORCERER_LUCK.md)
supersedes the Sorcerer mechanics recorded below: Bend Luck is Fortune rather
than a teleport, Spell Weave recycles utility cooldowns rather than generating
Surge, Ascent adds absorption/movement, and instant Surge spells gain distinct
riders. Mage entries and the four-grand framework remain current.

Each class now has four native-skill grands, eight individual subclass-skill
grands and four identities. The loadout remains four grands **per class**: two
starting skills (including basic/grafts), one bound subclass skill and one
identity. Earned alternatives stay banked; players explicitly swap between
fights. Only the active class applies. This cohort follows Ranger and Druid.

## Identities and actual first-pick routes

| Subclass   | First identity                                                                                                                                                                                                        | Alternative identity                                                                                                                                                                                                     | Base kit plus every possible first skill against one boss                                                                                                                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Evoker     | Arch-Evoker: Arcane Bolt/Fireball gain +25% controlled-target damage; direct Evoker strikes gain +20%.                                                                                                                | Overchannel: basic slows 20% for 2s, Frost Nova suppresses wind-ups by 35% for 3s, direct Evoker strikes suppress by 30%.                                                                                                | With Lightning, Cone, Sculpt or Shield first: Nova → basic/Fireball exploits Arch-Evoker. Overchannel basic → Cadence works at range, even when Shield is the only subclass skill. No second spell or adds required.                                    |
| Abjurer    | Grand Warding: Blink blocks one frontal damage hit for 4s; subclass barriers gain 20% amount and +1s duration up to 8s; Life Transfer cleanses.                                                                       | Binding Dominion: basic gains +25% controlled damage; Nova gains 35u radius and 1s slow. Direct subclass strikes gain +20% controlled damage, damaging fields suppress wind-ups, Door heals 20, dedicated heals gain 15. | With Ward, Bind, Door or Transfer first: Blink → face incoming hit uses Grand Warding. Nova → basic uses Dominion immediately. Transfer does not need to supply control; starting Nova already does.                                                    |
| Draconic   | True Dragon: Surge Ascent grants 4s flight or extends existing flight by 2s (same 6s gate, 9s extension cap); Mirror gains 10 movement points; direct Draconic spells gain 10% damage, Wings gain 10 movement points. | Wyrm's Pursuit: basic slows 20% for 2s → Meteor gains +30% controlled damage; direct Draconic strikes gain +25%, Wings grant 3s hard-control resistance.                                                                 | With Breath, Wings, Chromatic or Scales first: Mirror/Phase → Meteor enters actual flight under True Dragon. Basic → prepared Meteor supplies Pursuit's controlled target without needing Breath or Scales first.                                       |
| Wild Magic | Unbound Chaos: Chaos Bolt may spend surge for one extra bolt sharing the same +20% total damage budget. Direct Wild strikes gain 15% damage; utilities gain power/footprint.                                          | Chaos Crossing: Mirror gains 15 movement points; Phase gains 50u travel and 3s hard-control resistance. Bend heals 25, Ward grants allies 25% movement, direct Wild strikes slow 25% for 2s.                             | With Surge, Tides, Bend or Ward first: Mirror/Phase → basic spends Unbound surge, or save it for Meteor; three ordinary basics also prepare Spell Weave without a rare delivery pair. Crossing's starting Mirror/Phase route works with all four picks. |

These identities preserve the revised passive gates. Arch-Evoker does not change
Cadence's once-per-6s refund, held evocation or basic-spending exclusion. Binding
Dominion uses the existing movement-control setup for Binding Ward; wind-up
suppression alone does not count as slowed/rooted/stunned. True Dragon changes
only the existing active Draconic Surge Ascent flight magnitudes, with the same
gate. Longer existing flight is never shortened to the 9s extension cap. A copied
Draconic skill does not create the passive. Spell Weave still uses actual basic
casts, an 8s window/gate and no progress while surge remains held.

## Native skills: combined layers

| Skill        | Base and ordinary role                                                                                                                        | Canonical grand                                                                                                                   | Identity combinations and marginal payoff                                                                                                                                                                                                                |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arcane Bolt  | A single aimed bolt; Arcane Surge adds damage/recharge.                                                                                       | `mg_gk_basic_a` Arcane Barrage adds two lanes in a 14° fan and +5 damage per bolt.                                                | Arch-Evoker rewards Nova setup across the lanes. Overchannel supplies slow at range and starts Cadence. Neither ordinary nor identity repeats the fan.                                                                                                   |
| Fireball     | Charged impact blast with +25% controlled damage; Quickened Casting reduces wind-up, Combustion grows damage/blast and the conditional bonus. | `mg_gk_a1_a` Supernova adds 35 damage, 30u blast and 40% wind-up suppression for 3s.                                              | The grand changes the victim's next action timing; ordinary cast speed changes the user's delivery. Arch-Evoker adds conditional pressure; Overchannel supplies setup through basic/Nova rather than selling Fireball the same suppression again.        |
| Frost Nova   | Close circular movement slow; Deep Freeze adds genuine freeze, damage and radius.                                                             | `mg_gk_a2_b` Polar Vortex adds a 140u pull and 20 damage.                                                                         | Freeze stops an action; pull gathers toward the caster and changes risk/position. Overchannel adds wind-up suppression, Dominion extends coverage/slow, Arch-Evoker exploits the controlled target.                                                      |
| Blink        | Teleport with short i-frames; Flicker grows travel, i-frames and bounded recharge.                                                            | `mg_gk_a3_b` Displacement Ward adds 45 self-healing, 3s hard-control resistance and 50u travel.                                   | Grand Warding adds a separate frontal block. Healing repairs injury, resistance protects the crossing and the block absorbs a later facing hit. Ordinary i-frames remain a distinct short immunity window.                                               |
| Chaos Bolt   | Two bolts; Twinned Spell grows count and damage.                                                                                              | `so_gk_basic_b` Chaos Lance adds two pierces, 8 damage per bolt and 250 projectile speed.                                         | Ordinary count retains its fan; piercing changes the line through bodies. Pursuit supplies slow, while Unbound Chaos offers a real choice to spend held surge on basic delivery. Against one boss, damage/speed remain useful even without extra bodies. |
| Meteor       | Charged impact blast, consumes surge and shares the enhanced total across a twin; Empowered Meteor grows damage/blast and speeds casting.     | `so_gk_a1_a` Extinction adds 30 damage, 40u blast and 0.8s freeze.                                                                | Freeze differs from Fireball's suppression. Pursuit pays for control already present before impact; the same Meteor's own freeze sets up later attacks. True Dragon supplies actual post-spend flight.                                                   |
| Mirror Image | Three finite defensive images, movement and surge preparation; ordinary picks grow image count/time and readiness.                            | `so_gk_a2_a` Legion of Mirrors grants 4s hard-control resistance and gives other living allies within 180u 20% mitigation for 4s. | The grand does not sell images again after ordinary ranks reach their cap. Solo still gains resistance. True Dragon/Crossing grow movement; party mitigation excludes the caster explicitly.                                                             |
| Arcane Phase | Teleport/i-frames and surge preparation; Distant Leap grows travel/i-frames and bounded recharge.                                             | `so_gk_a3_b` Phase Shift adds 70u travel and two frontal blocks for 3s.                                                           | Facing the next attack matters after relocation. Crossing's resistance and travel are separate from guard; Unbound can spend prepared surge on a basic, while True Dragon saves it for a heavy flight trigger.                                           |

## Individual subclass skills: combined layers

All sixteen skills have authored Honed profiles. Matching native payloads receive
4% recharge improvement per rank in the existing shared ordinary budget; duration,
reach and Haste-inclusive recovery limits still resolve through the common path.
Straightforward magnitude growth remains where it supports the skill's job; it is
not presented as a second new playstyle.

| Skill           | Authored Honed role                                                                    | Individual grand and combined value                                                                                                                                                                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lightning Bolt  | +10% damage and 2 controlled-damage points per rank.                                   | Conducting Lance adds three pierces and 150 speed. Honed rewards setup; Arch-Evoker further exploits it, Overchannel suppresses the next action. Against one boss the faster bolt remains useful.                                                                                          |
| Cone of Cold    | +10% damage and 4u reach per rank; preserve arc/slow.                                  | Crystalline Edge adds 0.9s freeze and 35u reach. Movement slow remains useful when freeze expires/resists; suppression from Overchannel changes wind-up timing separately.                                                                                                                 |
| Sculpted Blast  | +12% damage and 2 controlled-damage points per rank.                                   | Sculpted Retort adds 10 damage and arms one 4s retort for 40% of resolved spell damage, released by incoming damage or the next positive direct hit. The charged close burst creates a later timing choice; it does not become another ranged Fireball.                                    |
| Arcane Shield   | +10% peel damage, 8% barrier amount and 6u outward force per rank.                     | Siphoning Shield adds 12 damage and 35% effective-damage leech. The preemptive barrier remains separate from post-hit healing; damage growth still helps even when barrier amount reaches its shared cap.                                                                                  |
| Arcane Ward     | +10% burst damage, 4u radius and 0.2s barrier duration per rank, up to 8s.             | Warding Reversal adds 160u outward push and 10 damage. Grand Warding adds barrier duration; Dominion exploits/sustains its control. Honed never claims uncapped growth from the already cap-sized 50-point native barrier.                                                                 |
| Otiluke Bind    | +12% tick damage and 0.25s duration per rank, up to 8s.                                | Sanctum Prison adds 20u radius and 20% ally mitigation inside the cage. Base roots already immobilize; the grand creates protected control territory rather than re-selling roots or following an immobile target. Dominion adds wind-up suppression; the cage's aerial targeting remains. |
| Dimension Door  | +10u travel and 4u endpoint relocation radius per rank.                                | Guarded Door adds 40u travel and one frontal block for 4s. Deterministic arrival/departure relocation and the moved foes' 35% slow for 2s remain unchanged. Dominion adds actual self-healing, Grand Warding's starting Blink remains a separate skill choice.                             |
| Life Transfer   | +12% primary healing, 8% barrier amount and 10u recipient reach per rank.              | Rescuing Transfer adds 15 healing and +25% next-direct-hit readiness for 5s after effective healing from 35% HP or less. Grand Warding cleanses and extends the existing barrier; Dominion adds healing. No competing immediate bubble displaces its own native one.                       |
| Dragon Breath   | +12% damage and 4u reach per rank.                                                     | Driving Breath adds 150u outward push and 8 damage. Push changes spacing after the cone; True Dragon changes flight after surge spend, Pursuit rewards already-controlled targets.                                                                                                         |
| Dragon Wings    | +3 movement points and 0.25s surge readiness per rank, up to 9s; keep flight duration. | Sheltering Wings adds 10 movement points and 20% mitigation for other allies within 180u for 4s. Solo gains movement. True Dragon owns flight extension; neither Honed nor grand saturates the same flight duration. Pursuit supplies control resistance separately.                       |
| Chromatic Bolt  | +12% damage and 8% projectile speed per rank.                                          | Chromatic Hindrance adds 12 damage and 40% wind-up suppression for 3s. It stays an aimed heavy bolt rather than another Meteor bomb; its surge twin still shares total damage.                                                                                                             |
| Draconic Scales | +12% burst damage and 0.2s barrier duration per rank, up to 8s.                        | Molten Reprisal adds 18 damage and one 4s 40%-damage retort. Honed does not claim amount growth from 55 protection already above Sorcerer's native 52.5 cap. Retort adds delayed pressure after a protected close cast.                                                                    |
| Chaos Surge     | +10% per-bolt damage and 8% speed per rank, preserve chosen fan.                       | Focused Chaos narrows the fan to 14° and adds 150 speed. Concentration trades wide coverage for boss pressure; ordinary native basic fan remains wide, Unbound increases damage without another projectile-count clone.                                                                    |
| Tides of Chaos  | +12% burst damage and 4u radius per rank.                                              | Gravitic Tides adds 140u inward pull and 10 damage. Pull changes close positioning; Crossing supplies a separate movement slow, True Dragon is not available to the Wild subclass.                                                                                                         |
| Bend Luck       | +10u travel and 0.25s surge readiness per rank, up to 9s.                              | Fortunate Crossing adds 40u travel and one frontal block for 3s. Chaos Crossing heals 25 after relocation; guard protects a later facing hit, while native i-frames protect the crossing.                                                                                                  |
| Wild Ward       | +12% healing and 0.25s duration per rank, up to 8s.                                    | Sheltering Chaos adds 20% ally mitigation inside the field, including at full health. Crossing adds ally movement, Unbound improves healing/footprint. Slow, healing, movement and mitigation serve different purposes.                                                                    |

Ward's native 50 protection equals Mage's 50%-HP cap. Scales' 55 already exceeds
Sorcerer's 52.5 cap. Recipient max-HP scaling preserves those ratios as health
grows; multiplying their amounts again would never create native headroom.
Duration and offensive growth therefore carry their Honed value. Grand Warding's
amount growth remains useful for Life Transfer's smaller barrier; its duration
adds value to Ward. The shared strongest-cast/refresh rules still apply. Fixed
direct grants keep the previously delivered cast-time recipient-health scaling,
starting-class baseline and shared 50% cap; no second health multiplier or extra
estimator credit is added here.

## Combined build examples

- Evoker pressure: Nova → Arch-Evoker Barrage/Fireball, with Supernova suppressing
  the next wind-up and Sculpted Retort banking a later burst. Choose two starting
  grands; taking Barrage and Supernova means foregoing Polar Vortex/healing Blink.
- Evoker control: Overchannel basic → Cadence refund/preparation → Crystalline
  Edge → Fireball. Polar Vortex can gather into the cone; its pull still matters
  after ordinary Deep Freeze is owned. Arcane Shield first still has this basic
  setup loop and can choose leech for close recovery.
- Abjurer guard: Grand Warding Blink → face the next frontal hit → Warding
  Reversal peels while the existing barrier covers damage. Ward Honed extends
  duration and damage; it does not inflate an unusable cap-sized pool.
- Abjurer territory: Dominion Nova → controlled basic, then Sanctum Prison holds
  and protects a shared location. Door instead supports relocation into a later
  facing block; Transfer first still has the complete Nova/basic control loop.
- Draconic ascent: Mirror → Meteor → four seconds of actual flight under True
  Dragon. Sheltering Wings adds movement/other-ally protection, not another
  duration overwrite. Casting Wings while already flying and then spending surge
  uses the existing longest-flight extension rule and the same 6s gate.
- Draconic pursuit: basic slow → surged Meteor/Chromatic; Extinction freeze
  prepares later hits, while Chromatic Hindrance stretches a later wind-up.
  Driving Breath pushes outward; Molten Reprisal instead pressures after a close
  protected cast. Both are bound-skill choices, so only one is equipped.
- Wild delivery: prepare surge with Mirror/Phase or three basic casts, then choose
  an Unbound basic fan or save it for Meteor/Focused Chaos. The enhanced budget
  is shared among the extra projectiles; held surge does not become passive
  permanent +20% damage on every cast.
- Wild crossing: Phase resistance → reposition → Meteor/Tides, with Gravitic
  Tides pulling into a later burst. Fortunate Crossing supplies a later guard and
  identity healing; Sheltering Chaos instead protects recovery territory with
  movement, healing and mitigation. Solo retains the complete starting route.

## Targeting, synthesis and failure boundaries

Bolt fans, piercing lanes, impact blasts, direct cones and close bursts retain
their actual flight/obstacle hit tests. Polar Vortex/Tides pull and Breath/Ward
push use the existing forced-movement and root-resistance policy. Otiluke is an
aerial force cage and retains true roots; Wild Ward remains physical recovery
terrain. A zone's visual kind does not grant flight or aerial reach. True Dragon
and Wings provide actual caster flight: ground hazards/ground fields are avoided,
while direct attacks can still hit. Guard requires facing; resistance does not
make incoming damage harmless.

Dimension Door's arrival foes return to departure and departure foes scatter
outward deterministically; moved foes receive the existing short slow and roots
resist relocation. The new catalogue never replaces `swap` with a generic blink,
changes the exchange algorithm or adds a second movement input. Honed grows its
actual relocation radius, and the grand adds a separately visible guard.

Recipes require compatible delivery and real prerequisite hooks. Projectile
piercing/concentration recipes also require a direct projectile without an impact
blast or zone payload. Changed Forge deliveries and missing-hook payloads receive
power/footprint growth, with adapted grand offer descriptions. Honed checks the
static authored source rather than assuming the Forge-resolved ID still carries
flight, absorption, true roots, surge, healing ticks or swap. Same-kind incomplete
payloads use generic tuning. First-rank offer text simulates the same guarded
live tune; it cannot claim 8% generic recharge for an authored 4% rank.

The changes use existing executable, decomposable, fitted and valued effects.
Surge twin delivery shares the enhanced budget, and a zone-payload fusion cannot
duplicate zones via extra surge shots. New wards preserve stronger existing
values. Existing misses, zero damage, immunity, full health, no second ally,
downing, active-class/passive ownership and positive-direct-hit gates remain in
force. Dedicated rescue requires actual effective healing and a real low-health
recipient; retorts release once and supplemental damage cannot recurse. Copied
skills remain useful without importing their source subclass passive.

Rejected overlaps include: a second freeze grand on Frost Nova after Deep Freeze;
another image-count grand after ordinary Mirror caps; following a cage whose own
roots prevent movement; extending flight from Honed, Wings grand and identity at
once; turning Chromatic Bolt into another Meteor; adding a parry counter that a
first-pick Arcane Shield could not spend before expiry; and percentage amount
increases advertised on already cap-sized Ward/Scales. Numeric conditional damage
can remain useful growth, but it is not labeled a second distinct mechanic.

## Saved IDs and review

Twelve retired IDs remain lookup-only aliases. Old history/banks normalize and
deduplicate before slot selection; broad class stat grands no longer stack outside
the four per-class slots.

| Retired IDs                          | Canonical ID    |
| ------------------------------------ | --------------- |
| `mg_grand_archmage`, `mg_gk_basic_b` | `mg_gk_basic_a` |
| `mg_grand_cataclysm`, `mg_gk_a1_b`   | `mg_gk_a1_a`    |
| `mg_gk_a2_a`                         | `mg_gk_a2_b`    |
| `mg_gk_a3_a`                         | `mg_gk_a3_b`    |
| `so_grand_wild`, `so_gk_basic_a`     | `so_gk_basic_b` |
| `so_grand_cataclysm`, `so_gk_a1_b`   | `so_gk_a1_a`    |
| `so_gk_a2_b`                         | `so_gk_a2_a`    |
| `so_gk_a3_a`                         | `so_gk_a3_b`    |

Integration verification must cover real native/composed casts, actual synthesis,
every identity with each first skill against one boss, five Honed ranks and
same-kind missing-hook fallback, legacy normalization/four-slot banks, active
class isolation, graft/reclaim, ordinary/Haste limits and desktop/320px previews.
Parent integration records measured release results. Balance and play feel remain
owner live-test gates, including suppression versus burst, guard versus control,
surge delivery versus crossing, flight usefulness and fair recovery windows.
Broader graft alternatives and final economy review remain roadmap work.

## Rooted movement and live checks

A rooted dash/blink without explicit control resistance is rejected before
spending cooldown or a held cast resource, and before granting its guard or other
support payload. Skills explicitly granting steadfast/control resistance retain
the existing root-breaking behavior. This applies to native and composed
movement; Dimension Door's deterministic relocation rules are unchanged.

For owner testing after green CI: compare both identities with a single first
subclass pick, use Nova/basic control before Fireball, compare a held Surge spent
on a Wild basic volley against Meteor, and test True Dragon's flight without
Wings first. Try full-health Otiluke territory and stand beside an ally for Mirror/
Wings wards: those shared wards protect other allies, not the caster. With Ward/
Scales Honed, look for longer protection rather than a larger capped blue bar.
Try each retort through a connecting direct attack and through an incoming hit.

## Release verification

- The final serial coverage run passes 4,087 of 4,088 tests; the remaining lobby
  UI test hits its unchanged 5s wall-clock timeout. Its entire five-test file then
  passes unchanged in isolation. No timeout, assertion or coverage exclusion was
  relaxed; GitHub CI must confirm the complete run before merge.
- Branch coverage is 98.03%, above the unchanged 98% gate. All gameplay cases pass,
  including 96 legal native/actual Forge builds, all first picks, five Honed ranks,
  native/composed retorts, full-health territory, ally-only wards, Surge budgets,
  rooted movement, disabled-hook fallback and stronger guard/ward preservation.
- Eight caster desktop/320px grand-control cases pass, as do eight earlier
  Rogue/Warlock cases after the shared helper began deriving native IDs from the
  registry. The phone capture was visually inspected for overflow and slot layout.
- Build, lint verification, formatting and both regenerated audit checks pass:
  368 canonical upgrades, 200 grands, 54 lookup-only aliases, and 6,144 recharge
  observations / 2,544 profiles within 4–28s.

The offer and runtime now share the same caster recipe eligibility predicate;
explicitly disabled prerequisites cannot produce native riders behind fallback
wording. A concentration grand also preserves an already straight legacy volley
instead of widening it. These checks establish specific contracts; numeric
balance and play feel still require the owner's live testing.
