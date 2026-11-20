# Fixed-encounter balance pilot

This is the first comparison on the accepted Battle Rhapsody baseline from
#192. It covers Valor with Bolster and Devotion with Aura of Protection.
Each build enters with no identity, identity A, or identity B. Valor also
repeats Battle Rhapsody without deliberately detouring toward its rallies.
No gameplay values changed in this delivery.

## Reproducing the run

From the repository root with dependencies installed:

```sh
node scripts/measure-fixed-encounters.mjs > fixed-encounters.json
```

The script runs 84 fights across three seeds (31, 79, 137), two bosses (Troll
and Beholder), and solo or with the same unupgraded Knight partner. The
starting boss position, HP and damage scaling, party positions, terrain and
cover are checked within each matched group. The two grand options are banked
in all cases, and the selected identity is checked after spawn. There are no
additional upgrades, adaptive pace, affixes or corruption. This isolates the
identity choice in an otherwise fixed early kit.

The native host step runs at 20 Hz for up to 90 seconds with ordinary
movement, aim, casts, damage, downing and revive input. The controller
prioritizes the relevant class loop, moves into actual Dissonant Whispers
range, and flees nearby active harmful fields when they can affect the hero.
The rally-seeking policy detours toward an uncollected rally before resuming
normal movement. The comparison policy allows incidental pickup. Boss AI,
terrain and cover remain in play. Input and combat outcomes can diverge
naturally after the same seeded start.

The JSON includes a row per fight with outcome, time, boss HP remaining,
and per-player casts, attributed damage, resolved incoming HP damage,
effective healing, downings, revives, rally pickups and new Faith wounds.
Resolved HP damage includes lethal overkill and unpaid Faith damage when it
comes due. Wound counts measure opportunities to repay, and effective HP
healing excludes healing spent paying a wound. Pickup counts establish that
the rally was used. The controller has no specific post-pickup route across
the boss or through a pool, so these rows cannot isolate the value of flight
in that maneuver.

## Results

Each row covers three fights per boss. Troll reports clears and median time
among those clears. Beholder reports median boss HP remaining when each run
ended. No Beholder run cleared. The solo baseline and solo Faith rows each
had one Beholder defeat. All other Beholder runs reached the 90-second cap.

| Build    | Party | Identity                   | Troll clears and median time | Beholder HP left | Rally pickups or Faith wounds |
| -------- | ----- | -------------------------- | ---------------------------- | ---------------- | ----------------------------- |
| Valor    | Solo  | None                       | 3/3 · 88.15s                 | 29.9%            | —                             |
| Valor    | Solo  | Hero’s Ballad              | 3/3 · 87.05s                 | 31.4%            | —                             |
| Valor    | Solo  | Battle Rhapsody            | 2/3 · 87.60s                 | 26.4%            | 26 pickups                    |
| Valor    | Solo  | Battle Rhapsody, no detour | 2/3 · 87.63s                 | 28.2%            | 9 pickups                     |
| Valor    | Duo   | None                       | 3/3 · 68.75s                 | 16.0%            | —                             |
| Valor    | Duo   | Hero’s Ballad              | 3/3 · 67.45s                 | 14.6%            | —                             |
| Valor    | Duo   | Battle Rhapsody            | 3/3 · 68.70s                 | 17.2%            | 54 pickups                    |
| Valor    | Duo   | Battle Rhapsody, no detour | 3/3 · 68.70s                 | 18.3%            | 30 pickups                    |
| Devotion | Solo  | None                       | 3/3 · 56.10s                 | 44.8%            | —                             |
| Devotion | Solo  | Covenant of Steel          | 3/3 · 56.05s                 | 38.7%            | —                             |
| Devotion | Solo  | Unyielding Faith           | 3/3 · 56.10s                 | 39.5%            | 19 wounds                     |
| Devotion | Duo   | None                       | 3/3 · 56.10s                 | 24.5%            | —                             |
| Devotion | Duo   | Covenant of Steel          | 3/3 · 55.85s                 | 22.0%            | —                             |
| Devotion | Duo   | Unyielding Faith           | 3/3 · 56.10s                 | 22.7%            | 39 wounds                     |

- **Battle Rhapsody.** Detouring increased pickup counts from 9 to 26 solo
  and from 30 to 54 in duo. It changed neither boss's clear count under
  this policy. Against Beholder, Rhapsody had the lower median remaining HP
  among Valor identities solo, while Ballad had the lower median in duo.
  The Bolster first pick lacks a native melee outlet for Ballad's counter,
  so a Blade Flourish comparison is needed before generalizing.
- **Unyielding Faith.** Devotion recorded 58 wounds across solo and duo.
  Clear counts matched Covenant and the baseline. Covenant avoided the one
  solo Beholder defeat observed in the other two variants. The controller's
  healing considers pending wounds, but the script does not record how
  much debt healing paid. This is one small sample of the recovery choice.
- **Encounter choice matters.** Troll mostly cleared and Beholder mostly
  timed out. Compare timing for completed fights and remaining HP for
  unfinished fights separately. These fixed starting conditions and
  scripted decisions do not establish a live clear rate or rank classes.

Keep the accepted identity values while adding a complementary melee
comparison. Next, test Vengeance pursuit versus Avenging Wrath against
grounded Troll and intermittently airborne Dragon. Record successful
pursuits alongside clears, then extend the pass to ordinary upgrade value,
reward acquisition and grafts before the visual milestone.
