# Ranger balance and ordinary reward availability

This batch expands the fixed-encounter matrix from 552 to **948 fights**
across three classes and five subclasses. It adds Hunter and Beast Master,
an alternate firing-lane policy, and a separate sample of **2,048 reward
seeds per profile and policy**. The [coverage plan](CLASS_BALANCE_COVERAGE.md)
tracks the remaining classes.

## Ranger encounters

Run `node scripts/measure-fixed-encounters.mjs` from the repo root to
reproduce. Ranger uses six shared seeds, Troll, Dragon and Lich, and solo
or the existing Knight partner. Hunter uses Quarry Shot and Beast Master
uses Snare. Both receive matched no-identity/A/B loadouts. Hunter also
compares one and three Volley ranks on Relentless Hunt. The firing-lane
policy holds its standoff when safe, still fleeing live hazards. It
applies equally to all three unranked Hunter variants.

| Hunter policy and identity                  | Troll clears | Dragon clears | Lich clears | Return turns / damage contacts |
| ------------------------------------------- | -----------: | ------------: | ----------: | -----------------------------: |
| Orbit, no identity                          |        12/12 |         12/12 |        0/12 |                              — |
| Orbit, Apex Predator                        |        12/12 |         12/12 |        0/12 |                              — |
| Orbit, Relentless Hunt                      |        11/12 |          8/12 |        0/12 |                       491 / 57 |
| Orbit, Relentless Hunt + one Volley rank    |        12/12 |         10/12 |        0/12 |                       686 / 73 |
| Orbit, Relentless Hunt + three Volley ranks |        12/12 |         11/12 |        0/12 |                    1,052 / 130 |
| Hold lane, no identity                      |         6/12 |          5/12 |        0/12 |                              — |
| Hold lane, Apex Predator                    |         6/12 |          5/12 |        0/12 |                              — |
| Hold lane, Relentless Hunt                  |         6/12 |          3/12 |        0/12 |                      339 / 291 |

Holding the lane substantially increased return contacts but reduced clears
for all three loadouts. Contacts count positive damage events on the return
leg. Piercing arrows can contact several targets, so turns and contacts
are separate counts. Relentless Hunt trails across both policies. The next
diagnostic should compare outbound and return damage separately while using
a short deliberate sidestep or re-aim between boss attacks. That would
assess the cost of lining up a return without treating stationary play as
the intended use. Keep the playtested numbers until that route is exercised.

Pack Tactics started 364 hunts and cleared Dragon 2/12 versus 1/12 for
Alpha’s Fury and the baseline. Against Lich, Alpha’s Fury ended with
59.3% median boss HP versus 70.0% for Pack Tactics. No Lich case cleared.
The hunt count confirms activation. This bench does not attribute separate
flanker damage or distinguish boss pursuit from add cleanup. Keep both
Beast Master choices pending a quarry and add-pressure comparison.

The Vengeance regression walks out of Holy Strike reach, waits for a
fresh press to be available, and tries to re-enter from the same gap.
Relentless closes the gap and strikes. The no-identity and Avenging Wrath
variants need to close it by ordinary movement.

## Ordinary ranks and opportunity cost

Run `node scripts/measure-reward-ranks.mjs`. For each profile, the script
samples four ordinary reward rooms in a five-fight run. It uses the game's
seeded reward-room draw order with three generic offers followed by four
character offers, then claims one card from each pool. Each policy
prioritizes either the target or a named alternative and claims the other
when only it appears. The run replays owned cards for caps and eligibility.
Fresh profiles start with no subclass. Honed and Volley profiles start a
later cycle with two eligible skills already bound and no ordinary ranks.
The final Endless bank, paid rerolls, bots and class additions are separate
from this sample.

| Target                   | Competing pick | Target-first, rank 3+ | Competing-first, rank 3+ |
| ------------------------ | -------------- | --------------------: | -----------------------: |
| Radiant Strike           | Greater Aegis  |                 67.1% |                     4.1% |
| Honed Hunter’s Vow       | Radiant Strike |                 33.6% |                     7.7% |
| Honed Aura of Protection | Merciful Hands |                 32.0% |                     6.2% |
| Honed Bolster            | Rousing Anthem |                 31.1% |                     6.2% |
| Volley                   | Barbed Rain    |                 33.9% |                     7.7% |

A fourth Radiant Strike rank appeared in 25.1% of target-first runs and
0.4% of competing-first runs. A fifth rank cannot be claimed across four
rooms. These are controlled policies, so they describe availability and
what prioritizing a different boon costs under these assumptions.

**Frost Arrows** was the confirmed reward issue. Its slow strength and
duration stop growing after the first application, so additional ranks
could consume a reward for no benefit. It now caps at one. The first pick
works as before, legacy duplicates resolve to the same kit, and future
rolls leave the slot available for other eligible cards. In the new sample,
Frost Arrows was acquired at least once in 99.4% of Frost-first runs and
70.2% of Volley-first runs.

Next, continue the all-class pass with Whispers, Light and Life while
expanding reward comparisons toward grafts and displaced upgrades.
