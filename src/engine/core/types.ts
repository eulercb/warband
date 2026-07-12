/**
 * Warband — shared engine types.
 *
 * PURE TypeScript. No React, no DOM, no external libraries.
 * These types are the single source of truth for game data shapes and are
 * imported by the engine, the networking protocol, the renderer and the UI.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export interface Vec2 {
  x: number;
  y: number;
}

export type EntityId = number;

export type ClassId =
  | 'knight'
  | 'ranger'
  | 'mage'
  | 'cleric'
  | 'barbarian'
  | 'rogue'
  | 'paladin'
  | 'druid'
  // Expansion — the remaining DnD base classes.
  | 'bard'
  | 'monk'
  | 'sorcerer'
  | 'warlock';

export type MonsterId =
  // Originals
  | 'dragon'
  | 'troll'
  | 'lich'
  // Practice target (menu playground only; hidden from run pools)
  | 'dummy'
  // Easy tier
  | 'goblin'
  | 'spider'
  | 'bandit'
  | 'kobold'
  | 'direwolf'
  | 'animatedArmor'
  | 'harpy'
  | 'gnoll'
  | 'mudGolem'
  | 'zombie'
  // Medium tier
  | 'orc'
  | 'manticore'
  | 'wraith'
  | 'basilisk'
  | 'owlbear'
  | 'cyclops'
  | 'gargoyle'
  | 'ettin'
  | 'wisp'
  | 'minotaur'
  // Hard tier
  | 'beholder'
  | 'vampire'
  | 'frostGiant'
  | 'mindflayer'
  | 'deathknight'
  | 'demon'
  | 'treant'
  | 'kraken'
  | 'archlich'
  | 'fae';

export type AbilitySlot = 'basic' | 'a1' | 'a2' | 'a3';

/** The two extra ability slots a hero unlocks from a subclass (item 13). */
export type SubSlot = 'sub1' | 'sub2';

/** Any slot an ability can be cast from — the base kit plus subclass slots. */
export type ExtSlot = AbilitySlot | SubSlot;

/** Coarse difficulty tier used to assemble a run (see monsters.ts `buildRun`). */
export type BossTier = 'easy' | 'medium' | 'hard';

/** Silhouette archetype the renderer draws for a boss (see entityView.drawBoss). */
export type BossBodyShape =
  | 'star'
  | 'blob'
  | 'diamond'
  | 'beast'
  | 'humanoid'
  | 'construct'
  | 'orb'
  | 'insect'
  | 'serpent'
  | 'tree';

export type PlayerState = 'alive' | 'downed' | 'dead';
export type BossPhase = 'normal' | 'enraged';
export type Side = 'player' | 'boss';

/**
 * Boss AFFIXES — modifiers rolled onto a boss at fight-gen (see content/affixes.ts).
 * Each one bends the SAME boss into a different fight (Diablo/PoE map-mod style):
 * a Vampiric Dragon sustains through your burst, a Splitting one buries you in
 * adds, a Volatile one salts the floor with pools. They compose — a boss can
 * carry several at once. Behaviour is host-authoritative (world.ts); the ids
 * ride to clients on `BossView.affixes` purely to drive the aura + HUD chips.
 */
export type AffixId =
  | 'vampiric' // heals for a fraction of the damage its attacks deal
  | 'frenzied' // attacks faster and faster as its health falls
  | 'splitting' // periodically calls a fresh wave of adds, on top of its kit
  | 'volatile' // its telegraphed impacts leave a lingering damage pool
  | 'molten' // trails burning ground wherever it walks
  | 'warding' // periodically raises a damage-absorbing ward
  | 'accelerating' // grows faster the longer the fight drags on
  | 'teleporting' // blinks away from anyone who crowds it (even non-casters)
  | 'overcharged' // its telegraphs — and the hits — swell larger
  | 'barbed'; // retaliates with a thorn burst scaled by the damage it soaks

/**
 * Mid-fight CORRUPTION events — seeded random beats that fire during a fight to
 * keep even a familiar boss unpredictable (Hades encounters / RoR2 void seeds).
 * Some punish (rain, vents), some reward (a healing rift), one just herds you
 * (collapsing arena). Host-scheduled; announced to everyone via a `corruption`
 * GameEvent. See world/corruption.ts.
 */
export type CorruptionKind =
  | 'enrageSurge' // every boss briefly roars: +damage, +speed for a few seconds
  | 'telegraphRain' // a scatter of delayed circle strikes rains across the arena
  | 'healingRift' // a benevolent rift blooms — stand in it to be healed
  | 'addSwarm' // a seeded wave of adds boils up around the arena's edges
  | 'ventEruption' // hazard vents erupt, leaving lingering pools (dynamic terrain)
  | 'collapsingArena'; // a ring of strikes closes in, herding the band to the centre

// ---------------------------------------------------------------------------
// Buffs / debuffs
// ---------------------------------------------------------------------------

