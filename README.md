# Warband

Warband is a browser-hosted, peer-to-peer co-op boss fight game. One player hosts the fight directly in a browser tab and shares a link; friends open it, pick a class, and jump in. There is no backend and no game server — the host's tab runs the authoritative simulation and streams snapshots to everyone else over WebRTC. Just open a page and play.

## Features

- **4 classes** — Knight, Ranger, Mage, and Cleric, each with a distinct role and ability kit.
- **3 bosses** — the Ancient Dragon, the Forest Troll, and the Lich, each with themed mechanics.
- **Telegraphed attacks** — cones, circles, and lines wind up before they land, so danger is readable and dodgeable.
- **Aggro / threat** — enemies pick targets based on accumulated threat; tanks hold aggro, healers and DPS manage theirs.
- **Downed / revive** — fall to zero HP and you go down with a bleedout timer; a teammate can hold revive to bring you back.
- **Player-count scaling** — boss health and pressure scale to the size of your warband.
- **Gamepad + keyboard/mouse** — play with either; the last-used device wins seamlessly.
- **PWA** — installable and offline-capable app shell.
- **GitHub Pages deploy** — ships as a static site via GitHub Actions to [warband.zen.dev.br](https://warband.zen.dev.br).

## Run locally

```bash
npm install
npm run dev
```

Then open the URL printed in your terminal (typically `http://localhost:5173`).

## Host & join

1. One player clicks **Host** and picks a monster.
2. That player shares the generated `#room=CODE` link with friends.
3. Friends open the link, pick a class, and press **Ready**. The lobby shows a live connection banner — **"Connecting to the host…"** while it searches, then **"Connected to the host"** once the peer link is up.
4. When everyone is ready, the host presses **Start**.

**Same-machine two-window test:** you can try multiplayer with just one computer. Open the dev URL (`http://localhost:5173`) in two browser windows. In the first window click **Host** and copy the room code (or the full `#room=CODE` link). In the second window paste the code/link, pick a class, and press **Ready** — then Start from the host window. Peer-to-peer signaling works across two tabs on the same machine.

> **Note:** the same-machine test always connects because there is no NAT between two tabs. Connecting over the *internet* has an extra requirement (a TURN relay for restrictive networks) — see **Multiplayer & connectivity** below.

## Multiplayer & connectivity

Warband has no game server: the host's tab runs the simulation and peers connect directly over WebRTC. Two things are worth knowing:

- **Yes, sharing the room code is enough to find the host.** The code (plus the app id) is hashed into a shared topic that both browsers announce to public WebTorrent trackers; the trackers introduce the peers and relay the one-time WebRTC handshake. No IP addresses or accounts are involved.
- **Internet play may need a TURN relay.** After matchmaking, the browsers try to open a *direct* connection. On many real networks (symmetric NATs, mobile carriers, corporate/campus firewalls) a direct path is impossible and the traffic must bounce off a **TURN relay**. Warband bundles a free best-effort public relay so cross-network games can connect out of the box, but for dependable play you should point it at your own TURN server via environment variables. Copy `.env.example` to `.env.local` and set `VITE_TURN_URL` / `VITE_TURN_USERNAME` / `VITE_TURN_CREDENTIAL`, then rebuild.

For the full explanation — how the rendezvous works, a step-by-step "connect with someone over the internet" guide, TURN options, and troubleshooting — see **[docs/NETWORKING.md](docs/NETWORKING.md)**.

## Controls

**Keyboard & mouse**

| Action | Input |
| --- | --- |
| Move | `W` `A` `S` `D` |
| Aim | Mouse |
| Basic attack | Left-Click / `Space` |
| Ability 1 (A1) | `Q` |
| Ability 2 (A2) | `E` |
| Ability 3 (A3) | `R` |
| Revive (hold) | `F` |

**Gamepad / DualSense**

| Action | Input |
| --- | --- |
| Move | Left stick |
| Aim | Right stick |
| Basic attack | ✕ / A |
| Ability 1 (A1) | ○ / B |
| Ability 2 (A2) | □ / X |
| Ability 3 (A3) | △ / Y |
| Revive (hold) | L1 / R1 |

The last-used device wins — switch between gamepad and keyboard/mouse at any time and control follows whatever you touched last.

## Classes

- **Knight** — tank. Soaks damage and holds the boss's aggro.
- **Ranger** — ranged DPS. Consistent damage from a safe distance.
- **Mage** — burst DPS and control. High spike damage plus crowd control.
- **Cleric** — healer. Keeps the warband standing and helps revives.

## Bosses

- **Ancient Dragon** — Medium.
- **Forest Troll** — Medium-Hard.
- **Lich** — Hard.

## Tuning

All balance numbers live in plain data files and are easy to tweak:

- `src/engine/constants.ts` — global simulation constants (tick rate, arena size, radii, revive/bleedout timings, colors).
- `src/engine/classes.ts` — per-class stats and ability definitions.
- `src/engine/monsters.ts` — per-boss stats and difficulty.

## Tests

The engine is pure TypeScript and fully unit-tested with Vitest:

```bash
npm test
```

## Architecture

The codebase is organized around a clean split between simulation, networking, and presentation:

- **`engine/`** — pure, deterministic, host-authoritative simulation. No DOM, no network, no rendering — just game logic, so it can be unit-tested in isolation.
- **`net/`** — networking over Trystero (WebRTC) in a star topology, with snapshot interpolation and client-side prediction. ICE/TURN and tracker configuration lives in `net/rtc.ts` (env-overridable); see [docs/NETWORKING.md](docs/NETWORKING.md).
- **`render/`** — PixiJS rendering of the interpolated render state.
- **`input/`** — keyboard/mouse and gamepad input, normalized into a single input command.
- **`ui/`** — React + Zustand for menus, lobby, HUD, and results.

Only the **host** runs the full simulation. Clients send their inputs to the host and render interpolated snapshots they receive back, so all game state stays authoritative on a single peer.

## Deploy

Pushing to `main` triggers the GitHub Pages workflow (`.github/workflows/deploy.yml`), which builds the site and publishes it. To enable it, set repo **Settings → Pages → Source = GitHub Actions**.

The site is served from the custom domain **[warband.zen.dev.br](https://warband.zen.dev.br)**. The domain is configured by the `public/CNAME` file, which Vite copies into the build output so GitHub Pages picks it up on every deploy. Because the app is served from the domain root, the build uses a base path of `/` (no `BASE_PATH` override). Point a DNS `CNAME` record for `warband.zen.dev.br` at `<user>.github.io` to complete the setup.

For a local static preview of the production build:

```bash
npm run build && npm run preview
```
