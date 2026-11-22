# Visual and ability revamp

Give players enough information to predict what a skill will do from its shape,
motion and timing, then confirm what happened from its impact. Fire should have
a readable moving body and ignition. An arrow should have a shaft, a flight
direction and a distinct hit. Lightning can connect its entire strike path in a
single instant. Review each skill for the behavior its fantasy communicates,
including simple deliveries that already fit.

## Production order

1. Start with Lightning Bolt. Compare its aim, reach, contact width, cover and
   multi-foe handling with the rendered strike. Review ranks, grand choices,
   grafts and Forge together. Test it in solo and in an overlapping party fight.
2. Build a representative player and alternate form, one summon, and readable
   mechanics for attack, healing, barriers and control. Test at desktop and
   phone scale, including crowded status cues. Check silhouettes, facing,
   movement and attack animation, damage confirmation and hazard overlap.
   Apply the treatment across class kits and stable shared assets in cohorts.
3. Establish reusable terrain, cover, obstacle and zone cues with representative
   arena art. Match apparent edges and directional tells to actual targeting,
   whether the effect is ground-bound, airborne, body-bound or placed.
4. Produce bosses, summons, arenas, arena events and associated skill effects
   alongside the [encounter redesign](BOSS_AND_ENCOUNTER_REVAMP.md). Start with
   one complete encounter, test timings and safe routes with provisional art,
   then finish the visuals once the encounter's main decisions hold up.
5. Resume the [balance pass](CLASS_BALANCE_COVERAGE.md) against the new versions.
   Keep evidence for geometry or timing changes that could shift power and use
   the existing seeded comparisons to check solo, role composition and full parties.

For each delivery record the original action, the player expectation, the
actual hit and timing rules, and what the player sees before, during and after
the effect. Check equivalent upgrades and composed variants, and use gameplay
footage or live playtesting to catch effects that read poorly in motion.

## Lightning Bolt pilot

Aim down a line through the boss and its summons. The strike applies on cast
along an 820u path from the release point, 28u wide at base. Solid cover,
including temporary Aperture cover, ends both damage and the visible path.
A jagged bright core shows the discharge and fades in under half a second.
A Forge blast or field carried by the strike resolves at the first enemy
contact, where the visible path also ends.

Conducting Lance widens the whole strike to 48u. A broader line makes moving
or side-by-side enemies easier to catch, including a single moving boss.
Honed and Evoker identities keep their existing controlled-target bonuses
and setup interactions. Forge can use lightning as a priced delivery and
combine it with direct-hit riders. Steering and returning effects require
travel time and are excluded from this delivery.

The timing and ability to pass through multiple targets are intentional
power changes. Revisit their value with the redesigned encounters. A fork
or sky strike would add a different targeting decision and can be evaluated
on a skill or upgrade that needs it.

## Lightning release and impact

The initial prototype proved that the hit and the visible line used the same
path. Its simple double-stroke flash and generic cast/impact cues were a scope
choice. Pixi already supports animated rigs, layered geometry, lighting, pooled
particles and authored sprites. The production work is building distinct poses,
silhouettes, timing and effects that hold up on a phone and during overlapping
party effects.

The follow-up adds a directional casting snap, a bright core with a secondary
arc, local contact sparks and short cosmetic recoil on rigged targets. Cover
now gives a small endpoint spatter. The release and visible contacts come from
the resolved strike. Damage, hit timing, movement and boss actions stay the same.

A fork was considered for a later variant focused on choosing a lead target and
routing damage through a group. A sky strike would instead reward placement on
a predicted position. The aimed line rewards lining up enemies and reading
cover, so it remains the visual baseline after the owner's playtest. Next, use
the release-and-impact approach on a representative player/form and summon and
contrast a traveling projectile with this instant cast.

## Mage and Lich skeleton pilot

The Mage has a collared mantle, split cloth panels that trail lateral motion,
and a crystalline staff tip. The lightning release moves the existing
articulated grip while the cloth follows the motion. The Lich's actual summons
have skulls, rib cages and weapons, and a damage pulse shifts the skull and
weapon while the feet stay planted. Other add types retain their current
presentation. Arrows have shafts, fletching and arrowheads. Fireballs have a
bright center and a tapered flame. Both retain their existing combat geometry.

The owner accepted the controller handoff and found vertical calibration
helpful. The remaining SN30 Pro button translation is deferred for a future
controls review with actual browser reports from the affected setup.

Preserve the pre-art-slice presentation at `4ebdbee` as the reference for a
future classic-look option. A renderer-only preset later could preserve new
combat rules while restoring prototype bodies and effects. Build it once the
new visual language settles, so it has a clear baseline and the current art
pass does not have to maintain two evolving presentations.

After this playtest, move to a representative alternate form and a player
companion, then compare healing, barrier and control readability alongside
the new character silhouettes.

## Motion and perspective pilot

The skeleton preview revealed the limits of judging a still silhouette. The
raised skull, knees and weapon keep the simulation's existing ground anchor.
Foot motion follows actual travel, the normal melee attack starts a sword
animation, and a stronger hit pose pulls the skull and weapon away while the
feet hold their place. Combat timing and ground geometry remain the same.

Keep the arena camera and aiming projection for this comparison. Try a
three-quarter drawing style on individual actors first, with visible height
and a planted floor shadow. A global tilt would require coordinated changes
to pointer aiming, telegraphs, obstacle edges and wrapped-world rendering.
Consider it only if the actor treatment proves insufficient.

Regular Ranger Arrow and Multishot use the arrow artwork. Returning Shot has
its own directional marker. Mage Fireball uses the flame artwork, while its
basic Arcane Bolt is a different projectile. The additive trails on ordinary
arrows and fireballs are smaller so the projectile silhouettes can show.

After this playtest, compare a larger three-quarter Mage or alternate-form
silhouette beside the skeleton. Use stills at native zoom and moving footage
to check stance, actual hits, and telegraphs in a fight before rolling a style
out to the roster.

Actual game renders from the motion fixture: [desktop](images/skeleton-motion-desktop.png)
and [phone](images/skeleton-motion-phone.png). The struck skeleton is above
and left of the Mage. The second skeleton is beside the Mage in its melee pose.

## Raised Mage and elemental contrast

The Mage’s hood and shoulders now sit above the existing floor anchor. The robe
has a broader collar and a larger trailing motion on release. The pose pulls
the staff up during a charge, follows the casting direction on Fireball
release, sweeps across the body for Nova, and snaps forward for Lightning Bolt.
Nameplates and bars clear the taller hood. Aim, feet and hit placement still
use the same world coordinates.

Fireball is a traveling shot that blooms on combat impact. It layers a warm
core, expanding lobes and embers over the resolved blast. The Frost Nova cue
starts at the Mage and spreads rapidly as an angular ice front with small
shards. The boundary shows the actual hit radius from the first frame, while
the interior animates for readability. The ice art depicts the burst and the
existing slow. Freeze remains an upgrade/status distinction. Arrow and
Fireball trails are thinner so the bodies remain visible in flight.

Frost Nova brings the area-control visual comparison forward into the Mage
batch. The next character comparison is a larger alternate form and a
persistent player companion. That gives us a large body and a small allied
body for evaluating healing and barrier cues amid movement and attack effects.

In-game examples at native viewport sizes: [Frost Nova on desktop](images/mage-nova-desktop.png)
and [Fireball impact on phone](images/mage-fireball-phone.png).
