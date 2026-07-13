/**
 * Warband — the Host session.
 *
 * The host owns the single authoritative `World`, is itself a player, and acts
 * as the star-topology hub: it collects inputs from every client, steps the sim
 * at a fixed timestep, and broadcasts snapshots. It also owns lobby state.
 */
import { openRoom, selfId, getTrackerSockets } from '../transport/room';
import type { NetMode } from '../transport/room';
import { netLog, netLogOnce, startNetDiagnostics } from '../log';
import { ACTIONS, APP_ID } from '../protocol';
import type {
  LobbyMsg,
  LobbyPlayer,
  StartMsg,
  HelloMsg,
  SelectMsg,
  ReadyMsg,
  ResultMsg,
  PauseMsg,
  PauseReqMsg,
  UpgradeMsg,
  SpecialMsg,
  SwapMsg,
  NextReadyMsg,
  NextReadyStateMsg,
  ByeMsg,
  NetSession,
} from '../protocol';
import { World } from '../../engine/world/world';
import type { WorldPlayerInit } from '../../engine/world/world';
import { draftedClassFor, draftedMonsterFor } from '../../engine/content/kitshuffle';
import {
  SIM_DT,
  MAX_PLAYERS,
  RESUME_COUNTDOWN_S,
  SCORE_BOSS_CLEAR,
} from '../../engine/core/constants';
import {
  computeBotInput,
  rollPersonality,
  pickBotUpgrades,
  BOT_PEER_PREFIX,
} from '../../engine/ai/bot';
import type { BotPersonality } from '../../engine/ai/bot';
import { CLASSES } from '../../engine/content/classes';
import {
  buildRunSlots,
  modifierForCycle,
  getMonster,
  randomOpener,
} from '../../engine/content/monsters';
import type { RunSlot } from '../../engine/content/monsters';
import { rollAffixes } from '../../engine/content/affixes';
import { recordEncounter } from '../../engine/content/balance';
import { Rng, mixSeed } from '../../engine/core/math';
import { isUpgradeId, upgradeMaxStacks } from '../../engine/content/upgrades';
import type { UpgradeId } from '../../engine/content/upgrades';
import { isCharUpgradeId, charUpgradeMaxStacks } from '../../engine/content/charUpgrades';
import { getSubSkill, subclassOfSkill } from '../../engine/content/subclasses';
import { CLASS_IDS } from '../../engine/content/classes';
import { EPHEMERAL, isEphemeralId } from '../../engine/content/ephemeral';
import type { EphemeralId, EphemeralStock } from '../../engine/content/ephemeral';
import type {
  MonsterId,
  ClassId,
  AffixId,
  Outcome,
  InputCommand,
  Snapshot,
  RenderState,
  FightResult,
  GameEvent,
} from '../../engine/core/types';

/**
 * Minimal structural view of a Trystero message action for the payloads we use.
 * Trystero's `makeAction` returns an object with `.send` and a settable
 * `.onMessage`; we wrap it in a typed shape so each channel carries its own
 * message type without repeated casting at the call sites.
 */
interface NetAction<T> {
  send(data: T, opts?: { target?: string | string[] }): void;
  onMessage: ((data: T, ctx: { peerId: string; metadata?: unknown }) => void) | null;
}

/** How long (ms) the post-win victory dance plays before the result screen. */
const VICTORY_LAP_MS = 2600;

/** One connected (non-host) player's lobby entry. */
interface PeerEntry {
  name: string;
  classId: ClassId;
  ready: boolean;
}

/** A host-simulated AI band member. */
interface BotEntry {
  peerId: string; // synthetic, prefixed `bot:` — never a real Trystero id
  name: string;
  classId: ClassId;
  /** Rolled temperament — multiple bots on one team behave differently. */
  personality: BotPersonality;
}

export interface HostOpts {
  code: string;
  monsterId: MonsterId;
  name: string;
  classId: ClassId;
  /** Start a sequence run (gauntlet) rather than a single boss. */
  gauntlet?: boolean;
  /**
   * Master seed governing EVERY random choice this session — the gauntlet's boss
   * set, each boss's affixes, terrain, and the between-boss reward offers — so a
   * seed can be shared to replay the exact same run (seed mode / run-of-the-day).
   * Omitted = a fresh random seed is minted.
   */
  seed?: number;
  /** Hardcore run (item 11): deadlier corruption cadence, limited revives, no free retry. */
  hardcore?: boolean;
  /** Chaos Draft (item 10): every hero/bot/boss drafts a random kit. Independent of
   *  the gauntlet gate — it composes freely with Hardcore or a single fight. */
  randomKits?: boolean;
  /**
   * item 8 — an up-front loadout for the HOST hero, applied at the FIRST fight so
   * Single-fight mode can test specific builds (granted subclass skills, an extra
   * class, character/generic upgrades) without grinding a full run. Seeded into the
   * host's per-peer maps in `startFight` AFTER the run-reset clears, so it survives
   * the reset yet never leaks into a gauntlet (where upgrades accrue between bosses).
   * Absent / empty for an ordinary run.
   */
  loadout?: {
    upgrades?: UpgradeId[];
    charUpgrades?: string[];
    subSkills?: string[];
    extraClasses?: ClassId[];
  };
  /** Transport: peer-to-peer WebRTC (default) or the global-server relay. */
  net?: NetMode;
  /** Called whenever lobby state changes (including immediately in the ctor). */
  onLobby: (msg: LobbyMsg) => void;
  /** Called whenever a fight begins (manual start, retry or gauntlet advance). */
  onStart?: (info: {
    runIndex: number;
    runTotal: number;
    cycle: number;
    modName?: string;
    runSeed: number;
    hardcore: boolean;
    /** Chaos Draft (item 10): whether this run drafts random kits… */
    randomKits: boolean;
    /** …and, if so, the class THIS host hero was drafted into (its effective kit). */
    draftedClass: ClassId;
  }) => void;
  /** Called when between-boss readiness changes (host UI shows "X/Y ready"). */
  onNextReady?: (info: { ready: number; total: number }) => void;
  /** Called once when the fight ends. */
  onResult: (result: FightResult) => void;
  /** Mirror shared pause state into the host UI (paused, who paused, countdown). */
  onPause?: (paused: boolean, info: { byName?: string; countdown: number | null }) => void;
  /** Called with the current count of connected peers whenever it changes. */
  onPeers?: (count: number) => void;
  onError?: (err: string) => void;
  /**
   * Transport-level join faults from Trystero (see `openRoom`). The important one
   * is the post-SDP connection failure ("could not connect … after exchanging
   * SDP; check … TURN") — a peer was reached and signaling exchanged, but no
   * WebRTC path formed. Surfaced separately from `onError` because it is a
   * connectivity *hint*, not necessarily a fatal error (another peer may be fine).
   */
  onJoinError?: (msg: string) => void;
}

