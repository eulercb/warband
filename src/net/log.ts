/**
 * Warband — verbose networking logs + live connectivity diagnostics.
 *
 * Multiplayer failures are notoriously *silent*: two peers can sit in the lobby
 * forever with a clean console and an idle Network tab, because "nothing
 * happened" is not an error anyone throws. Trackers can be reachable while the
 * WebRTC handshake never completes; the handshake can complete while a lobby
 * message is dropped. None of that surfaces on its own.
 *
 * This module makes the whole connection lifecycle observable — room joins,
 * tracker sockets, peer handshakes, and every lobby message — so you can watch
 * WHERE a connection stalls instead of guessing.
 *
 * Turning it on:
 *   - It is ON by default under `vite dev` (`import.meta.env.DEV`), so the common
 *     "two tabs on localhost" test logs out of the box.
 *   - On a production build it is OFF by default. Enable it *without rebuilding*
 *     by running `warband.netDebug(true)` in the browser console (persisted via
 *     localStorage) and reloading — handy for debugging the deployed site.
 *   - Bake it into a build with `VITE_NET_DEBUG=true`.
 *   - `warband.netDebug(false)` turns it back off; `warband.diagnose()` prints a
 *     one-shot connectivity snapshot on demand.
 *
 * Everything except genuine errors/warnings is gated behind the toggle, so a
 * production build with logging off pays essentially nothing.
 */

/** localStorage key holding an explicit runtime on/off override. */
const LS_KEY = 'warband:netDebug';
/** Common console prefix so all Warband net logs are easy to filter. */
const PREFIX = '[warband:net]';

// -----------------------------------------------------------------------------
// Enablement (pure decision + runtime plumbing)
// -----------------------------------------------------------------------------

/** Inputs to the "is debug on?" decision, passed in so the logic stays pure. */
export interface NetDebugInputs {
  /** `localStorage[LS_KEY]` — an explicit runtime override, or null if unset. */
  stored: string | null;
  /** Build-time `VITE_NET_DEBUG`. */
  buildFlag: string | undefined;
  /** `import.meta.env.DEV` — the dev-server default. */
  dev: boolean;
}

function truthy(v: string | undefined | null): boolean {
  const s = v?.trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

function falsy(v: string | undefined | null): boolean {
  const s = v?.trim().toLowerCase();
  return s === '0' || s === 'false' || s === 'no' || s === 'off';
}

/**
 * Decide whether verbose net logging is on. Precedence, most specific first:
 *   1. an explicit localStorage override (set via `warband.netDebug(...)`) — so
 *      you can force it ON in production OR OFF in dev,
 *   2. the build-time `VITE_NET_DEBUG` flag,
 *   3. otherwise the `import.meta.env.DEV` default.
 * Pure, so it can be unit-tested without touching `import.meta`/`localStorage`.
 */
export function resolveNetDebug(inp: NetDebugInputs): boolean {
  if (truthy(inp.stored)) return true;
  if (falsy(inp.stored)) return false;
  if (truthy(inp.buildFlag)) return true;
  if (falsy(inp.buildFlag)) return false;
  return inp.dev;
}

function readInputs(): NetDebugInputs {
  let stored: string | null;
  try {
    stored = typeof localStorage !== 'undefined' ? localStorage.getItem(LS_KEY) : null;
  } catch {
    // localStorage can throw (private mode, sandboxed iframe) — treat as unset.
    stored = null;
  }
  const env = import.meta.env as unknown as { DEV?: boolean; VITE_NET_DEBUG?: string };
  return { stored, buildFlag: env.VITE_NET_DEBUG, dev: Boolean(env.DEV) };
}

let enabled = resolveNetDebug(readInputs());

/** Whether verbose net logging is currently on. */
export function isNetDebugEnabled(): boolean {
  return enabled;
}

/** Turn verbose net logging on/off at runtime (persisted in localStorage). */
export function setNetDebug(on: boolean): boolean {
  enabled = on;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(LS_KEY, on ? '1' : '0');
  } catch {
    /* ignore persistence failures */
  }
  // Route through console directly so the confirmation shows even when going OFF.
  console.info(`${PREFIX} verbose logging ${on ? 'ENABLED' : 'disabled'}`);
  return enabled;
}

