/** Actual test-loadout component, styles and touch-sized layout; no network room required. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless: true,
});
try {
  for (const width of [1280, 320]) {
    const context = await browser.newContext({
      viewport: { width, height: width === 320 ? 568 : 800 },
      isMobile: width === 320,
      hasTouch: width === 320,
    });
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/__loadout-foundations', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div>',
      }),
    );
    await page.goto(
      `${process.env.SMOKE_DEV_URL || 'http://127.0.0.1:5173'}/__loadout-foundations`,
    );
    await page.evaluate(async () => {
      const refresh = (await import('/@react-refresh')).default;
      refresh.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      await import('/src/ui/styles.css');
      const { createElement } = (await import('/node_modules/.vite/deps/react.js')).default;
      const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
      const { LoadoutEditor } = await import('/src/ui/screens/LoadoutEditor.tsx');
      const { useStore, EMPTY_SF_LOADOUT } = await import('/src/ui/state/store.ts');
      useStore.setState({
        isHost: true,
        gauntlet: false,
        localClass: 'knight',
        sfLoadoutOpen: true,
        sfLoadout: { ...EMPTY_SF_LOADOUT },
      });
      createRoot(document.getElementById('root')).render(createElement(LoadoutEditor));
    });
    const click = async (locator) => {
      await locator.scrollIntoViewIfNeeded();
      if (width === 320) await locator.tap();
      else await locator.click();
    };
    const graft = () => page.getByRole('button', { name: /Warlock’s Hex.*replaces Shield Bash/ });
    await click(graft());
    const followup = () => page.getByRole('button', { name: /Deepening Hex.*Hex/ });
    for (let n = 1; n <= 5; n++) {
      await click(followup());
      assert.match(await followup().innerText(), new RegExp(`×${n}`));
    }
    await click(followup());
    assert.doesNotMatch(await followup().innerText(), /×\d/);
    for (let n = 1; n <= 3; n++) {
      await click(page.getByRole('button', { name: /Vampiric Style/ }));
    }
    assert.match(await page.getByRole('button', { name: /Vampiric Style/ }).innerText(), /×3/);
    await click(graft());
    assert.equal(await followup().count(), 0);
    assert.deepEqual(errors, []);
    if (process.env.SHOT_DIR)
      await page.screenshot({
        path: `${process.env.SHOT_DIR}/upgrade-foundations-${width}.png`,
        fullPage: true,
      });
    console.log(`PASS ${width}px: graft ranks, style cap, replacement label and cleanup`);
    await context.close();
  }
} finally {
  await browser.close();
}
