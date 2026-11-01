# Aperture: reliable placement and temporary cover

PR #150 is merged and live-tested. The owner found Infernal Aperture interesting,
but reported two concrete gaps: unreliable placement near arena cover and too
little practical use in open arenas. This follow-up implements both corrections.
Fiend remains under live review; the idea's reception is not acceptance of the
finished firing loop or evidence of equal identity balance.

## What the player does now

Aim Blessing toward a useful firing lane. The entrance and exit seek nearby clear
positions if either authored mouth intersects cover. In open space, a small
infernal barricade appears between them. Shelter behind it and feed shots through
the entrance; they emerge beyond the barricade. An approaching enemy walks around
it, giving the player a reason to reposition, reuse or abandon the lane.

The barricade is an honest **96u-diameter circle**, matching the engine's circular
cover collision model. It blocks physical shots from **both** sides. Only the
owner's existing portal route bypasses the gap; allied shooters can move through
or around it. Players, downed allies and charmed adds cross freely and are never
pushed out of this cover. It protects a position rather than granting damage
reduction or general invulnerability: committed area attacks, cones, beams and
other nonprojectile effects retain their normal rules.

This remains useful with every Fiend first pick. Hurl and base blasts use the
lane; Pit and Hex establish curse territory; Claim keeps its immediate aimed
cursed-target detonation; Resilience supports staying at a firing position.
The one fresh-press Ember remains available, including on copied/Forge kits
without another projectile. Original cooldown, recovery, shared hit tokens,
range cost, finite conduit transit and Return-before-Ember priority are preserved.

## Placement that matches real arena geometry

Each mouth first tries its original position, then deterministic 12u rings with
16 aim-relative directions, out to **108u**. Legal pairs minimize total squared
displacement with stable tie ordering. Full mouth clearance includes static cover
and other owners' active barricades. The entrance remains in front of the caster's
muzzle, the exit remains forward, and the pair retains at least half the authored
reach between them. The locked exit heading does not acquire or home onto a foe.
Actual positions are shown immediately.

A 48u prototype search was insufficient: generated arena obstacles have 40–74u
radii, and a 24u mouth needs clearance beyond that radius. The final 108u bound
can clear those real boulders while staying local. Exit repair can extend the
nominal endpoint within that bound, capped to half the arena's short side. This
is a declared placement repair, not free attack reach: the **actual** skipped
distance is charged to the projectile's original range and takes its normal
`distance / speed` in time. A displaced lane may require a different entrance aim;
markers show the result rather than silently aiming attacks at the boss.

If no legal nearby pair exists, an existing usable aperture is preserved. Without
one, Blessing/the copied delivery still resolves and supplies its normal-duration
**Ember-only window**. HUD and touch say “No clear portal lane”; nonexistent mouths
are not drawn or used. A fresh press still fires the supplied aimed shot. A
completed composed cast is not refunded or replayed, which would duplicate its
healing, movement or damage. This is a bounded crowded-geometry fallback; it does
not pretend that every packed map can contain two clear mouths.

## Cover placement and lifecycle

The barricade tries the midpoint of the resolved mouths and then a bounded 24u
nearby search. It cannot overlap static cover, another barricade, a hostile body,
a totem, or any owner's active portal mouth. If none of those positions fits,
**the mouths still open without a new barricade**. Existing arena cover can then
serve the same sheltered-firing purpose. No actor is displaced to manufacture a
new obstacle.

There is one barricade per owner. It lasts exactly the aperture's remaining
window, up to 6s; replacement, expiry, owner downing/death, class departure or
source-contract loss remove it. It is stored on the owned aperture state rather
than inserted into the persistent `World.obstacles` array. This prevents the
arena's universal collision/prediction rules from turning it into an allied
movement obstruction. Only public circle geometry is replicated; source objects
and cast tokens stay host-only.

A hostile teleport or new spawn landing inside the circle dissolves it instead
of ejecting the actor. A body pile-up or impassable corner also fails open rather
than creating a new permanent enemy pin. An already admitted projectile retains
its frozen transit when the gate/cover expires, under the existing lifecycle
rules; pending transit still cancels on owner/source loss.

## Actual approach and collision behavior

The existing enemy engine pursues a quarry directly; adding a universally solid
obstacle alone would leave enemies pushing into it. This patch adds a bounded
local detour for temporary barricades:

1. Sweep the intended movement step against the expanded circular footprint.
2. Choose a deterministic left/right route, keeping that side while it works.
   Sideways and initial outward movement are allowed.
3. Check every candidate step against static cover and other barricades while
   preserving movement speed, roots, stun and forced-movement ownership.
4. If neither side is clear, or the actor makes no progress for 0.35s, dissolve
   the obstructing barricade. Other arena navigation remains unchanged.

Normal boss/add pursuit and Whispers' local movement use this behavior. Charmed
allies pass through. Hostile knockback/pull sweeps stop at contact instead of
crossing in a large timestep; player shoves keep their normal movement. Boss
charges clip both their actual path and path damage at cover. Their preview shows
the current obstruction while preserving the locked direction and target; when
no barricade blocks the path, unrelated charge previews retain prior behavior.
A barricade expiring during a wind-up no longer protects that path.

Both the ordinary projectile path and aperture's swept path include the new
cover. A shot before entry can be absorbed, a routed shot travels through the
conduit, and outgoing physical shots still obey collisions after exit. No new
crit roll, duplicate projectile, hit reward or numerical damage rider is created
by the barricade.

## Forge, value and presentation

Cover is part of the existing `infernalAperture` effect component, not a hidden
unpriced runtime bonus. Initial utility value increases from
`30 × duration / 6` to **`54 × duration / 6`**, plus Ember damage. Forge's duration
scaling therefore scales both conduit and cover lifetime; fixed circle size and
normal component fitting/caps remain shared with native and copied skills.
This is an explicit initial utility estimate awaiting playtesting, not measured
balance evidence.

Native and generated descriptions disclose adjusting mouths, temporary cover,
physical-shot collision and the space requirement. The renderer draws the exact
circular footprint with an expiry fade, distinct from a damaging zone. Existing
directional mouths remain visible; Ember-only fallback draws neither cover nor
fake mouths. Broader character/skill art remains on the separate visual roadmap.

## Verification and scope decision

Actual World tests show a boss and an add walking around the circle, allies
crossing without displacement, roots/stun, hostile shove and charge contact,
clipped charge previews, area attacks still landing, and crowded-route dissolution.
Placement cases cover deterministic repairs, standard 40/60/74u boulders, torus
seams, full crowding, old-lane preservation and multiple owners. Existing native,
Forge/copy, shared-slot, travel-time and provenance regressions remain in force.
The desktop/320px Chromium smoke now checks open-arena cover absorbing enemy fire,
a routed hit, and a repaired near-obstacle exit with a successful outgoing shot.

Local verification passes: 4,366 tests across 172 files, all coverage gates,
production build, typecheck, lint, formatting and inventory/recharge replay.
The existing desktop/phone smoke now exercises both owner-reported failures.
GitHub CI remains separate; its completion action reports the outcome without
agent polling.

Keep this separate from Great Old One. Placement, enemy movement and temporary
terrain need their own live judgment before another identity's mechanics are
added. After this retest, the next development task is **Great Old One's duplicate
suppression and native Surge role**, followed by the remaining martial/nature/
caster/support reviews, whole-system tuning and the visual milestone.
See [development status](DEVELOPMENT_STATUS.md).
