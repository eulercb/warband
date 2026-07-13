/**
 * Warband — networking protocol. All messages are JSON-serializable and sent
 * over Trystero namespaced actions. Star topology, host-authoritative.
 */
import type { ClassId, MonsterId, InputCommand, Snapshot, FightResult } from '../engine/core/types';
import type { UpgradeId } from '../engine/content/upgrades';
import type { EphemeralId } from '../engine/content/ephemeral';

/** Trystero action ids (kept short; must match across peers). */
export const ACTIONS = {
  hello: 'hello', // client -> host
  select: 'sel', // client -> host
  ready: 'rdy', // client -> host
  lobby: 'lob', // host -> clients
  start: 'go', // host -> clients
  input: 'inp', // client -> host
  snapshot: 'snp', // host -> clients
  result: 'res', // host -> clients
  returnLobby: 'rtl', // host -> clients
  pause: 'pau', // host -> clients (sim frozen / resumed)
  pauseReq: 'prq', // client -> host (request pause / resume of the shared sim)
  upgrade: 'upg', // client -> host (between-boss upgrade pick: generic and/or char)
  special: 'spc', // client -> host (run-clear special pick: subclass skill / extra class)
  swap: 'swc', // client -> host (multiclass swap: cycle, or a radial's targeted class)
  nextReady: 'nrd', // client -> host (ready to advance to the next boss)
  nextReadyState: 'nrs', // host -> clients (how many are ready to advance)
  bye: 'bye', // either -> either (graceful leave, esp. host)
} as const;

export const APP_ID = 'warband-v1-boss-fight';

// --- Lobby ---

export interface HelloMsg {
  name: string;
}

export interface SelectMsg {
  classId: ClassId;
}

export interface ReadyMsg {
  ready: boolean;
}

export interface LobbyPlayer {
  peerId: string;
  name: string;
  classId: ClassId;
  ready: boolean;
  isHost: boolean;
  /** Host-simulated AI band member (never a real peer). Always "ready". */
  isBot: boolean;
}

export interface LobbyMsg {
  monsterId: MonsterId;
  players: LobbyPlayer[];
  phase: 'lobby' | 'inFight';
  /** Whether the host has enabled a sequence run (gauntlet). */
  gauntlet: boolean;
  /**
   * The session's master seed. Shared already in the LOBBY (not just StartMsg)
   * so clients can derive the run's PROCEDURAL content — rolled class kits,
   * monster variants, boon magnitudes (content/procgen.ts) — while picking a
   * class, and so the kit they preview is exactly the kit the sim will spawn.
   */
  runSeed?: number;
}

export interface StartMsg {
  seed: number;
  playerCount: number;
  monsterId: MonsterId;
  /** Every boss of the encounter (twin fights list two). Absent = solo. */
  monsterIds?: MonsterId[];
  /** Ordered roster used to build the world; peerId order must match host. */
  roster: Array<{ peerId: string; name: string; classId: ClassId }>;
  /** Gauntlet/run context so clients can show "Boss 2 of 5", etc. */
  gauntlet: boolean;
  runIndex: number; // 0-based boss index in the run
  runTotal: number; // total bosses in the run (1 for a single fight)
  /** Endless cycle (0 = first run) and the boss's elemental type prefix, if any. */
  cycle: number;
  modName?: string;
  /** The session's master seed (shared so clients can display the run seed). */
  runSeed?: number;
  /** Hardcore run (item 11) — clients hide the retry option and show the mode. */
  hardcore?: boolean;
}

/**
 * Host -> clients: shared-sim pause state.
 *  - `paused` true  + `countdown` null/absent  → frozen, pause menu shown.
 *  - `paused` true  + `countdown` > 0          → resuming; N-second countdown.
 *  - `paused` false                            → running.
 * `byName` names whoever triggered the pause (for the overlay), when known.
 */
export interface PauseMsg {
  paused: boolean;
  byName?: string;
  countdown?: number | null;
}

/** Client -> host: request to pause or resume the shared sim (any player may). */
export interface PauseReqMsg {
  paused: boolean;
}

/**
 * Client -> host: the player's between-boss upgrade choices. A round grants one
 * generic pick AND one character (class) pick; either may arrive on its own.
 */
export interface UpgradeMsg {
  generic?: UpgradeId;
  char?: string;
}

/**
 * Client -> host: a run-clear SPECIAL pick (item 13/14). Either a subclass skill
 * (its subclass id + skill id) or an additional multiclass class.
 */
export interface SpecialMsg {
  subclassId?: string;
  subSkillId?: string;
  extraClass?: ClassId;
  /** Ephemeral-shop purchase (item 21): the coin-priced perk this player is buying. */
  buyEphemeral?: EphemeralId;
}

/**
 * Client -> host: a multiclass swap request (item 14). `target` names the class
 * the hero's class radial landed on (a direct swap); omitted, the host cycles to
 * the next owned class (a quick tap). The host validates ownership + the swap
 * gate, so this only ever expresses intent.
 */
export interface SwapMsg {
  target?: ClassId;
}

/** Client -> host: this player is ready to advance to the next boss. */
export interface NextReadyMsg {
  ready: boolean;
}

/** Host -> clients: how many players have readied up for the next boss. */
export interface NextReadyStateMsg {
  ready: number;
  total: number;
}

// --- Fight ---

export type InputMsg = InputCommand;

export type SnapshotMsg = Snapshot;

export interface ResultMsg {
  result: FightResult;
}

export interface ByeMsg {
  reason: 'hostLeft' | 'left';
}

/** A minimal transport-agnostic session used by GameView + session control. */
export interface NetSession {
  readonly isHost: boolean;
  readonly selfId: string;
  localPlayerId: number | null;
  setLocalInput(input: InputCommand): void;
  /** Interpolated (client) or authoritative (host) render state for `nowMs`. */
  getRenderState(nowMs: number): import('../engine/core/types').RenderState | null;
  /** Lobby controls (implemented by both Host and Client). */
  setSelection(classId: ClassId): void;
  setReady(ready: boolean): void;
  /** Request the shared sim pause/resume (host acts directly; client asks host). */
  requestPause(paused: boolean): void;
  /** Submit a between-boss generic upgrade pick (host records it; client relays it). */
  chooseUpgrade(upgradeId: UpgradeId): void;
  /** Submit a between-boss character (class) upgrade pick. */
  chooseCharUpgrade(upgradeId: string): void;
  /** Submit a run-clear subclass-skill pick (item 13). */
  chooseSubSkill(subclassId: string, skillId: string): void;
  /** Submit a run-clear extra-class (multiclass) pick (item 14). */
  chooseExtraClass(classId: ClassId): void;
  /**
   * Request a multiclass swap (item 14): `target` swaps directly to that owned
   * class (the class radial); omitted, cycles to the next owned class (a tap).
   * Host-authoritative — the host validates and applies it to the live world.
   */
  swapClass(target?: ClassId): void;
  /** Buy a coin-priced ephemeral perk for the next fight (item 21). */
  buyEphemeral(id: EphemeralId): void;
  /** Mark this player ready (or not) to advance to the next boss. */
  setNextReady(ready: boolean): void;
  leave(): void;
}
