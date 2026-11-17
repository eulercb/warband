# Font of Life: prepare a place for recovery

Historical #181 delivery, merged and tested. The owner liked the revive idea
and requested separate skill charges, stock independence and group Sanctuary.
See [Life rescue follow-up](LIFE_RESCUE_FOLLOWUP.md) for the current rules;
shared-stock and owner-wide single-charge rules below are superseded.

Reflection reliability (#180) was merged, tested and accepted. This delivery
implements Life A's purpose follow-up; owner live acceptance remains pending.
Ceaseless Mending (Life B) remains useful growth with its purpose finding open.

## The decision

Prepare Sanctuary or Blessed Bloom where a teammate might fall. If a downed body
is inside, the entire field is consumed to begin a normal three-second revival.
The caster can be that teammate, so this works in solo play and with every Life
first pick: Sanctuary is always available. Preparation is useful at full health.
The living caster can continue fighting elsewhere while the field tends the body.

There is one shared rescue attempt per owner per encounter, across both skills,
copies and class switches. Claiming the body spends the attempt immediately;
cancellation does not refund it. A normal revival restores 40% maximum health and
uses one normal shared revive stock on completion. No stock means no rescue.
Nearby players can assist through the existing cooperative revive rate and cap.
This is not an instant save, teleport, extra life or Phoenix replacement.

The consumed field leaves a fixed, visible footprint. The body must remain inside
its radius (including body overlap) for recovery to continue. Its captured channel
can finish even if the original field would have expired during those three
seconds. Owner downing preserves prepared aid; owner death, disconnect, class
switch or loss of the exact granting ability cancels it. Target removal/death,
leaving the footprint and exhausted stock also cancel it.

Ordinary all-downed defeat waits only for a valid claimed rescue with enough
channel and bleedout time left to finish. Victory, explicit forfeit and the
hardcore deadline remain authoritative. Simultaneous fields cannot reserve more
rescues than available stock or claim the same body. Oldest downed bodies take
priority, with stable player-ID ties and field creation order.

## Scope and portability

The old Font collection of heal-created groves, mitigation, haste, caster healing
and leech is replaced by this single behavior. Native skill healing, area,
duration, recharge, Honed profiles and individual skill grands remain intact.
Ordinary heals and their recovery groves are not extra font carriers.

Font is a rigid component valued at 48, retained only on non-basic, positive
healing ground fields. Actual multi-donor synthesis and subsequent earned-upgrade
refresh retain the behavior. Unsupported receiving kits keep the earned identity
in their bank but cannot equip an identity with no valid receiver. There is no
unadvertised numerical fallback. Native, copied and Forge descriptions state the
shared attempt, field consumption and normal revival cost.

One bounded Sol 6.1 high review informed this delivery. A remote healing origin
alone did not create useful full-health solo preparation. A manual delayed-heal
reserve risked becoming an optimal double-tap numerical heal and required new
health-history restrictions. Neither candidate is implemented. We deliberately
leave Life B for a separate purpose review rather than adding two new systems.

## Readability and verification

Ready fields display a hollow seed/cross marker and “Rescue font · 1”. Claiming
consumes the healing field, draws sparse brackets around its captured footprint,
and shows a brighter body marker plus recovery percentage. Snapshot/client views
carry the fixed footprint and progress without exposing host ability references.
Every independent drawing path starts explicitly to avoid screen-corner lines.

Tests cover actual authored boss damage, all four first picks, solo and party
recovery, stock/co-revival, cancellation, deterministic claims, deadline/terminal
outcomes, native and composed casts, eligibility and component/readout contracts.
Desktop and 320px phone browser scenarios use real keyboard/touch casts for
Sanctuary, Blessed Bloom, a remote party rescue and an actually synthesized field
outside Life. Shared support-grand selection, Shield Wall and Dimension Door
regressions are checked separately. Full coverage retains the repository's 98%
gates; this does not establish equal power or replace owner live testing.

## Next development

After this live test, review **Ceaseless Mending's purpose**. Then review
Devotion, Vengeance and Valor; proceed to whole-system power, ordinary upgrades,
acquisition/graft tuning and the dedicated visual milestone. The authoritative
sequence is [Development status](DEVELOPMENT_STATUS.md).
