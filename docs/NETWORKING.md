# Warband networking & connectivity

Warband has **no game server**. The player who clicks **Host** runs the entire
authoritative simulation in their browser tab and streams snapshots to everyone
else over **WebRTC** data channels. This doc explains how two browsers actually
find and connect to each other, why that sometimes fails over the internet, and
how to make it reliable.

## Is sharing "some letters" really enough to find the host?

**Yes — the room code is genuinely all that's needed to find the host.** Here is
what happens under the hood when someone opens your `#room=CODE` link:

1. **Rendezvous.** Warband uses [Trystero](https://github.com/dmotz/trystero)
   with its WebTorrent strategy. Trystero takes your app id
   (`warband-v1-boss-fight`) plus the room code and hashes them into a shared
   "topic". Both the host and the joiner announce that topic to a set of public
   **WebTorrent trackers** (`wss://…` WebSocket servers). The trackers act purely
   as a matchmaking blackboard: "who else is interested in this topic?" Because
   the host and joiner derive the *same* topic from the *same* code, the trackers
   introduce them to each other. **The code is the rendezvous key.** No IP
   address, no account, no server of ours is involved.

2. **Signaling.** Once introduced, the two browsers exchange WebRTC *signaling*
   messages (SDP offers/answers and ICE candidates) through the trackers. This is
   a tiny, one-time handshake to agree on how to talk directly.

3. **The direct connection.** The browsers then try to open a direct
   peer-to-peer connection and, from that point on, the trackers are no longer
   used — game traffic flows straight between the players.

So the short code is not a shortcut or a partial address; it *is* the full
coordinate the matchmaking layer needs. What it does **not** do is guarantee that
step 3 succeeds — and that is where "it works on my machine but not over the
internet" comes from.

## Why it can fail over the internet (and works fine on one machine)

Two different things have to work, and they fail for different reasons:

### 1. The trackers must be reachable

If the public WebTorrent trackers are down, overloaded, or blocked by a firewall
/ proxy, the two peers never get introduced and both sit waiting. Warband
mitigates this by contacting **every** tracker in its pool at once (so one dead
tracker doesn't matter) and lets you add your own via `VITE_TRACKER_URLS`.

Warband also **deny-lists trackers that are known to be broken** so they don't
waste a redundancy slot or spam the console. In particular `tracker.files.fm`
(one of Trystero's built-in defaults) rejects the `wss://…/announce` handshake
with an HTTP **403 Forbidden** and can never introduce peers, so it is stripped
from the pool in `src/net/rtc.ts` (`sanitizeTrackerUrls` / `BLOCKED_TRACKER_HOSTS`).

### 2. The direct connection must be establishable (NAT traversal)

Even after a successful introduction, two browsers on the open internet are
usually behind home routers doing **NAT**. To punch a direct path they use:

- **STUN** — a lightweight server that just tells each peer *"here is how the
  outside world sees your address."* Trystero ships Google + Cloudflare STUN.
  STUN is enough for most home networks.
- **TURN** — a **relay** server. When a direct path is impossible — *symmetric*
  NATs, strict corporate/campus firewalls, and many mobile carriers — the only
  way through is to bounce the encrypted traffic off a neutral relay both peers
  *can* reach. Without a TURN server, those players will never connect, no matter
  how correct the code and trackers are.

When you test with **two tabs / two windows on the same computer**, there is no
NAT between them at all, so it always works — which is exactly why local testing
can look fine while a real cross-internet game hangs in the lobby. **Missing TURN
is the single most common cause of that.**

Warband bundles a free, best-effort public TURN relay so cross-network games have
a chance of connecting out of the box, but public relays are shared and their
uptime/throughput are not guaranteed. For dependable internet play, configure
your own (see below).

## How to connect with someone over the internet — step by step

1. **Deploy the app somewhere both players can open** — e.g. the GitHub Pages
   build at `warband.zen.dev.br`, or any static host. (Opening a local
   `localhost` URL only works on your own machine; your friend can't reach it.)
2. **Host:** open the site, click **Host Game**, pick a boss, and **Create
   Room**. You land in the lobby showing a **room code** and a **Copy share
   link** button.
3. **Share** the room code or the full `#room=CODE` link with your friend (chat,
   email, etc.).
4. **Joiner:** open the link (or open the site, click **Join Game**, and type the
   code). Pick a name and press **Join**.
5. Watch the lobby's connection banner:
   - Joiner shows **"Connecting to the host…"** while it searches, then
     **"Connected to the host"** once the peer link is up.
   - Host shows the count of connected players as they arrive.
6. Everyone picks a class and presses **Ready**; the host presses **Start Fight**.

If the joiner is stuck on "Connecting to the host…" for ~15s, Warband shows a
hint. Work through the troubleshooting list below.

## Making internet play reliable: configure TURN

For anything beyond casual testing, run or rent your own TURN server and point
Warband at it. Copy `.env.example` to `.env.local` and set:

```bash
VITE_TURN_URL=turn:your-turn-host:3478,turns:your-turn-host:5349
VITE_TURN_USERNAME=your-username
VITE_TURN_CREDENTIAL=your-credential
# Optional: use ONLY your relay, dropping the bundled public one:
# VITE_NO_DEFAULT_TURN=true
```

Then rebuild (`npm run build`) — these are build-time values.

Where to get a TURN server:

- **Self-host [coturn](https://github.com/coturn/coturn)** on a small VPS. Most
  control, cheapest at scale.
- **Managed** — [metered.ca / Open Relay](https://www.metered.ca/tools/openrelay/),
  Twilio, Cloudflare Calls, Xirsys, etc. — usually a URL + username + credential
  you paste into the vars above.

You can also widen the tracker pool for more reliable matchmaking:

```bash
VITE_TRACKER_URLS=wss://tracker.example.com,wss://tracker2.example.com
```

## Debugging with verbose logs

Multiplayer failures are often **silent** — two peers sit in the lobby forever
with a clean console and an idle Network tab, because "nothing happened" is not an
error anyone throws. Warband ships a verbose logging mode that narrates the whole
connection lifecycle so you can see *where* it stalls.

**Turning it on:**

- It is **on automatically** under `npm run dev`, so the common two-tab test logs
  out of the box — just open devtools.
- On a **production build** it is off by default. Enable it two ways:
  - **No rebuild:** open the browser console and run `warband.netDebug(true)`,
    then reload. It persists in `localStorage`, so it survives reloads until you
    run `warband.netDebug(false)`. Great for debugging the live site.
  - **Build-time:** set `VITE_NET_DEBUG=true` (see `.env.example`) and rebuild.
- Run `warband.diagnose()` any time for a one-shot snapshot. It works even with
  verbose logging **off**, and prints four things:
  1. the **room identity** (`appId / code`) — open `diagnose()` on the host *and*
     the joiner and confirm both print the **same** line. If they differ, the two
     tabs derived different rendezvous topics and can never find each other (wrong
     code) — that is the whole bug, stop here.
  2. the socket + peer summary (`3 tracker sockets (3 open) | 0 active peers`).
  3. a **per-tracker** readout — each tracker's state, **how many inbound frames
     it has sent you**, and **how many of those carried WebRTC signaling** (a
     relayed offer/answer). A socket being `open` only means the WebSocket
     handshake succeeded; it does **not** mean the tracker is doing any
     matchmaking. A tracker shown as `open, silent — 0 frames in` is a black hole:
     connected but mute, and can never introduce a peer. A tracker showing
     `N signaling` **has** relayed a peer's SDP to you — proof matchmaking worked.
  4. a plain-English **verdict** naming the stage that failed and its fix. The
     verdict hinges on the **signaling** count when you are stuck at `0 active
     peers`, because `getPeers()` only counts peers past the WebRTC handshake — a
     peer stuck in ICE reads as `0` too. So:
     - `0 active peers` **and `0 signaling`** → the *matchmaking* stage: nobody has
       been introduced. Check the room code / host tab / trackers — **not** TURN.
     - `0 active peers` **but `N signaling`** (offers/answers were relayed) → you
       *were* introduced and exchanged SDP; the direct connection just never
       formed. That is the **NAT-traversal** stage — **configure TURN**
       (`VITE_TURN_URL`). This is the case the reported "stuck in the lobby" bug
       falls into, and the verdict now says so instead of blaming the trackers.

All lines are prefixed `[warband:net]` with a `+Ns` timestamp and a scope
(`room` / `host` / `client`), so you can filter the console on `warband:net`.

**A healthy join looks like this** (client tab):

```
[warband:net] +0.01s [client] joining room "ABC234" as 7f3a9c { name: … }
[warband:net] +0.30s [client] connectivity: 4 tracker sockets (4 open) | 0 active peers
[warband:net] +1.90s [client] peer appeared d41c22 — re-announcing hello/selection
[warband:net] +2.10s [client] peer d41c22 → connected (ice completed)
[warband:net] +2.15s [client] HOST REACHED via d41c22 — first host message received
[warband:net] +2.15s [client] recv lobby { players: 2, phase: 'lobby' }
```

**Reading a failure** — find the last step that *did* happen:

| Last thing you see | What it means | Where to look |
| --- | --- | --- |
| `connectivity: … 0 open` (sockets never open) or a `join error` | Trackers unreachable — matchmaking can't even start | Firewall/proxy/captive portal; try another network or add `VITE_TRACKER_URLS` |
| Trackers open, `0 active peers`, and `diagnose()` shows **`0 signaling`** on every tracker | Matchmaking hasn't paired you — nobody has been introduced | Confirm both tabs use the *exact* same room code; check the host tab is open; re-test in two tabs on one machine to isolate the trackers |
| Trackers open, `0 active peers`, but `diagnose()` shows **`N signaling`** (offers/answers were relayed) | You *were* introduced and exchanged SDP, but the WebRTC connection never formed — **NAT traversal**, not matchmaking | Configure TURN — `VITE_TURN_URL` (above). The in-app hint says the same. This is the classic "works on one machine, not over the internet". (Trystero also logs a `join error: could not connect … after exchanging SDP` a few seconds later.) |
| `peer appeared` / peer state reaches `checking` or `failed` but **never `connected`**, and no `HOST REACHED` | Direct WebRTC path can't form (NAT) | You need TURN — configure `VITE_TURN_URL` (above) |
| `HOST REACHED` then later `reachability lost` | Connection formed then dropped | Flaky network / carrier-grade NAT — TURN relay for that player |

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Joiner stuck on "Connecting to the host…" | Wrong code, or host tab closed | Re-check the code; make sure the host's tab is still open |
| Works between two tabs, fails across the internet | No usable NAT-traversal path (needs TURN) | Configure `VITE_TURN_URL` (see above) |
| Both peers hang immediately; console shows tracker `wss://` failures | Trackers blocked/down (firewall, proxy, captive portal) | Try another network, or add reachable trackers via `VITE_TRACKER_URLS` |
| Connects then drops on one player's mobile/hotspot | Carrier-grade NAT | TURN relay is required for that player |

Open your browser devtools console during a connection attempt and enable verbose
logs (above). Warband logs tracker/join errors there (`[warband:net] … join
error`) plus the full handshake, which tells you whether the problem is
matchmaking (trackers) or the direct connection (NAT/TURN).

## Where this lives in the code

- `src/net/room.ts` — opens the Trystero room; assembles TURN + tracker config.
- `src/net/rtc.ts` — pure builders for the ICE/TURN + tracker configuration
  (env-overridable, unit-tested in `tests/rtc.test.ts`); also holds the
  known-broken-tracker deny-list (`sanitizeTrackerUrls`).
- `src/net/host.ts` / `src/net/client.ts` — the star-topology host and clients;
  they report connected-peer counts up to the UI.
- `src/net/log.ts` — verbose connection logging + live diagnostics (the
  `[warband:net]` logs and `warband.netDebug()` / `warband.diagnose()` console
  helpers described in "Debugging with verbose logs" above).
- `src/ui/session.ts` — wires peer counts into the store and drives the
  "still connecting" hint; `src/ui/Lobby.tsx` renders the connection banner.
