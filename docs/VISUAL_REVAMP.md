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

## Material effects and independent Mage arms

The owner accepted the three-quarter Mage as the direction for other players.
The current batch keeps the existing ground anchor and gives the Mage a
separate staff hand and free hand. The staff rests upright between casts.
The free hand gathers during the charge, opens during Nova, and extends for
Lightning. Sleeves, visible hands and small gait-driven boots fill out the
limbs while retaining their bend and timing.

The soft-dot particle texture has a 16px radius. The pool previously applied
world-space emission sizes as raw sprite scale, multiplying the visible glow.
The renderer now sizes the texture in world units. The generic cast flash is
also smaller and dimmer. This applies across the shared particle pool and
keeps Arcane Bolt and the other projectile silhouettes visible.

Fireball uses curved orange tongues, embers and a fading smoky underside.
Frost Nova sends out forked blue and white rime facets. Separate pieces of
scorch and rime touch the resolved radius on the hit frame. The material cues
replace the continuous effect outlines for these two friendly spells. The
actual hit geometry and the boss telegraph language stay intact.

Two independent design reviews used the same brief. Sol 6.2 High supplied
concrete timing, overlapping flame tongues, and widening forked rime. Astra
6.2 High proposed making the burst lean with projectile travel, reading frost
as ground fractures, and testing the result in grayscale with a debug radius
visible only during verification. The shipped prototype combines these ideas.
The experiment compares proposals and one implementation. Separate rendered
implementations would be needed to compare the models’ finished visual quality.

After this playtest, bring the three-quarter approach to a contrasting player
silhouette, then use a large alternate form and small companion to check
healing and barriers in motion.

In-game examples: [Frost Nova on desktop](images/mage-material-nova-desktop.png)
and [Fireball on phone](images/mage-material-fireball-phone.png).

## Blink comparison, gait and projectile readability

The owner liked the independent arms and the material-shaped range cues.
The shared particle size correction went too far in playtesting. The new
baseline restores a modest short trail across projectiles and retains
world-space particle sizing. The Lich's shared hostile-bolt art also has a
brighter tip and a high-contrast forked silhouette. The shared trail sets
visibility; individual body shapes identify delivery. Future effects can
override the baseline when their own motion or contrast requires it.

The Mage pulls the free palm inward, braces the staff and settles after the
actual Blink. Two separately rendered variants use the same cast, camera and
animation age. Sol 6.2 High's [shutter](images/mage-blink-shutter.png) contracts
a doorway at departure and opens one at arrival. The Astra 6.2 High-inspired
[facets](images/mage-blink-tiles.png) refit the iris concept into four pieces
that gather at departure and fan from the destination. The shutter is active
during play because the closing/opening contrast makes direction easier to
read in this setup. The alternate remains available to renderer comparisons.
Both are local endpoint cues. The movement, dispel and protection rules are
unchanged.

The gait investigation reproduced a biped that could lift the first foot
continually while the second stayed planted. The rig now gives the opposite
foot priority when both qualify. It also reprojects planted feet through
camera movement, resets the rig on teleport, and ties the Mage's free wrist
to the active footstep. This pass retains the visible bend and lift of the gait.
Remote client interpolation remains a separate presentation check for a
future multiplayer visual pass.

The Mage is a representative pilot, covering a raised humanoid body, walking
and hand gestures, a basic projectile visibility check, traveling impact,
area control, instant line and mobility. A full Mage pass later covers every
remaining subclass, upgrade, graft and stance with the production standards
learned here. After Blink playtesting, prototype a contrasting player, then
an alternate form and small companion with support effects. Boss and arena
production continues alongside the encounter revamp, with balance afterwards.

## Knight and animation timing

**Review model for this batch** — Astra 6.2 High. Sol 6.2 High follows on the
next substantial visual batch. Each delivery uses one reviewer during this
trial, with the implemented result documented for comparison.

The live walk exposed a wider issue than step alternation. The Mage's stance
now follows travel with a bounded turn toward aim. Weapon releases and the
Knight's raised shield can follow the full aim separately. Feet start closer
under raised actors and their forward plant adapts to walking speed. The
upright hip, alternating feet and small knee lift keep the gait animated.
Hand targets stay within arm reach. The raised design currently applies to
Mage and Knight, leaving other silhouettes available as references.

Knight uses a steel visor, broad pauldrons, a blue chest panel and a breastplate.
An actual front guard widens the kite shield and lifts it toward the defended
direction. The narrow resting shield leaves the sword arm readable. The
existing guard cone and block rules still describe the mechanics.

The Mage release poses hold for about 100 ms before easing through a short
recovery. Fireball has a longer reach with the throwing hand, Nova opens the
hand farther to the side and Blink draws it to the chest. Fireball's visual
tail ends at 630 ms and Nova's at 680 ms. Blink's departure and arrival fade
by 340 and 430 ms. The lighter late frames aim to preserve recognition
without leaving extra full-strength footprints. All effects start on their
original gameplay frame. Shared projectile trails gained a small size and
opacity increase, with no change to the Lich bolt's readable body.

