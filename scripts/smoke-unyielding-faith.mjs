/** Real Shield and Lay on Hands casts with an authored boss hit. */
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
    await page.route('**/__unyielding-faith', (r) =>
      r.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="world" style="position:absolute;inset:0"></div><div id="ui"></div>',
      }),
    );
    await page.goto(`${process.env.SMOKE_DEV_URL || 'http://127.0.0.1:5173'}/__unyielding-faith`);
    await page.evaluate(
      async ({ width }) => {
        const refresh = (await import('/@react-refresh')).default;
        refresh.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => (t) => t;
        window.__vite_plugin_react_preamble_installed__ = true;
        await import('/src/ui/styles.css');
        await import('/src/ui/hud.css');
        const { React, createRoot } = await import('/scripts/browser-smoke-react.mjs');
        const { default: HUD } = await import('/src/ui/game/HUD.tsx');
        const { default: TouchControls } = await import('/src/ui/game/TouchControls.tsx');
        const { useStore } = await import('/src/ui/state/store.ts');
        const { pushHud } = await import('/src/ui/state/hudBridge.ts');
        const { Host } = await import('/src/net/session/host.ts');
        const { World } = await import('/src/engine/world/world.ts');
        const { KeyboardMouse } = await import('/src/input/keyboard.ts');
        const { sampleTouch } = await import('/src/input/touch.ts');
        const { Renderer } = await import('/src/render/pipeline/renderer.ts');
        const skill = 'pa_devotion_smite';
        const w = new World({
          seed: 31,
          monsterId: 'troll',
          players: [
            {
              peerId: 'a',
              name: 'Paladin',
              classId: 'paladin',
              subSkills: [skill],
              charUpgrades: ['pa_devotion_g_b'],
            },
          ],
        });
        w.scene = null;
        w.obstacles = [];
        w.terrain = [];
        const p = w.players[0],
          b = w.boss;
        p.pos = { x: 500, y: 400 };
        p.aim = { x: 0, y: -1 };
        b.pos = { x: p.pos.x + p.abilities.basic.range + b.radius + 210, y: p.pos.y };
        b.moveSpeed = 0;
        b.decisionTimer = 1000;
        b.hp = b.maxHp = 10000;
        const keyboard = new KeyboardMouse(document.querySelector('#world'));
        const renderer = await Renderer.create(document.querySelector('#world'), w.arena);
        const { SnapshotInterpolator } = await import('/src/render/pipeline/interpolate.ts');
        const host = Object.create(Host.prototype);
        Object.assign(host, { world: w, localPlayerId: p.id, drainEvents: () => w.events });
        const interp = new SnapshotInterpolator();
        let seq = 0;
        useStore.setState({
          localClass: p.classId,
          myCharUpgrades: ['pa_devotion_g_b'],
          mySubSkills: [skill],
          autofire: false,
        });
        createRoot(document.querySelector('#ui')).render(
          React.createElement(
            React.Fragment,
            null,
            React.createElement(HUD),
            React.createElement(TouchControls),
          ),
        );
        function publish() {
          const local = host.getRenderState(performance.now());
          interp.push(JSON.parse(JSON.stringify({ ...w.serialize(), tick: seq++ })));
          const remote = interp.sample(performance.now() + 200, {
            localPlayerId: p.id,
            arena: w.arena,
          });
          window.faithRemote = remote;
          pushHud(local, width === 320 ? 'touch' : 'keyboard');
          renderer.render(remote);
        }
        function step(dt = 0.01) {
          const s = width === 320 ? sampleTouch() : keyboard.sample(renderer.worldToScreen(p.pos));
          w.step(
            dt,
            new Map([
              ['a', { seq: w.tick, move: s.move, aim: s.aim, buttons: s.buttons, autofire: false }],
            ]),
          );
          publish();
        }
        const { getMonster } = await import('/src/engine/content/monsters.ts');
        const { resolveBossAbility } = await import('/src/engine/combat/abilities.ts');
        function strike() {
          const ab = getMonster('troll').abilities.find((a) => a.id === 'groundSlam');
          b.pos = { x: p.pos.x + 140, y: p.pos.y };
          resolveBossAbility(w, b, ab, {
            kind: 'windup',
            abilityId: ab.id,
            remaining: 0,
            total: ab.windup,
            targetId: p.id,
            targetPos: { ...p.pos },
            aimAngle: Math.PI,
            channelAccum: 0,
          });
          b.pos = { x: 1000, y: 600 };
          publish();
        }
        window.probe = { w, p, step, strike, renderer };
        publish();
      },
      { width },
    );
    await page.waitForSelector(width === 320 ? '.wb-touch-btn-a3' : '.hud-ability');
    const cast = async (slot, key) => {
      if (width === 320) {
        const box = await page.locator(`.wb-touch-btn[data-slot="${slot}"]`).boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
      } else await page.keyboard.down(key);
      await page.evaluate(() => window.probe.step());
      if (width === 320) await page.mouse.up();
      else await page.keyboard.up(key);
    };
    await cast('a3', 'r');
    await page.evaluate(() => {
      const { p, step, strike, renderer } = window.probe;
      if (
        !p.paladinAura?.faithReady ||
        !renderer.labels.some((t) => t.visible && t.text === 'Faith ready')
      )
        throw Error('Missing prepared aura');
      strike();
      if (p.hp !== p.maxHp || p.faithWound || !p.paladinAura?.faithReady)
        throw Error('Immune hit spent Faith');
      for (let i = 0; i < 130; i++) step();
      strike();
      if (!p.faithWound || p.hp >= p.maxHp || !p.paladinAura.spent.includes(p.id))
        throw Error('No deferred HP damage');
      if (
        !window.faithRemote.players[0].faithWound ||
        !renderer.labels.some((t) => t.visible && t.text.startsWith('Due '))
      )
        throw Error('No replicated wound countdown');
      for (let i = 0; i < 55; i++) step();
    });
    await page.locator('.hud-selfhp .hud-faith-warning').waitFor({ state: 'visible' });
    await page.screenshot({
      path: `${process.env.SHOT_DIR || '/tmp'}/unyielding-faith-${width}.png`,
    });
    await cast('a2', 'e');
    await page.evaluate(() => {
      const { p, step } = window.probe;
      step();
      if (p.faithWound || p.hp !== p.maxHp || p.paladinAura?.kind !== 'renewal')
        throw Error('Lay on Hands did not repay then heal');
    });
    assert.deepEqual(errors, []);
    console.log(`Unyielding Faith ${width}: passed`);
    await page.close();
  }
} finally {
  await browser.close();
}
