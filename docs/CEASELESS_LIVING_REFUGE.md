# Ceaseless Mending: living refuge

The owner merged/tested #182 and accepted independent, stock-free Sanctuary and
Bloom rescues. Those Font of Life rules remain the accepted baseline. This
separate Life B delivery implements a new purpose for Ceaseless Mending; live
acceptance and balance remain pending.

## The decision

Before: heal a critically injured ally for a stronger next hit, stand in a faster
field, gain flight from a ward, or slow an enemy's wind-up. These disconnected
riders did not establish a coherent behavior.

After: **prepare Sanctuary before enemies close in, then choose which side of
its boundary to fight from**. Grounded hostile bodies cannot cross inward.
Allies cross freely. Enemies already inside can move and leave; after exiting,
they cannot return while the refuge lasts. Casting underneath a boss never
pushes it out. Reproving Blow's existing push can expel a foe and make that
boundary useful afterward, without making Reproach a required pick.

Sanctuary is in every starting Life kit, so all four first picks have a useful
full-health solo route. Co-op allies decide whether to take shelter; the healer
never moves them automatically. Blessed Bloom, Mass Cure, Preserve Life and
Reproach keep their own authored roles rather than acquiring unrelated riders.

## Exact boundaries and limits

The refuge lasts **up to 4s**, within the field's own lifetime, and its radius is
the healing radius **capped at 180u**. Only one refuge is active per owner; a new
qualifying field replaces the old boundary without deleting its healing. No new
button, held-input recast or automatic relocation is added.

Swept collision stops grounded walking, charges and shoves at entry. Existing
charge collision and damage use the stopped path; the attack's timer and authored
width are retained. Projectiles, cones, ground hazards and area damage pass
through. This is bodily exclusion, not a solid cover obstacle or immunity.

A Troll's body stops about 200u from the center of a native 140u Sanctuary. Its
short Smash cannot hit someone at the center, but Ground Slam can. Timing and
position therefore create breathing room without removing the boss's ability to
threaten the party. Flyers cross, including temporary flight. Teleports, spawns
and landings inside are admitted without displacement. Bodies that are already
overlapping the boundary can leave; the refuge never imprisons them.

Walking foes try local detours. In a crowded obstacle pocket they can stop at the
boundary until it expires; the finite four-second boundary and admitted escape
avoid an indefinite pin. This is local avoidance rather than a new global
pathfinder. Live testing should assess whether blocked pursuit is useful without
making melee encounters too passive.

Downing/death, disconnect, source loss, class change, field removal and expired
refuge/field time end protection. The capped boundary has its own visible toothed
ring and countdown when healing extends farther or lasts longer. Snapshots and
client interpolation carry its actual radius, position and remaining time.

Font consumption removes the healing field and therefore its refuge, while its
accepted captured rescue can finish independently. Revival stock, charges and
cohort rules are unchanged.

## Receiving-kit review

| Layer                         | Role alongside the refuge                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Abundance and Heal            | Existing full-health overheal protection and targeted healing.                                                  |
| Hallowed Sanctuary / Honed    | Healing, radius, duration and recharge growth; refuge keeps its 4s/180u caps.                                   |
| Consecrated Bastion           | Damage/slow against foes already inside; early exclusion versus late offensive placement becomes a real choice. |
| Blessed Bloom / Pilgrim Bloom | Existing mobile offensive healing-field niche; no refuge rider.                                                 |
| Mass Cure / Unburdening Cure  | Relay healing and movement cleansing.                                                                           |
| Preserve Life / Life's Vigil  | Barriers and finite frontal blocks against attacks that cross the refuge.                                       |
| Reproach / Reproving Blow     | Existing stun/push, with an optional expel-and-exclude interaction.                                             |
| Font of Life                  | Accepted independent free field rescues; consuming the field removes the boundary.                              |

One bounded Sol 6.1 high review selected this plan. A return-to-field teleport was
rejected for overlapping Assassin's withdrawal anchor. Moving fields overlapped
Land transplantation and Pilgrim Bloom. This refuge differs from Fiend cover:
players and projectiles cross it, it does not eject interiors, and only grounded
hostile entry is excluded. The old readiness/speed/flight/suppression package is
removed rather than retained as incidental strength.

## Forge and selection

A **rigid 40-value refuge component** requires a nonbasic positive healing-ground
receiver without following behavior. Native base healing-ground receivers gain
the identity; optional subclass skills do not. Actual synthesis, copies and
subsequently earned upgrade refresh retain the priced component and ownership
rules outside Life. Duplicate profiles are counted once. Incompatible deliveries,
missing healing zones and following fields lose both the component and claim.
Unsupported Forge kits keep an earned identity banked instead of equipping an
identity with no useful receiver or gaining an unadvertised numerical fallback.

## Verification and next work

World tests cover all four first picks, real Troll pursuit, Smash, Ground Slam
and charge, absorbed/HP damage, normal healing, inside escape/re-entry, allies,
static/timed flight and landing, hostile/converted adds, shoves, swept torus
crossing, detours/crowded pockets, two owners, replacement, cleanup, caps,
composed casts, actual multi-donor synthesis, refresh and eligibility. Dedicated
render checks catch screen-origin connector lines. Browser scenarios use real
keyboard/touch casts, boss pursuit and penetrating area damage on desktop and
320px phones, including party crossing and a synthesized field outside Life.
Accepted Font, support-grand selection and shared defense/recovery/movement
scenarios are regression gates. Full coverage keeps all 98% thresholds unchanged.

Final local verification: **5,229 tests in 196 files passed**. Coverage passed
at 99.38% statements, 98.02% branches, 99.58% functions and 99.72% lines.
Lint, final TypeScript, production build, formatting, generated catalogue/recharge
checks, workflow parsing and CI-completion tests passed. Eight refuge and eight
accepted Font browser scenarios, support-grand selection, Aperture/Battlemaster
movement and focused Shield Wall/Dimension Door cases passed on desktop/phone.

Next development after live testing: **review Devotion, Vengeance and Valor**,
then whole-system power/ordinary upgrades, acquisition and graft tuning, followed
by the dedicated visual milestone. See [Development status](DEVELOPMENT_STATUS.md).
