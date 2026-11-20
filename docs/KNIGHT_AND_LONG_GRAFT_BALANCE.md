# Knight encounters and longer graft histories

This batch adds 336 Knight fights, bringing the fixed-encounter matrix
to 1,890 fights across six lead classes and twelve subclasses. Champion
binds Second Wind. Battlemaster compares Precision Volley and Rally.
Each first pick uses no identity, identity A and identity B, with Dragon
and Lich over the same six seeds in solo and duo. The Knight lead's
partner is a fixed Quarry Shot Ranger. The other cohorts keep their
Knight partners.

Run `node scripts/measure-fixed-encounters.mjs` from the repository root.
The lead controller uses Bash, the chosen subclass skill, and a moving
response to committed attacks. It tries to shield as a threat approaches.
The inputs exercise actual cast, movement and targeting rules. It does
not plan exact protected lanes for the Ranger or decide case by case when
a utility should be cast standing still.

## Knight results

| First pick       | Identity          | Dragon clears | Lich clears |
| ---------------- | ----------------- | ------------: | ----------: |
| Second Wind      | No identity       |         12/12 |        5/12 |
| Second Wind      | Unbroken Champion |         12/12 |        5/12 |
| Second Wind      | Warlord’s Tempo   |         12/12 |        5/12 |
| Precision Volley | No identity       |         12/12 |        0/12 |
| Precision Volley | Grand Tactician   |          9/12 |        0/12 |
| Precision Volley | Perfect Maneuver  |         12/12 |        0/12 |
| Rally            | No identity       |         11/12 |        4/12 |
| Rally            | Grand Tactician   |         12/12 |        1/12 |
| Rally            | Perfect Maneuver  |          6/12 |        1/12 |

Unbroken Champion spent 134 charges from projected guard pools in the
unranked fights, including three observed projectile interceptions.
Shared pools can also spend charges on personal frontal blocks or boss
waves. The projectile count only includes observed contacts away from
the shield owner. Warlord’s Tempo converted 118 ready challenges into
counter preparations. Its median Dragon clear took 66.0 seconds, versus
74.4 for Unbroken. Cover protection remains conditional on the route
taken by the attack and the ally.

Grand Tactician steered 121 boss contacts and eight summon contacts with
Precision Volley, including 35 boss starts during a windup or channel.
The Rally route recorded 83 boss contacts, one summon contact, and 34
starts during a boss action. These counts include Shield Bash as well
as the selected skill. Perfect Maneuver launched 72 steps with Precision Volley and 108 with Rally. In the Rally route,
its six Dragon misses were timeouts with zero downings. The policy can
step when the player would prefer to heal and hold position, so a
standing-cast versus retreat-and-cast comparison is needed before
interpreting the timeouts as a balance defect. Keep both identity values.
A Lich trio with a dedicated ally healer and an add-clear policy would
help distinguish survival and target selection from raw damage on
Precision Volley.

Field Medic replaces Shield Wall on Unbroken Champion while leaving
the projection on Taunt. It cleared six Lich fights against five
for the original kit. Impenetrable at ranks one and three spent 176
and 239 charges from projected pools, with four and five Lich clears.
More available charges do not imply more protected allies under this
movement policy. Grand Tactician with Precision Volley cleared
9, 11 and 12 Dragon fights at zero, one and three Concussive Bash ranks.
Those three groups still cleared zero against Lich.

### Confirmed cover preview fix

During Dragon Fire Breath, a shield could protect the owner and an
ally with a single charge even when the owner could not reserve the
charge on their own. The preview checked each person in isolation,
so the owner’s indicator was missing. The snapshot now uses the
same threatened group as the pulse, once per boss. The regression
checks both players’ indicators, zero preview charge cost and one
shared charge consumed when the breath hits.

## Graft lifecycle over twelve stops

Run `node scripts/measure-graft-acquisition.mjs`. This keeps the original
four-stop acquisition panel. It extends the installed-graft sample through
three cycles of four ordinary rewards. The same history carries forward.
Each of 2,048 seeds per pairing starts with an installed graft and one
banked native rank. The policy takes one donor upgrade, then reclaims the
native skill, then re-equips the graft when offered. It skips unrelated
character picks. The simulation uses normal reward draws. Terminal
reward banks, paid rerolls, and class additions remain outside this
sample.

| Recipient and graft    | Full cycle by stop 4 | By stop 8 | By stop 12 | Reclaimed by stop 12 |
| ---------------------- | -------------------: | --------: | ---------: | -------------------: |
| Knight, Field Medic    |                   10 |       116 |        323 |                1,731 |
| Ranger, Field Medic    |                   14 |       161 |        375 |                1,738 |
| Druid, Borrowed Anthem |                   16 |       128 |        341 |                1,712 |
| Knight, Warlock’s Hex  |                   13 |       126 |        296 |                1,731 |

By stop 12, 83.6–84.9% reclaimed the native after upgrading the graft,
and **14.5–18.3%** also re-equipped the upgraded graft. Each completed
sequence verified both skills retained their earned upgrades. Re-equipping
is the slower part of the sequence. This supports testing whether re-offers
make build changes feel accessible in a real run. Keep the rates for now
while testing histories that choose competing boons along the way.

Next, measure Berserker and Totem, then both Monk subclasses to finish the
martial cohort. The whole-roster power and usefulness passes follow after
all classes have representative results.
