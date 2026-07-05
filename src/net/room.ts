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
import { joinRoom, defaultRelayUrls } from '@trystero-p2p/torrent';
import { APP_ID } from './protocol';
import {
  buildTurnConfig,
  extraTrackerUrls,
  mergeTrackerUrls,
  sanitizeTrackerUrls,
  type RtcEnv,
} from './rtc';

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
 * Parse the room code from `window.location.hash` (matching `#room=CODE`,
 * case-insensitive). Returns the code UPPERCASED, or null if absent/malformed.
 */
export function readRoomFromHash(): string | null {
  const hash = window.location.hash.replace(/^#/, '');
  const match = /^room=([a-z0-9]+)$/i.exec(hash);
  return match ? match[1].toUpperCase() : null;
}

/** Write the room code into the URL hash as `#room=CODE`. */
export function writeRoomToHash(code: string): void {
  window.location.hash = 'room=' + code;
}

/** Build a full shareable link (origin + path + hash) for a room code. */
export function shareLinkFor(code: string): string {
  return window.location.origin + window.location.pathname + '#room=' + code;
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

/**
 * Join (or create) the Trystero room for `code` under the shared app id.
 *
 * `onJoinError` surfaces transport-level join failures (e.g. every tracker
 * unreachable) so the UI can hint at connectivity problems instead of hanging.
 */
export function openRoom(code: string, onJoinError?: (msg: string) => void): Room {
  return joinRoom(
    {
      appId: APP_ID,
      // Adds TURN relays on top of Trystero's built-in Google/Cloudflare STUN so
      // peers behind restrictive NATs can still connect over the internet.
      turnConfig: TURN_CONFIG,
      relayConfig: { urls: TRACKER_URLS, redundancy: TRACKER_URLS.length },
    },
    code,
    onJoinError
      ? {
          onJoinError: (d) =>
            onJoinError(typeof d?.error === 'string' ? d.error : 'connection error'),
        }
      : undefined,
  );
}
