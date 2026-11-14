# Light/Life purpose review: protect a recipient, return a shot

The owner merged/tested #178 and accepted Phase departure casting. This begins
the planned support identity review. One bounded GPT-6.1 Sol high reviewer
compared Light/Life’s actual starting kits, passives, all first picks, ordinary,
Honed and individual grands against the recent identity work. No review fan-out
was used. The review covers both subclasses; implementation deliberately focuses
on one mature Light change rather than four new systems at once.

## Findings, without a completion claim

| Identity          | Decision and remaining finding                                                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dawnbreaker       | Retain useful control exploitation/growth: Smite slow → controlled Light strike, plus Sanctuary movement. It is not a newly distinct behavioral identity.                                         |
| Endless Radiance  | Replace its disconnected leech/cleanse/resistance branches with a recipient-bound reflective halo. Keep Smite suppression as supporting growth. New action implemented, owner acceptance pending. |
| Font of Life      | Recovery ground is useful, but grove + mitigation + haste + caster healing + leech lacks a unifying decision. Purpose work remains open.                                                          |
| Ceaseless Mending | Rescue preparation and field movement work; Preserve flight and Reproach suppression remain another rider collection. Purpose work remains open.                                                  |

Twenty-one of 24 subclasses have been inspected. This establishes findings, not
21 accepted identities. Native passives, sound simple skills, Honed profiles and
individual grands remain intact. The Life follow-up is the next development
step after this delivery’s live test; Devotion/Vengeance/Valor follow it.

## Endless Radiance: new decision

Before: cast Blessing for ordinary protection, suppress with Smite, then use
Light strikes for leech. After: watch an incoming volley, identify Blessing’s
actual weakest-health recipient, and time a halo before a shot reaches them.
One shot reverses direction and allegiance; the party can exploit its returned
lane. Spending Blessing now competes with saving protection for a later volley.
No ally is moved, and the boss’s committed telegraph is not retargeted.

Starting **Blessing** retains its **35 absorption for 4s** on the actual
lowest-health recipient. A **real positive barrier gain** also grants that
recipient **one projectile reflection for 4s**. Light **Warding Flare** grants the
same reflection on its actual barrier recipient. These are alternative sources;
a live halo neither stacks charges nor refreshes when another barrier succeeds.
Equal/stronger/capped pools cannot secretly prepare a new halo without a gain.

The first positive hostile projectile physically reaching the recipient reverses
velocity and becomes friendly. The same vehicle keeps its speed, hit/blast
geometry and remaining lifetime/travel budget. Its ordinary protection and
personal frontal blocks are preserved. Earlier cover, another body or projected
shield contact retains precedence. Swept incoming contact prevents fast shots
skipping a halo. The returned shot can miss, hit cover or expire; no target lock,
free travel extension or guaranteed retaliation is added.

Reflection does not spend during recipient invulnerability. Beams, waves, melee,
zones and terrain do not reflect. A nonprojectile attack can spend the ordinary
barrier while leaving the separate halo available. Unspent halos invalidate with
expiry, recipient downing, or owner loss/downing/class/source change. Two casters
cannot stack charges on one recipient. Separate recipients can each hold one.

Returned damage uses the shot’s captured hostile damage once, subject to the
receiving enemy’s defenses. The borrowed-damage path bypasses player crit,
outgoing multipliers, curses and direct-hit rewards. Hostile slow/on-hit riders
and payload hooks are discarded. It cannot spend Precision, Fortune, Refulgence,
rescue preparation or other direct resources. Disconnecting the reflector removes
ownerless returned shots instead of minting unattributed rewards.

## Availability, layers and honest limits

Every Light first pick has starting Blessing and Smite at full health:

| First pick     | Added role alongside reflection                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Radiance       | Close damage; Dawning Reversal keeps actual outward displacement.                                                                          |
| Guiding Bolt   | Charged ranged attack; Guiding Lance retains pierce and speed.                                                                             |
| Flash of Light | Effective-heal/Refulgence and rescue follow-through after injury; Afterglow retains recovery ground. Heals do not secretly arm reflection. |
| Warding Flare  | Independent full-health barrier/halo opportunity; Flareguard’s frontal block remains another finite resource.                              |