export class Host implements NetSession {
  readonly isHost = true;
  readonly selfId = selfId;
  localPlayerId: number | null = null;

  /** The session's master seed (drives the run's procedural content + RNG streams). */
  get runSeed(): number {
    return this.masterSeed;
  }

  private readonly opts: HostOpts;
  private readonly room: ReturnType<typeof openRoom>;

  // Message channels (all created up-front so ids match across peers).
  private readonly helloAction: NetAction<HelloMsg>;
  private readonly selectAction: NetAction<SelectMsg>;
  private readonly readyAction: NetAction<ReadyMsg>;
  private readonly lobbyAction: NetAction<LobbyMsg>;
  private readonly startAction: NetAction<StartMsg>;
  private readonly inputAction: NetAction<InputCommand>;
  private readonly snapshotAction: NetAction<Snapshot>;
  private readonly resultAction: NetAction<ResultMsg>;
  private readonly returnLobbyAction: NetAction<number>;
  private readonly pauseAction: NetAction<PauseMsg>;
  private readonly pauseReqAction: NetAction<PauseReqMsg>;
  private readonly upgradeAction: NetAction<UpgradeMsg>;
  private readonly specialAction: NetAction<SpecialMsg>;
  private readonly swapAction: NetAction<SwapMsg>;
  private readonly nextReadyAction: NetAction<NextReadyMsg>;
  private readonly nextReadyStateAction: NetAction<NextReadyStateMsg>;
  private readonly byeAction: NetAction<ByeMsg>;

  // Lobby / host-own state.
  private monsterId: MonsterId;
  private hostName: string;
  private hostClass: ClassId;
  private hostReady = false;
  private gauntlet: boolean;
  private readonly hardcore: boolean;
  private readonly randomKits: boolean;
  private phase: 'lobby' | 'inFight' = 'lobby';
  private readonly lobby = new Map<string, PeerEntry>();
  /** Host-added AI band members (in roster order after real peers). */
  private readonly bots: BotEntry[] = [];
  private nextBotNum = 1;
  /** Peers with a live WebRTC connection (may exceed the lobby during handshakes). */
  private readonly connectedPeers = new Set<string>();

  // Fight state.
  private readonly latestInput = new Map<string, InputCommand>();
  private readonly lastSeq = new Map<string, number>();
  private world: World | null = null;
  private pendingEvents: GameEvent[] = [];
  private resultSent = false;
  private paused = false;
  private pausedByName: string | undefined;
  /** Resume countdown (seconds left) while un-pausing, else null. */
  private resumeCountdown: number | null = null;
  private resumeTimer: ReturnType<typeof setInterval> | null = null;

  /** Accumulated between-boss generic upgrade picks per peerId (host + clients). */
  private readonly upgrades = new Map<string, UpgradeId[]>();
  /** Accumulated between-boss character (class) upgrade picks per peerId. */
  private readonly charUpgrades = new Map<string, string[]>();
  /** Chosen subclass id per peer (item 13). */
  private readonly subclassByPeer = new Map<string, string>();
  /** Chosen subclass-skill ids per peer (up to 2, same subclass; bound to sub1/sub2). */
  private readonly subSkillsByPeer = new Map<string, string[]>();
  /** Extra (multiclass) class ids per peer (item 14). */
  private readonly extraClassesByPeer = new Map<string, ClassId[]>();
  /** Peers who already took a generic / character pick this interstitial. */
  private readonly roundPickedGeneric = new Set<string>();
  private readonly roundPickedChar = new Set<string>();
  /** Cumulative banked score per peer (prior bosses this run; endless keeps it). */
  private readonly scoreByPeer = new Map<string, number>();
  /** Ephemeral-shop coin balance per peer (item 21; carries across the run). */
  private readonly coinsByPeer = new Map<string, number>();
  /** Ephemeral perks bought for the NEXT fight per peer (consumed at spawn). */
  private readonly ephemeralByPeer = new Map<string, EphemeralStock>();
  /** Banked hardcore retries (shared): a wipe can spend one to restart the boss. */
  private hardcoreRetryBank = 0;
  /** Peers (including the host, keyed by selfId) marked ready for the next boss. */
  private readonly nextReadyPeers = new Set<string>();
  /**
   * Who is in the between-boss ready flow: the host + the human peers who were
   * connected when the fight ended (they receive the result screen). Snapshotting
   * this — rather than counting the live lobby — means a latecomer who connects
   * during the interstitial can't inflate the tally and soft-lock the advance.
   */
  private roundParticipants = new Set<string>();

  // Run / endless state. Each slot is one encounter: [boss] or [boss, ...co-bosses].
  private runOrder: RunSlot[] = [];
  private runIndex = 0;
  private cycle = 0;
  /**
   * Master seed for this session (see HostOpts.seed). Every RNG stream — run
   * assembly, per-fight world seed, affixes, reward offers — derives from it, so
   * the whole run is reproducible from this one number.
   */
  private readonly masterSeed: number;
  /** Bosses fielded in the current run, so the next Endless run opens on a fresh set. */
  private lastRunBosses = new Set<MonsterId>();
  /**
   * MATCH BALANCE: the smoothed kill-pace signal across this session's fights
   * (content/balance.ts; 1 = on target, >1 = the band kills fast). Updated from
   * each encounter's time-to-kill (a wipe records a "struggling" sample) and fed
   * into every World so boss HP/damage track how the band is actually doing.
   * Persists across retries and endless cycles; reset with the run itself.
   */
  private balancePace = 1;

  // Sim-loop bookkeeping.
  private running = false;
  private raf = 0;
  private lastTime = 0;
  private acc = 0;
  /** Wall-clock deadline of the post-win victory lap (0 = no lap pending). */
  private victoryLapUntil = 0;
  /** Backstop for the lap: rAF stalls in hidden tabs, a timer does not. */
  private victoryLapTimer: ReturnType<typeof setTimeout> | null = null;

  // Debug: keys already logged once (first-input-per-peer, first snapshot, …).
  private readonly loggedOnce = new Set<string>();
  private stopDiag: () => void = () => {};

