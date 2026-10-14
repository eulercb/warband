/** Production class selection and real keyboard/touch casting for martial kits. */
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless: true,
});
let currentPage;
try {
  for (const mobile of [false, true])
    for (const classId of ['knight', 'ranger', 'barbarian', 'monk']) {
      const context = await browser.newContext({
        viewport: mobile ? { width: 320, height: 568 } : { width: 1280, height: 800 },
        isMobile: mobile,
        hasTouch: mobile,
      });
      const page = await context.newPage();
      currentPage = page;
      page.setDefaultTimeout(20000);
      const errors = [];
      page.on('pageerror', (e) => {
        if (!/tracker|websocket|webrtc|\bice\b|trystero|net::ERR/i.test(e.message))
          errors.push(e.message);
      });
      const click = async (locator) => {
        await locator.scrollIntoViewIfNeeded();
        if (mobile) await locator.tap();
        else await locator.click();
      };
      const button = (name) => page.getByRole('button', { name, exact: true });
      await page.goto(process.env.SMOKE_URL || 'http://localhost:4173/');
      if (mobile) await click(button('Menu'));
      await click(button('Hero: Knight'));
      await click(page.locator(`.wb-codex-card[data-cls="${classId}"]`));
      if (mobile) await click(button('Menu'));
      await click(button('Host Game'));
      await click(button('List view'));
      await click(button('Create Room'));
      if (mobile) await click(button('Lobby menu'));
      await click(button('Start Fight'));
      const cases = {
        knight: { name: 'Shield Wall', slot: 'a2', key: 'KeyE', text: /guard 4s/ },
        ranger: { name: 'Multishot', slot: 'a1', key: 'KeyQ', text: /pierce 1 additional/ },
        barbarian: { name: 'Rage', slot: 'a1', key: 'KeyQ', text: /3 momentum/ },
        monk: { name: 'Step of the Wind', slot: 'a2', key: 'KeyE', text: /Flow for 4s/ },
      };
      const test = cases[classId];
      const tile = page.locator(`.hud-ability[aria-label^="${test.name}"]`);
      await tile.waitFor({ state: mobile ? 'attached' : 'visible' });
      if (mobile) await page.locator(`.wb-touch-btn-${test.slot}`).waitFor();
      assert.match(await tile.getAttribute('aria-label'), test.text);
      const touch = mobile ? await context.newCDPSession(page) : null;
      const hold = async (slot, key, until) => {
        if (mobile) {
          const b = await page.locator(`.wb-touch-btn-${slot}`).boundingBox();
          assert.ok(b);
          await touch.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: [{ id: 1, x: b.x + b.width / 2, y: b.y + b.height / 2 }],
          });
        } else await page.keyboard.down(key);
        try {
          await until();
        } finally {
          if (mobile)
            await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          else await page.keyboard.up(key);
        }
      };
      await hold(test.slot, test.key, () =>
        mobile
          ? page.locator(`.wb-touch-btn-${test.slot} .wb-touch-btn-label.cooling`).waitFor()
          : page.waitForFunction((n) => {
              const el = document.querySelector(`.hud-ability[aria-label^="${n}"]`);
              return el && !el.classList.contains('ready');
            }, test.name),
      );
      const self = page.locator('.hud-selfhp');
      if (classId === 'knight') await self.getByTitle(/Guard: taking a nonlethal hit/).waitFor();
      if (classId === 'monk') {
        const flow = self.getByTitle(/Flow: next marked strike/);
        await flow.waitFor();
        await hold('a3', 'KeyR', () => flow.waitFor({ state: 'hidden' }));
      }
      if (mobile) await click(button('Pause'));
      else await page.keyboard.press('Escape');
      await page.locator('.wb-pause-skills').waitFor();
      assert.match(await page.locator('.wb-pause-skills').textContent(), test.text);
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${mobile ? 'mobile 320×568' : 'desktop'} ${classId}: martial descriptions, real casting, pause${classId === 'monk' ? ', Flow preparation/consumption' : ''}`,
      );
      await context.close();
    }
} catch (error) {
  if (currentPage && !currentPage.isClosed())
    await currentPage
      .screenshot({ path: `${process.env.SHOT_DIR || tmpdir()}/smoke-martial-failure.png` })
      .catch(() => {});
  throw error;
} finally {
  await browser.close();
}
