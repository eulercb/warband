# Devotion, Vengeance and Valor purpose review

The findings below record the pre-redesign kits. See [Unyielding Faith](UNYIELDING_FAITH.md) for the current Devotion implementation.

The owner merged and tested #184. Living Refuge's flyer exclusion, ejection and
Bastion compensation are the accepted Life baseline. This completes the first
inspection of all 24 subclasses. The recommendations below distinguish working
growth from a distinct playstyle.

| Identity             | Current preparation and payoff                                                                                                                                        | Finding                                                                                                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Covenant of Steel    | Time Divine Shield, then face a follow-up hit after its immunity wears off. Carry the earned counter into melee, or lean on strike leech and Consecration movement.   | Retain the block-to-counter route provisionally. Unbreakable already supplies two blocks and Radiant Riposte supplies a counter, so this combination buys reliability more than a distinct loop. |
| Unyielding Faith     | Cast Divine Shield close enough to weaken enemies, then land the melee connection. Heal and optional skill riders help separate recipients at separate times.         | Purpose open. The challenge-to-counter sequence overlaps Champion’s Warlord’s Tempo. The weakening has no aggro redirect, and heal speed, protection and cleanse do not form one choice.         |
| Avenging Wrath       | Place Consecration or apply a control skill, then spend the controlled interval on Holy Strike and any compatible direct special.                                     | Retain as control exploitation growth. Relentless Procession already provides a slow after the first aura melee contact. Compare next-hit usefulness with and without that passive.              |
| Relentless Vengeance | Use Divine Shield to close the gap, then sustain through direct hits. Optional Charge and Hunter's Vow add alternative recovery.                                      | Purpose open. Movement speed and leech improve uptime without changing where or how you pursue.                                                                                                  |
| Hero’s Ballad        | Slow with Mockery or Dissonant Whispers, then exploit control with projectiles or melee. A utility-bound build can also wait for guarded damage and counter in melee. | Retain as growth for now. Battle Hymn or Bolster alone can prepare a counter with no melee outlet in the native first-pick kit. Flourish gives a melee outlet only when also bound.              |
| Battle Rhapsody      | Heal a hurt recipient for speed, soften the next wind-up with Dissonant Whispers, then use melee leech or ward nearby allies depending on the pick.                   | Purpose open. It has no connection to the decision of when and where to spend the base kit's two verses.                                                                                         |

## Actual first picks

All Paladin first picks have Holy Strike, Consecration, Lay on Hands and Divine
Shield. Before taking damage, Divine Shield starts Bulwark and Consecration can
be placed for control or healing. Lay on Hands only starts Renewal from effective
healing. Devotion's Oath Anchor answers control when an aura starts. Vengeance's
Procession extends an active aura after the first connecting melee hit and slows
that victim. Opening an aura and spending Procession are different events.

- **Divine Smite** adds melee sustain to Devotion. Magnetic Oath can pull a foe
  into reach, which already changes positioning independently of the identity.
- **Sacred Weapon** opens a full-health Pursuit aura. Guarded Weapon already
  adds a frontal block. Another block gate would overlap it directly.
- **Bless** gives another effective-heal route to Renewal. Blessed Reprisal
  empowers the recipient, but a full-health solo opener still uses Divine Shield.
- **Aura of Protection** opens Bulwark with an immediate nearby barrier.
  Unbroken Circle adds self-control protection and already overlaps Oath Anchor
  on activation. That overlap limits the value of another cleanse rider.
- **Hunter’s Vow** opens Pursuit. Unflinching Hunt provides a frontal block
  alongside it. Vengeance can exploit a slow through Consecration or Procession.
- **Vow of Enmity** supplies a burst slow for Wrath and a pull with Gather the
  Guilty. The opening Divine Shield remains available even without that pull.
- **Avenging Charge** changes approach geometry and can protect the first ally
  actually crossed with Guardian Crossing. A new approach mechanic should offer
  a route to the other three picks and preserve Charge's own travel decision.
- **Wrathful Smite** provides a daze; Exiling Judgment can deliberately push an
  enemy away. A Vengeance rework must leave a meaningful choice about whether to
  follow rather than automatically undo that spacing.

