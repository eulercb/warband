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
      'rg_hunter_hail',
      'rg_hunter_mark',
      'rg_hunter_stand',
      'rg_hunter_volley',
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
      await page.route('**/__return-flight', (r) =>
        r.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="world" style="position:absolute;inset:0"></div><div id="ui"></div><div id="select" style="position:absolute;inset:0;overflow:auto;background:#15151d;z-index:10"></div>',
        }),
      );
      await page.goto(`${process.env.SMOKE_DEV_URL || 'http://127.0.0.1:5173'}/__return-flight`);
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
            subSkills: [portable ? 'rg_hunter_mark' : pick],
          };
          const root = createRoot(document.querySelector('#select'));
          let loadout = normalizeGrandLoadout(undefined, context);
          const render = () => {
            window.hunterLoadout = loadout;
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
      await page.getByLabel('New grand').selectOption('rg_hunter_g_b');
      const unlock = page.getByRole('button', { name: 'Unlock grand', exact: true });
      if (width === 320) await unlock.tap();
      else await unlock.click();
      await page.getByRole('status').filter({ hasText: '1/4 equipped' }).waitFor();
      await page.evaluate(
        async ({ pick, portable }) => {
          document.querySelector('#select').style.display = 'none';
          const { World } = await import('/src/engine/world/world.ts');
          const { Host } = await import('/src/net/session/host.ts');
          const { SnapshotInterpolator } = await import('/src/render/pipeline/interpolate.ts');
          const { pushHud } = await import('/src/ui/state/hudBridge.ts');
          const { useStore } = await import('/src/ui/state/store.ts');
          const { sampleTouch } = await import('/src/input/touch.ts');
          const { React, createRoot } = await import('/scripts/browser-smoke-react.mjs');
          const { default: HUD } = await import('/src/ui/game/HUD.tsx');
          const { default: TouchControls } = await import('/src/ui/game/TouchControls.tsx');
          const { resolvedReturningShot } = await import('/src/engine/content/classes.ts');
          const { Renderer } = await import('/src/render/pipeline/renderer.ts');
          const skill = portable ? 'rg_hunter_mark' : pick;
          const w = new World({
            seed: 31,
            monsterId: 'dragon',
            players: [
              {
                peerId: 'a',
                name: 'Hunter',
                classId: 'ranger',
                subSkills: [skill],
                grandLoadout: window.hunterLoadout,
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
          b.pos = { x: 700, y: 400 };
          b.hp = b.maxHp = 10000;
          b.moveSpeed = 0;
          b.decisionTimer = 1000;
          const add = {
            id: w.allocId(),
            pos: { x: 700, y: 230 },
            hp: 1000,
            maxHp: 1000,
            radius: 12,
            moveSpeed: 0,
            targetId: null,
            attackCd: 1000,
            buffs: [],
          };
          w.adds.push(add);
          const receiver = Object.values(p.abilities).find(resolvedReturningShot);
          if (!receiver) throw new Error('This Forge fixture lost every compatible receiver');
          const slot = receiver.slot;
          const renderer = await Renderer.create(document.querySelector('#world'), w.arena);
          useStore.setState({
            localClass: 'ranger',
            myCharUpgrades: ['rg_hunter_g_b'],
            mySubSkills: [skill],
            autofire: false,
          });
          const host = Object.create(Host.prototype);
          Object.assign(host, { world: w, localPlayerId: p.id, drainEvents: () => w.events });
          const interp = new SnapshotInterpolator();
          let seq = 0,
            casts = 0;
          const publish = () => {
            const local = host.getRenderState(performance.now());
            interp.push(JSON.parse(JSON.stringify({ ...w.serialize(), tick: seq++ })));
            const remote = interp.sample(performance.now() + 200, {
              localPlayerId: p.id,
              arena: w.arena,
            });
            window.flightRemote = remote.projectiles;
            pushHud(local, 'keyboard');
            renderer.render(remote);
          };
          const step = (buttons = {}, move = window.flightMove ?? { x: 0, y: 0 }, dt = 0.01) => {
            w.step(
              dt,
              new Map([
                [
                  'a',
                  {
                    seq: w.tick,
                    move,
                    aim: { x: 1, y: 0 },
                    buttons: { ...sampleTouch().buttons, ...buttons },
                  },
                ],
              ]),
            );
            casts += w.events.filter((e) => e.t === 'cast' && e.slot === slot).length;
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
          window.fixture = { w, p, b, add, slot, step, publish, casts: () => casts };
          publish();
        },
        { pick, portable },
      );
      await page.waitForSelector(width === 320 ? '.wb-touch-btn-a1' : '.hud-ability');
      const press = async (slot) => {
        if (width === 320) {
          const button = page.locator(`.wb-touch-btn-${slot}`);
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
      await press(slot);
      await page.evaluate(() => {
        const f = window.fixture;
        for (let i = 0; i < 200 && !f.w.projectiles.some((s) => s.returningShot); i++) f.step();
        if (!f.w.projectiles.some((s) => s.returningShot))
          throw new Error('No paid returning volley');
      });
      assert.equal(
        await page.evaluate(() =>
          [...document.querySelectorAll('[title]')].some((el) =>
            el.title.includes('60% damage per leg'),
          ),
        ),
        true,
      );
      const initial = await page.evaluate(() => {
        const f = window.fixture;
        for (let i = 0; i < 20; i++) f.step();
        return {
          count: f.casts(),
          out: window.flightRemote.some((s) => s.returnPhase === 'out'),
          addHP: f.add.hp,
        };
      });
      assert.equal(initial.out, true);
      assert.equal(initial.addHP, 1000);
      await page.screenshot({
        path: `${process.env.SHOT_DIR || '/tmp'}/return-flight-${width}-${pick}-out.png`,
      });
      await page.evaluate(() => {
        window.flightMove = { x: 0, y: -1 };
      });
      if (!portable) await press('a3');
      await page.evaluate(
        ({ portable }) => {
          const f = window.fixture;
          for (
            let i = 0;
            i < 340 && !window.flightRemote.some((s) => s.returnPhase === 'back');
            i++
          ) {
            if (portable && f.p.pos.y < 200) window.flightMove = { x: 0, y: 0 };
            if (!portable && !f.p.glide) window.flightMove = { x: 0, y: 0 };
            f.step();
          }
          if (!window.flightRemote.some((s) => s.returnPhase === 'back'))
            throw new Error('No visible return leg');
          if (!(f.p.pos.y < 350)) throw new Error('Body never changed return lane');
          window.flightMove = { x: 0, y: 0 };
          if (portable) {
            // A one-hit Forge shot needs a clear return lane for the newly entering foe.
            f.b.pos = { x: 1200, y: 700 };
            const s = f.w.projectiles.find((s) => s.returningShot?.phase === 'back');
            f.add.pos = { x: (s.pos.x + f.p.pos.x) / 2, y: (s.pos.y + f.p.pos.y) / 2 };
          }
        },
        { portable },
      );
      await page.evaluate(() => {
        const f = window.fixture;
        for (let i = 0; i < 100 && f.add.hp === 1000; i++) f.step();
        if (f.add.hp === 1000)
          throw new Error(
            `Return lane missed its new recipient: ${JSON.stringify({ body: f.p.pos, add: f.add.pos, shots: f.w.projectiles.map((s) => ({ pos: s.pos, vel: s.vel, phase: s.returningShot?.phase })) })}`,
          );
        for (let i = 0; i < 6; i++) f.step();
      });
      await page.screenshot({
        path: `${process.env.SHOT_DIR || '/tmp'}/return-flight-${width}-${pick}-back.png`,
      });
      await page.evaluate(() => {
        const f = window.fixture;
        for (let i = 0; i < 300 && f.w.projectiles.length; i++) f.step();
      });
      const result = await page.evaluate(() => ({
        casts: window.fixture.casts(),
        shots: window.fixture.w.projectiles.length,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        addHP: window.fixture.add.hp,
      }));
      assert.equal(result.casts, initial.count);
      assert.equal(result.shots, 0);
      assert.equal(result.overflow, false);
      assert.ok(result.addHP < 1000);
      assert.deepEqual(errors, []);
      console.log(
        `PASS Returning Hunter ${width}px ${pick}: actual grand/input, outward/return visuals, body-routed new recipient, finite cast`,
      );
      await page.close();
    }
} finally {
  await browser.close();
}
