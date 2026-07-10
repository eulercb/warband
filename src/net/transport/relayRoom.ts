/**
 * Warband — GLOBAL SERVER transport: a drop-in `Room` replacement that speaks
 * to the bundled WebSocket relay (`server/relay.mjs`) instead of forming
 * WebRTC peer connections.
 *
 * Why it exists: on hostile networks (symmetric NATs, strict corporate/campus
 * firewalls, some mobile carriers) a direct WebRTC path is impossible and even
 * TURN can be blocked, while a plain outbound WebSocket to a public server
 * almost always works. Hosting a room "on the global server" trades pure
 * peer-to-peer for guaranteed connectivity: every message is relayed through
 * one publicly reachable machine. The game protocol, the host-authoritative
 * model, and all of `host.ts` / `client.ts` stay identical — this module just
 * satisfies the same structural contract Trystero's room does:
 *
 *   makeAction(id) → { send(data): void; onMessage: ((data, {peerId}) => void) | null }
 *   onPeerJoin / onPeerLeave (settable), leave(), getPeers()
 *
 * Wire framing (JSON text): see server/relay.mjs. Sends are buffered until the
 * socket opens, so callers can fire immediately after construction — matching
 * Trystero's behavior of queueing until peers exist.
 */
import { selfId } from '@trystero-p2p/torrent';
import { APP_ID } from '../protocol';
import { netLog, netWarn } from '../log';

interface ActionHandle<T = unknown> {
  send(data: T): void;
  onMessage: ((data: T, ctx: { peerId: string }) => void) | null;
}

/** Structural stand-in for the Trystero room surface host.ts/client.ts use. */
export interface RelayRoom {
  makeAction(id: string): ActionHandle;
  onPeerJoin: ((peerId: string) => void) | null;
  onPeerLeave: ((peerId: string) => void) | null;
  leave(): void;
  getPeers(): Record<string, RTCPeerConnection>;
}

interface JoinFrame {
  t: 'join';
  app: string;
  room: string;
  id: string;
}
interface MsgFrame {
  t: 'msg';
  action: string;
  data: unknown;
  from?: string;
}
interface PeersFrame {
  t: 'peers';
  ids: string[];
}
interface PeerJoinFrame {
  t: 'peerJoin';
  id: string;
}
interface PeerLeaveFrame {
  t: 'peerLeave';
  id: string;
}
type ServerFrame = MsgFrame | PeersFrame | PeerJoinFrame | PeerLeaveFrame;

/**
 * Open (or create) the room `code` on the relay at `url`. The room springs
 * into existence when the first peer joins it — exactly like a Trystero topic.
 */
export function openRelayRoom(
  url: string,
  code: string,
  onJoinError?: (msg: string) => void,
): RelayRoom {
  const actions = new Map<string, ActionHandle>();
  const peers = new Set<string>();
  const sendQueue: string[] = [];
  let open = false;
  let closed = false;

  const room: RelayRoom = {
    onPeerJoin: null,
    onPeerLeave: null,
    makeAction(id: string): ActionHandle {
      const existing = actions.get(id);
      if (existing) return existing;
      const handle: ActionHandle = {
        onMessage: null,
        send(data: unknown): void {
          const frame: MsgFrame = { t: 'msg', action: id, data };
          const encoded = JSON.stringify(frame);
          if (open) ws.send(encoded);
          else if (!closed) sendQueue.push(encoded);
        },
      };
      actions.set(id, handle);
      return handle;
    },
    leave(): void {
      closed = true;
      try {
        ws.close(1000, 'left');
      } catch {
        /* already closed */
      }
    },
    getPeers(): Record<string, RTCPeerConnection> {
      // No RTCPeerConnections exist on the relay path; diagnostics tolerate {}.
      return {};
    },
  };

  netLog('relay', `connecting to global server ${url} (room "${code}")`);
  let ws: WebSocket;
  try {
    ws = new WebSocket(url);
  } catch (err) {
    netWarn('relay', `global server URL rejected: ${String(err)}`);
    onJoinError?.(`Global server URL is invalid: ${url}`);
    // Return an inert room so callers don't have to special-case construction.
    return room;
  }

  ws.onopen = () => {
    const join: JoinFrame = { t: 'join', app: APP_ID, room: code, id: selfId };
    ws.send(JSON.stringify(join));
    open = true;
    netLog('relay', `connected; joined room "${code}" as ${selfId.slice(0, 6)}`);
    for (const frame of sendQueue) ws.send(frame);
    sendQueue.length = 0;
  };

  ws.onmessage = (ev: MessageEvent) => {
    let frame: ServerFrame;
    try {
      frame = JSON.parse(String(ev.data)) as ServerFrame;
    } catch {
      return; // ignore malformed frames
    }
    switch (frame.t) {
      case 'peers':
        for (const id of frame.ids) {
          if (id === selfId || peers.has(id)) continue;
          peers.add(id);
          room.onPeerJoin?.(id);
        }
        break;
      case 'peerJoin':
        if (frame.id !== selfId && !peers.has(frame.id)) {
          peers.add(frame.id);
          room.onPeerJoin?.(frame.id);
        }
        break;
      case 'peerLeave':
        if (peers.delete(frame.id)) room.onPeerLeave?.(frame.id);
        break;
      case 'msg': {
        const handle = actions.get(frame.action);
        handle?.onMessage?.(frame.data, { peerId: frame.from ?? '' });
        break;
      }
    }
  };

  ws.onerror = () => {
    if (!open && !closed) {
      netWarn('relay', `could not reach the global server at ${url}`);
      onJoinError?.(
        `Could not reach the global server (${url}). Check VITE_RELAY_URL and that the relay is running.`,
      );
    }
  };

  ws.onclose = (ev: CloseEvent) => {
    const wasOpen = open;
    open = false;
    if (closed) return; // we left on purpose
    netWarn('relay', `global server connection closed (${ev.code})`);
    if (wasOpen) {
      // Losing the relay drops every peer at once — report each so the host
      // cleans its lobby and clients surface "host disconnected".
      for (const id of [...peers]) {
        peers.delete(id);
        room.onPeerLeave?.(id);
      }
      onJoinError?.('Lost the connection to the global server.');
    }
  };

  return room;
}
