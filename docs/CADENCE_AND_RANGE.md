# Deliberate recharge and bounded ability reach

Delivery after merged/live-tested PR #132. PR #133 is now merged/live-tested; the
owner reports that the limits feel good. Reassess these bounds after the upgrade
and grand content cohorts replace excess numerical growth. This is the recharge/range foundation,
not the grand selection migration. Existing grand ownership and reward eligibility
remain until the next framework stage.

## Final recharge, including Haste

All non-basic player skills have a **4s final minimum**, after generic Haste,
class upgrades, grands and refunds. Basics retain their 0.3s floor. Each ability
keeps its native recharge reference through grafting and ordered upgrade replay.
Ordinary ability reductions share a budget: no repeated reduction for native
physical recharge up to 6s, 20% total over 6–12s, 30% over 12s. Ordinary class-wide
reduction separately stops at 20%; generic Haste is separate but still cannot
bypass the final floor. These two ordinary budgets can combine; 30% is not a
universal total-CDR limit.

Persistent fields, buffs, immunity, directional blocks, flight, images and hard
control reserve their duration plus **2s recovery**. Wind-up and field arming are
also reserved. A hostile cast slow cannot erase the recovery after actual delivery.
Paladin aura duration includes its existing possible 2s passive extension.
Refund locks decay once per class even while inactive, so a swap cannot erase one.

Exceptions are deliberate: finite absorption bubbles, poison/venom on targets,
soft curse/debuff marks and consumable attack readiness can outlive recharge.
They are not continuous immunity. Existing pet/form stances remain a separate
identity decision. This does not promise that every effect in the game has a
mandatory downtime, nor prevent refreshing another player's effect.

### Compensation and compatibility

- Cleric Heal changes 75/3s → 100/4s: the same un-hasted healing rate. Its existing
  difficulty credit multiplier is retained, likewise preserving that baseline rate.
  Greater Heal adds 38 instead of 28. Field Medic remains 56 HP/5s; its stale text
  is corrected. Haste still helps longer skills but no longer accelerates this heal
  below 4s; this is an intentional cadence tradeoff requiring live support testing.
- Bastion adds 0.6s Taunt duration/rank as well as its protection, rather than
  becoming a repeated no-op once its recharge budget is spent.
- Assassinate keeps its damage/crit improvement. A protected Shadowstep refund
  becomes 15% movement for 2s instead, under the existing 4s trigger gate.
- Shadow Rhythm's blocked mobility refund cleanses roots/slows and gives 1s
  steadfast under its 4s gate; it retains friendly movement buffs.
- Host, tooltips, reward previews, pause/loadout screens and the difficulty
  estimator use the same effective recharge. Estimator coefficients are unchanged;
  actual adaptive encounter difficulty can still respond to changed kit throughput.

Longer field upgrades can lengthen their effective recharge when the duration
floor is binding. They buy more output per cast, not permanent field coverage.
Raw cooldown fields are therefore not the playable recharge. Some legacy grand
flavor copy still describes raw tuning; the numeric live before/after readout is
authoritative until those grands are rewritten in the next stage.

## Geometry within the existing arena

The battlefield remains **1600 × 1000**, with the existing camera and torus rules.
After upgrades and temporary class bonuses, player geometry is bounded to:

| Payload                          | Limit |
| -------------------------------- | ----: |
| Dash/blink travel                |  420u |
| Forward ground placement         |  400u |
| Melee reach                      |  200u |
| Offensive radius / impact radius |  240u |
| Healing/support radius           |  320u |
| Explicit projectile travel cap   |  900u |

Native projectile default travel remains 820u. Direct ally selection is not treated
as a forward-ground endpoint. Component/Forge deliveries receive matching bounds;
composed zone duration is read from its actual component instead of a stale flat
field. The limits keep an individual movement/placement inside the short torus arc,
including crossing a seam. They do not eliminate ordinary wrapping or enemy pushback.

Increasing `World.arena` alone is unsafe: shared torus helpers also use canonical
dimensions. A later arena milestone should parameterize shared geometry, generation,
AI, networking, renderer and camera together, then compare modest sizes such as
1700 × 1100 and 1800 × 1100 on mobile and desktop. Range growth still needs limits
on a larger arena. First test these bounds before changing battlefield scale.

## Verification and limitations

`node scripts/audit-recharge.mjs --check` verifies the committed audit: **6,144
observations / 2,112 deduplicated profiles**, every class/subskill at ranks 0/1/3/5,
with/without currently compatible native grands and with 0/5 Haste. Observed final
recharge is 4–28s. These are catalogue states, not unique abilities or encounters.
The old pilot benchmark manually committed raw cooldowns and is historical; it
must not be cited as a current recharge/DPS benchmark.

`tests/ability-limits.test.ts` exercises production input, protected refunds,
class swaps, slowed delivery, ordinary/grand ordering, native/graft/reclaim,
Forge/procedural seeds, geometry and preview parity. The browser cadence fixture
uses real host input and renderer at 1280×800, 320×568 and 844×390. Existing browser
suites cover the actual menu/editor and touch paths.

Owner playtesting should especially compare max-Haste support, short mobility,
long-duration fields, Forge hybrids and continuous basic attacks. Geometry and
cooldown invariants establish safety, not subjective balance or fun.
