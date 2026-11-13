# Delayed damage and Pack Tactics follow-up

The owner merged and tested #169: outward reach now feels right, but splitting
normal damage into delayed portions feels weak. Pack Tactics' command behavior
was liked, with a request for damage competitive with Alpha’s Fury and a more
convincing pack. One bounded Sol 6.1 high review informed this delivery.

This delivery addresses that feedback. Land B remains the next development task;
combining another identity redesign with these combat and rendering changes would
make playtesting harder to interpret. These new numbers remain pending owner
acceptance, not established whole-game balance.

## Damage converted into a delayed payout

Equal eventual totals do not guarantee equal usefulness: the later portion can
miss, meet immunity, arrive after regeneration or never arrive before the owner
or target changes state. Compensation is assessed per conversion, including any
existing damage and behavioral rewards.

| Mechanic               | Before                                | New reward                                     | Why this amount                                                                                                                                                                                |
| ---------------------- | ------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hunter Relentless Hunt | 50% outward + 50% return              | **60% each leg; 120% if both hit**             | The second contact requires both time and body positioning. A missed return still leaves only 60%. Reach, piercing, cover and finite return remain as accepted.                                |
| Clinging Snare         | 60% field + 40% following poison rate | **75% field + 50% poison rate; 125% combined** | The grand previously converted damage without adding magnitude. The extra 25% compensates its delay, recipient limit and strongest-owner exclusion.                                            |
| Grand Venom            | 60% field + 40% following poison rate | **66% field + 44% poison rate; 110% combined** | It already adds 22 raw tick magnitude, duration, area and slow, so its additional conversion premium is smaller. Common Deadly Poison stacks do not multiply this premium again.               |
| Shadow Silent Death    | Full original strike after 0.6s       | **110% primary strike damage after 0.6s**      | Immediate freedom to move and act is already useful compensation; 10% adds a small damage reward for committing fixed strike geometry. Preparation, riders and activation hooks do not repeat. |

The poison percentages compare **sustained rates** against the field's original
rate, not guaranteed per-cast totals. For example, a 10-damage half-second tick
with Clinging Snare produces 7.5 field damage each half-second and 10 following
poison damage per second: 25/s combined versus the original 20/s. Following poison
can linger 2s after contact. It reaches at most three foes and competes with the
same owner's stronger coating. A fourth foe receives only the compensated field
portion; the description retains both restrictions.

Native and Forge readouts show both percentages and actual field damage per
half-second / poison damage per second. One allocation calculation drives combat,
readouts and zone valuation. The optional premium stays in the zone's Forge
component, survives refresh/recomposition and is capped at 25%; legacy allocations
without the new field preserve their previous output. The premium is applied once
to raw damage, before ordinary outgoing and incoming modifiers, not to damage
that has already received those modifiers.

### Reviewed effects that keep their existing damage

- **Deadly Poison:** full field damage plus an exit tail, with ordinary magnitude,
  area and duration growth. It does not surrender field damage to create poison.
- **Coated Blade / One with Shadow:** added coating poison; prepared coating
  already gains 50%. No direct attack damage is converted away.
- **Echoing Cut, Mantle afterimages, Momentum fissures and retorts:** supplemental
  damage, not a split of the original attack. They do not receive this automatic
  conversion premium.
- **Pursuing Rain and other following fields:** preserve their field budget and
  already improve delivery or magnitude. Following alone is not a reason to add
  another damage multiplier.
- **Infernal Aperture:** its travel transaction enables cover-based firing rather
  than replacing an immediate contact with a second payment; no blanket buff.

The future rule is recorded in AGENTS.md and the upgrade review gate: review
immediate output, realistically landable total, delivery cost, recipient caps and
existing compensation; state portions honestly. Do not apply one universal bonus
to every poison or delayed effect.

## Pack Tactics: three wolves, one chosen quarry

A fresh direct cast still designates its first damaged living hostile within
600u for a 6s hunt. During that hunt, **two smaller spirit wolves** flank the
same quarry from opposite sides. They do not acquire unrelated enemies near the
hero, so choosing the quarry remains an explicit player decision.

| Per wave, before other damage modifiers | Normal quarry | Slowed/rooted/stunned quarry |
| --------------------------------------- | ------------- | ---------------------------- |
| Pack Tactics lead wolf                  | 16            | 20                           |
| Two flankers                            | 4 + 4         | 5 + 5                        |
| **Pack Tactics total**                  | **24**        | **30**                       |
| Alpha’s Fury wolf                       | 16            | 24                           |

One shared 2.5s wave recovery remains. The lead's 0.3s windup is followed by
0.45s and 0.6s helper strikes. Three complete waves during a fresh hunt therefore
have potential companion damage of 72 normal / 90 controlled. Alpha’s Fury retains
its 0.15s windup, +20% player direct controlled-target damage and Roll block, so
B's increased companion pressure is compared against A's entire package.

Solo: command the boss, then dodge or use another skill while the pack attacks.
Co-op: keep pressure on that quarry while healing or protecting an ally. New casts
can retarget during recovery, but never refund it. Same-quarry renewal preserves
pending windups; retargeting cancels the old pending wave. Held/autofire cannot
redirect or renew the hunt.

The helpers are smaller, host-owned formation followers. They share the existing
leash and lifecycle cancellation, never tank, block movement, select targets,
crit or trigger direct-hit resources, leech, further commands or healing wards.
Only a successful **lead** bite consumes the existing prepared ward. Pending
helpers end when the quarry dies, is charmed or leaves range, when the hunt
expires, or on the existing owner/source/scene/class invalidations.

Snapshots contain detached helper poses and attack flags, never orders or command
provenance. Remote interpolation uses wrapped coordinates for each helper. Arena
rendering shows the smaller silhouettes at the actual flanking positions, alongside
the existing quarry ring and lease arc. Copying a skill still grants no companion;
an active Beast Master owner can command through real composed direct hits.

## Verification and handoff

Combat regression tests cover exact per-leg and per-wave payouts, staggered helper
strikes, renewal/retarget recovery, helper ward exclusion, lifecycle cancellation,
poison rate accounting with outgoing modifiers, common/grand replay order, fourth
recipients, stronger coating, native/composed readouts and retained additive poison.
Existing first-pick, cover, torus, source and Forge tests remain in the suite.

Browser checks cover desktop and phone returning shots, the three-wolf quarry and
remote poses, delayed Shadow strikes, upgrade-pilot poison, nature grand selection
and existing companion lifecycle. Final results are in the PR. Owner live testing
is the next acceptance step.

Next development is **Land B's terrain identity**. Remaining caster and support
reviews follow, then whole-system balance, progression/graft tuning and the visual
milestone. See [development status](DEVELOPMENT_STATUS.md).
