# Nature purpose review — Hunter, Beast Master and Land

Historical review. See the subsequent
[Beast Master purpose and Hunter range delivery](BEAST_MASTER_PURPOSE.md)
for the implemented follow-up; Land remains the next open nature task.

The owner merged/tested Shadow commitment (#167) and accepted moving on. One
bounded Sol 6.1 high review inspected these three remaining nature subclasses,
including their base kits, passives, first picks, ordinary/Honed upgrades,
individual grands, identity recipes and combat execution. Moon stays retained.

## Findings and delivery decision

| Subclass     | A                                                                                                                              | B                                                                                                                             | Decision                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Hunter       | Apex Predator grows controlled-target damage on the existing Rain → direct-shot route.                                         | Relentless Hunt distributed Roll sprint/resistance, direct suppression and field movement without a distinct attack sequence. | Retain A as conditional growth. Implement [returning shot geometry for B](HUNTER_RETURNING_SHOTS.md) first.  |
| Beast Master | Faster wolf command windup and stronger controlled bites amplify Pack Bond; Roll guard and strike bonuses remain extra growth. | Healing, mitigation, speed and leech are spread across unrelated actions.                                                     | Retain the working wolf/skills. Both identity purposes need their own bounded follow-up.                     |
| Land         | Wrath amplifies Entangle → controlled strikes and field ticks.                                                                 | Its +20% field movement duplicates Living Paths; relay healing alone needs another wounded ally.                              | Retain A as growth and the useful terrain/healing skills. Rework B later around a coherent terrain decision. |

Only Hunter B's replacement is implemented here. Review completion does not make
Beast Master or Land redesigned, balanced or accepted. Their numerical riders
remain functional while their purpose work stays open.

## Actual first-pick routes

All rows start at full health against one boss, without adds, a second subclass
skill or a rare grand.

| Subclass / first picks              | Available route and review consequence                                                                                                                                                                                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hunter: Hail, Quarry, Stand, Volley | Starting Rain can control foes for A; starting Multishot supplies B's return route regardless of first pick. Hail pushes nearby foes, Quarry pierces a line, Stand provides overhead territory, and Volley supplies its own fan.                                        |
| Beast: Pounce, Snare, Bond, Bite    | Starting Arrow/Multishot commands the actual spirit wolf. Starting Rain supplies control for stronger bites. Bond's effective healing can prepare the existing wolf ward when injury occurs; the basic solo route does not require that injury.                         |
| Land: Earth, Thorns, Gust, Spring   | Starting Entangle supplies physical ground control and Living Paths; Thornlash/Cyclone provide direct follow-through. Regrowth is available after injury, but neither full-health play nor the first-pick route depends on relay healing reaching another wounded ally. |

## Layer and targeting evidence

Hunter's Exposed Quarry is already an explicitly party-shared, refreshing,
nonstacking direct-hit vulnerability. A's stronger controlled shots are useful
conditional power, not a new interaction. Frostvolley already supplies freezing;
Pursuing Rain already follows a foe. More slow or following territory would
repeat those roles. Hail's grand strengthens displacement, Quarry's grand adds a
blast, and concentrated Volley's narrow fan remains a meaningful geometry choice.
Honed damage, speed, fan and control remain relevant to receiving shots.

Pack Bond is actual companion behavior: a direct hit commands one spirit bite,
with a 2.5s command interval, range and active-owner rules. The wolf crosses cover
and reaches flyers, but does not tank, block pathing or choose its own opponents.
Effective dedicated healing prepares its ward for the healed recipient. B's
support identity cannot claim that existing loop merely by adding more healing.
Pounce/Bite grands, Snare's root and Bond's heal/ward layers must be compared
before adding another companion or protection rider.

Living Paths already gives friendly-field movement and enemy windup suppression.
Eternal Season's identical 20% movement flag has no additional baseline value on
that recipient. Land fields are physical ground effects; overhead Hunter rain
has different targeting. Wall of Thorns currently resolves as a damage/healing
zone, not a solid pathing wall. Gust also has an authored 260u summary despite
the current 200u cone cap; its readout correction belongs in the Land follow-up. Creeping/following fields and generic stronger
slows alone do not resolve Land B's purpose. Relay healing is useful support,
but its other-wounded-recipient condition cannot establish a universal solo loop.

Relevant sources are `content/classes.ts`, `content/subclasses.ts`,
`content/subclassPassives.ts`, `content/charUpgrades.ts`, `combat/subclassPassives.ts`,
`combat/companions.ts` and the delivery/zone paths in `combat/abilities.ts` and
`world/world.ts`. Actual Forge receivers depend on retained delivery and payload;
a field, explosion or companion cannot be assumed from a display name.

## Distinction and next work

Hunter B changes a projectile's second leg using the live caster position. It
leaves enemy perception and decisions intact, unlike Whispers; creates no portal
or cover like Aperture; and changes neither enemy steering nor a body return.
It differs from Totem's reusable origin, Shadow's fixed future strike, and Open
Hand's body-carried attack. Keeping a simple full-range Arrow also preserves a
useful alternative to the return route.

After Hunter live acceptance, address **Beast Master purpose work**, then **Land**.
Use a bounded review focused on their recorded gaps and actual companion/terrain
interactions. Do not copy the wolf's existing heal-to-ward hook, replace an
identity with another damage/mitigation package, or force new mechanics into
otherwise useful skills. Remaining caster/support reviews, whole-system tuning
and the visual milestone follow. See [development status](DEVELOPMENT_STATUS.md).
