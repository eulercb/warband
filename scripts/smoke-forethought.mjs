/** Real preparation/spending, a cancelled telegraph and public recovery at desktop/phone sizes. */
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
    await page.route('**/__forethought', (r) =>
      r.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="world" style="position:absolute;inset:0"></div><div id="ui"></div>',
      }),
    );
    await page.goto(`${process.env.SMOKE_DEV_URL || 'http://127.0.0.1:5173'}/__forethought`);
    await page.evaluate(async () => {
      const refresh = (await import('/@react-refresh')).default;
      refresh.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (t) => t;
      window.__vite_plugin_react_preamble_installed__ = true;
      await import('/src/ui/styles.css');
      await import('/src/ui/hud.css');
      const { World } = await import('/src/engine/world/world.ts');
      const { Renderer } = await import('/src/render/pipeline/renderer.ts');
      const { pushHud } = await import('/src/ui/state/hudBridge.ts');
      const { useStore } = await import('/src/ui/state/store.ts');
      const { sampleTouch } = await import('/src/input/touch.ts');
      const React = (await import('/node_modules/.vite/deps/react.js')).default;
      const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
      const { default: HUD } = await import('/src/ui/game/HUD.tsx');
      const { default: TouchControls } = await import('/src/ui/game/TouchControls.tsx');
      const w = new World({
        seed: 31,
        monsterId: 'troll',
        players: [
          {
            peerId: 'a',
            name: 'Reader',
            classId: 'warlock',
            charUpgrades: ['wa_great_old_one_g_a'],
            subSkills: ['wa_goo_blast'],
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
      b.pos = { x: 960, y: 400 };
      b.hp = b.maxHp = 10000;
      b.moveSpeed = 0;
      b.decisionTimer = 100;
      const renderer = await Renderer.create(document.querySelector('#world'), w.arena);
      useStore.setState({
        localClass: 'warlock',
        myCharUpgrades: ['wa_great_old_one_g_a'],
        mySubSkills: ['wa_goo_blast'],
        autofire: false,
      });
      const publish = () => {
        const s = { ...w.serialize(), localPlayerId: p.id, arena: w.arena };
        pushHud(s, 'keyboard');
        renderer.render(s);
      };
      const step = (buttons) => {
        const input = sampleTouch();
        w.step(
          0.05,
          new Map([
            [
              'a',
              {
                seq: w.tick,
                move: { x: 0, y: 0 },
                aim: { x: 1, y: 0 },
                buttons: { ...input.buttons, ...buttons },
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
      window.fixture = { w, p, b, renderer, publish, step };
      publish();
    });
    const press = async (slot) => {
      if (width === 320) {
        const button = page.locator(`.wb-touch-btn-${slot}`);
        await button.waitFor();
        const r = await button.boundingBox();
        assert.ok(r);
        await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
        await page.mouse.down();
        await page.evaluate(() => window.fixture.step());
        await page.mouse.up();
        await page.evaluate(() => window.fixture.step());
      } else {
        await page.evaluate((s) => window.fixture.step({ [s]: true }), slot);
        await page.evaluate((s) => window.fixture.step({ [s]: false }), slot);
      }
    };
    // Real Hex from the starting kit. Its aim places it at its authored 460u reach.
    await press('a1');
    await page.evaluate(() => {
      const f = window.fixture;
      for (let i = 0; i < 18; i++) f.step({});
      // Freeze only the scenario clock: a current action lets us inspect a pending read.
      f.b.action.kind = 'recover';
      f.b.action.remaining = 0.4;
      f.b.decisionTimer = 1.2;
    });
    assert.ok(
      await page.evaluate(() => window.fixture.b.buffs.some((b) => b.kind === 'curse')),
      JSON.stringify(
        await page.evaluate(() => ({
          p: window.fixture.p.pos,
          b: window.fixture.b.pos,
          z: window.fixture.w.groundZones,
          cd: window.fixture.p.cooldowns,
        })),
      ),
    );
    await press('basic');
    await page.evaluate(() => {
      const f = window.fixture;
      for (let i = 0; i < 14; i++) f.step({});
    });
    const result = await page.evaluate(() => {
      const f = window.fixture,
        view = f.w.serialize().bosses[0];
      return {
        read: view.forethought,
        action: f.b.action.kind,
        telegraph: view.telegraph,
        hp: f.p.hp,
        maxHp: f.p.maxHp,
      };
    });
    assert.ok(result.read?.abilityId);
    assert.equal(result.telegraph, null);
    assert.equal(result.action, 'idle');
    assert.equal(result.hp, result.maxHp);
    await page.waitForSelector('.hud-forethought');
    assert.match(await page.locator('.hud-forethought').textContent(), /^Next: /);
    await page.evaluate(async () => {
      const f = window.fixture;
      const s = { ...f.w.serialize(), events: [], localPlayerId: f.p.id, arena: f.w.arena };
      for (let i = 0; i < 30; i++) {
        await new Promise(requestAnimationFrame);
        f.renderer.render(s);
      }
    });
    if (process.env.SHOT_DIR)
      await page.screenshot({ path: `${process.env.SHOT_DIR}/forethought-${width}.png` });
    const next = result.read.abilityId;
    const actual = await page.evaluate(() => {
      const f = window.fixture;
      // Reposition after the forecast; its ID stays committed, its aim does not.
      f.p.pos = { x: 600, y: 700 };
      for (let i = 0; i < 40 && f.b.action.kind === 'idle'; i++) f.step({});
      return {
        id: f.b.action.abilityId,
        kind: f.b.action.kind,
        read: f.w.serialize().bosses[0].forethought,
      };
    });
    assert.equal(actual.id, next);
    assert.equal(actual.kind, 'windup');
    assert.equal(actual.read, undefined);
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${width}px: actual Hex/basic read, public advance forecast, unchanged timing and committed next move`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
