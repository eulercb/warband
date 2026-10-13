/** Real production UI: select each pilot subclass, start a fight, inspect its passive. */
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless: true,
});
let currentPage;
try {
  for (const mobile of [false, true]) {
    for (const [classId, skill, passive] of [
      ['rogue', 'Smoke Bomb', "Death's Opening"],
      ['rogue', 'Shield Spell', 'Spellblade'],
      ['warlock', 'Dark Resilience', 'Soul Ember'],
      ['warlock', 'Mind Blast', 'Dread Insight'],
    ]) {
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
      await click(page.locator('.wb-sf-loadout-toggle'));
      await click(page.getByRole('button', { name: new RegExp(skill) }));
      await click(button('Start Fight'));
      const icon = page.getByLabel(`Subclass passive: ${passive}`, { exact: true });
      await icon.waitFor();
      assert.equal(await icon.count(), 1);
      assert.ok((await icon.getAttribute('title')).includes(passive));
      if (mobile) {
        assert.ok(await page.getByRole('group', { name: 'Touch controls' }).isVisible());
        await click(button('Pause'));
      } else await page.keyboard.press('Escape');
      const description = page
        .locator('.wb-pause-skills')
        .getByLabel(`Subclass passive: ${passive}`);
      await description.waitFor();
      assert.ok((await description.textContent()).length > 70);
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${mobile ? 'mobile 320×568' : 'desktop'}: ${passive} unlock, fight icon, pause description`,
      );
      await context.close();
    }
  }
} catch (error) {
  if (currentPage && !currentPage.isClosed())
    await currentPage
      .screenshot({ path: `${process.env.SHOT_DIR || tmpdir()}/smoke-passives-failure.png` })
      .catch(() => {});
  throw error;
} finally {
  await browser.close();
}
