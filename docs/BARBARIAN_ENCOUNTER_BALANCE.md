# Berserker and Totem encounter comparisons

This batch adds **420 Barbarian fights**, for **2,310 fights** across
seven lead classes and fourteen subclasses. It compares Frenzy and
Chain Pull for Berserker, and Wolf Spirit and Earth Totem for Totem.
Each profile includes no identity and both identities. Frenzy also
compares one and three Bloodthirst ranks with Blood Frenzy. Earth
Totem compares one and three Honed ranks with Ancestral Relay.

Run `node scripts/measure-fixed-encounters.mjs` from the repository root.
The cases use six shared seeds in solo and Knight duo, with grounded
Troll, flight-capable Dragon and summoning Lich across the different
profiles. Frenzy and Wolf Spirit can start the buildup when no rhythm
is active. Movement makes room for walking Momentum. Earth Totem
positions for its actual directional placement, and Whirlwind considers
the active ancestor's footprint. The runner records observed walking
stack gains, stacks spent and resolved remote relays. A resolved relay
can miss a moving enemy. Dragon flight can prevent ground-field damage.

A separate native-input probe activated Rage, built three stacks and
landed Whirlwind for all eight Barbarian first picks with both
identities. All Berserker routes triggered Rampage and all Totem routes
triggered Shelter. Totem B prepared its station in each case.

## Unranked comparisons

Each clear count is out of twelve fights. The last column is the most
relevant recorded mechanic for that build.

| First pick  | Identity        | First boss clears | Second boss clears | Observed mechanic                   |
| ----------- | --------------- | ----------------: | -----------------: | ----------------------------------- |
| Frenzy      | None            |           Troll 9 |           Dragon 6 | 136 stacks spent                    |
| Frenzy      | Avatar of Fury  |          Troll 10 |          Dragon 10 | 181 stacks spent                    |
| Frenzy      | Blood Frenzy    |           Troll 8 |           Dragon 7 | 577 walking gains, 103 stacks spent |
| Chain Pull  | None            |          Dragon 2 |             Lich 0 | 176 stacks spent                    |
| Chain Pull  | Avatar of Fury  |          Dragon 4 |             Lich 0 | 246 stacks spent                    |
| Chain Pull  | Blood Frenzy    |          Dragon 3 |             Lich 0 | 331 walking gains, 188 stacks spent |
| Wolf Spirit | None            |          Troll 10 |           Dragon 4 | 340 walking gains                   |
| Wolf Spirit | Great Spirit    |          Troll 11 |           Dragon 8 | 334 walking gains                   |
| Wolf Spirit | Ancestral Relay |          Troll 10 |           Dragon 4 | 39 remote relays                    |
| Earth Totem | None            |          Dragon 3 |             Lich 0 | 114 stacks spent                    |
| Earth Totem | Great Spirit    |          Dragon 4 |             Lich 0 | 117 stacks spent                    |
| Earth Totem | Ancestral Relay |          Dragon 3 |             Lich 0 | 45 remote relays                    |

- **Berserker.** Avatar of Fury did better in these unranked Frenzy
  fixtures. Blood Frenzy exercised its movement route, but stack
  generation opportunities were more frequent than actual spends.
  With Bloodthirst it went from 15/24 clears at zero ranks to 20/24
  at one and 23/24 at three. This puts sustain on the list for the
  whole-roster pass. The ranks were pre-equipped in this comparison.
- **Totem.** Great Spirit led the Wolf Spirit clear counts. Earth
  Totem with Honed ranks reduced Lich's median remaining HP from 62.2%
  to 59.4% and 44.0%, with zero clears at each rank. On Dragon the
  three-rank field had zero clears versus three at zero ranks. Field
  targeting, flight and movement make that a mixed result. Keep values
  for now and compare moving the ancestor and ally shielding separately
  from clear speed.
- **Offer correction.** Blood Frenzy's offer now explicitly says both
  damage bonuses require a controlled foe. Ground Slam dealt 40
  against an uncontrolled Troll and 50 against the same pre-slowed
  Troll in an isolated check. The numerical effects already matched
  that rule.

## Lich party composition

The selected B kits had zero Lich clears with the solo or duo
controllers. The trio comparison keeps each Barbarian and Knight
fixed while changing only the third slot at the same party scaling.
Each cell covers six seeds.

| Third slot       | Chain Pull, Blood Frenzy | Earth Totem, Ancestral Relay |
| ---------------- | ------------------------ | ---------------------------- |
| Hunter damage    | 2 clears, 4 wipes        | 0 clears, 6 wipes            |
| Whispers utility | 5 clears, 1 wipe         | 6 clears                     |
| Life protection  | 4 clears, 2 timeouts     | 0 clears, 6 timeouts         |

Both Life routes had zero downings. Earth Totem with Life ended with
3.1% median Lich HP remaining, so its timeouts were close in this
90-second fixture. Whispers cleared all six Earth Totem fights with
zero downings. This sample makes ally control and damage uptime
worth testing together. It does not rank the support classes outside
these compositions.

**Next:** compare Open Hand and Shadow Monk to finish the martial
cohort. Carry Blood Frenzy's sustain sensitivity and Ancestral Relay's
remote positioning value into the later whole-roster passes.
