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
- **GitHub Pages deploy** — ships as a static site via GitHub Actions.

## Run locally

```bash
npm install
npm run dev
```

Then open the URL printed in your terminal (typically `http://localhost:5173`).

## Host & join

1. One player clicks **Host** and picks a monster.
2. That player shares the generated `#room=CODE` link with friends.
3. Friends open the link, pick a class, and press **Ready**.
4. When everyone is ready, the host presses **Start**.

**Same-machine two-window test:** you can try multiplayer with just one computer. Open the dev URL (`http://localhost:5173`) in two browser windows. In the first window click **Host** and copy the room code (or the full `#room=CODE` link). In the second window paste the code/link, pick a class, and press **Ready** — then Start from the host window. Peer-to-peer signaling works across two tabs on the same machine.

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
- **`net/`** — networking over Trystero (WebRTC) in a star topology, with snapshot interpolation and client-side prediction.
- **`render/`** — PixiJS rendering of the interpolated render state.
- **`input/`** — keyboard/mouse and gamepad input, normalized into a single input command.
- **`ui/`** — React + Zustand for menus, lobby, HUD, and results.

Only the **host** runs the full simulation. Clients send their inputs to the host and render interpolated snapshots they receive back, so all game state stays authoritative on a single peer.

## Deploy

Pushing to `main` triggers the GitHub Pages workflow (`.github/workflows/deploy.yml`), which builds the site and publishes it. To enable it, set repo **Settings → Pages → Source = GitHub Actions**. The build derives its base path from the repository name so assets resolve under `https://<user>.github.io/<repo>/`.

For a local static preview of the production build:

```bash
npm run build && npm run preview
```