Reflection changes a projectile’s direction/allegiance even with maximum ordinary
ranks. Holy Wrath, Honed, stun and suppression change enemy timing/output; they
do not duplicate it. Exalt develops Blessing’s buffs; Zealotry flight changes
ground traversal. Warding Honed develops reach/time; the halo stays one contact
for 4s. Overheal, rescue bubbles and field overflow do not prepare reflection.

Against Troll or Dire Wolf, there is **no native projectile to reflect**. Smite
suppression and the finite barrier keep the choice playable, but this is a
numerical fallback, not evidence of the new behavioral identity in those fights.
That niche is an explicit limitation and an opportunity cost when comparing
Dawnbreaker; this patch does not claim universal encounter coverage or equal power.

Every Life first pick remains playable: Sanctuary supplies full-health healing
territory/overflow and dedicated Heal supplies Abundance’s overheal barrier.
Bloom develops territory; Cure relays effective healing only to another injured
ally; Preserve grants nearby absorption; Reproach supplies a close stun. These
facts establish availability, not a coherent new purpose for both Life identities.

## Alternatives and overlaps rejected

Generic aim-lock would usually do nothing: cones, circles, charges and projectiles
already snapshot aim; only beams track. Mind already reveals/reserves upcoming
aim. Retargeting to a false point repeats Whispers’ quarry. Reflecting cones,
beams and melee into a new burst converges on Hellish Rebuke, Shatter or Scales
retorts. A projected frontal reflecting screen repeats Champion geometry.

The halo instead belongs to the warded body, needs no facing, and redirects a
live shot rather than deleting it. It is separate from Fiend’s physical cover
and Phase’s relocation of a later attack origin. Moving Life fields was deferred
because Pilgrim Bloom and Land transplantation already occupy nearby decisions.

## Forge and visibility

`reflectWard` is a **rigid 32-value component**, requiring retained positive
absorption on a nonbasic self/ally buff delivery. Decompose/recompose, delivery
fitting, pricing, caps and refresh preserve that contract. If synthesis removes
the barrier or uses an incompatible delivery, reflection and its text disappear.
Actual multi-donor synthesis is tested, not just a flat flag or round-trip.
A retained copied ward works outside Light without Refulgence. Selection retains
its normal budget: an orphan reflection is not given a free absorption payload.

The actual recipient displays a gold halo with a countdown arc and **Reflect 1**
readout. The shot visibly turns and gains a friendly gold return outline, with a
brief successful-reflection cue. Host snapshots/client interpolation carry the
recipient and returned-shot states. This is additional support readability,
not the deferred overall visual revamp.

## Verification and next gate

World checks cover every first pick, true weakest recipient, cap/equal barriers,
Warding/Blessing charge sharing, swept high-speed contact, earlier cover/body/
projected shield, personal guards, invulnerability, expiry, owner cleanup,
nonprojectile protection, borrowed damage, returned blasts and actual Forge
synthesis. Browser cases use real keyboard/touch input and actual Lich projectiles
for Blessing, Warding, ally targeting and synthesis on desktop and 320px phone.
Existing support-grand and shared defense/recovery cases are regression checks.
Coverage thresholds remain 98%; build/lint/final TypeScript and catalogue/recharge
audits are release gates.

Final local verification: **5,134 tests in 191 files passed**. All unchanged
98% coverage gates passed: statements 99.38%, branches 98.02%, functions 99.64%,
lines 99.73%. Production build, ESLint, final TypeScript, formatting, catalogue/
recharge checks, workflow parsing and CI-completion contracts passed. The eight
new desktop/phone reflection cases, existing support-grand cohorts and focused
Shield Wall/Dimension Door defense/recovery cases passed.

Live-test the actual selected recipient and a volley with several shots: one
reflection should not imply whole-volley immunity. Compare a ranged boss with a
nonprojectile encounter and report whether the limited niche merits this choice.

Next development: **Life’s coherent identity follow-up**, then
**Devotion/Vengeance/Valor**, whole-system balance/grafts/progression and the
visual milestone. See [the development roadmap](DEVELOPMENT_STATUS.md).
