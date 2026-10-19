# Coherence retouch B: active roles and Evoker follow-through

Second of the three approved [coherence retouch batches](CLASS_COHERENCE_AUDIT.md).
Stable skill/passive IDs and input bindings are preserved. This patch does not
replace the existing bear, wolf, barriers, auras, Flow or curse systems.

## Evoker: what was weak and what changes

“Special” meant **every nonbasic slot**, including Fireball, Frost Nova and Blink,
not just the two subclass slots. Two execution details made that unclear benefit
less reliable than the description suggested:

- Damage/passive hooks ran before a control spell applied its own slow or stun.
  A first Frost Nova on an uncontrolled foe therefore did not qualify by itself.
- Instant abilities assigned their cooldown after resolving effects. A refund
  earned during that resolution could not reduce the current ability's recharge.

Evoker now recognizes positive direct hits that apply real slow/stun as well as
hits against existing slow/root/stun. Immunity and resisted hard control do not
supply this new route; ground-zone ticks remain excluded. Instant cooldowns are
committed before effects, matching the already-reserved cast-time path, so a
refund earned by the instant cast is retained.

Arcane Cadence now removes **4s** from running nonbasic cooldowns, once per **6s**,
and readies **Evocation for 6s**: the next nonbasic direct damaging spell gets
**25% more damage and half wind-up**. Basics, utility and zone casts preserve this
preparation. Basics can still trigger Cadence against controlled enemies, but do
not receive refunds. The existing control-damage bonus remains a separate reward
for hitting an already controlled target; applying slow does not retroactively
increase that same hit's control-burst damage.

A real-input regression covers this solo base-kit route with each subclass pick:
Nova hits and slows a fresh foe → its 20s recharge becomes 16s → basic attacks
preserve Evocation → Fireball reserves a 0.35s wind-up instead of 0.7s and deals
100 base damage instead of 80, or 125 if the foe remains controlled. Already
running Fireball can also receive the refund; its base recharge is still 14s.
Six-second proc gates, held-preparation expiry and zero cooldown floors remain.
There is no infinite reset or automatic basic-attack loop.

The alternative was another cooldown-only buff. A visible, usable spell payoff
makes the control sequence easier to understand without introducing a delivery
puzzle or another input. These numbers are starting points for moving-boss and
co-op playtests, not proof of an optimal rotation or class tier.

## Active skills

| Skill          | New job and retained behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Menacing Roar  | Retains +30% personal damage for 6s. Challenges foes within 180u, weakening their attacks by 20% for 4s. Its next connecting melee cast readies one +30% counter after the whole cast resolves. It does not redirect aggro or make summons obey Taunt.                                                                                                                                                                                                                              |
| Bear Spirit    | Retains 6s hard-control resistance and a smaller 20% mitigation fallback. Two frontal blocks for 6s each ready a +30% melee counter on success; counters do not stack. Rear hits and ground hazards bypass blocks. This replaces the old constant 40% mitigation emphasis with facing and reaction.                                                                                                                                                                                 |
| Ground Slam    | Keeps its ordinary 40-damage burst. Spending Momentum additionally leaves a 3s slowing fissure at the caster: 4 damage per stack every 0.5s, slow to 65%. Without Momentum it remains a usable ordinary burst. The fissure is ground-bound.                                                                                                                                                                                                                                         |
| Earth Totem    | A placed 160u field within 380u, lasting 4s, slowing to 50% and pulsing 6.5 base damage every 0.5s. Momentum improves pulse damage and radius. Its existing **9s** subclass recharge is preserved; subclass skills do not inherit the base-kit attack cooldown doubling. Uses the existing zone/arrival-marker system; no new targetable pet or aggro entity.                                                                                                                       |
| Coated Blade   | Prepares coating for 6s. The next eligible positive direct hit poisons one surviving target for 24 base damage each second for 4s; prepared precision gives +50% poison. While precision is held, ordinary hits preserve coating for the prepared strike. Without precision, an ordinary direct hit works, including copied skills. Poison follows the enemy, does not crit or trigger direct-hit riders, and does not stack from the same caster. Separate owners remain distinct. |
| Erupting Earth | A fast aimed projectile carries a 160u debris burst at range, rather than another self-centered circle. Keeps 38 base damage and 8s subclass recharge; deals +25% against existing slow/root/stun. Projectile debris can reach flyers; persistent ground zones retain their usual flight bypass. Gust remains an immediate close peel alternative.                                                                                                                                  |

