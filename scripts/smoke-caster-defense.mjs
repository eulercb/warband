/** Production caster-defense loadouts, real casting, recipient states and touch controls. */
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
    for (const test of [
      { classId: 'mage', name: 'Arcane Shield', text: /absorption.*yourself/, bubble: true },
      { classId: 'mage', name: 'Arcane Ward', text: /absorption.*yourself/, bubble: true },
      { classId: 'sorcerer', name: 'Draconic Scales', text: /surge \+20% dmg/, bubble: true },
      { classId: 'sorcerer', name: 'Dragon Wings', text: /fly 7s/, badge: /Airborne/ },
      {
        classId: 'sorcerer',
        name: 'Wild Ward',
        text: /prepare spell surge/,
        badge: /Spell surge:/,
      },
    ]) {
      const classId = test.classId;
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
      {
        await click(page.locator('.wb-sf-loadout-toggle'));
        await click(page.getByRole('button', { name: new RegExp(test.name) }));
      }
      await click(button('Start Fight'));
      const touchButton = () => page.locator('.wb-touch-btn-sub').last();
      const tile = page.locator(`.hud-ability[aria-label*="${test.name} —"]`);
      await tile.waitFor({ state: mobile ? 'attached' : 'visible' });
      if (mobile) await touchButton().waitFor();
      assert.match(await tile.getAttribute('aria-label'), test.text);
      const touch = mobile ? await context.newCDPSession(page) : null;
      const hold = async (key, until) => {
        if (mobile) {
          const b = await touchButton().boundingBox();
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
      await hold('KeyZ', () =>
        mobile
          ? touchButton().locator('.wb-touch-btn-label.cooling').waitFor()
          : page.waitForFunction((n) => {
              const el = document.querySelector(`.hud-ability[aria-label*="${n} —"]`);
              return el && !el.classList.contains('ready');
            }, test.name),
      );
      const self = page.locator('.hud-selfhp');
      if (test.bubble) {
        const meter = self.getByRole('meter', { name: 'Absorption' });
        await meter.waitFor();
        const amount = Number(await meter.getAttribute('aria-valuenow'));
        assert.ok(amount > 0 && amount <= Number(await meter.getAttribute('aria-valuemax')));
      } else await self.getByTitle(test.badge).waitFor();
      if (mobile) assert.ok(await page.getByRole('group', { name: 'Touch controls' }).isVisible());
      if (process.env.SHOT_DIR)
        await page.screenshot({
          path: `${process.env.SHOT_DIR}/caster-${test.name}-${mobile ? 'touch' : 'desktop'}.png`,
        });
      if (mobile) await click(button('Pause'));
      else await page.keyboard.press('Escape');
      await page.locator('.wb-pause-skills').waitFor();
      assert.match(await page.locator('.wb-pause-skills').textContent(), test.text);
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${mobile ? 'mobile 320×568' : 'desktop'} ${test.name}: real cast, defense state, pause description`,
      );
      await context.close();
    }
} catch (error) {
  if (currentPage && !currentPage.isClosed())
    await currentPage
      .screenshot({ path: `${process.env.SHOT_DIR || tmpdir()}/smoke-caster-defense-failure.png` })
      .catch(() => {});
  throw error;
} finally {
  await browser.close();
}
