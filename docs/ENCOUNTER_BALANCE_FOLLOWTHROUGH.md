# Encounter balance follow-through

This batch extends the [84-fight support pilot](FIXED_ENCOUNTER_PILOT.md),
tests four ordinary upgrades at repeat ranks, and applies two combat fixes.
Use the pilot as a record of its original controller and results. The
commands below run the expanded comparison.

## What changed

- **Radiant Strike** gives Holy Strike a 0.4s daze at rank one. Later ranks
  keep adding 6 damage and healing for another 10% of damage dealt per rank.
  Previously the daze also added 0.4s per rank, reaching 2s at rank five.
  A controlled boss pauses its actions and movement. The long repeat-rank
  daze was suppressing boss action time on top of both other gains.
- **Direct lifesteal** now uses HP actually removed by native cone, burst and
  projectile hits. This also applies to those deliveries when composed.
  A 1-HP add struck by Relentless Holy Strike gives 0.15 HP at its 15%
  lifesteal rate. Hero’s Ballad Dissonant Whispers gives 0.20 HP at 20%.
  Projectiles account for immunity, mitigation and each victim's overkill
  separately. Damage return values used by other effects keep their existing
  contract.
- **Bard and Paladin offers** use per-rank changes where fixed results could
  contradict the procedural or already-upgraded kit. Honed Bolster now
  names its haste duration as the stat it extends.

## How to reproduce

Run from the repository root with dependencies installed:

```sh
node scripts/measure-fixed-encounters.mjs > encounter-results.json
```

For the before comparison, use the same expanded script in a checkout of
`f30ee90` with its dependencies available. The runner simulates 552
matched encounters per version at 20 Hz. It keeps the original three seeds
and adds 211, 307, and 401. It compares Bolster and Blade Flourish Valor,
Aura of Protection Devotion, and Hunter’s Vow Vengeance. The ordinary
comparisons cover Honed Bolster, Honed Aura, Honed Vow and Radiant Strike,
one upgrade at a time in the B kit. Every group has matched initial boss
scaling, positions, terrain and obstacles.

The Knight now reacts to danger with Shield Wall, and the revive policy
stops within revive range. Pursuit deliberately releases held autofire when
a runway is available and waits for a fresh press. The runner reports
starts and completed swings separately. A swing can occur without damaging
the intended foe. Cast telemetry excludes cast-start announcements.
Faith records each wound at creation and balances its HP through healing,
expiry, pending debt and discard. Healing used on wounds is separate from
effective healing. Changing these policies changes scenario outcomes. Use
the expanded before and after runs as the paired sample for this patch.

## Findings and decisions

### Radiant Strike

Median share of fight time bosses spent stunned and median clear time in the
Relentless Vengeance kit. Each boss/rank group comprises 12 fights across
solo and duo. All ranked groups cleared all 12 fights.

| Ranks | Troll stun share, before → after | Dragon stun share, before → after | Troll clear, before → after | Dragon clear, before → after |
| ----- | -------------------------------- | --------------------------------- | --------------------------- | ---------------------------- |
| 1     | 4.4% → 4.4%                      | 4.5% → 4.5%                       | 40.70s → 40.70s             | 53.80s → 53.80s              |
| 3     | 14.0% → 4.5%                     | 13.8% → 4.3%                      | 32.27s → 32.25s             | 41.67s → 41.52s              |
| 5     | 22.8% → 4.4%                     | 20.1% → 4.5%                      | 26.67s → 27.35s             | 36.45s → 34.48s              |

The daze correction preserved the rank's main payoff in these encounters.
Rank-three and rank-five damage and sustain still warrant an acquisition
check. The ordinary ranks here were pre-equipped, so the clear times
cannot establish how often the strongest stack is attainable in a run.

### Identity and other ordinary ranks

- **Vengeance:** Relentless turned all 20 starts into swings at zero
  ordinary ranks, all against Dragon. The approach controller kept Troll
  within ordinary walking range, so that fixture produced no pursuit
  starts. Avenging Wrath cleared Dragon 12/12 to Relentless's 11/12 and was
  faster in each boss/party group. Retain both for now. A forced
  disengagement and re-entry fixture can distinguish pursuit's approach
  value from a consistently close melee policy.
- **Valor:** Blade Flourish exercised the melee outlet that Bolster lacks.
  Both rally policies with Blade Flourish cleared 24/24 with 198 and 199
  pickups. Bolster's detour turned 79 pickups into 160 with the same 10/24
  clears. Honed Bolster cleared 10, 9 and 11 of 24 at ranks 0, 1 and 3.
  Those outcomes give no consistent reason to tune Bolster or Rhapsody.
  This controller does not plan a route through a ground hazard after
  picking up a rally.
- **Devotion:** The zero-rank Faith kit applied 94 wounds and deferred
  1,094 HP. Healing repaid 888 HP, 189 came due, and the balance was
  pending or discarded. At ranks 0, 1 and 3, Honed Aura left clear count
  at 12/24. Wound counts fell from 94 to 93 to 82 as the barrier grew.
  Fewer wounds are compatible with a larger barrier absorbing more before
  deferral can trigger. No Faith or barrier tuning follows from this sample.
- **Honed Vow:** Three ranks brought Relentless from 23/24 to 24/24 clears.
  One rank kept the same clear count. Keep the increase and check the
  opportunity cost against other upgrades in actual reward pools.

For the next batch, check when repeat ranks become available through normal
reward choices and compare them with viable alternatives, then test graft
acquisition and value. Keep the targeted pursuit re-entry case in the next
round of encounter measurements. The visual revamp remains after progression
and graft work.
