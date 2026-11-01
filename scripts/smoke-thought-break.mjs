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
    await page.route('**/__thought-break', (r) =>
      r.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="world" style="position:absolute;inset:0"></div><div id="ui"></div>',
      }),
    );
    await page.goto(`${process.env.SMOKE_DEV_URL || 'http://127.0.0.1:5173'}/__thought-break`);
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
        monsterId: 'dragon',
        players: [
          {
            peerId: 'a',
            name: 'Doom',
            classId: 'warlock',
            charUpgrades: ['wa_great_old_one_g_b'],
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
      b.pos = { x: 620, y: 400 };
      b.hp = b.maxHp = 10000;
      b.moveSpeed = 0;
      b.decisionTimer = 100;
      const renderer = await Renderer.create(document.querySelector('#world'), w.arena);
      useStore.setState({
        localClass: 'warlock',
        myCharUpgrades: ['wa_great_old_one_g_b'],
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
      const windup = () => {
        const ab = w.monsterDef.abilities.find((a) => a.shape === 'cone');
        b.action = {
          ...b.action,
          kind: 'windup',
          abilityId: ab.id,
          remaining: 2,
          total: 2,
          aimAngle: Math.PI,
          targetId: p.id,
          targetPos: { ...p.pos },
        };
        publish();
        return ab.id;
      };
      createRoot(document.querySelector('#ui')).render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(HUD),
          React.createElement(TouchControls),
        ),
      );
      window.fixture = { w, p, b, renderer, publish, step, windup };
      publish();
    });
    const mobile = width === 320;
    if (mobile) {
      const button = page.locator('.wb-touch-btn-a3');
      await button.waitFor();
      const r = await button.boundingBox();
      assert.ok(r);
      await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
      await page.mouse.down();
      await page.evaluate(() => window.fixture.step());
      await page.mouse.up();
      await page.evaluate(() => window.fixture.step());
    } else {
      await page.evaluate(() => window.fixture.step({ a3: true }));
      await page.evaluate(() => window.fixture.step({ a3: false }));
    }
    await page.waitForFunction(() => document.body.textContent.includes('Thought Break prepared'));
    const abilityId = await page.evaluate(() => window.fixture.windup());
    assert.ok(await page.evaluate(() => window.fixture.w.serialize().bosses[0].telegraph));
    const hp = await page.evaluate(() => window.fixture.p.hp);
    if (mobile) {
      const button = page.locator('.wb-touch-btn-a2');
      const r = await button.boundingBox();
      assert.ok(r);
      await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
      await page.mouse.down();
      await page.evaluate(() => window.fixture.step());
      await page.mouse.up();
    } else await page.evaluate(() => window.fixture.step({ a2: true }));
    const result = await page.evaluate((id) => {
      const f = window.fixture,
        s = f.w.serialize();
      return {
        kind: f.b.action.kind,
        cooldown: f.b.cooldowns[id],
        recovery: s.bosses[0].buffs.find((b) => b.kind === 'thoughtBreakRecovery'),
        telegraph: s.bosses[0].telegraph,
        prepared: f.p.buffs.some((b) => b.kind === 'spellSurge'),
        hp: f.p.hp,
        cue: s.events.some((e) => e.t === 'cast' && e.ability === 'Thought broken'),
      };
    }, abilityId);
    assert.equal(result.kind, 'recover');
    assert.equal(result.telegraph, null);
    assert.ok(result.cooldown > 0);
    assert.ok(result.recovery.remaining > 7);
    assert.equal(result.prepared, false);
    assert.equal(result.hp, hp);
    assert.ok(result.cue);
    await page.evaluate(async () => {
      const f = window.fixture,
        s = { ...f.w.serialize(), events: [], localPlayerId: f.p.id, arena: f.w.arena };
      for (let i = 0; i < 60; i++) {
        await new Promise(requestAnimationFrame);
        f.renderer.render(s);
      }
    });
    const spellName = await page.evaluate(() => window.fixture.p.abilities.a2.name);
    assert.ok(
      await page
        .locator('.hud-ability')
        .filter({ has: page.locator('.hud-ability-name', { hasText: spellName }) })
        .locator('.hud-cd-num')
        .textContent(),
    );
    if (process.env.SHOT_DIR)
      await page.screenshot({ path: `${process.env.SHOT_DIR}/thought-break-${width}.png` });
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${width}px: native prepared cue, real special cancels telegraph, normal cooldown and public recovery`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
