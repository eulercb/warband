/** Real input edges, host snapshot, desktop/touch controls and persistent departure cue. */
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
    await page.route('**/__shadow-reprise', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="world" style="position:absolute;inset:0"></div><div id="ui"></div>',
      }),
    );
    await page.goto(`${process.env.SMOKE_DEV_URL || 'http://127.0.0.1:5173'}/__shadow-reprise`);
    await page.evaluate(async () => {
      const refresh = (await import('/@react-refresh')).default;
      refresh.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      await import('/src/ui/styles.css');
      await import('/src/ui/hud.css');
      const { World } = await import('/src/engine/world/world.ts');
      const { Renderer } = await import('/src/render/pipeline/renderer.ts');
      const { pushHud } = await import('/src/ui/state/hudBridge.ts');
      const { useStore } = await import('/src/ui/state/store.ts');
      const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
      const React = (await import('/node_modules/.vite/deps/react.js')).default;
      const { default: HUD } = await import('/src/ui/game/HUD.tsx');
      const { default: TouchControls } = await import('/src/ui/game/TouchControls.tsx');
      const { sampleTouch } = await import('/src/input/touch.ts');
      const { damageBoss } = await import('/src/engine/combat/combat.ts');
      const w = new World({
        seed: 31,
        monsterId: 'lich',
        players: [
          {
            peerId: 'a',
            name: 'Assassin',
            classId: 'rogue',
            charUpgrades: ['ro_assassin_g_a'],
            subSkills: ['ro_assassin_strike'],
          },
        ],
      });
      w.scene = null;
      w.obstacles = [];
      w.terrain = [];
      const p = w.players[0];
      p.pos = { x: 500, y: 400 };
      p.aim = { x: 1, y: 0 };
      w.boss.pos = { x: 800, y: 400 };
      w.boss.hp = w.boss.maxHp = 10000;
      w.boss.moveSpeed = 0;
      w.boss.decisionTimer = 100;
      const renderer = await Renderer.create(document.querySelector('#world'), w.arena);
      useStore.setState({
        localClass: 'rogue',
        myCharUpgrades: ['ro_assassin_g_a'],
        mySubSkills: ['ro_assassin_strike'],
        autofire: true,
      });
      const publish = () => {
        const state = { ...w.serialize(), localPlayerId: p.id, arena: w.arena };
        pushHud(state, 'keyboard');
        renderer.render(state);
      };
      const step = (held) => {
        const touch = sampleTouch();
        w.step(
          0.05,
          new Map([
            [
              'a',
              {
                seq: w.tick,
                move: { x: 0, y: 0 },
                aim: { x: 1, y: 0 },
                autofire: true,
                buttons: { ...touch.buttons, a2: held ?? touch.buttons.a2 },
              },
            ],
          ]),
        );
        publish();
      };
      const root = createRoot(document.querySelector('#ui'));
      root.render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(HUD),
          React.createElement(TouchControls),
        ),
      );
      window.fixture = {
        w,
        p,
        getStore: () => ({ localClass: useStore.getState().localClass }),
        renderer,
        publish,
        step,
        hit: () =>
          damageBoss(w, p, w.boss, 10, {
            direct: true,
            prepared: true,
            pilot: { cast: { spent: false } },
          }),
      };
      publish();
    });
    const mobile = width === 320;
    // On phones drive the real held-state control; desktop uses an edge sampled by World.
    if (mobile) {
      const button = page.locator('.wb-touch-btn-a2');
      await button.waitFor();
      const expected = await page.evaluate(() => {
        const n = window.fixture.p.abilities.a1.name;
        return n.length > 9 ? n.slice(0, 8) + '…' : n;
      });
      assert.equal(
        await page.locator('.wb-touch-btn-a1 .wb-touch-btn-label').textContent(),
        expected,
      );
      const box = await button.boundingBox();
      assert.ok(box);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.evaluate(() => window.fixture.step());
    } else await page.evaluate(() => window.fixture.step(true));
    await page.waitForFunction(() => document.body.textContent.includes('Need prepared hit'));
    const away = await page.evaluate(() => {
      const f = window.fixture;
      f.hit();
      f.publish();
      return { ...f.p.pos };
    });
    await page.waitForFunction(() => document.body.textContent.includes('Return 2.0s'));
    await page.evaluate(() => window.fixture.step(window.innerWidth === 320 ? undefined : true));
    assert.deepEqual(
      await page.evaluate(() => window.fixture.p.pos),
      away,
      'holding must not return',
    );
    const tile = page
      .locator('.hud-ability')
      .filter({ has: page.locator('.hud-ability-name', { hasText: 'Return' }) });
    assert.ok(await tile.locator('.hud-cd-num').textContent(), 'original cooldown stays visible');
    const draws = await page.evaluate(
      () => window.fixture.renderer.apparitionLayer.context.instructions.length,
    );
    assert.ok(draws > 0);
    // Let cast flashes settle while retaining the same authoritative ready state.
    await page.evaluate(async () => {
      const f = window.fixture;
      const state = { ...f.w.serialize(), events: [], localPlayerId: f.p.id, arena: f.w.arena };
      for (let frame = 0; frame < 90; frame++) {
        await new Promise(requestAnimationFrame);
        f.renderer.render(state);
      }
    });
    if (process.env.SHOT_DIR)
      await page.screenshot({ path: `${process.env.SHOT_DIR}/shadow-reprise-${width}.png` });
    if (mobile) {
      await page.mouse.up();
      await page.evaluate(() => window.fixture.step());
      const button = page
        .locator('.wb-touch-btn')
        .filter({ has: page.locator('.wb-touch-btn-label', { hasText: 'Return' }) });
      const box = await button.boundingBox();
      assert.ok(box);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.evaluate(() => window.fixture.step());
      await page.mouse.up();
    } else {
      await page.evaluate(() => window.fixture.step(false));
      await page.evaluate(() => window.fixture.step(true));
    }
    assert.deepEqual(await page.evaluate(() => window.fixture.p.pos), { x: 500, y: 400 });
    assert.equal(await page.evaluate(() => window.fixture.p.shadowReprise), undefined);
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${width}px: earned return, persistent marker, held-input safety, cooldown readout`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
