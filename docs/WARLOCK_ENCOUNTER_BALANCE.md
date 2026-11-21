# Fiend and Great Old One encounter comparisons

This batch adds **444 Warlock fights**. The fixed matrix now has **4,458
fights across all twelve classes and twenty-four subclasses**. Run
`node scripts/measure-fixed-encounters.mjs --class=warlock` for the Warlock
cohort or omit the filter for the full matrix.

Each first pick uses six matched seeds, solo and with Knight, across the
base subclass and both identities. Hurl Flame and Infernal Claim compare
projectile burst and curse-dependent detonation. Mind Blast and Tentacle
of the Deep put Thought Break at different engagement distances.

The controller positions for Hex's fixed placement, uses Claim when the
engine finds a valid cursed target, and holds Surged strikes for a wind-up
or channel that the attack can reach in time. It uses the Aperture entrance
when the fixed exit points toward the boss, and presses Blessing again for
the ember. It uses Elder Mind's public preview to leave an impending fixed
circle. A matched comparison ignores that preview while keeping the
identity equipped. The controller's foresight response covers circles and
does not attempt to anticipate tracking beams or redirect other attacks.

## Combat fixes

- **Field timing.** Rounding could drop the last half-second tick of a
  ranked Hex at 20 Hz. The shared zone timer now accepts exact cadence
  boundaries despite rounding and only accrues time that the zone still
  has left. A 9.5-second Hex now deals all 19 ticks when occupied throughout.
- **Aperture cover.** A boss just outside the barricade could dissolve it
  because the path check treated its clearance margin as solid. A nearby
  boss can now detour around the actual barricade, and a stationary one
  leaves it in place. Blocked routes still dissolve the barricade when
  there is no way around.
- **Infernal Pact offer.** Dark Resilience's additional siphon applies to
  each cursed target it hits, up to the skill's existing limit of two.

The full rerun reproduced all 444 focused Warlock rows and matched all
4,014 earlier cases by build, seed and encounter. Of the earlier cases,
153 changed outcome and total clears moved from 2,245 to 2,238.
Individual effects depend on when players or bosses occupy each field.
Use this rerun as the baseline for cross-roster comparisons.

## Unranked comparisons

Each clear count combines six solo and six Knight duo fights.

| First pick           | Identity          | First boss clears | Second boss clears |
| -------------------- | ----------------- | ----------------: | -----------------: |
| Hurl Flame           | None              |          Dragon 8 |        Beholder 11 |
| Hurl Flame           | Infernal Aperture |         Dragon 10 |        Beholder 12 |
| Hurl Flame           | Infernal Pact     |         Dragon 10 |        Beholder 12 |
| Infernal Claim       | None              |          Troll 12 |             Lich 5 |
| Infernal Claim       | Infernal Aperture |          Troll 12 |             Lich 6 |
| Infernal Claim       | Infernal Pact     |          Troll 12 |             Lich 5 |
| Mind Blast           | None              |         Dragon 10 |             Lich 6 |
| Mind Blast           | Elder Mind        |          Dragon 9 |             Lich 7 |
| Mind Blast           | Whispered Doom    |          Dragon 9 |             Lich 3 |
| Tentacle of the Deep | None              |          Troll 11 |        Beholder 10 |
| Tentacle of the Deep | Elder Mind        |          Troll 12 |         Beholder 8 |
| Tentacle of the Deep | Whispered Doom    |          Troll 12 |        Beholder 10 |

The counters track Aperture openings, barricades, accepted transits, embers,
the two revealed moves and confirmed Thought Breaks. A transit measures
entry accepted by the engine. It does not establish that the shot hit.
Foresight movement measures time the controller requests an early retreat.

- **Fiend.** Aperture with Hurl Flame admitted 241 projectiles and fired 38
  embers over 24 fights. Pact and Aperture each cleared 22 of those fights.
  With pre-equipped Deepening Hex, Aperture cleared 22/24 at zero ranks,
  23/24 at one and 24/24 at three. This comparison does not include the
  cost of picking Hex over alternatives.
- **Great Old One.** Whispered Doom interrupted 64 actions with each
  first pick at zero ranks. Mind Blast had 47 first and 31 second reveals
  with Elder Mind when the controller acted on circles. It cleared 16/24,
  versus 17/24 when the same build ignored previews. That narrow response
  policy gives little basis for tuning foresight. A follow-up can test
  advance repositioning during tracking and lane attacks. Mind Blast with
  Doom cleared 12/24 at zero Honed ranks, 16/24 at one and 13/24 at three.

These outcomes support keeping current Warlock balance values for the
whole-roster pass.

## Matched Lich trios

Each Warlock and Knight pairing stays fixed while the third slot rotates
among Hunter damage, Whispers utility and Life protection. Each composition
uses the same six seeds and encounter scaling.

| Third slot       | Infernal Claim, Aperture | Mind Blast, Whispered Doom |
| ---------------- | ------------------------ | -------------------------- |
| Hunter damage    | 3 clears, 3 wipes        | 3 clears, 3 wipes          |
| Whispers utility | 6 clears                 | 6 clears                   |
| Life protection  | 6 clears                 | 6 clears                   |

Both Whispers and Life comps cleared without a downing. The Hunter comps
recorded 11 and 13 party downings, respectively. This puts ally support
and damage uptime on the list for the cross-roster pass.

**Next** is the whole-roster power and progression pass, comparing builds
with similar roles on the corrected baseline. Then review usefulness and
reward choices, followed by the visual revamp and boss and encounter revamp.
