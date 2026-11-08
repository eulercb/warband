# Wave Palm — a real Flow payoff at the reach cap

The owner merged/tested #165 and accepted the expanded Flowing Water loop. They
then noticed Wave Palm only said “consumes Flow”. Inspection confirmed a gameplay
hole: authored reach 220u was capped to 200u, so Flow's +30u added nothing. The
skill has no windup to remove. Flowguard's block remained, but Wave's own attack
received no bonus. The pruning exposed the hole; restoring the old reach claim
would have hidden it again.

## Implemented correction

A Flow-consuming cone whose reach cannot increase gains **+40u of its existing
push or pull**, up to 260u. A stronger existing force is never reduced. A cone
with remaining reach headroom keeps its normal reach bonus; a cone with no force
does not acquire a new displacement effect. This is a shared receiving-geometry
rule, not a check for Wave's name, slot or class.

| Receiving Wave                    | Without Flow | With Flow |
| --------------------------------- | ------------ | --------- |
| Base                              | Push 100u    | Push 140u |
| Five Honed ranks                  | Push 150u    | Push 190u |
| Returning Tide                    | Pull 140u    | Pull 180u |
| Five Honed ranks + Returning Tide | Pull 190u    | Pull 230u |

Wave keeps its narrow aimed cone, actual 200u reach, damage, cooldown and normal
force collision. Returning Tide keeps the inward direction. Ordinary Flurry,
Stunning Strike and their grands retain their reach bonus; this does not grant a
blanket force increase to every strike. The accepted Flowing Water movement and
single-contact rules remain. Perfect Harmony and Flowguard remain unchanged.

Force follows existing rules: below 150u it cannot dislodge a rooted enemy; at
150u or above it breaks the root. Base prepared Wave remains below that threshold;
one Honed rank reaches it, and prepared Returning Tide crosses it. Movement
immunity and physical obstacles continue to constrain displacement. Pulls stop
at the caster rather than throwing the enemy through them. A miss still spends
Flow normally; it does not invent a target or refund the cast.

The solo decision is whether to save preparation for Wave's stronger separation
or Tide's stronger gathering, instead of spending it on another strike. In co-op,
this can clear a threatened ally's lane or gather foes; direction still matters
because unwanted pushes can move enemies out of allies' attacks. This is a skill
payoff correction, not a new class-identity claim.

## Readout and copy contract

The concise receiving clause is **“spend Flow for +40u push”** or **“+40u pull”**.
It states only the actual gain; a partially saturated force lists the smaller
remaining gain. At full force saturation it omits the nonexistent bonus.
Runtime and descriptions use one shared calculation.

Native, Honed, grand and copied cones use the same rule. Forge descriptions derive
force from the retained shove component; dropping that component drops this
payoff. Existing Flow/shove fitting, pricing and synthesis budgets remain in use,
with no free copied field or extra metadata. The composed field formatter also
reads radius from its actual retained zone, so its cap calculation uses the
receiving geometry.

## Verification and next development

World casts cover base/Honed/Tide, native and composed, damage/geometry preservation,
roots, movement immunity, copied saturation and accepted travelling contacts.
Synthesis tests check the retained delivery and shove; a catalogue regression
checks that each authored Flow spender still changes its attack through Honed
and its individual grand. Existing desktop/320px Flow-chain browser scenarios
now assert Wave's stronger actual push and its rendered skill readout. Final
local checks are recorded in the PR.

This delivery also completes a bounded [Shadow Monk purpose review](SHADOW_MONK_PURPOSE_REVIEW.md).
Shadow's replacement is not implemented or accepted. Next development is its
focused prototype, followed by remaining nature/caster/support reviews,
whole-system tuning and the visual revamp. See [development status](DEVELOPMENT_STATUS.md).
