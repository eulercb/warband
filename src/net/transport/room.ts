/**
 * Warband — room-code helpers + Trystero room lifecycle.
 *
 * Room codes are short, human-shareable strings encoded in the URL hash so a
 * host can copy a link and a client can join by opening it. All Trystero rooms
 * are opened here so the app id stays in exactly one place.
 */
// trystero 0.25 moved strategies to scoped packages; the `trystero/torrent`
// subpath is now a runtime-throwing deprecation stub, so import the real
// torrent strategy directly. (Swap to @trystero-p2p/nostr or /mqtt if tracker
// connectivity is flaky — a one-line change.)
import { joinRoom, defaultRelayUrls, getRelaySockets } from '@trystero-p2p/torrent';
import { APP_ID } from '../protocol';
import {
  buildTurnConfig,
  extraTrackerUrls,
  mergeTrackerUrls,
  sanitizeTrackerUrls,
  rewriteMdnsToLoopback,
  relayUrl,
  type RtcEnv,
} from './rtc';
import { openRelayRoom } from './relayRoom';
import { netLog, netWarn, summarizeIceServers } from '../log';

/**
 * How a session connects. 'p2p' is the classic serverless WebRTC mesh;
 * 'relay' routes every message through the configured GLOBAL SERVER
 * (VITE_RELAY_URL) — the fallback for networks where no direct/TURN path forms.
 */
export type NetMode = 'p2p' | 'relay';

/** This peer's stable, module-level id (from Trystero). Re-exported for callers. */
export { selfId } from '@trystero-p2p/torrent';

/** The Trystero room handle type (inferred from joinRoom to avoid a core dep). */
export type Room = ReturnType<typeof joinRoom>;

/**
 * Unambiguous alphabet for room codes: no O/0, I/1 or L to avoid confusion when
 * a code is read aloud or typed by hand.
 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

/** Generate a fresh 6-character room code from the unambiguous alphabet. */
export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Parse the room code (+ optional connection mode) from
 * `window.location.hash`. Accepts the classic `#room=CODE` and the
 * global-server form `#room=CODE&net=g`. Returns the code UPPERCASED, or null
 * if absent/malformed.
 */
export function readRoomFromHash(): { code: string; net: NetMode } | null {
  const hash = window.location.hash.replace(/^#/, '');
  const match = /^room=([a-z0-9]+)(?:&net=(g|relay))?$/i.exec(hash);
  if (!match) return null;
  return { code: match[1].toUpperCase(), net: match[2] ? 'relay' : 'p2p' };
}

/** Write the room code (+ mode) into the URL hash as `#room=CODE[&net=g]`. */
export function writeRoomToHash(code: string, net: NetMode = 'p2p'): void {
  window.location.hash = code ? 'room=' + code + (net === 'relay' ? '&net=g' : '') : '';
}

/** Build a full shareable link (origin + path + hash) for a room code. The
 * link carries the connection mode so joiners land on the right transport. */
export function shareLinkFor(code: string, net: NetMode = 'p2p'): string {
  return (
    window.location.origin +
    window.location.pathname +
    '#room=' +
    code +
    (net === 'relay' ? '&net=g' : '')
  );
}

// Connectivity config, resolved once from build-time env (see rtc.ts + .env.example).
const rtcEnv = import.meta.env as unknown as RtcEnv;
const TURN_CONFIG = buildTurnConfig(rtcEnv);
// Use every tracker we know about at once (built-in pool + any extras) so a
// single dead/overloaded tracker can't stop two peers from finding each other.
// `sanitizeTrackerUrls` strips known-broken trackers (e.g. tracker.files.fm,
// which rejects the announce handshake with HTTP 403 Forbidden) so they don't
// waste a redundancy slot or spam the console with failures.
const TRACKER_URLS = sanitizeTrackerUrls(
  mergeTrackerUrls(defaultRelayUrls, extraTrackerUrls(rtcEnv)),
);
// Rewrite same-machine mDNS (`*.local`) host candidates to loopback so two peers
// on ONE machine (two tabs/windows) always connect directly, even when the OS
// mDNS responder is blocked. Fixes "can't join even in two tabs"; see rtc.ts.
const RTC_LOOPBACK = rewriteMdnsToLoopback(rtcEnv);

/**
 * Live tracker WebSockets by url, from Trystero (`getRelaySockets`). Used by the
 * connectivity diagnostics to report whether matchmaking is even reachable.
 * Wrapped so callers get a stable shape (and never throw) if the export is absent.
 */
export function getTrackerSockets(): Record<string, WebSocket> {
  // `getRelaySockets` is loosely typed by the package; pin it to the shape we
  // rely on so the call is type-safe and the optional-call guard is meaningful.
  const getSockets = getRelaySockets as (() => Record<string, WebSocket>) | undefined;
  try {
    return getSockets?.() ?? {};
  } catch {
    return {};
  }
}

/** The configured global-server URL, or null when the feature is disabled. */
export function configuredRelayUrl(): string | null {
  return relayUrl(rtcEnv);
}

/**
 * Join (or create) the room for `code` under the shared app id.
 *
 * `net` picks the transport: the classic serverless Trystero/WebRTC mesh
 * ('p2p', default), or the GLOBAL SERVER WebSocket relay ('relay') when the
 * build has one configured — same message channels, same host-authoritative
 * protocol, different pipes.
 *
 * `onJoinError` surfaces transport-level join failures (e.g. every tracker
 * unreachable) so the UI can hint at connectivity problems instead of hanging.
 * Join errors are always logged (see log.ts); the rest of the room lifecycle is
 * logged verbosely when net-debug is enabled.
 */
export function openRoom(
  code: string,
  onJoinError?: (msg: string) => void,
  net: NetMode = 'p2p',
): Room {
  if (net === 'relay') {
    const url = configuredRelayUrl();
    if (url) {
      netLog('room', `joining room "${code}" via GLOBAL SERVER`, { url, appId: APP_ID });
      // Structurally identical to the Trystero room for every surface we use.
      return openRelayRoom(url, code, onJoinError) as unknown as Room;
    }
    netWarn('room', 'relay mode requested but VITE_RELAY_URL is not set — using P2P');
    onJoinError?.('No global server is configured for this build (VITE_RELAY_URL).');
  }
  netLog('room', `joining room "${code}"`, {
    appId: APP_ID,
    ice: summarizeIceServers(TURN_CONFIG),
    trackers: TRACKER_URLS,
    loopback: RTC_LOOPBACK,
  });
  return joinRoom(
    {
      appId: APP_ID,
      // Adds TURN relays on top of Trystero's built-in Google/Cloudflare STUN so
      // peers behind restrictive NATs can still connect over the internet.
      turnConfig: TURN_CONFIG,
      relayConfig: { urls: TRACKER_URLS, redundancy: TRACKER_URLS.length },
      // Rewrite `*.local` mDNS host candidates to 127.0.0.1 so two peers on the
      // SAME machine connect over loopback without depending on the browser's
      // mDNS responder (often blocked) or a TURN relay. This is the fix for
      // "can't join even in two tabs on the same browser"; remote peers are
      // unaffected (only same-host `typ host` lines are touched). See rtc.ts.
      _test_only_mdnsHostFallbackToLoopback: RTC_LOOPBACK,
    },
    code,
    {
      onJoinError: (d) => {
        const msg = typeof d?.error === 'string' ? d.error : 'connection error';
        // Always surfaced (even with debug off): a join error is a real fault —
        // usually every tracker being unreachable — that explains a dead lobby.
        netWarn('room', `join error: ${msg}`, d);
        onJoinError?.(msg);
      },
    },
  );
}
