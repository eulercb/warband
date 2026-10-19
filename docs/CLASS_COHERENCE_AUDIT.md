# Whole-class coherence audit and retouch proposal

Reviewed against `ef8de74` (merged Moon Aspect), 2026-10-19. **This delivery is
an audit and implementation proposal, not a gameplay balance patch.** No combat,
reward, difficulty or rendering behavior changes here. Proposed numbers below
are starting points for validation, not measurements of an optimal build.

## Scope and evidence

The [resolved catalogue](CLASS_CATALOGUE.md) inventories all **12 classes, 48 base
slots, 24 subclasses, 96 subclass skills and 24 passives**. Its generator spawns
all 96 choices independently and checks the native binding and passive. This
catches missing first-choice routes; it does not simulate every skill pairing.
The assessment below covers every base kit and all four choices per subclass.

Evidence labels:

- **Verified:** resolved definitions or a traced execution rule. A mechanically
  valid interaction does not prove it feels good.
- **Observed:** the player's live reports, including successful recent kits,
  weak-feeling Moon/Fiend, and earlier Spell Weave setup failure.
- **Hypothesis:** a design concern or proposed improvement requiring playtests.

Reproduce the inventory and the four scaling probes with
`node scripts/audit-class-catalogue.mjs --check --probe`. The probe has explicit
expected totals, so a changed implementation cannot silently preserve this report.

Execution references: `content/classes.ts`, `content/subclasses.ts`,
`content/subclassPassives.ts`, `content/charUpgrades.ts`, `content/balance.ts`;
`combat/{combat,abilities,support,martial,spellCombos,subclassPassives,absorption,
paladinAuras,companions,moonForm}.ts`; `core/control.ts`. Paths are relative to
`src/engine/`. These take precedence over old roadmap descriptions.

No class tier list or measured whole-fight DPS ranking is claimed. Existing
regression suites test contracts; they do not establish equal power, enjoyment,
novice comprehension or practical uptime. A complete late-run, generated/Forge,
multiclass and co-op balance matrix remains implementation validation work.

## Conclusions

1. **Keep the recent systems.** Wolf commands, temporary bear form, barriers,
   following auras, guard/counter, Momentum, Flow and Surge create distinct
   decisions without another button. Complexity is not itself a reason to buff
   or replace a simpler kit.
2. **There are no missing native passive bindings in the catalogue.** Each
   subclass has a base-kit route independent of its first skill choice. Some
   routes remain situational: injured healing for Bard, close control windows
   for Mage, and taking a hit for some Knight counters. Accessibility and
   throughput need more work than adding more conditional hooks everywhere.
3. **Uneven scaling is real, but “flat” does not mean “unscaled.”** Supplemental
   damage uses global damage multipliers; several healing/barrier amounts and
   passive caps do not follow HP growth. Percentage bonuses can also become
   irrelevant behind proc gates, short uptime or hard caps.
4. **Remaining active-skill redundancy deserves priority over more passive
   layers.** A passive supplying a route does not make four similar actives
   interesting. Nor must every active spend the same resource: mobility,
   cleanse and control can be valuable independent alternatives.
5. **No catalogue-wide emergency breakage was established by this audit.** There
   are concrete naming, overlap and scaling concerns below. Do not disguise
   hypotheses as confirmed bugs or undertake 144 skill rewrites at once.

## Class and subclass assessment

“Retain” means keep the role while testing the identified limits, not exempt it
from future upgrade or presentation work. Every skill is named so recent riders
cannot accidentally remove an older active from consideration.

### Knight

Base: Cleave is the counter delivery; Taunt redirects future boss decisions,
not locked attacks or summons, and provides guard; Shield Wall is timed frontal
protection; Shield Bash is close control. **Retain the loop.** Verified Bash has
16s actual recharge, so the supposed control specialist does not have frequent
solo control from its base kit. This is a cadence concern, not a missing route.