// -----------------------------------------------------------------------------
// Log emitters
// -----------------------------------------------------------------------------

const t0 = performance.now();

/** Seconds since module load, e.g. "+3.20s" — the axis that matters for timing. */
function ts(): string {
  return `+${((performance.now() - t0) / 1000).toFixed(2)}s`;
}

function line(scope: string, msg: string): string {
  return `${PREFIX} ${ts()} [${scope}] ${msg}`;
}

/** Gated verbose log — only prints when debug is enabled. */
export function netLog(scope: string, msg: string, detail?: unknown): void {
  if (!enabled) return;
  if (detail === undefined) console.log(line(scope, msg));
  else console.log(line(scope, msg), detail);
}

/** Warning — always prints, even with logging off; it signals real trouble. */
export function netWarn(scope: string, msg: string, detail?: unknown): void {
  if (detail === undefined) console.warn(line(scope, msg));
  else console.warn(line(scope, msg), detail);
}

/** Error — always prints. */
export function netError(scope: string, msg: string, detail?: unknown): void {
  if (detail === undefined) console.error(line(scope, msg));
  else console.error(line(scope, msg), detail);
}

/**
 * Fire `msg` only the FIRST time a given key is seen, via the caller's Set. For
 * high-frequency channels (snapshots, inputs) where "it started flowing" is the
 * signal and per-message logs would drown the console.
 */
export function netLogOnce(seen: Set<string>, key: string, scope: string, msg: string): void {
  if (seen.has(key)) return;
  seen.add(key);
  netLog(scope, msg);
}

// -----------------------------------------------------------------------------
// Summarizers (pure — unit-tested)
// -----------------------------------------------------------------------------

/** `WebSocket.readyState` → name, without depending on the enum at runtime. */
const WS_STATE = ['connecting', 'open', 'closing', 'closed'] as const;

/** Compact readyState breakdown of the tracker sockets, e.g. "3 open, 1 connecting". */
export function summarizeSockets(sockets: Record<string, { readyState: number }>): string {
  const urls = Object.keys(sockets);
  if (urls.length === 0) return 'no tracker sockets yet';
  const counts: Record<string, number> = {};
  for (const url of urls) {
    const name = WS_STATE[sockets[url].readyState] ?? `state${sockets[url].readyState}`;
    counts[name] = (counts[name] ?? 0) + 1;
  }
  const parts = Object.entries(counts).map(([k, n]) => `${n} ${k}`);
  return `${urls.length} tracker socket${urls.length === 1 ? '' : 's'} (${parts.join(', ')})`;
}

/** Peer count + each connection/ICE state, e.g. "1 active peer (a1b2c3=connected/completed)". */
export function summarizePeers(
  peers: Record<string, { connectionState?: string; iceConnectionState?: string }>,
): string {
  const ids = Object.keys(peers);
  if (ids.length === 0) return '0 active peers';
  const parts = ids.map((id) => {
    const p = peers[id];
    return `${id.slice(0, 6)}=${p.connectionState ?? '?'}/${p.iceConnectionState ?? '?'}`;
  });
  return `${ids.length} active peer${ids.length === 1 ? '' : 's'} (${parts.join(', ')})`;
}

/** STUN/TURN url tally with NO credentials, e.g. "5 url(s): 1 STUN, 4 TURN". */
export function summarizeIceServers(servers: readonly { urls: string | string[] }[]): string {
  const flat = servers.flatMap((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]));
  if (flat.length === 0) return 'none';
  const stun = flat.filter((u) => u.startsWith('stun:')).length;
  const turn = flat.filter((u) => u.startsWith('turn:') || u.startsWith('turns:')).length;
  return `${flat.length} url(s): ${stun} STUN, ${turn} TURN`;
}

/**
 * Per-tracker liveness. A tracker socket being *open* only proves the WebSocket
 * upgrade succeeded — NOT that the tracker is actually doing WebRTC matchmaking.
 * `frames` counts inbound messages; `signaling` counts the subset that carried a
 * relayed WebRTC offer/answer (i.e. the tracker introduced us to another peer).
 * A socket that is `open` with `frames: 0` is a black hole: connected but mute.
 */
export interface TrackerStat {
  readyState: number;
  frames: number;
  signaling: number;
}

