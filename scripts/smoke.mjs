/**
 * Headless end-to-end smoke test: builds nothing itself — run `npm run build`
 * and serve `dist/` (e.g. `npm run preview`) first, then `npm run smoke`.
 *
 * Coverage (all against the real production bundle in Chromium, capturing any
 * app-level JS error the whole time):
 *   1. Menu           — the walkable playground mounts its Pixi canvas.
 *   2. Controls        — the rebinding overlay opens and closes (Escape).
 *   3. Join screen     — the code form renders, validates, and returns.
 *   4. Change Hero     — the class picker opens and closes.
 *   5. Host a fight    — menu -> host setup -> lobby -> live game (the host runs
 *                        the authoritative sim in-browser, so no peer is needed),
 *                        asserting the canvas + boss HUD + ability icons render.
 *   6. In-fight input  — keyboard move/ability input doesn't break the sim.
 *   7. Pause / resume  — Escape opens the shared pause menu; Resume closes it.
 *
 * Trystero tracker/WebRTC failures are expected off-network and are ignored.
 *
 * Requires `playwright-core` (a devDependency) and a Chromium binary. Point at
 * one via CHROMIUM_PATH; SMOKE_URL and SHOT_DIR are also overridable.
 */
import { chromium } from 'playwright-core';
import { tmpdir } from 'node:os';

const URL = process.env.SMOKE_URL || 'http://localhost:4173/';
const SHOT_DIR = process.env.SHOT_DIR || tmpdir();
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

// Trystero tracker/WebRTC failures are expected in this sandbox — ignore them.
const IGNORE = [
  /tracker/i,
  /websocket/i,
  /webrtc/i,
  /ice/i,
  /trystero/i,
  /Failed to load resource/i,
  /net::ERR/i,
  /wss?:\/\//i,
  /manifest/i,
  /service ?worker/i,
  /sw\.js/i,
  /favicon/i,
];
const ignored = (t) => IGNORE.some((re) => re.test(t));

const appErrors = [];

const browser = await chromium.launch({ executablePath: EXEC, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

page.on('console', (m) => {
  if (m.type() === 'error' && !ignored(m.text())) appErrors.push(`console: ${m.text()}`);
});
page.on('pageerror', (e) => {
  if (!ignored(String(e))) appErrors.push(`pageerror: ${e.message || e}`);
});

const step = async (name, fn) => {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    console.log(`✗ ${name}: ${e.message}`);
    appErrors.push(`step "${name}": ${e.message}`);
  }
};

// The corner-panel "Host Game" button is the reliable "we're on the menu" anchor.
const hostBtn = () => page.getByRole('button', { name: /host game/i });
const waitForMenu = () => hostBtn().waitFor({ timeout: 10000 });

await step('load menu', async () => {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 20000 });
  await page.getByText('Warband', { exact: false }).first().waitFor({ timeout: 10000 });
  await waitForMenu();
  await page.screenshot({ path: `${SHOT_DIR}/smoke-1-menu.png` });
});

await step('menu playground renders its canvas', async () => {
  // The menu is a walkable practice arena — a real Pixi canvas mounts on load.
  await page.waitForSelector('canvas', { timeout: 10000 });
  const size = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return c ? { w: c.width, h: c.height } : null;
  });
  if (!size || size.w < 10 || size.h < 10)
    throw new Error(`menu canvas missing/too small: ${JSON.stringify(size)}`);
});

await step('controls overlay opens and closes', async () => {
  await page.getByRole('button', { name: /^controls$/i }).click();
  await page.getByRole('dialog', { name: /controls/i }).waitFor({ timeout: 10000 });
  await page.screenshot({ path: `${SHOT_DIR}/smoke-2-controls.png` });
  // Escape closes the overlay and returns to the menu.
  await page.keyboard.press('Escape');
  await waitForMenu();
});

await step('join screen validates and returns', async () => {
  await page.getByRole('button', { name: /join game/i }).click();
  const codeInput = page.getByRole('textbox', { name: /room code/i });
  await codeInput.waitFor({ timeout: 10000 });
  // A short code keeps Join disabled; a 4+ char code enables it.
  await codeInput.fill('ABCD');
  const joinBtn = page.getByRole('button', { name: /^join/i });
  if (await joinBtn.isDisabled()) throw new Error('Join stayed disabled for a valid code');
  await page.getByRole('button', { name: /back/i }).click();
  await waitForMenu();
});

