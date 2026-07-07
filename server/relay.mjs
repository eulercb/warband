#!/usr/bin/env node
/**
 * Warband — GLOBAL SERVER relay.
 *
 * A deliberately tiny WebSocket message relay: rooms are named channels, every
 * frame a peer sends is forwarded to every other peer in its room, and that is
 * the whole job. Run it on any publicly reachable machine (a $4 VPS, a
 * free-tier PaaS, a Raspberry Pi with a port forward) and point the client at
 * it with VITE_RELAY_URL — players whose networks can never form a direct
 * WebRTC path (symmetric NATs, strict firewalls) can then meet here instead.
 *
 * The game stays host-authoritative: the relay never inspects payloads, keeps
 * no game state, and a room evaporates when its last socket closes.
 *
 *   node server/relay.mjs            # listens on :8787
 *   PORT=9000 node server/relay.mjs  # custom port
 *
 * Put it behind any TLS-terminating proxy (Caddy/nginx/cloud LB) so browsers
 * on HTTPS pages can connect via wss://.
 *
 * Frames (JSON text):
 *   client → server  {t:'join', app, room, id}
 *   client → server  {t:'msg', action, data}
 *   server → client  {t:'peers', ids}            (on join: who's already here)
 *   server → client  {t:'peerJoin', id} / {t:'peerLeave', id}
 *   server → client  {t:'msg', action, data, from}
 */
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT ?? 8787);
/** Cap a single frame at 256 KiB — snapshots are a few KiB, so this is generous. */
const MAX_FRAME_BYTES = 256 * 1024;
/** Drop sockets that miss two heartbeats (60s of silence). */
const HEARTBEAT_MS = 30_000;

/** roomKey -> Map<peerId, ws> */
const rooms = new Map();

const wss = new WebSocketServer({ port: PORT, maxPayload: MAX_FRAME_BYTES });

function roomKey(app, room) {
  return `${app}/${room}`;
}

function joinRoom(ws, app, room, id) {
  const key = roomKey(app, room);
  let members = rooms.get(key);
  if (!members) {
    members = new Map();
    rooms.set(key, members);
  }
  // A reconnect with the same id replaces the stale socket.
  const stale = members.get(id);
  if (stale && stale !== ws) {
    try {
      stale.close(4000, 'replaced');
    } catch {
      /* ignore */
    }
  }
  ws._room = key;
  ws._id = id;
  members.set(id, ws);
  ws.send(JSON.stringify({ t: 'peers', ids: [...members.keys()].filter((x) => x !== id) }));
  broadcast(key, id, { t: 'peerJoin', id });
  log(`join  ${key} ← ${id.slice(0, 6)} (${members.size} in room)`);
}

function leaveRoom(ws) {
  const key = ws._room;
  const id = ws._id;
  if (!key || !id) return;
  const members = rooms.get(key);
  if (!members) return;
  if (members.get(id) === ws) {
    members.delete(id);
    broadcast(key, id, { t: 'peerLeave', id });
    log(`leave ${key} → ${id.slice(0, 6)} (${members.size} left)`);
    if (members.size === 0) rooms.delete(key);
  }
}

function broadcast(key, fromId, frame) {
  const members = rooms.get(key);
  if (!members) return;
  const encoded = JSON.stringify(frame);
  for (const [id, sock] of members) {
    if (id === fromId) continue;
    if (sock.readyState === sock.OPEN) sock.send(encoded);
  }
}

wss.on('connection', (ws) => {
  ws._alive = true;
  ws.on('pong', () => {
    ws._alive = true;
  });

  ws.on('message', (raw) => {
    let frame;
    try {
      frame = JSON.parse(raw.toString());
    } catch {
      return; // ignore malformed frames
    }
    if (frame?.t === 'join') {
      const app = String(frame.app ?? '');
      const room = String(frame.room ?? '');
      const id = String(frame.id ?? '');
      // Reject junk: ids/rooms are short alphanumerics from the client.
      if (!app || !room || !id || room.length > 32 || id.length > 64 || app.length > 64) {
        ws.close(4001, 'bad join');
        return;
      }
      joinRoom(ws, app, room, id);
      return;
    }
    if (frame?.t === 'msg' && ws._room && ws._id) {
      broadcast(ws._room, ws._id, {
        t: 'msg',
        action: String(frame.action ?? ''),
        data: frame.data,
        from: ws._id,
      });
    }
  });

  ws.on('close', () => leaveRoom(ws));
  ws.on('error', () => leaveRoom(ws));
});

// Heartbeat: terminate sockets that stopped answering pings.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws._alive) {
      ws.terminate();
      continue;
    }
    ws._alive = false;
    try {
      ws.ping();
    } catch {
      /* closing */
    }
  }
}, HEARTBEAT_MS);
wss.on('close', () => clearInterval(heartbeat));

function log(msg) {
  console.log(`[warband-relay] ${msg}`);
}

log(`listening on :${PORT} — point VITE_RELAY_URL at ws://<host>:${PORT} (wss:// behind TLS)`);