/**
 * Does an inbound tracker frame carry WebRTC signaling (a relayed offer/answer)?
 * WebTorrent tracker frames are JSON text; a plain announce response is just
 * `interval`/`complete`/`incomplete`, while a relayed peer carries `offer` or
 * `answer`. A cheap substring test avoids parsing every frame (SDP is large).
 */
export function isSignalingFrame(data: unknown): boolean {
  if (typeof data !== 'string') return false;
  return data.includes('"offer"') || data.includes('"answer"');
}

/**
 * Multi-line per-tracker readout — state + whether the tracker is talking back.
 * This is the signal `summarizeSockets` hides: "3 open" looks healthy even when
 * all three are mute and can never introduce a peer.
 */
export function summarizeTrackerDetail(stats: Record<string, TrackerStat>): string {
  const urls = Object.keys(stats);
  if (urls.length === 0) return '  (no tracker sockets yet)';
  return urls
    .map((url) => {
      const s = stats[url];
      const state = WS_STATE[s.readyState] ?? `state${s.readyState}`;
      const talk =
        s.frames === 0
          ? 'silent — 0 frames in (mute: cannot introduce peers)'
          : `${s.frames} frame${s.frames === 1 ? '' : 's'} in, ${s.signaling} signaling`;
      return `  ${url} — ${state}, ${talk}`;
    })
    .join('\n');
}

/** State a one-shot connection diagnosis reasons over (all counts, so it's pure). */
export interface DiagnosisInput {
  socketsOpen: number;
  socketsTotal: number;
  peersTotal: number;
  peersConnected: number;
  signalingFrames: number;
}

/**
 * Turn the raw snapshot into a plain-English verdict that names the *stage* that
 * failed and the fix for it — so `warband.diagnose()` stops reading as a healthy
 * "3 open | 0 peers" and instead says where the connection actually died. The
 * branches mirror the failure table in docs/NETWORKING.md.
 *
 * The subtle branch is "tracker sockets open, 0 ACTIVE peers". `getPeers()` only
 * returns peers that have finished the WebRTC handshake, so a peer stuck in ICE
 * — SDP exchanged, but no direct/relayed path ever formed — also reads as 0
 * peers, indistinguishable from "never introduced" by the peer count alone. The
 * tiebreaker is whether a tracker RELAYED SIGNALING to us: a relayed offer/answer
 * proves a peer WAS introduced and we exchanged SDP, so the failure is NAT
 * traversal (needs TURN), NOT matchmaking. Only with *zero* relayed signaling is
 * it genuinely the matchmaking/pairing stage. Getting this split wrong is what
 * sends you chasing trackers when you actually need TURN — so the two cases give
 * opposite advice on purpose.
 */
export function diagnosisVerdict(d: DiagnosisInput): string {
  if (d.peersConnected > 0) {
    return (
      `connected to ${d.peersConnected} peer(s) — the transport is up. If the lobby ` +
      'still looks empty the problem is above the network (app/lobby messages), not peer discovery.'
    );
  }
  if (d.peersTotal > 0) {
    return (
      'introduced to a peer, but the direct WebRTC path is not completing (see the ' +
      'checking/failed state above). THIS is the NAT case — configure a TURN relay ' +
      '(VITE_TURN_URL). It is the classic "works on one machine, not over the internet".'
    );
  }
  if (d.socketsOpen === 0) {
    return (
      'no tracker socket is open — matchmaking cannot even start. The trackers are ' +
      'unreachable (firewall / proxy / captive portal). Try another network or add ' +
      'reachable trackers via VITE_TRACKER_URLS.'
    );
  }
  if (d.signalingFrames > 0) {
    // Sockets open, 0 ACTIVE peers, but a peer relayed offer/answer SDP to us. We
    // WERE introduced and exchanged signaling — matchmaking worked — the direct
    // connection just never came up. `getPeers()` reports 0 because it only counts
    // peers past the handshake, and this one never got there. This is the NAT case:
    // configuring TURN is exactly what helps (the opposite of the 0-signaling case).
    return (
      `tracker sockets are OPEN and a peer relayed WebRTC signaling to you (${d.signalingFrames} ` +
      'offer/answer frame(s) — SDP was exchanged), but the connection never completed: 0 active ' +
      'peers. Matchmaking WORKED — this is the NAT-traversal stage, and configuring TURN is ' +
      'exactly what helps here. The two browsers cannot open a direct path and need a TURN relay ' +
      'to bounce traffic between them; point VITE_TURN_URL at a relay you control (the bundled ' +
      'public one is best-effort and often overloaded). This is the classic "connects across the ' +
      'internet only with TURN" case. Two tabs on ONE machine are handled separately: Warband ' +
      'rewrites their mDNS host candidates to loopback so they connect directly without TURN, so ' +
      'if a SAME-machine join still fails here either that rewrite was disabled ' +
      '(VITE_NO_RTC_LOOPBACK) or WebRTC itself is being blocked locally (privacy extension / ' +
      'enterprise policy).'
    );
  }
  // Sockets open, 0 peers, and NO signaling has been relayed: nobody has been
  // introduced yet. This is the matchmaking stage — NOT NAT/TURN (ICE never runs
  // without a peer, so configuring TURN would change nothing at this point).
  return (
    'tracker sockets are OPEN but no peer has been introduced yet — 0 peers and 0 relayed ' +
    'signaling. This is the matchmaking stage, NOT NAT/TURN (ICE never runs without a peer, so ' +
    'TURN would not help yet). Check, in order: (1) both tabs show the SAME room id above; ' +
    '(2) the host tab is still open; (3) give it a few more seconds — the first introduction can ' +
    'lag. If it stays at 0 signaling, the public trackers are not pairing you: switch trackers via ' +
    'VITE_TRACKER_URLS, or the nostr/mqtt strategy. (Re-testing in two tabs on ONE machine isolates ' +
    'trackers from your network.)'
  );
}

