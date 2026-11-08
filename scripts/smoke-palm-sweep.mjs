/** Real World input, native/copied delivery and remote Pixi footprints. */
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
      await page.route('**/__palm-sweep', (r) =>
        r.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="world" style="position:absolute;inset:0"></div><div id="ui"></div>',
        }),
      );
      await page.goto(`${process.env.SMOKE_DEV_URL || 'http://127.0.0.1:5173'}/__palm-sweep`);
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
        const { resolvedPalmSweep } = await import('/src/engine/content/classes.ts');
        const { applyBuff, makeBuff } = await import('/src/engine/combat/combat.ts');
        useStore.getState().setActiveChaosForge(portable);
        useStore.getState().setActiveRunSeed(portable ? 7 : null);
        const w = new World({
          seed: 31,
          monsterId: 'dragon',
          players: [
            {
              peerId: 'a',
              name: 'Open Hand',
              classId: 'monk',
              charUpgrades: ['mo_openhand_g_b'],
              subSkills: ['mo_openhand_ki'],
            },
          ],
        });
        w.scene = null;
        w.obstacles = [];
        w.terrain = [];
        const p = w.players[0],
          b = w.boss;
        p.pos = { x: 500, y: 400 };
        p.aim = { x: -1, y: 0 };
        p.critChance = 0;
        b.pos = { x: 600, y: 400 };
        b.moveSpeed = 0;
        b.decisionTimer = 1000;
        b.hp = b.maxHp = 10000;
        const renderer = await Renderer.create(document.querySelector('#world'), w.arena);
        useStore.setState({
          localClass: 'monk',
          myCharUpgrades: ['mo_openhand_g_b'],
          mySubSkills: ['mo_openhand_ki'],
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
          window.remotePalm = remote.players[0].palmSweep;
          pushHud(local, 'keyboard');
          renderer.render(remote);
        };
        const step = (buttons = {}, dt = 0.02) => {
          w.step(
            dt,
            new Map([
              [
                'a',
                {
                  seq: w.tick,
                  move: { x: 0, y: 0 },
                  aim: { x: -1, y: 0 },
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
          root: () => applyBuff(p, makeBuff('root', 0, 3, 'testRoot')),
          slot: Object.values(p.abilities).find((a) => resolvedPalmSweep(a)).slot,
        };
        publish();
      }, portable);
      await page.waitForSelector(width === 320 ? '.wb-touch-btn-a1' : '.hud-ability');
      const press = async (slot) => {
        if (width === 320) {
          const button = page.locator(
            slot === 'sub1' ? '.wb-touch-btn-sub' : `.wb-touch-btn-${slot}`,
          );
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
      const slot = await page.evaluate(() => window.fixture.slot);
      if (!portable) await press('sub1');
      await press(slot);
      await page.evaluate(() => {
        const f = window.fixture;
        for (let i = 0; i < 60 && !f.p.glide?.palmSweep; i++) f.step({}, 0.01);
      });
      assert.equal(await page.evaluate(() => window.remotePalm.active), true);
      assert.equal(await page.evaluate(() => window.remotePalm.dir.x), -1);
      const controls = page.locator(width === 320 ? '.wb-touch-controls' : '.hud-bottom');
      await controls.getByText('Sweeping', { exact: true }).waitFor();
      await page.mouse.move(0, 0);
      await page.screenshot({
        path: `${process.env.SHOT_DIR || '/tmp'}/palm-sweep-${width}-${portable ? 'forge' : 'native'}.png`,
      });
      await page.evaluate(() => {
        for (let i = 0; i < 30; i++) window.fixture.step({}, 0.02);
      });
      const result = await page.evaluate(() => ({
        x: window.fixture.p.pos.x,
        hp: window.fixture.b.hp,
        max: window.fixture.b.maxHp,
        active: window.remotePalm.active,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
      }));
      assert.equal(result.x, 320);
      assert.ok(result.hp < result.max);
      assert.equal(result.active, false);
      assert.equal(result.overflow, false);
      await page.evaluate(() => {
        const f = window.fixture;
        for (let i = 0; i < 600; i++) f.step({}, 0.05);
        f.root();
        f.publish();
      });
      await controls.getByText('Rooted · local Palm', { exact: true }).waitFor();
      await press(slot);
      await page.evaluate(() => {
        for (let i = 0; i < 80; i++) window.fixture.step({}, 0.02);
      });
      assert.equal(await page.evaluate(() => window.fixture.p.pos.x), 320);
      assert.deepEqual(errors, []);
      console.log(
        `PASS Palm sweep ${width}px ${portable ? 'Forge' : 'native'}: input, travelling footprint, remote snapshot and rooted fallback`,
      );
      await page.close();
    }
} finally {
  await browser.close();
}