- **Champion:** Earthshaker is a plain nearby burst; Bull Rush is approach/push;
  Second Wind is heal plus reposition speed; Riposte earns a short parry on a
  connecting hit. Reprise rewards successful counters but caps at 20 HP. Keep
  Riposte/Bull Rush, retain Second Wind as accessible recovery; Earthshaker
  should differentiate from Bash by converting a counter into a ground rupture
  rather than becoming another setup requirement. Do not consume a counter twice.
- **Battlemaster:** Trip Attack substantially overlaps Bash; Menacing Roar is
  only a personal damage buff despite its name; Precision Volley offers a ranged
  alternative but little tactical identity; Rally now supplies recovery ground
  and counter preparation. Tactical Opening works from Bash with every pick.
  Highest Knight design candidates: Menacing Roar and Trip Attack; retain Rally
  and the ranged option rather than forcing melee-only subclass choices.

### Ranger

Base: Arrow, piercing Multishot, slowing Rain of Arrows and Roll form a functional
lane/escape kit. Keep pierce as positional value, not single-target damage that
must compete with five overlapping projectiles.

- **Hunter:** Hail of Thorns is another self-centered burst; Hunter's Mark is
  actually a piercing damage shot, while the passive applies the real party mark;
  Stand as One provides aerial-capable territory and ally movement; Volley is a
  wider piercing volley. Quarry works on basics with every choice. Preserve
  Stand as One; clarify Mark's name and distinguish Hail's job before adding
  another global damage multiplier. Party-wide 10% exposure is powerful even
  though it looks smaller than a personal 25% one-hit proc; multiple Hunters
  cannot stack it.
- **Beast Master:** Pounce closes, Snare holds, Nature's Bond cleanses/heals/hastes,
  Savage Bite converts close risk into sustain. Pack Bond supplies the missing
  unifying companion, including a healing-to-protection route. **Preserve this
  successful benchmark.** Test ranged-only versus Pounce/Bite play and late-run
  12-point wolf wards; do not force all four picks to summon separate pets.

### Mage

Base: Bolt, controlled-target Fireball, close Frost Nova and Blink support
control into burst, but Nova's actual recharge is 20s. Its 3s slow must still be
active when the projectile lands. An ally supplying control changes the value
considerably. A training-dummy conditional bonus is not guaranteed real damage.

- **Evoker:** Lightning Bolt rewards existing control; Cone of Cold supplies it;
  Sculpted Blast is a delayed nearby payoff; Arcane Shield is directional
  knockback plus barrier. Cadence works with Bolt on controlled targets; its
  1s refund is gated for 6s. Keep the choices, examine solo control cadence and
  whether the refund is noticeable before increasing damage indiscriminately.
- **Abjurer:** Arcane Ward now combines slow, burst and barrier; Otiluke Bind is
  ranged control; Dimension Door now provides deliberate reposition/control;
  Life Transfer heals and pre-shields. Binding Ward adds a fixed 20 shield.
  **The old “only Fireball interacts” problem has been addressed.** Retain these
  functions; examine the passive's late-HP scaling and collision/control
  regressions. Do not reopen Dimension Door solely for novelty.

### Cleric

Base: Smite supplies offense, Heal now protects outside rescue as well as during
rescue, Sanctuary banks overflow shielding, and Blessing targets a recipient.
Keep the successful heal/barrier buffs. Blessing still bundles generic offense
and mitigation, so retain it in the simplicity review even after improved FX.

- **Light:** Radiance is a plain nearby burst; Guiding Bolt a larger casted shot;
  Flash of Light overlaps base Heal; Warding Flare selects a barrier recipient.
  Refulgence follows genuine healing/protection with one boosted direct hit;
  spending it on an automatic basic can have less impact than reserving a bolt.
  Retain Warding Flare and the support/offense loop. Differentiate Flash through
  a targeted follow-through rather than simply making Heal slower or weaker.
- **Life:** Blessed Bloom overlaps Sanctuary; Mass Cure is currently **one
  auto-selected target**, not a mass heal; Preserve Life shields nearby allies;
  Reproach offers short-range stun. Abundance converts unused dedicated healing,
  capped at 25, not arbitrary zone healing. Preserve the barrier identity;
  Mass Cure's misleading name/scope is a verified clarity issue. A deliberate
  secondary-recipient heal is a candidate, with bounded party scaling.