  constructor(opts: HostOpts) {
    this.opts = opts;
    this.monsterId = opts.monsterId;
    this.hostName = opts.name;
    this.hostClass = opts.classId;
    this.gauntlet = opts.gauntlet ?? false;
    this.hardcore = (opts.hardcore ?? false) && this.gauntlet;
    // Chaos Draft is independent of the gauntlet gate (item 10) — it works for a
    // single fight or a full run, alone or alongside Hardcore.
    this.randomKits = opts.randomKits ?? false;
    this.masterSeed = (opts.seed ?? (Math.random() * 2 ** 31) | 0) >>> 0 || 1;

    this.room = openRoom(opts.code, opts.onJoinError, opts.net ?? 'p2p');
    netLog('host', `hosting room "${opts.code}" as ${selfId.slice(0, 6)}`, {
      monster: opts.monsterId,
      name: opts.name,
      classId: opts.classId,
    });
    // Watch tracker sockets + peer connections so a stalled handshake is visible.
    this.stopDiag = startNetDiagnostics({
      scope: 'host',
      roomLabel: `${APP_ID} / ${opts.code}`,
      getSockets: getTrackerSockets,
      getPeers: () => this.room.getPeers(),
    });

    this.helloAction = this.action(ACTIONS.hello);
    this.selectAction = this.action(ACTIONS.select);
    this.readyAction = this.action(ACTIONS.ready);
    this.lobbyAction = this.action(ACTIONS.lobby);
    this.startAction = this.action(ACTIONS.start);
    this.inputAction = this.action(ACTIONS.input);
    this.snapshotAction = this.action(ACTIONS.snapshot);
    this.resultAction = this.action(ACTIONS.result);
    this.returnLobbyAction = this.action(ACTIONS.returnLobby);
    this.pauseAction = this.action(ACTIONS.pause);
    this.pauseReqAction = this.action(ACTIONS.pauseReq);
    this.upgradeAction = this.action(ACTIONS.upgrade);
    this.specialAction = this.action(ACTIONS.special);
    this.swapAction = this.action(ACTIONS.swap);
    this.nextReadyAction = this.action(ACTIONS.nextReady);
    this.nextReadyStateAction = this.action(ACTIONS.nextReadyState);
    this.byeAction = this.action(ACTIONS.bye);

    // --- Client -> host lobby messages ---
    this.helloAction.onMessage = (data, ctx) => {
      netLog('host', `recv hello from ${ctx.peerId.slice(0, 6)}`, { name: data.name });
      this.ensurePeer(ctx.peerId).name = data.name;
      this.broadcastLobby();
    };
    this.selectAction.onMessage = (data, ctx) => {
      netLog('host', `recv select from ${ctx.peerId.slice(0, 6)}`, { classId: data.classId });
      this.ensurePeer(ctx.peerId).classId = data.classId;
      this.broadcastLobby();
    };
    this.readyAction.onMessage = (data, ctx) => {
      netLog('host', `recv ready from ${ctx.peerId.slice(0, 6)}`, { ready: data.ready });
      this.ensurePeer(ctx.peerId).ready = data.ready;
      this.broadcastLobby();
    };

    // --- Client -> host inputs (drop out-of-order commands) ---
    this.inputAction.onMessage = (data, ctx) => {
      netLogOnce(
        this.loggedOnce,
        'input:' + ctx.peerId,
        'host',
        `first input from ${ctx.peerId.slice(0, 6)}`,
      );
      const last = this.lastSeq.get(ctx.peerId) ?? -1;
      if (data.seq >= last) {
        this.latestInput.set(ctx.peerId, data);
        this.lastSeq.set(ctx.peerId, data.seq);
      }
    };

    // --- Client -> host pause requests (any player may pause/resume) ---
    this.pauseReqAction.onMessage = (data, ctx) => {
      netLog('host', `recv pause request → ${data.paused} from ${ctx.peerId.slice(0, 6)}`);
      if (data.paused) this.pause(this.lobby.get(ctx.peerId)?.name ?? 'A player');
      else this.resume();
    };

    // --- Client -> host between-boss upgrade picks (generic and/or character) ---
    this.upgradeAction.onMessage = (data, ctx) => {
      this.recordUpgrade(ctx.peerId, data);
    };

    // --- Client -> host run-clear special picks (subclass skill / extra class) ---
    this.specialAction.onMessage = (data, ctx) => {
      this.recordSpecial(ctx.peerId, data);
    };

    // --- Client -> host multiclass swap (tap-cycle or a radial's targeted class) ---
    // Applied straight to the live world (host-authoritative + validated there);
    // JS is single-threaded so this never interleaves with a sim step.
    this.swapAction.onMessage = (data, ctx) => {
      this.world?.requestClassSwap(ctx.peerId, data.target);
    };

    // --- Client -> host "ready for next boss" during the interstitial ---
    this.nextReadyAction.onMessage = (data, ctx) => {
      this.recordNextReady(ctx.peerId, data.ready);
    };

    // --- Peer presence ---
    this.room.onPeerJoin = (peerId: string) => {
      this.connectedPeers.add(peerId);
      netLog('host', `peer JOINED ${peerId.slice(0, 6)}`, { connected: this.connectedPeers.size });
      this.opts.onPeers?.(this.connectedPeers.size);
      this.ensurePeer(peerId);
      // Newcomers simply receive the current lobby; if a fight is in progress
      // the phase is 'inFight' and they wait for the next lobby.
      this.broadcastLobby();
    };
    this.room.onPeerLeave = (peerId: string) => {
      this.connectedPeers.delete(peerId);
      netLog('host', `peer LEFT ${peerId.slice(0, 6)}`, { connected: this.connectedPeers.size });
      this.opts.onPeers?.(this.connectedPeers.size);
      this.lobby.delete(peerId);
      this.latestInput.delete(peerId);
      this.lastSeq.delete(peerId);
      this.nextReadyPeers.delete(peerId);
      if (this.world) this.world.removePlayerByPeer(peerId);
      this.broadcastLobby();
      // A departure can complete the "everyone ready" condition for the next boss.
      this.maybeAdvanceNext();
    };

    // Emit the initial lobby so the host UI renders immediately.
    this.broadcastLobby();
  }

  // -------------------------------------------------------------------------
  // Lobby
  // -------------------------------------------------------------------------

  private action<T>(id: string): NetAction<T> {
    return this.room.makeAction(id) as unknown as NetAction<T>;
  }

  /** Get-or-create a peer's lobby entry with sensible defaults. */
  private ensurePeer(peerId: string): PeerEntry {
    let entry = this.lobby.get(peerId);
    if (!entry) {
      entry = { name: 'Warrior-' + peerId.slice(0, 4), classId: 'knight', ready: false };
      this.lobby.set(peerId, entry);
    }
    return entry;
  }

  private buildLobbyMsg(): LobbyMsg {
    const host: LobbyPlayer = {
      peerId: selfId,
      name: this.hostName,
      classId: this.hostClass,
      ready: this.hostReady,
      isHost: true,
      isBot: false,
    };
    const peers: LobbyPlayer[] = [];
    for (const [peerId, e] of this.lobby) {
      peers.push({
        peerId,
        name: e.name,
        classId: e.classId,
        ready: e.ready,
        isHost: false,
        isBot: false,
      });
    }
    const bots: LobbyPlayer[] = this.bots.map((b) => ({
      peerId: b.peerId,
      name: b.name,
      classId: b.classId,
      ready: true, // bots are always ready
      isHost: false,
      isBot: true,
    }));
    return {
      monsterId: this.monsterId,
      players: [host, ...peers, ...bots],
      phase: this.phase,
      gauntlet: this.gauntlet,
      // Share the master seed from the lobby on, so every peer's procedural
      // content (rolled kits / monsters / boons) resolves before the first fight.
      runSeed: this.masterSeed,
    };
  }