/**
 * A timed modifier. `mult` is interpreted per kind:
 *  - damageDealt: multiplies outgoing damage
 *  - damageTaken: multiplies incoming damage (values < 1 = mitigation)
 *  - moveSpeed:   multiplies movement speed
 *  - stun / invuln: `mult` unused; presence for the duration is what matters
 */
export type BuffKind =
  | 'damageDealt'
  | 'damageTaken'
  | 'moveSpeed'
  | 'stun'
  | 'invuln'
  /** Silenced (item 28): all abilities except the basic attack are disabled. */
  | 'silence';

export interface Buff {
  kind: BuffKind;
  mult: number;
  remaining: number; // seconds
  /** Source label, used for de-duping refreshable buffs (e.g. 'shieldWall'). */
  source: string;
}

/**
 * Stun diminishing-returns bookkeeping, shared by players, bosses and adds.
 * Each successive stun landed within the rolling window is shorter; past the
 * cap the target is briefly immune. The window resets once no stun has landed
 * for STUN_DR_WINDOW seconds. See combat.applyStun.
 */
export interface StunDr {
  /** Stuns landed inside the current window (drives the duration falloff). */
  count: number;
  /** Seconds left before the falloff resets (refreshed on every LANDED stun). */
  window: number;
  /** A "RESIST" cue already fired this window (dedupes rider-spam floaters). */
  announced?: boolean;
}

/**
 * Wire/render projection of a buff. `mult` is carried so the renderer can tell a
 * slow (moveSpeed < 1) from a haste, or mitigation (damageTaken < 1) from a
 * vulnerability, and pick the matching glow color per effect (§ visual-cues).
 */
export interface BuffView {
  kind: BuffKind;
  remaining: number;
  mult: number;
}

// ---------------------------------------------------------------------------
// Cooldowns
// ---------------------------------------------------------------------------

export interface Cooldowns {
  basic: number;
  a1: number;
  a2: number;
  a3: number;
  /** Subclass skill cooldowns (present only once the hero has that skill). */
  sub1?: number;
  sub2?: number;
}

// ---------------------------------------------------------------------------
// Running per-player statistics (for the result screen)
// ---------------------------------------------------------------------------

export interface PlayerStats {
  damageDealt: number;
  healingDone: number;
  revives: number;
  deaths: number;
}

// ---------------------------------------------------------------------------
// Full authoritative entities (host-only `World` state)
// ---------------------------------------------------------------------------

export interface Player {
  id: EntityId;
  peerId: string; // network identity ('' allowed but host uses its own selfId)
  name: string;
  classId: ClassId;

  pos: Vec2;
  aim: Vec2; // unit vector
  hp: number;
  maxHp: number;
  moveSpeed: number;
  radius: number;

  state: PlayerState;
  downedTimer: number; // counts DOWN from DOWNED_BLEEDOUT while downed
  reviveProgress: number; // 0..REVIVE_TIME, accumulated hold from allies
  reviverId: EntityId | null;

  cooldowns: Cooldowns;
  castTimer: number; // > 0 while rooted mid-cast (e.g. Fireball)
  castSlot: ExtSlot | null;
  buffs: Buff[];

  // Persistent per-run upgrade modifiers (see engine/upgrades.ts). Applied once
  // at spawn; all default to their neutral value for an un-upgraded hero.
  cooldownMult: number; // ability cooldown multiplier (1 = normal, <1 = faster)
  castMult: number; // cast-time multiplier (1 = normal, <1 = faster)
  damageMult: number; // outgoing damage multiplier (1 = normal)
  damageTakenMult: number; // incoming damage multiplier (1 = normal, <1 = tankier)
  terrainResist: number; // 0 = full terrain effect, 1 = immune to slow + burn
  regenPerSec: number; // passive HP regenerated per second while alive

  threat: number; // cached threat contribution (mirror of boss table)
  stats: PlayerStats;

  /**
   * Per-player resolved ability table. A deep clone of the class defaults made at
   * spawn so character upgrades (engine/charUpgrades.ts) can mutate this hero's
   * ability numbers/mechanics without touching the shared class data. Optional so
   * lightweight test fixtures can omit it (host resolution falls back to the class
   * defaults). Typed via a type-only import to avoid a runtime import cycle.
   */
  abilities?: Record<AbilitySlot, import('../content/classes').PlayerAbilityDef>;
  /**
   * Subclass skills bound to the sub1/sub2 buttons (item 13). 0-2 entries; each is
   * a resolved ability def (with its own accumulated boons). Absent = no subclass.
   */
  subAbilities?: Partial<Record<SubSlot, import('../content/classes').PlayerAbilityDef>>;
  /** The chosen subclass-skill ids (serialized to PlayerView so clients label the buttons). */
  subSkillIds?: string[];

  // --- Multiclass (item 14). All absent for a single-class hero. ---
  /** Every class this hero can swap between (index 0 = primary); `classId` is the ACTIVE one. */
  classes?: ClassId[];
  /** Resolved ability table per owned class (built at spawn), swapped in on class change. */
  classTables?: Record<string, Record<AbilitySlot, import('../content/classes').PlayerAbilityDef>>;
  /** Per-class cooldown state, saved/restored across swaps so each class's cds are respected. */
  classCooldowns?: Record<string, Cooldowns>;
  /** Global-ish cooldown gate on swapping classes (seconds). */
  swapCd?: number;