### Barbarian

Base: Reckless Swing builds during Rage; Leap repositions; Whirlwind spends
Momentum. Six-second rage versus slowed basic cadence means misses and movement
matter; do not benchmark permanent three-stack spending.

- **Berserker:** Frenzy's nonlethal health drain plus direct-hit leech is distinct;
  Reckless Cleave, Ground Slam and Chain Pull all spend Momentum but perform
  different shapes. Ground Slam still overlaps Whirlwind strongly. Rampage
  empowers the next basic cast, including the cost of missing. Keep Frenzy and
  Chain Pull; give Slam a positional follow-up instead of another rage or bigger
  instant circle. Self-cost must remain meaningful, not a difficulty discount.
- **Totem:** Bear Spirit is still mitigation plus control/forced-movement
  resistance; Wolf Spirit builds by travel; Earth Totem is currently an instant
  circular slow/burst despite the “totem” name; Spirit Mend heals/cleanses/resists
  control. Shelter is a flat 8–20 nearby barrier. Retain Wolf/Mend. Bear remains
  explicitly in the plain-defense review despite Steadfast; Earth Totem should
  become an actual short-lived placed foothold if it can fit current zone rules.

### Rogue

Base: Slash has extra crit chance; Backstab spends precision; Shadowstep prepares
it; Poison Vial supplies territory/slow/wind-up suppression. This is a useful
simple loop. Avoid declaring it weak solely because newer classes have pets.

- **Assassin:** Death Strike is a stronger precision spender, Deadly Throw a
  ranged crit alternative, Coated Blade is currently another poison ground zone,
  Smoke Bomb supplies safe setup. Death's Opening is conditional precision damage
  plus execute value, not an extra guaranteed crit. Keep Smoke and both delivery
  options. Coated Blade's name/mechanic mismatch and overlap with Vial make it
  a good candidate for a next-precision-hit poison application.
- **Trickster:** Mage Hand Bolt is mostly a generic projectile; Ensnaring Strike
  is a rooted zone; Misty Step heals and prepares precision; Shield Spell grants
  frontal block plus precision. Spellblade turns non-melee specials into a
  connecting melee payoff. Keep the movement/guard alternatives; Bolt could
  provide an off-angle strike or pull setup, but not before checking aim and
  collision cost. Root zone already has a clear job and need not spend precision.

### Paladin

Base: Holy Strike, shared Consecration, Lay on Hands/Renewal and brief Divine
Shield/Bulwark now provide distinct frontline choices. Only one following aura
per owner exists: activating another replaces it. Preserve that tradeoff and the
immunity identity; extra auras must not silently stack.

- **Devotion:** Divine Smite is close lifesteal; Sacred Weapon adds Pursuit;
  Bless adds Renewal; Aura of Protection is nearby absorption plus Bulwark.
  Oath Anchor cleanses/resists control at aura activation. No current active is
  merely the old plain DR, but Sacred Weapon/Bless still overlap existing
  buff/heal routes. Keep the new barrier/aura functions and evaluate their
  independent active value; do not exempt them from upgrade branching.
- **Vengeance:** Hunter's Vow is Pursuit plus offense/speed; Vow of Enmity is a
  nearby slow/burst; Avenging Charge is approach; Wrathful Smite is short melee
  stun. Procession rewards the first melee connection per aura. Base auras make
  every first choice viable. Smite/Enmity overlap other classes' generic control
  strikes; candidate: a brief vowed-target pursuit payoff rather than more
  identical stun. Validate against bosses without turning it into permanent lock.

### Druid

Base: Thornlash, Entangle, Regrowth's recovery grove and Cyclone offer damage,
control and support. Entangle is a ground effect, so airborne targets change
both Land's and base Druid's options.

