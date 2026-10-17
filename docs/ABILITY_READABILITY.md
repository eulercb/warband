# Ability readability audit and visual language

## Findings and design

The audit inspected all 12 base kits and every subclass skill, then traced native,
copied and Forge execution, recipient selection, snapshot serialization and both
player drawing paths. Existing offensive cones, lines, projectile families and
ranged-zone arming already communicate geometry; preserve those useful cues.
The shared support paths instead flashed large filled class-colored circles for
single-target heals and buffs. Buff rings differed mainly by color; absorption
and Paladin fields were particularly hard to read on small screens.

Use **role, recipient and duration** as the visual hierarchy. Different names do
not require unrelated particle effects: the same mechanical meaning should share
a recognizable symbol, while geometry and recipient feedback show what differs.
This avoids replacing ambiguity with more competing effects. Shape duplicates
color, so recognition does not depend on hue perception or a bright display.
No new full-screen flashes, combat text panels or cast delays are introduced.

| Meaning              | Shape                             | Where it appears                                      |
| -------------------- | --------------------------------- | ----------------------------------------------------- |
| Effective healing    | Cross                             | Actual healed character, including self/zone recovery |
| Damage boost         | Four-point star                   | Actual buff recipient and small persistent status     |
| Damage reduction     | Shield                            | Actual buff recipient and small persistent status     |
| Speed/flight support | Double chevrons                   | Actual recipient; speed persists as a small status    |
| Absorption           | Enclosing shell and ringed shield | Recipient while a positive, unexpired pool exists     |
| Search reach         | Thin, faint hollow circle         | Cast origin; does **not** imply everyone was affected |

Applications show a short caster-to-recipient connection and grouped symbols,
not overlapping icons. Receipt feedback lasts 0.7s, links 0.25s, at most 32 live
recipient groups. Positions are copied at resolution; links take the short route
across the arena seam. Full-health dedicated heals and unsuccessful direct-bubble
refreshes do not claim receipt. Existing effective healing numbers remain.
Persistent positive symbols are deduplicated and limited to three per character.
Ground effects serialize their actual friendly payloads, including mixed Forge
zones, and display corresponding small central symbols after arming. Existing
clients can ignore these optional cosmetic snapshot fields/events.

Aura boundaries remain exact circles. Bulwark has shield posts, Pursuit rotating
chevrons, and Renewal crosses. A matching owner symbol and recipient status make
the role readable even when the edge is off-screen. A collapsed **Combat effect
symbols** key in Pause explains the vocabulary without crowding combat.

## Catalogue coverage

The following are all support/recovery candidates found by inspecting ability
kind and payload fields, not a finite list supplied by playtests. Shared native
and composed buff/heal paths are tested across every authored dedicated support
skill. Self-heal riders use effective-heal crosses; recovery and mixed zones use
payload-based ground symbols. Existing mobility/projectile/arming effects remain.

| Class     | Inspected support/recovery skills                                                                 |
| --------- | ------------------------------------------------------------------------------------------------- |
| Knight    | Shield Wall, Second Wind, Menacing Roar, Rally                                                    |
| Ranger    | Stand as One, Nature's Bond                                                                       |
| Mage      | Arcane Shield, Arcane Ward, Life Transfer                                                         |
| Cleric    | Heal, Sanctuary, Blessing, Flash of Light, Warding Flare, Blessed Bloom, Mass Cure, Preserve Life |
| Barbarian | Rage, Frenzy, Bear Spirit, Wolf Spirit, Spirit Mend                                               |
| Rogue     | Smoke Bomb, Misty Step, Shield Spell                                                              |
| Paladin   | Consecration, Lay on Hands, Divine Shield, Sacred Weapon, Bless, Aura of Protection, Hunter's Vow |
| Druid     | Entangle, Regrowth, Primal Roar, Frenzied Regen, Wall of Thorns, Healing Spring                   |
| Bard      | Inspiration, Healing Word, Battle Hymn, Bolster, Healing Refrain                                  |
| Monk      | Step of the Wind, Wind Step, Wholeness of Body                                                    |
| Sorcerer  | Mirror Image, Dragon Wings, Draconic Scales, Wild Ward                                            |
| Warlock   | Dark One's Blessing, Dark Resilience, Entropic Ward                                               |

## Aura tuning and scope

| Aura    | Previous                               | Current   |
| ------- | -------------------------------------- | --------- |
| Bulwark | 10% reduction; 25% shorter new control | 15%; 35%  |
| Pursuit | 12% movement; one +15% melee hit       | 18%; +25% |
| Renewal | 6 HP/s                                 | 10 HP/s   |

Radius, duration, effective-heal activation, one field per caster, equivalent
nonstacking and lifecycle cleanup are unchanged. Auras remain outside the
party-power estimator; this tuning introduces no automatic difficulty charge.
Normal progression and kill-pace feedback still operate. Forge budgets account
for the stronger payloads. These values require playtesting; visual clarity is
not evidence that the support balance is finished.

This is a readability checkpoint before the broad balance/identity pass. An added
aura, rescue loop, guard or other rider **does not clear the original ability's
rework debt**. Reevaluate Divine Shield/Aura of Protection while retaining their
fields, and do the same catalogue-wide for mitigation-only and plain-heal skills.
The remaining audit includes Bear Spirit, Fiend tuning, Abjurer control access,
Sorcerer defensive repetition and Dragon Wings, alongside the other recorded
candidates. Do not replace all defensive effects with bubbles or auras.

## Review

Compare Heal and Blessing recipients in a group; Warding Flare versus Preserve
Life; bubble expiry/downing; overlapping aura types; boundaries partially off
screen; healing/overflow ground; mixed Forge skills; and desktop versus 320×568
touch. Browser CI retains successful aura/bubble screenshots in the martial
artifact as well as failure captures. Automated geometry checks distinguish the
symbol silhouettes, check expiry/bounds, and exercise all authored support skills
through native and composed resolution.
