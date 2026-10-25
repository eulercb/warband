/** Real host progression plus the production grand controls, without grinding combat. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless: true,
});
try {
  for (const width of [1280, 320]) {
    const page = await browser.newPage({
      viewport: { width, height: width === 320 ? 568 : 800 },
      isMobile: width === 320,
      hasTouch: width === 320,
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/__grand-fixture', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:12px;box-sizing:border-box}#root{max-width:900px;margin:auto}</style><div id="root"></div>',
      }),
    );
    await page.goto(`${process.env.SMOKE_DEV_URL || 'http://127.0.0.1:5173'}/__grand-fixture`);
    await page.evaluate(async () => {
      const refresh = (await import('/@react-refresh')).default;
      refresh.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      await import('/src/ui/styles.css');
      const { createElement } = (await import('/node_modules/.vite/deps/react.js')).default;
      const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
      const { Host } = await import('/src/net/session/host.ts');
      const { useStore } = await import('/src/ui/state/store.ts');
      const { default: GrandPanel } = await import('/src/ui/game/GrandManager.tsx');
      const { default: SpecialReward } = await import('/src/ui/screens/SpecialReward.tsx');
      const host = new Host({
        code: `G${Math.random().toString(36).slice(2, 11)}`,
        name: 'Grand tester',
        classId: 'knight',
        monsterId: 'lich',
        gauntlet: true,
        seed: 31,
        onLobby: () => {},
        onResult: (result) => useStore.setState({ result, phase: 'result' }),
        onGrandState: (state, credit) => useStore.getState().setGrandState(state, credit),
      });
      useStore.setState({
        localClass: 'knight',
        session: host,
        myCharUpgrades: [],
        mySubSkills: [],
        myExtraClasses: [],
        myGrandLoadout: undefined,
        grandCredit: false,
      });
      window.__grandHost = host;
      host.startFight();
      for (let i = 0; i < 5; i++) {
        host.endRun('victory');
        if (i < 4) host.setNextReady(true);
      }
      createRoot(document.getElementById('root')).render(
        createElement(
          'div',
          null,
          createElement(GrandPanel, { open: true }),
          createElement(SpecialReward),
        ),
      );
    });
    const click = async (locator) => {
      await locator.scrollIntoViewIfNeeded();
      if (width === 320) await locator.tap();
      else await locator.click();
    };
    const unlock = async (id) => {
      await page.getByLabel('New grand').selectOption(id);
      await click(page.getByRole('button', { name: 'Unlock grand', exact: true }));
    };
    try {
      await page.getByText('★ Grand reward available', { exact: true }).waitFor();
    } catch (error) {
      console.log(
        await page.evaluate(async () => {
          const { useStore } = await import('/src/ui/state/store.ts');
          const s = useStore.getState();
          return {
            credit: s.grandCredit,
            bank: s.myGrandLoadout,
            result: s.result,
            phase: window.__grandHost.phase,
            index: window.__grandHost.runIndex,
            total: window.__grandHost.runOrder.length,
            text: document.body.innerText.slice(0, 1800),
          };
        }),
      );
      console.log(errors);
      throw error;
    }
    await unlock('kn_gk_basic_a');
    await page.getByText(/1\/4 equipped · 1 earned/).waitFor();
    // Unlocking a grand did not consume the independently earned subclass choice.
    await click(page.getByRole('button', { name: /^Champion/ }));
    await click(page.getByRole('button', { name: /Earthshaker/ }));
    const nextClear = async () =>
      page.evaluate(() => {
        const host = window.__grandHost;
        host.continueEndless();
        for (let i = 0; i < 5; i++) {
          host.endRun('victory');
          if (i < 4) host.setNextReady(true);
        }
      });
    await nextClear();
    await unlock('kn_gk_a1_a');
    await nextClear();
    await unlock('kn_gk_a2_a');
    await page.getByText(/2\/4 equipped · 3 earned/).waitFor();
    const targetName = await page.evaluate(
      async () =>
        (await import('/src/engine/content/charUpgrades.ts')).CHAR_UPGRADES.kn_gk_a2_a.name,
    );
    await click(page.getByText(/^Earned bank ·/));
    await click(page.getByText(`${targetName} · Banked`, { exact: false }));
    assert.equal(
      await page.getByRole('button', { name: `Equip ${targetName}`, exact: true }).isDisabled(),
      true,
    );
    await page.getByLabel(`Replace grand for ${targetName}`).selectOption('kn_gk_a1_a');
    await click(page.getByRole('button', { name: `Equip ${targetName}`, exact: true }));
    const final = await page.evaluate(async () => {
      const { useStore } = await import('/src/ui/state/store.ts');
      const state = useStore.getState();
      const host = window.__grandHost;
      host.continueEndless();
      const p = host.world.players[0];
      const result = {
        selected: state.myGrandLoadout.classes.knight.equipped,
        bank: state.myGrandLoadout.classes.knight.bank,
        guard: p.abilities.a2.frontGuard.charges,
        skills: p.subSkillIds,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
      };
      host.leave();
      return result;
    });
    assert.deepEqual(final.selected, ['kn_gk_basic_a', 'kn_gk_a2_a']);
    assert.equal(final.bank.length, 3);
    assert.ok(final.guard > 2);
    assert.ok(final.skills.includes('kn_champion_slam'));
    assert.equal(final.overflow, false);
    assert.deepEqual(errors, []);
    if (process.env.SHOT_DIR)
      await page.screenshot({
        path: `${process.env.SHOT_DIR}/grand-selections-${width}.png`,
        fullPage: true,
      });
    console.log(
      `PASS ${width}px: clear-five unlock, independent subclass, bank, explicit replacement, next-fight kit`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
