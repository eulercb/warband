# Rogue and Warlock: authored four-grand builds

Follows merged/live-tested grand-selection framework PR #134. This is the first
content cohort, not completion of the twelve-class redesign. Rogue and Warlock now
each have four starting-skill grands, eight individual subclass-skill grands, and
four subclass identities (two per subclass). A chosen subclass with two equipped
skills can fill all four slots: two different starting skills, one equipped
subclass skill, and one identity. Other classes retain their transitional catalogue.

## Choices that change the loop

| Subclass         | First identity                                                                                                                                | Alternative identity                                                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Assassin         | Death Incarnate extends precision preparation and rewards prepared connections with stronger critical strikes and protected movement refunds. | One with Shadow lets Shadowstep coat the next direct hit with target-bound poison, without requiring Coated Blade.                    |
| Arcane Trickster | Archmage's Cunning lets ranged direct hits spend Spellblade and hinder the victim.                                                            | Sleight of Time keeps melee weaving and rewards a connection with a frontal block and a protected Shadowstep refund.                  |
| Fiend            | Hellfire Ascendant makes Hex mobile, enables proactive Rebuke retaliation, and adds movement to Blessing.                                     | Infernal Pact turns Blessing into protection and strengthens direct-hit sustain and Resilience's curse siphon.                        |
| Great Old One    | Elder Mind makes ordinary direct spells suppress personally cursed enemies, with longer-lived curse territory.                                | Whispered Doom lets Blessing or Entropic Ward prepare a spell surge for Rebuke or direct subclass spells; basics preserve the charge. |

Identities also modify their bound subclass skills; they are no longer just a
magnitude/recharge multiplier on two specials. They have a starting-kit route with
any first subclass pick. Read the actual selected skill readout for final values:
Haste, ordinary ranks, Forge and the existing bounds affect resolved results.

Individual grands target exactly one equipped subclass skill. Examples include
precision-preparing Coated Blade, a piercing prepared Deadly Throw, a self-centered
escape web, a double-block Shield Spell, an exploding Hurl Flame, a stationary
Fire Pit that also protects allies inside, a following Dissonant Whispers, and a
frontal-block Entropic Ward. The Ward does not prepare an otherwise unusable charge
when the competing identity is selected. Ordinary Honed upgrades remain additive.
Target poison still uses the strongest same-owner pool; it does not create a second
stacking damage stream or make poison leech.

The four starting-skill choices per class have different jobs. Rogue can favor
surrounding basic coverage, a focused Backstab, safer repositioning, or Vial's
60/40 ground/following-poison conversion. Warlock can favor a bounded forked basic,
a following Hex, proactive retaliation, or an offensive/defensive Blessing window.
Taking the basic grand uses one of the same two slots as an active-skill grand.
No extra button, kill requirement or particular two-skill pair is introduced.

## Legacy choices and compatibility

This is a catalogue migration within loadout schema version 1. Twelve redundant
starting/whole-class grand IDs map to the same skill's canonical choice. They remain
readable in saved histories, but are not new offers. Bank, equipped selections and
legacy replay normalize aliases and deduplicate them before applying effects.
For example, Shadow Master maps to Assassinate; the former whole-kit Word of Ruin
maps to Hex's Word of Ruin. Old alternatives intentionally acquire the new design;
this is not a promise to retain every previous numerical bonus.

There are now 354 canonical character definitions, including 186 grands, plus
12 lookup-only grand aliases and nine separate generic stat boons. Catalogue
inventory excludes aliases. The new individual-skill grands are distinguished from
ordinary Honed upgrades in the audit and Forge descriptions.

Only equipped active-class grands apply. Banked choices, another class's choices,
and a native skill hidden by a graft cannot provide free effects. Existing graft
ownership, reclaim and reseating behavior remain. A committed attack retains its
stored payload, while current owner stats follow the existing impact/tick rules.
The cadence/range policy, adaptive difficulty controller and arena size are unchanged.

## Reward-room correction

Gambler's Coin rerolls only categories that have not been claimed. Previously it
recreated the room and reset local walk-up locks; the host rejected extra picks,
but optimistic local history could still list them. The terminal reward screen
also reset completed picks. Rerolls now preserve the scene, hero position,
readiness and completed selections; claim IDs survive a same-stop screen remount.
After both categories are taken the shop and host reject the purchase without
spending coins. The coin's description states this rule.

A host-level regression takes Vampiric Style, rerolls, rejects a duplicate class
pick, and verifies the accepted style's max-health cost and lifesteal in the next
fight. Existing live projectile-healing coverage also passes. This reproduces the
phantom-pick bug, not evidence that an accepted first Vampiric was removed.

## Verification and playtest

Focused engine tests cover alias migration, exact recipients, identities, actual
payload execution, protected recharge and ordinary/Forge compatibility. The browser
fixture uses the production grand controls on desktop and 320px mobile to fill all
four slots for each pilot subclass, bank the competing identity, explicitly replace
it, and construct the resulting host kit with Haste. Reward-room touch smoke claims
a boon before rerolling and checks that its claim/history and scene survive.
Automated results do not establish equal balance or gameplay feel.

Local validation: 3,977 tests in 152 files pass; branch coverage is 98.01% against
the unchanged 98% gate. Build, lint, formatting and both audit checks pass. Eight
full-slot browser cases, twelve native/composed combat-render cases and the
desktop/touch reward-room suite pass. GitHub CI rechecks the final commit.

For live testing, fill a pilot class's four slots over four gauntlet clears or use
the test loadout. Compare both identities using the same subclass pair; try a different
first skill too. Compare two active grands against one basic plus one active grand.
Check the bank/replacement preview, graft/reclaim and class switches. In a reward
room, claim one category, reroll the other, then confirm neither category can be
claimed twice and no coin is spent after both are complete.

## Roadmap

Next: Knight / Barbarian / Monk, then Ranger / Druid, Mage / Sorcerer, and
Cleric / Paladin / Bard, with ordinary upgrades and authored grands reviewed together.
Follow with a whole-system balance, acquisition and compatibility review. That is
roughly four content cohorts plus a final review, split further only if the changes
stop being reviewable. Reassess cooldown, range, area and duration bounds after the
content removes excessive growth. Readability and a broader visual-art pass remain
separate future work, informed by playtesting.
