# Open Hand — a continuous Flowing Water loop

The owner merged and tested #164: the moving Palm felt interesting, but its
movement should apply to the other relevant Flow spenders. The owner also
identified redundant Flow preparation text and Flurry advertising removal of a
windup it does not have. One bounded Sol 6.1 high review supported this follow-up.
The earlier [Palm delivery](OPEN_HAND_FLOWING_WATER.md) is historical context;
this document describes its replacement. This follow-up awaits live acceptance.

## What changes in play

Flowing Water now carries **Stunning Strike, Quivering Palm, Flurry Barrage and
Wave Palm** up to 180u over 0.4s. Press with movement to choose travel; otherwise
travel follows aim. Attack facing is captured separately: retreat while striking
forward, or travel sideways while keeping a narrow Wave aimed at the boss.
Cones retain their range and angle; Palm retains its circle. Each enemy receives
one contact per cast over the entire travelled path, including between ticks.
Pushes, pulls and melee positional bonuses use the actual first-contact origin.

During Step/Wind Step travel or a Flowing Water special, a fresh press can buffer
**one** preparer or moving spender. The latest fresh press replaces the pending
choice; held autofire does not. The queued action launches after travel finishes,
including an early stop against cover, through normal cooldown, silence and cast
gates. It consumes no Flow or cooldown while queued. An unavailable action is
dropped once, not retained to fire unexpectedly later. This is a follow-up queue,
not an attack cancellation. Windup itself does not accept the movement buffer.

A concrete solo route is Step → queued Stunning Strike while retreating → queued
Wind Step → Flurry or Palm on the next opening. Different spenders give different
coverage and control instead of requiring every setup to lead to Palm. With
allies, Wind Step retains its crossing cleanse/guard, while the following aimed
strike controls foes along the chosen lane. The starting Step and two starting
spenders make the loop available with every first Open Hand skill pick, without
adds, injury or rare upgrades.

## Receiving kit and upgrade review

| Layer                        | Result                                                                                                                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Step / Wind Step             | Keep existing movement, healing and Flow preparation; accept one follow-up during travel. Wind Step crossing support and Sheltered Crossing remain.                   |
| Stunning Strike              | A carried aimed cone, preserving control and its individual grand.                                                                                                    |
| Quivering Palm / Death Touch | Existing carried circle and actual-contact pull; no new landing explosion.                                                                                            |
| Flurry / Parting Barrage     | Fast carried cone with existing push; no nonexistent windup-removal claim.                                                                                            |
| Wave / Returning Tide        | Narrow aimed carried cone, existing push or pull. Its 200u runtime reach is capped: Flow does not promise extra reach.                                                |
| Wholeness / Whole in Spirit  | Recovery and full-health Flow preparation remain; can be buffered after travel, without acquiring movement itself.                                                    |
| Ordinary/Honed upgrades      | Existing damage, geometry and control remain; their capped geometry is reflected in Flow readouts.                                                                    |
| Perfect Harmony / Flowguard  | A remains numerical support, as previously accepted. Spending Flow triggers the normal single guard; movement does not repeat preparation, spending or passive hooks. |

Movement works without Flow, matching the accepted Palm and portable component;
preparation still supplies the receiving skill's normal instant launch, geometry
or control where those bonuses actually change it. Windup and cooldown remain
owned by each skill. There is no additional immunity, cooldown refund or resource.
Root at launch allows the normal local attack; root, stun, shove, downing, source
replacement, class/epoch change or leaving combat clears the relevant pending
movement. Spent resources remain spent. Cover stops travel, and existing attack
collision/targeting rules continue to apply.

## Forge, readouts and presentation

The priced, bounded `palmSweep` component now fits nonbasic cones, bursts,
projectiles and ground fields. Cones/bursts travel with the body; a projectile
volley launches **once** and a field is placed **once**, then the body travels.
A field keeps its existing location, arming, following and ground/flying rules;
movement does not turn it into a radial damage sweep. Copied movement works
without the donor passive. Forge Flowing Water also makes compatible burst
specials receive Flow so the existing guaranteed starting burst remains a route.
Targeted Infernal Claim and Ancestral Relay remain incompatible origins.

The arena cue follows the real circle or aimed cone, with a path for the owner.
Shots and fields receive only a movement path, not a false moving hit area.
Public snapshots carry facing, geometry and the queued slot without source
references. Desktop and phone controls say “Flowing”, “Queued” and
“Rooted · no travel”; silence keeps priority.

Preparers state only the preparation and duration. Spenders state the actual
payoff: no windup removal when no windup exists, no added reach/radius beyond the
cap, and no redundant stun/slow bonus already met by the skill. The buff badge
simply says “Flow prepared”. Native and composed descriptions share this rule.
Wave's authored summary now names its actual capped reach.

## Verification and sequence

Regression tests exercise all four native spenders, unprepared/prepared casts,
separate facing/travel, retreat, per-foe contacts, continuous narrow-cone geometry
against an independent sampled cone oracle, seams, buffering, simultaneous inputs,
held autofire, unavailable follow-ups, interruption and copied shots/fields.
Desktop/320px browser scenarios use real World input, public snapshots and Pixi,
including the previous Palm/root/Forge scenarios and the expanded chains. The PR
records final local checks; owner testing determines feel and acceptance.

After live testing, **Shadow Monk purpose review and implementation** is the next
development step. Then review remaining nature, caster and support identities,
followed by whole-system tuning and the dedicated visual revamp. See the
[development roadmap](DEVELOPMENT_STATUS.md).
