# Ranger and Druid: authored upgrade builds

Each class has four canonical native-skill grands, eight individual subclass-skill
grands and four identities. The existing loadout remains two starting-skill grands
(basic/grafts included), one bound subclass-skill grand and one identity. Earned
alternatives stay banked; explicit swaps happen between fights. Only the active
class applies. This is the third authored content cohort, following Rogue/Warlock
and Knight/Barbarian/Monk.

## Identity choices and first-pick routes

| Subclass     | First identity                                                                                                                                                                                                                | Alternative identity                                                                                                                                                                | Starting kit with any first subclass skill, against one boss                                                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hunter       | Apex Predator gives Arrow, Multishot and direct Hunter strikes +25% damage against already controlled foes.                                                                                                                   | Relentless Hunt makes Roll a 4s sprint and 2s control-resistant crossing; Hunter direct strikes suppress wind-ups, and Stand's allied movement improves.                            | Rain → Arrow/Multishot supplies controlled-target pressure. Alternatively Roll → reposition → shoot works even if Stand is the only subclass skill.                                                |
| Beast Master | Alpha's Fury halves wolf wind-up to 0.15s and increases its controlled-quarry bonus from 25% to 50%, retaining the 2.5s command interval. Roll braces one frontal block; direct Beast strikes gain a controlled-target bonus. | Pack Tactics turns Rain into shared defensive territory and adds healing to Roll and Beast mobility; dedicated Beast healing, field movement and direct-hit leech improve.          | Rain → positive Arrow hit commands the wolf with any first skill. Alternatively Rain → stand in the protection → Roll/heal when injured works without Nature's Bond or another ally.               |
| Moon         | Primal Avatar extends form and stride from 6s to 8s; the 12s entry interval remains. Cyclone and direct Moon strikes leech, and recovery groves widen.                                                                        | Feral Swiftness increases claw reach from 95u to 125u; Cyclone/direct Moon strikes suppress wind-ups, Moon heals cleanse, mobility heals and prepared bramble bursts reach farther. | Any nonbasic, including starting Regrowth/Cyclone/Entangle, enters form when ready. Approach → basic claw connects during the chosen window; neither identity requires Maul, Pounce or Roar first. |
| Land         | Wrath of the Land rewards controlled Thornlash and direct Land strikes; Cyclone and damaging Land fields gain useful ordinary damage.                                                                                         | Eternal Season gives Regrowth one effective-healing relay and strengthens Entangle healing; Land fields grant allied movement, healing fields improve, and direct strikes slow.     | Entangle → Thornlash uses Wrath even with Healing Spring first. Eternal Season gives solo healing territory immediately; relay adds value only when a second wounded ally exists.                  |

Wolf and form improvements use their existing passive gates. A copied Beast skill
does not create a companion, and a copied Moon skill does not grant permanent form.
The abilities remain independently useful. Wolves remain supplemental damage:
no recursive commands, critical rolls, direct-hit rescue consumption or body tanking.
Form claws remain supplemental, with the existing explicit close-burst exception.
The longer form does not shorten its re-entry interval; longer claws do not increase
their damage or add an extra attack input.

## Native skills: combined layers

