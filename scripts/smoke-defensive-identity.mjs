/** B2 defensive identities through production loadouts, keyboard and touch casting. */
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright-core';
import { loadDefenseSmokeCases, defenseViewports } from './defense-smoke-cases.mjs';
import { armDefenseCastProbe, advanceDefenseUntil } from './defense-cast-probe.mjs';
const { tests, defaultHeroName } = await loadDefenseSmokeCases(
  'first',
  process.env.SMOKE_DEFENSE_NAME,
);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless: true,
});
let currentPage;
try {
  for (const mobile of defenseViewports())
    for (const test of tests) {
      console.log(
        `RUN ${mobile ? 'mobile 320×568' : 'desktop'} ${test.skillId ?? `${test.classId}.${test.slot}`}: ${test.name}`,
      );
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
      await page.clock.install();
      await page.goto(process.env.SMOKE_URL || 'http://localhost:4173/');
      if (mobile) await click(button('Menu'));
      await click(button(`Hero: ${defaultHeroName}`));
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
          page
            .getByRole('group', { name: 'Test loadout' })
            .getByRole('button', { name: test.label, exact: true }),
        );
      }
      // Freeze before combat starts: slow browser setup must not kill the hero.
      await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 60_000);
      await click(button('Start Fight'));
      await page.locator('.game-root .game-canvas canvas').waitFor({ state: 'attached' });
      await page.clock.runFor(150);
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
          return await until();
        } finally {
          if (mobile)
            await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          else await page.keyboard.up(key);
        }
      };
      if (test.hurt)
        await advanceDefenseUntil(
          page,
          () => {
            const hp = document.querySelector('.hud-selfhp .hud-healthbar-num');
            if (!hp) return false;
            const [now, max] = hp.textContent.split('/').map(Number);
            return now > 0 && now < max - 30;
          },
          30000,
        );
      if (!mobile) await page.mouse.move(640, 200);
      // Observe before dispatch: CI can read the DOM after a short effect is consumed.
      const waitForCast = await armDefenseCastProbe(page, test);
      const observed = await hold(test.key || 'KeyZ', waitForCast);
      assert.ok(observed.cooldown > 0, `${test.name}: no real recharge observed`);
      if (test.bubble)
        assert.ok(observed.effect.amount > 0 && observed.effect.amount <= observed.effect.max);
      else if (test.badge || test.zone) assert.ok(observed.effect.title);
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
