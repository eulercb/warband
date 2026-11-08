# Shadow Monk — purpose review after accepted Open Hand

Baseline: the owner accepted #165's expanded Open Hand movement loop. One bounded
Sol 6.1 high source review examined Shadow alongside the Wave Flow correction.
This document records completed review findings and the next prototype task;
it does not mark a Shadow redesign implemented or accepted.

## What the actual kit does

At full health against one boss, every first Shadow skill pick retains the
starting Step → Stunning Strike or Quivering Palm → Shadow Rhythm route. Spending
Flow can refund 2s of running dash/blink cooldowns once per 4s. Protected recovery
instead supplies hindrance removal and 1s control resistance. Ready movement
skills do not waste the trigger. This is useful mobility support, already present
before choosing either identity.

| Layer                            | Actual behavior and marginal value                                                                                                                                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shadow Rhythm                    | Existing mobility recovery after spending Flow; retain its working purpose while evaluating the pair.                                                                                                                 |
| Shadow Incarnate (A)             | Step/Shadow Step prepare a critical; base direct spenders, Dart and Strike can consume it. Cloud is an additional setup source. Useful precision growth on the existing sequence, rather than a distinct action loop. |
| Silent Death (B)                 | Adds healing/preparation, attack windup suppression and Shadow Step resistance. This changes values on the same movement/setup/spend route; resistance also overlaps the passive's protected-recovery fallback.       |
| Dart / Splintering Dart          | Ranged Flow stun; grand adds impact area and damage. Useful ranged setup/control without requiring a second skill.                                                                                                    |
| Shadow Step / Guarded Arrival    | Blink and Flow setup; grand supplies heal and finite frontal counter guard. Another generic escape/guard rider is not an independent identity.                                                                        |
| Cloud / Creeping Shadow          | Placed ticking territory, with Flow area/slow; grand follows its first damaged foe. “Following shadow territory” is already occupied by this skill grand.                                                             |
| Strike / Honed / Unerring Ambush | Close-range damage/leech; Honed grows recovery and grand adds critical chance/reach. Further critical/leech amplification remains growth.                                                                             |

Dart, Shadow Step, Cloud and Strike each have a working first-pick route through
the base kit. Cloud cannot justify the other three first picks by being assumed
as a second setup source. A remains usable with its base Step setup; neither A
nor B is credited with introducing the already-existing passive refund loop.
Forge/copy variants must be checked against their actual retained delivery and
setup, not assumed to inherit every native blink, Flow or Cloud.

## Distinction and rejected overlaps

Open Hand now carries the aimed attack throughout a committed movement lane.
Assassin's accepted Reprise earns an anchor return; Whispers changes perceived
targets, avoidance and allegiance. Renaming those behaviors as shadows would
repeat accepted routes. A shadow image is not useful identity evidence if it
only supplies another numerical shield. Likewise, a larger critical, stronger
slow or generic dash does not resolve the pair's purpose finding.

The code review did not establish a small, mature replacement that is clearly
distinct and ready to ship with Wave's correction. A and B remain usable growth
packages with **identity purpose unresolved**, not newly accepted designs.

## Next development task: a bounded prototype

Investigate deliberate attack-and-withdrawal with a freely chosen direction,
contrasting a strike at departure with Open Hand's carried strike and Assassin's
return to a previous place. This is a hypothesis to test, not a promised final
mechanic. It must also differ materially from Knight's existing utility footwork.

Before shipping, resolve and test:

- Actual input and timing: original press versus follow-up, captured movement
  versus aim, and how the player deliberately chooses to remain or withdraw.
- A retreat that works without connecting a melee hit or approaching danger;
  readiness, misses and held autofire must not produce surprising displacement.
- Interaction with Shadow Rhythm: refund and movement must create a decision,
  rather than two rewards for an indistinguishable trigger.
- A solo-boss route with each first skill pick and a useful co-op role; no assumed
  adds, injury, second skill or rare grand.
- Locked attacks, cover, roots, interruption, ownership/class changes and the
  actual departure/arrival visual states on desktop and phone.
- A priced, fitting copied/Forge contract that remains playable without a donor
  passive or partner skill.

If the prototype only reproduces utility footwork or travelling attacks, reject
it before full implementation and pursue another behavior. Preserve useful
simple skills; do not mutate every slot merely to make the class look different.
The next bounded design review should settle these concrete questions, rather
than re-review the completed catalogue findings.

After Shadow: remaining nature identities, caster/support identities,
whole-system power/reward/graft tuning and the visual milestone. Current sequence
and acceptance states live in [development status](DEVELOPMENT_STATUS.md).