  // --- Ephemeral shop consumables (item 21). Bought between bosses with coins,
  // last only this fight. Passive perks (speed/damage/defence) are folded into
  // the stat multipliers at spawn and leave no field behind. ---
  /** Healing vials carried into this fight (spent with the item button). */
  potions?: number;
  /** Phoenix charms — each auto-revives once when this hero would fall this fight. */
  selfRevives?: number;

  /** Score carried in from prior bosses this run (endless accumulates it). */
  baseScore?: number;

  /** Stun diminishing-returns state (see combat.applyStun). Lazily created. */
  stunDr?: StunDr;

  /** Host-side edge-detection of the previous button state for this player. */
  prevButtons: ButtonState;
  lastSeq: number;
}

/** Boss action state machine. */
export type BossActionKind = 'idle' | 'windup' | 'channel' | 'recover';

export interface BossAction {
  kind: BossActionKind;
  abilityId: string | null;
  remaining: number; // seconds left in current phase
  total: number; // full duration of current phase
  targetId: EntityId | null;
  targetPos: Vec2 | null;
  aimAngle: number; // radians, locked at wind-up start for cones/lines
  channelAccum: number; // accumulates time for channel ticks
}

export interface Boss {
  id: EntityId;
  monsterId: MonsterId;

  pos: Vec2;
  facing: number; // radians
  hp: number;
  maxHp: number;
  moveSpeed: number;
  radius: number;

  phase: BossPhase;
  action: BossAction;
  cooldowns: Record<string, number>; // per ability id
  decisionTimer: number;

  // monster-specific
  regen: number; // HP/s (troll); 0 otherwise
  /**
   * Host-only regen suppression timer (s). Set whenever the boss takes damage
   * (combat.damageBoss) and counted down each tick; passive regen only applies
   * while it is <= 0, so an actively-DPSed boss never heals. Never serialized.
   */
  regenLockout?: number;
  blinkTimer: number; // internal cooldown for Lich blink

  buffs: Buff[];

  /** Stun diminishing-returns state (see combat.applyStun). Lazily created. */
  stunDr?: StunDr;

  /**
   * Damage scale for shared arenas: a twin boss deals a fraction of its solo
   * damage so a duo isn't simply twice as lethal. 1 (or absent) = solo boss.
   */
  dmgScale?: number;

  /** Host bookkeeping: this boss's death event has been emitted (twin fights). */
  deathAnnounced?: boolean;

  // Endless "type" modifier (Frost Dragon, Dark Troll, …). All optional / absent
  // for a plain (cycle-0) boss.
  /** Elemental aura behaviour ('frost' | 'shadow' | 'ember' | 'venom' | 'storm'). */
  modAura?: string;
  /** Accent colour for the modifier glow. */
  modColor?: number;
  /** Timer accumulator driving the modifier's periodic aura effect. */
  modAuraTimer?: number;

  // Boss AFFIXES (Vampiric, Frenzied, Splitting…). All optional / absent for a
  // plain boss. Behaviour is applied host-side in world.ts; `affixes` is the
  // only part that crosses the wire (via BossView) to drive visuals + HUD.
  /** Affixes rolled onto this boss at fight-gen (empty / absent = none). */
  affixes?: AffixId[];
  /** Per-affix cadence accumulators (splitting/molten/warding/barbed timers). */
  affixTimers?: Record<string, number>;
  /**
   * Damage soaked since the last `barbed` retaliation pulse, so a Barbed boss's
   * thorn burst scales with how hard the band is hitting it. Decays each tick;
   * recorded in combat.damageBoss. Absent = 0.
   */
  recentDamageTaken?: number;
}

export interface Add {
  id: EntityId;
  pos: Vec2;
  hp: number;
  maxHp: number;
  moveSpeed: number;
  radius: number;
  targetId: EntityId | null;
  attackCd: number;
  buffs: Buff[];
  /** Stun diminishing-returns state (see combat.applyStun). Lazily created. */
  stunDr?: StunDr;
}

export type ProjectileKind = 'arrow' | 'arcaneBolt' | 'fireball' | 'shadowBolt' | 'smite';

export interface Projectile {
  id: EntityId;
  kind: ProjectileKind;
  pos: Vec2;
  vel: Vec2;
  ownerId: EntityId;
  side: Side;
  damage: number;
  impactRadius: number; // > 0 = AoE on impact
  hitRadius: number; // collision radius
  lifetime: number; // remaining seconds
  /** Remaining travel budget (world units). Fizzles at <= 0 so no shot laps the
   * torus forever and strikes from behind (see world.updateProjectiles). */
  rangeLeft: number;
  /** Slow applied to whatever a projectile strikes (frost shots); 1 = none. */
  slowMult?: number;
  slowDuration?: number;
  /** Stun/"freeze" seconds applied to whatever the projectile strikes. */
  freeze?: number;
  /** Fraction of dealt damage healed back to the owner (Vampiric shots). */
  lifesteal?: number;
}

