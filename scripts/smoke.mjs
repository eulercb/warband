/**
 * Headless end-to-end smoke test: builds nothing itself — run `npm run build`
 * and serve `dist/` (e.g. `npm run preview`) first, then `npm run smoke`.
 *
 * It loads the app and drives a SOLO host fight (the host runs the authoritative
 * simulation in-browser, so no peer is needed) through menu → host setup →
 * lobby → live game, asserting each step renders with no app-level JS errors.
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

await step('load menu', async () => {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 20000 });
  await page.getByText('Warband', { exact: false }).first().waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: /host game/i }).waitFor({ timeout: 10000 });
  await page.screenshot({ path: `${SHOT_DIR}/smoke-1-menu.png` });
});

await step('host setup', async () => {
  await page.getByRole('button', { name: /host game/i }).click();
  await page.getByRole('button', { name: /create room/i }).waitFor({ timeout: 10000 });
  await page.screenshot({ path: `${SHOT_DIR}/smoke-2-setup.png` });
});

await step('create room -> lobby', async () => {
  await page.getByRole('button', { name: /create room/i }).click();
  await page.getByRole('button', { name: /start fight/i }).waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${SHOT_DIR}/smoke-3-lobby.png` });
});

await step('start fight -> game renders', async () => {
  await page.getByRole('button', { name: /start fight/i }).click();
  // wait for the pixi canvas to mount
  await page.waitForSelector('canvas', { timeout: 15000 });
  // let a few seconds of simulation run
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${SHOT_DIR}/smoke-4-game.png` });
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
