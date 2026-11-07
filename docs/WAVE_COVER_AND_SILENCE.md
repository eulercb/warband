# Emitted-wave cover and silence feedback

## Why this follows Champion

The owner merged and tested #157 and liked the projected-shield idea, then asked
for a safe position behind it against Dragon breath and similar attacks. The
same playtest exposed Beholder silence as unexplained, apparently broken skill
buttons. A bounded Sol 6.1 high source review confirmed both engine/UI gaps.
This focused systemic follow-up precedes Battlemaster's identity pair.

## Cover audit and current contract

Previously every cone, boss-centered pulse and beam tick bypassed arena cover.
Solid obstacles already absorbed projectiles. Tall/low distinctions only affected
leaps and boss charges.

| Actual delivery                   | Projected shield                                               | Arena cover                                  |
| --------------------------------- | -------------------------------------------------------------- | -------------------------------------------- |
| Hostile projectile                | One shared block per shot, existing swept contact ordering     | All solid obstacle kinds                     |
| Boss-origin cone                  | One block for every fully sheltered recipient of the same wave | Tall obstacles                               |
| Boss-centered instantaneous pulse | Same shared-wave reservation                                   | Tall obstacles                               |
| Tracking beam                     | One block per intersecting 0.5s tick                           | Tall obstacles                               |
| Targeted local impact             | Bypasses                                                       | Bypasses                                     |
| Persistent placed hazard          | Bypasses                                                       | Bypasses                                     |
| Boss charge/movement              | Passes through projected shield                                | Existing tall-cover/barricade movement rules |
| Summon/self-buff                  | No effect                                                      | No effect                                    |

Tall means pillar, monolith, crystal or obstacle totem. Low rocks and stumps keep
projectile protection but do not shelter from broad emitted attacks. Aperture's
physical barricade also stops emitted waves and beam ticks. This is a delivery
rule, inherited by procedural/Forge bosses through their resolved shape: it does
not guess from an attack name. Every current cone and instantaneous boss-centered
pulse follows it, including magical gazes, slams, quakes and novas. Local psychic
circles and placed pools bypass it. No new flight immunity is introduced.

The projected face remains 120u wide, 60u ahead and follows aim. Source-to-target
rays must cross it from the front, and both silhouette edges must fit. Allies in
front of it or beyond the flank stay exposed. Shields create no pathing obstacle.
Ordinary cover is resolved first, then the nearest eligible projected face with
stable ID ties. The entire threatened-recipient set is evaluated before charges
are spent: a last charge protects all recipients sheltered from the same pulse,
including the owner, independent of player iteration order. Body and projected
blocks share the existing finite pool. Each beam tick reevaluates current positions
and costs a new block. A channel can exhaust the shield.

Spatial interception prevents the complete packet: damage, silence, slow, stun,
push/pull and damage-derived boss healing. It readies the existing counter once
per participating shield, without creating HP-contact procs. Absorption or
invulnerability returning zero HP damage is not treated as spatial cover.

Cyan rings and a shield marker identify recipients currently threatened by an
active emitted attack but sheltered by solid cover or the projection. The host
publishes the source IDs using the same geometry as resolution, without spending
charges during preview. This is current positional information: movement, another
attack direction or exhausted charges can expose the recipient. The shield's
existing face and pips show direction and remaining blocks.

## Silence feedback

All nonbasic skills were already gated by silence, including subclass/copy/Forge
specials and Return/Ember handlers. This patch makes that state visible:

- Persistent purple status above the local health/skill cluster; independent of
  the four-chip buff limit. It explicitly says basic attacks remain available.
- Every special skill tile and touch button is marked **Silenced** and loses ready
  styling. Normal cooldowns remain visible. Basic attack is unchanged.
- A purple arena ring and crossed speech bubble mark the affected hero.
- Timed silence displays the longest actual remaining duration.
- While an armed applicable pool sustains silence, it says **Leave the antimagic
  pool**. After leaving, the remaining silence counts down, including any longer
  direct-hit silence. The host checks the same radius and flight rules as ticks.

Touch press/release handling remains intact, so held pointers cannot get stuck
when silence starts or ends. The authoritative engine remains responsible for
blocking actions.

## Review and validation

No new resource, upgrade slots or numerical identity rewards were added. Native,
copied and Forge-composed projected guards use the same interception path and
existing class/expiry ownership checks. Ordinary/Honed charges and geometry stay
unchanged. The new decisions are facing a threat, gathering behind its finite
shadow, moving out of local hazards, and managing successive beam ticks.

Focused World tests cover the last-charge party packet, riders, ordinary tall/low
cover, nearest shields, invalid ownership/state/aim, flank/edge exposure, torus
seams, beam movement/depletion/healing, local-impact bypass, preview nonmutation,
authored emitted abilities, silence expiry and zone sustain. Existing projected
shield tests cover native/copy/Forge and per-shot behavior. The real desktop/320px
browser smoke now includes emitted-wave protection, remote cover state, Beholder
Disintegrate feedback, touch readiness, sustained pools and expiry recovery.

Local delivery checks: **4,572 tests in 177 files pass**, with 98.01% branch
coverage (98% floor), 99.42% statements and 99.76% lines. Final TypeScript/build,
lint, formatting, catalogue/recharge checks and the 1280px/320px browser smoke
pass. Screenshot review also verified that the phone silence notice clears party
health. These checks establish the listed contracts; owner testing remains the
playability gate.

After owner live testing, resume **Battlemaster's two identity purposes**, then
Totem/Monk findings, remaining nature/caster/support reviews, whole-system tuning
and the dedicated visual revamp. See [development status](DEVELOPMENT_STATUS.md).