  /** Total party size if the fight started now (host + peers + bots). */
  private partySize(): number {
    return 1 + this.lobby.size + this.bots.length;
  }

  /** Send the lobby to all clients AND update the host UI. */
  private broadcastLobby(): void {
    const msg = this.buildLobbyMsg();
    this.lobbyAction.send(msg);
    this.opts.onLobby(msg);
  }

  // -------------------------------------------------------------------------
  // Host controls (NetSession + lobby/fight control surface)
  // -------------------------------------------------------------------------

  setSelection(classId: ClassId): void {
    this.hostClass = classId;
    this.broadcastLobby();
  }

  setReady(ready: boolean): void {
    this.hostReady = ready;
    this.broadcastLobby();
  }

  setMonster(monsterId: MonsterId): void {
    this.monsterId = monsterId;
    this.broadcastLobby();
  }

  setGauntlet(on: boolean): void {
    this.gauntlet = on;
    this.broadcastLobby();
  }

  /** Add an AI band member of the given class if there's a free party slot. */
  addBot(classId: ClassId): void {
    if (this.partySize() >= MAX_PLAYERS) return;
    const n = this.nextBotNum++;
    const personality = rollPersonality(((Date.now() & 0xfffff) ^ (n * 0x9e3779b9)) >>> 0 || n);
    this.bots.push({
      peerId: `${BOT_PEER_PREFIX}${n}`,
      name: `${personality.label} Bot ${classLabel(classId)}`,
      classId,
      personality,
    });
    this.broadcastLobby();
  }

  removeBot(peerId: string): void {
    const i = this.bots.findIndex((b) => b.peerId === peerId);
    if (i >= 0) {
      this.bots.splice(i, 1);
      this.broadcastLobby();
    }
  }

  setBotClass(peerId: string, classId: ClassId): void {
    const bot = this.bots.find((b) => b.peerId === peerId);
    if (bot) {
      bot.classId = classId;
      bot.name = `${bot.personality.label} Bot ${classLabel(classId)}`;
      this.broadcastLobby();
    }
  }

  /**
   * Whether the host may start a fight. A solo host (no other *human* players)
   * may start any time; otherwise every connected human must be ready. Bots are
   * always ready and never block the start.
   */
  canStart(): boolean {
    if (this.lobby.size === 0) return true; // solo (host alone or host + bots)
    for (const e of this.lobby.values()) if (!e.ready) return false;
    return true;
  }

  /** Host's own input, keyed by its own id (consumed by the sim like any peer). */
  setLocalInput(cmd: InputCommand): void {
    this.latestInput.set(selfId, cmd);
  }

  /** Begin a run from the lobby (single boss, or a full multi-boss run). */
  startFight(): void {
    if (this.phase === 'inFight') return;
    if (!this.canStart()) {
      netLog('host', 'startFight blocked — not all players are ready');
      return;
    }
    this.cycle = 0;
    this.lastRunBosses.clear(); // a fresh run isn't constrained by a prior one
    this.balancePace = 1; // fresh run — the pace signal starts on target
    this.runOrder = this.buildRunOrder();
    this.runIndex = 0;
    this.upgrades.clear(); // fresh run — nobody carries upgrades into boss 1
    this.charUpgrades.clear();
    this.subclassByPeer.clear();
    this.subSkillsByPeer.clear();
    this.extraClassesByPeer.clear();
    this.scoreByPeer.clear();
    this.coinsByPeer.clear();
    this.ephemeralByPeer.clear();
    this.hardcoreRetryBank = 0;
    this.roundPickedGeneric.clear();
    this.roundPickedChar.clear();
    this.nextReadyPeers.clear();
    // item 8: seed the host's up-front Single-fight loadout AFTER the run-reset clears,
    // so a chosen build is live from the first (and only) fight.
    const lo = this.opts.loadout;
    if (lo) {
      if (lo.upgrades?.length) this.upgrades.set(selfId, [...lo.upgrades]);
      if (lo.charUpgrades?.length) this.charUpgrades.set(selfId, [...lo.charUpgrades]);
      if (lo.subSkills?.length) this.subSkillsByPeer.set(selfId, [...lo.subSkills]);
      if (lo.extraClasses?.length) this.extraClassesByPeer.set(selfId, [...lo.extraClasses]);
    }
    this.beginFight();
  }

  /** Restart the current fight (same boss / same run position) after a loss. */
  retryFight(): void {
    if (this.phase === 'inFight') return;
    // Hardcore has no FREE retry (item 11) — but a banked Second Chance from the
    // ephemeral shop (item 21) can be spent to restart the boss.
    if (this.hardcore) {
      if (this.hardcoreRetryBank <= 0) return;
      this.hardcoreRetryBank -= 1;
    }
    if (this.runOrder.length === 0) {
      this.runOrder = this.buildRunOrder();
      this.runIndex = 0;
    }
    this.nextReadyPeers.clear();
    this.beginFight();
  }

  /**
   * Continue into the next endless cycle: carry every upgrade + score, bump the
   * cycle (scaling + elemental modifier), and roll a fresh run. Host-only.
   */
  continueEndless(): void {
    if (this.phase === 'inFight') return;
    // Bots bank a boon for the new cycle just like the humans' endless pick.
    this.awardBotUpgrades();
    this.cycle += 1;
    this.runOrder = this.buildRunOrder();
    this.runIndex = 0;
    this.roundPickedGeneric.clear();
    this.roundPickedChar.clear();
    this.nextReadyPeers.clear();
    this.beginFight();
  }

  /** Encounters this run will fight, in order. Single boss when run mode is off. */
  private buildRunOrder(): RunSlot[] {
    if (!this.gauntlet) return [[this.monsterId]];
    // Fully deterministic from the master seed + cycle: the same seed always
    // yields the same boss set (seed mode / run-of-the-day). A gauntlet never
    // lets you hand-pick the opener — it's a seeded random draw — and each Endless
    // cycle avoids the previous run's bosses so the next lap opens on a fresh set.
    const rng = new Rng(mixSeed(this.masterSeed, this.cycle, 0x51ac));
    const opener = randomOpener(this.cycle, rng, this.lastRunBosses);
    const slots = buildRunSlots(opener, this.cycle, rng, this.partySize(), this.lastRunBosses);
    this.lastRunBosses = new Set<MonsterId>(slots.flat());
    return slots;
  }

  /** Deterministic per-fight world seed (drives terrain, affixes, boss RNG). */
  private fightSeed(): number {
    return mixSeed(this.masterSeed, this.cycle, this.runIndex, 0xf16);
  }

  /** Deterministic per-interstitial reward seed (shipped so offers reproduce). */
  private rewardSeed(): number {
    return mixSeed(this.masterSeed, this.cycle, this.runIndex, 0x2ec0);
  }

