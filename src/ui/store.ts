/**
 * Warband — Zustand app/UI store. Holds app phase, room + lobby state, local
 * selections and result. The networking layer writes lobby/result data here;
 * React reads it. The hot game loop uses hudStore.ts instead (keep it off React).
 */
import { create } from 'zustand';
import type { ClassId, MonsterId, FightResult } from '../engine/types';
import type { UpgradeId } from '../engine/upgrades';
import type { LobbyPlayer, NetSession } from '../net/protocol';
import { DEFAULT_CLASS } from '../engine/classes';
import { DEFAULT_MONSTER } from '../engine/monsters';

// --- Persisted local preferences (survive reloads / future runs) -----------
const NAME_KEY = 'warband.heroName.v1';
const VOLUME_KEY = 'warband.volume.v1';
const AUTOFIRE_KEY = 'warband.autofire.v1';

/** Load the last hero name the player used (empty string if none / unavailable). */
function loadName(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      return (localStorage.getItem(NAME_KEY) ?? '').slice(0, 16);
    }
  } catch {
    /* privacy mode / unavailable storage — no persisted name */
  }
  return '';
}

/** Persist the hero name so the player never has to retype it. */
function persistName(name: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(NAME_KEY, name);
  } catch {
    /* ignore quota / privacy-mode failures */
  }
}

/** Load the persisted master volume (0..1), defaulting to full. */
function loadVolume(): number {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(VOLUME_KEY);
      if (raw != null) {
        const v = Number(raw);
        if (Number.isFinite(v)) return Math.max(0, Math.min(1, v));
      }
    }
  } catch {
    /* privacy mode / unavailable storage — use default */
  }
  return 1;
}

function persistVolume(v: number): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(VOLUME_KEY, String(v));
  } catch {
    /* ignore quota / privacy-mode failures */
  }
}

/** Load the persisted hold-to-autofire preference (default off). */
function loadAutofire(): boolean {
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(AUTOFIRE_KEY) === '1';
  } catch {
    /* privacy mode / unavailable storage — default off */
  }
  return false;
}