In-game examples: [Knight strafing with Shield Wall](images/knight-shield-stride-desktop.png)
and [Mage at 357 ms after Frost Nova](images/mage-nova-recovery-phone.png).
The renderer fixture confirmed both feet lifted during the Knight strafe while
the guard continued to face north. Next, compare Moon Bear and the Beast
Master wolf as contrasting recipients of healing and barrier effects.

## Moon Bear, Beast Master wolf and stationary turning

**Review model** — Sol 6.2 High. Astra 6.2 High is next in the one-model
rotation.

Moon Bear has a raised shoulder mass, broad paws, rounded ears and an ivory
muzzle. The wolf trades that bulk for a tapered tail, pointed muzzle and
raised ears. Paws cycle with actual ground travel, using short heavy steps
on the bear and a faster trot on the wolf. Each pack member keeps its own
trot through wrapped movement. The bear's HP and label clear the raised
body. The existing claw healing stays on the bear. Nature's Bond shows
readiness on the wolf and transfers the barrier to the linked ally when
the bite lands.

A stationary raised hero now turns its foot targets with its smoothed
stance. Short alternating replants catch up with a large aim change while
small movements can stay planted. The travel gait remains as playtested.
Mage cast poses have a slightly longer peak, broader hand movements and
a longer recovery. Lightning keeps the fast bright flash and adds a
faint trace through 510 ms with contact sparks through 620 ms. Actual
cast, hit and movement timing is unchanged.

Mage, Knight, Moon Bear and Beast Master wolf are examples for the art and
motion system. This pass does not finish the humanoid Ranger or Druid
rosters. The production pass should give every damaging basic a recognizable
delivery, pose and impact. Include different projectile shapes and travel
effects, a distinct Knight and Paladin sword treatment, close rogue dagger
cuts, monk strikes, and subclass or hybrid melee such as Ranger, Bard and
Warlock routes. Revisit the Knight's sword carry and other weapon idle,
movement and release poses as those attacks are authored. Test basic
shots at native phone size and under party overlap.

In-game captures from the browser smoke tests:
[Moon Bear claw on desktop](images/moon-bear-claw-desktop.png) and
[Beast Master wolf with Nature’s Bond ready on phone](images/beast-wolf-bond-phone.png).

## Animal locomotion and attack follow-through

The playtest accepted the stationary replant, longer Mage releases and extended
Lightning fade. Carry the same stance correction and readable release/recovery
timing into the roster work.

Idle wolves now have stable follow offsets with a small movement tolerance.
Pack Tactics takes its flank positions from the lead wolf's approach to the
quarry; they follow the quarry as it moves and stay put when the owner circles.
The lead and flankers still share the return route. Slow movement uses short
alternating steps, while a faster run blends into a longer bound with a capped
cadence and smoothed turning. The head and torso keep their volume nose-on and
from behind. Each wolf shows a short jaw snap and recovery on its own bite.

Moon Bear carries more of its weight through its shoulders and hips. Paw lift,
body roll and step length change together. The rear view hides the eyes and
muzzle, and the side view keeps the near eye. The visible forepaw sweeps and
settles on a Moon claw. The claw actually fires with the basic cast, so the pose
starts at that moment and follows through while the ordinary Thornlash travels.
There is no added gameplay delay for the claw or bite.

This follow-up was kept to the two animal issues to fit the available session.
Astra 6.2 High remains next for the first basic-attack cohort.

Browser captures: [Moon Bear claw on desktop](images/moon-bear-swipe-desktop.png)
and [wolf bite on phone](images/beast-wolf-attack-phone.png).

## Basic-attack pilot: Cleave and Arcane Bolt

Astra 6.2 High reviewed this cohort. Cleave uses the live hit geometry for a
soft sector and a steel edge that sweeps across it. The Knight carries the
sword off to one side at rest and rotates sword and hand through the Cleave
while the shield stays on its own arm. The same effect reads the expanded
range and full circle of the grand. Arcane Bolt uses a violet crystal with
a bright facet and two short wakes, including on each bolt in Arcane Barrage.
The silhouette follows the authored basic and its ordinary upgrades.

For Moon Bear and the wolves, the paw cycle now uses wrapped travel direction
independently of the body's facing. Lifted paws advance along travel, and
planted paws move back relative to the moving body. This also covers a bear
walking sideways with aim held on a boss and a wolf retreating after its bite.

The bear's basic now has two overlapping beats. One forepaw releases
Thornlash with a brief green cue. The opposite paw then crosses the chest
with three near-body claw trails. Thornlash and the claw retain their
original combat timing. This pilot covers the basic pair. Other skills get
their own bear poses in the production animation pass.

The next basic-attack cohort should compare Paladin sword work with Rogue
dagger work, then extend the visual separation to the Monk and hybrid melee
kits. Sol 6.2 High is next in the review rotation.

