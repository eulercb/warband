/**
 * Warband — the Client session.
 *
 * A client sends its input to the host, buffers incoming snapshots, and renders
 * the world interpolated ~INTERP_DELAY_MS behind real time. To keep the local
 * player feeling responsive, its own movement is predicted forward each frame
 * and gently reconciled toward the authoritative position from snapshots.
 */
import { openRoom, selfId, getTrackerSockets } from '../transport/room';
import type { NetMode } from '../transport/room';
import { netLog, netLogOnce, startNetDiagnostics } from '../log';
import { ACTIONS, APP_ID } from '../protocol';
import type {
  LobbyMsg,
  StartMsg,
  HelloMsg,
  SelectMsg,
  ReadyMsg,
  ResultMsg,
  PauseMsg,
  PauseReqMsg,
  UpgradeMsg,
  SpecialMsg,
  NextReadyMsg,
  NextReadyStateMsg,
  ByeMsg,
  NetSession,
} from '../protocol';
import type { UpgradeId } from '../../engine/content/upgrades';
import type { EphemeralId } from '../../engine/content/ephemeral';
import { CLASSES } from '../../engine/content/classes';
import { SnapshotInterpolator } from '../../render/pipeline/interpolate';
import { ARENA_W, ARENA_H, INPUT_SEND_RATE } from '../../engine/core/constants';
import { clamp, lerp } from '../../engine/core/math';
import { nearestCopy, wrapPos } from '../../engine/core/torus';
import type {
  ClassId,
  InputCommand,
  Snapshot,
  RenderState,
  FightResult,
  Vec2,
} from '../../engine/core/types';

/** See host.ts — a typed structural view of a Trystero message action. */
interface NetAction<T> {
  send(data: T, opts?: { target?: string | string[] }): void;
  onMessage: ((data: T, ctx: { peerId: string; metadata?: unknown }) => void) | null;
}

export interface ClientOpts {
  code: string;
  name: string;
  /** Transport: peer-to-peer WebRTC (default) or the global-server relay. */
  net?: NetMode;
  onLobby: (msg: LobbyMsg) => void;
  /** Transition the UI into the game view. */
  onStart: (msg: StartMsg) => void;
  onResult: (result: FightResult) => void;
  onReturnLobby: () => void;
  /** Host paused / resumed the shared sim (with who paused + resume countdown). */
  onPause?: (paused: boolean, info: { byName?: string; countdown: number | null }) => void;
  /** How many players have readied up for the next boss (upgrade screen). */
  onNextReady?: (info: { ready: number; total: number }) => void;
  onHostLeft: () => void;
  /**
   * Host reachability, as a 0/1 count: 1 once we've actually received a message
   * from the host, 0 before that (and again if the host link drops). NOT a raw
   * peer count — Trystero forms a full mesh, so a plain peer tally would also
   * count other clients, which is not what "connected to the host" means.
   */
  onPeers?: (count: number) => void;
  onError?: (err: string) => void;
  /**
   * Transport-level join faults from Trystero (see `openRoom`). The important one
   * for a joiner is the post-SDP connection failure ("could not connect … after
   * exchanging SDP; check … TURN"): the host's signaling was reached but no direct
   * WebRTC path formed — i.e. a NAT/firewall that needs a TURN relay. Surfaced
   * separately from `onError` so the UI can show an actionable connectivity hint
   * rather than a fatal error (the attempt may still recover).
   */
  onJoinError?: (msg: string) => void;
}

export class Client implements NetSession {
  readonly isHost = false;
  readonly selfId = selfId;
  localPlayerId: number | null = null;

  private readonly opts: ClientOpts;
  private readonly room: ReturnType<typeof openRoom>;

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
  private readonly nextReadyAction: NetAction<NextReadyMsg>;
  private readonly nextReadyStateAction: NetAction<NextReadyStateMsg>;
  private readonly byeAction: NetAction<ByeMsg>;

  private readonly interpolator = new SnapshotInterpolator();

  // Local identity / selection (echoed to the host).
  private readonly ownName: string;
  private ownClass: ClassId = 'knight';
  /** Authoritative base move speed of our hero (class + upgrades), from snapshots. */
  private ownMoveSpeed = CLASSES.knight.moveSpeed;
  private ownReady = false;

  // Input send throttle.
  private latestInput: InputCommand | null = null;
  private lastInputSendMs = 0;

  // Client-side prediction of the local player's position.
  private predicted: Vec2 | null = null;
  private lastPredictMs = 0;

  /**
   * The host's transport peer id, learned from the first host-originated message
   * (only the host sends the lobby/start/snapshot/etc. channels). Used to report
   * host reachability distinctly from the full WebRTC mesh, and to detect the
   * host specifically dropping out.
   */
  private hostPeerId: string | null = null;

