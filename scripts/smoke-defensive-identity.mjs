/** B2 defensive identities through production loadouts, keyboard and touch casting. */
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright-core';
const tests = [
  {
    classId: 'knight',
    name: 'Shield Wall',
    slot: 'a2',
    key: 'KeyE',
    text: /block 2 frontal damage hits/,
    badge: /Frontal guard:/,
  },
  {
    classId: 'knight',
    name: 'Second Wind',
    text: /heal \d+ self/,
    badge: /Haste|Hastened|Swift/,
    hurt: true,
  },
  {
    classId: 'knight',
    name: 'Rally',
    text: /recovery grove/,
    // A real incoming hit can consume Guard before Playwright reads it, readying a Counter.
    badge: /Guard:|Counter ready:/,
    hurt: true,
  },
  {
    classId: 'ranger',
    name: 'Stand as One',
    text: /allies in the field gain 20% speed/,
    zone: true,
  },
  { classId: 'barbarian', name: 'Bear Spirit', text: /steadfast 6s/, badge: /Steadfast:/ },
  {
    classId: 'barbarian',
    name: 'Spirit Mend',
    text: /heal \d+ self/,
    badge: /Steadfast:/,
    hurt: true,
  },
  {
    classId: 'paladin',
    name: 'Divine Shield',
    slot: 'a3',
    key: 'KeyR',
    text: /[\d.]+s damage immunity/,
    badge: /Invulnerable/,
  },
  { classId: 'paladin', name: 'Aura of Protection', text: /40 absorption/, bubble: true },
].filter((test) => !process.env.SMOKE_DEFENSE_NAME || test.name === process.env.SMOKE_DEFENSE_NAME);
assert.ok(tests.length, 'Unknown SMOKE_DEFENSE_NAME');
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless: true,
});
let currentPage;
try {
  for (const mobile of [false, true])
    for (const test of tests) {
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
      await click(
        page.getByRole('group', { name: 'Change boss' }).getByRole('button', {
          name: 'Kobold Firebrand',
          exact: true,
        }),
      );
      if (!test.slot) {
        await click(page.locator('.wb-sf-loadout-toggle'));
        await click(
          page.getByRole('group', { name: 'Test loadout' }).getByRole('button', {
            name: test.name === 'Second Wind' ? '💚 Second Wind' : new RegExp(test.name),
            exact: test.name === 'Second Wind',
          }),
        );
      }
      await click(button('Start Fight'));
      const touchButton = () =>
        test.slot
          ? page.locator(`.wb-touch-btn-${test.slot}`)
          : page.locator('.wb-touch-btn-sub').last();
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
      if (test.hurt)
        await page.waitForFunction(
          () => {
            const hp = document.querySelector('.hud-selfhp .hud-healthbar-num');
            if (!hp) return false;
            const [now, max] = hp.textContent.split('/').map(Number);
            return now > 0 && now < max - 30;
          },
          null,
          { timeout: 30000 },
        );
      if (!mobile) await page.mouse.move(640, 200);
      await hold(test.key || 'KeyZ', () =>
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
      } else if (test.badge) await self.getByTitle(test.badge).waitFor();
      // Let the normal ranged-zone arming animation finish for the review capture.
      if (test.zone) await self.getByTitle(/Hastened/).waitFor();
      if (mobile) assert.ok(await page.getByRole('group', { name: 'Touch controls' }).isVisible());
      if (process.env.SHOT_DIR)
        await page.screenshot({
          path: `${process.env.SHOT_DIR}/defense-${test.name}-${mobile ? 'touch' : 'desktop'}.png`,
        });
      if (mobile) await click(button('Pause'));
      else await page.keyboard.press('Escape');
      await page.locator('.wb-pause-skills').waitFor();
      assert.match(await page.locator('.wb-pause-skills').textContent(), test.text);
      if (test.classId === 'knight') {
        await click(page.getByText('Combat effect symbols', { exact: true }));
        assert.ok(await page.getByText(/cyan front arc/).isVisible());
      }
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${mobile ? 'mobile 320×568' : 'desktop'} ${test.name}: real cast, effect state, pause description`,
      );
      await context.close();
    }
} catch (error) {
  if (currentPage && !currentPage.isClosed()) {
    console.error(
      'Self HUD at failure:',
      await currentPage
        .locator('.hud-selfhp')
        .textContent()
        .catch(() => 'unavailable'),
    );
    console.error(
      'Effect badges at failure:',
      await currentPage
        .locator('.hud-selfhp [title]')
        .evaluateAll((els) => els.map((el) => el.getAttribute('title')))
        .catch(() => []),
    );
    await currentPage
      .screenshot({ path: `${process.env.SHOT_DIR || tmpdir()}/smoke-defense-defense-failure.png` })
      .catch(() => {});
  }
  throw error;
} finally {
  await browser.close();
}
