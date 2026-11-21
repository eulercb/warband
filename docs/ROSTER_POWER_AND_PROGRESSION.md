# Whole-roster power and progression

The corrected 4,458-fight class matrix established representative coverage
for all 24 subclasses. This pass adds **864 matched progression fights** with
one lead build per class and **288 Ranger policy fights** that isolate spacing
and field placement.

Run these from the repository root.

```sh
node scripts/measure-fixed-encounters.mjs --roster-power
node scripts/measure-fixed-encounters.mjs --ranger-spacing
```

## Progression across roles

The same Troll, Dragon and Lich seeds run at each party size for all twelve
leads. Solo measures self-sufficiency. The duo always adds the same unupgraded
Life cleric with Blessed Bloom and Mass Cure under a triage policy.
The lead keeps its selected starting skill and identity at both stages.

The zero-draw stage has no ordinary upgrades. The four-draw stage replays the
production seeded generic and character offer streams for four intermissions
at cycle two with no rerolls. It claims the first generic offer and favors one
native boon per lead when offered, falling back to the first eligible native
boon. The resulting histories contain four generic and four class boons each.
Among the 72 unique class-and-seed histories, three got zero copies of their
preferred boon, eleven got one, twenty-five got two, twenty-five got three and
eight got four. Because both reward types advance together, the results measure
a loadout's combined progression. The fixed identity, one subclass skill and
static boss settings isolate that comparison from milestone unlocks, grafts,
and changes in boss scaling during a live run.

Each cell is out of 72 fights at that stage.

| Boss   | Solo, zero draws | Solo, four draws | Life duo, zero draws | Life duo, four draws |
| ------ | ---------------: | ---------------: | -------------------: | -------------------: |
| Troll  |               56 |               72 |                   70 |                   71 |
| Dragon |               45 |               67 |                   63 |                   69 |
| Lich   |                1 |               21 |                   37 |                   51 |

Thirty-four Lich cases turned into clears after rewards, and every case that
cleared at zero draws still cleared. Among the 37 shared duo clears, the median
improvement was 18.6 seconds. Lich duo downings fell from 24 to three.

| Lich lead role | Selected builds                          | Solo clears, zero to four draws | Life duo clears, zero to four draws |
| -------------- | ---------------------------------------- | ------------------------------: | ----------------------------------: |
| Support        | Valor, Devotion, Life, Land              |                      1 → 5 / 24 |                          2 → 8 / 24 |
| Frontline      | Champion, Berserker, Open Hand, Assassin |                     0 → 10 / 24 |                        16 → 19 / 24 |
| Ranged         | Hunter, Evoker, Wild Magic, Fiend        |                      0 → 6 / 24 |                        19 → 24 / 24 |

Champion's four-draw solo fights had zero downings and five timeouts. The
two-Life duo also had zero downings and timed out in all six four-draw fights.
Berserker and Fiend each cleared five of six four-draw solos. Those results
identify different constraints. Champion and the two-Life duo need the next
pass to measure boss damage and healing separately from damage dealt to adds.
The Berserker and Fiend results warrant a matched split between sustain and
damage ranks before tuning either.

## Party composition

The corrected coverage matrix has 78 matched Lich trios with three third-slot
choices while keeping the lead, Knight partner and encounter scaling fixed.
Hunter damage cleared 8, Whispers utility 64, and Life protection 59.
Life's remaining 19 runs timed out without a wipe. In the 12 comparable
Beholder cases, the counts were 12, 11 and 6. The Hunter damage route can
work well where its team survives without recovery. Practical damage uptime
against the Lich needs a separate check from nominal build damage.

## Ranger spacing and field placement

The original Hunter and Beast Master policies use different preferred
distances. They also request Rain of Arrows and Snare inside nominal range
even though both fields land at a fixed offset. The new mode crosses the
same two distances for both builds and compares stock field casting against
positioning for the real landing band. It measures boss overlap with active
Rain and Snare separately. The Hunter uses Relentless Hunt and the Beast
Master uses Pack Tactics in this sensitivity check.

Each boss cell is out of twelve fights. Downings include both party
members where applicable.

| Build        | Target distance | Field policy | Troll clears | Dragon clears | Lich clears | Downings |
| ------------ | --------------: | ------------ | -----------: | ------------: | ----------: | -------: |
| Hunter       |            120u | Stock        |            6 |             0 |           0 |       71 |
| Hunter       |            120u | Aligned      |            5 |             3 |           0 |       59 |
| Hunter       |            230u | Stock        |           12 |             9 |           0 |       30 |
| Hunter       |            230u | Aligned      |           11 |             6 |           0 |       31 |
| Beast Master |            120u | Stock        |            6 |             2 |           0 |       67 |
| Beast Master |            120u | Aligned      |            6 |             1 |           0 |       66 |
| Beast Master |            230u | Stock        |           12 |            10 |           0 |       24 |
| Beast Master |            230u | Aligned      |           12 |             7 |           0 |       39 |

With stock field timing, increasing Beast Master's target distance made its
Dragon results move from 2/12 to 10/12 and reduced total downings from 67 to 24. The wolf still registered 421 hunts across the wider-distance runs,
versus 367 at 120u. Hunter also lost most of its clears at 120u. The original
cohort gap was sensitive to an unequal engagement policy.

Positioning for fields improved boss contact at both distances. At 230u,
Beast Master's measured Rain and Snare contact rose from 195.5 and 309.7
seconds to 284.1 and 376.6 across the 36 fights. Dragon clears fell from
ten to seven as the controller moved out to place the fields. This gives
field setup a real opportunity cost to measure, and leaves both classes'
combat values in place.

Current findings support keeping combat values in place. The next power pass
should separate the Lich's boss damage, add removal, healing and downtime
before changing numbers. The usefulness and reward-choice review follows
before the visual revamp and the boss and encounter revamp.
