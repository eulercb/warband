# Evoker and Abjurer encounter comparisons

This batch adds **420 Mage fights** for **3,150 fights across nine lead classes
and eighteen subclasses**. Run `node scripts/measure-fixed-encounters.mjs --class=mage`
for the Mage cohort or omit the filter for the full matrix.

Each profile compares both identities and the base subclass across six seeds
solo and with Knight. Lightning Bolt and Sculpted Blast cover ranged and close
burst. Otiluke Bind tests directional field placement and Dragon flight. Life
Transfer tests recovery under Beholder and Lich pressure. The runner uses
native input, approaches Frost Nova range when needed, favors an available
burst spell with Evocation held, and lines up Bind near its fixed placement
distance. Warding Blink uses the engine's departure and arrival targeting
with a separate escape aim.

The counters distinguish Cadence triggers from charges spent, Binding Ward
triggers, boss wind-ups started while suppressed, field dispels and silence
breaks. Bind contact measures time the boss overlaps an armed cage that can
reach it. Charge spends and field overlap do not guarantee damage. The Life
Transfer policy casts for injured allies, so it does not isolate the value of
a cleanse on a healthy ally.

## Unranked comparisons

Each clear count is out of twelve, combining six solo and six Knight duo
fights. A boss and first pick share the same starting encounter across
identity variants.

| First pick     | Identity         | First boss clears | Second boss clears |
| -------------- | ---------------- | ----------------: | -----------------: |
| Lightning Bolt | None             |          Troll 11 |           Dragon 5 |
| Lightning Bolt | Arch-Evoker      |          Troll 10 |           Dragon 6 |
| Lightning Bolt | Overchannel      |          Troll 10 |           Dragon 9 |
| Sculpted Blast | None             |          Dragon 9 |             Lich 0 |
| Sculpted Blast | Arch-Evoker      |          Dragon 9 |             Lich 0 |
| Sculpted Blast | Overchannel      |          Dragon 8 |             Lich 0 |
| Otiluke Bind   | None             |          Dragon 6 |         Beholder 1 |
| Otiluke Bind   | Grand Warding    |          Dragon 7 |         Beholder 2 |
| Otiluke Bind   | Binding Dominion |         Dragon 10 |         Beholder 1 |
| Life Transfer  | None             |        Beholder 7 |             Lich 2 |
| Life Transfer  | Grand Warding    |       Beholder 10 |             Lich 5 |
| Life Transfer  | Binding Dominion |        Beholder 7 |             Lich 2 |

- **Evoker.** With Lightning Bolt, Overchannel recorded 138 Cadence triggers
  and 135 charge spends compared with 70 and 70 for Arch-Evoker. The Dragon
  advantage came mainly in Knight duos. Sculpted Blast had a narrower window
  for spending charges with the base and Arch-Evoker routes, which is worth
  revisiting with a controller that deliberately holds Fireball for a Nova
  opening. Lightning with Overchannel cleared 19/24 at zero Honed ranks and
  20/24 at both one and three ranks.
- **Abjurer.** Binding Dominion with Bind started 168 boss wind-ups under
  suppression. Grand Warding recorded 15 dispels and 17 silence breaks with
  Bind and 76 dispels and 35 breaks with Life Transfer. In this sample Grand
  Warding's strongest clear-count gains came with Life Transfer. With Bind,
  Grand Warding went from 9/24 clears at zero Honed ranks to 11/24 at one
  and 15/24 at three. The ranks were equipped before each fight. Test reward
  cost and cast uptime before tuning their values.

## Matched trios

The Mage and Knight are fixed and each third slot uses the same six seeds and
party scaling. The three third slots cover damage, utility and protection.

| Third slot       | Lich with Overchannel and Sculpted Blast | Beholder with Grand Warding and Otiluke Bind |
| ---------------- | ---------------------------------------- | -------------------------------------------- |
| Hunter damage    | 1 clear, 5 wipes                         | 6 clears, 14 downings                        |
| Whispers utility | 6 clears, 2 downings                     | 6 clears, 0 downings                         |
| Life protection  | 6 clears, 4 downings                     | 6 clears, 1 downing                          |

Life protection and Whispers utility both turned the Sculpted Blast matchup
from zero solo and duo clears into six trio clears. Beholder cleared with
all three compositions, with more downings in the Hunter trio. These
outcomes keep Mage mechanics and values in place while highlighting a
party-composition effect to check in the whole-roster pass.

The existing caster and warding tests also cover first-pick access, authored
and Forge kits, flight, entry and departure dispels, silence escape, and
Life Transfer targeting.

**Next** is Sorcerer Draconic and Wild Magic, then Rogue and Warlock. The
whole-roster power and usefulness passes follow before the visual revamp
and the boss and encounter revamp.