- **Moon:** Dire Maul adds close sustain; Feral Pounce approaches; Primal Roar
  is generic offense/speed, partly overlapping form movement; Frenzied Regen
  is self-heal plus grove. All can activate form, as can base specials at full HP.
  Preserve the bear implementation. Prioritize mend scaling and Roar's identity
  before replacing the entire form or making it permanent. Claws are supplemental
  and intentionally cannot crit/recursively trigger direct-hit passives.
- **Land:** Erupting Earth and Gust are both nearby slow/burst-style alternatives
  to Cyclone (Earth itself has no authored slow); Gust adds push; Wall of Thorns
  is damaging/healing territory; Healing Spring is supportive territory. Living
  Paths works from base Entangle. Preserve Wall/Spring. Erupting Earth is the
  best candidate for a ranged eruption/control payoff instead of a third circle.
  Gust's emergency peel is worth retaining even if its numbers are modest.

### Bard

Base: Mockery slows, Healing Word prepares Harmony only after restoring HP,
Dissonant Whispers prepares Discord, Inspiration spends both verses for party
coverage/movement. The two 8s memories are preparations, not independent buffs.
This can work in solo play while injured; full-health Harmony remains unavailable.

- **Valor:** Blade Flourish and Shatter provide different-range Discord;
  Battle Hymn and Bolster are both chorus outlets, with offense versus
  cleanse/control resistance/movement. Rallying Chorus gives a frontal block.
  Keep these meaningful alternatives. Verify directional guard readability and
  practical chorus availability; don't require full-health healing spam.
- **Whispers:** Words of Terror is ranged Discord territory; Psychic Blade is
  direct Discord; Mantle of Whispers is a plain blink; Healing Refrain is larger
  Harmony healing. Echoed Refrain requires chorus, then a later effective heal.
  More setup than Valor for an echo capped at 35 merits review. Keep the
  nonrecursive echo; candidate: spend it on the next injured recipient rather
  than adding yet another resource. Mantle needs a clear verse-preservation or
  reposition role, not an unrelated damage bonus.

### Monk

Base: Flurry extends Flow within its lifetime budget; Step prepares it; Stunning
Strike and Quivering Palm spend it for range/instant release. Baseline Step also
heals. This is a practical base route with every subclass choice.

- **Open Hand:** Flurry Barrage and Wave Palm spend Flow; Wind Step is a longer
  version of base Step; Wholeness of Body heals and prepares Flow. Flowguard
  gives one directional block. Keep the loop; Wind Step is a redundancy candidate
  for an ally-crossing or peel dash, while Wholeness remains on the “single heal
  with a rider” review list. Do not remove accessible recovery without replacement.
- **Shadow:** Shadow Dart gains stun from Flow; Shadow Step prepares it; Cloud
  of Shadow gains area/slow; Shadow Strike spends it on melee range. Rhythm
  refunds running dash/blink cooldowns. These now all have a functional Flow
  relationship. Retain them and evaluate whether the fixed 2s refund is too
  strong at very low movement cooldowns rather than assuming fixed = weak.

### Sorcerer

Base: two-shot Chaos Bolt, Surge-consuming Meteor, Mirror Image interception and
Arcane Phase preparation provide a feasible loop before any subclass. Surge is
one held preparation, not an indefinitely stacking resource.

- **Draconic:** Dragon Breath is close cone consumption; Dragon Wings supplies
  real flight/speed/preparation; Chromatic Bolt is focused consumption; Draconic
  Scales now combines barrier and Surge burst. Surge Ascent supplies short flight
  or bounded extension. Keep all roles. Scales has little damage even with a
  20% Surge increase; whether spending a scarce Surge for safety is satisfying
  needs comparison with its offensive alternatives, not just another rider.
- **Wild:** Chaos Surge is a broad projectile spread, Tides of Chaos a nearby
  burst, Bend Luck a preparation blink, Wild Ward defensive territory/preparation.
  Repaired Spell Weave counts basics; three separate basic presses can prepare
  it within 8s, even without a subclass offensive choice. Keep the achievable
  rule. Native preparation can make it redundant while Surge is already held;
  evaluate its value during real defensive cooldown gaps rather than inventing
  another impossible delivery puzzle. Bend Luck still resembles base Phase.

