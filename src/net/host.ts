/**
 * Warband — the Host session.
 *
 * The host owns the single authoritative `World`, is itself a player, and acts
 * as the star-topology hub: it collects inputs from every client, steps the sim
 * at a fixed timestep, and broadcasts snapshots. It also owns lobby state.
 */
import { openRoom, selfId, getTrackerSockets } from './room';
import { netLog, netLogOnce, startNetDiagnostics } from './log';
import { ACTIONS, APP_ID } from './protocol';
import type {
  LobbyMsg,
  LobbyPlayer,
  StartMsg,
  HelloMsg,
  SelectMsg,
  ReadyMsg,
  ResultMsg,
  ByeMsg,
  NetSession,
} from './protocol';
import { World } from '../engine/world';
import { SIM_DT } from '../engine/constants';
import type {
  MonsterId,
  ClassId,
  InputCommand,
  Snapshot,
  RenderState,
  FightResult,
  GameEvent,
} from '../engine/types';

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

/** One connected (non-host) player's lobby entry. */
interface PeerEntry {
  name: string;
  classId: ClassId;
  ready: boolean;
}

export interface HostOpts {
  code: string;
  monsterId: MonsterId;
  name: string;
  classId: ClassId;
  /** Called whenever lobby state changes (including immediately in the ctor). */
  onLobby: (msg: LobbyMsg) => void;
  /** Called once when the fight ends. */
  onResult: (result: FightResult) => void;
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
  private readonly byeAction: NetAction<ByeMsg>;

  // Lobby / host-own state.
  private monsterId: MonsterId;
  private hostName: string;
  private hostClass: ClassId;
  private hostReady = false;
  private phase: 'lobby' | 'inFight' = 'lobby';
  private readonly lobby = new Map<string, PeerEntry>();
  /** Peers with a live WebRTC connection (may exceed the lobby during handshakes). */
  private readonly connectedPeers = new Set<string>();

  // Fight state.
  private readonly latestInput = new Map<string, InputCommand>();
  private readonly lastSeq = new Map<string, number>();
  private world: World | null = null;
  private pendingEvents: GameEvent[] = [];
  private resultSent = false;

  // Sim-loop bookkeeping.
  private running = false;
  private raf = 0;
  private lastTime = 0;
  private acc = 0;

  // Debug: keys already logged once (first-input-per-peer, first snapshot, …).
  private readonly loggedOnce = new Set<string>();
  private stopDiag: () => void = () => {};

  constructor(opts: HostOpts) {
    this.opts = opts;
    this.monsterId = opts.monsterId;
    this.hostName = opts.name;
    this.hostClass = opts.classId;

    this.room = openRoom(opts.code, opts.onJoinError);
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
      netLogOnce(this.loggedOnce, 'input:' + ctx.peerId, 'host', `first input from ${ctx.peerId.slice(0, 6)}`);
      const last = this.lastSeq.get(ctx.peerId) ?? -1;
      if (data.seq >= last) {
        this.latestInput.set(ctx.peerId, data);
        this.lastSeq.set(ctx.peerId, data.seq);
      }
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
      if (this.world) this.world.removePlayerByPeer(peerId);
      this.broadcastLobby();
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
    };
    const peers: LobbyPlayer[] = [];
    for (const [peerId, e] of this.lobby) {
      peers.push({
        peerId,
        name: e.name,
        classId: e.classId,
        ready: e.ready,
        isHost: false,
      });
    }
    return { monsterId: this.monsterId, players: [host, ...peers], phase: this.phase };
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

  /** Host's own input, keyed by its own id (consumed by the sim like any peer). */
  setLocalInput(cmd: InputCommand): void {
    this.latestInput.set(selfId, cmd);
  }

  startFight(): void {
    if (this.phase === 'inFight') return;

    const roster: Array<{ peerId: string; name: string; classId: ClassId }> = [
      { peerId: selfId, name: this.hostName, classId: this.hostClass },
    ];
    for (const [peerId, e] of this.lobby) {
      roster.push({ peerId, name: e.name, classId: e.classId });
    }

    const playerCount = roster.length;
    const seed = (Math.random() * 2 ** 31) | 0;

    // Fresh fight state.
    this.latestInput.clear();
    this.lastSeq.clear();
    this.pendingEvents = [];
    this.resultSent = false;

    this.world = new World({ monsterId: this.monsterId, seed, players: roster });
    this.localPlayerId = this.world.playerIdByPeer(selfId);

    const startMsg: StartMsg = { seed, playerCount, monsterId: this.monsterId, roster };
    netLog('host', `starting fight → ${playerCount} player(s)`, { seed, monster: this.monsterId });
    this.startAction.send(startMsg);

    this.phase = 'inFight';
    this.broadcastLobby();
    this.startLoop();
  }

  getRenderState(_nowMs: number): RenderState | null {
    if (!this.world) return null;
    // Return events accumulated across ALL sim steps since the previous call
    // (render runs faster than the sim), not just the last step's events.
    return { ...this.world.toRenderState(this.localPlayerId), events: this.drainEvents() };
  }

  returnToLobby(): void {
    this.stopLoop();
    this.world = null;
    this.localPlayerId = null;
    this.phase = 'lobby';
    this.hostReady = false;
    this.resultSent = false;
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
    this.stopDiag();
    this.room.leave();
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

    this.acc += Math.min((now - this.lastTime) / 1000, 0.25);
    this.lastTime = now;

    while (this.acc >= SIM_DT && !world.finished) {
      world.step(SIM_DT, this.latestInput);
      this.pendingEvents.push(...world.events);
      // Snapshots stream at the sim rate — log only that the stream started, so
      // the console shows the host is broadcasting without drowning in per-tick lines.
      netLogOnce(this.loggedOnce, 'snapshot', 'host', 'broadcasting snapshots');
      this.snapshotAction.send(world.serialize());
      this.acc -= SIM_DT;
    }

    if (world.finished) this.finishFight();
  }

  private finishFight(): void {
    if (this.resultSent) return;
    const world = this.world;
    if (!world) return;
    this.resultSent = true;
    // Stop stepping but keep `world` so the host can render the final frame.
    this.stopLoop();
    const result = world.result();
    netLog('host', `fight finished → ${result.outcome}`);
    this.resultAction.send({ result });
    this.opts.onResult(result);
  }

  /** Return and clear the events accumulated since the last render. */
  private drainEvents(): GameEvent[] {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }
}