All Valor first picks have ranged Mockery, Healing Word, Dissonant Whispers and
Inspiration. Effective healing earns Harmony, Discord casts supply Discord,
and an Inspiration chorus can spend both. The Rallying Chorus passive adds a
short frontal block to eligible nearby allies. A lone full-health Bard cannot
assume an effective heal before taking a hit. Both current identities still
have an opening through Dissonant Whispers or Mockery, but a new identity tied
exclusively to chorus completion would need its own convincing opening route.

- **Blade Flourish** adds a close Discord option, with a positioning payoff from
  Sweeping Flourish. Inspiration is still the spender.
- **Battle Hymn** adds a competing chorus button. Steadfast Hymn already provides
  control protection independent of the defensive chorus block.
- **Bolster** offers movement and a cleanse, including a group chorus use.
  Resounding Courage supplies a separate close-hit finisher.
- **Shatter** adds close Discord territory and a reactive Retort with its grand.
  Retort already asks the player to time an incoming hit or land the next attack.

Ordinary and Honed ranks chiefly increase payload, scope or availability. The
starting-slot grands already supply stronger frontal blocks and a parry, a
following Consecration, a low-health follow-up hit, Inspiration absorption, a
healing grove and a Dissonant Whispers pull. Accordingly, a new support identity
should add a decision that survives these combinations. Another activation
cleanse, a larger frontal block, a recovery field or unconditional knockback
would duplicate a nearby option. These comparisons describe authored contracts
and availability. They do not measure relative power in player runs.

For the default solo Ballad opener, use Dissonant Whispers' 2s slow, then
aim Mockery. Mockery's effective 1.1s basic recharge exceeds its 1s base slow,
so repeated same-distance Mockery hits alone do not sustain this window.

## Superseded proposal: Relentless Vengeance

The owner reviewed this proposal after #185. See the [revised approach decision](RELENTLESS_VENGEANCE_APPROACH.md) for the current prototype direction.

One bounded Sol 6.2 High review recommends testing a quarry-bound follow-up.
Cast Divine Shield, land the first positive melee hit during its Bulwark aura,
and mark that enemy for a deliberate fresh press of Shield during cooldown.
The recast would move the Paladin along a short, cover-checked route to the
quarry's current melee edge. Bank the move if the boss is about to retreat,
or take an off-axis position before its next attack. The movement carries the
existing personal aura to the front line, which gives nearby allies an
opportunity to regroup without forcing them to move.

The starting Shield and Holy Strike supply this sequence with each first pick.
Hunter's Vow competes by replacing the source aura. Enmity and Wrathful Smite
can set up the melee contact. Charge remains the freely directed opener and
keeps its existing ally-crossing role. Wrath A invests in a chosen ground
position or other control source. The proposed B route invests in one enemy
and makes committing to its current position a player decision.

The prototype must resolve whether pointer and stick can select a predictable
off-axis route around a stationary boss. Test a straight follow as the control
case. A simple gap closer would have little use against stationary bosses and
would compete directly with Charge. Check collision and blocked destination
feedback, along with a committed line or cone attack that must keep its original
geometry and timer. Reusing Shield for movement must grant no second immunity
or aura and must preserve its normal recharge. Held input cannot commit the
move. A ready normal Shield cast takes priority.

Show a visible quarry and proposed landing, including invalid range or blocked
travel. Zero-damage and supplemental hits cannot claim; misses, obstructed paths
and invalid targets cannot spend. Replacing the source aura, target death or
conversion, class change and downing clear preparation. Keep each player's
claim independent. A portable version must earn and spend on an actual retained
Shield-like aura and compatible melee attack. Validate actual native and
synthesized casts and price the component before shipping a Forge claim.

Unyielding Faith should next test an ally protection decision separate from
Champion's facing guard. A bodyguard redirect requires its own review because it
can change who takes a hit during a committed attack. Battle Rhapsody should
test control over where a performance reaches, with a solo opener demonstrated
before tying its core payoff to Harmony. Automatic parries, blanket chorus
shield refreshes and a generic leech upgrade are poor substitutes for these
decisions.

This batch resolves priorities and documents a prototype gate. It ships no
combat changes. The baseline support-loop, support/martial passive, support
grand and Paladin aura suites passed 102 tests, and the smoke contracts passed.
After the three purpose findings, proceed to whole-system encounter comparisons,
ordinary upgrades, acquisition and grafts, then the visual milestone.