### Warlock

Base: Blast lifesteals, Hex provides personal curse and control, Rebuke reacts
once to damage, Dark One's Blessing is still an ordinary personal damage buff.
Ground zones are not curseable combatants. Keep this safety rule and the recently
separated curse styles; do not regress to three copies of Hex.

- **Fiend:** Hurl Flame is a heavier leeching projectile; Fire Pit supplies
  searing curse; Fiendish Rebuke duplicates base reactive burst; Dark Resilience
  now shields and siphons nearby cursed targets. Soul Ember is 5% maxHP healing
  plus brief DR, gated at 6s while injured. It does scale with HP, but can be
  swallowed perceptually by ordinary lifesteal. Keep siphon and distinct curse;
  differentiate Fiendish Rebuke and make Soul Ember's cursed sustain more
  distinctive rather than only adding 1–2 percentage points.
- **Great Old One:** Mind Blast is a plain projectile; Tentacle a nearby slow;
  Dissonant Whispers a dread curse zone; Entropic Ward a healing blink. Dread
  Insight is 8% damage during personal curse plus hindrance, including wind-up
  slowing/weakened damage. Hex can supply both conditions, so this is often
  curse uptime rather than an extra decision. Retain the viable base route;
  Mind Blast could exploit a curse for a timed wind-up interruption/weakening
  payoff. Entropic Ward remains a generic blink-plus-small-heal candidate.

## Scaling ledger and Moon microprobe

Verified rules, not a proposed universal percentage conversion:

| Family                                           | Current behavior                                                                                                               | Risk and recommendation                                                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Moon claws / wolf bites                          | Fixed base damage, multiplied by owner damage bonuses and target mitigation; no crit/direct-hit proc chaining                  | They scale with global offense, but not every skill-specific boon. Preserve anti-recursion; design explicit future upgrade hooks.                  |
| Moon mend                                        | 4 HP, one shared 1s gate, only in form/positive nearby hits                                                                    | HP growth shrinks its relative protection. Recommend hybrid `max(4, 3% maxHP)` per proc; test caps and uptime before adopting.                     |
| Wolf ward / Totem shelter / Abjurer passive      | 12 / 8–20 / 20 flat absorption, own timing/target rules, common 50%-HP ceiling                                                 | Ceiling growth does not increase a flat grant. Candidate floors plus modest recipient-HP terms; do not scale all party grants by caster HP.        |
| Champion / Fiend                                 | 8% maxHP capped at 20 / uncapped 5% maxHP per proc                                                                             | Champion stops growing at 250 HP; Fiend at base 130 HP gives 6.5 heal per eligible 6s. Assess cadence and identity, not just percentages.          |
| Abundance / Refrain echo                         | 50% of unused/effective dedicated heal, hard per-trigger caps 25 / 35                                                          | Scale with their input until capped, then plateau. Candidate recipient-HP-aware ceilings, keeping nonrecursive rules.                              |
| Dedicated heals / healing zones / on-use patches | Authored flat healing; relevant skill upgrades can increase fields; ordinary global damage is not a general healing multiplier | Do not promise a damage boon improves support. Test maxHP progression and useful ally coverage before buffing recently successful Cleric.          |
| Cadence / Shadow Rhythm                          | Subtract 1s / 2s from already running cooldowns, gated 6s / 4s                                                                 | Fixed refunds become proportionally larger with haste. Candidate bounded fraction with minimum/maximum only if extreme-haste probes justify it.    |
| Percent offense / crit / expose                  | Usually scales with the delivered hit; limited by eligible delivery, crit rules, uptime and shared marks                       | Hunter is party-wide and nonstacking; a one-hit personal proc is not equivalent to sustained 10% exposure.                                         |
| Guard / immunity / cleanse / flight              | Discrete avoided events or time windows, not HP amounts                                                                        | Value rises with dangerous hits but can be zero versus wrong direction, ground bypass or no relevant control. Test boss types, not only HP totals. |
| Auras                                            | Renewal 10 HP/s, Bulwark 15% mitigation, Pursuit movement and one +25% direct strike per recipient                             | Renewal is flat; other values depend on incoming/outgoing damage. Only one aura per owner; equivalent effects do not stack.                        |

