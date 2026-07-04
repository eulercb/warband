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
}

export interface LobbyMsg {
  monsterId: MonsterId;
  players: LobbyPlayer[];
  phase: 'lobby' | 'inFight';
}

export interface StartMsg {
  seed: number;
  playerCount: number;
  monsterId: MonsterId;
  /** Ordered roster used to build the world; peerId order must match host. */
  roster: Array<{ peerId: string; name: string; classId: ClassId }>;
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
  leave(): void;
}
