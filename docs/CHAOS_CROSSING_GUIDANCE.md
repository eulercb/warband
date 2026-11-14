# Chaos Crossing: steer the spell

Historical initial delivery (#176), merged and tested. The owner found guidance
interesting and requested broader kit coverage. See the superseding
[Tides, Phase and Fortune follow-up](CROSSING_TIDES_FORTUNE.md) for the current rules.

The owner accepted Grand Warding's escape follow-up (#175). This resumes the
remaining caster finding from [the purpose review](CASTER_PURPOSE_REVIEW.md):
Chaos Crossing's collection of movement, healing, resistance and slow riders did
not establish a coherent playstyle. One bounded GPT-6.1 Sol high review supported
the implementation below. Live acceptance and broad balance remain separate.

## The decision

Launch a projectile special down one lane, then change your live aim to bend its
path while moving. The latest compatible cast can be steered for **up to 1.25s
after launch**, at **180°/s maximum**. There is no target lock, enemy-seeking or
automatic obstacle avoidance. A new compatible launch takes control; older shots
continue along their current headings. Ordinary basics do not take control.

Unbound Chaos stays the preparation/spending alternative: utility → choose an
enhanced basic fan or keep Surge for a special. Crossing instead asks which lane
to launch into and where to guide the spell afterward. Using the same aim for
steering and later attacks creates an attention trade-off. Allies retain their
own targeting and movement; only the owner directs their shots.

Crossing's previous extra movement, Phase range/control resistance, Bend healing,
Ward movement and special slow riders are removed. Native skills, ordinary/Honed
upgrades, individual skill grands, Spell Weave and Unbound remain intact.

## Every first pick and layer value

Starting Meteor supplies the complete full-health, lone-boss route with Chaos
Surge, Tides, Bend or Ward first: Mirror/Phase prepares Surge → launch Meteor →
change aim while moving. A hit, injury, add or second rare pick is unnecessary.
Chaos Surge also supplies a guided fan; Tides, Bend and Ward keep their simple
native jobs rather than gaining disconnected fallback bonuses.

- Meteor retains its explosive impact, Surge's enhanced shared damage budget,
  and Extinction's damage/blast/freeze. Empowered Meteor, Focus and Surge can
  shorten charging below a host tick without erasing the post-launch window.
- Chaos Surge preserves its fan offsets; guidance turns the shared central
  heading instead of converging six bolts onto one target. Focused Chaos and
  Honed speed/damage retain their ordinary uses.
- Bend still prepares Fortune and Surge; Loaded Fate still rewards a later
  direct hit. Crossing neither adds healing nor spends Fortune by steering.
- Wild Ward still prepares Surge and supports its field occupants. Its individual
  grand remains protection; Crossing does not relocate it or add another movement rider.
- Mirror, Phase and Spell Weave keep their preparation, defense and direct-hit
  refund jobs. Guiding a projectile neither generates resources nor counts as a hit.

The rejected mid-wind-up Blink idea loses its opportunity when upgraded Meteor
charges faster than a host tick. Post-launch steering keeps its useful timing
through fast-cast builds. No damage is converted or withheld, so the delayed-damage
premium rule does not apply.

## Exact delivery and conflicts

One shared cast record controls the fan heading once per world tick. Shots retain
speed, damage, blast, pierce hit history, remaining range and lifetime. The clock
is not charged once per bolt, and steering does not clear earlier hit IDs.
Existing cover collisions, ground/aerial damage rules and torus wrapping remain.
A close hit can end the opportunity early; the window is not guaranteed to last
1.25s when no shot survives.

Returning shots keep their existing path controller and cannot also carry
guidance. An Aperture ends guidance on a transported shot so the conduit's exit
heading remains authoritative. Other surviving shots in the fan may still steer.
Zone-impact copies guide the vehicle and execute the existing impact once; no
new zone, contact or Surge twin is introduced. Existing no-zone-twin rules remain.

Downing, class changes, source replacement, scene transitions and expiry release
surviving shots into ballistic flight. Released steering does not resume after
recovery or restoration. Owner/cast records stay private; public snapshots carry
only the active steering cue, remaining time and spell label.

## Readability and copies

A launch emits `STEER SPELL`. Active shots show an open ring and heading arrow;
the caster has a persistent **Steering [actual spell] · time** label and a matching
ring. These disappear when the spell becomes ballistic. The same cues travel
through host snapshots and remote interpolation. Keyboard, controller and touch
use their existing aim input; there is no new button.

`guidedShot` is a rigid, nominal **24-value** Forge component, subject to the
usual delivery pricing. Only positive-damage nonbasic projectile deliveries fit;
turn rate and duration do not scale with Honed, Haste, Surge or Forge magnitude.
Actual retained copies work without Wild's passive or Surge. Unsupported kinds,
basics and returning shots lose the effect and its description.

The identity applies to compatible starting specials and bound Wild projectile
skills. Actual native/graft/Forge eligibility is checked: if no compatible receiver
remains, the identity stays banked and cannot be equipped until one returns.
No generic numerical rider masquerades as preserved guidance. Resolved descriptions
state the live-aim decision, window and latest-cast rule.

## Verification and playtest

Focused World cases cover every first pick, Surge twins, fan widths, maximum
ordinary/fast-cast builds, latest-cast replacement, owner isolation, expiry and
lifecycle, speed/travel/pierce preservation, cover/torus paths, composed impacts,
Aperture entry, actual synthesis and earned-bank eligibility. Existing caster
build tests now distinguish a banked incompatible identity from an equipped one;
Bend tests retain Fortune rather than expecting Crossing's removed healing.

Browser checks select the actual grand, prepare/cast using keyboard or touch,
turn with real pointer/stick input, observe host/remote cues and the persistent
spell label, and verify expiry. Native first picks and actual retained synthesized
copies are included, alongside the existing caster grand-selection cohort.
CI schedules guidance with the shorter movement/nature browser group, preserving
the existing timeout instead of extending the already larger caster job.

Local release verification passed 5,068 tests in 189 files. Coverage: 99.41%
statements, 98.03% branches, 99.67% functions and 99.74% lines. The ten steering
browser cases and existing desktop/phone caster-grand cohort passed. Build, lint,
formatting, final TypeScript, catalogue/recharge audits and CI-completion contracts
also passed. Screenshot inspection led to a regression check against stray arc
connector lines and a viewport-bounded spell label on phone.

For live testing, fire Meteor along the edge of cover and turn your aim after
launch. Compare a quick hit with a longer shot; try Chaos Surge's fan and an
upgraded fast Meteor. Check whether steering is readable and useful without
making subsequent aiming feel frustrating. Turn strength/window are prototype
values for owner feedback, not a claim of equal identity power.

After acceptance, next development is the **Light/Life support identity review**,
then Devotion, Vengeance and Valor. Broad numerical/progression/graft comparisons
and the dedicated visual milestone follow the identity work.