Isolated fixed-target probe: fresh Druid, no obstacles, stationary unbuffed Lich
at 60u, no other attacks, six **supplemental** basic-hook claws at t=0..5s,
1s intervals, injuries sufficient to use healing. No AI or adaptive changes.
Claw and mend hooks are exercised directly; this is not an input/whole-fight test.

| MaxHP | Damage multiplier | Claw total | Mend total |
| ----- | ----------------- | ---------- | ---------- |
| 140   | 1                 | 84         | 24         |
| 140   | 2                 | 168        | 24         |
| 280   | 1                 | 84         | 24         |
| 280   | 2                 | 168        | 24         |

At ideal 6s-in-12s form cadence this is roughly 7 supplemental base damage/s and
2 HP/s over the full cycle, before missed cones/late activation and excluding the
normal Thornlash and other spells. More targets increase damage, not the shared
mend gate. More haste can add claws, but not unbounded mends. A form feeling weak
can therefore come from time spent outside 95u, not merely its coefficient.
The proposed 3%-HP mend would give 4.2 at 140 HP and 8.4 at 280, preserving the
current floor and making growth visible without adding crit/proc recursion.

**Difficulty:** `heroPowerRatio` estimates resolved skills and stats, not the full
passive simulation; `balanceAdjust` also reacts to previous kill pace. Existing
`balanceDamageScale`, zone credit and barrier credit preserve some pre-buff
estimates. Keep those contracts during retouches, add regression comparisons,
and leave the adaptive algorithm unchanged. “No extra estimator credit” cannot
promise identical next-boss difficulty: faster kills still feed back naturally.

## Upgrade, grand and graft compatibility inventory

Verified current `amplify` already handles damage, landing damage, zone damage /
healing, on-use heals, recovery groves, absorption/siphon amounts and reach,
barrier target reach, guard duration, capped Steadfast duration, capped self-buff
immunity, aura radius and several ordinary buffs. The future redesign must not
remove these compatibility fixes. Honed is not literally identical text for every
skill anymore: exceptions describe recently reworked defensive/recovery effects.
The underlying default still uses +12% magnitude/+8% footprint/-8% recharge.

Gaps to price deliberately, not automatically “fix” by amplifying everything:

- Skill boons do not generally change standalone passive claw/bite/mend/ward
  constants or their gates. Future branches need explicit identity and ownership.
- Generic amplification does not inherently add pierce, Flow interactions,
  Momentum variety, verse routes, curse styles or Surge decision-making. Making
  a compatible damage field bigger is not the same as a branching playstyle.
- Aura radius grows, not every aura's lifetime/strength or passive proc; fixed
  ward values may hit shared caps. Tooltips must distinguish these promises.
- Recovery groves, barriers and new riders need native/composed parity for each
  modified skill. An inventory scan does not certify all 182 grands or replay
  orders. Full offer/eligibility/replay verification belongs to the upgrade pass.
- Grafted abilities retain their own behavior; a recipient cannot be assumed to
  own the donor's passive. Every proposed active must have useful unprepared
  behavior. Do not make a borrowed skill dead without Momentum/Surge/a pet.
- Keep stable IDs for saves/replay. Renaming Mass Cure or Hunter's Mark can fix
  presentation without changing identity. Mechanical replacement needs replay
  and seeded/Forge compatibility checks at implementation time.

No compatibility bug requiring an immediate gameplay edit was demonstrated in
this audit. This is a risk inventory, not a claim all 350 upgrades were simulated.

## Proposed implementation: three larger batches

This is the recommended **scope for approval**, not an instruction to implement
all hypotheses above. Other candidates stay on the backlog unless testing makes
them urgent. Each batch includes focused mechanics, descriptions, compatibility,
regressions and practical solo/co-op checks; not an unrelated presentation sweep.

### A — scaling and early-kit payoff (Moon, Warlock, Mage)

