/** Actual host input, a bent shot through a fixed conduit, and desktop/phone presentation. */
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
    await page.route('**/__infernal-aperture', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="world" style="position:absolute;inset:0"></div><div id="ui"></div>',
      }),
    );
    await page.goto(`${process.env.SMOKE_DEV_URL || 'http://127.0.0.1:5173'}/__infernal-aperture`);
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
      const { sampleTouch } = await import('/src/input/touch.ts');
      const React = (await import('/node_modules/.vite/deps/react.js')).default;
      const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
      const { default: HUD } = await import('/src/ui/game/HUD.tsx');
      const { default: TouchControls } = await import('/src/ui/game/TouchControls.tsx');
      const w = new World({
        seed: 31,
        monsterId: 'lich',
        players: [
          {
            peerId: 'a',
            name: 'Fiend',
            classId: 'warlock',
            charUpgrades: ['wa_fiend_g_a'],
            subSkills: ['wa_fiend_hurl'],
          },
        ],
      });
      w.scene = null;
      w.obstacles = [];
      w.terrain = [];
      const p = w.players[0];
      p.pos = { x: 500, y: 400 };
      p.aim = { x: 1, y: 0 };
      p.critChance = 0;
      w.boss.pos = { x: 1000, y: 400 };
      w.boss.hp = w.boss.maxHp = 10000;
      w.boss.moveSpeed = 0;
      w.boss.decisionTimer = 100;
      const renderer = await Renderer.create(document.querySelector('#world'), w.arena);
      useStore.setState({
        localClass: 'warlock',
        myCharUpgrades: ['wa_fiend_g_a'],
        mySubSkills: ['wa_fiend_hurl'],
        autofire: true,
      });
      let aim = { x: 1, y: 0 };
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
                aim,
                autofire: true,
                buttons: { ...touch.buttons, a3: held ?? touch.buttons.a3 },
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
        renderer,
        step,
        publish,
        reposition: () => {
          p.pos.y = 480;
          aim = { x: Math.SQRT1_2, y: -Math.SQRT1_2 };
          publish();
        },
      };
      publish();
    });
    const mobile = width === 320;
    if (mobile) {
      const b = page.locator('.wb-touch-btn-a3');
      await b.waitFor();
      const r = await b.boundingBox();
      assert.ok(r);
      await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
      await page.mouse.down();
      await page.evaluate(() => window.fixture.step());
    } else await page.evaluate(() => window.fixture.step(true));
    await page.waitForFunction(() => document.body.textContent.includes('Conduit 6.0s'));
    await page.evaluate(() => {
      window.fixture.reposition();
      window.fixture.step(window.innerWidth === 320 ? undefined : true);
    });
    assert.equal(
      await page.evaluate(() => window.fixture.w.projectiles.length),
      0,
      'held setup must not fire supplied ember',
    );
    const geom = await page.evaluate(
      () => window.fixture.w.serialize().players[0].infernalAperture,
    );
    assert.deepEqual(geom.entry, { x: 580, y: 400 });
    assert.deepEqual(geom.exit, { x: 820, y: 400 });
    assert.deepEqual(geom.bulwark, { pos: { x: 700, y: 400 }, radius: 48 });
    const sheltered = await page.evaluate(() => {
      const f = window.fixture,
        c = f.p.infernalAperture.bulwark;
      const from = {
        x: f.p.pos.x + (c.pos.x - f.p.pos.x) * 3,
        y: f.p.pos.y + (c.pos.y - f.p.pos.y) * 3,
      };
      const dx = f.p.pos.x - from.x,
        dy = f.p.pos.y - from.y,
        d = Math.hypot(dx, dy),
        hp = f.p.hp;
      f.w.projectiles.push({
        id: f.w.allocId(),
        kind: 'shadowBolt',
        pos: from,
        vel: { x: (dx / d) * 660, y: (dy / d) * 660 },
        ownerId: f.w.boss.id,
        side: 'boss',
        damage: 30,
        hitRadius: 8,
        impactRadius: 0,
        lifetime: 3,
        rangeLeft: 820,
      });
      f.w.updateProjectiles(d / 660);
      f.publish();
      return { hp: f.p.hp, before: hp, remaining: f.w.projectiles.length };
    });
    assert.equal(sheltered.hp, sheltered.before);
    assert.equal(sheltered.remaining, 0);
    const tile = page
      .locator('.hud-ability')
      .filter({ has: page.locator('.hud-ability-name', { hasText: 'Ember' }) });
    assert.ok(await tile.locator('.hud-cd-num').textContent());
    await page.evaluate(async () => {
      const f = window.fixture,
        state = { ...f.w.serialize(), events: [], localPlayerId: f.p.id, arena: f.w.arena };
      for (let i = 0; i < 60; i++) {
        await new Promise(requestAnimationFrame);
        f.renderer.render(state);
      }
    });
    assert.ok(
      (await page.evaluate(
        () => window.fixture.renderer.apparitionLayer.context.instructions.length,
      )) > 0,
    );
    if (process.env.SHOT_DIR)
      await page.screenshot({ path: `${process.env.SHOT_DIR}/infernal-aperture-${width}.png` });
    if (mobile) {
      await page.mouse.up();
      await page.evaluate(() => window.fixture.step());
      const b = page.locator('.wb-touch-btn-a3');
      const r = await b.boundingBox();
      assert.ok(r);
      await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
      await page.mouse.down();
      await page.evaluate(() => window.fixture.step());
      await page.mouse.up();
    } else {
      await page.evaluate(() => window.fixture.step(false));
      await page.evaluate(() => window.fixture.step(true));
    }
    const result = await page.evaluate(() => {
      const f = window.fixture;
      let transit = false,
        hidden = false;
      const initial = f.w.boss.hp;
      for (let i = 0; i < 25; i++) {
        f.step(false);
        if (f.w.projectiles.some((s) => s.apertureTransit)) {
          transit = true;
          hidden ||= f.w.serialize().projectiles.length === 0;
        }
      }
      return {
        transit,
        hidden,
        damage: initial - f.w.boss.hp,
        emberReady: f.p.infernalAperture.emberReady,
        cooldown: f.p.cooldowns.a3,
      };
    });
    assert.ok(result.transit && result.hidden, JSON.stringify(result));
    assert.ok(result.damage > 0, JSON.stringify(result));
    assert.equal(result.emberReady, false);
    assert.ok(result.cooldown > 0);
    const repaired = await page.evaluate(async () => {
      const f = window.fixture;
      f.p.pos = { x: 500, y: 400 };
      f.p.aim = { x: 1, y: 0 };
      f.p.cooldowns.a3 = 0;
      f.w.obstacles = [{ id: 999, pos: { x: 820, y: 400 }, radius: 15 }];
      f.w.tryUseAbility(f.p, 'a3', { x: 0, y: 0 }, true);
      const exit = { ...f.p.infernalAperture.exit };
      const { resolvePlayerAbility } = await import('/src/engine/combat/abilities.ts');
      const hp = f.w.boss.hp;
      resolvePlayerAbility(f.w, f.p, 'basic', { x: 0, y: 0 });
      f.w.updateProjectiles(1);
      f.publish();
      return { exit, damage: hp - f.w.boss.hp };
    });
    assert.equal(repaired.exit.x, 868);
    assert.ok(repaired.damage > 0, JSON.stringify(repaired));
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${width}px: open-arena cover absorbs enemy fire, routed shot hits, blocked exit repairs and keeps firing`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
