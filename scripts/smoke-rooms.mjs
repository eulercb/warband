/** Vite development fixture: exercises guides, labels, and real room navigation. */
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless: true,
});
let currentPage;
try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 568 },
    { width: 844, height: 390 },
    { width: 1280, height: 800 },
  ]) {
    const mobile = viewport.width !== 1280;
    const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage();
    currentPage = page;
    const errors = [];
    page.on('pageerror', (e) => {
      if (!/tracker|websocket|webrtc|ice|trystero|net::ERR/i.test(e.message))
        errors.push(e.message);
    });
    const button = (name) => page.getByRole('button', { name, exact: true });
    const click = async (name) => {
      if (mobile) await button(name).tap();
      else await button(name).click();
    };
    await page.goto(process.env.ROOM_SMOKE_URL || 'http://localhost:5173/');
    await page.evaluate(async () => {
      const { Renderer } = await import('/src/render/pipeline/renderer.ts');
      const { useStore } = await import('/src/ui/state/store.ts');
      window.roomState = useStore.getState;
      const original = Renderer.prototype.render;
      Renderer.prototype.render = function (state, presentation) {
        original.call(this, state, presentation);
        const texts = [];
        const visit = (node) => {
          if (node.visible === false) return;
          if (typeof node.text === 'string') texts.push(node.text);
          for (const child of node.children || []) visit(child);
        };
        visit(this.app.stage);
        window.roomProbe = {
          hero: state.players.find((p) => p.id === state.localPlayerId)?.pos,
          stations: state.stations || [],
          texts,
        };
      };
    });
    await page.waitForFunction(() => window.roomProbe?.stations.length > 0);
    const checkTargets = async () => {
      if (!mobile) return;
      await page.getByRole('group', { name: 'Touch controls' }).waitFor();
      const blocked = await page.locator('.wb-touch-btn,.wb-touch-stick').evaluateAll((elements) =>
        elements
          .filter((el) => {
            const r = el.getBoundingClientRect();
            const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return !hit || !(el === hit || el.contains(hit));
          })
          .map((el) => el.className),
      );
      assert.deepEqual(blocked, [], 'Guide must not block touch targets');
    };
    const checkGuide = async (label) => {
      await page.getByRole('region', { name: label }).waitFor();
      assert.equal(await page.getByRole('region', { name: 'Nearby option' }).count(), 0);
      await checkTargets();
      await click('Next tip');
      await click('Skip guide');
      assert.equal(await page.getByRole('region', { name: label }).count(), 0);
      await click('Guide');
      await page.getByRole('region', { name: label }).waitFor();
      await click('Close guide');
    };
    await checkGuide('Camp guide');
    let texts = await page.evaluate(() => window.roomProbe.texts);
    assert.ok(
      mobile ? texts.some((t) => /^H1( ✓)?$/.test(t)) : texts.some((t) => t.includes('Knight')),
      texts.join(', '),
    );
    if (mobile) await click('Menu');
    await click('Host Game');
    await checkGuide('Host setup guide');
    await page.waitForFunction(() => window.roomProbe.stations.some((s) => s.kind === 'boss'));
    texts = await page.evaluate(() => window.roomProbe.texts);
    assert.ok(
      mobile ? texts.some((t) => /^B1( ✓)?$/.test(t)) : texts.some((t) => t.includes('Dragon')),
      texts.join(', '),
    );
    if (mobile) {
      await page.getByRole('region', { name: 'Nearby option' }).waitFor();
      assert.ok(
        await page
          .getByRole('region', { name: 'Nearby option' })
          .getByText(/create the room/i)
          .isVisible(),
      );
    }
    await click('List view');
    assert.equal(await button('Guide').count(), 0);
    await click('Create Room');
    await checkGuide('Lobby guide');
    await page.waitForFunction(() => window.roomProbe.stations.some((s) => s.kind === 'muster'));
    texts = await page.evaluate(() => window.roomProbe.texts);
    assert.ok(
      mobile ? texts.some((t) => /^Bot1( ✓)?$/.test(t)) : texts.some((t) => /Knight.*bot/i.test(t)),
      texts.join(', '),
    );
    if (mobile) await click('Lobby menu');
    // Preserve the classic bot path and ready/start flow while guide UI is present.
    await page
      .getByRole('group', { name: 'Add a bot' })
      .getByRole('button', { name: 'Knight', exact: true })
      .click();
    await page.waitForFunction(() => window.roomState().players.some((p) => p.isBot));
    await click('Ready up');
    await click('Start Fight');
    await page.waitForFunction(() => window.roomState().phase === 'game');
    await page.waitForSelector('.game-canvas canvas');
    assert.deepEqual(errors, []);
    console.log(
      `PASS rooms ${viewport.width}×${viewport.height}: first-visit/replay guides, mobile markers or desktop names, fallback menus, bot addition, ready/start`,
    );
    await context.close();
  }
} catch (error) {
  await currentPage
    ?.screenshot({ path: `${process.env.SHOT_DIR || tmpdir()}/smoke-rooms-failure.png` })
    .catch(() => {});
  throw error;
} finally {
  await browser.close();
}
