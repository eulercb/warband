/**
 * Warband — Zustand app/UI store. Holds app phase, room + lobby state, local
 * selections and result. The networking layer writes lobby/result data here;
 * React reads it. The hot game loop uses hudStore.ts instead (keep it off React).
 */
import { create } from 'zustand';
import type { ClassId, MonsterId, FightResult } from '../../engine/core/types';
import type { UpgradeId } from '../../engine/content/upgrades';
import { getEphemeral } from '../../engine/content/ephemeral';
import type { EphemeralId, EphemeralStock } from '../../engine/content/ephemeral';
import type { LobbyPlayer, NetSession } from '../../net/protocol';
import type { NetMode } from '../../net/transport/room';
import { DEFAULT_CLASS } from '../../engine/content/classes';
import { DEFAULT_MONSTER } from '../../engine/content/monsters';
import { setProceduralSeed } from '../../engine/content/procgen';
import { setForgeSeed } from '../../engine/content/forge';
import { setShakeEnabled } from '../../render/pipeline/camera';

/**
 * The host-chosen test loadout for a SINGLE fight (item: lobby loadout). Held in the
 * store so the lobby can freely re-pick it between attempts, the Host reads it live at
 * startFight, and the pause menu (which reads my*) reflects it. Stackable ids repeat in
 * the arrays (`['mighty','mighty']` = Mighty ×2), exactly as the sim replays them.
 */
export interface SfLoadout {
  upgrades: UpgradeId[];
  charUpgrades: string[];
  subSkills: string[];
  extraClasses: ClassId[];
}

/** An empty test loadout (nothing granted). */
export const EMPTY_SF_LOADOUT: SfLoadout = {
  upgrades: [],
  charUpgrades: [],
  subSkills: [],
  extraClasses: [],
};

// --- Persisted local preferences (survive reloads / future runs) -----------
const NAME_KEY = 'warband.heroName.v1';
const VOLUME_KEY = 'warband.volume.v1';
const AUTOFIRE_KEY = 'warband.autofire.v1';
const SHAKE_KEY = 'warband.screenShake.v1';

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

/** Load the persisted screen-shake preference (default ON). */
function loadScreenShake(): boolean {
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(SHAKE_KEY) !== '0';
  } catch {
    /* privacy mode / unavailable storage — default on */
  }
  return true;
}

function persistScreenShake(on: boolean): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(SHAKE_KEY, on ? '1' : '0');
  } catch {
    /* ignore quota / privacy-mode failures */
  }
}

export type Phase = 'menu' | 'hostSetup' | 'join' | 'lobby' | 'game' | 'result' | 'waiting'; // late-join holding state: "fight in progress"

export interface AppState {
  phase: Phase;
  error: string | null;
  hostLeft: boolean;

  // room / session
  roomCode: string | null;
  isHost: boolean;
  session: NetSession | null;
  /** Transport for the next session: P2P WebRTC or the global-server relay. */
  netMode: NetMode;
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
  /**
   * Host seed mode for a gauntlet: a fresh random seed each run, the shared
   * run-of-the-day (UTC date), or a custom seed the player types in to replay an
   * exact boss set + reward sequence. Only meaningful when `gauntlet` is on.
   */
  seedMode: 'random' | 'daily' | 'custom';
  /** Custom seed text (any string; hashed to a number). Used when seedMode==='custom'. */
  seedInput: string;
  /** The master seed of the run currently in progress (from the host), for display/sharing. */
  activeRunSeed: number | null;
  /** Host setting: hardcore run (deadlier corruption, limited revives, no free retry). */
  hardcore: boolean;
  /** Whether the run currently in progress is hardcore (from the host). */
  activeHardcore: boolean;
  /** Host setting: Chaos Draft (item 10) — every hero/bot/boss drafts a random kit. */
  randomKits: boolean;
  /** Whether the run currently in progress is a Chaos Draft (from the host). */
  activeRandomKits: boolean;
  /**
   * Host setting: Chaos Forge (docs/CHAOS_FORGE.md) — synthesize brand-new kits,
   * upgrades, bosses & shop items by recombining components. Independent of Chaos
   * Draft (they can both be on). */
  chaosForge: boolean;
  /** Whether the run currently in progress is a Chaos Forge (from the host). */
  activeChaosForge: boolean;
  /**
   * In a Chaos Draft run, the class THIS hero was drafted into (item 10) — the
   * effective class for the kit + all upgrade offers, distinct from the picked
   * `localClass` (kept intact for the lobby). Null outside a Chaos Draft run.
   */
  activeDraftedClass: ClassId | null;

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
  /** The subclass this hero committed to (item 13), or null. */
  mySubclassId: string | null;
  /** Subclass skill ids bound to sub1/sub2 (up to two, same subclass). */
  mySubSkills: string[];
  /** Extra classes unlocked for multiclass swapping (item 14). */
  myExtraClasses: ClassId[];
  /** Host's test loadout for a single fight — freely re-picked in the lobby (item: lobby loadout). */
  sfLoadout: SfLoadout;
  /** Whether the lobby's test-loadout editor is expanded (UI only). */
  sfLoadoutOpen: boolean;
  /** Ephemeral-shop coin balance for this local hero (item 21; carries the run). */
  myCoins: number;
  /** Ephemeral perks this hero has bought for the next fight (item 21). */
  myEphemeral: EphemeralStock;
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
  /** Accessibility: allow the camera to shake on heavy hits/casts (persisted). */
  screenShake: boolean;
  /** Whether the Controls (rebinding) overlay is open. */
  showControls: boolean;

