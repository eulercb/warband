# Whispers: learn a secret, expose it or conceal someone

Design proposal, 2026-10-31, against `a34c4f7`. Status: **payoffs rejected by the
owner** as repeated damage/mitigation under thematic names. Retain the mark and
different skill interactions as a useful structure; the design below is historical
and must not be implemented as an accepted specification. A behavioral fear/
illusion revision follows separately. Moon and
Evoker remain unchanged. This supersedes the earlier suggestion to require a
chorus for Whispers' new passive; it does not change the shared Bard verse engine.

## Collaboration and scope

The agent owns research, design synthesis, routine implementation decisions,
testing and delivery. Give the owner a short concrete checkpoint when changing
a class's core loop, input contract or progression; do not ask for every number,
test or implementation detail. The owner can redirect a proposal or delivery.
Once the direction is accepted, implement a complete bounded patch, report any
material deviation and provide targeted playtest questions. Do not repeatedly
seek approval for the accepted design's routine details.

This checkpoint covers Whispers' passive, its interactions with the four subclass
skills, and both identity grands. Preserve Bard's ordinary support foundation,
accepted Mantle travel/phasing and its grand, compatibility and earned selections.
Visual work here is the feedback needed to understand the mechanic, not the
future art overhaul. No new button, fear meter or skill slot is proposed.

## Recommended loop: Unspoken Secret

**Short passive description:** "A direct hit learns one foe's secret. Use a
Discord special to expose it for psychic damage and hesitation, or heal/blink
to conceal someone from that foe. One secret at a time."

The player chooses an enemy with their aim, then chooses pressure or protection
with an existing skill. This is a spent opportunity, not a permanent damage mark.
All numbers below are initial tuning candidates, not balance conclusions.

1. A positive direct hit learns that enemy's secret for **8s**. Only one enemy
   can be marked by each Whispers player. Later basics neither spend nor move
   the mark, so held/autofire basics leave time for a decision. No secret can be
   learned during the **8s recovery after spending one**.
2. **Expose:** a different cast's Discord special must actually damage the marked
   enemy. Consume the secret for **24 supplemental psychic damage** and **30%
   longer wind-ups for 3s**. Use the existing strongest-effect suppression rules;
   this is hesitation, not a stun, attack cancellation or forced fleeing.
3. **Conceal:** a dedicated Harmony heal can instead consume the secret to veil
   its selected living recipient for **5s**. The veil reduces the next qualifying
   direct hit from that particular enemy by **35%**, then ends. The enemy must
   still be alive and within **420u of the Bard** when the secret is spent.
   The heal retains its ordinary behavior; the veil can be granted at full HP,
   without inventing effective healing, Harmony preparation or healing score.
4. **Mantle:** a successfully executed blink can choose the same defensive spend
   for its caster, using the enemy's range at departure. Think of it as leaving
   the foe with a false impression of where you went. The spell does not grant
   invisibility, change aggro or cancel an already aimed boss attack; it grants
   the explicitly described source-specific veil after relocation.

The full-health and solo route is immediate: basic hit → Dissonant Whispers to
expose. Healing Word offers a proactive defensive route without needing a second
subclass skill. A failed or out-of-range defensive spend still allows the normal
skill to execute; it leaves the secret intact.

### Why not the other tempting directions?

- Requiring Harmony + Discord + Inspiration before learning a secret repeats
  the chorus prerequisites and waits for effective healing. It is too much
  setup for a subclass that should work with any first pick against one boss.
- Making bosses run away on fear disrupts melee allies, arenas and telegraphs.
  An unlimited interrupt also risks replacing boss fights with control locks.
  Hesitation communicates fear while preserving the committed attack and dodge.
- A permanent vulnerability mark duplicates Warlock's curse or Hunter's exposure.
  This secret has a short life, one owner and two mutually exclusive uses.
- A disguise/decoy that rewrites targeting could eventually be interesting,
  but needs a separate co-op threat/AI prototype. Do not quietly implement that
  under a claim of preserving Mantle.

Evoker rewards control with recharge and spell preparation; Whispers instead
spends information offensively or protects a particular recipient from a
particular threat. Valor keeps its chorus-triggered general frontal protection.