| Skill          | Ordinary growth retained                                                              | Canonical grand                                                                                               | Identity combinations and marginal value                                                                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arrow          | Piercing Shots adds damage/speed; Frost Arrows supplies movement slow.                | `rg_gk_basic_b` Railshot adds three extra pierces, damage, speed and travel cap.                              | Apex rewards controlled connections; Railshot changes the firing lane rather than adding another slow. Relentless supplies safe repositioning.                                                                                   |
| Multishot      | Volley expands its fan; Piercing Shots adds damage; Frost Arrows slows.               | `rg_gk_a1_b` Frostvolley adds freeze and damage.                                                              | Freeze stops an action rather than repeating ordinary movement slow. Apex's damage needs existing control; subsequent arrows/casts can exploit it. Wider ordinary fans retain coverage value.                                    |
| Rain of Arrows | Barbed Rain adds ticks, time and radius.                                              | `rg_gk_a2_b` Pursuing Rain follows its first damaged foe for 3s, then anchors.                                | Radius/time remain valuable during travel and after anchoring. Pack Tactics adds ally mitigation to the moving field; it does not duplicate follow.                                                                              |
| Roll           | Fleet-footed increases distance/i-frames within recovery limits.                      | `rg_gk_a3_b` Detonating Roll adds a landing blast and 50u distance.                                           | Escape toward safety competes with landing near the quarry. Relentless helps the next crossing; Alpha braces a frontal hit; Pack heals the user. None repeats the blast.                                                         |
| Thornlash      | Splintering Thorns adds projectiles and damage.                                       | `dr_gk_basic_b` Bramble Spear adds two extra pierces and +30% controlled-target damage.                       | Additional ordinary projectiles create more lanes. Wrath adds controlled damage numerically; this is useful conditional growth, not a second new mechanic. Moon still retains its ordinary projectile while claws supplement it. |
| Entangle       | Thorned Grasp improves damage, slow and duration. Existing true roots/healing remain. | `dr_gk_a1_b` Ancient Grove adds ally mitigation/movement inside the field.                                    | Root is already present and is not sold again. Eternal Season adds healing; Wrath exploits its control. The grand rewards holding territory even when healing would overheal.                                                    |
| Regrowth       | Wild Growth improves primary healing, reach and existing grove ticks.                 | `dr_gk_a2_a` Wild Bloom adds 35 direct protection for 4s to the selected recipient, including at full health. | Recovery remains post-hit healing territory; protection can be cast before damage. Eternal Season relays actual healing to another injured ally rather than duplicating the protection.                                          |
| Cyclone        | Gale Force improves damage, radius and slow.                                          | `dr_gk_a3_a` Tempest pulls targets inward and adds damage.                                                    | Pull changes positioning into Entangle/near Moon claws. Primal Avatar adds direct leech; Feral adds wind-up suppression; Wrath adds damage. All remain separate from gathering.                                                  |

Direct barriers scale with recipient max-HP growth relative to the starting class's
base HP pool: the multiplier is at least 1, is calculated once when cast, and
retains the shared 50%-max-HP strongest-protection and refresh caps. Class swaps do
not change that baseline; later health changes do not rescale an existing bubble.
Existing percentage-based companion protection and
healing-derived bubbles keep their existing formulas. They do not receive the
new direct-grant multiplier a second time. Infernal Claim still earns only 25% of
actual primary damage; its former fixed 25 protection ceiling scales with health,
rather than multiplying the earned amount again. This recipient-health scaling
adds no extra difficulty-estimator credit to the original authored grants.

## Individual subclass skills: combined layers

Every skill below has an authored Honed profile. Matching native payloads receive
4% recharge improvement per rank within the existing shared ordinary budget.
Damage/healing growth is deliberately straightforward where that remains useful.
Honed does not add another copy of its grand's binary behavior.