  /**
   * Roll boss affixes for an encounter, aligned with `[lead, ...coBosses]`. Seeded
   * from the fight seed so it is reproducible, and scaled by the run position +
   * endless cycle (rollAffixes returns none for a fresh party's opener).
   */
  private rollBossAffixes(ids: MonsterId[], seed: number): AffixId[][] {
    const rng = new Rng((seed ^ 0x5eeda11c) >>> 0 || 1);
    return ids.map((id) => rollAffixes(getMonster(id).tier, this.cycle, this.runIndex, rng));
  }

  /** Spin up a fresh World for `runOrder[runIndex]` and start the sim loop. */
  private beginFight(): void {
    this.clearResumeCountdown();
    this.clearVictoryLap();
    const slot = this.runOrder[this.runIndex] ?? [this.monsterId];
    const seed = this.fightSeed();
    // Chaos Draft (item 10): each boss slot drafts a random monster off the fight
    // seed, so every boss of a run is its own surprise. Affixes below then roll for
    // the DRAFTED monster. A normal run leaves the slot untouched.
    const draft = (m: MonsterId): MonsterId => (this.randomKits ? draftedMonsterFor(seed, m) : m);
    const monsterId = draft(slot[0] ?? this.monsterId);
    const coBosses = slot.slice(1).map(draft);
    const modifier = modifierForCycle(this.cycle);
    // Boss affixes + mid-fight corruption are now STANDARD for every fight
    // (single, opener and beyond). They still RAMP — affixBudget gives the opener
    // a single light affix and the corruption grace delay holds the first beat —
    // so a fresh boss is a small twist, not a wall, while later slots and Endless
    // cycles pile it on.
    const corruption = true;

    // World roster carries each hero's accumulated upgrades + carried score
    // (host-authoritative). Bots now progress too — their auto-awarded upgrades
    // (see awardBotUpgrades) ride in through rosterEntry exactly like a human's.
    // Chaos Draft (item 10): each hero/bot plays a class drafted off the MASTER seed
    // (stable across the whole run, so their accumulated upgrades keep matching the
    // drafted class). A normal run keeps the picked class. Bots are drafted too.
    const draftClass = (peerId: string, picked: ClassId): ClassId =>
      this.randomKits ? draftedClassFor(this.masterSeed, peerId) : picked;
    const roster: WorldPlayerInit[] = [
      this.rosterEntry(selfId, this.hostName, draftClass(selfId, this.hostClass)),
    ];
    for (const [peerId, e] of this.lobby) {
      roster.push(this.rosterEntry(peerId, e.name, draftClass(peerId, e.classId)));
    }
    for (const b of this.bots) {
      roster.push(this.rosterEntry(b.peerId, b.name, draftClass(b.peerId, b.classId)));
    }
    // Clients only render snapshots, so the wire roster omits the upgrade lists.
    const wireRoster = roster.map(({ peerId, name, classId }) => ({ peerId, name, classId }));
    // Ephemeral perks (item 21) are single-fight: now that they've ridden into the
    // roster, clear the shop stock so they don't linger into the fight after this.
    this.ephemeralByPeer.clear();

    const playerCount = roster.length;
    // Roll each boss's affixes deterministically from the fight seed (computed above
    // so the Chaos-Draft monster is chosen first). Standard for every fight now
    // (item 4); affixBudget keeps the opener to a single affix.
    const bossAffixes = this.rollBossAffixes([monsterId, ...coBosses], seed);

    // Fresh fight state.
    this.latestInput.clear();
    this.lastSeq.clear();
    this.pendingEvents = [];
    this.resultSent = false;
    this.paused = false;
    this.pausedByName = undefined;

    this.world = new World({
      monsterId,
      seed,
      players: roster,
      cycle: this.cycle,
      runIndex: this.runIndex,
      runTotal: this.runOrder.length,
      modifier,
      coBosses,
      bossAffixes,
      corruption,
      hardcore: this.hardcore,
      // MATCH BALANCE: the smoothed kill-pace signal from the fights so far. The
      // World blends it with the band's measured power (rewards fully applied)
      // into this fight's bounded boss HP/damage adjustment (content/balance.ts).
      pace: this.balancePace,
    });
    this.localPlayerId = this.world.playerIdByPeer(selfId);

    const startMsg: StartMsg = {
      seed,
      playerCount,
      monsterId,
      monsterIds: [monsterId, ...coBosses], // the DRAFTED slot (== the picked slot in a normal run)
      roster: wireRoster,
      gauntlet: this.gauntlet,
      runIndex: this.runIndex,
      runTotal: this.runOrder.length,
      cycle: this.cycle,
      modName: modifier?.prefix,
      runSeed: this.masterSeed,
      hardcore: this.hardcore,
      randomKits: this.randomKits,
    };
    netLog('host', `starting fight → ${playerCount} player(s)`, {
      seed,
      monster: [monsterId, ...coBosses].join('+'),
      run: `${this.runIndex + 1}/${this.runOrder.length}`,
      cycle: this.cycle,
    });
    this.startAction.send(startMsg);

    this.phase = 'inFight';
    this.broadcastLobby();
    this.opts.onStart?.({
      runIndex: this.runIndex,
      runTotal: this.runOrder.length,
      cycle: this.cycle,
      modName: modifier?.prefix,
      runSeed: this.masterSeed,
      hardcore: this.hardcore,
      randomKits: this.randomKits,
      draftedClass: draftClass(selfId, this.hostClass),
    });
    this.startLoop();
  }

  /** Build a world roster entry carrying this peer's upgrades + banked score. */
  private rosterEntry(peerId: string, name: string, classId: ClassId): WorldPlayerInit {
    return {
      peerId,
      name,
      classId,
      upgrades: this.upgrades.get(peerId),
      charUpgrades: this.charUpgrades.get(peerId),
      subSkills: this.subSkillsByPeer.get(peerId),
      extraClasses: this.extraClassesByPeer.get(peerId),
      ephemeral: this.ephemeralByPeer.get(peerId),
      baseScore: this.scoreByPeer.get(peerId) ?? 0,
    };
  }

  // -------------------------------------------------------------------------
  // Pause / concede (pause menu)
  // -------------------------------------------------------------------------

  /**
   * Freeze the shared sim and tell everyone. Any player can trigger this (the
   * host acts directly; clients relay via `pauseReq`). `byName` names whoever
   * paused, for the overlay. Cancels any in-flight resume countdown.
   */
  pause(byName?: string): void {
    if (this.phase !== 'inFight') return;
    // Cancelling an in-flight resume countdown is itself a state change that must
    // reach clients (otherwise they'd stay stuck on the last countdown number),
    // so re-broadcast even when we were already "paused" mid-countdown.
    const wasCountingDown = this.resumeTimer !== null;
    this.clearResumeCountdown();
    if (this.paused && !wasCountingDown) return;
    this.paused = true;
    this.pausedByName = byName ?? this.pausedByName;
    this.broadcastPause();
  }

