# Champion: Unbroken Champion's projected shield

The [martial purpose review](MARTIAL_PURPOSE_REVIEW.md) inspected six subclasses.
This delivery changes only Champion A. Two-move Elder Mind (#156) is merged,
owner-tested and accepted; it is no longer the current development blocker.
Champion's projected shield now awaits owner live acceptance.

## Promise and actual sequence

**Unbroken Champion:** place body and aim between hostile shots and their future
path → intercept with finite shield charges → choose when to leave protection
for a readied melee counter. It adds a physical protective reach rather than
another heal or generic mitigation rider.

**Warlord's Tempo:** challenge → connect a melee hit → spend the counter without
waiting for an incoming hit. Its proactive core is retained. Both identities
still use the actual Knight kit; this does not assert equal comparative power.

Taunt and Shield Wall project a **120u-wide line, 60u ahead**, turning and moving
with the owner. Their existing frontal blocks are the budget: Taunt starts with
one block, Shield Wall with two, for their actual guard duration. A hostile shot
crossing the face spends one block and disappears at contact, readying the
existing +30% melee counter. Body blocks spend the same pool. No charges stack.

Keep the identity's 4s control resistance on Taunt/Shield Wall and 3s on Second
Wind, supporting holding position. Remove its extra 15% leech on Champion
strikes. Earthshaker, Bull Rush and Riposte retain their own simple skills and
individual grands; not every utility or strike needs another identity rider.

## Useful solo and co-op behavior

Every first pick—Earthshaker, Bull Rush, Second Wind or Riposte—has the starting
Taunt/Shield Wall/Cleave route at full health. Neither adds, injury, a second
subclass skill nor an individual grand is required.

Ordinary frontGuard already blocks frontal damage at the owner's body. Projection
is not another owner damage block. It adds off-body/lateral coverage and earlier
contact: sweep a shot while advancing or circling, or protect an ally behind
the shield, including a shot already committed before Taunt. Interception also
prevents that projectile's contact rider: current hostile body resolution applies
chill even when damage was blocked, while the intercepted projectile never reaches
that path.

Against a lone melee/ground-hazard boss, projection adds no new interaction.
The Knight's existing guarded counters and the identity's resistance still work.
It is not a barrier against cones, beams, ground zones, charges or walking enemies.
There is no reflection, extra damage or invented explosion suppression. Current
hostile projectile resolution has no general explosion payload.

## Exact collision and lifetime contract

- The line is a physical segment with rounded contact from the projectile's hit
  radius. Current aim controls it. Rear-going shots, shots already behind its
  face, friendly/zero-damage shots and misses cannot spend projected blocks.
- Swept collision prevents fast shots tunneling through the segment. When a
  projected shield could intercept, the first contact is ordered against alive
  player bodies and cover on the same path. A body reached first takes its
  normal damage/contact riders; cover reached first absorbs without spending
  a shield charge. Competing shields use earliest contact, with stable owner-ID
  ties. This works across torus seams.
- Interception is a guarded physical contact, not fake HP damage. It readies the
  existing single counter state and consumes a live guard window where present.
  It does not trigger absorption, images, lifesteal or HP-damage callbacks.
  A physical interception still spends a charge if the owner has i-frames;
  immunity cannot make the projected shield free or unlimited.
- The owner must be alive, have positive HP, and remain in the class that cast
  the shield. Downing, class changes and expiry stop projection; its public
  geometry is removed. Ordinary body-guard persistence keeps its existing rules.
- Existing stronger-guard precedence remains: a weaker cast cannot add charges,
  downgrade or refresh a stronger guard. A stronger body-only guard can replace
  a projected one; a weaker projected cast does not overwrite a stronger body
  guard. The actual visible guard shows which contract won.
- Impenetrable grows existing block count/duration under its normal caps and
  preserves structural guard metadata. Haste respects duration-based recharge
  floors. Native graft replacement does not inherit the removed skill's native
  identity rider; reclaim restores it.

The shield line is drawn above character bodies, with one visible pip per
remaining block, replacing the body-only guard arc while projected. The projected
badge names the shared block count and interception payoff. Public snapshots
expose geometry but omit source-class bookkeeping; host projection/client
interpolation preserve the visible shape.

## Copy and Forge contract

Projection lives inside the priced `frontGuard` component, including decompose,
recompose, scaling, caps, upgrade reconciliation and descriptions. Its geometry
stays fixed under output scaling and caps at 60u reach / 60u half-width. At full
size it adds 24 internal geometry weight and the existing 8-point counter
contract where not already priced; an existing counter is not counted twice.

A projected guard is a self-on-cast effect supported on any special delivery,
so a copied direct strike can grant it without a donor passive. Ordinary random
basics still exclude guard components. Component-aware resolution prevents stale
flat fields from secretly granting projection after its component is removed.

The equipped Forge identity gives the first and second starting specials this
projection. Existing guards retain their blocks/lifetime; absent guards gain
one/two blocks for 4s. The offer explains this variant. Actual fused kits are
checked with each first pick, including receiving mobility/strike deliveries.
This deliberate identity growth refreshes component data rather than hiding an
unpriced runtime field from future synthesis.

## Verification and next work

Local gates pass: **4,538 tests in 176 files**, branch coverage 98%, statements
99.41%, functions 99.6% and lines 99.76%. Build/typecheck, lint, formatting,
upgrade inventory and recharge audits pass. Projected interception and the
existing six-subclass grand-selection/browser cohort pass at desktop and 320px.

Actual World checks cover all four first picks at full health, off-body and solo
interception, finite shared blocks/counters, ally ahead/behind, ordered cover,
competing shields, fast shots, rounded ends, torus seams, expiry/downing/class
loss, stronger guards, Haste/ordinary ranks, banked/equipped grands, actual Forge,
copy/no-passive, component caps/removal and graft reclaim. Browser smoke on
desktop/320px drives real Shield Wall input/touch and host/client geometry,
observes 2 → 1 → 0 blocks, then a hostile shot reaching the ally after exhaustion.

Owner testing should judge whether the line/pips are obvious, whether interception
is satisfying to aim while moving, and whether its finite coverage offers a good
choice against the proactive Warlord route. Tests do not establish fun or equal
power. Keep the rest of the review's unresolved identities visible.

**Next development after this live test:** Battlemaster's pair, then Totem and
Monk findings; remaining nature/caster/support identities, whole-system power/
reward/graft tuning and the visual milestone follow. See
[development status](DEVELOPMENT_STATUS.md).
