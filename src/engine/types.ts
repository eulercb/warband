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

export type ClassId = 'knight' | 'ranger' | 'mage' | 'cleric';
export type MonsterId = 'dragon' | 'troll' | 'lich';
export type AbilitySlot = 'basic' | 'a1' | 'a2' | 'a3';

export type PlayerState = 'alive' | 'downed' | 'dead';
export type BossPhase = 'normal' | 'enraged';
export type Side = 'player' | 'boss';

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
  | 'invuln';

export interface Buff {
  kind: BuffKind;
  mult: number;
  remaining: number; // seconds
  /** Source label, used for de-duping refreshable buffs (e.g. 'shieldWall'). */
  source: string;
}

// ---------------------------------------------------------------------------
// Cooldowns
// ---------------------------------------------------------------------------

export interface Cooldowns {
  basic: number;
  a1: number;
  a2: number;
  a3: number;
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
  castSlot: AbilitySlot | null;
  buffs: Buff[];

  threat: number; // cached threat contribution (mirror of boss table)
  stats: PlayerStats;

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
  blinkTimer: number; // internal cooldown for Lich blink

  buffs: Buff[];
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
}

export type ProjectileKind =
  | 'arrow'
  | 'arcaneBolt'
  | 'fireball'
  | 'shadowBolt'
  | 'smite';

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
}

export type ZoneKind = 'voidZone' | 'rainOfArrows' | 'sanctuary';

export interface GroundZone {
  id: EntityId;
  kind: ZoneKind;
  pos: Vec2;
  radius: number;
  side: Side; // whose side placed it (determines who it affects)
  ownerId: EntityId;
  damagePerTick: number; // applied to the opposing side
  healPerTick: number; // applied to the owning side
  duration: number; // seconds — full lifetime, used for the render fade envelope
  remaining: number; // seconds — counts down; zone is removed at <= 0
  tickAccum: number; // accumulates toward ZONE_TICK_INTERVAL
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
}

// ---------------------------------------------------------------------------
// Events (one-shot, for VFX / SFX only)
// ---------------------------------------------------------------------------

export type GameEvent =
  | { t: 'hit'; pos: Vec2; amount: number; targetId: EntityId; side: Side }
  | { t: 'heal'; pos: Vec2; amount: number; targetId: EntityId }
  | { t: 'cast'; ability: string; sourceId: EntityId; pos: Vec2; side: Side }
  | { t: 'death'; id: EntityId; kind: 'player' | 'add' | 'boss'; pos: Vec2 }
  | { t: 'revive'; id: EntityId; pos: Vec2 }
  | { t: 'downed'; id: EntityId; pos: Vec2 }
  | { t: 'dodge'; id: EntityId; pos: Vec2 }
  | { t: 'blink'; id: EntityId; from: Vec2; to: Vec2 }
  | { t: 'telegraph'; pos: Vec2; shape: TelegraphKind }
  | { t: 'enrage'; id: EntityId; pos: Vec2 }
  | { t: 'projectile'; kind: ProjectileKind; pos: Vec2 };

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
  state: PlayerState;
  cooldowns: Cooldowns;
  buffs: Array<{ kind: BuffKind; remaining: number }>;
  downedTimer: number;
  reviveProgress: number;
  castSlot: AbilitySlot | null;
  castTimer: number;
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
}

/** The over-the-wire fight snapshot (host -> clients). */
export interface Snapshot {
  tick: number;
  players: PlayerView[];
  boss: BossView | null;
  adds: AddView[];
  projectiles: ProjectileView[];
  groundZones: ZoneView[];
  events: GameEvent[];
}

/**
 * What the renderer consumes each frame. Produced by the host directly from
 * `World`, or by the client from interpolated snapshots. A superset of
 * `Snapshot` with local context.
 */
export interface RenderState {
  tick: number;
  players: PlayerView[];
  boss: BossView | null;
  adds: AddView[];
  projectiles: ProjectileView[];
  groundZones: ZoneView[];
  events: GameEvent[];
  localPlayerId: EntityId | null;
  arena: { w: number; h: number };
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
}

export interface FightResult {
  outcome: Outcome;
  timeMs: number;
  stats: ResultPlayerStat[];
}
