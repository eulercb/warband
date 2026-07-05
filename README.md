# Warband

Warband is a browser-hosted, peer-to-peer co-op boss fight game. One player hosts the fight directly in a browser tab and shares a link; friends open it, pick a class, and jump in. There is no backend and no game server — the host's tab runs the authoritative simulation and streams snapshots to everyone else over WebRTC. Just open a page and play.

## Features

- **8 classes** — Knight, Ranger, Mage, Cleric, plus **Barbarian** (rage bruiser), **Rogue** (burst + evasion), **Paladin** (off-tank/support hybrid) and **Druid** (nature control), each with a distinct role and ability kit.
- **33 bosses** — the originals plus 30 new DnD/medieval creatures split across **Easy / Medium / Hard** tiers (goblins, spiders and dire wolves through orcs, basilisks and cyclopes up to beholders, vampire lords, mind flayers and krakens), each with its own mechanics.
- **5-boss runs + Endless** — a run climbs through five bosses of rising difficulty with an upgrade phase between each. Clear all five and the Victory screen offers **Endless**: carry every upgrade and score into escalating cycles where bosses gain an elemental **type** (Frost Dragon, Dark Troll, Infernal Ogre…) and grow deadlier each lap.
- **Between-boss upgrades (generic + character)** — after every boss each hero picks BOTH a generic run upgrade (swifter, tankier, faster cooldowns…) AND a class-specific **character upgrade** that retunes their kit's mechanics — a Mage can teach Frost Nova to freeze enemies solid, snap the Fireball's cast time down, a Barbarian's swings can drink blood, a Ranger's arrows can chill. Picks accumulate across the run.
- **Ready-gated advance** — the run only proceeds to the next boss once *every* player has readied up (no auto-advance timer), just like the lobby.
- **Player score** — a running participation score (damage + healing + revives − deaths, plus boss-clear bonuses) shown live on the HUD, in the pause menu, and on the results screen, so an Endless run has a "how far did we get" number.
- **Bot band members** — short a player? The host can add AI teammates of any class to fill the warband.
- **Wrap-around arena** — the battlefield is a torus with no walls: march off one edge and you reappear on the other. The camera frames the **whole action** (party *and* boss) and **dynamically zooms out** when they spread apart so no hero is ever lost off-screen — without loosening past a full-arena view, so the wrap illusion stays intact.
- **Ranged range caps** — every ranged attack now has a hard travel limit, so on the toroidal map a shot fizzles instead of lapping the arena forever and hitting you in the back.
- **Themed terrain hazards** — each fight seeds random hazards themed to the boss (magma pools, swamps, cursed ice, death-fog…) that slow and burn anyone standing in them; a pause-menu legend explains each one.
- **Solid cover obstacles** — seeded rubble blocks ranged attacks **and movement**: it behaves like a wall for heroes, minions and the boss alike, so you can break line of sight and body-block.
- **Telegraphed attacks** — cones, circles, and lines wind up before they land, so danger is readable and dodgeable — and now your own abilities flash their effect area too, including the Fireball's blast.
- **Buff / debuff readouts** — a coloured aura around any creature, plus compact **glyph + countdown chips** next to every hero's name (on the field) and on the left-hand party frames, so you can read at a glance what's affecting whom and for how long.
- **Speech balloons** — a bubble pops over whoever is casting so the band can read what everyone (and the boss) is doing.
- **Aggro / threat** — enemies pick targets based on accumulated threat; tanks hold aggro, healers and DPS manage theirs.
- **Downed / revive** — fall to zero HP and you go down with a bleedout timer; a teammate can hold revive to bring you back.
- **Shared pause** — any player can freeze the fight for everyone; the pause menu (with the map legend) shows for all, and resuming runs a 3-2-1 countdown so nobody is caught off guard. End a run early or retry a wipe without going back to the lobby.
- **Remappable controls** — rebind every keyboard key and gamepad button for movement and abilities from the Controls screen; binding a key already in use clears its old owner, and the HUD labels follow your bindings and the device you're using. Optional hold-to-auto-fire repeats an ability while its button is held.
- **Player-count scaling** — boss health and pressure scale to the size of your warband (bots included).
- **Gamepad + keyboard/mouse** — play with either; the last-used device wins seamlessly. Controller **type is auto-detected** (PlayStation ✕◯▢△ vs. Xbox/Nintendo A B X Y) and the glyph set is **customisable** from Controls; the HUD button labels follow it.
- **Fully controller-navigable menus** — every screen (main menu, host setup, join, lobby, the between-boss upgrade phase, and the pause menu) can be driven entirely with a gamepad: d-pad/stick to move focus, A/✕ to confirm, B/◯ to go back.
- **Volume control** — a real master-volume slider (not just mute), remembered between sessions along with your hero name.
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

The last-used device wins — switch between gamepad and keyboard/mouse at any time and control follows whatever you touched last. The table above lists the **defaults**; every action is remappable from **Controls** (on the main menu or the in-fight pause menu), and the HUD button labels update to match. Press **Esc** (keyboard) or **Options/Start** (gamepad) during a fight to open the pause menu.

## Classes

- **Knight** — tank. Soaks damage and holds the boss's aggro.
- **Ranger** — mobile ranged DPS. Consistent damage from a safe distance.
- **Mage** — burst DPS and control. High spike damage plus crowd control.
- **Cleric** — healer. Keeps the warband standing and helps revives.
- **Barbarian** — melee bruiser. Rage, a leaping slam, and a whirlwind.
- **Rogue** — melee burst + evasion. Backstab, a shadow-step blink, and a poison cloud.
- **Paladin** — off-tank/support hybrid. Consecration, Lay on Hands, and a Divine Shield.
- **Druid** — nature caster/control. Entangling roots, a healing Regrowth, and a slowing Cyclone.

## Bosses

33 bosses across three difficulty tiers (`src/engine/monsters.ts`):

- **Easy** — Goblin Warlord, Broodmother, Bandit Captain, Kobold Firebrand, Dire Wolf Alpha, Animated Armor, Harpy Matriarch, Gnoll Packlord, Mud Golem, Zombie Hulk.
- **Medium** — Ancient Dragon, Forest Troll, Orc Warchief, Manticore, Wraith, Basilisk, Owlbear, Cyclops, Gargoyle Sentinel, Ettin, Will-o'-Wisp, Minotaur.
- **Hard** — Lich, Beholder, Vampire Lord, Frost Giant, Mind Flayer, Death Knight, Demon Lord, Ancient Treant, Kraken, Archlich, Archfae Queen.

A run assembles five of them in climbing difficulty; Endless cycles re-roll the run harder and give every boss an elemental type.

## Tuning

All balance numbers live in plain data files and are easy to tweak:

- `src/engine/constants.ts` — global simulation constants (tick rate, arena size, radii, revive/bleedout timings, run length, endless + score coefficients, projectile range cap, colors).
- `src/engine/classes.ts` — per-class stats and ability definitions.
- `src/engine/charUpgrades.ts` — per-class character upgrades earned between bosses.
- `src/engine/monsters.ts` — per-boss stats, difficulty tiers, run assembly and endless type modifiers.

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
