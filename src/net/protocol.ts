/**
 * Warband — networking protocol. All messages are JSON-serializable and sent
 * over Trystero namespaced actions. Star topology, host-authoritative.
 */
import type {
  ClassId,
  MonsterId,
  InputCommand,
  Snapshot,
  FightResult,
} from '../engine/types';
import type { UpgradeId } from '../engine/upgrades';

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
  upgrade: 'upg', // client -> host (between-boss upgrade pick)
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
}

export interface StartMsg {
  seed: number;
  playerCount: number;
  monsterId: MonsterId;
  /** Ordered roster used to build the world; peerId order must match host. */
  roster: Array<{ peerId: string; name: string; classId: ClassId }>;
  /** Gauntlet/run context so clients can show "Boss 2 of 3", etc. */
  gauntlet: boolean;
  runIndex: number; // 0-based boss index in the run
  runTotal: number; // total bosses in the run (1 for a single fight)
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

/** Client -> host: the player's between-boss upgrade choice. */
export interface UpgradeMsg {
  upgradeId: UpgradeId;
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
  getRenderState(nowMs: number): import('../engine/types').RenderState | null;
  /** Lobby controls (implemented by both Host and Client). */
  setSelection(classId: ClassId): void;
  setReady(ready: boolean): void;
  /** Request the shared sim pause/resume (host acts directly; client asks host). */
  requestPause(paused: boolean): void;
  /** Submit a between-boss upgrade pick (host records it; client relays it). */
  chooseUpgrade(upgradeId: UpgradeId): void;
  leave(): void;
}
