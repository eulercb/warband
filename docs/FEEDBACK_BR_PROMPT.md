# Warband — player-feedback work round (translated & adapted from a Brazilian playtester)

You are working on **Warband**, a browser-hosted, peer-to-peer co-op boss-fight game
(TypeScript + React + Pixi.js + Zustand; Vite). The **host's tab runs the authoritative
simulation** and streams snapshots to peers over WebRTC — there is no server. This is a
round of fixes and features distilled from a detailed Portuguese-language playtest report.
Each item below has been translated to English and grounded in the actual codebase so you
can go straight to the relevant systems.

Work through **all eight items**. For each: investigate first, confirm the diagnosis in the
code, then implement the smallest change that fully solves it in the style of the surrounding
code, with tests.

## Repo orientation & invariants (read before touching anything)

- **Layers** (`docs/ARCHITECTURE.md`): `src/engine/` is the pure, host-authoritative
  simulation; `src/net/` is P2P (star topology, host-authoritative); `src/render/` is the
  PixiJS presentation; `src/ui/` is the React + Zustand shell; `src/input/` is device input.
- **Determinism is sacred.** All run content (kits, monsters, boons, Chaos Forge synthesis,
  reward offers) derives from the run's **master seed** via `Rng`/`mulberry32`, `mixSeed`,
  `hashStr` (`src/engine/core/math.ts`). The host bakes drafted content into `StartMsg`/roster
  and **every client re-derives it identically**. Never introduce `Math.random` or `Date` into
  the sim or content path — anything that must vary per-run takes a seed.
- **Chaos Forge must stay byte-identical when OFF.** Canonical / numeric-variance / Chaos-Draft
  content must remain byte-for-byte unchanged when Forge is disabled. See `docs/CHAOS_FORGE.md`
  (the living design reference) — synthesis is gated by `forgeSeed() !== null`.
- **Host-authoritative netcode.** Simulation state flows host→peers as snapshots
  (`src/render/pipeline/interpolate.ts` lerps positions between snapshots on clients). Player
  intents flow peer→host as protocol actions (`src/net/protocol.ts` `ACTIONS`, validated in
  `src/net/session/host.ts`). Never trust a client; the host validates and is the source of truth.
- **Quality gates (all must stay green, and the repo holds a 98% coverage gate):**
  `npm run typecheck` · `npm run lint` · `npm run build` · `npm test` (vitest) · `npm run smoke`.
  Add or extend tests for every behavioural change.

---

## 1. Flying bosses have no on-screen "flight" indicator

**Player report:** Bosses with constant flight still give players no indication that they're
flying — e.g. the **Harpy Matriarch** is permanently airborne, but there's no way for a player
to know that. Find every similar case and add some way to show players that flight is active.
(The player suggests: for such bosses, apply the flight buff constantly, so it surfaces the way
other buffs do.)

**Root cause (confirmed):** Flight has two representations that are deliberately separate:
- **Timed flight** is a real status: `BuffKind` `'flight'` (`src/engine/core/types.ts:169`),
  granted via boss `BossAbilityDef.buffFlight` (`monsters.ts:81-84`, applied at
  `abilities.ts:1401`) or player `AbilityDef.grantsFlight`. It already renders a **🕊️ "Airborne"
  chip** — `describe()` at `src/render/overlays/buffGlyphs.ts:34-35`, surfaced on canvas
  nameplates (`renderer.ts:647/663`) and the React HUD frames (`HUD.tsx:37-57,178,271,316`).
- **Constant flight** is a plain trait: `MonsterDef.flying?: boolean` (`monsters.ts:125`). It is
  **never** pushed into the entity's `buffs[]`, so the chip pipeline (which reads only `buffs`)
  never lights up. `bossFlying()` (`world.ts:700-702`) ORs `def.flying` into the *mechanics*
  only. That's the exact gap.

**Every constant flyer to cover (not just the Harpy):**
- `HARPY` "Harpy Matriarch" (`monsters.ts:635`)
- `WISP` "Will-o'-Wisp" (`monsters.ts:1019`)
- `BEHOLDER` "Beholder" (`monsters.ts:1118`)