| Skill          | Honed role growth                                                            | Individual grand and combined value                                                                                                                                                                                                                    |
| -------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hail of Thorns | Damage and outward force.                                                    | Driving Hail adds another 90u push, crossing the force threshold that overpowers roots. Honed force remains; Apex pays for already controlled hits and Relentless suppresses the next wind-up.                                                         |
| Quarry Shot    | Damage and projectile speed; two extra pierces remain.                       | Shattering Quarry adds a 65u impact burst. This is area around a long piercing shot, distinct from Railshot's fast basic lane. Identity control/suppression remains useful on the primary delivery.                                                    |
| Stand as One   | Field damage and allied movement; slow remains.                              | Sheltering Stand adds 20% ally mitigation. Relentless improves speed again rather than setting the same speed flag; Apex still works through starting arrows.                                                                                          |
| Volley         | Damage and projectile speed, preserving fan width.                           | Concentrated Volley narrows the fan to 14° for focused pressure. Honed does not undo that choice; broad coverage remains available through ordinary Multishot.                                                                                         |
| Pounce         | Landing damage and leap distance.                                            | Pack Crossing cleanses/guards the first living ally actually crossed. Solo retains the attack, mobility and identity's wolf/solo support route; crossing has no invented recipient.                                                                    |
| Snare          | Tick damage and bounded field duration; its 25% movement slow remains.       | Clinging Snare allocates 40% of the existing tick budget to 2s strongest-owner poison, up to three targets. It does not mint full field damage plus another full poison stream. Alpha's controlled wolf bite and Pack's ally movement remain distinct. |
| Nature's Bond  | Healing and recipient movement; cleanse and effective-heal wolf link remain. | Rescuing Bond adds 15 healing and prepares a +25% next direct hit for 5s after effective healing from 35% HP or below. The delayed wolf protection remains useful; the grand deliberately does not add an immediate competing barrier.                 |
| Savage Bite    | Damage and leech: five ranks reach 30%, or 40% with Pack Tactics.            | Defiant Bite adds damage and a connecting 0.6s frontal parry. Existing leech sustains; parry changes the timing of the close exchange.                                                                                                                 |
| Dire Maul      | Damage and reach, preserving arc/leech.                                      | Encircling Maul becomes a full-circle swipe. Primal prolongs the form window and adds sustain; Feral extends supplemental claws and suppresses direct-strike wind-ups.                                                                                 |
| Feral Pounce   | Landing damage and leap distance.                                            | Unstoppable Pounce grants control resistance and 20 direct self-protection for 4s. It protects approach rather than adding the Beast crossing's ally delivery.                                                                                         |
| Primal Roar    | Damage buff, close-burst damage and bounded preparation time.                | Pack Shelter adds a ward to other nearby allies. Roar already readies its slowing bramble burst: the grand does not sell that readiness again. Primal extends form; Feral extends burst reach.                                                         |
| Frenzied Regen | Primary healing and existing recovery ticks.                                 | Shared Renewal adds 25 primary healing and relays 35% of effective healing to one other injured ally within 180u. Solo gets the direct healing; party value needs an actual second injury. It does not duplicate Wild Bloom's preemptive barrier.      |
| Erupting Earth | Damage and controlled-target bonus.                                          | Staggering Eruption adds wind-up suppression and damage. Existing blast/controlled payoff remain; Wrath adds conditional damage, Eternal Season adds a movement slow for later attacks.                                                                |
| Wall of Thorns | Damage, healing and bounded field duration.                                  | Wandering Briar follows its first damaged foe for 3s, then anchors. Wrath improves damaging ticks; Eternal Season improves healing/movement. Holding versus pursuing territory is a placement decision.                                                |
| Gust           | Aimed wind damage and push, preserving cone/freeze.                          | Winter Gale adds freeze and reach. Gust itself is now an aimed 260u cone with a 30° half-angle, retaining its 90u push. This distinguishes it from the starting circular Cyclone and that skill's gathering grand.                                     |
| Healing Spring | Healing and bounded duration.                                                | Sheltering Spring adds mitigation, including for full-health allies. Honed healing and Eternal Season movement are still useful; Wrath's starting-kit loop remains available with this first skill.                                                    |

Ordinary boon numbers and Honed caps resolve through existing duration, range,
area and recovery bounds. Increasing Haste or ordinary ranks does not bypass the
4s special-recovery floor. Savage Bite's five native Honed ranks reach 30% leech,
or 40% with Pack Tactics; the combined cap preserves the identity's extra value.
Neither this profile nor Shadow Strike's existing profile reduces a pre-existing
higher leech value. Final previews show the combined payload.

## Combined build examples

- Hunter control: Frost Arrows → Rain → Apex basic/Multishot follow-through;
  Railshot plus Frostvolley use both starting slots. Choosing Concentrated Volley
  for the bound skill narrows a second volley rather than turning every arrow
  into another broad fan. The opportunity cost is Pursuing Rain or a landing Roll.