// -----------------------------------------------------------------------------
// Live diagnostics
// -----------------------------------------------------------------------------

function safe<T>(f: () => T, fallback: T): T {
  try {
    return f();
  } catch {
    return fallback;
  }
}

/** Data sources a diagnostics poller reads each tick. */
export interface NetDiagnosticsSources {
  /** Short label for the owning session ("host" / "client"). */
  scope: string;
  /**
   * Room identity ("appId / code") printed by `diagnose()` so a host and a
   * client can eyeball whether they derived the SAME rendezvous topic — a
   * mismatch is the one deterministic cause of "open sockets, 0 peers forever".
   */
  roomLabel?: string;
  /** Current tracker WebSockets by url (Trystero's `getRelaySockets`). */
  getSockets: () => Record<string, { readyState: number }>;
  /** Current *active* peer connections by peerId (Trystero's `room.getPeers`). */
  getPeers: () => Record<string, RTCPeerConnection>;
  /** Poll interval; defaults to 2s. */
  intervalMs?: number;
}

/**
 * Poll tracker-socket + active-peer state and log it whenever it CHANGES (so a
 * stuck connection prints one clear line — "trackers open, 0 active peers" — and
 * then stays quiet rather than spamming). Also attaches connection-state
 * listeners to each active peer for immediate transition logs, and registers a
 * `warband.diagnose()` snapshot. Returns a stop function; call it on room leave.
 */
