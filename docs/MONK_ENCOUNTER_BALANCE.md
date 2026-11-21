# Open Hand and Shadow encounter comparisons

This batch adds **420 Monk fights** and completes the representative martial
cohort. The fixed matrix now covers **2,730 fights across eight lead classes
and sixteen subclasses**.

Run `node scripts/measure-fixed-encounters.mjs --class=monk` from the repository
root for this cohort, or omit the filter for the full matrix. Each build uses
six matched seeds per boss, solo and with Knight. The runner uses native
inputs and checks actual Flow reach, aims independently of movement, and
presses fresh eligible inputs during a Flow glide. It records observed Flow
spends, started Palm sweeps, accepted buffered Flow inputs and new Shadow
commits. Those observations establish activation opportunities and do not
measure contact or damage on their own.

## Unranked comparisons

Each clear count combines six solo runs and six Knight duos.

| First pick    | Identity         | First boss clears | Second boss clears |
| ------------- | ---------------- | ----------------: | -----------------: |
| Wave Palm     | None             |          Troll 11 |          Dragon 11 |
| Wave Palm     | Perfect Harmony  |          Troll 12 |          Dragon 10 |
| Wave Palm     | Flowing Water    |          Troll 11 |          Dragon 11 |
| Wind Step     | None             |         Dragon 12 |             Lich 0 |
| Wind Step     | Perfect Harmony  |          Dragon 9 |             Lich 0 |
| Wind Step     | Flowing Water    |         Dragon 12 |             Lich 0 |
| Shadow Dart   | None             |          Troll 11 |          Dragon 10 |
| Shadow Dart   | Shadow Incarnate |          Troll 11 |          Dragon 11 |
| Shadow Dart   | Silent Death     |          Troll 10 |          Dragon 11 |
| Shadow Strike | None             |         Dragon 12 |             Lich 0 |
| Shadow Strike | Shadow Incarnate |         Dragon 10 |             Lich 0 |
| Shadow Strike | Silent Death     |         Dragon 11 |             Lich 0 |

- **Open Hand.** Flowing Water exercised both sweep and input buffering on
  both first picks. At zero ranks, Wave Palm started 387 sweeps and
  accepted 151 buffered inputs. Wind Step recorded 178 and 113. Wave Palm with Flowing Water cleared 22/24 at zero Honed
  ranks, 24/24 at one and 23/24 at three. These runs started with ranks
  equipped and do not measure acquisition or opportunity cost.
- **Shadow.** Silent Death committed 165 follow-ups with unranked Dart
  and 289 with Strike. Shadow
  Dart with Silent Death cleared 21/24 at zero ranks, 21/24 at one and 21/24
  at three, with changes in which boss cleared. Keep the values for the
  whole-roster pass, where uptime and rank opportunity cost can be evaluated
  alongside clear counts.

A separate native-input probe used each of the eight Monk first picks with
both identities against an isolated Troll. All 16 kits could prepare and
spend Flow using the common starter skills. The probe exercised Open Hand's
guard, controlled follow-up and buffered retreating strike, and Shadow's
recharge refund, prepared critical and delayed strike during withdrawal.

## Shadow precision fix

Quivering Palm could spend Shadow Incarnate's prepared precision critical on
an invulnerable boss, even though the hit dealt zero damage. Its boss burst
now preserves the preparation through immunity, consistent with Stunning
Strike. A regression test verifies that the next vulnerable Palm consumes
the preparation and receives the critical damage.

## Lich party composition

Both Lich profiles had zero clears across their solo and duo comparisons.
The trio comparison keeps the identity B Monk and Knight fixed while rotating
Hunter damage, Whispers utility and Life protection through the third slot.
Each composition uses the same six seeds at the same party scaling.

| Third slot       | Wind Step, Flowing Water     | Shadow Strike, Silent Death |
| ---------------- | ---------------------------- | --------------------------- |
| Hunter damage    | 2 clears, 3 wipes, 1 timeout | 1 clear, 5 wipes            |
| Whispers utility | 4 clears, 1 wipe, 1 timeout  | 6 clears                    |
| Life protection  | 0 clears, 1 wipe, 5 timeouts | 5 clears, 1 timeout         |

Life and Whispers both finished the Shadow Strike series without any
downings. With Life, Wind Step had three downings across six fights and
median Lich HP remaining was 17.4%. The longer survival with Life surfaced a
clear-speed limit for this particular Wind Step setup. Keep that matchup on
the list for the broader pass. These trios compare specific kits and do not
establish a general support ranking.

**Next** is Mage Evoker and Abjurer, followed by Sorcerer and the Rogue and
Warlock cohort. Whole-roster power and usefulness passes follow all class
cohorts, before visual production and the boss and encounter revamp.