## Four first picks and ordinary support

| Skill              | Role in the new loop                                                                                                                                                                                         | What stays useful without the passive                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Words of Terror    | Basic hit learns the secret; a later Words cast's first positive tick on that enemy exposes it. The travelling grand makes this reliable against movement, rather than learning/spending secrets every tick. | Its airborne mental field, damage, slow and following-field grand. A cast that learned a secret cannot expose its own secret on a later tick.      |
| Psychic Blade      | Aim the more decisive Discord strike at the marked enemy to expose. Its impact grand still adds nearby coverage; one secret cannot yield one bonus per victim.                                               | Direct projectile damage, Honed growth and impact burst.                                                                                           |
| Mantle of Whispers | Trade the offensive opportunity for personal safety as you relocate. It offers a full-health defensive first pick.                                                                                           | Accepted blink/phasing, Honed travel/phasing, Unbound Mantle healing and control resistance, and legal rooted use through that resistance payload. |
| Healing Refrain    | Conceal an ally or yourself while healing normally. Distinguish source-specific protection from simply restoring more health.                                                                                | Healing, Harmony, Honed reach/healing and the existing Shared Refrain relay.                                                                       |

Removing the old automatic echo already resolves the passive/grand double-relay
overlap. **Keep Shared Refrain's relay in this patch**, rather than redesigning
every healing layer at once. It remains the deliberate group-healing grand;
Healing Word can conceal too, so the subclass never requires Refrain.

Conceal is restricted to deliberate dedicated Harmony healing and Mantle.
Lifesteal, use-heals on unrelated movement, zone healing, relay healing, echoes
and recovery ticks neither learn nor spend secrets. Inspiration retains its
normal chorus and support function; it does not automatically consume a secret.

## Grands: improve different decisions rather than repeat the unlock

Keep both existing identity IDs and earned-bank eligibility. Update their
descriptions and behavior together; do not leave legacy riders hidden beneath
new wording. Proposed recipes replace the present broad bundles:

- **Voice of Madness — reveal the secret publicly.** Expose keeps the single
  target's psychic damage, but its hesitation also reaches at most **two other
  living enemies within 140u**. Against a lone boss, extend the primary
  hesitation to **4s** and increase psychic payoff to **32**. Secondary targets
  take no secret bonus damage and receive no new secrets. Conceal remains the
  baseline alternative; no damage buffs are granted just for owning the grand.
- **Unheard Dirge — move under a false identity.** Conceal lasts **7s** and gives
  the recipient **20% movement for 3s**, immediately useful before taking a hit.
  It still protects one recipient from one enemy; it does not upgrade to blanket
  immunity or silently veil the whole party. Expose remains available at baseline.

These identities specialize the spend, rather than disabling either option or
requiring a particular subclass pick. They make a mostly single-target comparison
possible and also create encounter-dependent opportunity costs. Compare their
value against existing ordinary growth rather than assuming equal power.

Keep the four individual skill grands and Honed profiles in this first patch.
Unbound Mantle's healing/control resistance is independent of the new veil;
Words' follow behavior, Blade's impact coverage and Refrain's healing relay
remain honest additional effects. Check native, copied and real Forge recipes.

## Technical contract and implementation order

The new passive needs host-owned per-player state: target ID, expiry, originating
cast token and recovery. Do not encode the secret as a Warlock curse or alter
the enemy's global damage-taken multiplier. The same cast cannot learn and spend
the secret; multi-projectile, area and tick paths share one spend token. Process
an existing secret's spend before considering a new one and never replenish it
from the supplemental payoff.

1. Add ownership-safe secret state, cast provenance and snapshot cues. Deterministic
   selection: a single positive direct hit learns its victim; when one cast hits
   several candidates, select a stable target (nearest hit to aim point, ID tie
   break). Existing marks remain pinned until spent, expired or invalidated.
2. Add Expose through actual hit resolution, including Words' delayed ticks.
   Supplemental damage scales once through the normal outgoing path, cannot crit,
   leech, learn secrets or trigger direct-hit riders, and cannot recursively
   consume other players' preparations. Suppression respects existing limits,
   strongest effects and applicable control protections.
