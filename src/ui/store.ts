/**
 * Warband — Zustand app/UI store. Holds app phase, room + lobby state, local
 * selections and result. The networking layer writes lobby/result data here;
 * React reads it. The hot game loop uses hudStore.ts instead (keep it off React).
 */
import { create } from 'zustand';
import type { ClassId, MonsterId, FightResult } from '../engine/types';
import type { LobbyPlayer, NetSession } from '../net/protocol';
import { DEFAULT_CLASS } from '../engine/classes';
import { DEFAULT_MONSTER } from '../engine/monsters';

export type Phase =
  | 'menu'
  | 'hostSetup'
  | 'join'
  | 'lobby'
  | 'game'
  | 'result'
  | 'waiting'; // late-join holding state: "fight in progress"

export interface AppState {
  phase: Phase;
  error: string | null;
  hostLeft: boolean;

  // room / session
  roomCode: string | null;
  isHost: boolean;
  session: NetSession | null;

  // lobby (mirror of host authority)
  monsterId: MonsterId;
  players: LobbyPlayer[];
  lobbyPhase: 'lobby' | 'inFight';

  // local selections
  localName: string;
  localClass: ClassId;
  localReady: boolean;

  // result
  result: FightResult | null;

  // options
  muted: boolean;

  // --- actions ---
  setPhase: (p: Phase) => void;
  setError: (e: string | null) => void;
  setHostLeft: (v: boolean) => void;
  setRoom: (code: string | null, isHost: boolean) => void;
  setSession: (s: NetSession | null) => void;
  setMonster: (id: MonsterId) => void;
  setLobby: (
    players: LobbyPlayer[],
    monsterId: MonsterId,
    lobbyPhase: 'lobby' | 'inFight',
  ) => void;
  setLocalName: (n: string) => void;
  setLocalClass: (c: ClassId) => void;
  setLocalReady: (r: boolean) => void;
  setResult: (r: FightResult | null) => void;
  toggleMute: () => void;
  /** Tear the session down and return to the main menu. */
  reset: () => void;
}

export const useStore = create<AppState>((set, get) => ({
  phase: 'menu',
  error: null,
  hostLeft: false,

  roomCode: null,
  isHost: false,
  session: null,

  monsterId: DEFAULT_MONSTER,
  players: [],
  lobbyPhase: 'lobby',

  localName: '',
  localClass: DEFAULT_CLASS,
  localReady: false,

  result: null,
  muted: false,

  setPhase: (phase) => set({ phase }),
  setError: (error) => set({ error }),
  setHostLeft: (hostLeft) => set({ hostLeft }),
  setRoom: (roomCode, isHost) => set({ roomCode, isHost }),
  setSession: (session) => set({ session }),
  setMonster: (monsterId) => set({ monsterId }),
  setLobby: (players, monsterId, lobbyPhase) => set({ players, monsterId, lobbyPhase }),
  setLocalName: (localName) => set({ localName }),
  setLocalClass: (localClass) => set({ localClass }),
  setLocalReady: (localReady) => set({ localReady }),
  setResult: (result) => set({ result }),
  toggleMute: () => set({ muted: !get().muted }),

  reset: () => {
    const s = get();
    try {
      s.session?.leave();
    } catch {
      /* ignore */
    }
    set({
      phase: 'menu',
      error: null,
      hostLeft: false,
      roomCode: null,
      isHost: false,
      session: null,
      players: [],
      lobbyPhase: 'lobby',
      localReady: false,
      result: null,
    });
  },
}));
