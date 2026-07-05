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
export function summarizeIceServers(
  servers: readonly { urls: string | string[] }[],
): string {
  const flat = servers.flatMap((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]));
  if (flat.length === 0) return 'none';
  const stun = flat.filter((u) => u.startsWith('stun:')).length;
  const turn = flat.filter((u) => u.startsWith('turn:') || u.startsWith('turns:')).length;
  return `${flat.length} url(s): ${stun} STUN, ${turn} TURN`;
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
  let lastSig = '';

  const read = (): { sockets: Record<string, { readyState: number }>; peers: Record<string, RTCPeerConnection> } => ({
    sockets: safe(src.getSockets, {}),
    peers: safe(src.getPeers, {}),
  });

  const snapshot = (): void => {
    const { sockets, peers } = read();
    // console.info (not gated) so `warband.diagnose()` works even with logs off.
    console.info(
      `${PREFIX} [${src.scope}] snapshot — ${summarizeSockets(sockets)} | ${summarizePeers(peers)}`,
      { trackers: Object.keys(sockets), peers: Object.keys(peers) },
    );
  };

  const tick = (): void => {
    if (!enabled) return;
    const { sockets, peers } = read();

    // Attach one-time state listeners to any newly-active peer connection.
    for (const [id, conn] of Object.entries(peers)) {
      if (watched.has(conn)) continue;
      watched.add(conn);
      const short = id.slice(0, 6);
      const logState = (): void =>
        netLog(src.scope, `peer ${short} → ${conn.connectionState} (ice ${conn.iceConnectionState})`);
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
