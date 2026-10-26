# Infernal Claim targeting feedback

The owner found this first visual treatment insufficient in live play. See the
[visibility correction](CLAIM_AND_FORK_VISIBILITY.md) for the stronger presentation
and render-layer fix; the target-query/network contracts below still apply.

Infernal Claim previously looked recharged even when it had no eligible target.
The skill now exposes its actual selected target through the authoritative player
snapshot, so host and joining-player displays use the same eligibility as casting.
No cooldown, targeting, damage, curse ownership or range rules change.

- A violet ring with four notches marks the selected enemy while Claim is ready.
  This shape distinguishes it from an ordinary ground-area outline.
- Desktop and touch controls show target availability between casts. Normal
  recharge feedback takes precedence, and the target marker clears during recharge.
- Ability details explain the requirement to aim toward a personally cursed foe
  within the resolved range. Forge's self-branding variant retains its own rules.
- The cue follows the active slot, including copied/composed abilities. Ordinary
  abilities do not acquire Claim-specific indicators.

The host computes the target; a joining player's indicator therefore follows the
normal snapshot delay. A target may leave range or lose its curse between a
snapshot and input. The existing safe no-target behavior still spends nothing.

Focused verification: 78 engine/HUD/touch/bridge tests and eight real-browser
native/composed cases at desktop and 320px phone widths. Browser checks verify
that eligible targets draw a marker and successful casting clears it during
recharge. Typecheck, lint, formatting and production build also pass; CI provides
the full repository regression suite.

## Scope and next steps

The owner accepted and live-tested the previous coherence patch. Mage Hand Bolt
is deliberately unchanged here: it currently sets up precision at range, while
Deadly Throw provides a ranged payoff and Mirror Cut a melee payoff. The concern
that Trickster needs more varied delivery interactions remains valid feedback for
the whole-system review; another immediate rework would prevent comparison with
the remaining classes.

Next content cohort: Knight, Barbarian and Monk, using the
[combined-build review gate](UPGRADE_REVIEW_GATE.md). Remaining cohorts follow it;
this readability correction does not add a new content phase.

## Live verification

1. With Infernal Claim bound, aim toward an uncursed foe: it should request a target.
2. Apply your own Hex or Fire Pit curse, face the foe and enter range: the ready
   cue and notched violet target ring should appear.
3. Turn away, leave range, or let the curse expire: the target cue should clear.
4. Cast successfully: the normal recharge display replaces readiness and the
   target ring disappears. Retry with a joining player and on a narrow phone.
5. Confirm an ordinary skill still shows its usual cooldown feedback, and copied
   or composed Claim follows its actual targeting requirements.