**What to do:** Surface the *already-wired* `'flight'` status for constant flyers — **no new
`BuffKind` is needed.** Two viable shapes; pick the cleaner one and justify it:
- (a) Inject and continuously **refresh** a persistent `'flight'` buff on `flying: true` bosses
  so the existing chip machinery lights up. If you go this way, it must never tick down to a
  misleading countdown — a constant ability shouldn't show a shrinking timer.
- (b) Render-only: synthesize the badge when `def.flying` at the label/HUD call sites
  (`buffLabel`/`buffBadges`, `renderer.ts:663`, `HUD.tsx:178`), leaving combat state untouched —
  which sidesteps the countdown-semantics problem entirely since constant flight has no duration.
- Consider also giving flight an **aura ring**: `buffGlow()` (`entityView.ts:60-83`) currently
  has no `'flight'` case, so flight shows no glow even for the timed flyers — adding one would
  make airborne state readable at a glance for *both* kinds.

**Done when:** every flying boss (constant and timed) shows a clear, correct, non-misleading
airborne indicator; canonical content stays byte-identical when Forge is off; tests cover a
constant flyer surfacing the indicator.

---

## 2. Push / pull forced movement is instantaneous (reads like a teleport)

**Player report:** Forced-movement effects that push or pull happen apparently instantly, which
doesn't match the *idea* of pushing/pulling and makes it hard to read what's happening in
combat. Add a brief travel time between the effect's start and end point so the target visibly
slides — making these abilities more legible and truer to their concept, for a better, more
comprehensible game flow.

