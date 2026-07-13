# Warband — Player Feedback Work Order (for a new Opus session)

> This file is a ready-to-use prompt. It translates and adapts a round of
> Brazilian-Portuguese player feedback into an English, codebase-grounded work
> order. Every "Current state" note below was verified against the repo at the
> time of writing (file:line anchors may drift as the code changes — re-confirm
> before editing). Hand this to a fresh session, or paste it as the opening
> prompt.

---

You are working on **Warband**, a browser-hosted, peer-to-peer co-op boss-fight
game. Stack: **TypeScript + React 19 + PixiJS 8 + Zustand + Vite (PWA)**. The
host's browser tab runs the **authoritative simulation** (fixed 20 Hz) and
streams snapshots to peers over WebRTC; clients interpolate. Runs are
**seeded and deterministic** — the same master seed must produce identical
content for every peer, so anything touching the per-run RNG must keep roll
streams byte-aligned across peers (see item 4's caveat).

Address the six feedback items below. They are independent — you can land them
as separate commits/PRs or together, your call — but treat each item's
**acceptance criteria** as the definition of done.

## Working agreement

- **Quality gates (CI runs all of these; keep them green):** `npm run format:check`
  (Prettier), `npm run lint` (ESLint), `npm run typecheck` (`tsc --noEmit`),
  `npm run test:coverage` (Vitest, **98% threshold** on statements/branches/
  functions/lines — add tests for new logic), `npm run build`, and
  `npm run smoke` (headless Chromium drives a real solo fight). Run `npm run format`
  to fix formatting drift.
- **Verify behavior, not just types.** Run `npm run dev` and actually drive the
  affected flow in the browser before calling an item done (e.g. cast the roll
  and watch the character travel; open the pause menu and read the tooltips).
- **Determinism & netcode.** The sim is host-authoritative. Any new movement/
  state must be simulated **host-side across ticks** so it replicates through the
  existing snapshot+interpolation pipeline — a renderer-only effect will neither
  replicate nor be collision-authoritative. Do not reorder or resize per-run RNG
  draws without preserving stream alignment.
- **Match existing conventions & comment style** (the codebase tags feature work
  with `item N:` comments; follow the local idiom).

---

## 1. Make the version indicator reflect real updates

**What the player wants:** The version shown in the main-menu corner is stuck at
`1.0.0` and never changes when a new build ships, so there's no way to tell which
update is live. Make it reflect the actual deployed build so an update is
identifiable.

**Current state (verified):**

- The label renders `v{__APP_VERSION__}` at `src/ui/screens/MainMenu.tsx:262-264`.
- `__APP_VERSION__` is inlined at build time from `package.json`'s `version`
  field via Vite `define` — `vite.config.ts:12-22` — and `version` is hardcoded
  `"1.0.0"` (`package.json:4`).
- Nothing bumps it: `build` is just `tsc --noEmit && vite build`
  (`package.json:9`), and `.github/workflows/deploy.yml` builds straight from
  `main` on every push with no version step. So every deploy shows `v1.0.0`.
  The PWA `registerType: 'autoUpdate'` silently swaps builds but never changes
  the string.

**What to do / acceptance criteria:**

- Surface a build identifier that **actually changes per deployed build**. The
  most robust option given the "deploy every push to main" setup is to inject the
  **short git commit SHA and/or commit date** at build time (extend the existing
  Vite `define` in `vite.config.ts` — e.g. define `__BUILD_SHA__` / `__BUILD_DATE__`
  from `git rev-parse --short HEAD` and the commit timestamp), and show it next to
  the version (e.g. `v1.0.0 · a1b2c3d · 2026-07-13`). Keep the semantic `version`
  too. A pure semver bump alone won't help unless something bumps it every deploy.
- Handle the local/dev case gracefully (git may be shallow in CI —
  `actions/checkout@v4` still resolves `HEAD` and its date; provide a fallback
  string if the git call fails so `npm run build` never breaks).
- Keep `aria-label` in sync and the label unobtrusive (`.wb-version`,
  `src/ui/styles.css:1869`).
- The result must be that after a deploy, the menu shows a different identifier
  than the previous build.

---

## 2. Movement skills must behave according to their nature (not all teleports)

**What the player wants:** Movement abilities should respect what they _are_. A
Mage **Blink** is a teleport — instant is fine. But a Ranger **Roll** (and dashes,
charges, leaps generally) is _not_ a teleport, yet right now it snaps
instantly like one — **practically every movement skill currently behaves like a
teleport, and that's wrong.** Keep the mobility (same reach/speed feel), but make
non-teleport movers **fluid**: you should _see_ the character travel along the
path. And respect obstacles by nature:

- a **teleport** may pass _through_ a movement-blocking obstacle;
- a **jump/leap** may pass _over_ some obstacles (depending on the obstacle);
- a **roll/dash/charge cannot** — it ends _at_ the obstacle.

Then **audit every skill** and fix all similar cases.

**Current state (verified):**

- `AbilityKind` has only `dash` and `blink` (`src/engine/content/classes.ts:11-21`);
  "leaps/charges" are modeled as `kind: 'dash'` + `landingDamage`/`radius`.
- **Both** kinds do the _same_ single-tick instantaneous write in
  `resolvePlayerAbility` — `p.pos = clampToArena(world, target, p.radius)` —
  `dash` at `src/engine/combat/abilities.ts:242-278`, `blink` at `:280-289`, and
  the Chaos Forge composed path at `:580-619`. `clampToArena` (`:67-72`) only
  torus-wraps; it does **not** stop at obstacles. So dashes/rolls teleport
  exactly like blinks.
- There is **no** velocity / "dashing" state / per-tick movement lerp for
  abilities. The only timed-movement primitive, `slideOff/slideRemaining/slideTotal`
  (`src/engine/core/types.ts:317-319`), is **cosmetic only** — set by knockbacks,
  never by dash/blink, never read by the sim, only by `playerView` for a render
  ease. It cannot "stop at an obstacle" (authoritative pos has already jumped).
- Normal **walking** already integrates per tick (`world.ts:1136`) and
  `separateAndClamp` → `pushOutOfObstacles` → `ejectFromCircle`
  (`world.ts:2627-2714`) ejects walkers from obstacle circles every tick — which
  is why walking stops at cover but a one-shot dash tunnels (only the endpoint is
  overlap-tested).
- **Reusable primitive:** a swept segment-vs-circle test already stops fast
  _projectiles_ tunneling through cover — `projectileHitsObstacle`
  (`world.ts:1386-1392`) using `pointInSegment` (`src/engine/core/torus.ts`). A
  roll/dash path can reuse this to find the first blocking obstacle.
- **Complete inventory of movers to audit (19):**
  - **Base kits (6)** — Ranger **Roll** (`dash`, classes.ts:196), Mage **Blink**
    (`blink`, :248), Barbarian **Leap** (`dash`+landing, :346), Rogue
    **Shadowstep** (`blink`, :397), Monk **Step of the Wind** (`dash`, :617),
    Sorcerer **Arcane Leap** (`blink`, :680 — note the name says "Leap" but it's
    authored as a teleport; reconcile name vs. nature).
  - **Subclass skills (13)** in `src/engine/content/subclasses.ts` via the
    `dash()` (:149) / `blink()` (:162) factories — Bull Rush, Pounce, Dimension
    Door, Rage Leap, Vanish, Misty Step, Avenging Charge, Feral Pounce, Mantle of
    Whispers, Wind Step, Shadow Step, Bend Luck, Entropic Ward (see the class/line
    table in the code). Char-upgrades only tune numbers, no new path.
  - Also the **Chaos Forge composed** mover path (`abilities.ts:580-619`) and, for
    parity, the **boss charge** (`abilities.ts:990-1009`) which already does a
    swept hit test but still relocates instantly.

**What to do / acceptance criteria:**

- Introduce a **real, host-authoritative, multi-tick glide** for dash-nature
  movers so the character visibly traverses the path over a short duration (a few
  20 Hz ticks) and it replicates to peers via the normal snapshot pipeline.
  Preserve total reach and overall mobility (it should feel as mobile as today,
  just fluid — a fast slide, not a slow walk).
- **Collision by nature:**
  - `blink`/teleport-nature skills stay **instant** and may pass **through**
    movement-blocking obstacles (current behavior is acceptable for these).
  - `dash`/roll/charge-nature skills **stop at the first movement-blocking
    obstacle** along the path (reuse the swept `pointInSegment` test), ending
    _before/at_ it rather than tunneling.
  - `leap`/jump-nature skills may **clear** obstacles (ignore mid-path blocking
    and land at the target), _optionally_ gated by obstacle kind/size (obstacles
    carry a silhouette type — low stumps/rocks vs. tall pillars/monoliths/crystals
    — so "depending on the obstacle" can be honored if you want the nuance).
    If a leap lands inside an obstacle, resolve sanely (eject to nearest edge).
- Preserve each skill's existing semantics: i-frames (`iframes`), landing slam
  (`landingDamage`/`radius`), and escape heal (`healOnUse`) must still fire at the
  right moment relative to the glide.
- **Audit all 19 movers + the composed path**; classify each as teleport / dash /
  leap and make its behavior match its nature and name. Reconcile naming
  mismatches (e.g. Sorcerer "Arcane Leap" authored as a `blink`).
- **Latent bug worth fixing while here:** player dash/blink are **not**
  root-gated even though the type docs (`classes.ts:56-62`) say roots should lock
  blink/charge/teleport; only the boss charge checks `isRooted`
  (`abilities.ts:995`). Decide and apply consistent root behavior.
- **Watch out for:** this must be simulated host-side (not a renderer tween) or it
  won't replicate or collide; the cosmetic `slide*` fields are not a shortcut;
  keep the sim deterministic; and remember remote clients already lerp positions
  between snapshots, so a host-side glide will look smooth for free once the
  intermediate positions are real.

---

## 3. Reward-room shop: add item tooltips + move the shop out of the walking path

**What the player wants (two parts):**

- **(A) Tooltips.** During a run's upgrade phase, the walkable shop items have no
  info — you can't tell what an item does without opening the menu. Add on-focus/
  on-approach tooltips so a player (especially on a **controller**) can read each
  shop item in the room, no menu needed.
- **(B) Reposition.** The shop options sit **between** the hero's spawn and the
  upgrade relics + descent vortex, i.e. directly in the walking path. Heading for
  the upgrades/vortex, the player is almost forced to step onto a shop option
  first (mis-selection). **Move the shop options to _below_ the hero's initial
  spawn position**, off the spawn→upgrades→vortex path.

**Current state (verified) — layout math in `src/ui/state/rewardScene.ts`:**

- Arena is a torus `1600×1000` (`src/engine/core/constants.ts:64-65`); Y increases
  downward; the hero marches _up_ (decreasing Y).
- Hero spawns at **(800, 780)** (`src/engine/world/world.ts:700-712`, single local
  hero). Vortex at **(800, 400)** (`rewardScene.ts:58`). Relic row at **y≈560**
  (`RELIC_ROW_Y`). Shop row at **`SHOP_ROW_Y = 700`** (`rewardScene.ts:66`),
  laid out by `layoutShop()` (`:201-211`) — the **center stall lands at (800,700)**,
  dead on the spawn→vortex centerline within `SHOP_PICKUP_RADIUS = 52`. That's
  the mis-selection trap.
- **Torus constraint (important):** the comment at `rewardScene.ts:52-72` warns
  every interactable must stay within `ARENA_H/2` (500) of the spawn or the
  nearest-copy projection flips it to the far edge. Moving the shop _below_ spawn
  means a **larger** Y (e.g. `y≈860`, ~80 below spawn) — safely in range. Also
  note `frameOf()` (`src/render/pipeline/renderer.ts:773-800`) frames the diorama
  around all loot points + the vortex, so moving stalls down will shift the camera
  framing — verify it still looks right.
- **Shop item data already exists and is already in the scene.** Items are defined
  in `src/engine/content/ephemeral.ts:37-87` (`id/name/icon/desc/cost/kind`):
  Swiftness Draught, Fury Elixir, Stoneskin Tonic, Healing Vial, Phoenix Charm,
  and hardcore-only Second Chance. `buildShopOffers()`
  (`src/ui/game/RewardRoom.tsx:108-113`) already packs `desc` onto each
  `ShopOffer`, and it rides into the scene as `ShopItem.offer.desc` — it's just
  **never surfaced** in the walkable view.
- **Reuse target for tooltips:** the relic **inspector chip** already does exactly
  this for upgrade relics — `.wb-reward-inspect` renders `offer.label` + `offer.desc`
  (`RewardRoom.tsx:446-463`), driven by `scene.focus()` and mirrored each frame
  (`:341-347`). **Gap:** `focus()` (`rewardScene.ts:507-527`) iterates only
  `this.relics`, never `this.shopItems`; there is no shop-proximity query.
  `SHOP_READ_RADIUS = 150` already exists but is only used for the stall's glow.
- The **List view** (classic overlay, `RewardRoom.tsx:488-621` → `EphemeralShop.tsx`)
  **already shows** name/desc/cost — so this is specifically a _walkable-room_ gap.

**What to do / acceptance criteria:**

- (A) Add a shop-proximity query on `RewardScene` (mirror `focus()` over
  `this.shopItems`, using the existing `SHOP_READ_RADIUS`), surface it through the
  same per-frame mirror, and render the item's name + `desc` (+ cost) in a chip
  like the relic inspector. Must be readable when the hero/cursor is near a stall,
  **without opening the menu**, and must work on **gamepad** (walkable room has no
  DOM focus — "focus" is proximity, so drive the tooltip off hero proximity like
  the relic inspector does).
- (B) Move `SHOP_ROW_Y` to **below the hero spawn** (larger Y than 780, within the
  ~500 torus budget) so the stalls no longer sit on the spawn→relics→vortex path;
  re-check `layoutShop()` spacing so stalls don't overlap the spawn point, and
  confirm the camera framing (`frameOf`) still frames the room cleanly.
- Keep the List view and the dwell-to-buy interaction working; add/adjust tests.

---

## 4. Restore the original names of the generic upgrades (keep the value variation)

**What the player wants:** Do for the **generic upgrades/boons** exactly what was
already done for the skills: the update that **kept the per-run variation in
numeric values but restored the skills' canonical names** so they stopped being
random. The generic boons still roll random names per run — restore their
original names for organization and easy recognition; keep the value variation.

**Current state (verified):**

- Canonical generic boons live in `src/engine/content/upgrades.ts:52-151`
  (`UPGRADES`, ids: `swift, vigor, haste, focus, surefooted, mighty, bulwark,
renewal, deadeye`), each with its canonical `name`/`desc`. Resolved everywhere
  through `getUpgrade()` (`upgrades.ts:162-164`).
- The per-run **name randomization** happens in `upgradeVariant()`
  (`src/engine/content/procgen.ts:432-534`): it picks a name from
  `UPGRADE_NAME_BANKS` (`procgen.ts:138-147`, where **index 0 is the canonical
  name**) at `:434-435`, and regenerates `desc` from the actual rolled magnitude.
  (`surefooted` already has no bank, so it never rolls its name — that's the target
  end state for all of them.)
- **The exact template to copy is the skill-name revert, commit `48c85bb`.** It
  deleted `SKILL_NAME_BANKS`, dropped the name assignment in `abilityVariant` so
  the variant is `{ ...base }` with `out.name` never reassigned (stays canonical),
  and — critically — **kept the roll vector fixed-width** (reserved the unused
  name-roll slot, see `procgen.ts:267-268`) so peer RNG streams never desync.
- `UPGRADE_NAME_BANKS` is referenced only in `procgen.ts` (+ its test); the change
  is fully contained there.

**What to do / acceptance criteria:**

- In `upgradeVariant`, stop picking from `UPGRADE_NAME_BANKS` and use `base.name`;
  keep the magnitude roll and the regenerated `desc` (so cards still show the
  rolled numbers and never lie). **Preserve the roll-vector width** (keep the
  `r[1]` draw / reserve the slot with a comment) so seeded runs stay peer-aligned
  — do not shrink the vector.
- `UPGRADE_NAME_BANKS` becomes dead like `SKILL_NAME_BANKS` did — remove it (and
  its test) cleanly.
- Verify names are now canonical and stable across a seeded run in every surface
  that shows them (reward cards `RewardRoom.tsx`, owned badges, `SpecialReward`,
  `ResultScreen`, `HostSetup`), while damage/percent values still vary per run.
  Update tests.

---

## 5. Improve the subclass-upgrade tooltips (match the base-class quality)

**What the player wants:** The tooltips for **subclass** upgrades are weak — they
don't clearly say _what_ is improving or _how the skill looks after_ the upgrade.
Make them as informative as the **base-class** skill/upgrade tooltips already are.

**Current state (verified):**

- The good base-class pattern is the "**Now → concrete numbers**" preview: base
  boon cards call `describeAbility(after[slot])` inside `describeCharOffer`
  (`src/engine/content/charUpgrades.ts:4132-4182`, preview built at `:4169-4172`),
  where `after = previewAbilityTable(classId, [...owned, id])`. `describeAbility`
  (`src/engine/content/classes.ts:858-926`) is a pure, slot-agnostic formatter
  that renders damage / reach / radius / cast / stun / slow / buffs / duration /
  cooldown — e.g. `Arrow: 3× 30 dmg · 120u radius · 0.5s cooldown`.
- **Why subclass upgrades miss it:** `describeCharOffer` builds the preview only
  over base slots `SLOTS = ['basic','a1','a2','a3']` (`charUpgrades.ts:3667`) via
  `previewAbilityTable` → `stubPlayer`, which has **no `subAbilities`**
  (`:3702-3717`). Subclass upgrades (`SUB_SKILL_UPGRADES` via `us(...)`,
  `charUpgrades.ts:3396-3416`; and `SUBCLASS_GRANDS` via `gs(...)`, `:2785+`) tune
  `ctx.subAbilities` over `SUB_SLOTS = ['sub1','sub2']`, which `applyCharUpgrades`
  never populates. So their `slotPreview`/`statPreview` come out empty and the card
  falls back to static prose like _"Hone Otiluke Bind — it strikes harder, reaches
  wider and recharges faster (stacks to 5)."_ — no numbers, no before→after.
  (`SpecialReward.tsx:211-213` even comments on this fallback.)
- **The ingredients exist but are unwired:** `describeAbility` already describes a
  sub-ability fine (ignores slot), and `getSubSkill(id).ability`
  (`subclasses.ts:1132`) yields the run-variant sub-ability. There is no
  `previewSub*` helper anywhere in `src/ui`.

**What to do / acceptance criteria:**

- Give subclass-upgrade offer cards the same **"Now → concrete numbers"** preview
  as base-class boons: build a resolved **sub-ability preview** that applies the
  hero's owned `subup_*`/subclass-grand tunes to the relevant `sub1/sub2` ability
  (mirror how `previewAbilityTable`/`applyCharUpgrades` works, but over
  `subAbilities`), then format it with `describeAbility` to show what the skill
  becomes after the upgrade (ideally before→after).
- The tooltip must state **what** improves and the resulting numeric line (damage,
  cooldown, range, radius, etc.), consistent with base-class cards.
- **Consistency bonus (recommended):** the live HUD sub-skill tooltip
  (`HUD.tsx:336-350`) also uses raw `getSubSkill(id).ability` and so likewise
  ignores the hero's Honed/grand tunes — wire it to the same resolved preview so
  the HUD and offer cards agree.
- Add tests covering a subclass-skill upgrade and a subclass grand producing a
  numeric before→after.

---

## 6. Pause menu: show tooltips for the player's currently-owned skills

**What the player wants:** Add to the **pause menu** informative tooltips for the
skills the player currently has, so during a pause they can review how each owned
skill works and what it does — including the relevant numbers (damage, cooldown,
range, area, etc.) — laid out in an organized, easy-to-scan way.

**Current state (verified):**

- `src/ui/game/PauseMenu.tsx` currently renders: title, who-paused, a score block,
  `<CharacterSheet />` (aggregate stat multipliers, `:28-67`/`:131`), the action
  buttons, and `<TerrainLegend />`. **No per-skill display today.**
- Everything needed is already pure and reachable from the pause menu (which
  already reads both stores):
  - **Base kit (4 slots)** — resolve with
    `previewAbilityTable(hudStore.classId, store.myCharUpgrades)`
    (`charUpgrades.ts:3902`), exactly like the HUD does (`HUD.tsx:212-215`). Slots
    are `basic/a1/a2/a3`.
  - **Subclass skills (sub1/sub2)** — iterate `hudStore.subSkills`
    (`hudStore.ts:62`), resolve each via `getSubSkill(id)` (`subclasses.ts:1132`)
    → `.ability`, and hide ones whose `subclassOfSkill(id).classId` isn't the
    active class (mirror `HUD.tsx:336-340` for multiclass heroes).
  - **Format each** with `describeAbility(def)` (`classes.ts:858`) — the same
    formatter the HUD ability tiles use for their `title`/`aria-label`
    (`HUD.tsx:133-137`). Example outputs: `22 dmg · 70u reach · 90° arc · 0.7s
cooldown`, `Heal 60 · 400u range · 3s cooldown`, `22 landing dmg · 120u radius
· 270u dash · 0.25s i-frames · 7s cooldown`.
- These live fields survive pause (the HUD store stays populated). `PlayerAbilityDef`
  (`classes.ts:23-87`) carries the numeric fields: `damage`, `cooldown`, `range`,
  `radius`, `halfAngleDeg`, `castTime`, `impactRadius`, `iframes`, `stun`,
  `slowMult`, `buff*`, `zoneTick*`, `landingDamage`, etc.

**What to do / acceptance criteria:**

- Add an **owned-skills panel** to the pause menu (e.g. after `<CharacterSheet />`,
  `PauseMenu.tsx:131`) listing each owned skill — icon + name + its
  `describeAbility` numeric line — for both base slots and equipped subclass
  skills, reflecting the hero's current upgrades.
- Lay it out for **easy scanning** (organized rows/grid, clear per-skill grouping),
  and unlike the HUD's hover-only `title`, prefer **always-visible** text here
  since the pause menu is a read/review surface. Keep it controller- and
  screen-reader-friendly.
- Reuse the existing helpers (no engine/sim/netcode changes needed). Add tests.

---

## Definition of done (all items)

- The player-visible behavior in each item's acceptance criteria is real and
  verified in the running app (`npm run dev`), not just type-correct.
- All CI gates pass locally: `format:check`, `lint`, `typecheck`,
  `test:coverage` (≥98%, with new tests for new logic), `build`, `smoke`.
- Seeded-run determinism and peer replication are preserved (especially items 2
  and 4).
- Commits are scoped and clearly messaged in the repo's `item N:` idiom.