export type ZoneKind =
  | 'voidZone'
  | 'rainOfArrows'
  | 'sanctuary'
  | 'poison'
  | 'entangle'
  | 'consecration'
  /** Antimagic pool (item 28 follow-up): a standable SILENCE zone — casters who
   * stand in it are silenced tick-by-tick (Beholder / Mind Flayer signature). */
  | 'antimagic';

// ---------------------------------------------------------------------------
// Terrain (static, per-run environmental hazards)
// ---------------------------------------------------------------------------

/**
 * A themed environmental hazard laid out once at fight start (seeded, so host
 * and clients agree). Terrain never moves or expires; it slows and/or damages
 * players standing inside. Themed by the boss (magma in the dragon's lair,
 * swamp in the troll's forest, cursed ice in the lich's crypt).
 */
export type TerrainKind =
  | 'magma' // dragon: burns (damage) + brief scorch slow
  | 'ember' // dragon: light heat slow, no damage (cosmetic-ish)
  | 'swamp' // troll: heavy slow + light poison
  | 'bog' // troll: heavy slow, no damage
  | 'ice' // lich: strong slow, no damage (slippery)
  | 'deathfog' // lich: creeping damage + mild slow
  // Signature terrains (item 28) — a boss's arena reads as its home.
  | 'tide' // kraken: surging ocean — very heavy slow, light drowning damage
  | 'abyss' // bandit/void: a black chasm — heavy damage, strong pull-to-edge slow
  // Signature terrains (item 28 follow-up) — more marquee bosses fight on themed,
  // mechanically-relevant ground (both surge with a telegraphed, non-lethal pull).
  | 'bloodmire' // vampire: a mire of blood — heavy slow + drain damage, drags you in
  | 'brimstone'; // demon: molten fissures — heavy burn + light slow, drags you in

export interface TerrainPatch {
  id: EntityId;
  kind: TerrainKind;
  pos: Vec2;
  radius: number;
  damagePerTick: number; // applied to players inside, per TERRAIN_TICK_INTERVAL
  slowMult: number; // moveSpeed multiplier while inside (1 = no slow)
  slowDuration: number; // s the slow lingers after leaving
  tickAccum: number; // accumulates toward TERRAIN_TICK_INTERVAL
  /** Seed for the renderer's procedural blob outline (visual only). */
  variant?: number;
  /**
   * Bottomless-core radius for a lethal hazard (the abyss). A hero dragged
   * within this of the patch centre by a surge plunges to an environmental death
   * (item 28). Absent / 0 = no lethal core (ordinary terrain, or the tide).
   */
  lethalRadius?: number;
  /**
   * Host-only surge cadence accumulator for a surging hazard (abyss / tide).
   * Counts up each tick; a surge fires and it resets. Never serialized. Absent
   * for terrain that never surges.
   */
  surgeAccum?: number;
}

/** Wire/render view of a terrain patch (static, so no interpolation needed). */
export interface TerrainView {
  id: EntityId;
  kind: TerrainKind;
  pos: Vec2;
  radius: number;
  /** Seed for the renderer's procedural blob outline (visual only). */
  variant?: number;
  /** Lethal bottomless-core radius (the abyss); drives the darker void ring. */
  lethalRadius?: number;
}

/**
 * Silhouette the renderer draws for a cover obstacle. Collision stays circular
 * (pos + radius) for every kind — the shapes are purely visual flavour, and
 * layout archetypes (walls, rings, spirals…) compose many circles instead.
 */
export type ObstacleKind = 'rock' | 'pillar' | 'crystal' | 'stump' | 'monolith' | 'totem';

/**
 * A solid cover obstacle (rubble / pillar / crystal / stump…) laid out once per
 * run (seeded). It blocks ranged attacks — projectiles crossing it are absorbed
 * — AND movement (world.separateAndClamp ejects movers), so players can break
 * line of sight and body-block.
 */
export interface Obstacle {
  id: EntityId;
  pos: Vec2;
  radius: number;
  /** Visual silhouette (collision is always the circle). Defaults to 'rock'. */
  kind?: ObstacleKind;
  /** Seed for the renderer's procedural shape jitter (visual only). */
  variant?: number;
}

/** Wire/render view of a cover obstacle (static; carried verbatim). */
export interface ObstacleView {
  id: EntityId;
  pos: Vec2;
  radius: number;
  kind?: ObstacleKind;
  variant?: number;
}

// ---------------------------------------------------------------------------
// Totems (menu-playground interaction pillars; local practice worlds only)
// ---------------------------------------------------------------------------

export type TotemKind = 'host' | 'join' | 'class' | 'controls';

