/** Select Hunter B and steer real shots with native Roll / ordinary Forge movement. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless: true,
});
try {
  for (const width of [1280, 320])
    for (const pick of [
      'rg_beast_pounce',
      'rg_beast_snare',
      'rg_beast_bond',
      'rg_beast_bite',
      'forge',
    ]) {
      const portable = pick === 'forge';
      const page = await browser.newPage({
        viewport: { width, height: width === 320 ? 568 : 800 },
        isMobile: width === 320,
        hasTouch: width === 320,
      });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route('**/__pack-hunt', (r) =>
        r.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="world" style="position:absolute;inset:0"></div><div id="ui"></div><div id="select" style="position:absolute;inset:0;overflow:auto;background:#15151d;z-index:10"></div>',
        }),
      );
      await page.goto(`${process.env.SMOKE_DEV_URL || 'http://127.0.0.1:5173'}/__pack-hunt`);
      await page.evaluate(
        async ({ pick, portable }) => {
          const refresh = (await import('/@react-refresh')).default;
          refresh.injectIntoGlobalHook(window);
          window.$RefreshReg$ = () => {};
          window.$RefreshSig$ = () => (t) => t;
          window.__vite_plugin_react_preamble_installed__ = true;
          await import('/src/ui/styles.css');
          await import('/src/ui/hud.css');
          const { React, createRoot } = await import('/scripts/browser-smoke-react.mjs');
          const { GrandManager } = await import('/src/ui/game/GrandManager.tsx');
          const { normalizeGrandLoadout, changeGrand } =
            await import('/src/engine/content/grandSelections.ts');
          const { useStore } = await import('/src/ui/state/store.ts');
          useStore.getState().setActiveChaosForge(portable);
          useStore.getState().setActiveRunSeed(portable ? 7 : null);
          const context = {
            classes: ['ranger'],
            history: [],
            subSkills: [portable ? 'rg_beast_snare' : pick],
          };
          const root = createRoot(document.querySelector('#select'));
          let loadout = normalizeGrandLoadout(undefined, context);
          const render = () => {
            window.beastLoadout = loadout;
            root.render(
              React.createElement(GrandManager, {
                context,
                value: loadout,
                credit: true,
                onChange: (request) => {
                  loadout = changeGrand(loadout, context, request, true);
                  if (!loadout) throw new Error('Grand transaction rejected');
                  render();
                },
              }),
            );
          };
          render();
        },
        { pick, portable },
      );
      await page.getByLabel('New grand').selectOption('rg_beastmaster_g_b');
      const unlock = page.getByRole('button', { name: 'Unlock grand', exact: true });
      if (width === 320) await unlock.tap();
      else await unlock.click();
      await page.getByRole('status').filter({ hasText: '1/4 equipped' }).waitFor();
      await page.evaluate(
        async ({ pick, portable }) => {
          document.querySelector('#select').style.display = 'none';
          const { World } = await import('/src/engine/world/world.ts');
          const { SnapshotInterpolator } = await import('/src/render/pipeline/interpolate.ts');
          const { Host } = await import('/src/net/session/host.ts');
          const { pushHud } = await import('/src/ui/state/hudBridge.ts');
          const { useStore } = await import('/src/ui/state/store.ts');
          const { React, createRoot } = await import('/scripts/browser-smoke-react.mjs');
          const { default: HUD } = await import('/src/ui/game/HUD.tsx');
          const { default: TouchControls } = await import('/src/ui/game/TouchControls.tsx');
          const { Renderer } = await import('/src/render/pipeline/renderer.ts');
          const skill = portable ? 'rg_beast_snare' : pick;
          const w = new World({
            seed: 31,
            monsterId: 'dragon',
            players: [
              {
                peerId: 'a',
                name: 'Beast',
                classId: 'ranger',
                subSkills: [skill],
                charUpgrades: ['rg_beastmaster_g_b'],
                grandLoadout: window.beastLoadout,
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
          b.pos = { x: 650, y: 400 };
          b.hp = b.maxHp = 10000;
          b.moveSpeed = 0;
          b.decisionTimer = 1000;
          const renderer = await Renderer.create(document.querySelector('#world'), w.arena);
          const host = Object.create(Host.prototype);
          Object.assign(host, { world: w, localPlayerId: p.id, drainEvents: () => w.events });
          const interp = new SnapshotInterpolator();
          let seq = 0;
          useStore.setState({
            localClass: 'ranger',
            myCharUpgrades: ['rg_beastmaster_g_b'],
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
            window.packRemote = remote.players.find((x) => x.id === p.id).spiritCompanion;
            pushHud(local, 'keyboard');
            renderer.render(remote);
          }
          function step(basic = false, move = { x: 0, y: 0 }) {
            w.step(
              0.01,
              new Map([
                [
                  'a',
                  {
                    seq: w.tick,
                    autofire: true,
                    move,
                    aim: { x: 1, y: 0 },
                    buttons: { basic, a1: false, a2: false, a3: false, revive: false },
                  },
                ],
              ]),
            );
            publish();
          }
          window.pack = { w, p, b, step, publish };
          step();
        },
        { pick, portable },
      );
      await page.waitForSelector('.hud-ability', { state: 'attached' });
      assert.equal(await page.evaluate(() => window.packRemote?.flankers?.length), 2);
      assert.equal(await page.evaluate(() => !!window.packRemote?.quarry), false);
      await page.screenshot({
        path: `${process.env.SHOT_DIR || '/tmp'}/pack-idle-${width}-${pick}.png`,
      });
      await page.evaluate(() => {
        const f = window.pack;
        f.step(true);
        for (let i = 0; i < 150 && !f.p.spiritCompanion?.hunt; i++) f.step();
        if (!f.p.spiritCompanion?.hunt) throw new Error('Fresh basic never designated a quarry');
        for (let i = 0; i < 50; i++) f.step();
      });
      assert.ok(await page.evaluate(() => window.packRemote?.quarry?.remaining > 0));
      assert.equal(await page.evaluate(() => window.packRemote?.flankers?.length), 2);
      assert.equal(
        await page.evaluate(
          () => window.packRemote.flankers[0].pos.y === window.packRemote.flankers[1].pos.y,
        ),
        false,
      );
      await page.waitForFunction(() =>
        [...document.querySelectorAll('[title]')].some((el) =>
          el.title.includes('held attacks do not retarget'),
        ),
      );
      await page.screenshot({
        path: `${process.env.SHOT_DIR || '/tmp'}/pack-hunt-${width}-${pick}.png`,
      });
      await page.evaluate(async () => {
        const f = window.pack,
          before = f.b.hp;
        for (let i = 0; i < 250; i++) f.step(false, { x: -1, y: 0 });
        const delta = (await import('/src/engine/core/torus.ts')).dist;
        if (!(delta(f.p.pos, f.b.pos) > 600)) throw new Error('Owner never left activation range');
        if (!f.p.spiritCompanion?.hunt || !window.packRemote?.quarry)
          throw new Error('Distance cancelled an active hunt');
        if (!(f.b.hp < before))
          throw new Error('Wolf failed to bite while hero moved without attacking');
        for (let i = 0; i < 400; i++) f.step();
        if (f.p.spiritCompanion?.hunt) throw new Error('Hunt never expired');
        if (f.p.spiritCompanion?.flankers?.length !== 2) throw new Error('Idle pack disappeared');
        const hp = f.b.hp;
        for (let i = 0; i < 300; i++) f.step();
        if (f.b.hp !== hp) throw new Error('Wolf attacked without a new command');
        for (const wolf of [f.p.spiritCompanion, ...f.p.spiritCompanion.flankers])
          if (delta(wolf.pos, f.p.pos) > 90) throw new Error('Pack failed to return to owner');
      });
      await page.evaluate(() => {
        const f = window.pack;
        for (let i = 0; i < 250; i++) f.step(false, { x: 1, y: 0 });
        let previous,
          starts = 0,
          lastRemaining = 0;
        for (let i = 0; i < 1400; i++) {
          f.step(true);
          const h = f.p.spiritCompanion?.hunt;
          if (h && h !== previous) {
            if (previous && previous.remaining > 0)
              throw new Error('Held basic replaced an active hunt');
            starts++;
          } else if (h && h.remaining >= lastRemaining)
            throw new Error('Held basic extended active duration');
          previous = h;
          lastRemaining = h?.remaining ?? 0;
        }
        if (starts < 2) throw new Error('Held basic failed to start later hunts');
      });
      assert.deepEqual(errors, []);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        false,
      );
      console.log(
        `PASS Pack Tactics ${width}px ${pick}: actual selection, fresh command, remote quarry lease, autonomous bites, expiry`,
      );
      await page.close();
    }
} finally {
  await browser.close();
}
