/**
 * Warband — the Client session.
 *
 * A client sends its input to the host, buffers incoming snapshots, and renders
 * the world interpolated ~INTERP_DELAY_MS behind real time. To keep the local
 * player feeling responsive, its own movement is predicted forward each frame
 * and gently reconciled toward the authoritative position from snapshots.
 */
import { openRoom, selfId } from './room';
import { ACTIONS } from './protocol';
import type {
  LobbyMsg,
  StartMsg,
  HelloMsg,
  SelectMsg,
  ReadyMsg,
  ResultMsg,
  ByeMsg,
  NetSession,
} from './protocol';
import { CLASSES } from '../engine/classes';
import { SnapshotInterpolator } from '../render/interpolate';
import { ARENA_W, ARENA_H, PLAYER_RADIUS, INPUT_SEND_RATE } from '../engine/constants';
import { clamp, lerp } from '../engine/math';
import type {
  ClassId,
  InputCommand,
  Snapshot,
  RenderState,
  FightResult,
  Vec2,
} from '../engine/types';

/** See host.ts — a typed structural view of a Trystero message action. */
interface NetAction<T> {
  send(data: T, opts?: { target?: string | string[] }): void;
  onMessage: ((data: T, ctx: { peerId: string; metadata?: unknown }) => void) | null;
}

export interface ClientOpts {
  code: string;
  name: string;
  onLobby: (msg: LobbyMsg) => void;
  /** Transition the UI into the game view. */
  onStart: (msg: StartMsg) => void;
  onResult: (result: FightResult) => void;
  onReturnLobby: () => void;
  onHostLeft: () => void;
  onError?: (err: string) => void;
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
  private readonly byeAction: NetAction<ByeMsg>;

  private readonly interpolator = new SnapshotInterpolator();

  // Local identity / selection (echoed to the host).
  private readonly ownName: string;
  private ownClass: ClassId = 'knight';
  private ownReady = false;

  // Input send throttle.
  private latestInput: InputCommand | null = null;
  private lastInputSendMs = 0;

  // Client-side prediction of the local player's position.
  private predicted: Vec2 | null = null;
  private lastPredictMs = 0;

  constructor(opts: ClientOpts) {
    this.opts = opts;
    this.ownName = opts.name;

    this.room = openRoom(opts.code);

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

    // --- Host -> client messages ---
    this.lobbyAction.onMessage = (msg) => {
      this.opts.onLobby(msg);
    };
    this.startAction.onMessage = (msg) => {
      this.interpolator.reset();
      this.resetPrediction();
      this.opts.onStart(msg);
    };
    this.snapshotAction.onMessage = (snap) => {
      this.onSnapshot(snap);
    };
    this.resultAction.onMessage = (msg) => {
      this.opts.onResult(msg.result);
    };
    this.returnLobbyAction.onMessage = () => {
      this.interpolator.reset();
      this.resetPrediction();
      this.opts.onReturnLobby();
    };
    this.byeAction.onMessage = (msg) => {
      if (msg.reason === 'hostLeft') this.opts.onHostLeft();
    };

    // Announce ourselves. The host may connect slightly later, so re-announce
    // our identity + current selection/ready whenever a new peer appears.
    this.sendHello();
    this.room.onPeerJoin = () => {
      this.sendHello();
      this.selectAction.send({ classId: this.ownClass });
      this.readyAction.send({ ready: this.ownReady });
    };
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

    const authPos: Vec2 = { x: own.pos.x, y: own.pos.y };
    if (this.predicted == null) {
      this.predicted = authPos;
    } else {
      this.predicted = {
        x: lerp(this.predicted.x, authPos.x, 0.2),
        y: lerp(this.predicted.y, authPos.y, 0.2),
      };
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

  getRenderState(nowMs: number): RenderState | null {
    // Advance the predicted local position by the held input this frame.
    const dt = clamp((nowMs - this.lastPredictMs) / 1000, 0, 0.05);
    this.lastPredictMs = nowMs;
    if (this.predicted && this.latestInput && this.localPlayerId != null) {
      const speed = CLASSES[this.ownClass].moveSpeed;
      this.predicted = {
        x: clamp(
          this.predicted.x + this.latestInput.move.x * speed * dt,
          PLAYER_RADIUS,
          ARENA_W - PLAYER_RADIUS,
        ),
        y: clamp(
          this.predicted.y + this.latestInput.move.y * speed * dt,
          PLAYER_RADIUS,
          ARENA_H - PLAYER_RADIUS,
        ),
      };
    }

    return this.interpolator.sample(nowMs, {
      localPlayerId: this.localPlayerId,
      arena: { w: ARENA_W, h: ARENA_H },
      predictedLocalPos: this.predicted,
    });
  }

  leave(): void {
    this.byeAction.send({ reason: 'left' });
    this.room.leave();
  }
}
