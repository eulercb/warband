# Grand Warding: escape and reclaim

The owner merged/tested #174, liked the dispel, and requested airborne fields,
fields left behind, and a silence escape. This follow-up supersedes the eligibility
and silence limits in [the caster review](CASTER_PURPOSE_REVIEW.md). Chaos Crossing
waits until this focused follow-up is tested. One bounded Sol 6.1 high review
supported the contract below; this is not an overall balance pass.

## What changes in play

Blink now removes one active harmful hostile field you are leaving, including
an airborne field. If you are not in one, it retains the arrival rule: the field's
center must be within 110u of the actual landing. It removes the entire selected
field, not every overlapping field or every field crossed by the teleport.

The shared preview/execution selection gives departure threats priority:

1. A silencing field that currently reaches your departure body.
2. Another harmful field reaching your departure body.
3. A ground field under a flying caster, which can still be reclaimed for allies.
4. A field centered within 110u of arrival.

Within a priority, nearest center wins, then lowest entity ID. Departure uses the
same body overlap as hazard ticks, with torus wrapping. A ground silence pool
beneath a flyer does not outrank an airborne threat hitting that flyer. Player
fields, expired fields, arming effects, terrain and obstacles remain excluded.
The existing outline/center marker identifies the one selected field.

This gives solo Mage a useful response to pools placed under their own feet.
Co-op players can also erase a pool endangering an ally at arrival, but cannot
clear both their departure and the ally's arrival with one cast. The frontal
block, ordinary upgrades, barrier support and Life Transfer cleanse remain.

## Silence escape and its cost

Only Blink carrying the actual retained `dispelField` payload can be initiated
while silenced. On successful teleport it clears the caster's silence buffs and
adds **2 seconds to that cast's running recharge and protected recharge floor**.
The extra recovery survives refunds and class swaps. It does not change future
casts' base recharge or repeat when the same held button encounters a cooldown.
An ordinary field dispel without an active silence pays no extra recharge.

Stun, root, active casting, movement restrictions and cooldown gates remain under
normal rules. Failed placement or zero displacement does not remove a field,
clear silence or add the surcharge. Clearing silence does not clear unrelated
slows or other debuffs. A surviving/new silence pool can immediately reapply
silence on its normal tick: there is no lasting silence immunity.

Keyboard/controller HUD and phone controls use host-published capable slots, not
an assumed Mage identity or stale flat flag. The small button says **Break silence**, with **+2s recharge** explained in the
silence banner and ability details; other specials remain marked silenced. The global silence banner
explains the escape exception, and a successful break emits **SILENCE BROKEN**.

The one-field limit also applies when breaking silence. Removing multiple silence
buff sources from the caster does not remove multiple environmental pools.

## Portability and value

The complete action travels with the retained nonbasic Blink component, including
departure eligibility, airborne removal, silence exception and conditional cost.
It works on a copied Blink without importing the Abjurer passive. Ordinary Blink
copies and incompatible deliveries gain no exception. Native, resolved and Forge
descriptions state the conditional cost; changed Forge deliveries name the absence
of dispel/silence escape instead of promising a behavior they cannot execute.
An exchanging Blink copy can adjust its landing around bodies/cover: it previews
departure selection only, then resolves any arrival selection at its actual legal
landing. A failed exchange never grants a dispel or silence cleanse.

The rigid component's provisional Forge value rises from 40 to **56**, reflecting
the expanded escape action. Radius and one-field count still do not scale. Actual
seeded synthesis, rather than only round-trip metadata, is included in validation.

## Counterspell decision

An endpoint counterspell is a plausible **separate upgrade choice**, but is not
added to Grand Warding here. Hazard removal, silence escape and cancellation of
committed boss attacks would give one mobility cast too many unrelated payoffs.
Also, cone/area telegraphs can represent physical attacks; their geometry alone
does not identify a spell eligible for counterspelling.

A future prototype should define eligible abilities, actual affixed geometry and
real boundary crossing (rather than blinking anywhere within a large arc). It
should share Thought Break's 8s enemy interruption recovery and compete for the
same one-removal opportunity, so it cannot erase a field and cancel an attack
for free. Current boss wind-ups/channels and their telegraphs remain unchanged.

## Verification and live test

World tests cover every first pick, real silence-pool ticks, airborne and departure
selection, flyer priority, wrapped body overlap, multiple silence sources,
conditional recharge/refund/swap behavior, failed composed placement, repeated
held input and surviving-pool reapplication. Component tests cover both control
surfaces and authoritative capability removal. Real browser checks select the
identity, use keyboard/touch input, replicate host state, draw the selected field,
and verify field removal, the silence-break cue and exact conditional recharge.
Existing defense/recovery cohorts were reviewed because their HUD is shared;
Shield Wall and Dimension Door passed on desktop and phone. The twenty new
browser cases passed. Local release verification passed 5,037 tests in 188 files;
coverage: 99.40% statements, 98.04% branches, 99.66% functions, 99.73% lines.
Build, ESLint, formatting, final TypeScript and catalogue/recharge audits passed.

For live testing, stand in a silence pool and Blink away, then compare recharge
with an ordinary dispel. Try airborne fields, overlapping pools and a pool at
arrival while already inside one. The outlined departure threat should take
priority. Verify ordinary specials remain blocked while the dispelling Blink is
usable; try a no-field boss silence too. Boss wind-ups should continue normally.

After acceptance, next development returns to **Chaos Crossing's coherent redesign**,
then the five remaining support identities. Whole-system balance/progression/graft
comparisons and the visual milestone follow. These tests establish mechanics and
readability; owner playtesting and later comparisons establish feel and tuning.

## CI timeout follow-up

CI run 295 on the original follow-up commit passed lint, TypeScript, unit/coverage,
build and every other browser job. The martial job reported every browser case as
passed, then hit its 15-minute step deadline after the last case reported success. There
was no failed gameplay assertion in that job's log.

The growing serial martial job is now split into three groups: core,
defense, and movement/nature. All thirteen existing smoke commands remain, each
assigned once; desktop and phone coverage and the 15-minute step limit remain.
Groups use separate artifacts, continue independently after a failure, and run at
most two at once. An aggregate keeps the existing **Martial classes (desktop and
touch)** required-check name and succeeds only when every group succeeds.

Validation checked YAML syntax, exact command partition, artifact uniqueness and
the aggregate dependency. Existing CI-completion automation tests and final
TypeScript passed. Browser cases were not rerun locally for this workflow-only
change; the failed CI log already records all of them passing. After push, the
existing completion action reports the fresh GitHub result without chat polling.
