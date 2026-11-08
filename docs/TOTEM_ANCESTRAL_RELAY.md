# Totem Warrior — Ancestral Relay

## Decision and player sequence

The owner accepted Battlemaster's instant group steering (#162). The next bounded
identity finding was Totem B: its shared mitigation and longer field did not give
the player a new decision. One GPT-6.1 Sol high review, followed by one concrete
cooldown/copyability correction, supported Ancestral Relay. Implementation proceeds
under the existing autonomous workflow; owner live acceptance remains open.

Native Rage prepares one stationary ancestor 180u along aim. Whirlwind resolves
at that ancestor if it is within 360u; otherwise it resolves at the player's
captured cast point. Afterwards that cast point becomes the next ancestor.
The preparation persists between recharges. The player chooses where to stand
now to prepare the next strike, and whether to approach the existing station or
replace it with Rage. The body commits to the ordinary Whirlwind windup.

Against one boss: Rage toward it, approach for ordinary contact Momentum, retreat
or Leap to a safer casting position, and send Whirlwind through the ancestor.
The burst leaves the retreat position ready for a later rotation. Against mobile
bosses the player must plan an appropriate station or reseed it. Against adds the
same single burst tests each enemy at its actual centre. It grants no extra burst.

In a party, the existing Spirit Shelter pulse follows the remote burst or Earth
field when Momentum is spent. Positioning the burst can protect a distant ally;
the player receives the pulse only if actually within its 180u radius. The normal
amount, one pulse, 4s lifetime and shared 6s passive recovery remain.

## Resolved kit review

| Layer                                                     | Decision and retained value                                                                                                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Reckless Swing / ordinary attack improvements             | Contact and normal hit-based Momentum; no projected basic attacks.                                                                                                             |
| Rage                                                      | Native identity shortcut prepares a point along captured aim while starting the normal Momentum window. A grafted replacement loses that native shortcut; reclaim restores it. |
| Whirlwind / ordinary damage, radius and recharge upgrades | One burst from the captured station; normal Momentum spending improves the actual burst. No new press or independent timer.                                                    |
| Leap                                                      | Reposition the real body without requiring a hit; it does not teleport the ancestor or grant a remote attack.                                                                  |
| Bear Spirit / its absorption grand / Honed                | Protect a committed cast with ordinary control resistance and frontal blocks. Grand and Honed retain their distinct existing effects.                                          |
| Wolf Spirit / its guard grand / Honed                     | Walking builds Momentum and helps establish the next cast position. Its grand retains its guard; identity does not duplicate it.                                               |
| Earth Totem / field grand / Honed                         | Place an existing slow/damage field; spending Momentum centres the existing Shelter pulse there. Its ally territory and normal upgrades remain.                                |
| Spirit Mend / absorption grand / Honed                    | Recovery and cleansing remain useful simple support; relay does not attach an unrelated reward to this skill.                                                                  |
| A: Great Spirit                                           | Rage's frontal guard → melee counter is the core. Totem guard/control resistance lasts +1s, capped at 8s. Removed unrelated identity leech, hunt duration and field duration.  |
| B: Ancestral Relay                                        | Prepared remote burst → captured body point becomes next station. Removes the old identity mitigation/ward and field-duration package.                                         |

Every first Totem skill has native Rage plus Whirlwind available. The relay itself
needs no hit, kill, Momentum, nearby ally or adds. Shelter still requires Momentum.
Wolf's walking alternative helps but is not required for the remote attack.

This differs from Shadow Reprise's voluntary body return, Aperture's projectile
conduit/cover, Whispers' false enemy targeting and Champion's interception. The
ancestor has no HP, collision, threat, automatic attacks or damage interception.
Rejected additions: projected basics would remove the contact decision; a free
repress attack would bypass recharge; a 14s preparation would expire before the
actual 16.2s Whirlwind recharge. A persistent dormant point avoids that mismatch.

## Cast and Forge contract

Both the strike centre and the body's next-station point are captured when the
cast begins. Aim changes, movement or later reseeding cannot redirect an already
committed burst. Misses and immunity still establish the next station. Downing,
leaving combat, class changes and losing the last receiving skill clear the
preparation; stale source/epoch reservations cannot restore it. Ownership is per
player. The arena uses ordinary wrapped geometry.

`ancestralRelay` is a priced, fitted and capped component on non-basic point-blank
burst delivery. Its reach scales and caps at 120–360u. Targeted Infernal Claim is
incompatible; it cannot silently receive or charge for an inert relay. Component
state is authoritative. Upgrades refresh the component budget representation.

Copied/Forge bursts are self-contained: the first cast bursts locally and leaves
an ancestor at its cast point; a later cast can strike there after moving the
body and waiting for ordinary recharge. Native Rage's aiming shortcut belongs to
the class identity and is not exported as a free utility donor effect. Forge
Barbarian synthesis supplies a compatible burst through ordinary constrained
synthesis and pricing if a generated kit lacks one. Forge wording describes the
self-seeding loop explicitly.

## Presentation and acceptance

A hollow stationary spirit and thin owner link identify the station. The owner
sees the next burst footprint; a committed cast brightens it and marks the
captured next station with a hollow square. Skill controls say “At ancestor”,
“At you · establish ancestor”, or “At you · ancestor out of reach”. Native Rage
says “Place ancestor ahead”. There is no countdown for persistent preparation.
The spirit is not a false quarry or targetable summon.

Automated evidence is recorded in the PR: World casts for all first picks,
full recharge persistence, native/copy provenance, remote damage/support,
miss/immunity, lifecycle, component fitting/pricing/caps, constrained synthesis,
and actual Pixi/remote-snapshot desktop and 320px browser scenarios. Existing
martial grands smoke also checks the renamed identity through registry IDs.
These checks establish contracts, not equal balance or live enjoyment.

Owner test: try Rage → contact Momentum → Leap away → remote Whirlwind, then
rotate around the persistent station. Try all four first picks, Earth Shelter
near a teammate and Great Spirit's guard/counter route. Judge whether planning a
future strike point stays useful against a moving boss and whether the spirit
and cast footprint read clearly during crowded combat.

After acceptance: address Open Hand, then Shadow Monk in bounded deliveries;
continue remaining nature/caster/support purpose reviews, then system tuning and
the dedicated visual revamp. See [development status](DEVELOPMENT_STATUS.md).
