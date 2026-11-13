# Caster purpose review: reclaiming ground

**Follow-up:** [Escape and reclaim](WARDING_ESCAPE_FOLLOWUP.md) supersedes the
ground-only, arrival-only and silence restrictions below after owner testing.

This review follows owner acceptance of Land transplantation (#173). It inspects
Abjurer, Draconic and Wild Magic against the combined-build gate. Inspection,
implementation and live acceptance are separate states; this is not a balance pass.
One bounded GPT-6.1 Sol high review informed the decisions below.

## Decisions and actual loops

| Pair                        | Decision                                          | Preparation and cadence                                                                                                                             | Payoff routing and opportunity cost                                                                                                                                                                                       |
| --------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Abjurer A: Grand Warding    | Adjust, implemented here; live acceptance pending | Hold Blink for a threatening field or spend it immediately for escape/frontal guard. A successful paid Blink removes one eligible field at arrival. | Aim the fixed travel toward a field's center, reclaiming shared ground. Spending mobility now sacrifices a later escape. Existing barrier/cleanse growth supports occupying the reclaimed position.                       |
| Abjurer B: Binding Dominion | Retain as control exploitation and growth         | Nova sets up controlled basics; Bind sustains control; positive direct hits on controlled foes generate Binding Ward with its existing recovery.    | Choose control coverage and follow-through instead of removing hostile ground. Wider/longer Nova and controlled damage support this existing loop. Door/heal riders are numerical support, not new behavioral identities. |
| Draconic A: True Dragon     | Retain for live comparison                        | Mirror/Phase prepares Surge; spending Meteor activates Ascent even with no Wings pick. Longer flight changes the time available to cross hazards.   | Cross ground hazards while airborne; a shield also covers attacks that reach flight. Wings remains a longer independent flight source, not a mandatory first pick.                                                        |
| Draconic B: Wyrm's Pursuit  | Retain for live comparison                        | Basic slow prepares a controlled Meteor/Chromatic follow-through.                                                                                   | Keep pressure on the selected controlled victim; Wings adds hard-control resistance. The conditional-damage portion is supporting growth, not a newly invented behavior.                                                  |
| Wild A: Unbound Chaos       | Retain                                            | Utility prepares Surge/Weave; decide whether the basic fan spends Surge or preserve it for Meteor/subclass strikes.                                 | Choose a quicker aimed fan versus the heavy-special delivery. The extra bolt shares the enhanced total budget. Bend's stronger weakness and Ward growth support the route.                                                |
| Wild B: Chaos Crossing      | Needs revision; next design task                  | Current movement/resistance/healing/slow riders do not create a coherent new preparation/spending loop.                                             | Existing useful numbers do not establish distinct routing. No replacement is implemented or accepted here.                                                                                                                |

All four first picks in each inspected subclass retain a full-health, single-boss
starting-kit route. Abjurer's Ward, Bind, Door and Transfer all retain Nova →
direct hit → Binding Ward; the new dispel always resides on starting Blink.
Draconic's Breath, Wings, Chromatic and Scales retain Mirror/Phase → surged Meteor
→ Ascent. Wild's Surge, Tides, Bend and Ward retain utility → direct hit → Weave
and the basic-versus-Meteor Surge choice with Unbound. No adds, second rare pick
or genuine injury is assumed. Crossing's availability does not resolve its purpose.

## Grand Warding's new action

Blink dispels **one entire active hostile ground field** whose **center** is
within **110u of the actual wrapped arrival**. Choose nearest center, then lower
entity ID. This removes that field's remaining lifetime; it does not carve a
local hole, create a safe bubble, or provide continuing immunity.

Eligible fields have damage, slowing or silence. Player fields, airborne fields,
arming telegraphs, obstacles and terrain are excluded. Merely clipping the edge
of a huge pool does not qualify. Boss wind-ups, channels, cooldowns and future
casts continue normally. Previously applied debuffs expire normally; field
removal is not an additional cleanse. Silence can prevent initiating Blink.
Normal mobility restrictions, recharge and cast costs remain authoritative.

The host outlines the selected field and marks its center while the Blink is
available. Host snapshots carry only target geometry; peers draw the same choice.
Successful removal produces a collapsing blue outline and `DISPELLED` cue.
The outline identifies an existing removable hazard, not a protected area.

Blink retains one frontal damage block for 4s. This supplies useful full-health
solo value against bosses without persistent fields, where the new dispel itself
has no target. Removing a shared field benefits allies occupying that ground;
it does not grant them the caster's block. Two casters resolve against the
remaining world state and cannot remove the same zone twice.

### Layer value

- Ward: reclaim ground, then occupy it behind the existing barrier. Honed still
  improves burst/radius/duration; Reversal changes enemy spacing. The cap-sized
  native barrier does not gain fictitious protection above the shared cap.
- Bind: erase an opposing pool before occupying the protected cage. Roots and
  Sanctum Prison retain their existing jobs; no duplicate root rider is added.
- Door: its endpoint exchange and Guarded Door stay separate. Only starting
  Blink gains dispel; copying Door does not import the identity.
- Transfer: reclaim a position at full health, then support its recipient.
  Grand Warding retains amount headroom on Transfer's smaller barrier; Rescuing
  Transfer still needs actual low-health recovery.
- Maximum ordinary/Honed ranks and individual grands do not multiply removals.
  Grand Warding's existing barrier duration/amount and Transfer cleanse remain.

This differs from flight's personal ground bypass, Champion's directional
interception, Fiend's temporary cover and Land's movement of its own field.
The main tuning risk is deleting a large long-lived pool for one mobility use.
The center requirement and one-field limit are deliberate bounds; owner testing
and later encounter comparisons can tune the action without replacing it with damage.

## Copies, grafts and actual Forge synthesis

`dispelField` is an explicit **40-value, rigid component** fitting nonbasic Blink
only. Decompose/recompose, boon refresh, delivery fitting, description and seeded
synthesis preserve the priced action. Its radius and field count never scale.
A retained copied Blink works without the Abjurer passive. Invalid deliveries
and basic-slot copies lose the component and its wording. No hidden flat-field
payload bypasses the retained component list.

A Forge-altered starting skill that is no longer Blink receives the existing
numerical recipe fallback and adapted readout. That fallback does not preserve
the new dispel action. Native Dimension Door remains unchanged.

## Bramble Spear wording

“Ordinary splitting adds more spears” referred to Splintering Thorns adding
projectiles alongside Bramble Spear. It was not another grand bonus. Removed that
redundant sentence; the grand still adds two pierced foes and +30% damage against
already controlled targets. Splintering Thorns retains its actual +1-thorn recipe
and resolved randomized counts. The catalogue editorial check now catches the phrase.

## Verification and owner playtest

Focused World tests cover every Abjurer first pick, paid casts, nearest/tied
fields, exclusions, torus seams, real silence/root/stun gates, preserved debuffs
and enemy clocks, two owners, native layers, copied execution and actual seeded
Forge synthesis. Production browser checks use GrandManager, keyboard and phone
touch, Host/snapshot interpolation and the actual renderer; they verify the
selected outline and successful removal with frozen setup/readback.

Local release verification passed: 5,020 tests in 188 files; coverage 99.40%
statements, 98.04% branches, 99.63% functions and 99.73% lines. Build, ESLint,
formatting, final TypeScript, catalogue and recharge audits passed. The ten new
desktop/phone cases and existing caster/nature grand cohorts passed.

In play: equip Grand Warding, aim Blink toward a live pool center, and compare
its outline with the field that disappears. Try overlapping pools, a boss's
pending attack, and a no-pool encounter to check the retained frontal block.
Try Door separately: it still exchanges enemy positions without dispelling.

Next development is **Chaos Crossing's coherent gameplay redesign**, followed by
any resulting caster follow-up and the five remaining support identities. Broad
balance/progression/graft tuning and the dedicated visual milestone follow the
identity work. None of these retained or implemented decisions claims equal power.
