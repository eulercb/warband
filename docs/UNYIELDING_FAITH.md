# Unyielding Faith: a recovery window

The owner merged and tested the Relentless Vengeance tuning in #188. This
delivery addresses the next open support finding, Devotion's Unyielding Faith.

## How it plays

Divine Shield and Aura of Protection start a Bulwark that protects every eligible hero. The first qualifying hit
for each living hero inside the aura puts half of its HP damage on a three-second timer,
capped at 25% of the recipient's maximum HP. The rest applies immediately.
Divine Shield's invulnerability, frontal blocks and absorption resolve first.
A hit that costs no HP leaves the charge ready.

Heal before the timer ends. Healing pays the pending amount before restoring
HP, so a small heal can avert the deferred damage without moving the HP bar.
Any unpaid amount comes out of HP when the timer expires. It already passed the
original defenses and does not trigger another block, immunity check or
retaliation. Players can see the ready charge or the pending amount and timer.

One ally’s hit leaves everyone else’s protection available. Stay in Bulwark to
catch your own first hit, or use it alone after the immunity window ends. The HUD
shows the pending damage and countdown and warns when it would be lethal. A bright
countdown ring marks the recipient in the arena.
The wound stays on its recipient after leaving or replacing the aura, and
downing clears it before any revival. One recipient cannot stack pending
wounds. Overlapping ready auras choose one source in player ID order.

## Kit and implementation

This replaces the old nearby weakness, proactive melee counter, heal haste,
suppression, ward and cleanse riders. Covenant of Steel gives a frontal block
and counter choice. This route changes when a received hit is paid and when to
spend healing. Projected Guard, Reflection and Living Refuge operate earlier
through contact or movement, while Faith starts once a hit reaches HP.

Every Devotion first pick has Divine Shield and Lay on Hands. Smite can help
sustain a follow-up, Sacred Weapon trades the remaining Bulwark for Pursuit,
Bless offers another heal, and Aura of Protection offers a second way to start
Bulwark. Existing aura replacement rules still apply. Ordinary ranks improve
availability or payload. Unbreakable's frontal blocks defer the opportunity
until a hit reaches HP. Unbroken Circle keeps its control protection, and
Blessed Hands continues to use actual HP for its rescue threshold. Heals keep
their normal target selection. Dedicated heals, field ticks, Renewal, potions
and regeneration pay the pending wound. Repayment cannot also fund overflow
absorption or count as HP restored.

The bounded Sol 6.2 High review supported this approach over automatically
transferring damage or moving an ally. The owner merged and tested #189, liked deferral, and asked for independent
protection and clearer feedback in crowded fights. This follow-up gives each
ally one charge from each activation and keeps the existing damage cap.

The Bulwark effect carries a rigid 32-value Forge premium. Native and reworked
readouts show the retained behavior, and the synthesis test casts a real
composed receiver. A build with no retained Bulwark can bank the identity
until it can use it.

## Playtest and next step

Try letting Shield's invulnerability absorb the opening hit, then take a
follow-up inside Bulwark. Compare using Lay on Hands immediately with saving
it until a wound appears. In co-op, try taking a group hit, then check that everyone has an independent countdown. A party hit and an overlapping second aura also have
focused engine cases.

This follow-up is bundled with [Battle Rhapsody](BATTLE_RHAPSODY.md).
Whole-system tuning, acquisition and grafts, and the visual milestone follow.
