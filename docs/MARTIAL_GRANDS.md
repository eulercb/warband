# Knight, Barbarian and Monk: authored upgrade builds

This is the second content cohort after Rogue/Warlock. Each of these three classes
now has four native-skill grands, eight individual subclass-skill grands and four
subclass identities. Equip two starting-skill grands (basic/grafts included), one
bound subclass-skill grand and one identity. Earned alternatives stay banked and
can be swapped explicitly between fights. Only the active class applies.

## Build choices

| Subclass      | First identity                                                                                                             | Alternative identity                                                                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Champion      | Unbroken Champion adds control-resistant frontline windows and leech on Champion strikes.                                  | Warlord's Tempo makes Taunt proactively prepare a counter after a melee connection; Shield Wall adds a pressure window and controlled foes reward follow-through. |
| Battlemaster  | Grand Tactician rewards controlled-target attacks across the base kit and direct subclass skills.                          | Perfect Maneuver adds Taunt protection, Shield Bash wind-up suppression and supporting control/wards.                                                             |
| Berserker     | Avatar of Fury extends Rage windows and accelerates Whirlwind's wind-up for concentrated pressure.                         | Blood Frenzy lets walking earn Momentum; Whirlwind supplies slow for the controlled-target basic/subclass payoff.                                                 |
| Totem Warrior | Great Spirit lets Rage block a frontal hit and ready a counter; basics and Whirlwind leech.                                | Ancestral Might turns Rage and Totem utilities into shared protective windows, while Earth Totem supports longer territory control.                               |
| Open Hand     | Perfect Harmony extends Flow preparation and rewards controlled-target follow-through; the extension lifetime cap remains. | Flowing Water adds healing/control resistance to movement and leech to attacking, with a cleansing Wholeness of Body.                                             |
| Shadow        | Shadow Incarnate lets movement prepare precision that base and Shadow strikes can spend alongside Flow.                    | Silent Death combines longer Flow preparation, mobility sustain and enemy wind-up suppression.                                                                    |

Every identity has a route through the starting kit with any first subclass pick.
For example, Blood Frenzy does not assume a particular Chain Pull/Slam grand:
Rage → walk for Momentum → slowing Whirlwind → Rampage basic works by itself.
Shadow Incarnate can use Step of the Wind → prepared Stunning Strike before a
second subclass skill exists. Numerical growth remains where it supports these
routes; not every grand adds a new subsystem.

## Skill roles and ordinary upgrades

- Knight can choose sweeping Cleave, protective Taunt, shared Shield Wall or a
  gathering Shield Bash. Earthshaker is an aimed pushing shockwave; its grand
  reverses that into a pull. Bull Rush can brace a frontal block, Second Wind
  can grant protection even at full health, and Riposte can leech its connection.
- Barbarian can favor a wider focused basic, risky blood-price Rage, a pushing
  Leap or gathering Whirlwind. Subclass options include a circular Reckless
  Cleave, stronger Momentum fissure territory, a capturing chain, braced Frenzy,
  and mobile or stationary Totem protection. Blood price remains nonlethal and
  only effective direct damage supplies its leech.
- Monk can favor basic coverage, controlled-target Stunning Strike, a sprint
  after Step of the Wind, or gathering Quivering Palm. Wave Palm becomes an
  aimed shockwave rather than another omnidirectional palm; its grand gathers.
  Shadow Dart can splash, Cloud can follow a ground target, Shadow Step can
  brace a block, and Wholeness can grant preemptive protection.

Each of the 24 Honed upgrades improves its receiving skill's actual role: parry,
push/pull, cast speed, challenge, walking Momentum, fissure, Flow or recovery.
Their ordinary recharge improvement is modest and shares the existing budget.
Changed or incomplete Forge payloads receive a useful generic tune instead of
claiming an absent native mechanic. Native and composed recipients keep the same
effect contracts where their payloads match. Resolved previews show final values.

## Compatibility and boundaries

Eighteen retired martial grand IDs map to canonical choices. Saved histories and
banks normalize/deduplicate those aliases; alternatives remain earned, while
equipped choices obey the four-slot limits. Former whole-class stat grands now
become skill choices. Their old blanket health/mitigation/regeneration bonuses
are deliberately replaced, so inspect equipped slots when loading an older build.

Native mobility now honors authored self-speed and precision preparation after
its root gate, matching composed payloads. A bare rooted movement skill grants
neither effect. Authored steadfast support retains its existing root-clearing
behavior. Forge support fitting now accepts the already executed mobility/taunt
protection and preparation payloads and prices them through normal components.

No adaptive-difficulty controller, arena, generic Haste, recovery/range/area policy
or extra ability button changes. Existing bounds still govern duration and reach.
Graft alternatives remain separate from the four native choices and occupy their
normal starting-skill slots. The whole-system review still includes their tuning.

## Verification and live testing

Engine tests exercise native/composed cones and pull reversal, actual donor
synthesis, root gates, mobility speed/precision parity, stacked protection,
walking Momentum/control and a starting-kit precision sequence. Honed profiles
are tested through five ranks on native and actual Forge kits. Existing migration,
selection, graft/reclaim, multiclass and stat-overlay fixtures remain covered.
The production grand-selection browser flow covers all six subclasses on desktop
and a 320px phone, including four slots, banking and explicit identity replacement.

Live-test both identities with the same two subclass skills, then change the
first skill. Compare two active grands with one basic plus one active grand.
Check the aiming difference between pushing and gathering shockwaves, movement
Momentum, close-range control payoffs and defensive windows while keeping the
same boss setup. Passing checks establish contracts, not equal balance or fun.

Local release validation: 4,053 passing tests in 158 files; 98.01% branch
coverage against the unchanged 98% gate. Build, lint, formatting and catalogue/
recharge audits pass. Full GitHub CI rechecks the committed head.

## Progress

Five of twelve classes now have authored upgrade/grand builds. Next are
Ranger/Druid, Mage/Sorcerer, and Cleric/Paladin/Bard: three content cohorts, then a
whole-system balance/acquisition/compatibility review. Adjust batch size if the
changes stop being reviewable. Reassess the shared limits after content replaces
excess cooldown, range, area and duration growth.
