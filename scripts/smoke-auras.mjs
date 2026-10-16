/** Production moving aura casting and desktop/touch descriptions. */
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
    for (const subclass of [null, { name: 'Sacred Weapon', text: /pursuit aura/ }]) {
      const classId = 'paladin';
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
      if (subclass) {
        await click(page.locator('.wb-sf-loadout-toggle'));
        await click(page.getByRole('button', { name: new RegExp(subclass.name) }));
      }
      await click(button('Start Fight'));
      const test = subclass
        ? { ...subclass, slot: 'sub1', key: 'KeyZ' }
        : { name: 'Divine Shield', slot: 'a3', key: 'KeyR', text: /bulwark aura/ };
      const touchButton = (slot) =>
        slot === 'sub1'
          ? page.locator('.wb-touch-btn-sub').last()
          : page.locator(`.wb-touch-btn-${slot}`);
      const tile = page.locator(`.hud-ability[aria-label*="${test.name} —"]`);
      await tile.waitFor({ state: mobile ? 'attached' : 'visible' });
      if (mobile) await touchButton(test.slot).waitFor();
      assert.match(await tile.getAttribute('aria-label'), test.text);
      const touch = mobile ? await context.newCDPSession(page) : null;
      const hold = async (slot, key, until) => {
        if (mobile) {
          const b = await touchButton(slot).boundingBox();
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
          ? touchButton(test.slot).locator('.wb-touch-btn-label.cooling').waitFor()
          : page.waitForFunction((n) => {
              const el = document.querySelector(`.hud-ability[aria-label*="${n} —"]`);
              return el && !el.classList.contains('ready');
            }, test.name),
      );
      const self = page.locator('.hud-selfhp');
      await self.getByTitle(subclass ? /Pursuit: next connecting/ : /Bulwark aura:/).waitFor();
      if (mobile) assert.ok(await page.getByRole('group', { name: 'Touch controls' }).isVisible());
      if (mobile) await click(button('Pause'));
      else await page.keyboard.press('Escape');
      await page.locator('.wb-pause-skills').waitFor();
      assert.match(await page.locator('.wb-pause-skills').textContent(), test.text);
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${mobile ? 'mobile 320×568' : 'desktop'} ${test.name}: real cast, aura readiness, pause description`,
      );
      await context.close();
    }
} catch (error) {
  if (currentPage && !currentPage.isClosed())
    await currentPage
      .screenshot({ path: `${process.env.SHOT_DIR || tmpdir()}/smoke-auras-failure.png` })
      .catch(() => {});
  throw error;
} finally {
  await browser.close();
}