  /**
   * Begin resuming: keep the sim frozen but run a shared N-second countdown so
   * every player gets a heads-up before control returns. The final tick actually
   * un-freezes the sim.
   */
  resume(): void {
    if (!this.paused || this.phase !== 'inFight') return;
    if (this.resumeTimer !== null) return; // already counting down
    this.resumeCountdown = RESUME_COUNTDOWN_S;
    this.broadcastPause();
    this.resumeTimer = setInterval(() => {
      const next = (this.resumeCountdown ?? 0) - 1;
      if (next > 0) {
        this.resumeCountdown = next;
        this.broadcastPause();
      } else {
        this.clearResumeCountdown();
        this.paused = false;
        this.pausedByName = undefined;
        // Reset the clock so the accumulator doesn't fast-forward the paused span.
        this.lastTime = performance.now();
        this.acc = 0;
        this.broadcastPause();
      }
    }, 1000);
  }

  /** Send the current pause state to clients AND mirror it into the host UI. */
  private broadcastPause(): void {
    const msg: PauseMsg = {
      paused: this.paused,
      byName: this.pausedByName,
      countdown: this.resumeCountdown,
    };
    this.pauseAction.send(msg);
    this.opts.onPause?.(this.paused, {
      byName: this.pausedByName,
      countdown: this.resumeCountdown,
    });
  }

  private clearResumeCountdown(): void {
    if (this.resumeTimer !== null) {
      clearInterval(this.resumeTimer);
      this.resumeTimer = null;
    }
    this.resumeCountdown = null;
  }

  /** End the current fight immediately with `outcome` (pause-menu "End Run"). */
  endRun(outcome: Outcome): void {
    const world = this.world;
    if (!world || this.phase !== 'inFight') return;
    this.clearResumeCountdown();
    this.paused = false;
    this.pausedByName = undefined;
    this.broadcastPause();
    world.forceFinish(outcome);
    this.finishFight();
  }

  // --- NetSession pause + upgrade surface ----------------------------------

  /** NetSession: host acts on its own pause/resume request directly. */
  requestPause(paused: boolean): void {
    if (paused) this.pause(this.hostName);
    else this.resume();
  }

  /** NetSession: record the host's own between-boss generic upgrade pick. */
  chooseUpgrade(upgradeId: UpgradeId): void {
    this.recordUpgrade(selfId, { generic: upgradeId });
  }

  /** NetSession: record the host's own between-boss character upgrade pick. */
  chooseCharUpgrade(upgradeId: string): void {
    this.recordUpgrade(selfId, { char: upgradeId });
  }

  /** NetSession: record the host's own run-clear subclass-skill pick (item 13). */
  chooseSubSkill(subclassId: string, skillId: string): void {
    this.recordSpecial(selfId, { subclassId, subSkillId: skillId });
  }

  /** NetSession: record the host's own run-clear extra-class pick (item 14). */
  chooseExtraClass(classId: ClassId): void {
    this.recordSpecial(selfId, { extraClass: classId });
  }

  /** NetSession: apply the host's own multiclass swap directly to the world (item 14). */
  swapClass(target?: ClassId): void {
    this.world?.requestClassSwap(selfId, target);
  }

  /** NetSession: buy the host's own ephemeral-shop perk for the next fight (item 21). */
  buyEphemeral(id: EphemeralId): void {
    this.recordEphemeral(selfId, id);
  }

  /** NetSession: host marks itself ready (or not) to advance to the next boss. */
  setNextReady(ready: boolean): void {
    this.recordNextReady(selfId, ready);
  }

  /**
   * Accumulate validated upgrade picks for a peer. Host-authoritative: ignores
   * junk ids AND caps each peer to ONE generic + ONE character pick per
   * interstitial, so a misbehaving or looping client can't stack picks.
   */
  private recordUpgrade(peerId: string, msg: UpgradeMsg): void {
    if (isUpgradeId(msg.generic) && !this.roundPickedGeneric.has(peerId)) {
      const arr = this.upgrades.get(peerId) ?? [];
      // Reject a pick already at its stacking cap (defence-in-depth: the client
      // filters maxed boons out of the offer, so a valid client never sends one).
      const have = arr.reduce((n, id) => (id === msg.generic ? n + 1 : n), 0);
      if (have < upgradeMaxStacks(msg.generic)) {
        this.roundPickedGeneric.add(peerId);
        arr.push(msg.generic);
        this.upgrades.set(peerId, arr);
        netLog('host', `upgrade "${msg.generic}" for ${peerId.slice(0, 6)}`, { total: arr.length });
      }
    }
    if (isCharUpgradeId(msg.char) && !this.roundPickedChar.has(peerId)) {
      const arr = this.charUpgrades.get(peerId) ?? [];
      const have = arr.reduce((n, id) => (id === msg.char ? n + 1 : n), 0);
      if (have < charUpgradeMaxStacks(msg.char)) {
        this.roundPickedChar.add(peerId);
        arr.push(msg.char);
        this.charUpgrades.set(peerId, arr);
        netLog('host', `char upgrade "${msg.char}" for ${peerId.slice(0, 6)}`, {
          total: arr.length,
        });
      }
    }
  }

  /**
   * Auto-award each bot a generic + character upgrade for the coming boss, so an
   * AI band member's power PROGRESSES between fights exactly like a human's — no
   * diegetic walk into the reward room, just the same stat growth. The generic
   * pick is biased by the bot's temperament (a Reckless bot hoards damage, a Timid
   * one stacks health/mitigation); the class pick advances its kit. Deterministic
   * from the master seed (independent of the movement RNG), and cap-respecting.
   */
  private awardBotUpgrades(): void {
    this.bots.forEach((b, i) => {
      const rng = new Rng(mixSeed(this.masterSeed, this.cycle, this.runIndex, 0xb07 + i));
      const ownedGen = this.upgrades.get(b.peerId) ?? [];
      const ownedChar = this.charUpgrades.get(b.peerId) ?? [];
      const pick = pickBotUpgrades(b.classId, b.personality, ownedGen, ownedChar, rng);
      if (pick.generic) {
        ownedGen.push(pick.generic);
        this.upgrades.set(b.peerId, ownedGen);
      }
      if (pick.char) {
        ownedChar.push(pick.char);
        this.charUpgrades.set(b.peerId, ownedChar);
      }
    });
  }

