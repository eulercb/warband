# Living Refuge expulsion

After playtesting #183, the owner asked for Sanctuary to work against flying
enemies and to create room even when cast under a boss. The living refuge now
blocks hostile entry during travel, including flight. If an enemy starts inside,
or arrives inside by teleport or spawn, it is eligible for an outward shove on
the next combat update. Allies can cross and attacks can reach inside.

The shove travels over time. It clears existing roots when it starts and keeps
flight intact. It honors explicit forced-movement immunity. It prefers the
shortest outward route and checks other angles when arena cover obstructs it.
If every route is blocked, it retries while the refuge is active. Ongoing
knockback or Battlemaster steering finishes before Refuge starts its own shove.
The refuge keeps its 4s and 180u caps and one active boundary per owner.

With Consecrated Bastion, starting an ejection deals one extra field damage tick
to each foe the field can normally damage, at most once per foe per cast.
Ordinary field ticks still apply on their original cadence. The extra hit is
the price of trading inside time for room to recover. It uses normal damage
rules, so native Bastion still damages grounded enemies. A copied or synthesized
refuge with its own compatible field damage follows the same rule. A
damage-free Sanctuary gains displacement alone.

One bounded Sol 6.2 High review considered a damaging band outside the roots.
The single-tick rule keeps the payout tied to the ejection and avoids adding a
second range to learn. Sustained damage for keeping a foe inside remains a
distinct benefit of ordinary Bastion placement.

Try casting under a grounded or flying boss, then try with Consecrated Bastion.
Pay particular attention to ejection near pillars and how much breathing room
the new version creates compared with Font of Life. The next development step
is the Devotion, Vengeance and Valor purpose review, followed by broader tuning,
acquisition and grafts, and the visual milestone.