await step('change-hero picker opens and closes', async () => {
  // The picker is opened from the "Hero: <ClassName>" button in the menu panel.
  await page.getByRole('button', { name: /^hero:/i }).click();
  await page.getByRole('dialog', { name: /choose your hero/i }).waitFor({ timeout: 10000 });
  await page.screenshot({ path: `${SHOT_DIR}/smoke-3-hero.png` });
  await page.getByRole('button', { name: /back/i }).click();
  await waitForMenu();
});

// Reset to a clean menu so the critical host path runs regardless of the
// exploration steps above (each is caught independently).
await step('reset to menu', async () => {
  await page.reload({ waitUntil: 'networkidle', timeout: 20000 });
  await waitForMenu();
});

await step('host setup (walkable war room + list-view form)', async () => {
  await hostBtn().click();
  // Hosting now opens the walkable WAR ROOM; assert it mounted, then drive the
  // deterministic classic form kept one click away under "List view".
  await page.getByText(/choose your fight/i).waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: /list view/i }).click();
  await page.getByRole('button', { name: /create room/i }).waitFor({ timeout: 10000 });
  await page.screenshot({ path: `${SHOT_DIR}/smoke-4-setup.png` });
});

await step('create room -> muster hall lobby', async () => {
  await page.getByRole('button', { name: /create room/i }).click();
  // The lobby is now the walkable MUSTER HALL; its panel still carries Start Fight.
  await page.getByRole('button', { name: /start fight/i }).waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${SHOT_DIR}/smoke-5-lobby.png` });
});

await step('start fight -> game renders', async () => {
  await page.getByRole('button', { name: /start fight/i }).click();
  // wait for the pixi canvas to mount
  await page.waitForSelector('canvas', { timeout: 15000 });
  // let a few seconds of simulation run
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${SHOT_DIR}/smoke-6-game.png` });
  // assert a canvas exists and has real size
  const size = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return c ? { w: c.width, h: c.height } : null;
  });
  if (!size || size.w < 10 || size.h < 10)
    throw new Error(`canvas missing/too small: ${JSON.stringify(size)}`);
  // assert the in-game HUD is present (boss bar + ability icons)
  const hud = await page.evaluate(() => ({
    bossBar: !!document.querySelector('.hud-bossbar'),
    abilities: document.querySelectorAll('.hud-ability').length,
    root: !!document.querySelector('.game-root'),
    bossName: /dragon|troll|lich/i.test(document.body.innerText),
  }));
  if (!hud.root) throw new Error('game-root not mounted');
  if (!hud.bossBar) throw new Error('boss HUD bar not found');
  if (hud.abilities < 4) throw new Error(`expected 4 ability icons, saw ${hud.abilities}`);
  if (!hud.bossName) throw new Error('boss name not visible');
});

await step('in-fight input drives the hero without breaking the sim', async () => {
  // Hold each movement key briefly, then fire the basic attack + an ability.
  for (const key of ['KeyD', 'KeyS', 'KeyA', 'KeyW']) {
    await page.keyboard.down(key);
    await page.waitForTimeout(150);
    await page.keyboard.up(key);
  }
  await page.keyboard.press('Space'); // basic attack
  await page.keyboard.press('KeyQ'); // ability 1
  await page.waitForTimeout(800);
  // The sim must still be alive: canvas intact, game root mounted, no JS error.
  const ok = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return !!c && c.width > 10 && !!document.querySelector('.game-root');
  });
  if (!ok) throw new Error('game did not survive keyboard input');
});

await step('pause menu opens and resumes', async () => {
  await page.keyboard.press('Escape');
  const resume = page.getByRole('button', { name: /resume/i });
  await resume.waitFor({ timeout: 10000 });
  await page.screenshot({ path: `${SHOT_DIR}/smoke-7-pause.png` });
  await resume.click();
  // Resuming dismisses the pause menu (a short countdown then control returns).
  await resume.waitFor({ state: 'detached', timeout: 10000 });
});

await browser.close();

console.log('\n--- App-level errors ---');
if (appErrors.length === 0) {
  console.log('NONE 🎉');
  console.log('SMOKE: PASS');
  process.exit(0);
} else {
  appErrors.forEach((e) => console.log('  •', e));
  console.log('SMOKE: FAIL');
  process.exit(1);
}