  /**
   * Record a run-clear SPECIAL pick (item 13/14/15), host-authoritative and
   * validated: a subclass skill (up to two PER owned class, one subclass per class)
   * or an additional multiclass class (a real class the hero doesn't already field).
   */
  private recordSpecial(peerId: string, msg: SpecialMsg): void {
    if (msg.subSkillId && msg.subclassId) {
      const skill = getSubSkill(msg.subSkillId);
      const sub = subclassOfSkill(msg.subSkillId);
      const owner = sub?.classId; // the class this subclass belongs to
      const owned = this.subSkillsByPeer.get(peerId) ?? [];
      // The subclass must belong to a class the hero actually fields (item 19).
      const heroClasses = [
        this.classForPeer(peerId),
        ...(this.extraClassesByPeer.get(peerId) ?? []),
      ];
      const classOwned = owner != null && heroClasses.includes(owner);
      // One subclass per class: skills already held for the SAME class must share it,
      // and each subclass caps at two skills.
      const sameClass = owned.filter((id) => subclassOfSkill(id)?.classId === owner);
      const committedSub = sameClass.length > 0 ? subclassOfSkill(sameClass[0])?.id : null;
      const okSubclass =
        sub?.id === msg.subclassId && (!committedSub || committedSub === msg.subclassId);
      if (
        skill &&
        classOwned &&
        okSubclass &&
        sameClass.length < 2 &&
        !owned.includes(msg.subSkillId)
      ) {
        this.subclassByPeer.set(peerId, msg.subclassId);
        owned.push(msg.subSkillId);
        this.subSkillsByPeer.set(peerId, owned);
        netLog('host', `subclass skill "${msg.subSkillId}" for ${peerId.slice(0, 6)}`);
      }
    }
    if (msg.extraClass && (CLASS_IDS as string[]).includes(msg.extraClass)) {
      const primary = this.classForPeer(peerId);
      const owned = this.extraClassesByPeer.get(peerId) ?? [];
      if (msg.extraClass !== primary && !owned.includes(msg.extraClass)) {
        owned.push(msg.extraClass);
        this.extraClassesByPeer.set(peerId, owned);
        netLog('host', `extra class "${msg.extraClass}" for ${peerId.slice(0, 6)}`);
      }
    }
    if (msg.buyEphemeral) this.recordEphemeral(peerId, msg.buyEphemeral);
  }

  /**
   * Buy an ephemeral-shop perk for a peer (item 21), host-authoritative: validates
   * the id, checks the peer can afford it against their banked coins, deducts the
   * cost and stocks the perk for the next fight. Hardcore-only perks are rejected
   * outside a hardcore run. A retry is a shared bank; everything else is per-peer
   * stock injected into the next roster.
   */
  private recordEphemeral(peerId: string, id: EphemeralId): void {
    if (!isEphemeralId(id)) return;
    const def = EPHEMERAL[id];
    if (def.hardcoreOnly && !this.hardcore) return;
    const coins = this.coinsByPeer.get(peerId) ?? 0;
    if (coins < def.cost) return;
    this.coinsByPeer.set(peerId, coins - def.cost);
    if (id === 'retry') {
      this.hardcoreRetryBank += 1;
    } else {
      const stock: EphemeralStock = { ...(this.ephemeralByPeer.get(peerId) ?? {}) };
      if (id === 'speed') stock.speed = true;
      else if (id === 'damage') stock.damage = true;
      else if (id === 'defense') stock.defense = true;
      else if (id === 'potion') stock.potions = (stock.potions ?? 0) + 1;
      else if (id === 'revive') stock.revives = (stock.revives ?? 0) + 1;
      this.ephemeralByPeer.set(peerId, stock);
    }
    netLog('host', `bought "${id}" for ${peerId.slice(0, 6)}`, {
      coinsLeft: this.coinsByPeer.get(peerId),
    });
  }

  /** The primary class of a peer (host, a connected client, or a bot). */
  private classForPeer(peerId: string): ClassId {
    if (peerId === selfId) return this.hostClass;
    return (
      this.lobby.get(peerId)?.classId ??
      this.bots.find((b) => b.peerId === peerId)?.classId ??
      'knight'
    );
  }

  /** Record a player's "ready for next boss" flag, then re-check the advance gate. */
  private recordNextReady(peerId: string, ready: boolean): void {
    if (ready) this.nextReadyPeers.add(peerId);
    else this.nextReadyPeers.delete(peerId);
    this.broadcastNextReady();
    this.maybeAdvanceNext();
  }

  /**
   * How many of the fight's participants must ready up and how many have. Only
   * counts participants still connected (host is always connected; peers must
   * still be in the lobby), so a disconnect completes the gate and a latecomer
   * never blocks it.
   */
  private nextReadyTally(): { ready: number; total: number } {
    let total = 0;
    let ready = 0;
    for (const peerId of this.roundParticipants) {
      const connected = peerId === selfId || this.lobby.has(peerId);
      if (!connected) continue;
      total++;
      if (this.nextReadyPeers.has(peerId)) ready++;
    }
    return { ready, total };
  }

  private broadcastNextReady(): void {
    const tally = this.nextReadyTally();
    this.nextReadyStateAction.send(tally);
    this.opts.onNextReady?.(tally);
  }

  /** If a next boss is queued and everyone has readied up, advance to it. */
  private maybeAdvanceNext(): void {
    if (this.phase === 'inFight') return;
    if (this.runIndex >= this.runOrder.length - 1) return; // no next boss queued
    const { ready, total } = this.nextReadyTally();
    if (ready >= total && total > 0) this.advanceGauntlet();
  }

  getRenderState(_nowMs: number): RenderState | null {
    if (!this.world) return null;
    // Return events accumulated across ALL sim steps since the previous call
    // (render runs faster than the sim), not just the last step's events.
    return { ...this.world.toRenderState(this.localPlayerId), events: this.drainEvents() };
  }

  returnToLobby(): void {
    this.stopLoop();
    this.clearVictoryLap();
    this.clearResumeCountdown();
    this.world = null;
    this.localPlayerId = null;
    this.phase = 'lobby';
    this.hostReady = false;
    this.resultSent = false;
    this.paused = false;
    this.pausedByName = undefined;
    this.runOrder = [];
    this.runIndex = 0;
    this.cycle = 0;
    this.lastRunBosses.clear();
    this.balancePace = 1;
    this.upgrades.clear();
    this.charUpgrades.clear();
    this.subclassByPeer.clear();
    this.subSkillsByPeer.clear();
    this.extraClassesByPeer.clear();
    this.scoreByPeer.clear();
    this.coinsByPeer.clear();
    this.ephemeralByPeer.clear();
    this.hardcoreRetryBank = 0;
    this.roundPickedGeneric.clear();
    this.roundPickedChar.clear();
    this.nextReadyPeers.clear();
    this.roundParticipants.clear();
    this.pendingEvents = [];
    this.latestInput.clear();
    this.lastSeq.clear();
    for (const e of this.lobby.values()) e.ready = false;
    this.returnLobbyAction.send(1);
    this.broadcastLobby();
  }

  leave(): void {
    netLog('host', 'leaving room (host)');
    this.byeAction.send({ reason: 'hostLeft' });
    this.stopLoop();
    this.clearVictoryLap();
    this.clearResumeCountdown();
    this.stopDiag();
    // Fire-and-forget: room teardown races the tab closing; we don't await it.
    void this.room.leave();
  }

