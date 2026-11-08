/** Actual casts, remote snapshots and renderer from a cold Vite dependency cache. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless: true,
});
try {
  for (const width of [1280, 320])
    for (const portable of [false, true]) {
      const page = await browser.newPage({
        viewport: { width, height: width === 320 ? 568 : 800 },
        hasTouch: width === 320,
        isMobile: width === 320,
      });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route('**/__ancestral-relay', (r) =>
        r.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="world" style="position:absolute;inset:0"></div><div id="ui"></div>',
        }),
      );
      await page.goto(`${process.env.SMOKE_DEV_URL || 'http://127.0.0.1:5173'}/__ancestral-relay`);
      await page.evaluate(async (portable) => {
        const refresh = (await import('/@react-refresh')).default;
        refresh.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => (t) => t;
        window.__vite_plugin_react_preamble_installed__ = true;
        await import('/src/ui/styles.css');
        await import('/src/ui/hud.css');
        const { World } = await import('/src/engine/world/world.ts');
        const { Host } = await import('/src/net/session/host.ts');
        const { SnapshotInterpolator } = await import('/src/render/pipeline/interpolate.ts');
        const { Renderer } = await import('/src/render/pipeline/renderer.ts');
        const { pushHud } = await import('/src/ui/state/hudBridge.ts');
        const { useStore } = await import('/src/ui/state/store.ts');
        const { sampleTouch } = await import('/src/input/touch.ts');
        const { React, createRoot } = await import('/scripts/browser-smoke-react.mjs');
        const { default: HUD } = await import('/src/ui/game/HUD.tsx');
        const { default: TouchControls } = await import('/src/ui/game/TouchControls.tsx');
        const { resolvedAncestralRelay } = await import('/src/engine/content/classes.ts');
        useStore.getState().setActiveChaosForge(portable);
        useStore.getState().setActiveRunSeed(portable ? 7 : null);
        const w = new World({
          seed: 31,
          monsterId: 'dragon',
          players: [
            {
              peerId: 'a',
              name: 'Totem',
              classId: 'barbarian',
              charUpgrades: ['bb_totem_g_b'],
              subSkills: ['bb_totem_bear'],
            },
          ],
        });
        w.scene = null;
        w.obstacles = [];
        w.terrain = [];
        const p = w.players[0],
          b = w.boss;
        p.pos = { x: 500, y: 400 };
        p.aim = { x: 1, y: 0 };
        p.critChance = 0;
        b.pos = { x: 1200, y: 1000 };
        b.moveSpeed = 0;
        b.decisionTimer = 100;
        b.hp = b.maxHp = 10000;
        const renderer = await Renderer.create(document.querySelector('#world'), w.arena);
        useStore.setState({
          localClass: 'barbarian',
          myCharUpgrades: ['bb_totem_g_b'],
          mySubSkills: ['bb_totem_bear'],
          autofire: false,
        });
        const host = Object.create(Host.prototype);
        Object.assign(host, { world: w, localPlayerId: p.id, drainEvents: () => w.events });
        const interp = new SnapshotInterpolator();
        let sequence = 0;
        const publish = () => {
          const local = host.getRenderState(performance.now());
          interp.push(JSON.parse(JSON.stringify({ ...w.serialize(), tick: sequence++ })));
          const remote = interp.sample(performance.now() + 200, {
            localPlayerId: p.id,
            arena: w.arena,
          });
          window.remoteRelay = remote.players[0].ancestralRelay;
          pushHud(local, 'keyboard');
          renderer.render(remote);
        };
        const step = (buttons = {}, dt = 0.05) => {
          w.step(
            dt,
            new Map([
              [
                'a',
                {
                  seq: w.tick,
                  move: { x: 0, y: 0 },
                  aim: { x: 1, y: 0 },
                  buttons: { ...sampleTouch().buttons, ...buttons },
                },
              ],
            ]),
          );
          publish();
        };
        createRoot(document.querySelector('#ui')).render(
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
          b,
          renderer,
          publish,
          step,
          slot: Object.values(p.abilities).find((a) => resolvedAncestralRelay(a)).slot,
        };
        publish();
      }, portable);
      const press = async (slot) => {
        if (width === 320) {
          const button = page.locator(`.wb-touch-btn-${slot}`);
          await button.waitFor();
          const box = await button.boundingBox();
          assert.ok(box);
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.evaluate(() => window.fixture.step());
          await page.mouse.up();
        } else await page.evaluate((slot) => window.fixture.step({ [slot]: true }), slot);
        await page.evaluate(() => window.fixture.step());
      };
      await page.waitForSelector(width === 320 ? '.wb-touch-btn-a1' : '.hud-ability');
      const slot = await page.evaluate(() => window.fixture.slot);
      if (!portable) {
        await press('a1');
        assert.equal(await page.evaluate(() => window.remoteRelay.station.x), 680);
      }
      await press(slot);
      await page.evaluate(() => {
        for (let i = 0; i < 20; i++) window.fixture.step();
      });
      assert.deepEqual(await page.evaluate(() => window.remoteRelay.station), { x: 500, y: 400 });
      // Real elapsed recharge, then a moved body and a boss at the former station.
      await page.evaluate(() => {
        const f = window.fixture;
        for (let i = 0; i < 700; i++) f.step();
        f.p.pos = { x: 800, y: 400 };
        f.b.pos = { x: 500, y: 400 };
        f.publish();
      });
      await page
        .locator(width === 320 ? '.wb-touch-controls' : '.hud-bottom')
        .getByText('At ancestor', { exact: true })
        .first()
        .waitFor();
      await press(slot);
      await page.evaluate(() => {
        for (let i = 0; i < 20; i++) window.fixture.step();
      });
      const result = await page.evaluate(() => ({
        hp: window.fixture.b.hp,
        max: window.fixture.b.maxHp,
        station: window.remoteRelay.station,
        body: window.fixture.p.pos,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        canvas: document.querySelectorAll('canvas').length,
      }));
      assert.ok(result.hp < result.max);
      assert.deepEqual(result.station, { x: 800, y: 400 });
      assert.deepEqual(result.body, { x: 800, y: 400 });
      assert.equal(result.overflow, false);
      assert.equal(result.canvas, 1);
      assert.deepEqual(errors, []);
      await page.screenshot({
        path: `${process.env.SHOT_DIR || '/tmp'}/ancestral-relay-${width}-${portable ? 'forge' : 'native'}.png`,
      });
      await page.close();
      console.log(`Ancestral Relay ${width}px ${portable ? 'Forge' : 'native'} passed`);
    }
} finally {
  await browser.close();
}