**Root cause (confirmed):** Forced movement uses the wrong displacement system.
- **`applyImpulse(world, target, dir, distance)`** (`src/engine/combat/abilities.ts:1123-1144`)
  sets the authoritative position **instantly in one tick** (`target.pos = clampToArena(...)` at
  L1136), then records a **purely-visual, PLAYER-ONLY** slide that eases over `SHOVE_TIME = 0.18s`
  (and only if `distance >= SHOVE_MIN`). **Bosses and adds get no slide at all** (`bossView`
  L3049-3066 and the inline addView don't read `slideOff`), so enemy push/pull hard-snaps. This
  is the teleport feel. Constant: `KNOCKBACK_FRICTION = 0` — *"knockback is applied instantly as
  displacement"* (`src/engine/core/constants.ts:532`).
- All forced movement funnels through `applyImpulse` via `pullToward` (L1151) and `knockback`
  (L1166), reached from `applyForcedMove` (player, L285-302) and boss riders (L1176-1186, plus
  pbaoe/line cases). Environmental terrain **surge/gravity pulls** also call `pullToward`
  (`world.ts:2427`).

**The reusable primitive already in the engine:** the hero **dash glide** — a real
host-authoritative, over-time move that advances authoritative `pos` incrementally each tick:
`startGlide`/`stepPlayerGlide` with `GLIDE_SPEED = 1500` (`abilities.ts:172-223`), stepped from
the sim loop (`world.ts:1058`). Because it moves authoritative `pos` every tick, it **replicates
and interpolates smoothly for free** over the snapshot pipeline — and would work identically for
bosses and adds with no client change. A single-tick `pos` jump, by contrast, is only smoothed
across one ~50 ms snapshot interval, which is why it snaps.

**What to do:** Give forced movement a short **authoritative** displacement over time (a few
ticks) instead of an instant `pos` write — either route it through a glide-like interpolation, or
extend the visual slide to bosses/adds *and* make it authoritative + a touch longer. Keep the
distance/impulse magnitudes as they are (this is about *feel*, not power). Apply it consistently
to **all** forced-movement sources:
- Player: `Bull Rush` (knockback 170), `Chain Pull` (pull 200), `Gust` (knockback 90)
  (`subclasses.ts`); the composed/Forge `shove` component.
- Boss knockbacks/pulls across `monsters.ts` (tailSweep, wingGust, charge, shockwave, galeBlast,
  groundStomp, Death Grip pull 240, etc.).
- Environmental terrain **surge pulls** (`abyss`/`tide`/`bloodmire`/`brimstone`).

**Leave genuine teleports instant** (do NOT slide these): player `blink` and `Dimension Door`
swap, boss `handleBlink` and the boss **charge** relocation, and the `teleporting` affix — these
are intentional instant repositions, not pushes.

**Done when:** pushes and pulls visibly travel (host-authoritative, so peers see the slide too)
for heroes, bosses and adds alike; blinks/charges stay instant; netcode stays snapshot-clean;
tests assert forced movement resolves over multiple ticks rather than in one.

---

## 3. Chaos Forge: class-selection menu & cards still show the ORIGINAL class names

**Player report:** In Chaos Forge, after creating a room, the class-selection menu still shows
the *original* class names instead of the new names the mode generates. Fix it so the newly
forged class names appear in the class-selection options (and cards).

**Root cause (confirmed):** In a Forge run, `getClass(id)` returns a synthesized class with a
**fused name** (`synthesizeClass` → `forgeName`, `forge.ts:1506-1524`), and the engine already
uses it everywhere in gameplay. But **every lobby name/card render site reads the static
`CLASSES` table directly, never `getClass`**, so they show base names:
- `Lobby.tsx:176` (add-bot buttons), `:216` (roster label), `:263-270` (the "Choose your class"
  grid) — all `CLASSES[...]`.
- `CodexCard.tsx:68` (`const def = CLASSES[classId]`) → name at `:88` — **base name**.
- Same pattern in `ClassRadial.tsx` and `MainMenu.tsx`.
- Note the **half-forged card bug**: `CodexCard` already pulls its ability *rows* from
  `previewAbilityTable` → `stubPlayer` → **`getClass`** (`charUpgrades.ts:3857-3858`), so today a
  Forge card shows **forged ability rows under a base class name** (and base stats — see item 4).

**What to do:** Make the lobby/class-picker/card UI resolve class identity through `getClass(id)`
(Forge-aware) instead of the raw `CLASSES` table, so the forged **name** shows consistently in
the selection menu, the roster, the class grid and the cards — matching what the engine and the
ability rows already use. Keep canonical behaviour byte-identical when Forge is off (`getClass`
returns the canonical class then).

**Done when:** in a Chaos Forge lobby, the class you pick and its card both display the forged
name (no base-name/forged-rows mismatch); non-Forge lobbies are unchanged; a test covers the
name shown in a Forge lobby.

---

## 4. Chaos Forge: forged classes keep the ORIGINAL health / speed / threat

**Player report:** Forged classes still carry the **original** health, movement speed and
threat-generation values of the base classes. Those should vary with the new abilities, because
the originals were tuned to balance each class's strengths and weaknesses — e.g. a close-range,
tanky class had less speed, more health and more threat; a mobility class had more speed and less
health; a support had medium health/speed and lower threat. Recompute these three values from the
**set of components** each forged class received, aiming for a balance consistent with the mix of
components inherited from its donor classes. They must also be shown correctly on the forged
class cards in the lobby.

**Root cause (confirmed):** `synthesizeClass` returns `{ ...base, name, abilities }`
(`forge.ts:1524`) — it overrides only the name and the kit. `maxHp`, `moveSpeed` and `threatMult`
(the three stat fields on `ClassDef`, `classes.ts:149-151`) are spread from the base class
**unchanged**; `forge.ts` never reads or writes them. So a forged "Palarogue" wears whatever
donor/base vitals it happened to key on.

**The archetype spread to preserve** (from the canonical `CLASSES` table — this is the balance
logic to reproduce): Knight (Tank) `maxHp 240 / moveSpeed 190 / threatMult 1.5`; Ranger (Mobile
Ranged) `130 / 240 / 1.0`; Mage (Burst Caster) `100 / 200 / 1.0`; Cleric (Healer) `160 / 200 /
0.5`; Barbarian (Bruiser) `210 / 205 / 1.2`; Rogue (Melee Burst/Evasion) `120 / 252 / 0.9`;
Paladin (Off-tank) `200 / 196 / 1.3`; Druid `140 / 206 / 0.8`; Bard (Support) `150 / 212 / 0.7`;
Monk (Skirmisher) `150 / 250 / 0.95`; Sorcerer `105 / 205 / 1.0`; Warlock `130 / 208 / 1.0`. The
pattern: **durability trades against mobility; threat tracks how melee/tanky vs. support/ranged a
kit is.**

**What to do:** In `synthesizeClass`, **derive** `maxHp`, `moveSpeed` and `threatMult` from the
forged kit's component profile rather than inheriting them — e.g. classify the synthesized
abilities (melee/close-range & self-defense → tankier, slower, higher threat; mobility/ranged →
faster, squishier; heal/ally-buff support → mid stats, lower threat), and map that profile onto
the canonical stat ranges above so the archetype trade-offs survive. Keep it **seed-deterministic**
(same salt/RNG discipline as the rest of Forge) and bounded to sane ranges (don't mint a
240-HP / 252-speed class). Reuse the component/capability classifier the mode already has
(`docs/CHAOS_FORGE.md` §8 mentions an ability capability classifier —
`offensiveRanged/offensiveMelee/control/heal/allyBuff/selfDefense/mobility`) so the stat
derivation is consistent with how bots already read the kit.

**Then surface it on the cards:** the forged stats must appear on the lobby cards. `CodexCard`
prints `def.maxHp / def.moveSpeed / formatThreat(def.threatMult)` from `CLASSES[classId]`
(`CodexCard.tsx:94-97`); route this through `getClass(id)` (same fix as item 3) so the displayed
Hit Points · Speed · Threat reflect the forged values.

**Done when:** forged classes show *distinct, archetype-appropriate* HP/speed/threat that follow
from their component mix; the lobby cards display those forged values (not base ones); everything
is seed-reproducible across host and peers; byte-identical when Forge is off; tests cover the
derivation and the card display.

---

## 5. Chaos Forge: forged skills hit too weak (runs are near-impossible from the start)

**Player report:** Forged skills still perform below expectations — damage and healing numbers are
frequently too weak, which makes runs almost impossible right from the start. The suspicion is that
skill generation leans on **too many components**, which may be diluting each skill (and each
forged class's kit as a whole). Investigate again, find the cause, and make the generated skills —
and the *set* of skills forming each class — produce **balanced, viable** builds that can actually
progress. **Crucially, don't lose the current feel:** even though the numbers underperform, the
forged skills have been genuinely *creative and interesting* in how they mix components, producing
very distinctive ways of delivering mechanics. Keep that inventiveness; fix the math.

**Root cause (confirmed & quantified).** Synthesis prices every ability to a **fixed per-slot
budget** so "synthesis must not mint power" (`docs/CHAOS_FORGE.md` §3) — and that pricing starves
damage/heal whenever a fusion also carries utility. The chain in `src/engine/content/forge.ts`:
- `synthesizeAbility` (~L820) takes a primary payload + **1–2 secondary effects** (`rng.int(1,2)`,
  L853), plus an injected damage/heal **anchor** when none is present (`ensureOutputAnchor`
  L988-1017; anchor = median same-slot canonical magnitude, e.g. a1 = **50 dmg / 60 heal**).
- `componentValue()` (L361-371) is a **plain additive sum** of effect values, and its **buff/CC
  weights price utility as high as — or higher than — damage** (L386-412): a def buff is worth up
  to **280**, a damage buff up to **150**, a 0.8 s stun **44**, a crit lean **72** — against a
  damage anchor of only **50**.
- `priceToBudget`/`compressToBudget` (L1095-1141) then fit the whole ability with **one linear
  factor** `f = clamp(ceiling/total, COMPRESSION_FLOOR, 1)` = `clamp(ceiling/total, 0.3, 1)`,
  applied to **every** effect's magnitude — damage included (`scaleEffect` L1173) — so
  `damage_final = anchor × f`. The per-slot `budget` (L1035-1042, median of `componentValue/cd`
  over same-slot canonical donors) and `targetCd` are **independent of component count**, so more
  (or heavier) components → larger `total` → smaller `f` → smaller damage. **The player's "too
  many components" intuition is correct.**

**The measured shortfall (a1 slot):** canonical a1 damage ≈ 50–80 @ ~7 s; a *typical* fusion
(anchor 50 + one strong buff) prices to `f ≈ 0.5` → ~**25** damage; a *heavy* one (anchor + def
buff + stun) floors at `f = 0.3` → ~**15** damage. Forged direct hits land **~30–50% of a canonical
hit**, and sustained *direct* DPS ~1.5–2.5 vs canonical ~10–11 — a **4–7× raw-damage shortfall**,
with the "missing" budget spent on a buff/CC rider that doesn't win a boss DPS race. The squeeze is
at `compressToBudget` (L1138); the true cause is the **buff/CC weighting** in `effectValue`
(L386-412) consuming a fixed budget. `COMPRESSION_FLOOR = 0.3` (L736) keeps hits off the
"literally-1" floor but still lets damage fall to 30% of its anchor.

**What to do (pick the cleanest combination — keep the creativity, fix the math).** There is **no
existing budget multiplier to raise**; the highest-leverage levers are:
- **Give damage-bearing fusions a larger envelope** — add a `>1` factor to `ceiling = budget *
  targetCd` (L1102) or to `slotBudget` (L1035-1042) so a skill can afford both a real hit *and* its
  riders. This is the single cleanest knob (none exists today).
- **Down-weight utility in `effectValue`** (L386-412: the buff `×0.25/0.2/0.35×100` and CC `×55`
  scalars) so riders "cost" less budget, leaving more `f` for damage — this is where the
  damage-vs-utility balance actually lives.
- **Reduce dilution:** consider trimming the secondary count `rng.int(1,2)` (L853) toward 0–1 on
  damage/heal skills, and/or guaranteeing the anchor a minimum *share* of budget before riders are
  priced in.
- Optionally raise `COMPRESSION_FLOOR` (L736) for chunkier minimum hits — but note cooldown =
  `value/budget` (L1120) rises with it, so this changes *feel* (bigger, slower hits), not overall
  kit power; combine it with an envelope bump rather than relying on it alone.
- Validate the **kit as a whole** clears a viability bar (a forged class's total DPS/HPS in the
  same league as a canonical class's), and that the **adaptive match-balance** estimator
  (`src/engine/content/balance.ts`, which reads resolved ability tables) doesn't systematically
  under-measure forged kits and pile on extra difficulty.
- Keep it **seed-deterministic** and **byte-identical when Forge is off**; respect the
  anti-degenerate caps (≤1 hard CC, buff ceilings, telegraph/wind-up readability floors) — this is
  about output *magnitude*, not removing guardrails. **Preserve the component variety** that makes
  the skills feel creative; only change how they're *priced*, not how they're *composed*.

**Done when:** a seeded Forge run produces kits whose damage/heal are in a viable band comparable to
canonical classes (no more "impossible from turn one"), the skills stay as creative/varied as they
are today, determinism and Forge-off byte-identity hold, and tests assert forged skills clear a
minimum output-vs-slot-budget bar.

---

## 6. Add fight-start and boss-victory (party-wipe) transitions

**Player report:** There's currently a celebration transition when a boss is defeated, but **no
transition when a fight begins** or **when the boss wins** (the party wipes). Create fitting
transitions for each of those two events to make the experience more engaging and fun.

**Where it lives (confirmed):** the victory path is a fully-built pipeline; the other two are
missing. Asymmetry map:
- **Victory (exists):** engine pushes `GameEvent { t: 'victory' }` in `World.checkEnd()`
  (`src/engine/world/world.ts:2899-2906`) → `Fx.processEvents` celebration + fireworks
  (`src/render/overlays/fx.ts:332-411`, `updateCelebration`) → a host **"victory lap"** holds the
  result `VICTORY_LAP_MS = 2600` before finishing (`src/net/session/host.ts:1237-1251`). A
  `'victory'`/`'defeat'` SFX pair already exists (`session.ts:222,299`).
- **Fight start (missing):** `Host.beginFight()` (`host.ts:689-802`) builds the World, sets phase
  `'inFight'`, and the `onStart` callbacks (`session.ts:186-212,266-289`) jump straight to
  `setPhase('game')`. **No event, no lap, no cue.**
- **Party wipe (essentially missing):** `World.checkEnd()` sets `outcome='defeat'`
  (`world.ts:2912-2922`) and cuts straight to the result screen (defeats **skip** the victory lap).
  The only defeat visual is a **hardcore-only** `'deadline'` "TIME'S UP" cue (`fx.ts:340-355`); a
  normal wipe shows nothing.

**Reusable infrastructure (use these — don't reinvent):**
- Center-screen **banner**: `HudBanner` + `CorruptionBanner` + `hudSet` (`hudStore.ts:47-51,128`,
  `HUD.tsx:88-104`), already fed from the render loop on `'corruption'`/`'deadlineWarn'` events
  (`GameView.tsx:222-232`) — a new event slots in the same way. CSS `.hud-corruption`,
  result banners `.wb-banner/.wb-victory/.wb-defeat`.
- Full-screen **"3-2-1" countdown**: `ResumeCountdown` (`ResumeCountdown.tsx`), driven host-side by
  the shared pause-resume countdown (`host.ts:846-866`, `RESUME_COUNTDOWN_S`) — the closest infra
  to reuse for a fight-start countdown.
- The `Fx` particle/floater/camera-shake systems in `fx.ts` (`spawnBurst`, `spawnFloater`,
  `Camera.addShake`) for the visuals.

**What to do:**
- **Fight start:** add a `{ t: 'fightStart' }` `GameEvent` (union at `types.ts:1009-1034`), emit it
  from `beginFight`/the World's first step, and handle it in `Fx.processEvents` and/or the `onStart`
  callbacks — e.g. a boss-name banner + a short "3-2-1 / Get ready" countdown (reusing
  `ResumeCountdown`) and a camera beat, so a fight opens with intent instead of a hard cut.
- **Boss victory / wipe:** add a `{ t: 'defeat' }` (or `'wipe'`) `GameEvent`, emit it from
  `checkEnd` on the defeat branch (mirror the victory push), handle it in `Fx.processEvents` with a
  **somber** transition (e.g. desaturate/slow-collapse + a "DEFEAT"/"The warband falls" banner)
  distinct from the celebration, and add a host **"defeat lap"** mirroring the victory-lap timing so
  the moment has airtime before the result screen.
- Keep both **peer-synced** (they must play for the whole band, like the victory dance does via the
  host lap) and gated appropriately (don't break hardcore's existing `'deadline'` cue).

**Done when:** a fight opens with a clear intro transition and a wipe closes with a distinct defeat
transition, both matching the polish of the victory celebration and shown to every player; the
existing victory flow and hardcore deadline cue are unchanged; tests cover the new events firing.

---

## 7. Shop: add an item that re-rolls the player's current upgrade offers

**Player report:** Add a shop item that, when bought, **re-randomizes the player's currently
available upgrade options** (generic boons, the "grand" picks, multiclass choices — and any future
offer types). This lets a player steer the build they want while keeping randomness. Requirements
and nuances the player calls out:
- The **new options should be biased to differ** from the ones already shown — otherwise the
  purchase is a waste.
- It gives the shop more purpose (another way to spend the coins players accumulate).
- Set a **balanced, reasonably cheap** price (cheap relative to the other shop options).
- **Decide** whether it's a **one-time** purchase (like the shop's passive buffs) or a **recurring**
  one (like the healing potion) — or possibly recurring but **capped** to a few uses. Choose
  whatever is most interesting and justify it.

**Where it lives (confirmed):**
- **Shop = the "ephemeral" coin shop.** Items: `EphemeralDef` / `EPHEMERAL` catalog
  (`src/engine/content/ephemeral.ts:25-87`) — `speed/damage/defense` (passive buffs), `potion`
  (Healing Vial, stackable), `revive`, `retry` (hardcore). **Currency = coins**: balance
  `store.myCoins` (client) / `coinsByPeer` (host-authoritative, `host.ts:259`), earned by boss
  finishing rank (`coinsForRank`, `COIN_BY_RANK = [5,3,1,0]`).
- **One-time vs recurring is encoded by `kind`:** `'passive'` = one-time (a boolean in
  `EphemeralStock`, gated "sold out" once owned — `EphemeralShop.tsx:71-74`, `soldOutIds`
  `RewardRoom.tsx:119-125`); `'active'`/`'auto'` = stackable count (`potions`, `revives`). Note:
  **there is no existing per-item numeric cap** — a "recurring but capped N" item would be a new
  (small) pattern; the closest analog is upgrade `maxStacks`. `retry` is `kind:'meta'` (a host-side
  action with no next-fight stock) — the **closest existing shape to a reroll**, which likewise
  grants no perk, just an effect.
- **The offers a reroll must regenerate:** the between-boss rolled set — `offers` memo in
  `RewardRoom.tsx:141` (`RewardOffers { generic; char }`), from `rollOffers` → `rollUpgradeChoices`
  (`upgrades.ts:199`) + `rollCharChoices` (`charUpgrades.ts:4731`), seeded off `result.rewardSeed`
  (`host.ts:674`). The flat/endless equivalent is `genOffers`/`charOffers` in `ResultScreen.tsx`.
  **Grands + multiclass** are a separate run-clear flow (`SpecialReward.tsx`, `offerableGrands`);
  include them if the reroll fires on that screen.
- **The reroll precedent already in the code:** `ResultScreen.tsx:42-46,109-122` re-rolls char
  offers by feeding a changing salt into `mixSeed` (the "salted re-roll", item 8); `SpecialReward`
  does the same with a `progress` counter. **Copy this**: add a monotonic `rerollCount` into the
  RNG salt so a re-draw is deterministic and reproduced identically by all peers.
- **Biasing new offers to differ:** the already-shown ids are in hand (`offers.generic[].id` /
  `offers.char[].id`). Pass them as an **exclude list** into `rollUpgradeChoices`/`rollCharChoices`
  (neither takes one today — a minimal addition) so the new draw drops them; fall back gracefully
  when the pool would be exhausted (the roll already has degradation fill). Changing only the salt
  varies the draw but doesn't *guarantee* difference — the exclude list does.
- **Netcode:** shop buys ride `SpecialMsg.buyEphemeral` on `ACTIONS.special` (`protocol.ts:128`),
  validated host-side in `recordEphemeral` (`host.ts:1057-1078`, checks `coins < cost` against
  `coinsByPeer`, deducts, stocks). A reroll purchase should follow the **same path**: extend
  `SpecialMsg` (e.g. `rerollOffers?: true`) + a `NetSession.rerollOffers()` + a host `recordReroll`
  that charges coins through the same coin gate, then bumps the salt so offers re-draw. Because
  offers are rolled client-side but deterministic, the coin **spend** must be host-confirmed.

**What to do:** implement the reroll shop item end-to-end (catalog entry + UI + protocol + host
validation + salted re-draw with exclude-bias), following the `buyEphemeral`/`retry` patterns.
**Make a call on one-time vs recurring-capped and state your reasoning** — a cheap,
recurring-but-capped reroll (a few uses per interstitial) is likely the most interesting; use your
judgement. Keep everything **coin-gated on the host** and **seed-deterministic**.

**Done when:** a player can buy a reasonably-priced reroll that re-randomizes their current offers
(generic + char, and grands/multiclass where applicable), the new options are biased to differ from
the old ones, coins are spent authoritatively on the host, all peers stay in sync, and tests cover
the purchase + the re-draw (including the exclude-bias and the cap/one-time decision).

---

## 8. Grafts: replaced skill casts the old effect, and the graft vanishes from offers after reclaim

**Player report (a long run, playing Mage):** Picking a graft that replaces a skill — trying to
take **Hex**, which should replace **Blink** — the skill's **name changed to the new one but the
skill itself didn't**: casting the "new" skill (Hex) still produced the **old** effect (Blink).
Later, after using the upgrade that **recovers the original** skill (which at first worked), the
skill-replacement upgrade (Blink→Hex) **stopped appearing as an offer entirely**. These upgrades
should **always stay available and retain the evolutions applied to each**, so a player can
**alternate skills and adapt** through the run as the situation demands. Fix (i) why the replaced
skill didn't actually work, and (ii) why the graft stops being offered after a
replace-then-reclaim. Do this for **all** replacement skills (**grafts**), and make it robust so
the bug can't recur even as **new grafts are added later**. Additional note to investigate: the
graft bugs seem to **differ depending on whether the skill is acquired/recovered during a normal
run vs. on the post-final-boss screen** (the one offering to continue to Endless).

**Root causes (confirmed) — three distinct bugs:**

**(i) "Name changed, effect didn't."** *Not* an engine dispatch bug — in the live sim a skill's
name and effect are the **same object** `p.abilities[slot]` (`abilities.ts:226-234,356,373`), so a
graft can't intrinsically desync them. The divergence is **staleness/timing**: the **displayed**
name is recomputed live from the owned-id list via `previewAbilityTable`
(`charUpgrades.ts:4101`), while the **cast** effect comes from `player.abilities`, which is built
**only at spawn** by `applyCharUpgrades` (`world.ts:765`; a fresh World is created per boss). When
the owned-id list changes **without a respawn**, the HUD/card shows the new graft name while the
hero keeps casting the stale spawn-time ability. **Fix anchor:** rebuild `p.abilities` whenever a
hero's `charUpgrades` changes (find the path that mutates the list without a fresh World — this is
also where the normal-run vs endless-screen difference comes from).

**(ii) Graft never re-offered after reclaim.** `rollCharChoices` filters the graft pool by
`!charUpgradeAtMax(h.id, owned)` (`charUpgrades.ts:4806-4808`); every skill-replacing graft has
`maxStacks: 1`; the owned list is **append-only** (`store.ts:410`, host `host.ts:963-974`); and the
"recover original" upgrade (synthetic id `restore:<slot>`) **re-points occupancy but never removes
the graft id** from `owned` (`charUpgrades.ts:3908-3912`). So a **displaced-but-owned** graft stays
"maxed" forever → filtered out for the rest of the run — even though the replay engine is fully
able to **re-seat a stashed graft** (with its boons/grands intact) if the id reappeared
(`charUpgrades.ts:3935-3948`). The re-graft capability exists but is **unreachable through offers**.
**Fix direction:** treat a graft that is *owned but not currently occupying its slot* as
**re-offerable** (so the player can freely swap the skill back in), pairing it with the `restore:`
reclaim so the two alternate — and since the skill-keyed registry already stashes each graft's
**grand evolutions** under its id, re-seating restores them automatically (this satisfies the
player's "retain the evolutions" requirement).

**(iii) Different rule on the Endless/post-final-boss screen.** The "RUN CLEARED" screen
(`ResultScreen.tsx`) runs **two independent** offer mechanisms: the **grand picker**
(`SpecialReward.tsx` → `offerableGrands`) gates graft-grands by **live occupancy**
(`held.has(d.graftId)`, `charUpgrades.ts:4451-4454`) — so after a reclaim the graft is "not held"
and its grand **disappears there** — while the **boon bank** on the same screen uses the *same*
`rollCharChoices` maxStacks path as the normal run (`ResultScreen.tsx:120`), inheriting bug (ii).
That divergence is exactly the "different bugs depending on path" the player noticed. **Fix:**
reconcile the two paths so a displaced graft (and its grand) behaves **consistently** whether
picked/recovered between bosses or on the endless screen.

**All grafts the fix must cover (7 skill-replacing grafts, each `maxStacks: 1`):**
`hy_pyromancer` (Pyromancer's Pact, →a2, Fireball), `hy_shadowpact` (Shadow Pact, →a3, Shadowstep),
`hy_warhowl` (Berserker's Howl, →a1, Rage), `hy_fieldmedic` (Field Medic, →a2, Heal),
`hy_hexbrand` (Warlock's Hex, →a3 — **this is the Mage's Blink→Hex from the report**),
`hy_windstep` (Wind Step, →a3, Step of the Wind), `hy_inspire` (Borrowed Anthem, →a1, Inspiration)
— all in the `HYBRID` array (`charUpgrades.ts:923-1046`), each with **two graft-grand evolutions**
(`GRAFT_GRANDS`, `charUpgrades.ts:3538-3714`). *(The 5 whole-kit "style" hybrids have no `replaces`
and aren't affected.)* Whatever you change, key it off the **`replaces`/graft data model**, not a
hardcoded list, so a newly-added graft is covered automatically.

**Done when:** picking a graft actually changes the cast effect (name and effect always agree, in
every acquire/reclaim path); a graft and its "recover original" **both stay offerable all run** so
the player can alternate the skill back and forth, each retaining its applied grand evolutions; the
normal-run and endless-screen paths behave consistently; the fix is driven by the graft data model
so future grafts inherit correct behaviour; and tests cover replace→reclaim→re-offer for
representative grafts on **both** paths (bots included, since they share the same gate).

---

## Deliverables & workflow

- Implement all eight items with minimal, well-tested, in-style changes. Group related work
  sensibly (items 3–5 all touch Chaos Forge; 8 is the largest, treat it carefully).
- For each item, **verify the behaviour** (not just that it compiles) and keep every quality gate
  green: `npm run typecheck` · `npm run lint` · `npm run build` · `npm test` · `npm run smoke`
  (98% coverage gate). Add/extend tests for every change.
- Preserve determinism and Chaos-Forge-off byte-identity throughout.
- Commit in logical, reviewable chunks with clear messages.