- Hunter chase: Pursuing Rain plus Detonating Roll and Relentless Hunt maintains
  pressure while the boss moves. Shattering Quarry adds aimed splash, while the
  identity suppresses wind-ups after a connection. The cost is foregoing the
  controlled-target identity multiplier and the basic lane grand.
- Beast pressure: Rain/positive Arrow command → Alpha wolf bite → braced Roll
  approach → Defiant Bite parry. Snare is optional control; the starting field
  already supplies it. Without Bite first, faster commands and braced Roll work.
- Beast support: Pack Rain protects shared territory; Rescuing Bond heals a
  low-health ally/self → next direct hit consumes rescue readiness and commands
  the wolf → its bite can deliver the independently prepared companion ward.
  Pack Crossing supports ally positioning; its solo fallback is the native leap
  plus the complete starting-kit identity loop.
- Moon sustain: Regrowth or Cyclone enters Primal form → close basics supplement
  thorns with claws → Tempest gathers targets → Encircling Maul covers behind.
  Eight seconds of form trades off Feral's extra reach; Shared Renewal offers
  effective-healing party support without another immediate bubble.
- Moon reach: Feral claws allow a 125u gap while Cyclone suppresses wind-ups;
  Roar preparation → near basic claw/direct connection releases its bramble
  burst. Unstoppable Pounce protects entry if selected, but starting Cyclone
  already enters form. Form remains temporary with visible recovery.
- Land pressure: Entangle → controlled Bramble Spear → aimed Erupting Earth,
  with Wrath and Staggering Eruption. Ancient Grove rewards standing with allies
  in the same territory; Tempest instead trades that starting slot for gathering.
- Land support: Eternal Season Regrowth → actual relay injury, plus Ancient
  Grove and Sheltering Spring. Healing, mitigation and movement each serve a
  different purpose. Solo can stand in healing/defensive territory; relay simply
  has no second target and creates no fabricated healing.

## Targeting, Forge and failure boundaries

Rain and Stand are overhead arrow fields that reach flyers. Entangle, Snare,
Wall and healing terrain remain physical ground effects; following a target
never makes ground damage aerial. Direct arrows, eruptions, aimed wind, melee
strikes and landing attacks use their existing direct hit tests, including flight
and obstacle policy. The wolf can cross cover/reach flyers but cannot block hits.
Form claws retain their existing cone hit test. No new target scanning or button.

Recipes require the actual intended delivery. Changed Forge delivery receives
adapted magnitude/footprint growth rather than phantom fields. Authored identity
perks likewise require compatible delivery; changed base deliveries receive
useful generic growth. Damage-follow/poison recipes also require actual damaging
field ticks; a pure healing field uses the generic fallback instead.
Honed additionally
checks static native provenance and required payload hooks; incomplete same-kind
payloads use the generic tune. Forge first-rank text now simulates that same guarded
application, rather than claiming 8% generic recharge when a 4% authored rank ran.
All newly used effects already have runtime execution, Forge components, fitting
and value credit. Actual synthesis and runtime parity still need release checks.

Positive direct hits command the wolf. Damage ticks, its own bite, zero damage,
misses and overkill cannot recursively command it. Rescue readiness requires an
effective dedicated heal of a genuinely low-health recipient, and only a positive
direct hit consumes it. Relay uses effective primary healing, chooses one other
injured ally and cannot recursively produce another relay, companion link or
rescue. Following fields acquire only a damaged living target. Dead targets,
immunity, class changes, full health and missing allies retain existing safe gates.

Rejected overlaps: immediate Nature's Bond protection displaced its own delayed
wolf ward; it became rescue follow-through. Frenzied Regen's second direct bubble
repeated Wild Bloom; it became effective-healing relay plus useful solo healing.
Gust's second circular slow overlapped Cyclone; it became aimed pushing wind.
Ordinary split arrows/thorns remain growth, rather than receiving another identical
projectile-count grand. Movement slow, freeze, suppression and forced movement
remain distinct effects with different timing and control-resistance rules.