1. Moon: trial hybrid mend above; replace Primal Roar's redundant speed with a
   brief close-range bramble pulse on the next connecting claw. Alternative:
   retain simple Roar and extend form by a small capped amount on a successful
   close hit. Prefer the bramble payoff: extension risks near-permanent form and
   hides the current burst/rest rhythm. No blanket claw damage buff initially.
2. Fiend: prototype Soul Ember as a small cursed-hit shield reserve instead of
   hidden DR, using a bounded maxHP-scaled pool and the existing 6s gate. Compare
   with stronger current healing before committing; shield should work while
   healthy so lifesteal does not invalidate it. Preserve Dark Resilience's siphon.
   Fiendish Rebuke could spend its retaliation on a short searing trail after
   movement, distinguishing it from base Rebuke; prefer a stationary cursed
   counterburst alternative if movement dependence proves unreliable on phones.
3. Great Old One: Mind Blast against a personally cursed foe briefly weakens
   outgoing damage and delays a wind-up using existing hindrance vocabulary.
   Avoid repeated hard interruption loops. Retain a useful ordinary hit.
4. Mage: benchmark Nova/Bash-style control availability with actual cooldowns;
   trial Cadence refund 1→2s only if practical uptime remains weak. Abjurer ward
   trial `max(20, 10% recipient maxHP)` with existing shared cap/gate. Never spend
   a gate on a failed shield or an already-ready cooldown.

Acceptance: first subclass pick works with base kit; no injury-only activation
trap for Fiend's alternative; no recursive damage/healing; fixed early/late-HP
and haste comparisons; then normal adaptive encounters. Preserve current spell
control predicate (slow/root/stun) unless an explicit broader change is justified.

### B — active roles (Knight, Barbarian, Rogue, Druid)

1. Battlemaster Menacing Roar becomes a nearby challenge: brief enemy damage
   weakening plus a counter-ready opportunity on a connecting melee hit, keeping
   useful self offense. Alternative is an ally rally, but Rally already fills it.
   Keep Taunt ownership distinct: do not silently claim summons obey it.
2. Berserker Ground Slam leaves a short slowing fissure only when Momentum is
   spent; Totem Earth Totem becomes placed short-lived territory with bounded
   pulses, reusing zones rather than introducing a second pet system. Bear Spirit
   retains control resistance but gains a timed frontal interception/retaliation
   opportunity replacing part of passive DR. Compare with a protective nearby
   ward alternative; prefer the reactive role over another flat party bubble.
3. Assassin Coated Blade coats the next precision hit with bounded damage over
   time instead of placing another Vial. Alternative: retain ground delivery and
   make it a positioning trap. Prefer coating for its distinct setup; keep an
   unprepared ordinary-hit fallback for graft recipients.
4. Land Erupting Earth becomes an aimed eruption at range, with extra payoff on
   existing root/slow. Keep Gust as emergency peel and Wall/Spring as territory.

Acceptance: compare role/time/range/risk before and after, not just damage; test
resource-free fallback, flyers/untargetable hazards, boss movement constraints,
multitarget proc caps, native/composed and upgraded payloads. This is the largest
batch; split B only if the placed-totem prototype exposes substantial engine work.

### C — support alternatives and remaining cadence (Cleric, Bard, Monk, Ranger, Paladin, Sorcerer)

1. Rename Mass Cure to describe its target, or implement one bounded secondary
   heal (e.g. 35% of effective primary heal, one injured ally within a small
   recipient radius). Prefer secondary heal if solo primary strength is retained;
   do not trigger recursive rescue/echo chains. Flash of Light can instead reward
   a timely rescue with one marked offensive follow-through, differentiating it
   from both base Heal and Mass Cure. Avoid another blanket Cleric buff first.
2. Trial HP-aware caps for Abundance/Refrain and recipient-based wolf/Totem ward
   growth, based on A's scaling results. Keep flat floors and no equivalent-pool
   stacking. For Whispers, compare current next-heal echo with a delayed injured-
   ally echo on chorus; prefer the latter only if removing the extra heal setup
   measurably improves use without automatic overheal waste.
