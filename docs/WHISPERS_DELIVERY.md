# Whispers perception delivery

Rebased onto `acac0ac` (#146), preserving the accepted Mantle afterimage.

The owner authorized implementation after one bounded Sol 6.1 high planning
review. The same reviewer checked targeting/ownership once; no agent tree or
model comparison was used. `AGENTS.md` makes this the default for substantial
design work, while routine implementation stays with the agent.

## Implemented kit

- Private Nightmare replaces Echoed Refrain. A direct hit, or damaging field in
  a forged kit, learns one foe's secret for 8s. Basics preserve it. A later
  Discord special, Harmony heal, blink or Discord field spends it on a fixed
  nightmare. The foe finishes committed attacks, then genuinely retreats.
- Placement is the decision: Bard's cast position for direct specials, selected
  healing recipient, blink departure, or Words' center at the first positive
  marked-target tick. Full-health Harmony heals can spend without inventing
  healing score or preparing Harmony from overheal.
- Voice of Madness projects the nightmare 100u beyond the marked enemy in your
  aim direction, letting you choose its retreat side.
- Unheard Dirge replaces retreat with a stationary false quarry. The foe
  approaches it and aims its next eligible cone, targeted circle, charge,
  projectile or beam there. Untargeted attacks do not consume it. Allies in the
  real geometry remain vulnerable. The previous numeric identity bundles are removed.
- Pursuing Dread, Words' grand, retains its following field/radius and converts
  one damaged add per cast for up to 4s. It pursues/attacks hostile bosses/adds
  with attributed nonrecursive damage and stops absorbing friendly projectiles
  or receiving fresh friendly strike riders. Bosses are explicitly not converted;
  the following field retains lone-boss value. This bounded allegiance change
  does not add general boss threat toward friendly adds or summon commands.
- Mantle keeps the accepted #146 verse-powered departure afterimage, its fourth-
  charge grand and Honed echo growth. Its secret placement works independently
  of verse readiness; rooted blinks still obey the accepted control rules.
  Blade keeps impact coverage; Refrain keeps its effective-heal relay. Ordinary
  Honed growth supports the behavioral core. Removing the old passive resolves
  the redundant double-relay layer.

## Bounds and compatibility

Ordinary retreat is limited to 1.4s/160u; field retreat tries for up to 3s/300u.
Movement honors slows, roots, shoves, obstacles, other bosses and boundaries.
Blocked movement ends; a large field exit is not guaranteed. Pending fear expires
after 5s. Quarry waits up to 6s for an eligible commitment, then preserves that
aim through resolution. Existing wind-ups, channels and projectiles never retarget.

Secret recovery and shared target perception recovery are 8s. Multiple Bards
cannot overwrite perceptions or queue endless retreats. Active taunts take
priority. Rooted, steadfast, shoved or immobile targets reject fear without
spending the mark; the training dummy receives no numerical substitute.

Downing, class changes and room transitions clear the appropriate owner state;
recovery survives swaps. Delayed old-class payloads cannot create conversions.
Copies retain useful skill payloads without granting the passive. Forge conversion
is priced, fitted, scaled and described as an actual component. Lost song
components cannot create phantom spends. Active replay history respects
banked/equipped identities; stable IDs preserve earned records.

## Review and live acceptance

Final combined verification: **4,232 tests / 168 files pass**; unchanged 98%
coverage gates pass (branches 98.03%, statements 99.40%, functions 99.66%, lines
99.76%). Build/typecheck, lint, formatting, CI-completion contracts and both
generated audits pass. Recharge audit: 6,144 observations / 2,688 profiles,
4–21.2s. Browser checks cover Whispers and accepted Mantle fixtures at 1280px and
320px, plus all twelve support grand-selection cases. The local suite uses the
working single-worker thread pool documented in the calibration review.

The reviewer identified and the implementation corrected conversion riders,
delayed ownership, speed modifiers and bosses not perceiving a nearby decoy.
World tests cover the new behavior and compatibility. Desktop/320px Chromium
fixtures exercise the real engine/renderer and are wired into browser CI.
Initial screenshots exposed anchors buried under actors; the corrected layer
uses frightened masks versus ghost-person silhouettes above effects, with links
to the affected enemy. This is functional feedback, not the full visual overhaul.

Playtest melee-party disruption, directed placement, useful decoy commitments and
friendly-add readability with fixed enemy difficulty. Values remain initial
tuning. Remote multiplayer still needs a real multi-device session; local tests
are not evidence of balance or fun.
