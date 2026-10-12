# Mobile menus and touch controls

On devices whose primary pointer is coarse (a phone or tablet touchscreen), the
camp and lobby panels start collapsed. **Menu**, **Camp options**, and **Lobby
menu** reopen the full menus. The host room's **List view** and reward room's
**List view** remain available. Desktop panels keep their existing layout.

Opening these menus suspends character movement and hides the touch overlay;
closing them restores it. The host room and lobby use a movement-only joystick,
while the camp, fight, and reward room keep the combat controls. Interrupted
pointer capture, a hidden browser tab, or a window losing focus clears held input.

## Automated validation

From the checkout:

```sh
npm run build
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

With preview running, in another terminal:

```sh
CHROMIUM_PATH=/usr/bin/chromium npm run smoke
CHROMIUM_PATH=/usr/bin/chromium npm run smoke:mobile
npm run test:coverage -- --maxWorkers=3
npm run lint
npm run format:check
```

Set `CHROMIUM_PATH` to your Chromium executable, or omit it for the mobile check
when Playwright's Chromium is installed. `SMOKE_URL` overrides the preview URL.
The mobile check covers 390×844, 320×568, and 844×390 touch viewports, scrolling
the host fallback, walking into the host portal with a real touch gesture,
opening/closing the lobby menu, multi-touch combat input, pause/resume, and
rotation. CI runs it alongside the existing desktop smoke test. A failure
screenshot is saved to `SHOT_DIR`, defaulting to the system temporary directory.
These checks do not validate cross-network multiplayer connectivity.

## Final check on Android

Chromium emulation is useful regression coverage, but it does not reproduce
Brave's Android browser chrome, system keyboard, or all OS gesture handling.
Before merging, try the changed build on a real phone:

1. In portrait, walk around camp, then open Menu, Change Hero, and Controls.
   Close each and check that movement is available again.
2. Enter the host room. Walk to choices, use List view, scroll to Create Room,
   then close it and host by walking into the banner. Also edit your name under
   Camp options while the phone keyboard is open.
3. In the lobby, ready up and start through both the walking stations and the
   fallback menu. Check room sharing, bot controls, and Leave in Lobby menu.
4. In a fight, move and hold an ability with separate fingers. Pause/resume,
   rotate the phone, switch away from the browser, and return. Released fingers
   must not leave the character moving or attacking.
5. Between bosses, choose boons using relics and List view, then descend. Confirm
   that closing the list restores the touch controls.

A pull request lets you inspect the patch and CI results without changing the
published game. Merging into `main` triggers the repository's Pages deployment;
keep the PR unmerged until desktop checks and the phone check are satisfactory.

## Reward-room clarity

Phones show numbered gold **G**, purple **C**, and teal **S** markers instead of
all offer names at once. Approach an option for its full name, description,
price/status, and dwell progress in a single scrollable panel. The blue **↓**
marks the exit; its descent prompt appears when you approach or are descending.
A compact G/C/coin readout replaces the mobile room banner; the list view keeps
next-boss information and the run seed.

On the first reward-room visit in a browser tab, a short guide explains each
category in turn. Next tip and Skip guide let you control it. Touching a gameplay
control dismisses it immediately and restores nearby-option information. Room
guide replays it at any time; it never picks an upgrade or spends coins. Desktop
captions and the list view remain unchanged.

For the focused browser regression, start the development server, then run:

```sh
CHROMIUM_PATH=/usr/bin/chromium npm run smoke:rewards
```

Unlike the production smoke, this check uses Vite's development server on port 5173. It injects a between-boss state fixture, then exercises the real scene,
renderer, and touch controls to buy a potion, reroll offers, claim both boon
categories, use the list fallback, and descend. It also checks compact captions
at three phone sizes and full captions on desktop. CI runs this check too. A
failure screenshot is saved under SHOT_DIR (the system temporary directory by
default). This does not replace playing a complete run or testing networking.

Example layouts captured from development fixtures:

- [First-visit guide on a small phone](images/rewards-mobile-guide.png)
- [Compact markers and a nearby shop description](images/rewards-mobile-room.png)

## Camp, host setup, and lobby guides

Camp, host setup, lobby, and reward rooms offer first-visit guides on **desktop
and mobile**. Each shows one tip at a time, fades between tips, and can be
advanced or skipped. Moving with the keyboard/gamepad or touching gameplay
controls dismisses the guide immediately. **Guide** replays it in camp, host
setup, and the lobby; **Room guide** replays the reward guide. Guides remember
completion per room in the current browser tab. They yield to menus, important
errors, and contextual descriptions; they do not pause a shared game or make
selections for the player. Reduced-motion preferences disable the fading.

Mobile floor captions use H markers for heroes, B markers for bosses, Bot markers
for adding bots, and minus markers for removing bots. Action/tier/modifier names
stay short (Host, Join, Ready, Start, Single, Run, HC, Forge, Draft, Daily). Approach
an option for its full name, class role/boss lore, availability, and selection
progress. Host selection and lobby status remain visible in a compact row. Full
settings, invitations, and bot controls remain available in the menus. Pregame
scenes hide their inactive pause icon; fight and reward-room pause controls stay
available. Desktop
floor captions retain their full names.

With a freshly started Vite development server (restart after source edits), run:

```sh
CHROMIUM_PATH=/usr/bin/chromium npm run smoke:rooms
```

This drives the real camp → host setup → lobby → fight flow at three phone sizes
and one desktop size, checking first-visit/replay guides, floor captions, nearby
information, unobstructed touch controls, menus, bot addition, readiness, and
starting a fight. ROOM_SMOKE_URL overrides the development URL. Run interactive
browser checks sequentially; the reward check uses gentle joystick movement and
waits for actual purchases/claims and renderer refreshes. CI runs both room
checks alongside the production desktop/mobile smoke.

Before merging, check these rooms on Android/Brave and a desktop browser with a
fresh tab. Try skipping/replaying tips, walking near several choices, using both
the walking and menu paths, changing run modifiers, adding/removing bots, and
readying/starting. Confirm the reward tutorial works on desktop too. Join/forms,
results, and combat keep their existing UI; camp guidance explains combat input
without interrupting a live multiplayer fight.

[Desktop camp guide](images/camp-guide-desktop.png) ·
[Mobile host choices and nearby information](images/host-choices-mobile.png)