3. Monk Wind Step: a traversal that cleanses or grants a brief directional guard
   to one crossed ally; retain solo reposition value. Hunter's Mark naming and
   Hail of Thorns role review: prefer a close disengagement/slow over another
   single-target damage upgrade. Keep successful wolf and Flow relationships.
4. Paladin and Sorcerer are **benchmark/preserve**, not mandatory rewrites in
   this batch. Check aura replacement/party value, Scales' Surge opportunity
   cost, Wild's actual three-basic input route and Bend Luck overlap. Change only
   a demonstrated outlier; no obligation to touch every class for symmetry.

Acceptance: injured/full-health solo and 2/4-player cases; explicit recipient
selection; shared caps; no healing-to-barrier-to-echo loops; no need for a specific
subclass pick to make a passive usable; comfortable touch cadence.

## Delivery gates, pace and next roadmap

The audit fits **one PR**, rather than one review per class. Implementation is
large enough to separate: **three retouch PRs**, each covering related problems,
with permission to split B if required. Then approximately **four to six upgrade
PRs**, starting with design and a two-class pilot against the revised baseline.
That leaves roughly **7–9 implementation/design PRs after this audit**, plus
separate future art direction. These are scope estimates, not time/quota promises.
I cannot see remaining subscription quota or convert repository size into its
five-hour accounting. Reusing the generated inventory, focused regression suites
and existing systems is more economical than repeating whole-catalogue research
or building speculative mechanics in every patch.

Before delivery of each retouch:

1. Name the decision changed and compare two designs for substantial reworks.
2. Demonstrate a complete base + one subclass choice input sequence; default
   autofire is off, held input does not imply repeated casts. Use resolved
   cooldowns (direct attacks are globally slowed), not authored-only numbers.
3. Compare fresh and upgraded fixed encounters: outgoing damage, effective
   healing/shield consumption, useful control time, movement and missed setup.
   Include stationary and moving targets, ground/flight, solo and varied parties.
4. Run targeted regressions for changed mechanics, capped scaling, swaps,
   death/downing, room cleanup, copies/composition, replay and proc ownership;
   check matching existing browser smoke tests when gameplay/presentation changes.
5. Play normal adaptive runs separately. Report evidence, observed feedback and
   hypotheses separately; don't use passing tests as proof of fun or numerical
   equality. Record rejected ideas and remaining tradeoffs briefly.

## Candid milestone feedback and public research

The game's strongest direction is accessible co-op boss combat with immediate
positioning choices. The wolf and bear make class identity visible; guards,
auras and distinct curses make timing/position matter. Its main design risk is
breadth without enough differentiation: many names promise an action the payload
does not clearly deliver. A smaller number of readable, useful choices is more
valuable than making every skill accumulate three conditional riders.

Presentation still reads as a prototype, but replacing models alone will not fix
it. A later visual slice should jointly test silhouette, movement, boss intent,
ability source/target and terrain meaning, first on one hero/form and one boss.
Keep the present readability feedback collection open; no unsolicited FX overhaul
is included here.

Public websites need no private-account permission for ordinary public research.
This environment's published restricted network policy omitted Steam/Reddit;
the earlier proxy 403 was therefore an environment access failure. A draft adds
`store.steampowered.com`, `steamcommunity.com`, `www.reddit.com`, preserving existing
custom domains and package presets. Saving the draft does not activate it; the
user must review/save settings and publish. Even afterward a site can impose its
own rate limits or automation restrictions. No access bypass is proposed.

**No new public community evidence is available for this audit.** Do not present
imagined Reddit/Steam sentiment as research, or extrapolate a few genre reviews
into demand for Warband. Once access is active, the next research pass should
record dated source links and small, explicitly nonrepresentative samples from
comparable boss/co-op games, distinguishing developer explanations from player
opinions and review-selection bias. External patterns inform options; the
player's actual tests and novice mobile/desktop sessions decide whether they
work here. Public research is not a prerequisite for the verified catalogue and
scaling findings in this document.
