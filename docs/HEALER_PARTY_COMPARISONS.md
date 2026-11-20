# Healing, damage, and utility in matched parties

The existing solo and Knight duo runs remain controls. Selected stalled
encounters now get a trio sensitivity check with the same lead, Knight,
boss, seed and three-player scaling. The third slot is the only roster
change within each trio group. The comparison applies to these scripted
lineups. Duo-to-trio differences also include party scaling.

## Cases and comparison rules

- **Hunter and Beast Master versus Lich.** Use the return-arrow and pack
  identities from the previous batch. Their selected Knight duos did not
  clear in the 90-second window.
- **Devotion versus Beholder.** Use Unyielding Faith and the same Knight.
  This tests a stalled lineup that already has healing.
- **Third-slot choices.** A second Hunter supplies damage. Whispers adds
  healing, party buffs and a decoy. Light adds standard Cleric healing and
  Guiding Bolt. Life uses either Ceaseless Mending with Preserve Life or
  Font of Life with Blessed Bloom and Mass Cure. Land Druid adds Regrowth
  and Healing Spring.
- **Same-kit healing policy.** The Font loadout repeats with both direct
  heals available. Triage begins at 88% HP; the conservative policy waits
  until 70%. Other support routes use the conservative threshold, except
  the Druid recovery route, which uses triage.

The run also adds complete no-identity, A and B comparison rows for
Whispers, Light and Life as lead, solo and with Knight. Those use Troll and
Lich. All cases run native inputs at 20 Hz for up to 90 seconds over the
same six seeds. The caster must physically position for centered
Sanctuary, Bloom and Healing Spring. A healer with a ready rescue field
can approach for Font before attempting a manual revive. The runner
records effective healing given and received, downings, revives,
reflections, Font channel starts, refuge time, and Whispers fear time and
decoy-targeted wind-ups. Report wipes and timeouts separately.

The controller aims damage primarily at the boss. Native directional
ground zones land at a fixed offset, so aiming the reticle at Lich from
a normal standoff does not guarantee Rain of Arrows coverage. A future
Lich comparison should add an arming-aware placement and add-clear
policy before attributing every damage shortfall to the class.

To reproduce from the repository root with dependencies installed:

```sh
node scripts/measure-fixed-encounters.mjs > healer-comparisons.json
```

## Fixes from the review

- **Life Drain** now credits Lich for HP actually removed on a lethal
  beam tick. A 15-damage tick hitting a player with 1 HP gives 1 HP of
  healing credit before progression damping. Absorption, damage
  resolution, and cover continue through their normal rules.
- **Healing fields** now use the shared healing calculation. A caster
  healing themself from their own field gains healing credit without
  generating threat. Healing other heroes still generates threat, and
  field healing still pays deferred Faith damage before restoring HP.

## Results

The expanded matrix has **1,290 fights**, including **126 selected trios**.
Each cell below shows clears, wipes and timeouts across six matched seeds.

| Third slot                  | Hunter vs Lich   | Beast Master vs Lich | Devotion vs Beholder |
| --------------------------- | ---------------- | -------------------- | -------------------- |
| Second Hunter damage        | 0 clear · 6 wipe | 0 clear · 6 wipe     | 6 clear              |
| Whispers utility            | 4 clear · 2 wipe | 6 clear              | 6 clear              |
| Light offense               | 5 clear · 1 wipe | 6 clear              | 4 clear · 2 timeout  |
| Life protection             | 6 clear          | 5 clear · 1 wipe     | 6 timeout            |
| Life triage                 | 6 clear          | 5 clear · 1 wipe     | 6 timeout            |
| Life same kit, conservative | 6 clear          | 6 clear              | 6 timeout            |
| Druid recovery              | 4 clear · 2 wipe | 3 clear · 3 wipe     | 6 timeout            |

- **Lich benefited from support in this sample.** With Hunter leading,
  the damage slot wiped in every seed and had 29 total downings. Life
  protection and triage each cleared every seed with one total downing
  per route. Life protection recorded a median 1,027 HP of effective
  healing and triage recorded 1,348. With Beast Master leading, Light
  and Whispers both cleared all six. Use that contrast when choosing
  which form of support to test, since the best scripted result varied
  with the lead.
- **Beholder rewarded more pressure with Devotion already present.**
  Damage and Whispers both cleared six. Life and Land had zero downings
  but timed out in every seed. Their median remaining boss HP ranged
  from 16.3% to 23.7%. That is a time-limit failure in this fixture.
- **Earlier healing was situational.** The identical Font kit waiting
  until 70% HP tied the 88% threshold on Hunter and cleared one more
  Beast Master fight. Effective heal totals depend on missing HP,
  survival and encounter length, so this sample supports multiple
  playstyles without a blanket target HP recommendation.

The lead support comparison adds 24 fights per identity variant. Whispers
cleared 12/24 without an identity and 13/24 with either identity. Unheard
Dirge redirected 110 boss wind-ups, while Voice of Madness recorded 173
seconds of active fear across enemies. Light went from 13/24 without an
identity to 15/24 with either identity. Endless Radiance reflected nine
projectiles. Life cleared 9/24 with each variant. Font started one channel
in the lead cases and three in the selected trio cases. Ceaseless Mending
recorded 142 seconds with a refuge present as lead. Font has a low natural
sample here, so use the dedicated rescue checks for mechanic correctness.

Keep the current identity values. Add targeted healer trios when stalled
results suggest survival is relevant, and keep a same-size damage control.
Next, compare Moon and Land Druid as lead, evaluate graft acquisition,
and exercise Land with both a healing and a damage/control first pick.
