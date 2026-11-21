# Role tuning: Champion and Borrowed Anthem

This batch changes two live values and compares **384 cases before and after**
with the same seeds, offers, identities and controllers. Run
`node scripts/measure-fixed-encounters.mjs --role-tuning` to repeat it.

- **Unbroken Champion.** Taunt and Shield Wall's projected guards raise
  the next connecting melee counter from **+30% to +50%**. The boost
  requires a block and a follow-through. Warlord's Tempo retains its
  proactive counter. Block charges, coverage and guard duration stay
  at their prior values.
- **Borrowed Anthem.** Its native graft damage bonus goes from **+20%
  to +30%** for the selected recipient. Mitigation stays at 15% and the
  window stays at six seconds. Rousing Chorus still adds 25 percentage
  points. Bard's native Inspiration keeps its existing numbers. Forge
  applies the new minimum only to a retained ally-buff damage axis.

## Matched results

The lead sees both cards in a real seeded reward window. The same Life
cleric joins at size two and Hunter joins at size three. A fourth slot adds
Evoker for Champion or Knight for Land. That comparison tests the practical
benefit of adding roles alongside normal party scaling. It does not isolate
headcount. Players keep their own movement and targeting policies.

| Lich case                                  | Solo clears | Life duo clears |  Trio clears | Four-player clears |
| ------------------------------------------ | ----------: | --------------: | -----------: | -----------------: |
| Unbroken Champion with Impenetrable        |   0 → 0 / 6 |       0 → 0 / 6 |    6 → 6 / 6 |          6 → 6 / 6 |
| Unbroken Champion with Field Medic         |   0 → 0 / 6 |       0 → 0 / 6 |    6 → 6 / 6 |          6 → 6 / 6 |
| Land with Borrowed Anthem, both identities |  2 → 2 / 12 |      8 → 8 / 12 | 12 → 12 / 12 |       12 → 12 / 12 |
| Land with Thorned Grasp, both identities   |  8 → 8 / 12 |    12 → 12 / 12 | 12 → 12 / 12 |       12 → 12 / 12 |

Among Unbroken Champion's Lich duos with Impenetrable, median lead damage
including adds rose from 2,018 to 2,130. Median boss HP left fell from 15.7%
to 12.9%. In the corresponding Dragon rows, solo clears fell from six to
five and duo clears rose from four to five. Lich trios stayed at six clears
and completed shared wins 0.8s faster by paired median. This keeps the gain
tied to a tank's established action without making solo damage the goal.

Borrowed Anthem's Lich clears stayed even and shared wins were slightly
faster at each party size. The two Land identities together cleared Troll
solo 2.95s faster by paired median. In the test, Thorned Grasp remains the
better choice against Lich without a balanced party. With a Hunter in the
group both choices clear the tested Lich seeds, so use harder group cases
to determine how much value Anthem offers a damage-focused party. Its
native recipient is the lowest-health-ratio player in range, which can be
the caster. Party results alone cannot establish benefit to the damage dealer.

The separate 4,458-fight coverage rerun changed four outcomes, all for
Unbroken Champion. All 115 changed rows included one of the two tuned
choices.

## Balance completion

- Treat DPS, healing and tanking as different contributions. A tank
  or healer may accept slow solo clears in exchange for useful protection
  or uptime. Compare alternatives that fill the same role, using boss
  damage, add pressure, protection, time downed and clear time together.
- Use solo through four-player cases at relevant progression levels.
  Solo should present the greater challenge. A balanced party should have
  more ways to recover and clear, while tougher group encounters should
  distinguish builds and leave room to fail.
- Before closing tuning, add harder matched group cases where ordinary
  fixtures hit 100% clears. Resolve the outstanding cases from the earlier
  reports with a measured change or a documented retain decision. For
  Anthem, measure who receives the bonus and whether it adds party damage
  during the window. For defensive identities, distinguish ally protection
  and follow-up hits from personal damage totals.
- Keep the scenario seeds, reward histories and per-role telemetry for
  rebalancing after encounter changes. Re-establish the matched baseline on
  the new bosses before carrying a numerical conclusion forward.

**Next** is harder party calibration and the remaining role and reward
outliers. Then review the results and live playtesting before starting the
visual prototype. The boss and encounter revamp follows the visual work.
