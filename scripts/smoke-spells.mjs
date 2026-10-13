/** Production class selection and real keyboard/touch casting for the spell loops. */
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
    for (const classId of ['mage', 'sorcerer']) {
      const context = await browser.newContext({
        viewport: mobile ? { width: 320, height: 568 } : { width: 1280, height: 800 },
        isMobile: mobile,
        hasTouch: mobile,
      });
      const page = await context.newPage();
      currentPage = page;
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
      const name = classId === 'mage' ? 'Fireball' : 'Meteor';
      const tile = page.locator(`.hud-ability[aria-label^="${name}"]`);
      await tile.waitFor({ state: mobile ? 'attached' : 'visible' });
      if (mobile) await page.locator('.wb-touch-btn-a1').waitFor();
      assert.match(
        await tile.getAttribute('aria-label'),
        classId === 'mage' ? /slowed\/rooted\/stunned/ : /surge/,
      );
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
      const surge = page
        .locator('.hud-selfhp')
        .getByTitle(/Spell surge: next heavy spell empowered/);
      if (classId === 'sorcerer') await hold('a2', 'KeyE', () => surge.waitFor());
      await hold('a1', 'KeyQ', () =>
        mobile
          ? page.locator('.wb-touch-btn-a1 .wb-touch-btn-label.cooling').waitFor()
          : page.waitForFunction((n) => {
              const el = document.querySelector(`.hud-ability[aria-label^="${n}"]`);
              return el && !el.classList.contains('ready');
            }, name),
      );
      if (classId === 'sorcerer') await surge.waitFor({ state: 'hidden' });
      if (mobile) await click(button('Pause'));
      else await page.keyboard.press('Escape');
      await page.locator('.wb-pause-skills').waitFor();
      assert.ok(
        (await page.locator('.wb-pause-skills').textContent()).includes(
          classId === 'mage' ? 'slowed/rooted/stunned' : 'half wind-up',
        ),
      );
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${mobile ? 'mobile 320×568' : 'desktop'} ${classId}: descriptions, real casting${classId === 'sorcerer' ? ', surge preparation/consumption' : ''}, pause`,
      );
      await context.close();
    }
} catch (error) {
  if (currentPage && !currentPage.isClosed())
    await currentPage
      .screenshot({ path: `${process.env.SHOT_DIR || tmpdir()}/smoke-spells-failure.png` })
      .catch(() => {});
  throw error;
} finally {
  await browser.close();
}
