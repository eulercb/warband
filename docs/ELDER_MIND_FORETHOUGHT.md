# Elder Mind: Forethought

Whispered Doom / Thought Break (#152) is merged and accepted in owner testing:
it felt nice. This delivery resolves Elder Mind's remaining purpose question
with an early intention read. Elder Mind is implemented for owner testing; it
is not yet accepted. The Great Old One pair has now received a full purpose
review, while acceptance and relative balance remain separate questions.

## Decision and actual combat loop

**Elder Mind:** establish a personal curse → connect a positive direct hit →
read and commit the boss's next available move → reposition or place territory
before its ordinary wind-up. The read lasts 8s. If the boss is already attacking,
that action finishes before a next move can be selected.

**Whispered Doom:** prepare with a utility → hold an eligible special → connect
during a dangerous wind-up/channel to cancel that action. Basics preserve its
preparation. It trades advance knowledge for a reactive, bounded interruption.

Elder Mind changes _when the boss commits to an ability_. Its target and aim
remain undecided until the normal wind-up start. This is an intentional AI
change: a close burst forecast while the player is nearby remains the chosen
burst when the player retreats. Re-running distance-based selection after that
movement would erase the payoff of the information. The forecast never locks
a false target, draws a speculative floor telegraph or promises an exact time.

For example: Hex the Troll and connect a basic. During recovery, read **Ground
Slam — nearby burst**. Retreat or place a curse field before the normal wind-up.
The Troll still performs Ground Slam at its normal time, even if the reader is
now outside it. A ranged attack instead asks the party to choose an approach
or dodge position; it can still aim at their new position when the wind-up begins.

One bounded Sol 6.1 high review recommended this route. Retaining the old
identity would preserve numerical growth but leave its documented purpose
problem unresolved. Rejected alternatives:

- Automatic curse movement repeats Hex and Dissonant Whispers' following grands.
- Remote strike origins repeat Fiend's Claim/conduit delivery.
- More suppression/duration/healing repeats the old identity package.
- False targets or fear would repeat Whispers' accepted perception work.

## Receiving kit and marginal value

| Layer                  | Retained contribution / identity change                                                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Basic / Hellish Rebuke | Native Elder Mind adds a personally cursed direct-hit read. It no longer spreads Mind Blast's suppression to these spells.                                                         |
| Hex                    | Existing curse, slow and wind-up delay remain the native setup. Elder Mind adds no field duration. Ordinary growth and the following grand retain their own coverage/uptime value. |
| Mind Blast             | Its existing curse suppression and Honed duration remain. Rending Thought retains piercing coverage; reading adds advance information rather than another suppression source.      |
| Tentacle of the Deep   | A close direct read carrier. Its ordinary growth and control grand remain independent tools for approaching/controlling the announced window.                                      |
| Dissonant Whispers     | Alternative airborne-capable personal curse territory. Its ordinary growth and following grand retain coverage/uptime; ticks never trigger a read.                                 |
| Entropic Ward          | Relocation lets the player act on knowledge; its ordinary growth and guard/heal grand remain. Elder Mind's disconnected +12 heal is removed.                                       |
| Passive                | Dread Insight's conditional damage remains useful numerical support, not a claimed new behavior.                                                                                   |
| Elder Mind             | One coherent information/early-commitment loop replaces the old basic/special suppression, subclass slow, field duration and utility-heal package.                                 |

Every possible first pick works at full health against one boss through the
starting **Hex → basic** route. Blast adds a ranged direct carrier, Tentacle a
close one, Whispers another curse source and Ward a movement response. No adds,
injury, kill, second subclass pick or skill grand is assumed. Basics need no
special preparation resource. A curse applied by another owner does not qualify.

Removing the old duration bonuses also lowers any recharge floor derived from
those field lifetimes; authored raw cooldowns remain the same. The regenerated
recharge audit records that consequence.

## Exact runtime contract

- Positive effective direct boss damage arms the read. Misses, zero damage,
  immunity, lethal hits, zone ticks, echoes and borrowed attacks do not.
- The source must be alive, have positive HP, remain in the reserving class and,
  for native Elder Mind, personally curse that living boss. The curse is checked
  at the hit; a successful read can outlast that curse.
- One boss holds one real plan. Further eligible hits refresh its 8s lifetime
  and join that plan rather than rerolling it. The party sees the same forecast.
  Each boss in a multi-boss encounter has its own intention. Adds have no boss
  decision/wind-up contract and receive no substitute debuff.
- The owner and reserving class are host-only provenance. Downing, zero HP,
  class change, noncombat rooms, boss death or expiry clears both pending and
  selected reads. Another reader can then establish a new one. This avoids an
  orphaned permanent commitment; owner loss is an explicit invalidation.
- During the current wind-up/channel the read is pending. Recovery/idle selects
  a currently usable ability through the existing decision function, once a
  living target exists. No cooldown is set early, no active action is cancelled,
  and no recovery or decision timer is lengthened.
- Recovery is 0.4s and the ordinary idle decision interval is 1.2s. A read at
  recovery entry normally gives about 1.6s advance lead. A late idle read gives
  less. If every ability is unavailable, the HUD says **Reading next move…**;
  there is no invented forecast or waiting extension.
- At the ordinary decision opportunity, the cached ability is used without
  re-running its positional priority. Definition, cooldown, HP gates and a
  living target remain hard requirements. A genuinely invalid read clears;
  normal AI can choose another move. Enrage alone does not reroll a legal move.
- The existing fairness governor may defer a forecasted attack just as it
  defers ordinary attacks. The plan remains until a legal start or expiry.
  Taunt, random target selection, perception, aim and affix geometry still
  resolve at the normal wind-up start. Already emitted hazards are unaffected.
- Choice happens earlier, so random-number consumption can happen earlier too.
  This is an authorized simulation change, not a claim of identical old replays.

The UI labels the **next** move and its delivery on the boss bar and world nameplate,
separately from the current attack telegraph. Delivery wording deliberately omits
an exact aim point/radius prediction; movement, late target selection and affixes
would make a speculative floor outline misleading. Old snapshots omit the optional
forecast and remain readable. The public view exposes no private source/class data.

## Copied, grafted and Forge behavior

A native direct spell carries a conditional `forethought` component. At the
copy/recomposition or synthesis boundary it becomes an explicit **standalone
positive-direct-hit read**, requiring no donor curse/passive. The description
says so. This parallels portable Thought Break but grants information and early
commitment, not an interruption or Surge bonus.

The component is direct-strike compatible, deduplicated, priced at 24 internal
component weight and fixed under scaling/caps. It adds no damage or control
magnitude. Ordinary synthesized basics exclude it. An equipped Forge Elder Mind
identity instead attaches its explicitly described standalone contract to the
starting direct special; if that special cannot hit directly, its basic is the
carrier. This identity-granted fallback is deliberate growth and refreshes the
canonical component list, rather than an unpriced field hidden from synthesis.

Native graft replacements do not inherit the identity's native spell modifier;
reclaim restores it. Copied spells retain their standalone read without the donor
subclass. Component-aware resolution is authoritative, preventing stale flat
fields from creating an extra read after a component is removed.

## Verification and owner questions

Local delivery gates pass: **4,443 tests in 174 files**, 98% branch coverage,
99.41% statements, 99.6% functions and 99.76% lines. Build, lint, formatting,
upgrade inventory and recharge audits pass.

Actual World tests exercise all first picks, real Hex/basic setup, current
wind-up/channel preservation, recovery-entry lead, movement after a read, late
random targeting, shared readers, cooldown/HP/definition invalidation, fairness,
source loss, expiry, supplemental exclusion, Honed/grand combinations, actual
Forge synthesis/fallback and graft reclaim. Chromium checks use real host input
and touch controls at desktop and 320px, with registry-driven forecast labels.

Owner playtesting should judge whether early knowledge changes movement or
territory placement, whether the read is visible alongside current telegraphs,
and whether this is a useful alternative to holding Doom's interruption. Passing
checks do not establish fun or equal comparative power. Do not automatically
compensate a weak-feeling read with another damage/mitigation package.

**Next development after owner testing:** review Knight, Barbarian and Monk's
six subclasses with the same purpose rubric. Then review remaining nature,
caster and support identities, followed by whole-system power/reward/graft tuning
and the dedicated visual milestone. See [development status](DEVELOPMENT_STATUS.md).