3. Add explicit incoming **attacker identity and direct-hit provenance** before
   implementing Conceal. Current `damagePlayer` receives damage and an optional
   origin, not a reliable attacker ID. A coordinate is not ownership evidence.
   Propagate source through boss melee/cone/burst and projectiles, including
   delayed shots from a dead enemy. Environmental and persistent ground damage
   do not qualify, even when positioned at the marked foe's feet.
4. Resolve Conceal on the actual selected heal recipient or completed Mantle,
   independently of the heal's positive-health requirement. A valid defensive
   grant must succeed before consuming the secret. Invulnerability, frontal
   blocks, mirror-negated hits, zero damage and another attacker's hits preserve
   the veil. A matching positive hit applies the reduction before absorption,
   then spends it. It can save barrier durability; it does not heal or reflect.
5. Apply identity recipes, ability descriptions, rules reference and cues. Existing
   banked versus equipped selections must remain honest after replay and swaps.
   Rename/replace the old echo passive while keeping skill/grand IDs stable;
   clear its old transient buff during migration, without modifying saves' banks.

Conceal keeps one source-specific veil per recipient: no duplicate charges or
multiplicative stacking from several Bards. A weaker grant cannot erase a stronger
one; a failed replacement preserves the new caster's secret. Define strength by
reduction first, then remaining duration; a veil tied to a different foe is not
silently overwritten. The player may use Expose if their intended recipient is
already veiled. Multiple Whispers players may learn the same boss's secret, but
cannot consume one another's marks. Shared suppression uses the usual strongest
rule. Test co-op overlap before judging the offensive cap sufficient.

Unspent secrets clear on target death, owner downing/death, leaving combat or
changing away from Whispers. Already-issued veils expire normally on owner
downing, clear on recipient downing/death or room transition, and remain tied to
the original enemy ID. Changing class clears owned secret/veil effects; an already
spent recovery clock cannot be reset by class switching. Unknown-source damage
never consumes a veil. Dead targets cannot be spent, but their existing in-flight
attacks still match a veil that was granted before death.

Copied skills retain ordinary skill/grand payloads but cannot grant the passive.
A Whispers player may learn secrets with any eligible direct attack in their
active kit; spending requires the resolved Discord/Harmony behavior or explicit
Mantle integration. Only identity-owning Whispers receives identity modifiers.
Forge must retain a spend capability only when the actual retained component
carries it; compatibility fallback is a useful attack/heal/mobility skill, not
a fabricated off-budget secret field. Audit the actual synthesis, not only
decompose/recompose.

## Feedback and acceptance checks

- A small closed-eye/sealed-script mark identifies the learned enemy, with a
  matching HUD readiness icon and expiry. Use a broken-seal flash for Expose.
  Conceal uses a mask beside the protected player and an enemy-specific link/
  portrait cue in details. Shapes and motion must work without relying on color.
- Mark only the local player's secret prominently; co-op spectators should not
  confuse another Bard's readiness with theirs. Phone clutter and occlusion are
  part of acceptance, not a reason to add several permanent rings.
- Test all four first picks against a lone boss at full health and while injured,
  held/autofire input, missing/blocked hits, words ticks, simultaneous projectiles,
  target death, expiration, class swaps and downing. No required rare pair.
- Test two different enemies, twins, their projectiles and environmental damage
  against a veil. Check barriers, guards and mirrors; no stolen consumption or
  recursion. Test multiple Bards and a full-health dedicated heal explicitly.
- Test both identities at ordinary ranks, five Honed ranks and Haste, one skill
  grand at a time, native/copy/Forge, bank/equip swaps and actual selection text.
- Run build/typecheck and the full suite with the working thread-pool invocation.
  Add meaningful runtime tests for the new contracts. Verify desktop/touch cues
  through supported browser QA if available and disclose any unavailable checks.

Live questions: does the player choose between exposing and concealing, can they
identify which enemy a veil protects against, and does Mantle feel like deceiving
a pursuer? If not, simplify the loop before adding more triggers or adjusting
enemy difficulty. No numeric balance or fun claim is made by this proposal.
