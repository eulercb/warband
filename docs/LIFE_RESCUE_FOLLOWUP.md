# Font of Life: independent skill charges and group Sanctuary

Accepted: the owner merged and tested #182. The stock-free, independent rescue
rules below remain current. Ceaseless Mending's separate purpose follow-up is now
[living refuge](CEASELESS_LIVING_REFUGE.md); its implementation awaits acceptance.

The owner merged/tested #181 and liked the revival idea. This follow-up removes
its dependency on shared revive stock and gives the two skills separate charges.
The original [delivery note](LIFE_RESCUE_FONT.md) records the historical rules.

## What changes in play

**Sanctuary** can rescue every downed ally inside its field when the first body
triggers consumption. **Blessed Bloom** rescues one downed ally. Each has one
independent attempt per owner per encounter. Using either does not prevent the
other from rescuing later. Both can rescue their caster, even in solo play.
Neither needs or spends shared revive stock, including in hardcore with zero
stock left. Normal manual revivals keep their existing stock rules.

The whole healing field is consumed at claim. Sanctuary captures its eligible
cohort together, at its actual center/radius; late entrants cannot join the
consumed field. Bloom prioritizes the oldest downed body, with stable ID ties.
Both exclude bodies already receiving another Font rescue, so overlapping fields
do not double-channel a body or waste a second charge on it.

Recovery takes three seconds at the normal single-reviver rate and restores 40%
maximum health. Nearby players can help through the existing cooperative speed
and minimum time. A valid Font completion is free even when helped manually or
when normal stock runs out during the channel. The spent attempt is not refunded
if recovery fails. Further casts retain normal healing but cannot rescue again
with that skill family during the encounter.

The captured body must stay inside the fixed footprint (including body overlap).
Owner downing preserves prepared aid; owner death/disconnect, class/source loss,
target death/removal and leaving the footprint cancel their affected channels.
Switching classes does not replenish charges. Original field expiry does not
shorten an already claimed three-second channel. Victory, forfeit and hardcore
deadlines remain authoritative. All-downed defeat waits only for a valid rescue
that can actually finish before its channel and bleedout run out.

## Copies, Forge and readouts

The ability and its paid component retain explicit Sanctuary/Bloom provenance.
Copies moved to another slot or class keep that profile. Multiple copies share
the original owner's family charge; they do not provide extra rescue attempts.
When the grand is newly applied to a compatible receiving field, a base-skill
field receives the area profile and a subclass field the single-ally profile.
Existing provenance is retained instead of overwritten by its destination slot.

Actual synthesis/recomposition retains only one deterministic paid Font profile,
requires a positive healing-ground receiver and values it once at the existing
rigid 48. Scaling does not multiply charges or recipients. No price rebalance is
claimed; free group rescue is stronger and remains subject to live playtesting.
Native and composed readouts state the recipient count, separate attempt and
stock independence. The ready field label distinguishes “all” from “one”; claimed
body markers, fixed footprints and recovery progress replicate to clients.

## Scope decision and verification

One bounded Sol 6.1 high review supported this correction. Ceaseless Mending
remains purpose-open: its readiness, movement, flight and suppression riders need
a coherent action review. It is deferred because this patch already changes
shared revival accounting, simultaneous recovery and portable skill budgets.
Adding another identity system would complicate feedback on the requested fix.

Focused tests cover both charge orders, four-body Sanctuary, single-body Bloom,
finite/zero unchanged stock, manual help at zero, same-update manual exhaustion,
overlap/late-entry behavior, class/slot copies, deterministic Forge profiles,
actual synthesis and existing cancellation/terminal boundaries. Desktop and
320px phone scenarios use real keyboard/touch casts with zero stock for solo
Sanctuary, Bloom, two-companion Sanctuary and a synthesized field outside Life.
Support-grand selection and focused Shield Wall/Dimension Door regressions check
the shared support/recovery presentation. Full tests, unchanged 98% coverage
gates, lint, final TypeScript, build, formatting and generated audits are required.
These checks establish the listed contracts, not balance or owner acceptance.

Next development after live testing is **Ceaseless Mending's purpose review**,
then Devotion/Vengeance/Valor, broader tuning/acquisition/grafts and the dedicated
visual milestone. See the [current roadmap](DEVELOPMENT_STATUS.md).
