# Upgrade design: retrieved evidence and boundaries

Accessed 2026-10-22 (project owner's timezone). This is a small mechanical reference
review, not a survey of players or a claim about Warband's market reception.

## Sources actually retrieved

### Hades: community catalogue and build planner

Repository: [cayan3/hades-handbook](https://github.com/cayan3/hades-handbook), snapshot
[`97e66bf`](https://github.com/cayan3/hades-handbook/tree/97e66bf38ac74361d024f2feb6b05bbb4eaa6aeb).
This is a community tool, not a Supergiant design statement. Its extracted records
and hand-maintained hammer descriptions are not independent corroborating sources.

Read:

- [Hades 1 hammer descriptions](https://github.com/cayan3/hades-handbook/blob/97e66bf38ac74361d024f2feb6b05bbb4eaa6aeb/packages/catalog/src/hammers.ts).
- [Boon eligibility records](https://github.com/cayan3/hades-handbook/blob/97e66bf38ac74361d024f2feb6b05bbb4eaa6aeb/packages/catalog/data/hades1/boons.json).
- [Extracted descriptions](https://github.com/cayan3/hades-handbook/blob/97e66bf38ac74361d024f2feb6b05bbb4eaa6aeb/packages/catalog/data/hades1/descriptions.json).

Specific observations from these records:

| Record                                        | What the source describes                                                         | Useful design inference for Warband                                                                                                                                |
| --------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `BowDoubleShotTrait` / Twin Shot              | Two adjacent shots with reduced range; weapon and exclusion metadata              | Change geometry with an understandable cost; do not merely increase all axes.                                                                                      |
| `BowTapFireTrait` / Flurry Shot               | Rapid held fire replaces Power Shot access; aspect conflicts and exclusions       | A tempo alternative can remove another action's payoff. Warband needs its own held-input/cooldown rules, not a copied control scheme.                              |
| `ShieldThrowEmpowerTrait` / Empowering Flight | A connecting special prepares a bounded number of enhanced attacks                | A short action → payoff sequence can be legible. In Warband it must include basics where limited equipped specials would otherwise make it inaccessible.           |
| `LightningCloudTrait` / Scintillating Feast   | An AND requirement combining a particular cast with any one of several Zeus boons | Specific prerequisites can create identity, but require offer support and a useful baseline. Do not impose an equivalent rare multi-part requirement in the pilot. |

These observations support proposing tradeoffs, short sequences and explicit
eligibility. They do **not** prove the proposed Warband numbers are balanced,
that this catalogue perfectly matches every Hades version, or that players prefer
one route. Hades' solo room-clearing, weapon selection and reward structure differ
from Warband's co-op bosses, limited slots and delayed subclass/grand access.
No Hades damage percentages are used as Warband tuning targets.

### Risk of Rain 2: community proc-chain API documentation

Source: [R2API.ProcType README](https://github.com/risk-of-thunder/R2API/blob/2e3fc0235a5464e932b4314c5eeae425136cf2e3/R2API.ProcType/README.md),
snapshot [`2e3fc02`](https://github.com/risk-of-thunder/R2API/tree/2e3fc0235a5464e932b4314c5eeae425136cf2e3).
R2API is community modding infrastructure, not Hopoo's balance specification.

The README documents registering proc types and adding/removing/checking them
in proc-chain masks. The narrow lesson is to track what a secondary effect may
trigger, rather than treat every damage event as a fresh direct attack.

**Our design decision:** poison, relayed retaliation and curse-zone effects need
explicit owner identity, a per-cast gate or bounded target budget, and nonrecursive
secondary damage. Warband already has much of this vocabulary. This source does
not establish any vanilla item's exact proc coefficient, probability or performance;
we did not retrieve evidence for those claims and do not make them.

## Unavailable evidence

Direct requests to the English Steam store pages for Hades (1145360), Dead Cells
(588650) and Slay the Spire (646570), the Risk of Rain 2 proc-coefficient wiki and
Hades' Daedalus Hammer wiki were rejected by the environment proxy with HTTP 403
before content was received. Previously published network settings did not make
those requests usable in this runtime. No account login is required for the public
research attempted, and another credential request would not diagnose this failure.

No Steam/Reddit player sample was retrieved or analyzed in this milestone. No
community consensus, success prediction, review quotation or statistical claim
about players is inferred. Dead Cells mutation and Slay the Spire cost/tempo
comparisons remain optional research targets, not researched findings here.

Public GitHub API access did work, allowing the limited references above. We read
data/documentation; no external project code, asset bundle or supplied command was
executed. Apply [the research guidelines](RESEARCH_GUIDELINES.md) to later sources.
The pilot recommendation rests primarily on reproducible Warband evidence and
its owner's live reports, with these external references informing alternatives.
