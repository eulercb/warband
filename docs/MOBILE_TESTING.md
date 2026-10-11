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