Roar's counter is prepared after a complete melee cast so it cannot be earned
from the first victim and spent on later victims of that same cast. Existing
stronger counters and frontal guards are preserved. Bear's counter reaction is
specific to its guard payload; ordinary Knight/Monk blocks retain their current
rules. Roar weakness uses strongest-equivalent handling with curse weakness,
preventing several such fields from multiplying enemy damage toward zero.

Poison preparation preserves misses, zero damage, immunity and held precision.
A killing hit preserves coating for a surviving foe. A stronger same-owner poison
cannot be erased by a weaker application. Applied poison persists through class
changes like an owned damage zone, but a disconnected owner cannot keep dealing
unattributed damage. Pending coating/challenge clears on downing, death, class
changes, expiry and noncombat rooms. Tick counts are bounded, including large
simulation steps. Venom gets an enemy status symbol alongside control/curse
icons; host tick payloads remain private.

## Compatibility and difficulty

New payloads have explicit Forge decomposition, recomposition, value, fit,
scaling, refresh and cap rules. Honed/grand magnitude and footprint changes flow
into the new fields rather than becoming dead numeric upgrades. Native and
composed Momentum zones carry the same upgraded tick damage. Copied actives
retain a useful base effect without their donor's passive or resource. Existing
resource, guard and status ownership rules remain in use.

The adaptive difficulty formula and coefficients are unchanged. Earth Totem's
baseline discounted output retains its previous 26-damage-per-use estimate;
Coated Blade's poison is credited at its prior 48-per-use discounted zone output.
Tests compare old and new baseline power indices. New utility and supplemental
fissure/passive payoffs do not automatically add extra estimator credit. Ordinary
upgrade credit can differ slightly through numeric rounding and retained scaling;
unchanged formulas do not promise identical future boss difficulty because kill
pace still feeds back normally.

Regression checks cover real input/cast reservation, actual projectile impact,
native/composed delivery, targets and allies, ground/flight, proc ownership,
expiration/cleanup, large poison time steps, copies, Honed/grand replay and seeded
Forge selection. Browser checks extend the existing production keyboard/touch
suite and fixed-target renderer scenarios at desktop, portrait and landscape.
Passing checks establish behavior contracts, not numerical equality or fun.

## Live review and next step

- Evoker: approach before Nova, look for Evocation, then use Fireball before the
  enemy's control window ends. Compare a solo moving boss and ally-provided control.
- Knight: Roar should weaken nearby enemies without changing their aggro. A melee
  connection should ready the following hit, not boost that same hit immediately.
- Barbarian: face incoming direct attacks with Bear Spirit; compare rear/ground
  pressure. Use Slam against a stationary ground enemy, and place Earth Totem to
  control a route. Check that control and delayed damage remain useful in motion.
- Rogue: compare an ordinary coated strike with Shadowstep/precision into
  Backstab. Move the poisoned enemy away; damage should follow it. Check the
  distinction from Poison Vial's territory rather than only total damage.
- Druid: root/slow first, then launch Erupting Earth; compare with Gust's close
  peel and with an uncontrolled or airborne enemy.

**Roadmap:** A is merged/live-tested; B is delivered here. C remains before broad
upgrade redesign: support alternatives, scaling/caps and remaining cadence, with
successful late kits retained unless testing identifies an outlier. Then the
upgrade/grand/graft design and implementation work begins. Visual direction is
still a separate milestone. Ground Slam's stronger stationary-target value and
Evoker's increased spell availability particularly warrant normal adaptive-run
playtests before more coefficients are changed.
