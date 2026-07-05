/**
 * Warband — WebRTC connectivity config for the peer-to-peer transport.
 *
 * How two players actually find each other:
 *   1. Both open the SAME room code. Trystero hashes `appId + code` into a topic
 *      and announces it on public WebTorrent trackers (see room.ts). The trackers
 *      pair the two peers and relay WebRTC signaling (SDP offers/answers). So YES
 *      — sharing the short code is genuinely all that's needed to find the host;
 *      the code is the rendezvous key and the trackers do the matchmaking.
 *   2. Once paired, the browsers try to open a DIRECT peer-to-peer connection.
 *      STUN just tells each peer its own public address. On many real networks —
 *      symmetric NATs, mobile carriers, corporate/campus firewalls — a direct
 *      path can't be formed, and the connection needs a TURN server to RELAY the
 *      traffic. Without TURN those two players will sit in the lobby forever even
 *      though the code and trackers worked perfectly. This is the single most
 *      common reason multiplayer "works on one machine but not over the internet."
 *
 * Trystero already ships Google + Cloudflare STUN. This module ADDS TURN (with an
 * env-configurable override for your own relay) and widens the tracker pool.
 */

/** Structural match for Trystero's `TurnServerConfig` (also valid `RTCIceServer`). */
export interface TurnServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/**
 * Best-effort public TURN relay (Open Relay Project / metered.ca). Free, no
 * signup, and shared by everyone on the internet — good enough to get casual
 * cross-network games connecting out of the box, but throughput and uptime are
 * NOT guaranteed. For reliable play, point `VITE_TURN_URL` at your own relay
 * (self-hosted coturn, or a metered.ca / Twilio / Cloudflare account).
 */
export const DEFAULT_TURN: TurnServer[] = [
  { urls: 'stun:openrelay.metered.ca:80' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

/**
 * The subset of `import.meta.env` this module reads. Passed in explicitly (rather
 * than touched directly) so the builders stay pure and unit-testable.
 */
export interface RtcEnv {
  /** One or more comma-separated TURN URLs for your own relay. */
  VITE_TURN_URL?: string;
  VITE_TURN_USERNAME?: string;
  VITE_TURN_CREDENTIAL?: string;
  /** Truthy → drop the bundled public TURN and use only your configured relay. */
  VITE_NO_DEFAULT_TURN?: string;
  /** Extra WebTorrent tracker URLs (comma/space separated) to widen the pool. */
  VITE_TRACKER_URLS?: string;
}

function truthy(v: string | undefined): boolean {
  const s = v?.trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

/**
 * ICE servers to append to Trystero's built-in STUN. Order of preference:
 *   1. your own TURN from `VITE_TURN_URL` (+ optional username/credential), and
 *   2. the bundled public TURN, unless `VITE_NO_DEFAULT_TURN` is truthy.
 * Returns an empty array only if you both provide no TURN and disable the default.
 */
export function buildTurnConfig(env: RtcEnv): TurnServer[] {
  const servers: TurnServer[] = [];

  const url = env.VITE_TURN_URL?.trim();
  if (url) {
    const urls = url
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);
    if (urls.length > 0) {
      servers.push({
        urls: urls.length === 1 ? urls[0] : urls,
        username: env.VITE_TURN_USERNAME?.trim() || undefined,
        credential: env.VITE_TURN_CREDENTIAL?.trim() || undefined,
      });
    }
  }

  if (!truthy(env.VITE_NO_DEFAULT_TURN)) {
    servers.push(...DEFAULT_TURN);
  }

  return servers;
}

/** Extra tracker URLs from `VITE_TRACKER_URLS` (comma/space separated). */
export function extraTrackerUrls(env: RtcEnv): string[] {
  const raw = env.VITE_TRACKER_URLS?.trim();
  if (!raw) return [];
  return raw
    .split(/[\s,]+/)
    .map((u) => u.trim())
    .filter(Boolean);
}

/** Merge default + extra tracker URLs, de-duped, order-stable. */
export function mergeTrackerUrls(defaults: readonly string[], extra: readonly string[]): string[] {
  return [...new Set([...defaults, ...extra])];
}

/**
 * WebTorrent trackers known to reject Trystero's `wss://…/announce` handshake
 * with an HTTP 403 Forbidden. `tracker.files.fm` ships in Trystero's
 * `defaultRelayUrls` but no longer accepts general WebTorrent WebSocket clients,
 * so it can only ever produce a "forbidden" join error — never a match. Keeping
 * it in the pool wastes a redundancy slot and spams the console with failures,
 * so we strip it out. Matched by host, so any port/path variant is caught.
 */
export const BLOCKED_TRACKER_HOSTS: readonly string[] = ['tracker.files.fm'];

/** Lowercased host (without port) of a `wss://host:port/path` tracker URL. */
function trackerHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    // Best-effort parse for anything `URL` can't handle: strip scheme, then
    // take the authority up to the first `/`, and drop any `:port` suffix.
    return url
      .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
      .split('/')[0]
      .split(':')[0]
      .toLowerCase();
  }
}

/**
 * Drop trackers whose host is on the known-broken deny-list (see
 * `BLOCKED_TRACKER_HOSTS`). Applied to the whole pool — including env-supplied
 * extras — since a forbidden tracker is dead weight wherever it comes from.
 */
export function sanitizeTrackerUrls(urls: readonly string[]): string[] {
  return urls.filter((u) => !BLOCKED_TRACKER_HOSTS.includes(trackerHost(u)));
}