In-game captures:
[Knight full-circle Cleave on phone](images/knight-cleave-grand-phone.png),
[Mage Arcane Barrage on phone](images/mage-arcane-barrage-phone.png), and
[Moon Bear claw follow-through](images/moon-bear-follow-through.png).

## Melee basics and linked grand follow-through

Sol 6.2 High reviewed this batch. The Moon basic now gives Thornlash a
visible foreleg lift, extension and return. The opposite paw then makes
the accepted claw sweep with the same near-body claw trails. An immediate
soft contact flash marks the existing hit, and layered lunar ribbons
follow through across the resolved cone. The sequencing is visual.
Thornlash, the claw and its healing still resolve at their original times.

Cleave reads through a fading steel blade sweep across the actual sector,
without a stroked area border or the old always-on basic aim cone. Whirlwind of Steel drives a full turn of the
Knight's torso, shield, feet and sword while the effect travels around the
full resolved radius. The ordinary cut sweeps for 320 ms before recovery,
with the area effect fading through 580 ms. The grand spends 470 ms on the
full turn. This applies the Mage pilot's separation of a readable peak and
gradual recovery to a melee stroke.

Holy Strike leads with an elevated sword hand and cuts down behind its
separately braced shield. The broader ivory and gold shape distinguishes
it from Cleave. Radiant Riposte shows protection when positive contact
actually arms it. Slash uses short independent dagger motions and two
tapered violet bands. Whirling Blades pivots the Rogue through a full turn
with the daggers spread. Arcane Bolt remains at its current dart and split
wake for now. Its cast and impact treatment can be addressed in the
projectile delivery pass.

### Acceptance criteria from the pilot

- Review the caster pose, launch or swing, contact, and recovery together.
  Give a pose enough displacement and time to read at normal speed.
- Convey the actual hit geometry through the effect. Use a subtle contact
  fill and moving material where useful. Avoid generic stroked boundaries
  for friendly strikes with authored effects.
- Check linked upgrades that change geometry or grant a visible payoff.
  Full-circle attacks need a full-turn pose; on-hit payoffs need a miss
  case. Test the actual resolved range and aim at both normal and phone scale.
- Separate overlapping release poses when needed. Keep effective hit
  timing visible and preserve combat timing unless a mechanical change is
  part of the delivery. Capture live game frames and check motion and
  recovery in addition to the representative stills.

Next is Monk and a bounded batch of hybrid melee basics. Astra 6.2 High is
next in the reviewer rotation.

In-game captures:
[Thornlash paw release](images/moon-bear-thornlash-paw.png),
[claw reach](images/moon-bear-claw-reach.png),
[Whirlwind of Steel](images/knight-whirlwind-turn-phone.png),
[Holy Strike with Radiant Riposte](images/paladin-holy-strike-phone.png), and
[Whirling Blades](images/rogue-whirling-blades-phone.png).

## Character rigs before ability production

Astra 6.2 High reviewed the new order. An attack-only preview cannot show how
a shield braces, where a blade starts or whether the weapon silhouettes differ.
Establish each class's body, equipment, idle carry, locomotion, aim turns and
downed pose first. Use its existing basic and one linked grand to verify how
the body reads during combat. Finish the class's other attacks and hybrid
deliveries against that accepted rig.

The Paladin has a raised gold helm, ivory split tabard, red cloth and a sun
shield on its own arm. The Rogue has a lower hood, short asymmetrical cape and
independent dagger holds at rest and during attacks. Whirling Blades now puts
its trails on opposite sides, aligned with the rotating dagger hands.

Moon Bear releases Thornlash as before. After 220 ms, the server resolves the
claw from the bear's current position using the aim and reach captured on cast.
The paw, area and damage all start on that later beat. Leaving the form before
impact cancels the pending swipe. Radiant Riposte now arms one timed charge on
positive Holy Strike contact. It reduces the next incoming hit that reaches
its defenses by 40% within 2s and retains the separate melee counter. The
shield badge shows readiness and remaining time, and a protection flash shows
consumption. This revision applies to Radiant Riposte.

The remaining rig cohorts are Monk and Barbarian, Ranger and Bard, Cleric and
base-form Druid, then Sorcerer and Warlock. Mage, Knight and Moon Bear remain
references. Finish remaining gameplay effects against these silhouettes before
moving into the paired boss/arena encounter slices. Sol 6.2 High reviews the
next rig cohort.

**Impact alignment criterion.** For every new or revised gameplay effect, verify
when the host applies it, when the active animation reaches the impact pose and
when the effect first shows damage/coverage. A delayed follow-up must deliver
on its own visual beat. Use an earlier cue only for deliberate preparation or
telegraphing, and visually distinguish it from a resolved hit.

In-game captures: [Paladin with Riposte ready](images/paladin-raised-riposte-phone.png),
[Rogue Whirling Blades](images/rogue-raised-whirling-phone.png), and
[Moon Claw impact](images/moon-claw-timed-impact.png).
