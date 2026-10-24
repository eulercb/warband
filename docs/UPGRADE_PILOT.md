# Upgrade identity pilot: Rogue and Warlock

Historical pilot delivery. The owner merged/live-tested it and revised the ordinary
boon direction; [the foundation correction](UPGRADE_FOUNDATIONS_AND_GRANDS.md)
restores full Vial field damage plus additive exit poison. Benchmark data below is
historical, not a measurement of that revision. Recharge and grand-selection
roadmaps are superseded by the new plan.

Current delivery: eight approved upgrade paths implemented; live verification pending.
The [design checkpoint](UPGRADE_DESIGN_CHECKPOINT.md) remains the historical proposal.
Stable IDs, ownership caps, controls, offer counts, reward progression and graft eligibility
are preserved. No adaptive difficulty controller or coefficient changes are included.

## What changes in play

- **Assassinate:** a prepared, positive Backstab connection refunds one second of a
  running Shadowstep cooldown, once per cast and four seconds. Ready cooldowns,
  misses and immunity do not spend the gate. The originally proposed reduction
  to damage/cooldown growth was too severe in repeat-pick fixtures: final delivery
  retains +24 damage, ×.78 cooldown and +.1 crit multiplier per pick.
- **Deadly Poison:** Vial retains its existing magnitude/duration/radius growth,
  allocating 80% to ground damage. A foe that took effective field damage carries
  two seconds of poison when it exits or the field expires. Poison deals one
  post-allocation field tick per second. Three field-poison recipients per owner,
  one exit application per target per two seconds. Stationary pressure is lower.
- **Honed Coated Blade:** first pick extends poison from four to five seconds;
  second extends to six. Picks after the first multiply poison by 1.12 (rounded)
  and cooldown by .96. Six-second preparation and precision's +50% remain.
  At five picks the authored result is 38/s for 6s, cooldown 7.644s.
- **Grand Venom:** retains its magnitude/duration/radius/slow growth, but allocates
  60% ground / 40% following poison with a two-second linger. This supersedes the
  common boon's allocation, whichever is picked first. Ground and poison are
  one damage budget, not two full effects. Only three recipients get the poison
  share; extra foes receive the ground share. The ground-focused skill grand stays; if Deadly Poison is also owned, it keeps
  that common boon’s 80/20 allocation rather than Grand Venom’s 60/40 split.
- **Deepening Hex:** +6 tick magnitude, +1.5s duration and +12 radius per pick;
  +1 percentage point curse amplification remains. Slow, hindrance and curse linger
  two seconds at first pick, increasing by .5s to a four-second cap. Benchmarks
  justified preserving old damage/duration growth rather than the proposal's
  +4/+1. Reduced radius growth is the tradeoff for longer lingering control.
- **Searing Rebuke:** its existing one-use 3s retort can also release at the victim
  of the next positive direct hit, basics included. Incoming damage can consume it
  first. Same 40%-of-Rebuke burst and lifesteal; no extra charge or secondary-hit
  recursion. The burst flashes its actual center/radius.
- **Honed Mind Blast:** retains numeric Honed growth and extends the personally
  cursed-target weakness/hindrance by one second per pick, up to five seconds.
  Equivalent weakness does not multiply; an allied shorter Mind Blast cannot shorten
  a longer active hindrance window. No new hard interrupt is added.
- **Word of Ruin:** exchanges Hex's grand +65 radius for up to three seconds
  following its first effectively damaged foe, nearest field center then ID.
  Afterwards it anchors. Death, disappearance or flight ends following at the
  last valid position; no hopping to a replacement. Damage/duration and Rebuke
  improvements remain. The stationary coverage grand stays available.

Vial and Coated Blade use **the same strongest poison per owner**. A weaker Vial
poison never replaces stronger Coated poison; different owners remain independent.
Combining them can suppress Vial's poison share, an explicit opportunity cost.
There is no new poison spread, kill requirement, input or resource bar.

## Compatibility and corrections

Forge decomposition, refresh, recompose, fitting, capped scaling, value and text
carry the new payloads. Projectile-delivered zones carry allocation/following on
impact. Prepared direct projectiles share cast identity across pellets and piercing;
immune bosses preserve precision. Poison/retort ticks are secondary damage.

**Correction to the checkpoint:** Ranger is excluded from Hexbrand because it
already has a damaging zone. The pilot tests Hexbrand on an eligible Knight and
keeps the exclusion. Shadow Pact on Knight and all seven grafts' selected
followup/grand/reclaim/re-seat sequences remain in the regenerated inventory.
A stale graftup after reclaim is now ignored instead of retuning the native skill.
Native class grands do not leak onto foreign occupants.

Honed poison copies its nested authored payload before mutation. Repeat-world,
repeat-player and Forge fixtures guard against shared-content contamination.
For a composed coating, combat and power valuation use its capped component payload,
matching the displayed description even after combined grand/Honed growth.
The canonical Coated Blade blurb now describes target poison, Assassin's grand
promises leech only on direct strikes, and Greater Heal's stale 88 HP says 103 HP.
Resolved descriptions state allocation, recipient limits, preparation and lingering.

The hero-power estimator credits one zone magnitude, conservative extra lingering/
following opportunity and the more reliable existing retort. Forge values also
price the bounded refund. Refunds remain utility in the hero DPS index; it does
not pretend a second of escape is guaranteed damage. Controller coefficients and
party difficulty rules are unchanged. Increased power estimates can still affect
normal adaptive encounters through their existing rules.

## Measured comparison and limits

