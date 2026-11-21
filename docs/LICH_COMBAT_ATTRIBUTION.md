# Lich damage, recovery and targeting

This follow-up adds **648 attributed Lich fights**. It replays the 288
whole-roster Lich cases, repeats the 78 matched trios with Hunter, Whispers
and Life, and runs two controlled alternatives. The Hunter trios get a
second run that aims ordinary projectile inputs at a nearby hostile add
when available. Four leads get a second four-draw run in both party sizes
where the player targeted by Life Drain walks away during wind-up and
channel, unless already leaving a hazard or trying to revive.

```sh
node scripts/measure-fixed-encounters.mjs --lich-attribution
```

The benchmark uses an optional host observer to count effective HP damage
after mitigation and overkill clipping. It records damage to the Lich
separately from damage to adds, records drain HP removed from players and
actually restored to the Lich, and samples time downed and dead. The observer
adds no network events. The runner checks that the damage buckets add up to
each player's credited damage and reconcile the Lich's HP after healing.

## Beam fixes

- At 20 Hz, floating-point rounding caused a two-second Life Drain to land
  three half-second pulses. It now lands four at the intended boundaries
  when the target stays in range and defenses allow the hits. Accumulation
  stops at the end of the channel.
- Overcharged beams now use the same range as their telegraph during damage
  resolution. A target 540 units away is outside ordinary Life Drain and
  inside its Overcharged version. The regression checks both cases and
  confirms that HP restored respects the boss's heal scale.

The full fixed-class matrix has been rerun on the corrected cadence.
Of the 4,458 matched cases, 112 changed outcome after the beam fixes.
Those cases were on Lich (98) and Beholder (14). Total clears moved from
2,583 to 2,545. All 234 stock Lich trios in the attributed run matched
their counterparts in the full rerun.

## Which roles stall

The zero- and four-draw conditions use the same leads and reward histories as
the previous pass. Each row contains 72 cases. Damage and healing are median
party totals in HP.

| Party    | Draws | Clears | Wipes | Timeouts | Lich damage | Add damage | Drain restored |
| -------- | ----: | -----: | ----: | -------: | ----------: | ---------: | -------------: |
| Solo     |     0 |      1 |    62 |        9 |         514 |        119 |             22 |
| Solo     |     4 |     17 |    40 |       15 |       1,209 |        192 |             42 |
| Life duo |     0 |     37 |     7 |       28 |       3,078 |        491 |             71 |
| Life duo |     4 |     48 |     3 |       21 |       3,075 |        451 |             49 |

Accumulated drain healing exceeded the final HP remaining in only five of the
73 roster timeouts. That arithmetic gives an upper bound if all damage and
movement stayed fixed. It does not model how alternate positioning changes
the fight. The two-Life duo timed out in all six advanced runs, while
Champion's advanced solo timed out six times with no downing. The remaining
constraint was sustained damage to the boss.

## Where the third slot helps

Each row has the same 78 starting encounters. Boss and add damage, drain
healing and summed downed time are medians.

| Third slot          | Clears | Wipes | Timeouts | Lich damage | Add damage | Drain restored | Downed time |
| ------------------- | -----: | ----: | -------: | ----------: | ---------: | -------------: | ----------: |
| Hunter, boss aim    |      7 |    71 |        0 |       2,834 |        397 |             47 |       10.6s |
| Hunter, nearby adds |     14 |    64 |        0 |       3,250 |        614 |             59 |       14.8s |
| Whispers utility    |     57 |    20 |        1 |       4,372 |        740 |             33 |          0s |
| Life protection     |     58 |     5 |       15 |       4,407 |        911 |             67 |          0s |

The nearby-add policy raised both add damage and boss damage across the
sample, even with more drain healing credited to the Lich. It doubled
Hunter clears. Whispers and Life still cleared many more encounters and
had much less time downed in the typical fight.

## Retreating from Life Drain

The radial retreat lowered median drain healing in all eight build-and-party
pairs. Its cost varied by role. Four-draw Fiend solo gained one clear and its
median drain healing fell from 13.8 HP to zero. Life solo cut median drain
healing from 64.4 to 7.9 HP and converted three wipes to timeouts, with zero
clears either way. Champion's Life duo fell from three clears to zero and
Berserker solo from four to zero despite reducing the drain. The movement
cost of staying out of reach is material for melee leads.

Keep the corrected cadence and current damage values. The comparisons
support selective retreats and add targeting, and favor keeping damage and
uptime separate when reviewing the usefulness of individual upgrades.

The [power and progression pass](The zero- and four-draw conditions use the same leads and reward histories as
the previous pass. Each row contains 72 cases. Damage and healing are median
party totals in HP.

| Party    | Draws | Clears | Wipes | Timeouts | Lich damage | Add damage | Drain restored |
| -------- | ----: | -----: | ----: | -------: | ----------: | ---------: | -------------: |
| Solo     |     0 |      1 |    62 |        9 |         514 |        119 |             22 |
| Solo     |     4 |     17 |    40 |       15 |       1,209 |        192 |             42 |
| Life duo |     0 |     37 |     7 |       28 |       3,078 |        491 |             71 |
| Life duo |     4 |     48 |     3 |       21 |       3,075 |        451 |             49 |

Accumulated drain healing exceeded the final HP remaining in only five of the
73 roster timeouts. That arithmetic gives an upper bound if all damage and
movement stayed fixed. It does not model how alternate positioning changes
the fight. The two-Life duo timed out in all six advanced runs, while
Champion's advanced solo timed out six times with no downing. The remaining
constraint was sustained damage to the boss._POWER_AND_PROGRESSION.md) covers
the earlier shared encounters and reward policy. Next is the usefulness
and reward-choice pass, including identity decisions, ordinary ranks and
grafts. Use the same corrected combat version before comparing results.
