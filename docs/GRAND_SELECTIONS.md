# Grand selection framework and earlier rewards

Follows merged/live-tested PR #133. The owner reports that the cooldown, reach,
area and duration limits feel good; keep them through the content redesign and
reassess after the new upgrades/grands have replaced excess numerical growth.
This delivery changes ownership, selection and pacing, using existing content.
It does not claim that the new authored grand catalogue is finished.

## What a player can do

Every five-boss clear grants **one grand unlock per hero**, starting with clear 5,
independently of the existing subclass/second-skill/class progression. Choose any
eligible alternative in the grand panel. A new grand auto-equips only if its bucket
has room and its skill has no competing grand. Otherwise it stays banked. At a full
bucket, explicitly name the outgoing grand before equipping its replacement.
Already earned choices can be equipped/unequipped freely between fights, without
spending a normal boon or another grand reward. Combat, including paused combat,
is not a respec window. A skipped opportunity expires at the next fight; alternatives
remain banked. Grand selection never blocks continuing the run.

Each owned class has its own bank and these active buckets:

| Bucket                                                      |                      Maximum |
| ----------------------------------------------------------- | ---------------------------: |
| Starting skill, including basic attack or an equipped graft | 2, different occupied skills |
| Individual equipped subclass skill                          |                            1 |
| Subclass/kit identity                                       |                            1 |

Only the active class's selected grands generate new effects or contribute stats.
Changing classes preserves cooldowns, protected recovery and health proportion.
It does not grant a free heal or refresh a grand. Already committed zones/projectiles
finish with their stored skill payload; switching is not a cancellation rule. Current
owner stats/buffs still follow the existing impact/tick damage calculation, so a
newly active stat grand can affect an ongoing attack. This patch does not introduce
a separate snapshot rule for grand stats; include that interaction in cohort review.
Ordinary class/hybrid stat upgrades retain their existing identity-bound behavior.
The estimator reads the live resolved kit and stats, never the whole earned bank.
Its growth/correction coefficients are unchanged: the existing expected-power curve
models normal per-clear growth rather than counting accumulated grands. Later build
comparisons should still test late-run difficulty with the new finite grand ceiling.

The reward room includes a stationary dwell-to-open **Grand selections board** to the right of
spawn, away from the boon row and descent vortex. It opens the same controls as the
list fallback. Opening it freezes room interactions and consumes no boon. Walk away
before opening it again. The terminal gauntlet screen presents a collapsed grand
panel alongside its existing progression controls. The bank is also available after
a defeat for changes before a retry; the single-fight editor uses the
same validator with unrestricted test unlocks. No mobile controls were removed.
Choose/review grands before marking ready or continuing.

## Transitional content, explicitly

There are **no authored individual subclass-skill grands yet**. The fourth bucket
is supported and tested with a focused fixture, but intentionally has no generic
placeholder content. Most current classes can therefore equip three grands until
the content cohorts supply that slot. The final four-slot path can fill by clear 20;
that is not a claim that every class can already fill all four in this patch.

Ten old whole-class entries actually modify one starting skill. Their stable IDs
now count in the appropriate base-skill bucket: Warlord's Wrath, Deadeye, Arrow Storm,
Cataclysm, Grand Venom, Sacred Grove, Grand Symphony, Wild Magic Surge, Meteor Swarm
and Pact of the Fiend. They cannot bypass the two base-skill slots or empower a
native skill hidden by a graft.

The other fourteen old kit-wide entries temporarily share the **identity bucket**
with the existing subclass grands. A fresh unlock requires that class to have a
subclass skill; an already earned legacy choice remains usable through migration.
This preserves useful content and power as alternatives without creating extra
slots. They are not the final two authored identities per subclass. Cohorts must
fold/rework these designs and their stable IDs into the final catalogue, with an
explicit migration, rather than leave an extra class-grand category behind.

Rogue/Warlock pilot grands are included in these rules and remain scheduled for
content retouches next. The current catalogue still has 182 entries; the proposed
192 native plus provisional graft catalogue remains a design target, not delivered
content. Ordinary upgrade reworks and new class mechanics remain cohort work.

## Ownership, migration and authority

`GrandLoadout.version = 1` separates `bank` and `equipped` lists by class from the
ordered ordinary upgrade history. Session/loadout boundaries migrate older
accumulated grand IDs: retain all valid earned options, equip the first eligible
choices that fit, and show the rest as banked. Migration is deterministic and
idempotent. Host and client receive the authoritative state; clients do not award
themselves options optimistically. Fight-start messages include the state so a
restarted/late client can restore its display. Existing late-join waiting rules
still apply; this does not add mid-run reconnect/resume storage.

Host validation rejects unearned equips, invalid classes, wrong subclasses,
conflicting skills, extra base-slot selections, ambiguous replacements, repeated
unlocks and in-combat transactions. Sending a grand through the ordinary-upgrade
channel cannot bypass the ledger. The client ignores grand-state messages from a
peer other than its connected host. Bots use the same earned-bank/bucket reducer
and prefer an empty bucket over another banked alternative; existing bot subclass
progression behavior is unchanged.

Graft grands belong to the borrowed skill in the selected class, count in its two
base-skill slots, and require the graft to occupy its slot. Reclaiming/replacing it
leaves the option banked but inactive. Re-equipping an earned choice is explicit
and free after restoring its matching skill; it never transfers to the new occupant.
Changing a class/subclass or graft cannot secretly evict another active grand.
The editor shows dormant choices and their missing requirement.

Direct engine fixtures without a versioned loadout retain legacy replay behavior
for historical content/audit comparisons. Actual sessions and test-loadout starts
migrate explicitly. Thus the old catalogue/recharge audits are legacy stress states,
not claims that all listed grands can be simultaneously equipped in the new flow.
All participants should refresh to the new build; mixed old/new client protocols
are not a supported migration mode.

## Verification and next review

Tests cover migration/slot boundaries, native/graft/reclaim, specific subclass-skill
recipient matching (without double application), bank isolation, swap cycles,
identity-bound stats, HUD/pause parity, host credits/phases and client synchronization.
The real-host browser fixture drives three five-boss clears and the production
controls at desktop/phone sizes, including an independent subclass pick and the
next fight's actual kit. Room tests cover board dwell, freeze and re-arming.

Owner playtest: choose a grand and subclass after the first gauntlet; reach a full
base bucket and bank another option; explicitly replace one; try a graft/reclaim;
then compare classes with distinct grands. Check the walk-up board and menu on a
phone. Existing cadence/range bounds remain unchanged.

Next is the **Rogue/Warlock content pilot retouch**, including real individual-skill
and subclass identity designs, followed by remaining class cohorts and a whole-system
review. Author new identities against the actual base/subclass replay and class-swap
lifecycle; new player-wide or conditional stat effects need fresh host/preview parity
and no-double-application tests. Do not infer that the framework automatically
implements every future mechanic merely because it has a slot for it.