export function startNetDiagnostics(src: NetDiagnosticsSources): () => void {
  const intervalMs = src.intervalMs ?? 2000;
  const watched = new WeakSet<RTCPeerConnection>();
  // Per-tracker inbound-frame counters. Keyed by url so counts survive a socket
  // reconnect; the WeakSet stops us double-listening to the same socket object.
  const trackerStats = new Map<string, TrackerStat>();
  const instrumented = new WeakSet<WebSocket>();
  let lastSig = '';

  const read = (): {
    sockets: Record<string, { readyState: number }>;
    peers: Record<string, RTCPeerConnection>;
  } => ({
    sockets: safe(src.getSockets, {}),
    peers: safe(src.getPeers, {}),
  });

  /**
   * Attach a *passive* `message` counter to any tracker socket we haven't seen,
   * so `diagnose()` can tell an open-and-relaying tracker from an open-but-mute
   * one. Runs even with verbose logging off (diagnose() must work in prod), and
   * touches nothing Trystero relies on — it only adds a listener and reads state.
   */
  const instrument = (sockets: Record<string, { readyState: number }>): void => {
    for (const [url, sock] of Object.entries(sockets)) {
      let stat = trackerStats.get(url);
      if (!stat) {
        stat = { readyState: sock.readyState, frames: 0, signaling: 0 };
        trackerStats.set(url, stat);
      }
      stat.readyState = sock.readyState;
      const ws = sock as Partial<WebSocket>;
      if (typeof ws.addEventListener === 'function' && !instrumented.has(ws as WebSocket)) {
        instrumented.add(ws as WebSocket);
        ws.addEventListener('message', (ev: MessageEvent) => {
          const s = trackerStats.get(url);
          if (!s) return;
          s.frames += 1;
          if (isSignalingFrame(ev.data)) s.signaling += 1;
        });
      }
    }
  };

  /** Snapshot of the tracker stats limited to sockets that currently exist. */
  const trackerDetail = (
    sockets: Record<string, { readyState: number }>,
  ): Record<string, TrackerStat> => {
    const out: Record<string, TrackerStat> = {};
    for (const [url, sock] of Object.entries(sockets)) {
      const s = trackerStats.get(url);
      out[url] = {
        readyState: sock.readyState,
        frames: s?.frames ?? 0,
        signaling: s?.signaling ?? 0,
      };
    }
    return out;
  };

  const snapshot = (): void => {
    const { sockets, peers } = read();
    instrument(sockets);
    const detail = trackerDetail(sockets);
    const socketsOpen = Object.values(sockets).filter((s) => s.readyState === 1).length;
    const peerList = Object.values(peers);
    const peersConnected = peerList.filter((p) => p.connectionState === 'connected').length;
    const signalingFrames = Object.values(detail).reduce((n, s) => n + s.signaling, 0);
    const verdict = diagnosisVerdict({
      socketsOpen,
      socketsTotal: Object.keys(sockets).length,
      peersTotal: peerList.length,
      peersConnected,
      signalingFrames,
    });
    // console.info (not gated) so `warband.diagnose()` works even with logs off.
    const room = src.roomLabel ? ` — room ${src.roomLabel}` : '';
    console.info(
      `${PREFIX} [${src.scope}] snapshot${room}\n` +
        `  ${summarizeSockets(sockets)} | ${summarizePeers(peers)}\n` +
        `${summarizeTrackerDetail(detail)}\n` +
        `  → ${verdict}`,
      { trackers: detail, peers: Object.keys(peers) },
    );
  };

  const tick = (): void => {
    // Instrument sockets even when verbose logging is off, so an on-demand
    // `diagnose()` in a production build still has real per-tracker counts.
    instrument(safe(src.getSockets, {}));
    if (!enabled) return;
    const { sockets, peers } = read();

    // Attach one-time state listeners to any newly-active peer connection.
    for (const [id, conn] of Object.entries(peers)) {
      if (watched.has(conn)) continue;
      watched.add(conn);
      const short = id.slice(0, 6);
      const logState = (): void =>
        netLog(
          src.scope,
          `peer ${short} → ${conn.connectionState} (ice ${conn.iceConnectionState})`,
        );
      conn.addEventListener('connectionstatechange', logState);
      conn.addEventListener('iceconnectionstatechange', logState);
    }

    const sig = `${summarizeSockets(sockets)} | ${summarizePeers(peers)}`;
    if (sig !== lastSig) {
      lastSig = sig;
      netLog(src.scope, `connectivity: ${sig}`);
    }
  };

  tick();
  const timer = setInterval(tick, intervalMs);
  setDiagnoser(snapshot);
  return () => {
    clearInterval(timer);
    setDiagnoser(null);
  };
}

// -----------------------------------------------------------------------------
// Console API: `warband.netDebug(true|false)`, `warband.diagnose()`
// -----------------------------------------------------------------------------

const noSession = (): void => console.info(`${PREFIX} no active session to diagnose`);
let diagnoser: () => void = noSession;

/** Register (or clear) the live snapshot backing `warband.diagnose()`. */
export function setDiagnoser(fn: (() => void) | null): void {
  diagnoser = fn ?? noSession;
}

if (typeof window !== 'undefined') {
  const w = window as unknown as { warband?: Record<string, unknown> };
  w.warband = {
    ...(w.warband ?? {}),
    netDebug: (on: boolean = true) => setNetDebug(Boolean(on)),
    diagnose: () => diagnoser(),
    isNetDebugEnabled,
  };
}