export interface Totem {
  id: EntityId;
  kind: TotemKind;
  pos: Vec2;
  radius: number; // solid body (blocks movement like an obstacle)
  triggerRadius: number; // walking inside this ring activates the totem's UI
}

/** Render view of a playground totem (local only; never crosses the wire). */
export interface TotemView {
  id: EntityId;
  kind: TotemKind;
  pos: Vec2;
  radius: number;
  triggerRadius: number;
  /** True while the local hero stands inside the trigger ring (drives glow). */
  active?: boolean;
}

// ---------------------------------------------------------------------------
// Reward room (diegetic between-boss upgrade scene; local scene worlds only)
// ---------------------------------------------------------------------------

/**
 * A relic pickup lying on the floor of the between-boss reward room. The hero
 * walks OVER it (non-solid) to claim the boon it carries. `kind` groups it into
 * the generic-boon or class-boon set (one claim per set, mirroring the flat
 * upgrade screen's one-generic-one-character rule). Content-agnostic by design:
 * the engine only knows position/geometry, the UI maps it to a rolled offer.
 */
export type LootKind = 'generic' | 'char';

/** Render view of a reward-room relic (local only; never crosses the wire). */
export interface LootView {
  id: EntityId;
  kind: LootKind;
  pos: Vec2;
  radius: number;
  /** Walking within this radius of the relic claims it (walk-over pickup). */
  pickupRadius: number;
  /** This relic has been claimed (drives the pop/afterglow). */
  claimed?: boolean;
  /** Locked because another relic of the same kind was already claimed. */
  locked?: boolean;
  /** The hero is close enough to read/claim it (drives the inspector glow). */
  active?: boolean;
  /** Short caption drawn under the relic (icon + name); set by the UI. */
  label?: string;
}

/**
 * The descent vortex at the far end of the reward room. It only OPENS once the
 * hero has claimed their boons; walking into an open vortex readies the hero for
 * the next boss (steps out to un-ready). Local-only, like totems.
 */
export interface VortexView {
  id: EntityId;
  pos: Vec2;
  radius: number;
  /** Walking within this radius of an OPEN vortex descends (readies up). */
  activeRadius: number;
  /** 0..1 spin-up as the room's boons get claimed (1 = fully open). */
  charge: number;
  /** True once every boon is claimed and the vortex accepts a descent. */
  open?: boolean;
  /** True while the hero stands inside an open vortex (drives the pull FX). */
  standing?: boolean;
}

// ---------------------------------------------------------------------------
// Stations (diegetic menu interaction objects; local menu/lobby scenes only)
// ---------------------------------------------------------------------------

/**
 * A walkable menu station — the diegetic replacement for a flat menu control.
 * `class`/`boss` are selection effigies (walk onto to pick a hero / run opener),
 * `tier` filters the boss gallery, and the `portal` kinds are actions you walk
 * INTO (host a run, join, open controls, ready up, start). Local-only, like
 * totems: content-agnostic geometry the UI harness maps to a selection/action.
 */
export type StationKind =
  | 'class' // pick a hero class (refId = ClassId)
  | 'boss' // pick the run's opening boss (refId = MonsterId)
  | 'tier' // filter the boss gallery to a difficulty tier (refId = BossTier)
  | 'single' // run mode: a single boss fight
  | 'gauntlet' // run mode: a full gauntlet run
  | 'host' // commit: raise your banner (host a room)
  | 'join' // walk into the join portal
  | 'controls' // open the controls/rebinding overlay
  | 'muster' // lobby: step on to ready up
  | 'start'; // lobby: host steps on to start the fight

/** Render view of a menu station (local scene worlds only; never crosses the wire). */
export interface StationView {
  id: EntityId;
  kind: StationKind;
  pos: Vec2;
  radius: number;
  /** Walking within this radius selects/activates the station. */
  triggerRadius: number;
  /** Class id / monster id / tier the station refers to (selection stations). */
  refId?: string;
  /** Caption drawn under/over the station. */
  label?: string;
  /** This station is the current selection (drives the lit/chosen look). */
  selected?: boolean;
  /** Greyed-out and non-interactive (e.g. host gate before a boss is chosen). */
  disabled?: boolean;
  /** The hero is inside the trigger ring (drives the glow / channel). */
  active?: boolean;
  /** Channel progress 0..1 while the hero dwells to commit (0 if not dwelling). */
  channel?: number;
  /** Draw as a swirling portal (walk-into action) rather than a pedestal. */
  portal?: boolean;
  /** Accent colour (class colour / boss colour / tier colour). */
  color?: number;
}

/**
 * A telegraphed DELAYED strike not tied to a boss action — the primitive behind
 * mid-fight corruption beats (telegraph rain, hazard vents, a collapsing arena).
 * It shows a countdown telegraph while `fuse` burns down, then detonates once:
 * damages everyone inside `radius`, optionally applies a slow, and optionally
 * leaves a lingering ground zone (an erupted vent). Host-only world state; each
 * one is serialized into `Snapshot.telegraphs` so clients can dodge it too.
 */