  // -------------------------------------------------------------------------
  // Sim loop (fixed-timestep accumulator driven by requestAnimationFrame)
  // -------------------------------------------------------------------------

  private startLoop(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.acc = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  private stopLoop(): void {
    this.running = false;
    if (this.raf !== 0) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    this.tickLoop(now);
    if (this.running) this.raf = requestAnimationFrame(this.frame);
  };

  private tickLoop(now: number): void {
    const world = this.world;
    if (!world || this.phase !== 'inFight') return;

    // While paused, hold the clock so the accumulator doesn't build up a huge
    // catch-up burst on resume, and stop stepping/broadcasting. Clients receive
    // no new snapshots and clamp to their last one, so the fight visibly freezes.
    if (this.paused) {
      this.lastTime = now;
      return;
    }

    this.acc += Math.min((now - this.lastTime) / 1000, 0.25);
    this.lastTime = now;

    while (this.acc >= SIM_DT && !world.finished) {
      this.applyBotInputs(world);
      world.step(SIM_DT, this.latestInput);
      this.pendingEvents.push(...world.events);
      // Snapshots stream at the sim rate — log only that the stream started, so
      // the console shows the host is broadcasting without drowning in per-tick lines.
      netLogOnce(this.loggedOnce, 'snapshot', 'host', 'broadcasting snapshots');
      this.snapshotAction.send(world.serialize());
      this.acc -= SIM_DT;
    }

    if (world.finished) {
      // Victory lap: hold the result screen for a beat so everyone sees the
      // heroes' victory dance + fireworks (the `victory` event already shipped
      // in the final snapshot). Defeats cut straight to the result. A timer
      // backstops the rAF-driven loop so a hidden host tab (rAF suspended)
      // can't stall the result screen for every client.
      if (world.outcome === 'victory') {
        if (this.victoryLapUntil === 0) {
          this.victoryLapUntil = now + VICTORY_LAP_MS;
          this.victoryLapTimer = setTimeout(() => this.finishFight(), VICTORY_LAP_MS + 150);
        }
        if (now < this.victoryLapUntil) return;
      }
      this.finishFight();
    }
  }

  private clearVictoryLap(): void {
    if (this.victoryLapTimer !== null) {
      clearTimeout(this.victoryLapTimer);
      this.victoryLapTimer = null;
    }
    this.victoryLapUntil = 0;
  }

  /** Synthesize AI input for each bot from the current world state (per step). */
  private applyBotInputs(world: World): void {
    if (this.bots.length === 0) return;
    for (const b of this.bots) {
      const p = world.players.find((pl) => pl.peerId === b.peerId);
      if (!p) continue;
      this.latestInput.set(b.peerId, computeBotInput(world, p, world.tick, b.personality));
    }
  }

  private finishFight(): void {
    if (this.resultSent) return;
    const world = this.world;
    if (!world) return;
    this.resultSent = true;
    this.clearVictoryLap();
    this.clearResumeCountdown();
    this.paused = false;
    this.pausedByName = undefined;
    // A fresh between-boss upgrade window opens now — reset picks + readiness and
    // snapshot who's in the ready flow (host + currently-connected human peers,
    // who all receive the result screen below).
    this.roundPickedGeneric.clear();
    this.roundPickedChar.clear();
    this.nextReadyPeers.clear();
    this.roundParticipants = new Set<string>([selfId, ...this.lobby.keys()]);
    // Stop stepping but keep `world` so the host can render the final frame.
    this.stopLoop();

    const result = world.result();
    result.runIndex = this.runIndex;
    result.runTotal = this.runOrder.length;
    result.cycle = this.cycle;

    const victory = result.outcome === 'victory';
    // MATCH BALANCE: fold this encounter's time-to-kill into the smoothed pace
    // signal (a wipe records a fixed "struggling" sample instead), so the NEXT
    // fight's boss scaling tracks how the band is actually doing.
    this.balancePace = recordEncounter(this.balancePace, {
      durationS: world.elapsed,
      bossCount: world.bosses.length,
      victory,
    });
    const hasNext = victory && this.runIndex < this.runOrder.length - 1;
    const nextSlot = hasNext ? this.runOrder[this.runIndex + 1] : null;
    result.nextMonsterId = nextSlot ? (nextSlot[0] ?? null) : null;
    result.nextMonsterIds = nextSlot;
    // Cleared a whole MULTI-boss run → offer Endless on the victory screen. A
    // plain single-boss fight has no run to continue.
    result.endlessAvailable = victory && !hasNext && this.runOrder.length > 1;
    result.modName = modifierForCycle(this.cycle)?.prefix;
    // Ship the deterministic reward seed so every client's between-boss offers
    // reproduce for a shared seed, plus the master seed for display/sharing.
    result.rewardSeed = this.rewardSeed();
    result.runSeed = this.masterSeed;

    // Bank each hero's cumulative score (+ a boss-clear bonus on a win) so the
    // carried score keeps climbing across the run and into endless cycles.
    if (victory) {
      for (const p of world.players) {
        this.scoreByPeer.set(p.peerId, world.playerScore(p) + SCORE_BOSS_CLEAR);
      }
      // Bank ephemeral-shop coins earned this fight (item 21), ranked in result().
      for (const s of result.stats) {
        this.coinsByPeer.set(s.peerId, (this.coinsByPeer.get(s.peerId) ?? 0) + (s.coins ?? 0));
      }
    }
    // A hardcore wipe can still be retried if the band banked a Second Chance
    // (item 21) — surface that so the result screen can offer the Retry button.
    result.hardcoreRetryAvailable = this.hardcore && !victory && this.hardcoreRetryBank > 0;

    this.phase = 'lobby'; // out of the fight until the next begins
    netLog('host', `fight finished → ${result.outcome}`, {
      run: `${this.runIndex + 1}/${this.runOrder.length}`,
      next: result.nextMonsterId ?? 'none',
      cycle: this.cycle,
    });
    this.resultAction.send({ result });
    this.opts.onResult(result);

    // Between bosses: the run only advances once EVERY player readies up (no
    // auto-advance timer). Seed the readiness tally for the upgrade screen.
    if (hasNext) this.broadcastNextReady();
  }

  /** Advance to the next boss in the run (once everyone has readied up). */
  advanceGauntlet(): void {
    if (this.phase === 'inFight') return;
    if (this.runIndex >= this.runOrder.length - 1) return;
    // Bots grow their power alongside the humans who just picked in the reward room.
    this.awardBotUpgrades();
    this.runIndex += 1;
    this.roundPickedGeneric.clear();
    this.roundPickedChar.clear();
    this.nextReadyPeers.clear();
    this.beginFight();
  }

  /** Return and clear the events accumulated since the last render. */
  private drainEvents(): GameEvent[] {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }
}

/** Human-readable class name for bot labels ("Bot Knight", …). */
function classLabel(classId: ClassId): string {
  return CLASSES[classId].name;
}