`node scripts/measure-upgrade-pilot.mjs /path/to/baseline-checkout` compares with
merged design commit `45706e1`, with dependencies available in both checkouts.
[Complete fixture results](UPGRADE_PILOT_BENCHMARK.json): **480 cases**, both
versions, two classes, 0/1/3/5 repeats, with/without the pilot grand, five target
patterns and parties of 1/2/4. Each runs 30 seconds at 60Hz with actual resolved
cooldowns/cast commitment and manual scheduled casts. The selected subclass skill
is pre-equipped; these are not fresh-run acquisition or progression simulations.

Fields are deliberately placed at the target's position **at cast time**, not
continuously retargeted. Player positions are reset to a fixed origin; the moving
target follows a deterministic curve. Flight/invulnerability preserve other buffs.
Boss decisions and add attacks are suppressed and HP is made very large to measure
outgoing pressure without early kills. These are **not full fights, human inputs,
TTK or balance/fun scores**. Party results test independent ownership, not a claim
of linear party scaling. Unupgraded, no-grand baseline/pilot damage matches, and
invulnerable fixtures deal zero damage. Production input and rendered fixtures
are checked separately.

Solo damage changes below compare the three ordinary pilot upgrades at each stack
plus the selected subclass, with the relevant grand when marked. They do not
isolate a single upgrade's contribution. The power column is the actual estimator,
not a fit to these outgoing fixtures.

| Class   | Stacks | Grand | Stationary damage | Moving damage | Add-group damage | Power index   |
| ------- | -----: | ----- | ----------------: | ------------: | ---------------: | ------------- |
| Rogue   |      1 | no    |             -1.8% |         -2.9% |            -9.0% | 1.293 → 1.302 |
| Rogue   |      1 | yes   |             -8.1% |         -8.4% |           -14.1% | 1.711 → 1.734 |
| Rogue   |      3 | no    |             -0.4% |        -12.5% |            -9.9% | 1.825 → 1.848 |
| Rogue   |      3 | yes   |            -12.0% |        -14.5% |           -16.1% | 2.309 → 2.346 |
| Rogue   |      5 | no    |             -2.8% |         -8.3% |           -12.0% | 2.560 → 2.574 |
| Rogue   |      5 | yes   |            -14.3% |        -18.1% |           -17.9% | 3.073 → 3.101 |
| Warlock |      1 | no    |             +2.6% |         +2.9% |            +3.7% | 1.322 → 1.332 |
| Warlock |      1 | yes   |             +2.1% |         -3.8% |            +2.8% | 1.811 → 1.859 |
| Warlock |      3 | no    |             +2.8% |         -3.6% |            +3.3% | 1.685 → 1.699 |
| Warlock |      3 | yes   |             +1.8% |        -11.2% |            +2.3% | 2.251 → 2.305 |
| Warlock |      5 | no    |             +1.7% |         -6.1% |            +2.4% | 2.124 → 2.140 |
| Warlock |      5 | yes   |             +1.6% |        -11.3% |            +1.9% | 2.742 → 2.800 |

Rogue's stationary ordinary builds stay close to the old output, while flight
fixtures benefit from Coated duration. Moving timing and add-group coverage can
lose output, especially when stronger coating suppresses the field's poison share.
The ground-only grand remains an intentional alternative. Warlock ordinary
stationary pressure gains a few percent; moving coverage is not universally higher.
Longer control and a usable retort do not guarantee higher damage in every fixture.
Use these limits to guide live testing rather than compensate every loss with
unconditional damage. No claim of equal class balance is made.

## Verification and owner playtest

- Unit coverage includes prepared/zero/immune/miss/ready gates; field exits/expiry,
  strongest-poison refresh, three-recipient cap, independent owners, retort
  consumption, nearest follow target, death/flight/expiry and hostile-zone isolation.
- Stack 0/1/3/5, seeded procedural/Forge runs, actual production cooldown input,
  graft replay and unchanged authored content receive regression checks.
- `npm run smoke:upgrade-pilot` checks real engine/renderer payloads for both classes,
  canonical/composed, at 1280×800, 320×568 and 844×390. These are render fixtures;
  existing production input/mobile smoke remains separate.
- Regenerate/check catalogue evidence with `node scripts/audit-upgrade-catalogue.mjs --check`.

Local validation: **3,892 tests passed across 143 files**; full coverage met the
unchanged 98% branch gate (98.02% achieved). Production build, lint, formatting and inventory replay
passed. Twelve engine/renderer browser fixtures passed, plus the selected production
UI/input checks on desktop and 320px mobile. GitHub CI rechecks the final commit,
including the new browser fixture and reproducible inventory gate. The caster-defense
smoke samples transient absorption amount/cap atomically: combat can consume a
bubble between separate DOM reads. Its positive/cap assertions remain intact;
the six Warlock desktop/mobile cases pass locally.

For live testing, try Vial alone before combining with Coated Blade; compare the
full-ground grand with following poison; use prepared Backstab while Shadowstep is
still recharging; release Rebuke with a basic before taking damage; watch Hex follow
briefly then stay put. Test early ordinary choices as well as heavy repeat builds.
Keep feedback about usability separate from fixed-output numbers and adaptive bosses.

## Next

After merge and live feedback, move to the grouped rollouts in the
[upgrade roadmap](UPGRADE_IDENTITY_ROADMAP.md). The next proposed cohort is
Knight/Barbarian/Monk, covering distinct counter, Momentum and Flow choices.
Ranger/Druid, Mage/Sorcerer and Cleric/Paladin/Bard follow, potentially grouped
into two to four PRs total according to shared implementation size. Whole-kit
review and successful existing mechanics stay in scope; visual/art redesign is
still separate.