  // --- actions ---
  setPhase: (p: Phase) => void;
  setError: (e: string | null) => void;
  setHostLeft: (v: boolean) => void;
  setRoom: (code: string | null, isHost: boolean) => void;
  setSession: (s: NetSession | null) => void;
  setNetMode: (m: NetMode) => void;
  setPeerCount: (n: number) => void;
  setNetHint: (h: string | null) => void;
  setMonster: (id: MonsterId) => void;
  setGauntlet: (on: boolean) => void;
  setSeedMode: (m: 'random' | 'daily' | 'custom') => void;
  setSeedInput: (s: string) => void;
  setActiveRunSeed: (n: number | null) => void;
  setHardcore: (on: boolean) => void;
  setActiveHardcore: (on: boolean) => void;
  setRandomKits: (on: boolean) => void;
  setActiveRandomKits: (on: boolean) => void;
  setChaosForge: (on: boolean) => void;
  setActiveChaosForge: (on: boolean) => void;
  setActiveDraftedClass: (c: ClassId | null) => void;
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
  addMySubSkill: (subclassId: string, skillId: string) => void;
  addMyExtraClass: (classId: ClassId) => void;
  /** Replace the single-fight test loadout (lobby editor). */
  setSfLoadout: (loadout: SfLoadout) => void;
  /** Expand / collapse the lobby's test-loadout editor. */
  setSfLoadoutOpen: (open: boolean) => void;
  /** Mirror a loadout into the my* display fields so the pause menu reflects it. */
  setMyLoadout: (loadout: SfLoadout) => void;
  /** Bank this fight's ephemeral coins from a landed result (item 21). */
  awardCoinsFromResult: (result: FightResult) => void;
  /** Reset the coin balance + carried stock at a gauntlet boundary (item 23), keeping
   *  the hero's persistent build. Coins accumulate WITHIN a 5-boss run, then reset. */
  resetCoins: () => void;
  /** Buy an ephemeral perk if affordable; returns true on success (item 21). */
  buyEphemeral: (id: EphemeralId) => boolean;
  /** Clear the pending ephemeral stock once a fight consumes it (item 21). */
  resetEphemeralStock: () => void;
  setNextReadyState: (ready: number, total: number) => void;
  setResult: (r: FightResult | null) => void;
  toggleMute: () => void;
  setVolume: (v: number) => void;
  setAutofire: (on: boolean) => void;
  setScreenShake: (on: boolean) => void;
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
  netMode: 'p2p',
  peerCount: 0,
  netHint: null,

  monsterId: DEFAULT_MONSTER,
  players: [],
  lobbyPhase: 'lobby',
  gauntlet: false,
  seedMode: 'random',
  seedInput: '',
  activeRunSeed: null,
  hardcore: false,
  activeHardcore: false,
  randomKits: false,
  activeRandomKits: false,
  chaosForge: false,
  activeChaosForge: false,
  activeDraftedClass: null,

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
  mySubclassId: null,
  mySubSkills: [],
  myExtraClasses: [],
  sfLoadout: EMPTY_SF_LOADOUT,
  sfLoadoutOpen: false,
  myCoins: 0,
  myEphemeral: {},
  nextReadyReady: 0,
  nextReadyTotal: 0,

  result: null,
  muted: false,
  volume: loadVolume(),
  autofire: loadAutofire(),
  screenShake: loadScreenShake(),
  showControls: false,