## Saved IDs and delivery

Twelve retired nature IDs normalize into canonical choices. Old banks/history
remain readable and deduplicate through existing migration; slot limits remain.
The former broad class grands become skill choices, rather than applying their
old blanket bonuses alongside an extra grand slot.

| Retired ID                          | Canonical ID    |
| ----------------------------------- | --------------- |
| `rg_grand_deadeye`, `rg_gk_basic_a` | `rg_gk_basic_b` |
| `rg_grand_storm`, `rg_gk_a1_a`      | `rg_gk_a1_b`    |
| `rg_gk_a2_a`                        | `rg_gk_a2_b`    |
| `rg_gk_a3_a`                        | `rg_gk_a3_b`    |
| `dr_grand_wild`, `dr_gk_basic_a`    | `dr_gk_basic_b` |
| `dr_grand_grove`, `dr_gk_a1_a`      | `dr_gk_a1_b`    |
| `dr_gk_a2_b`                        | `dr_gk_a2_a`    |
| `dr_gk_a3_b`                        | `dr_gk_a3_a`    |

Release validation must cover actual native/composed casts and synthesis, five
Honed ranks and missing-hook fallback, all first-skill identities, migration and
four-slot selection, multiclass isolation, ordinary/Haste bounds, and desktop/
320px selection previews. Parent integration records measured checks. Passing
checks establish contracts; equal balance and fun remain owner live-test questions.
Graft alternatives and final class-wide economy tuning remain in the final review.

## Live-test guide

- Compare the same direct barrier before and after Vigor: a 35-point barrier
  becomes 42 with 20% max-health growth, subject to the same shared cap. Repeat
  the cast to confirm it replaces protection rather than stacking free pools.
- Hunter: use Rain to set up Apex shots, then compare Relentless repositioning.
  Test a moving boss with Pursuing Rain and choose whether a landing Roll is safe.
- Beast Master: compare Alpha's quicker controlled bites with Pack's defensive
  territory. With Bond, rescue a genuinely low-health recipient, connect a direct
  hit, then watch the separate wolf ward. Honed Bite should retain Pack's leech.
- Moon: compare the longer Primal form with Feral claw reach; spells remain
  available. Compare full-circle Maul and protected Pounce as individual choices.
- Land: cast Regrowth at full health with Wild Bloom, then compare actual injured
  ally relays under Eternal Season. Aim Gust forward and verify rear foes remain
  outside its cone. Compare holding a Grove with pursuing Wall territory.

These are balance/play-feel checks for the owner after green CI; automated
contracts cannot establish that every choice is equally satisfying.

## Release verification

- 4,068 tests across 160 files pass with a single worker; branch coverage is
  98.01% against the unchanged 98% gate. Earlier concurrent local runs hit
  wall-clock limits; the serial run uses the original assertions and timeouts.
- Runtime cases cover actual Vigor growth, recipient/class-swap isolation,
  native/composed barriers and Claim ceilings, aimed Gust, full-health Wild Bloom,
  wolf orders, form timing/reach, and additive Honed/identity lifesteal.
- Sixty-four legal Forge builds cover every first subclass pick and identity with
  five ordinary/Haste ranks; a synthesized same-kind healing field exercises the
  missing-hook Honed fallback without inventing damage or movement fields.
- Eight production grand-control cases pass at desktop and 320px phone sizes,
  including four slots, earned alternatives and explicit identity replacement.
  Three existing cadence/geometry browser cases also pass, including landscape.
- Regenerated audits check clean: 364 canonical upgrades, 196 grands and 42
  lookup-only aliases; 6,144 recharge observations / 2,448 profiles remain within
  4–28s. Shared duration/geometry constraints remain enforced.

GitHub CI remains the final repository-wide gate before owner review and live
playtesting; local checks do not imply deployment or equal class balance.
