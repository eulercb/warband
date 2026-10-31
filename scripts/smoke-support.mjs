/** Production class selection and real keyboard/touch casting for support kits. */
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright-core';
const selectedClasses = ['cleric', 'paladin', 'druid', 'bard'].filter(
  (classId) => !process.env.SMOKE_CLASS || process.env.SMOKE_CLASS === classId,
);
assert.ok(selectedClasses.length, 'Unknown SMOKE_CLASS');
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless: true,
});
let currentPage;
try {
  for (const mobile of [false, true])
    for (const classId of selectedClasses) {
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
      const cases = {
        cleric: {
          name: 'Heal',
          slot: 'a1',
          key: 'KeyQ',
          text: /effective heals add a 6s bubble.*25% healed HP.*cap 15% max HP.*75% on rescue.*extra cap 30% max HP/,
        },
        paladin: { name: 'Divine Shield', slot: 'a3', key: 'KeyR', text: /bulwark aura/ },
        druid: {
          name: 'Entangle',
          slot: 'a1',
          key: 'KeyQ',
          text: /\b[1-9]\d*(?:\.\d+)?\/tick heal\b/,
        },
        bard: { name: 'Dissonant Whispers', slot: 'a3', key: 'KeyR', text: /prepares discord/ },
      };
      const test = cases[classId];
      const tile = page.locator(`.hud-ability[aria-label^="${test.name}"]`);
      await tile.waitFor({ state: mobile ? 'attached' : 'visible' });
      if (mobile) await page.locator(`.wb-touch-btn-${test.slot}`).waitFor();
      assert.match(await tile.getAttribute('aria-label'), test.text);
      // Procedural variants change Entangle's tick value; healing + root are invariant.
      if (classId === 'druid') assert.match(await tile.getAttribute('aria-label'), /\broots\b/);
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
      if (classId === 'bard')
        await page
          .locator('.hud-selfhp')
          .getByTitle(/Discord verse/)
          .waitFor();
      if (mobile) await click(button('Pause'));
      else await page.keyboard.press('Escape');
      await page.locator('.wb-pause-skills').waitFor();
      assert.match(await page.locator('.wb-pause-skills').textContent(), test.text);
      if (classId === 'bard') {
        assert.match(await page.locator('.wb-pause-skills').textContent(), /spend both 8s verses/);
        const guide = await page.getByLabel('Bard verse guide').textContent();
        assert.match(guide, /Neither changes your stats alone/);
        assert.match(guide, /15% move speed/);
      }
      if (classId === 'druid')
        assert.match(await page.locator('.wb-pause-skills').textContent(), /recovery grove/);
      if (classId === 'cleric') {
        // Shared shield rules moved out of every tooltip into the optional reference.
        await click(button('Controls'));
        await click(page.getByRole('tab', { name: 'Options', exact: true }));
        const reference = page.locator('.wb-mechanics-reference');
        await click(reference.locator('summary'));
        assert.equal(await reference.getAttribute('open'), '');
        assert.match(
          await reference.textContent(),
          /cap of 50% of the recipient’s maximum\s+health/,
        );
      }
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${mobile ? 'mobile 320×568' : 'desktop'} ${classId}: support descriptions, real casting, pause${classId === 'bard' ? ', verse HUD' : ''}`,
      );
      await context.close();
    }
} catch (error) {
  if (currentPage && !currentPage.isClosed())
    await currentPage
      .screenshot({ path: `${process.env.SHOT_DIR || tmpdir()}/smoke-support-failure.png` })
      .catch(() => {});
  throw error;
} finally {
  await browser.close();
}
