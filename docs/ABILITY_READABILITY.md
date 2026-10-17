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

## Enemy debuff follow-up

Enemy control brackets and backed status badges now draw above damage text and
particles, rather than relying on under-body rings or tiny HP-bar icons. They
cover slow, root, stun, slower casting, silence, curse, weakened damage and
vulnerability. The control bracket predicate is shared with control-burst damage;
Fireball still evaluates it at impact. A curse or casting slow alone does not
qualify. The optional curse-owner field adds a personal-curse dot while preserving
generic display for older snapshots. All eight active categories can appear together on bosses and adds; root and
stun do not hide slow. Repeated sources of a category share one badge, which lasts
until the last instance ends. The personal curse dot independently tracks whether
your own mark remains. Control badges come first, then personal curse, then other
team debuffs; priority never removes an active category. Adds use four columns
instead of three to shorten the grid. Viewport-clamped, fixed-size badges and no
new floating text keep the display bounded. The pause key explains the shapes. Existing positive-support visuals are
unchanged. Browser fixtures stress the real renderer with dense damage numbers
and exercise expiry/ownership on desktop, portrait and landscape views.

## Warlock curse families

Ground curse zones now carry an optional public family cue: Hex uses linked
purple diamonds, Fire Pit orange flames, and Dissonant Whispers pale-blue eyes.
Each silhouette is one large unbacked central watermark. Friendly fields use a
broken boundary; hostile pools use a solid pink boundary and never curse seals.
This avoids confusing overlapping fields with debuffs applied to terrain.
Dread adds the existing weakened-attack badge; it is not Fireball control by itself.
All simultaneous status categories remain visible under the existing aggregation
rules. Personal curse dots recognize independently timed cast sources and legacy
marks. No additional floating instructions or skill-name text is introduced.

Dark Resilience has a normal absorption shell and brief incoming protection links
from up to two marked enemies that successfully supply its siphon barrier. Failed
hits provide no contribution. The pause key and actual skill descriptions explain
the mark ownership, reach, target cap and unchanged marks; stronger shared shields
still win. Review crowded mobile/co-op cases and overlapping curse zones live.

## Active defensive states

Shield Wall uses a cyan 120° front arc following actual aim, with white pips for
remaining damage blocks. Its ◖ badge is distinct from percentage mitigation.
Steadfast uses gold planted-foot brackets and an anchor badge; it resists roots,
stuns and forced movement, while slows still apply. Absorption and brief Divine
Shield immunity keep their existing shell/invulnerability cues. No persistent
ability names or extra floating explanations are added. Pause descriptions and
the collapsed symbol key explain facing and ground/control exceptions.
