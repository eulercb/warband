# Sorcerer: weaving and favorable outcomes

This follow-up replaces Bend Luck's second teleport, replaces redundant passive
Surge generation, and makes spending Surge change more than direct damage.
The user reviews the play feel after repository checks; these tests establish
specific mechanics, not equivalent class balance.

## Combined receiving kits

| Layer             | Before and after sequence                                                                                                                   | Value with other layers owned                                                                                                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Surge Ascent      | Mirror → surged Meteor gives brief flight, +20% movement and a 10%-max-HP shield (minimum 20) for 3s, once/6s.                              | Aerial hazard avoidance still matters; the bubble also protects against direct boss attacks that can hit flight. True Dragon strengthens the bubble to 15% (minimum 30) for 4s and retains its longer flight. Wings' longer flight is never shortened. |
| Spell Weave       | Prepare Surge with a utility → connect a basic or spell within 6s → return 2s to that utility.                                              | Surge is still held for a heavy spell unless Unbound Chaos enables basic spending. One hit recycles utility timing rather than creating another Surge. At protected recovery, gain 20% movement for 2s instead; locks remain intact. Once/6s.          |
| Bend Luck         | Stay in place, bank Fortune 6s and Surge 8s → next positive direct hit makes the victim's wind-ups 40% longer and damage 15% weaker for 3s. | Gives a boss a deterministic unfavorable action window. It uses neither relocation nor random rolls. Can prepare a Meteor or reward a connecting basic while preserving Surge.                                                                         |
| Bend Honed        | Fortune readiness +0.25s/rank, debuff duration +0.15s/rank, Surge readiness +0.25s/rank, plus shared ordinary recharge growth.              | Windows remain useful with Loaded Fate: more time to land the opening and exploit the resulting control. Readiness caps 8s/9s, debuff cap 4s.                                                                                                          |
| Loaded Fate grand | Fortune's opening hit marks that enemy; the owner's next direct hit from a later cast gains 20% damage within 5s.                           | The opening does not consume its own mark, including all shots/pierces of a shared cast. Native suppression/weakness protect the follow-through; the grand rewards selecting the next attack.                                                          |
| Unbound Chaos     | Prepare → spend Surge on a basic fan, or keep it for Meteor. Bend's weakness becomes 25%.                                                   | Its stronger weakness remains separate from Honed timing and Loaded Fate's later-hit damage. Extra basic projectile shares the same enhanced total damage budget.                                                                                      |
| Chaos Crossing    | Phase/Mirror enable movement; Bend repairs 25 HP while banking Fortune.                                                                     | Existing relocation stays on Phase. Bend offers recovery and enemy misfortune while holding position; the grand supplies a later offensive opening.                                                                                                    |

Every Wild first pick (Surge, Tides, Bend, Ward) has the starting Mirror → basic
weave and Mirror/Phase → Meteor Surge sequence against one boss. No adds, rare
pair, extra input or three-basic tax is required. Every Draconic first pick can
prepare with Mirror/Phase and spend on Meteor for Ascent without Wings.

## Distinctive Surge delivery

All consumers retain +20% total direct damage and halve only a real cast wind-up.
The one-use Surge is reserved at cast start; cast completion cannot spend again.

- Dragon Breath sweeps 20° wider on each side (half-angle ceiling 80°) and delays
  enemy wind-ups 30% for 3s. The global reach cap stays intact. Its existing grand
  pushes enemies outward; Honed's wider ordinary arc remains useful before and
  during Surge. Additional reach was rejected because native Breath already
  reaches the shared cone cap.
- Chaos Surge keeps six bolts and its shared enhanced damage budget, focuses the
  fan to at most 28°, and adds one pierced enemy per bolt. Focused Chaos's 14° fan
  and speed remain useful outside Surge and improve the surged volley further.
  Already-piercing copies add the rider rather than replace existing pierces.
- Tides adds 50u radius and delays wind-ups 30% for 3s. Shared area caps still apply;
  Gravitic Tides' inward pull changes positioning after the larger burst.

## Ownership, failure and synthesis

Fortune is a priced `fortune` component: readiness, suppression, weakness,
debuff duration and optional mark bonus decompose, recompose, fit, scale, cap and
refresh. It fits self buffs, blinks and ground utilities; a copied Fortune works
without importing the Wild passive. A Forge utility without Surge preparation
cannot arm Spell Weave. Starting utilities remain the fallback in a native kit.

Surge delivery is carried by enriched `surgeStrike` components, with explicit
value and caps. Cone widening fits cones, burst radius fits point-blank bursts,
and fan/pierce fits projectiles. Explosive or zone-carrying copies remove the
unavailable Surge piercing rider before synthesis pricing and descriptions;
execution also rejects piercing and extra zone-producing twins. Authored damage
budgets, Haste/recovery floors, ordinary recharge limits and global geometry caps
remain shared.

Only positive direct hits can use Fortune, Weave or Loaded Fate. Ticks,
supplemental damage, immunity and zero damage preserve readiness. Fortune does
not spend on a killed recipient; it cannot mark a corpse. Downed/zero-HP owners
cannot spend it. Passive changes clear personal readiness and preserve proc
gates; copied Fortune is tied to the active class. Expiry drops unspent windows.
Weakness shares the existing strongest-family rule, and Fortune refresh preserves
stronger existing Fortune debuffs. Host cast tokens are private; public marks
expose only their owner, strength and remaining time.

