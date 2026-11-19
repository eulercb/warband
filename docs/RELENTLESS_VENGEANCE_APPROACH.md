# Relentless Vengeance approach decision

The owner reviewed the proposal in #185 and identified two conflicts. Divine
Shield is a defensive reaction with a real invulnerability window. Asking the
player to use it to prepare pursuit competes with that job. Also, opening the
pursuit window with a melee hit makes the first approach impossible precisely
when a mobile boss is hardest to reach. The Shield-recast proposal is superseded.

## Prototype Holy Strike pursuit

With Relentless Vengeance, aim at a visible foe just beyond Holy Strike's
effective melee reach and press the basic attack. If pursuit is ready, the
Paladin runs a short distance toward that foe, stops at its melee edge and
swings once if the normal strike can connect. A foe already in the melee cone
takes priority for the normal swing. The approach requires neither an aura nor
prior contact. Native Divine Shield retains its defensive timing and ability.

Use a **single targeted commitment** rather than a teleport. Start the prototype
with up to 180u of travel over up to 0.4s and a separate six-second recovery.
Those are prototype values. Keep a short maximum travel budget and a limited
turn rate so the Paladin can follow a small lateral retreat without chasing
the boss through the arena. Use normal movement collision, check cover before
committing and stop if new cover blocks the route. A boss blink, invalid
target or range failure can cost the swing after movement is committed. At
landing, resolve at most one ordinary Holy Strike using its normal reach, hit
geometry and on-hit provenance. The approach provides no invulnerability,
automatic hit, extra damage or second swing.

The basic slot already carries fresh press and held input separately in the
host. Only a fresh press can commit pursuit. Held autofire keeps swinging at
ordinary reach and cannot take off as the cooldown becomes ready. Show the
eligible target and proposed path before the press, including a distinct cue
when the path is blocked. On mouse use aim to select the enemy. On stick use
the same aim cone and stable ordering. Favor a smaller, predictable selection
cone over snapping sideways. Test deliberately whiffing without movement and
switching between close and distant enemies. If the aim and fresh press still
cause unexpected commitments, test an explicit forward-movement requirement
on both control schemes before selecting an input contract.

## Why this approach fits

- Against a lone boss at full health, run back in after a dodge or approach
  before landing the first hit. Against a stationary boss already in melee,
  normal swings suffice. This proposal does not need to turn pursuit into a
  compulsory flank or a reward for circulating around a stationary target.
- Avenging Charge is a freely directed movement skill with landing area damage
  and an optional ally-crossing payoff. It can engage an empty destination or
  carry you away. Pursuit commits to an aimed foe at short range and stops at
  melee distance. Save Charge for a longer entry, a chosen landing angle, or
  Guardian Crossing.
- Hunter's Vow can open Pursuit aura before the approach. A real landing hit
  can spend Relentless Procession through its existing rules. Enmity and
  Wrathful Smite can be used after reaching the enemy. Exiling Judgment never
  automatically follows the enemy it pushes out. All four first picks have
  Holy Strike.
- Cover and committed telegraphs stay meaningful. The Paladin chooses a window
  to close the gap and may carry an existing aura forward with them. The action
  leaves enemy movement and targeting, ally positions and aura duration intact.
- Avenging Wrath still offers a reason to establish and hit within control.
  The revised B would spend an opportunity to get close in the first place.
  The old Shield haste, leech and other riders should be evaluated as a package
  for removal once the prototype proves its value. Avoid adding pursuit on top
  of all existing growth by default.

The bounded Sol 6.2 High review also considered directing the approach through
Consecration. Moving with that cast would make the approach compete with
healing and ground placement, and changing its destination would complicate
Pilgrim Ground's follow behavior. Holy Strike puts the decision on the input
whose purpose is to reach and hit a foe.

## First playable test

Exercise a mobile boss, a stationary boss just outside melee, two aligned
targets and an obstructed route with actual mouse and stick input. Include
held autofire, root, class swap and downing, and a live boss attack while moving.
Compare a native build with and without Charge and test Radiant Riposte and
Procession at landing. The movement must fail without spending pursuit when
there is no legal target or initial route. A legal commitment spends pursuit
once even if the target subsequently escapes. A cooldown that survived a
class swap must keep its remaining recovery.

Before a gameplay release, verify native first picks and actual Forge
synthesis. A non-melee basic cannot advertise an approach through Holy Strike.
If a legal Forge build retains a compatible melee basic and the behavior
is portable, give it a priced component and preserve the same selection and
recovery rules. Otherwise leave the identity banked for incompatible kits.

## Playable prototype

The native Relentless Vengeance grand now enables this behavior in a playable
build. It uses up to 180u of travel and 0.4s, with a six-second recovery from
commitment. The target and path appear while a fresh attack can pursue. A red
path means cover blocks the run. An in-range foe takes priority for the normal
attack even if another foe is farther along the same aim line.

The prototype removes the added Shield and Charge haste from this identity.
It keeps the leech and Hunter's Vow healing during the trial. A failed acquisition
falls back to a normal basic swing. A committed run can end without a hit if
interrupted, blocked by cover or left behind. Landing uses normal Holy Strike
damage and melee hooks. The host validates the move and the client draws its
preview. Composed attacks keep their existing strike benefits during the native
trial. Forge pursuit is a separate compatibility and pricing decision.

Try lining up a mobile boss after dodging, deliberately swinging away, holding
autofire outside reach, and approaching around a pillar. Try the same fights
with Avenging Charge bound and compare reasons to use each. Next development is
to act on pursuit playtest feedback and resolve Unyielding Faith, then Battle
Rhapsody, broader tuning and the visual milestone.