  // Debug: keys already logged once (first snapshot received, …).
  private readonly loggedOnce = new Set<string>();
  private stopDiag: () => void = () => {};

  constructor(opts: ClientOpts) {
    this.opts = opts;
    this.ownName = opts.name;

    this.room = openRoom(opts.code, opts.onJoinError, opts.net ?? 'p2p');
    netLog('client', `joining room "${opts.code}" as ${selfId.slice(0, 6)}`, { name: opts.name });
    // Watch tracker sockets + peer connections so a stalled handshake is visible:
    // this is exactly the "stuck on Connecting to the host…" case to debug.
    this.stopDiag = startNetDiagnostics({
      scope: 'client',
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
    this.nextReadyAction = this.action(ACTIONS.nextReady);
    this.nextReadyStateAction = this.action(ACTIONS.nextReadyState);
    this.byeAction = this.action(ACTIONS.bye);

    // --- Host -> client messages ---
    // Every one of these channels is host-originated, so receiving any of them
    // proves the host link is live — that (not the raw mesh peer count) is our
    // "connected to the host" signal.
    this.lobbyAction.onMessage = (msg, ctx) => {
      this.markHostReached(ctx.peerId);
      netLog('client', `recv lobby`, { players: msg.players.length, phase: msg.phase });
      this.opts.onLobby(msg);
    };
    this.startAction.onMessage = (msg, ctx) => {
      this.markHostReached(ctx.peerId);
      netLog('client', 'recv START', { players: msg.playerCount, monster: msg.monsterId });
      this.interpolator.reset();
      this.resetPrediction();
      this.opts.onStart(msg);
    };
    this.snapshotAction.onMessage = (snap, ctx) => {
      this.markHostReached(ctx.peerId);
      netLogOnce(this.loggedOnce, 'snapshot', 'client', 'receiving snapshots');
      this.onSnapshot(snap);
    };
    this.resultAction.onMessage = (msg, ctx) => {
      this.markHostReached(ctx.peerId);
      netLog('client', `recv result → ${msg.result.outcome}`);
      this.opts.onResult(msg.result);
    };
    this.returnLobbyAction.onMessage = (_data, ctx) => {
      this.markHostReached(ctx.peerId);
      netLog('client', 'recv return-to-lobby');
      this.interpolator.reset();
      this.resetPrediction();
      this.opts.onReturnLobby();
    };
    this.pauseAction.onMessage = (msg, ctx) => {
      this.markHostReached(ctx.peerId);
      netLog('client', `recv pause → ${msg.paused}`, { countdown: msg.countdown ?? null });
      this.opts.onPause?.(msg.paused, {
        byName: msg.byName,
        countdown: msg.countdown ?? null,
      });
    };
    this.nextReadyStateAction.onMessage = (msg, ctx) => {
      this.markHostReached(ctx.peerId);
      this.opts.onNextReady?.({ ready: msg.ready, total: msg.total });
    };
    this.byeAction.onMessage = (msg) => {
      // NB: a leaving *client* also sends bye, so this channel is not a
      // host-reachability signal — only act on the host's own departure.
      if (msg.reason === 'hostLeft') {
        netLog('client', 'host sent bye → host left');
        this.opts.onHostLeft();
      }
    };

    // Announce ourselves. The host may connect slightly later, so re-announce
    // our identity + current selection/ready whenever a new peer appears.
    this.sendHello();
    this.room.onPeerJoin = (peerId: string) => {
      // A peer connected — but in a full mesh that may be the host OR another
      // client, so we don't treat this as "host reached". Re-announce ourselves
      // so the host (whenever it is the one that just connected) learns our
      // identity + current selection.
      netLog('client', `peer appeared ${peerId.slice(0, 6)} — re-announcing hello/selection`);
      this.sendHello();
      this.selectAction.send({ classId: this.ownClass });
      this.readyAction.send({ ready: this.ownReady });
    };
    this.room.onPeerLeave = (peerId: string) => {
      // Only the host leaving affects our reachability signal.
      if (peerId === this.hostPeerId) {
        netLog('client', `host peer ${peerId.slice(0, 6)} left — reachability lost`);
        this.hostPeerId = null;
        this.opts.onPeers?.(0);
      } else {
        netLog('client', `peer ${peerId.slice(0, 6)} left (not the host)`);
      }
    };
  }

  /** Record first contact with the host and report reachability (idempotent). */
  private markHostReached(peerId: string): void {
    if (this.hostPeerId === peerId) return;
    netLog('client', `HOST REACHED via ${peerId.slice(0, 6)} — first host message received`);
    this.hostPeerId = peerId;
    this.opts.onPeers?.(1);
  }

  private action<T>(id: string): NetAction<T> {
    return this.room.makeAction(id) as unknown as NetAction<T>;
  }

  private sendHello(): void {
    this.helloAction.send({ name: this.ownName });
  }

  private resetPrediction(): void {
    this.predicted = null;
    this.lastPredictMs = 0;
    this.latestInput = null;
    this.localPlayerId = null;
  }

  private onSnapshot(snap: Snapshot): void {
    this.interpolator.push(snap);

    // Locate our own authoritative view to learn our entity id + class and to
    // reconcile the predicted position toward the server truth.
    const own = snap.players.find((p) => p.peerId === selfId);
    if (!own) return;

    this.localPlayerId = own.id;
    this.ownClass = own.classId;
    this.ownMoveSpeed = own.moveSpeed; // includes persistent upgrades (e.g. swift)

    const authPos: Vec2 = { x: own.pos.x, y: own.pos.y };
    if (this.predicted == null) {
      this.predicted = authPos;
    } else {
      // Reconcile toward the server truth the short way across the torus seam.
      const near = nearestCopy(authPos, this.predicted);
      this.predicted = wrapPos({
        x: lerp(this.predicted.x, near.x, 0.2),
        y: lerp(this.predicted.y, near.y, 0.2),
      });
    }
  }

  // -------------------------------------------------------------------------
  // NetSession + lobby control
  // -------------------------------------------------------------------------

  setSelection(classId: ClassId): void {
    this.ownClass = classId;
    this.selectAction.send({ classId });
  }

  setReady(ready: boolean): void {
    this.ownReady = ready;
    this.readyAction.send({ ready });
  }

  setLocalInput(cmd: InputCommand): void {
    this.latestInput = cmd;
    const now = performance.now();
    const minInterval = 1000 / INPUT_SEND_RATE;
    if (now - this.lastInputSendMs >= minInterval) {
      this.lastInputSendMs = now;
      this.inputAction.send(cmd);
    }
  }

  /** NetSession: ask the host to pause/resume the shared sim (host is authoritative). */
  requestPause(paused: boolean): void {
    this.pauseReqAction.send({ paused });
  }

  /** NetSession: relay this player's between-boss generic upgrade pick to the host. */
  chooseUpgrade(upgradeId: UpgradeId): void {
    this.upgradeAction.send({ generic: upgradeId });
  }

  /** NetSession: relay this player's between-boss character upgrade pick. */
  chooseCharUpgrade(upgradeId: string): void {
    this.upgradeAction.send({ char: upgradeId });
  }

  /** NetSession: relay this player's run-clear subclass-skill pick (item 13). */
  chooseSubSkill(subclassId: string, skillId: string): void {
    this.specialAction.send({ subclassId, subSkillId: skillId });
  }

  /** NetSession: relay this player's run-clear extra-class pick (item 14). */
  chooseExtraClass(classId: ClassId): void {
    this.specialAction.send({ extraClass: classId });
  }

  /** NetSession: relay this player's ephemeral-shop purchase (item 21). */
  buyEphemeral(id: EphemeralId): void {
    this.specialAction.send({ buyEphemeral: id });
  }

  /** NetSession: relay this player's "ready for the next boss" flag. */
  setNextReady(ready: boolean): void {
    this.nextReadyAction.send({ ready });
  }

  getRenderState(nowMs: number): RenderState | null {
    // Advance the predicted local position by the held input this frame.
    const dt = clamp((nowMs - this.lastPredictMs) / 1000, 0, 0.05);
    this.lastPredictMs = nowMs;
    if (this.predicted && this.latestInput && this.localPlayerId != null) {
      // Predict with the AUTHORITATIVE speed (class + upgrades like swift), not
      // the base class speed, so an upgraded hero doesn't trail its own snapshots.
      const speed = this.ownMoveSpeed;
      // Torus: wrap the predicted position instead of clamping to walls.
      this.predicted = wrapPos({
        x: this.predicted.x + this.latestInput.move.x * speed * dt,
        y: this.predicted.y + this.latestInput.move.y * speed * dt,
      });
    }

    return this.interpolator.sample(nowMs, {
      localPlayerId: this.localPlayerId,
      arena: { w: ARENA_W, h: ARENA_H },
      predictedLocalPos: this.predicted,
    });
  }

  leave(): void {
    netLog('client', 'leaving room (client)');
    this.byeAction.send({ reason: 'left' });
    this.stopDiag();
    // Fire-and-forget: room teardown races the tab closing; we don't await it.
    void this.room.leave();
  }
}
