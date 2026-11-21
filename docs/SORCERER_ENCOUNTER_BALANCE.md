# Draconic Bloodline and Wild Magic encounter comparisons

This batch adds **420 Sorcerer fights** for **3,570 fights across ten lead
classes and twenty subclasses**. Run
`node scripts/measure-fixed-encounters.mjs --class=sorcerer` for this cohort,
or omit the filter to run the full matrix.

Each first pick uses six matched seeds in solo and Knight duo fights with
both identities and the unmodified subclass. Dragon Breath and Dragon Wings
compare close burst with flight. Chaos Surge and Tides of Chaos compare a
projectile fan with a burst that can be remotely launched and detonated.
The controller makes fresh Phase presses, aims the teleport away from
immediate threats or across the boss's lane, and sends the boss's position
as the steering target. It requests Tides detonation when the travelling
burst comes into range. Native inputs still pass through combat gates.

The counters record Surge spends, Surge Ascent and Spell Weave triggers,
flight time, flight overlapping ground hazards, prepared origins, actual
casts from those origins, and accepted manual detonations. Flight overlap
measures exposure to hazards a grounded player would have to consider.
It does not estimate damage saved. Launch and detonation counts do not
establish contact or damage.

## Unranked comparisons

Each cell combines six solo and six Knight duo fights.

| First pick     | Identity       | First boss clears | Second boss clears |
| -------------- | -------------- | ----------------: | -----------------: |
| Dragon Breath  | None           |           Troll 5 |           Dragon 6 |
| Dragon Breath  | True Dragon    |           Troll 6 |           Dragon 4 |
| Dragon Breath  | Wyrm's Pursuit |           Troll 6 |           Dragon 5 |
| Dragon Wings   | None           |          Dragon 8 |             Lich 0 |
| Dragon Wings   | True Dragon    |         Dragon 10 |             Lich 1 |
| Dragon Wings   | Wyrm's Pursuit |          Dragon 9 |             Lich 0 |
| Chaos Surge    | None           |          Troll 12 |             Lich 0 |
| Chaos Surge    | Unbound Chaos  |          Troll 11 |             Lich 0 |
| Chaos Surge    | Chaos Crossing |          Troll 11 |             Lich 0 |
| Tides of Chaos | None           |          Dragon 2 |         Beholder 1 |
| Tides of Chaos | Unbound Chaos  |          Dragon 4 |         Beholder 1 |
| Tides of Chaos | Chaos Crossing |          Dragon 5 |         Beholder 3 |

- **Draconic.** With Dragon Wings, True Dragon averaged 38.1 seconds of
  flight per fight versus 32.4 with no identity. Across the 24 fights,
  it spent 60.2 seconds airborne over ground hazards. Dragon Breath
  produced mixed clear counts. With True Dragon it cleared 10/24 at
  zero Honed ranks, 13/24 at one and 10/24 at three.
- **Wild Magic.** Chaos Crossing launched 69 spells from departure origins
  with Tides, and 128 of 131 guided bursts accepted a manual detonation
  request. Chaos Surge also used 58 departure casts. With Crossing it
  cleared 11/24 at zero Honed ranks and 10/24 at both one and three.

The ranked cases equipped Honed ranks before the encounter, so their results
separate the effect of ranks from the cost of getting them. Keep current
values for the whole-roster pass. Compare an alternate engagement distance
for Breath and a contact-focused steering policy for Crossing before
attributing clear-count differences to either identity's numbers.

## Matched Lich trios

The Sorcerer and Knight stay fixed while the third slot rotates among
Hunter damage, Whispers utility and Life protection. Each composition uses
the same six seeds and party scaling.

| Third slot       | True Dragon, Dragon Wings | Chaos Crossing, Chaos Surge |
| ---------------- | ------------------------- | --------------------------- |
| Hunter damage    | 0 clears, 6 wipes         | 0 clears, 6 wipes           |
| Whispers utility | 4 clears, 2 wipes         | 5 clears, 1 wipe            |
| Life protection  | 3 clears, 3 timeouts      | 5 clears, 1 timeout         |

The Life and Dragon Wings trio had only one downing, and the three timeouts
ended with a median of 6.6% Lich HP remaining. The result points to a
clear-speed limit for that composition once survival is covered. Whispers
and Life both lifted the Chaos Surge setup to five clears. In this sample
the Hunter trio was vulnerable to wipes in both setups.

Existing caster, guidance and Fortune tests cover the remaining first-pick
access and behavior, including Surge Ascent with Meteor, remote departure
casts, manual Tides detonation and Bend Luck hitting multiple enemies.

**Next** is Rogue Assassin and Arcane Trickster, then Warlock Fiend and
Great Old One. The whole-roster power and usefulness passes follow before
the visual revamp and then the boss and encounter revamp.