The Fortune badge and empower cue show preparation. A successful hit emits its
payoff cue and actual enemy suppression/weakness badges. Loaded Fate adds an
owner-tagged vulnerability badge. Ascent emits flight/movement and absorption
feedback; Weave's refund or movement fallback emits haste feedback. No new combat
button is required.

Rejected overlaps: another Bend blink/guard, passive Surge production while
Mirror/Phase already prepare it, a second cooldown refund on Fortune, and a reach
bonus above the existing cone cap. The implementation uses deterministic enemy
misfortune plus a later owner attack, leaving Phase responsible for relocation.

Focused evidence: `tests/sorcerer-luck.test.ts` exercises every actual Wild first
pick, native/composed Fortune and off-axis Breath/outer-ring Tides, real Forge
Fortune synthesis, cast-token/owner isolation, expiry/class gates, shared damage
and Ascent bubbles/cues. Existing caster/support passive tests now verify the
weave through actual input and protected-recovery fallback. Parent integration
covers Honed/grand/identity combinations and repository release gates.

## Description readability and text entry

Upgrade/grand cards now focus on the changes a choice adds. Redundant notes such
as “controlled-target bonus remains”, “preserve the chosen fan width” and shared
ordinary-budget reminders were removed across the catalogue. Important targeting
and trade-offs remain, including ground-only following fields and damage split
between static fields and poison. Additive bonuses use compact `+X%` notation;
this does not change their arithmetic. Unbound Chaos names its actual utility
benefits instead of “power and footprint”. Instant spells no longer promise a
wind-up reduction; charged spells still do.

A collapsed **Combat & upgrade rules** reference is available in the reward list
and Controls → Options (also reachable from pause). It explains additive versus
multiplicative percentages, shared recovery/geometry limits, shield scaling and
caps, grand slots and Surge's total projectile budget. It stays out of the
walkable arena unless requested, supports keyboard/gamepad focus, and scrolls
on a phone. This is a first editing pass, not a claim that every description
has reached its final wording.

Hero-name inputs now retain keys bound to movement or abilities. Focusing an
editable field clears held movement/attack state; leaving it restores gameplay
bindings. Inputs, textareas, selects and inherited contenteditable regions are
covered. Real browser checks type `Wade Qwerty asdf` into the actual host name
field at desktop and 320px phone sizes.

## Owner live-test guide

1. In the name room, type a name containing W/A/S/D/Q/E/R and spaces. Confirm the
   letters appear without walking or firing. Try a rebound movement key too.
2. Read Conducting Lance, Frostvolley, Extinction and a Honed card. They should
   describe their added benefit without repeated unchanged-effect notes. Open
   the rules reference in Controls → Options and the reward list.
3. Wild Magic: Mirror → basic hit should recycle Mirror while leaving Surge
   available. Phase at its protected recovery minimum should give the short
   movement fallback instead. Try each subclass first pick against one boss.
4. Bend Luck should not move you. Its clover readiness is followed by enemy
   suppression/weakness when a direct attack connects. With Loaded Fate, use a
   later attack on the marked foe; other players and opening fan shots cannot
   consume the extra damage. Compare Honed timing and both identities.
5. Draconic: Mirror → Meteor should show Ascent's shield and speed even against
   attacks that hit flyers. True Dragon should give the larger, longer shield.
6. Compare ordinary/surged Breath's wider sweep, Chaos Surge's narrower piercing
   volley, and Tides' larger suppression burst. Check with their grands too.

The roadmap remains at **9/12 authored classes**. Cleric/Paladin/Bard are the
last content cohort after acceptance; the complete-system balance, acquisition,
graft and compatibility review follows. No arena, camera or difficulty-scaling
formula was changed here.

## Validation

- Final serial full suite: **4,128/4,128 tests pass** across 164 files.
- Unchanged coverage gates pass: branches **98.01%**, statements 99.41%,
  functions 99.65%, lines 99.78%.
- Build/typecheck, lint, formatting and both generated audit checks pass.
  Recharge audit: 6,144 observations / 2,544 profiles, 4–28s.
- All eight caster grand browser cases pass at desktop and 320px touch sizes.
  Sorcerer browser checks also confirm Fortune readiness, Ascent shield activation
  and the revised Weave/Surge flow through actual keyboard and touch controls.
- Actual host-name typing and expandable rules pass at both sizes; the final
  high-contrast reference scrolls through its last paragraph on the phone.

The first full run found two obsolete description assertions after the shared
shield rules moved into the reference. They now verify the displayed absorption
value; the actual health-scaling, damage and recipient checks remain. Coverage
review added behavioral edge checks and found/fixed the missing-radius copied
burst shrinking on Surge. No gate, timeout or gameplay assertion was relaxed.

CI follow-up: the support browser smoke still expected the removed shared-cap
sentence in Heal's tooltip. It now checks Heal's healing/rescue bubble fractions
and individual ceilings, then opens the optional rules reference through pause
and verifies the 50%-of-max-health shared cap there. This preserves the coverage
of the rule in its new location without restoring repeated tooltip text.
