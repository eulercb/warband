# Druid comparisons and graft acquisition

This batch adds 264 matched Druid fights to the all-class matrix, for
1,554 fights across five lead classes and ten subclasses. It also adds
a seeded benchmark for receiving a graft and progressing it once owned.
The [longer graft comparison](KNIGHT_AND_LONG_GRAFT_BALANCE.md) extends
the installed-graft results beyond the original four-stop window.

## Druid as lead

Run `node scripts/measure-fixed-encounters.mjs` from the repository root.
The Druid cases use Troll and Dragon, six seeds, and solo or Knight duo.
Moon binds Dire Maul. Land compares Healing Spring with Wall of Thorns.
Each uses no identity and both identity choices. Wall also compares a
single Thorned Grasp rank with Borrowed Anthem replacing Entangle.

The controller moves into claw range for Moon, aims native directional
fields from a distance that can place them on the target, and moves
to wounded allies before placing centered Healing Spring. For Eternal
Season it presses the cooldown recast when a live field can reach a foe
or wounded ally that its current location misses. Successful recasts are
recorded separately from casts that place new fields.

| First pick     | Identity or ordinary choice      | Troll clears, median clear | Dragon clears, median clear | Field transplants |
| -------------- | -------------------------------- | -------------------------- | --------------------------- | ----------------: |
| Dire Maul      | No identity                      | 12/12 · 40.0s              | 12/12 · 53.0s               |                 — |
| Dire Maul      | Primal Avatar                    | 12/12 · 37.7s              | 12/12 · 50.1s               |                 — |
| Dire Maul      | Feral Swiftness                  | 12/12 · 39.9s              | 12/12 · 52.1s               |                 — |
| Healing Spring | No identity                      | 11/12 · 65.4s              | 10/12 · 73.8s               |                 — |
| Healing Spring | Wrath of the Land                | 12/12 · 60.4s              | 11/12 · 70.1s               |                 — |
| Healing Spring | Eternal Season                   | 11/12 · 65.4s              | 10/12 · 73.8s               |                34 |
| Wall of Thorns | No identity                      | 12/12 · 55.1s              | 12/12 · 60.4s               |                 — |
| Wall of Thorns | Wrath of the Land                | 12/12 · 49.5s              | 10/12 · 55.2s               |                 — |
| Wall of Thorns | Eternal Season                   | 12/12 · 53.2s              | 12/12 · 60.4s               |                42 |
| Wall of Thorns | Eternal Season + Thorned Grasp   | 12/12 · 42.8s              | 12/12 · 54.2s               |                29 |
| Wall of Thorns | Eternal Season + Borrowed Anthem | 11/12 · 61.7s              | 11/12 · 69.7s               |                13 |

Primal Avatar spent 724 total seconds in form versus 600 with no
identity and 588 with Feral Swiftness. The close-range controller
exercised form uptime more directly than Feral's extra claw reach.
A moving boss and a wider approach are needed to compare that extra
reach. Land exercised transplantation with both first picks, and the
Wall route provides the stronger clear profile in these arenas. Keep
the values for now. For the graft comparison, retaining Entangle and
upgrading it cleared more trials than replacing it with Inspiration.
This is the cost of that swap in this setup. Different team support or
positioning can change which ability is worth the slot.

## What graft acquisition measures

Grafts replace a skill. A reward choice can introduce healing, mobility,
or control to a build while taking away a skill the player already uses.
The benchmark asks three questions:

1. **Can players find and afford the choice?** Record offers and
   pickups separately. Compare taking the graft first with prioritizing
   a specific native upgrade when both are offered. A normal reward room
   has one character pick. The chance of a hybrid card appearing is
   shared among eligible grafts and styles.
2. **Does the replacement remain useful and upgradeable?** Compare the
   resolved skill before and after installation and verify the displaced
   native-only upgrade leaves the pool. Check whether donor upgrades
   appear and improve the replacement currently equipped. Compare
   an installed graft with a native upgrade in combat where appropriate.
3. **Can the player undo the choice and return to it?** Take a real
   reclaim offer and verify the old skill returns with its upgrades.
   If the graft appears again, re-equip it and verify its own upgrades
   return with it.

Run `node scripts/measure-graft-acquisition.mjs`. Each tested class and
graft pairing uses 2,048 seeds and four ordinary reward stops. The script
uses the production offer rollers in reward-room order. The acquisition
comparison starts without owned upgrades. The lifecycle comparison
starts with one native rank and the graft installed and prioritizes
donor upgrade, reclaim, and reseating in that order, when offered. It
skips other character picks to isolate the sequence. These are chosen policies. The estimates apply to the four-stop window,
without paid rerolls, class additions, or the final reward bank.

| Recipient and graft    | Replaces       | Graft-first acquisition | Native-first acquisition | Donor upgrade in installed sample | Upgrade then reclaim | Upgrade, reclaim, reseat |
| ---------------------- | -------------- | ----------------------: | -----------------------: | --------------------------------: | -------------------: | -----------------------: |
| Knight, Field Medic    | Shield Wall    |                   14.0% |                     6.0% |                       1,413/2,048 |            533/2,048 |                 10/2,048 |
| Ranger, Field Medic    | Rain of Arrows |                   17.5% |                     7.2% |                       1,408/2,048 |            539/2,048 |                 14/2,048 |
| Druid, Borrowed Anthem | Entangle       |                   16.5% |                     6.7% |                       1,392/2,048 |            539/2,048 |                 16/2,048 |
| Knight, Warlock’s Hex  | Shield Bash    |                   12.6% |                     5.2% |                       1,413/2,048 |            533/2,048 |                 13/2,048 |

The complete cycle rarely fits in four stops, even starting with the
graft installed. The tested reclaims and reseats restored the correct
progress in every case that completed them. Continue into longer
reward histories before changing offer rates. A useful swap need not
be competitive in every build, but it should be attainable in its
intended role and its replacement cost should be apparent.

### Corrected multiclass graft replay

A Knight can have Field Dressing in A2 while their Cleric kit has
a grafted Fireball in the same slot. Previously, the shared history
could apply a Field Dressing healing upgrade to the Cleric's Fireball.
Graft upgrades now match the donor class and donor slot of the graft
present in each kit. The regression checks both previews and a real
class swap. The existing reclaim and reseat paths still preserve each
skill's progress.
