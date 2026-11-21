# Assassin and Arcane Trickster encounter comparisons

This batch adds **444 Rogue fights** for **4,014 fights across eleven lead
classes and twenty-two subclasses**. Run
`node scripts/measure-fixed-encounters.mjs --class=rogue` for this cohort,
or omit the filter for the full matrix.

Each first pick uses six shared seeds in solo and Knight duo fights across
the base subclass and both identities. Death Strike and Coated Blade
compare immediate precision burst with delayed damage. Mage Hand Bolt and
Ensnaring Strike compare a ranged setup hit with a fixed-distance ground
field. Ensnaring Strike's fixtures use grounded bosses.

The controller uses Shadowstep to enter melee reach or escape an active
hazard. It requests an armed Reprise when under pressure and the anchor
is in range and outside an active damaging or silencing field. It sets
Coated Blade up within striking distance and lines up ranged fields by
their fixed placement band. These conditions model one engagement policy.
A human can also pre-position a return, delay a strike, or disengage from an
incoming telegraph without committing to the same route.

The runner records anchors, armed reprises, successful returns, new direct
poison applications, spent Spellblade charges and boss contact with an armed
snare. A poison application does not establish that every tick landed.
Snare contact measures overlap while the boss is grounded.

## Unranked comparisons

Each clear count combines six solo and six Knight duo fights.

| First pick       | Identity           | First boss clears | Second boss clears |
| ---------------- | ------------------ | ----------------: | -----------------: |
| Death Strike     | None               |           Troll 6 |           Dragon 6 |
| Death Strike     | Shadow Reprise     |           Troll 7 |           Dragon 7 |
| Death Strike     | One with Shadow    |           Troll 7 |          Dragon 10 |
| Coated Blade     | None               |          Dragon 2 |             Lich 0 |
| Coated Blade     | Shadow Reprise     |          Dragon 3 |             Lich 0 |
| Coated Blade     | One with Shadow    |          Dragon 5 |             Lich 0 |
| Mage Hand Bolt   | None               |          Dragon 1 |         Beholder 2 |
| Mage Hand Bolt   | Archmage's Cunning |          Dragon 1 |         Beholder 2 |
| Mage Hand Bolt   | Sleight of Time    |          Dragon 1 |         Beholder 1 |
| Ensnaring Strike | None               |           Troll 6 |             Lich 1 |
| Ensnaring Strike | Archmage's Cunning |           Troll 6 |             Lich 0 |
| Ensnaring Strike | Sleight of Time    |           Troll 6 |             Lich 0 |

- **Assassin.** Shadow Reprise with Death Strike earned 69 armed anchors and
  used 41 returns. In the 24 matched fights, the pressure-based return
  policy cleared 14 with 30 party downings. Staying cleared 13 with 25
  downings. The retreat adds a usable choice, and this policy comparison
  leaves its defensive value sensitive to anchor placement and timing.
  One with Shadow cleared 10/12 Dragon fights with Death Strike and 5/12
  with Coated Blade. Those counts include the rest of each identity's kit,
  so they do not isolate the value of poison delivery.
- **Arcane Trickster.** Both identities spent more than 100 Spellblade
  charges with Mage Hand Bolt, yet no Bolt profile cleared solo against
  Dragon or Beholder. On Ensnaring Strike, both identities recorded more
  total boss contact with the snare than the unmodified subclass. Total
  contact depends on fight length and does not measure the value of the
  control by itself. Test a brief melee pass after a ranged setup rather
  than tuning from the sustained melee controller alone.

With Honed ranks pre-equipped, Shadow Reprise with Death Strike cleared
14/24 at zero ranks, 17/24 at one and 19/24 at three. Archmage's Cunning
with Mage Hand Bolt cleared 3/24, 4/24 and 5/24. Equip ranks in the tests
to isolate their direct effect. Reward draw opportunity cost belongs in
the whole-roster pass.

## Combat fixes

- **Venom timing.** A two-second poison could lose its second tick when
  accumulated from 20 Hz simulation steps. The tick comparison now
  tolerates floating-point rounding. The regression applies field poison
  and steps a real encounter through both ticks and expiration.
- **Return provenance.** A Deadly Throw launched before Shadowstep could
  earn the return by hitting afterward. Cast order now gates eligibility.
  A later prepared strike can still arm the existing anchor. The test
  exercises both hits using native inputs.

## Matched Lich trios

The Rogue and Knight stay fixed while the third slot rotates among Hunter
damage, Whispers utility and Life protection. Each comparison uses six seeds
at the same party scaling.

| Third slot       | One with Shadow, Coated Blade | Sleight of Time, Ensnaring Strike |
| ---------------- | ----------------------------- | --------------------------------- |
| Hunter damage    | 0 clears, 6 wipes             | 0 clears, 6 wipes                 |
| Whispers utility | 5 clears, 1 wipe              | 6 clears                          |
| Life protection  | 6 clears                      | 6 clears                          |

The Life trios had one downing with Coated Blade and zero with Ensnaring
Strike. In these fixtures both builds could turn the extra uptime into
clears. The Whispers results also support testing control and damage
uptime together. The sample covers three specific compositions.

The existing Rogue identity and passive suites cover native and Forge kits,
prepared hits and return gating, poison ownership, and Spellblade eligibility.
The whole-roster pass can compare this benchmark's close engagement with a
policy that withdraws during telegraphs and deliberately re-enters on openings.

**Next** is Warlock Fiend and Great Old One. Then run whole-roster power and
usefulness passes before the visual revamp and the boss and encounter revamp.
