/** Production-bundle mobile regression check. Run npm run build, npm run preview,
 * then CHROMIUM_PATH=/usr/bin/chromium npm run smoke:mobile.
 * Uses real Chromium touch events; external P2P connectivity is outside this test.
 */
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless: true,
});
const url = process.env.SMOKE_URL || 'http://localhost:4173/';
const externalError = /tracker|websocket|webrtc|ice|trystero|net::ERR/i;
let currentPage;
try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    currentPage = page;
    const errors = [];
    page.on('pageerror', (error) => {
      if (!externalError.test(error.message)) errors.push(error.message);
    });
    const controls = page.getByRole('group', { name: 'Touch controls' });
    const click = (name) => page.getByRole('button', { name, exact: true }).tap();
    const touch = await context.newCDPSession(page);
    const stick = async (dx, dy, duration) => {
      const box = await page.locator('.wb-touch-stick-left').boundingBox();
      assert.ok(box);
      const point = { x: box.x + box.width / 2 + dx, y: box.y + box.height / 2 + dy };
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await page.waitForTimeout(duration);
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    const checkGeometry = async () => {
      await controls.waitFor();
      const screen = page.viewportSize();
      const sizes = await page.locator('.wb-touch-stick,.wb-touch-btn').evaluateAll((elements) =>
        elements.map((el) => {
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return { x: r.x, y: r.y, w: r.width, h: r.height, hit: el === hit || el.contains(hit) };
        }),
      );
      for (const r of sizes) {
        assert.ok(
          r.x >= 0 && r.y >= 0 && r.x + r.w <= screen.width + 1 && r.y + r.h <= screen.height + 1,
          JSON.stringify(r),
        );
        assert.ok(r.w >= 44 && r.h >= 44 && r.hit, `Touch target blocked: ${JSON.stringify(r)}`);
      }
    };

    await page.goto(url);
    await checkGeometry();
    await click('Menu');
    assert.equal(await controls.count(), 0);
    await click('Hero: Knight');
    await page.getByRole('dialog', { name: 'Choose your hero' }).waitFor();
    await click('Back');
    await checkGeometry();
    await click('Menu');
    await click('Controls');
    await page.getByRole('dialog', { name: 'Controls' }).waitFor();
    await page.keyboard.press('Escape');
    await checkGeometry();
    await click('Menu');
    await click('Host Game');
    await checkGeometry();
    assert.equal(await page.locator('.wb-war-panel').count(), 0);
    await click('List view');
    assert.equal(await controls.count(), 0);
    // Exercise the tall fallback form, including the bottom action, on a small phone.
    const create = page.getByRole('button', { name: 'Create Room', exact: true });
    await create.scrollIntoViewIfNeeded();
    assert.ok(await create.isVisible());
    await click('Close list');
    await checkGeometry();
    await click('Camp options');
    await page.getByLabel('Your display name').fill('Mobile smoke');
    await click('Close menu');
    await checkGeometry();
    // A real joystick gesture moves the hero into the host portal, then dwelling
    // raises the banner. This fails if the overlay does not reach the simulation.
    await stick(0, 48, 400);
    await page.getByRole('button', { name: 'Lobby menu', exact: true }).waitFor({ timeout: 15000 });
    await checkGeometry();
    assert.equal(await page.locator('.wb-lobby-panel').count(), 0);
    await click('Lobby menu');
    assert.equal(await controls.count(), 0);
    await click('Ready up');
    await click('Close menu');
    await checkGeometry();
    await click('Lobby menu');
    await click('Start Fight');
    await checkGeometry();
    // Multi-touch: move while holding a combat button, then cancel both fingers.
    const left = await page.locator('.wb-touch-stick-left').boundingBox();
    const basic = await page.locator('.wb-touch-btn-basic').boundingBox();
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { id: 1, x: left.x + left.width / 2 + 30, y: left.y + left.height / 2 },
        { id: 2, x: basic.x + basic.width / 2, y: basic.y + basic.height / 2 },
      ],
    });
    assert.ok(
      await page.locator('.wb-touch-btn-basic').evaluate((el) => el.classList.contains('held')),
    );
    await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    assert.equal(await page.locator('.wb-touch-btn.held').count(), 0);
    assert.equal(
      await page
        .locator('.wb-touch-stick-left .wb-touch-knob')
        .evaluate((el) => el.style.transform),
      'translate(0px, 0px)',
    );
    await page.getByRole('button', { name: /pause/i }).tap();
    await page.getByRole('dialog', { name: 'Paused' }).waitFor();
    assert.equal(await controls.count(), 0);
    await click('Resume');
    await checkGeometry();
    if (viewport.width === 390) {
      await page.setViewportSize({ width: 844, height: 390 });
      await checkGeometry();
      await page.setViewportSize(viewport);
      await checkGeometry();
    }
    assert.deepEqual(errors, []);
    console.log(
      `PASS mobile ${viewport.width}×${viewport.height}: menus, walking host portal, lobby, fight, multi-touch, pause/resume`,
    );
    await context.close();
  }
} catch (error) {
  await currentPage
    ?.screenshot({ path: `${process.env.SHOT_DIR || tmpdir()}/smoke-mobile-failure.png` })
    .catch(() => {});
  throw error;
} finally {
  await browser.close();
}
