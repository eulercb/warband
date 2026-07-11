# Architecture

Warband is a browser-hosted, peer-to-peer co-op boss fight. There is no backend:
the **host's browser tab** runs the authoritative simulation and streams snapshots
to peers, who render interpolated state and send their inputs back.

The source tree is organized as a set of **layers**, and each layer is divided
into **cohesive domain sub-packages**. This keeps related code together, makes a
module's responsibility obvious from its path, and keeps cross-cutting
dependencies explicit and one-directional.

## Dependency direction

```
        ┌─────────────────────────── ui ───────────────────────────┐
        │  screens/   game/   state/         (React + Zustand shell) │
        └───────┬─────────┬─────────┬─────────────────┬─────────────┘
                │         │         │                 │
                ▼         ▼         ▼                 ▼
             input     render      net             audio
                │         │         │                 │
                └─────────┴────┬────┴─────────────────┘
                               ▼
                            engine
              core ◄─ content ◄─ combat ◄─ world ◄─ ai
              (everything in engine depends inward toward core)
```

- **`engine/`** is the foundation. It depends on nothing else in `src/` — no DOM,
  no network, no rendering — so it is deterministic and unit-testable in isolation.
- **`net/`, `render/`, `input/`, `audio/`** each depend on `engine` (its types and
  logic) but not on each other.
- **`ui/`** is the composition root: it wires input → net → engine (on the host) →
  render, and owns the React/Zustand presentation shell.

## Layers and domains

### `engine/` — pure, host-authoritative simulation

| Domain     | Responsibility                                                                                                                                                                                                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core/`    | The **shared kernel**: the domain model and wire/render contract (`types.ts` — `Player`, `Boss`, `Snapshot`, `RenderState`, …), every tunable number (`constants.ts`), and geometry helpers (`math.ts`, toroidal wrap-around in `torus.ts`). Imported by nearly every other module.                        |
| `content/` | Data-driven game content: player `classes`, `monsters` (33 bosses, tiers, run assembly, endless modifiers), boss `affixes` (Vampiric/Frenzied/… + the seeded roll policy), generic run `upgrades`, per-class `charUpgrades` (incl. hybrids), and player-count `scaling`.                                   |
| `combat/`  | Combat resolution: damage/heal application (`combat`), ability execution (`abilities`), and the `threat`/aggro table.                                                                                                                                                                                      |
| `world/`   | Procedural world generation (`terrain` hazards, `obstacles`/cover), the seeded mid-fight `corruption` event scheduler, the attack-pattern fairness `grammar` guardrail, and the authoritative simulation step (`world.ts`) that ties every domain together each tick — including applying affix behaviour. |
| `ai/`      | Host-simulated `bot` party members and their personalities.                                                                                                                                                                                                                                                |

Within `engine`, dependencies flow inward toward `core`: `content` and `combat`
build on `core`; `world` orchestrates `content`, `combat`, and its own generators;
`ai` reads `world`/`content` to make decisions.

### `net/` — peer-to-peer networking (star topology)

| Domain        | Responsibility                                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `transport/`  | Raw peer transport: the Trystero WebRTC `room`, ICE/TURN + tracker config (`rtc`), and the `relayRoom` global-server fallback (a structural drop-in for the room). |
| `session/`    | The authoritative `host` session and the `client` session, both built on top of a transport.                                                                       |
| `protocol.ts` | The shared wire message protocol.                                                                                                                                  |
| `log.ts`      | Verbose connection logging + live diagnostics.                                                                                                                     |

See [NETWORKING.md](NETWORKING.md) for the rendezvous/NAT/TURN details.

### `render/` — PixiJS presentation

| Domain      | Responsibility                                                                                                                      |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `pipeline/` | The core draw loop: the `renderer`, immediate-mode `entityView`, `camera` (world→screen, dynamic zoom), and snapshot `interpolate`. |
| `overlays/` | World-space overlays: particle/screen `fx`, speech `balloons`, and `buffGlyphs`.                                                    |
| `rig/`      | The asset-free procedural **skeletal-rig** animation system (IK, gait, per-creature specs).                                         |
| `sprites/`  | The retained **pixel-sprite** layer + particle sprites.                                                                             |

### `input/` — device input

Keyboard/mouse and gamepad input normalized into a single input command, plus
rebindable `bindings` and gamepad menu navigation.

### `ui/` — React + Zustand shell

| Domain     | Responsibility                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `screens/` | Full-screen flows: `MainMenu`, `HostSetup`, `JoinScreen`, `Lobby`, `ResultScreen`, `Controls`.                                        |
| `game/`    | In-fight UI: `GameView` (hosts the Pixi renderer), `HUD`, `PauseMenu`, and small in-fight widgets.                                    |
| `state/`   | Non-visual glue: the Zustand `store`/`hudStore`, the `session` lifecycle (net ↔ store), and the `hudBridge`/`playground` controllers. |
| `App.tsx`  | The shell that mounts the menu vs. the in-fight view.                                                                                 |

## Testing

The engine and other pure modules are unit-tested with Vitest (`tests/`, run with
`npm test`). The I/O edges that only execute against a real browser canvas
(PixiJS/WebGL) or a live peer connection are excluded from coverage and exercised
by the headless Playwright smoke test (`npm run smoke`) instead — see the coverage
`exclude` list in `vite.config.ts`.