function persistAutofire(on: boolean): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(AUTOFIRE_KEY, on ? '1' : '0');
  } catch {
    /* ignore quota / privacy-mode failures */
  }
}

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
  /**
   * Connectivity gauge. On the host: the number of connected players. On a
   * client: host reachability as 0/1 (1 once the host link is proven by an
   * actual host message — not a raw mesh peer count).
   */
  peerCount: number;
  /** Soft connectivity hint shown while a client is still trying to reach the host. */
  netHint: string | null;

  // lobby (mirror of host authority)
  monsterId: MonsterId;
  players: LobbyPlayer[];
  lobbyPhase: 'lobby' | 'inFight';
  /** Host setting: run a boss gauntlet rather than a single fight. */
  gauntlet: boolean;

  // local selections
  localName: string;
  localClass: ClassId;
  localReady: boolean;

  // fight / run
  /** Shared sim frozen (any player may pause; host is authoritative). */
  paused: boolean;
  /** Display name of whoever paused (for the shared overlay), or null. */
  pausedBy: string | null;
  /** Resume countdown (seconds left) while un-pausing, else null. */
  resumeCountdown: number | null;
  /** Gauntlet progress for the current fight (index/total), or null. */
  run: { index: number; total: number } | null;
  /** Endless cycle for the current run (0 = first run). */
  cycle: number;
  /** Upgrades this local hero has picked so far this run (for display). */
  myUpgrades: UpgradeId[];
  /** Character (class) upgrades this local hero has picked so far this run. */
  myCharUpgrades: string[];
  /** Between-boss readiness tally from the host (upgrade screen). */
  nextReadyReady: number;
  nextReadyTotal: number;

  // result
  result: FightResult | null;

  // options
  muted: boolean;
  /** Master volume 0..1 (persisted). Independent of the mute flag. */
  volume: number;
  /** Hold-to-autofire: held ability buttons repeat instead of edge-triggering. */
  autofire: boolean;
  /** Whether the Controls (rebinding) overlay is open. */
  showControls: boolean;

  // --- actions ---
  setPhase: (p: Phase) => void;
  setError: (e: string | null) => void;
  setHostLeft: (v: boolean) => void;
  setRoom: (code: string | null, isHost: boolean) => void;
  setSession: (s: NetSession | null) => void;
  setPeerCount: (n: number) => void;
  setNetHint: (h: string | null) => void;
  setMonster: (id: MonsterId) => void;
  setGauntlet: (on: boolean) => void;
  setLobby: (
    players: LobbyPlayer[],
    monsterId: MonsterId,
    lobbyPhase: 'lobby' | 'inFight',
    gauntlet: boolean,
  ) => void;
  setLocalName: (n: string) => void;
  setLocalClass: (c: ClassId) => void;
  setLocalReady: (r: boolean) => void;
  setPaused: (p: boolean) => void;
  setPausedBy: (name: string | null) => void;
  setResumeCountdown: (n: number | null) => void;
  setRun: (run: { index: number; total: number } | null) => void;
  setCycle: (n: number) => void;
  addMyUpgrade: (id: UpgradeId) => void;
  addMyCharUpgrade: (id: string) => void;
  clearMyUpgrades: () => void;
  setNextReadyState: (ready: number, total: number) => void;
  setResult: (r: FightResult | null) => void;
  toggleMute: () => void;
  setVolume: (v: number) => void;
  setAutofire: (on: boolean) => void;
  setShowControls: (v: boolean) => void;
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
  peerCount: 0,
  netHint: null,

  monsterId: DEFAULT_MONSTER,
  players: [],
  lobbyPhase: 'lobby',
  gauntlet: false,

  localName: loadName(),
  localClass: DEFAULT_CLASS,
  localReady: false,

  paused: false,
  pausedBy: null,
  resumeCountdown: null,
  run: null,
  cycle: 0,
  myUpgrades: [],
  myCharUpgrades: [],
  nextReadyReady: 0,
  nextReadyTotal: 0,

  result: null,
  muted: false,
  volume: loadVolume(),
  autofire: loadAutofire(),
  showControls: false,

  // Navigating always dismisses the transient Controls modal so it can't get
  // stranded on top of the next screen (e.g. a fight ending while it's open).
  setPhase: (phase) => set({ phase, showControls: false }),
  setError: (error) => set({ error }),
  setHostLeft: (hostLeft) => set({ hostLeft }),
  setRoom: (roomCode, isHost) => set({ roomCode, isHost }),
  setSession: (session) => set({ session }),
  setPeerCount: (peerCount) => set({ peerCount }),
  setNetHint: (netHint) => set({ netHint }),
  setMonster: (monsterId) => set({ monsterId }),
  setGauntlet: (gauntlet) => set({ gauntlet }),
  setLobby: (players, monsterId, lobbyPhase, gauntlet) =>
    set({ players, monsterId, lobbyPhase, gauntlet }),
  setLocalName: (localName) => {
    persistName(localName);
    set({ localName });
  },
  setLocalClass: (localClass) => set({ localClass }),
  setLocalReady: (localReady) => set({ localReady }),
  setPaused: (paused) => set({ paused }),
  setPausedBy: (pausedBy) => set({ pausedBy }),
  setResumeCountdown: (resumeCountdown) => set({ resumeCountdown }),
  setRun: (run) => set({ run }),
  setCycle: (cycle) => set({ cycle }),
  addMyUpgrade: (id) => set({ myUpgrades: [...get().myUpgrades, id] }),
  addMyCharUpgrade: (id) => set({ myCharUpgrades: [...get().myCharUpgrades, id] }),
  clearMyUpgrades: () => set({ myUpgrades: [], myCharUpgrades: [] }),
  setNextReadyState: (ready, total) => set({ nextReadyReady: ready, nextReadyTotal: total }),
  setResult: (result) => set({ result }),
  toggleMute: () => set({ muted: !get().muted }),
  setVolume: (volume) => {
    const v = Math.max(0, Math.min(1, volume));
    persistVolume(v);
    // Nudging the slider off zero also lifts an explicit mute (intuitive UX).
    set({ volume: v, muted: v <= 0 ? get().muted : false });
  },
  setAutofire: (autofire) => {
    persistAutofire(autofire);
    set({ autofire });
  },
  setShowControls: (showControls) => set({ showControls }),

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
      peerCount: 0,
      netHint: null,
      players: [],
      lobbyPhase: 'lobby',
      localReady: false,
      paused: false,
      pausedBy: null,
      resumeCountdown: null,
      run: null,
      cycle: 0,
      myUpgrades: [],
      myCharUpgrades: [],
      nextReadyReady: 0,
      nextReadyTotal: 0,
      result: null,
      showControls: false,
    });
  },
}));