  // Navigating always dismisses the transient Controls modal so it can't get
  // stranded on top of the next screen (e.g. a fight ending while it's open).
  setPhase: (phase) => set({ phase, showControls: false }),
  setError: (error) => set({ error }),
  setHostLeft: (hostLeft) => set({ hostLeft }),
  setRoom: (roomCode, isHost) => set({ roomCode, isHost }),
  setSession: (session) => set({ session }),
  setNetMode: (netMode) => set({ netMode }),
  setPeerCount: (peerCount) => set({ peerCount }),
  setNetHint: (netHint) => set({ netHint }),
  setMonster: (monsterId) => set({ monsterId }),
  setGauntlet: (gauntlet) => set({ gauntlet }),
  setSeedMode: (seedMode) => set({ seedMode }),
  setSeedInput: (seedInput) => set({ seedInput: seedInput.slice(0, 24) }),
  setActiveRunSeed: (activeRunSeed) => {
    // The single choke point that activates/clears the run's PROCEDURAL content
    // (rolled kits, monsters, boons): host and clients both land here with the
    // shared master seed, so every peer derives identical variants. Chaos Forge
    // synthesis rides the same seed, gated by the run's activeChaosForge flag.
    setProceduralSeed(activeRunSeed);
    setForgeSeed(get().activeChaosForge ? activeRunSeed : null);
    set({ activeRunSeed });
  },
  setHardcore: (hardcore) => set({ hardcore }),
  setActiveHardcore: (activeHardcore) => set({ activeHardcore }),
  setRandomKits: (randomKits) => set({ randomKits }),
  setActiveRandomKits: (activeRandomKits) => set({ activeRandomKits }),
  setChaosForge: (chaosForge) => set({ chaosForge }),
  setActiveChaosForge: (activeChaosForge) => {
    // Sync the Forge synthesis registry to the run seed: on iff this run is a
    // Chaos Forge run. Mirrors setActiveRunSeed so activating in either order
    // (lobby preview, fight onStart) lands the same state.
    setForgeSeed(activeChaosForge ? get().activeRunSeed : null);
    set({ activeChaosForge });
  },
  setActiveDraftedClass: (activeDraftedClass) => set({ activeDraftedClass }),
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
  clearMyUpgrades: () =>
    set({
      myUpgrades: [],
      myCharUpgrades: [],
      mySubclassId: null,
      mySubSkills: [],
      myExtraClasses: [],
      myCoins: 0,
      myEphemeral: {},
    }),
  addMySubSkill: (subclassId, skillId) =>
    // No longer capped at 2 (item 15): a multiclass hero accrues a full 2-skill
    // subclass PER owned class, so the flat list can hold more than two — the host
    // binds only the ACTIVE class's two to sub1/sub2. Guard against duplicates.
    set((s) => ({
      mySubclassId: subclassId,
      mySubSkills: s.mySubSkills.includes(skillId) ? s.mySubSkills : [...s.mySubSkills, skillId],
    })),
  addMyExtraClass: (classId) =>
    set({
      myExtraClasses: get().myExtraClasses.includes(classId)
        ? get().myExtraClasses
        : [...get().myExtraClasses, classId],
    }),
  setSfLoadout: (loadout) => set({ sfLoadout: loadout }),
  setSfLoadoutOpen: (open) => set({ sfLoadoutOpen: open }),
  setMyLoadout: (loadout) =>
    set({
      myUpgrades: [...loadout.upgrades],
      myCharUpgrades: [...loadout.charUpgrades],
      mySubSkills: [...loadout.subSkills],
      myExtraClasses: [...loadout.extraClasses],
    }),
  awardCoinsFromResult: (result) => {
    const sess = get().session;
    if (!sess) return;
    const mine = result.stats?.find((st) => st.peerId === sess.selfId);
    if (mine?.coins) set({ myCoins: get().myCoins + mine.coins });
  },
  resetCoins: () => set({ myCoins: 0, myEphemeral: {} }),
  buyEphemeral: (id) => {
    const def = getEphemeral(id);
    if (!def) return false;
    const { myCoins, myEphemeral, session } = get();
    if (myCoins < def.cost) return false;
    // Optimistically mirror the host's stock so the shop reflects the buy at once;
    // the host validates independently against its own coin ledger.
    const stock: EphemeralStock = { ...myEphemeral };
    if (id === 'speed') stock.speed = true;
    else if (id === 'damage') stock.damage = true;
    else if (id === 'defense') stock.defense = true;
    else if (id === 'potion') stock.potions = (stock.potions ?? 0) + 1;
    else if (id === 'revive') stock.revives = (stock.revives ?? 0) + 1;
    // 'retry' banks host-side only (no per-fight stock field); nothing to mirror.
    set({ myCoins: myCoins - def.cost, myEphemeral: stock });
    session?.buyEphemeral(id);
    return true;
  },
  resetEphemeralStock: () => set({ myEphemeral: {} }),
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
  setScreenShake: (screenShake) => {
    persistScreenShake(screenShake);
    setShakeEnabled(screenShake);
    set({ screenShake });
  },
  setShowControls: (showControls) => set({ showControls }),

  reset: () => {
    const s = get();
    try {
      s.session?.leave();
    } catch {
      /* ignore */
    }
    // Leaving the session ends the procedural run — the menu playground and the
    // next lobby serve canonical content until a new run seed arrives.
    setProceduralSeed(null);
    setForgeSeed(null); // …and ends any Chaos Forge synthesis
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
      activeRunSeed: null,
      activeChaosForge: false,
      paused: false,
      pausedBy: null,
      resumeCountdown: null,
      run: null,
      cycle: 0,
      myUpgrades: [],
      myCharUpgrades: [],
      mySubclassId: null,
      mySubSkills: [],
      myExtraClasses: [],
      sfLoadout: EMPTY_SF_LOADOUT,
      myCoins: 0,
      myEphemeral: {},
      nextReadyReady: 0,
      nextReadyTotal: 0,
      result: null,
      showControls: false,
    });
  },
}));

// Sync the render-layer shake flag with the persisted preference at startup so a
// player who turned screen shake off stays shake-free before touching any toggle.
setShakeEnabled(useStore.getState().screenShake);