export interface PendingStrike {
  id: EntityId;
  pos: Vec2;
  radius: number;
  fuse: number; // seconds remaining until detonation
  totalFuse: number; // full fuse length (drives the telegraph countdown fill)
  damage: number; // dealt to each player inside at detonation
  slowMult?: number; // on-detonation slow (1 / absent = none)
  slowDuration?: number;
  /** Accent colour hint for the telegraph (matches the corruption theme). */
  color?: number;
  /** Leave a lingering hazard zone at the impact point (vent eruptions). */
  leaveZone?: {
    kind: ZoneKind;
    duration: number;
    tickDamage: number;
    slowMult?: number;
    slowDuration?: number;
  };
  /**
   * A positional PULL on detonation (terrain surges): every hero still inside
   * `radius` is dragged toward `pos` by `strength` (never overshooting the
   * centre). If the drag lands them within `lethalRadius` of the centre they take
   * `lethalDamage` — a plunge into the void (item 28). `lethalRadius` 0 = a
   * non-lethal haul (the tide). Absent = a plain damage strike (no pull).
   */
  pull?: {
    strength: number;
    lethalRadius: number;
    lethalDamage: number;
  };
}

export interface GroundZone {
  id: EntityId;
  kind: ZoneKind;
  pos: Vec2;
  radius: number;
  side: Side; // whose side placed it (determines who it affects)
  ownerId: EntityId;
  damagePerTick: number; // applied to the opposing side
  healPerTick: number; // applied to the owning side
  /** Move-speed multiplier applied to enemies standing inside (1 = none). */
  slowMult: number;
  slowDuration: number; // s the slow lingers after leaving
  /**
   * SILENCE zone (item 28 follow-up): seconds of silence re-applied every tick to
   * an opposing-side creature standing inside, so an antimagic pool is a standable
   * silence zone — not just an on-hit rider. Refreshed per tick (source
   * 'zoneSilence'), so it lingers ~this long after the caster steps out. Absent /
   * 0 = a plain hazard. Boss-side zones only (players don't silence bosses).
   */
  silence?: number;
  duration: number; // seconds — full lifetime, used for the render fade envelope
  remaining: number; // seconds — counts down; zone is removed at <= 0
  tickAccum: number; // accumulates toward ZONE_TICK_INTERVAL
  /** Themed tint override (affix/corruption hazards); falls back to the per-kind palette. */
  color?: number;
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface ButtonState {
  basic: boolean;
  a1: boolean;
  a2: boolean;
  a3: boolean;
  revive: boolean;
  // Expansion buttons — optional so every existing neutral-literal stays valid;
  // producers set them and consumers read `?? false`.
  /** Fire subclass skill 1 / 2 (item 13). */
  sub1?: boolean;
  sub2?: boolean;
  /** Swap active multiclass (tap) / open the class radial (hold) (item 14). */
  swap?: boolean;
  /** Spend the selected ephemeral shop item (item 21). */
  item?: boolean;
}

/** Per-frame unified input produced by keyboard/gamepad. Buttons are HELD state;
 * edges are detected host-side per sim tick. */
export interface InputState {
  move: Vec2; // magnitude 0..1
  aim: Vec2; // unit vector
  buttons: ButtonState;
}

/** Networked input command (client -> host). */
export interface InputCommand {
  seq: number;
  move: Vec2;
  aim: Vec2;
  buttons: ButtonState;
  /**
   * Auto-fire ("hold to repeat") preference. When true, the host treats a HELD
   * ability button as a repeated press (firing whenever the ability is off
   * cooldown) instead of requiring a fresh press each time. Absent/false keeps
   * the classic edge-triggered behavior. Only affects ability slots, not revive.
   */
  autofire?: boolean;
}

// ---------------------------------------------------------------------------
// Events (one-shot, for VFX / SFX only)
// ---------------------------------------------------------------------------

/**
 * Geometry of a player/boss ability's effect area, emitted with a `skillArea`
 * event so the renderer can flash the exact region an ability just affected
 * (the Knight's cleave cone, the Cleric's heal range, etc.). Purely cosmetic.
 */
export type SkillAreaKind = 'cone' | 'circle' | 'line';

export interface SkillArea {
  kind: SkillAreaKind;
  origin: Vec2; // cone/line emanation point, or circle center
  angle: number; // radians — cone/line facing (unused for circle)
  range: number; // cone range / line length
  radius: number; // circle radius / line half-width
  halfAngle: number; // cone half-angle (radians)
}

export type GameEvent =
  | { t: 'hit'; pos: Vec2; amount: number; targetId: EntityId; side: Side }
  | { t: 'heal'; pos: Vec2; amount: number; targetId: EntityId }
  | {
      t: 'cast';
      ability: string;
      sourceId: EntityId;
      pos: Vec2;
      side: Side;
      /** Slot the cast came from (players); absent for boss casts. */
      slot?: ExtSlot;
    }
  | {
      // A player/boss ability resolved — carries its effect geometry so the
      // renderer can flash the exact area (§ visual-cues). Cosmetic only.
      t: 'skillArea';
      sourceId: EntityId;
      side: Side;
      color: number; // packed 0xRRGGBB (class color / boss red)
      area: SkillArea;
    }
  | { t: 'death'; id: EntityId; kind: 'player' | 'add' | 'boss'; pos: Vec2 }
  | { t: 'spawn'; id: EntityId; kind: 'add'; pos: Vec2 }
  | { t: 'revive'; id: EntityId; pos: Vec2 }
  | { t: 'downed'; id: EntityId; pos: Vec2 }
  | { t: 'dodge'; id: EntityId; pos: Vec2 }
  | { t: 'blink'; id: EntityId; from: Vec2; to: Vec2 }
  | { t: 'telegraph'; pos: Vec2; shape: TelegraphKind }
  | { t: 'enrage'; id: EntityId; pos: Vec2 }
  | { t: 'projectile'; kind: ProjectileKind; pos: Vec2 }
  // A stun failed to land because the target's diminishing returns hit the
  // immunity floor (see combat.applyStun). Renderer flashes "Resisted".
  | { t: 'stunResist'; id: EntityId; pos: Vec2 }
  // The fight was just won — heroes cheer and fireworks fly (victory lap).
  | { t: 'victory'; pos: Vec2 }
  // Hardcore kill-deadline expired (item 11) — the clock ran out with a boss
  // still up and the band wiped. Drives a "time's up" cue on the final frame.
  | { t: 'deadline'; pos: Vec2 }
  // A mid-fight corruption beat just fired (enrage surge, telegraph rain, a
  // healing rift…). Drives a center-screen banner + a world-anchored burst.
  | { t: 'corruption'; kind: CorruptionKind; name: string; pos: Vec2; good?: boolean }
  // A practice dummy fell and respawned (menu playground only).
  | { t: 'dummyReset'; id: EntityId; pos: Vec2 };

// ---------------------------------------------------------------------------
// Telegraphs
// ---------------------------------------------------------------------------

export type TelegraphKind = 'cone' | 'circle' | 'line';

export interface Telegraph {
  kind: TelegraphKind;
  origin: Vec2; // emanation point (boss position for cones/lines)
  angle: number; // radians (cone/line facing)
  range: number; // cone range / line length / circle center distance
  radius: number; // circle radius / half-width proxy
  halfAngle: number; // radians (cone half-angle)
  width: number; // line width
  target: Vec2; // circle center / line end
  remainingWindup: number;
  totalWindup: number;
}

// ---------------------------------------------------------------------------
// Serializable "views" (network + render). A view is the minimal per-entity
// data a remote client needs to draw and interpolate.
// ---------------------------------------------------------------------------

export interface PlayerView {
  id: EntityId;
  peerId: string;
  name: string;
  classId: ClassId;
  pos: Vec2;
  aim: Vec2;
  hp: number;
  maxHp: number;
  /** Authoritative base move speed (class + persistent upgrades); the client
   * predicts its own position with this so upgraded heroes don't rubber-band. */
  moveSpeed: number;
  state: PlayerState;
  cooldowns: Cooldowns;
  buffs: BuffView[];
  downedTimer: number;
  reviveProgress: number;
  castSlot: ExtSlot | null;
  castTimer: number;
  /** Live participation score (prior bosses + this fight), for HUD / pause menu. */
  score: number;
  /** Chosen subclass-skill ids (so clients render + label the sub1/sub2 buttons). */
  subSkills?: string[];
  /** Owned classes for a multiclass hero (index 0 primary; `classId` is active). */
  classes?: ClassId[];
  /** Remaining class-swap gate (seconds); 0/absent = a swap is ready (item 14). */
  swapCd?: number;
  /** Healing vials carried this fight (item 21) — drives the HUD item pip. */
  potions?: number;
}

export interface BossView {
  id: EntityId;
  monsterId: MonsterId;
  pos: Vec2;
  facing: number;
  hp: number;
  maxHp: number;
  phase: BossPhase;
  telegraph: Telegraph | null;
  buffs: BuffView[];
  /** Endless "type" name prefix (e.g. "Frost") and accent colour, if modified. */
  modName?: string;
  modColor?: number;
  /**
   * Affixes on this boss (Vampiric, Frenzied…). Display-only over the wire: the
   * renderer maps them to an aura colour and the HUD to name chips. Behaviour is
   * resolved host-side. Absent / empty for a plain boss.
   */
  affixes?: AffixId[];
  // Presentation-only: drives boss animation clip selection (see render/sprites).
  // Carried verbatim over the wire (JSON) and never interpolated.
  action: BossActionKind; // 'idle' | 'windup' | 'channel' | 'recover'
  abilityId: string | null; // e.g. 'groundSlam', 'fireBreath'; null when idle
}

export interface AddView {
  id: EntityId;
  pos: Vec2;
  hp: number;
  maxHp: number;
  buffs: BuffView[];
}

export interface ProjectileView {
  id: EntityId;
  kind: ProjectileKind;
  side: Side;
  pos: Vec2;
  vel: Vec2;
}

export interface ZoneView {
  id: EntityId;
  kind: ZoneKind;
  pos: Vec2;
  radius: number;
  duration: number;
  remaining: number;
  /** Themed tint override (affix/corruption hazards); falls back to the palette. */
  color?: number;
}

/** The over-the-wire fight snapshot (host -> clients). */
export interface Snapshot {
  tick: number;
  players: PlayerView[];
  /** Every living-or-dying boss in the arena (twin encounters ship several). */
  bosses: BossView[];
  adds: AddView[];
  projectiles: ProjectileView[];
  groundZones: ZoneView[];
  /** Static per-run terrain hazards (never move; carried verbatim). */
  terrain: TerrainView[];
  /** Static per-run cover obstacles that block ranged attacks. */
  obstacles: ObstacleView[];
  /**
   * World-level telegraphs NOT owned by a boss action — the incoming corruption
   * strikes (rain, vents, a collapsing ring). Carried so clients can dodge them.
   * Absent / empty when nothing is pending.
   */
  telegraphs?: Telegraph[];
  events: GameEvent[];
  /** Run seed — drives the renderer's procedural ground tiling (visual only). */
  seed: number;
  /**
   * Hardcore kill-deadline (item 11): seconds left before the fight is lost on
   * the clock. Present only in a hardcore fight — the HUD shows the countdown
   * whenever this is defined. Absent for every standard fight.
   */
  deadlineRemaining?: number;
}

/**
 * What the renderer consumes each frame. Produced by the host directly from
 * `World`, or by the client from interpolated snapshots. A superset of
 * `Snapshot` with local context.
 */
export interface RenderState {
  tick: number;
  players: PlayerView[];
  bosses: BossView[];
  adds: AddView[];
  projectiles: ProjectileView[];
  groundZones: ZoneView[];
  terrain: TerrainView[];
  obstacles: ObstacleView[];
  /** World-level corruption telegraphs (see Snapshot.telegraphs). */
  telegraphs?: Telegraph[];
  events: GameEvent[];
  seed: number;
  /** Hardcore kill-deadline countdown seconds (see Snapshot.deadlineRemaining). */
  deadlineRemaining?: number;
  localPlayerId: EntityId | null;
  arena: { w: number; h: number };
  /** Playground totems (local practice world only). */
  totems?: TotemView[];
  /** Reward-room relic pickups (local scene world only). */
  loot?: LootView[];
  /** Reward-room descent vortex (local scene world only), or null/absent. */
  vortex?: VortexView | null;
  /** Diegetic menu stations (local menu/lobby scene only). */
  stations?: StationView[];
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type Outcome = 'victory' | 'defeat';

export interface ResultPlayerStat {
  peerId: string;
  name: string;
  classId: ClassId;
  damageDealt: number;
  healingDone: number;
  revives: number;
  deaths: number;
  /** Cumulative participation score across the run (endless keeps accumulating). */
  score: number;
  /**
   * Ephemeral-shop coins earned in THIS fight, ranked by performance (item 21):
   * the top performer banks the most, the tail banks none. 0 on a defeat (a lost
   * boss pays nothing). Clients add their own row's coins to the shop balance.
   */
  coins?: number;
}

export interface FightResult {
  outcome: Outcome;
  timeMs: number;
  stats: ResultPlayerStat[];
  /** Which boss this result is for (the encounter's lead boss). */
  monsterId: MonsterId;
  /** Every boss of the encounter (twin fights list two). Absent = solo. */
  monsterIds?: MonsterId[];
  /**
   * Gauntlet/run context. When a gauntlet fight is won and another boss
   * remains, `nextMonsterId` names it (the host auto-advances). `runIndex` /
   * `runTotal` describe progress through the run (0-based). All null/absent for
   * a plain single-boss fight.
   */
  nextMonsterId?: MonsterId | null;
  /** All bosses of the NEXT encounter (twin fights list two). */
  nextMonsterIds?: MonsterId[] | null;
  runIndex?: number;
  runTotal?: number;
  /**
   * Endless context. `cycle` is the 0-based run cycle (0 = the first run). When a
   * full run is cleared, `endlessAvailable` is true so the victory screen can
   * offer "Continue (Endless)". `modName` names the current elemental type prefix.
   */
  cycle?: number;
  endlessAvailable?: boolean;
  modName?: string;
  /**
   * Hardcore only (items 11 + 21): a wipe is normally terminal, but if the band
   * banked a Second Chance from the ephemeral shop the host can still retry. True
   * = show the Retry button on a hardcore defeat.
   */
  hardcoreRetryAvailable?: boolean;
  /**
   * Deterministic seed for THIS interstitial's reward offers, derived host-side
   * from the master run seed. Every client seeds its own offer roll from it so a
   * shared seed reproduces the same boons between the same bosses (seed mode).
   */
  rewardSeed?: number;
  /** The session's master seed (for display / sharing on the result screen). */
  runSeed?: number;
}
