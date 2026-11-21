# Identity, ordinary boon and graft choices

The reward-choice pass adds **480 matched fights** across Champion,
Land, Hunter and Fiend. It asks what changes when the player spends one
actual character pick on one card instead of another and whether that
choice depends on the equipped identity.

```sh
node scripts/measure-fixed-encounters.mjs --reward-choice
node scripts/measure-graft-acquisition.mjs
```

The first command scans 512 seeded reward histories per profile. It
starts at cycle zero with the chosen first skill, no rerolls, and up to
four ordinary intermissions. Before the first shared offer it favors
the native option, then the first other non-graft boon. Once both cards
appear, it saves the history and branches the one character pick. This
occurred in 38 Knight, 36 Druid, 413 Ranger and 387 Warlock histories.
These counts describe co-offers under this policy. The separate
[graft acquisition panel](DRUID_AND_GRAFT_BALANCE.md) measures the chance
to see or take a graft and follows reclaims and reseating.

Each profile uses the first six shared-offer histories and six separate
arena seeds. Prior boons and generic upgrades are identical at the
decision point. Both identities are tested solo and with the same Life
cleric partner. Identities are equipped before the fight to isolate the
role of the decision, without modeling when the player earned them.

## What the pick changes

Each boss result pools the two identities and is out of 24 fights per
reward choice. Each number includes six solo and six duo fights per
identity.

| Lead                       | Reward choice   | First boss clears | Second boss clears |
| -------------------------- | --------------- | ----------------: | -----------------: |
| Champion                   | Impenetrable    |         Dragon 22 |             Lich 0 |
| Champion                   | Field Medic     |         Dragon 22 |             Lich 0 |
| Land                       | Thorned Grasp   |          Troll 24 |            Lich 20 |
| Land                       | Borrowed Anthem |          Troll 24 |            Lich 10 |
| Hunter                     | Volley          |         Dragon 22 |             Lich 9 |
| Hunter                     | Barbed Rain     |         Dragon 22 |            Lich 12 |
| Fiend, ordinary spacing    | Deepening Hex   |         Dragon 24 |            Lich 21 |
| Fiend, ordinary spacing    | Searing Rebuke  |         Dragon 24 |            Lich 15 |
| Fiend, approach for Rebuke | Deepening Hex   |         Dragon 24 |            Lich 23 |
| Fiend, approach for Rebuke | Searing Rebuke  |         Dragon 24 |            Lich 21 |

- **Champion.** Field Medic traded Shield Wall for a heal. Across both
  identities it reduced party downings from eight to zero, with the
  same number of Dragon clears. Taunt still supplies the Unbroken Champion
  projection. Both choices stalled on Lich, consistent with the
  [damage attribution pass](LICH_COMBAT_ATTRIBUTION.md).
- **Land.** Borrowed Anthem took away Entangle. With each identity the
  loss was visible against Lich even with the same Life partner. Thorned
  Grasp remained the stronger pick for these encounters.
- **Hunter.** Barbed Rain gained three Lich clears with the Life
  partner. Neither choice could clear solo. Dragon clears were even.
- **Fiend.** The close-pass policy deliberately steps into Rebuke range
  when its recharge is nearly ready and Hex is unavailable. Searing
  Rebuke use rose from 14 to 98 casts across both identities and its
  clear gap narrowed. Keep both values. A ranged pilot alone would
  understate the close-range choice.

These are conditional combat results for a player facing the two cards
together. They do not rank every build or justify altering graft offer
rates.

## Repairs

- **Impenetrable.** Once Shield Wall reaches four blocks and eight
  seconds, another rank spends the existing ordinary recharge budget.
  Canonical ranks three, four and five have 16s, 14.4s and 12.96s base
  recharge at neutral stats, with the same guard duration and charges.
  The normal effect recovery floor still applies. The matched rerun changed
  one rank-four Unbroken Champion Dragon duo from a clear to a timeout,
  with the other seven rank-four outcomes unchanged.
- **Graft offers.** A replacement card now names the old ability and
  shows the incoming ability and its resolved stats for the current
  kit. The old card could advertise a Fireball for a Forge replacement
  that actually healed. Native, procedural and Forge tests cover the
  display.
- **Aperture eligibility.** Replacing Blessing disables earning or equipping
  Infernal Aperture. Previously it could spend a grand credit and occupy the
  identity slot with no receiving skill. Already-earned copies stay in the
  bank and can be equipped when Blessing is reclaimed.
- **Graft grand descriptions.** Lingering Curse and Rousing Chorus now
  explain the duration and recovery tradeoff. Their former flat
  recharge promises ignored the effect-duration floor.

**Next** is a focused graft-grand and identity compatibility pass. A Field Medic healing
zone can receive a grand that adds direct-heal magnitude, and a Hex
composed as an ally buff can receive a grand for a damaging field.
Check the actual effects before each is offered, and verify Ancestral Relay
and Grand Tactician when the native receivers are replaced. Then start the visual
prototype, followed by the visual production and boss encounter revamps.
