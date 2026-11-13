/** Production grand selection + real input, fixed-origin contact and remote Pixi shadows. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless: true,
});
try {
  for (const width of [1280, 320])
    for (const skill of [
      'mo_shadow_dart',
      'mo_shadow_step',
      'mo_shadow_cloud',
      'mo_shadow_strike',
      'forge',
    ]) {
      const portable = skill === 'forge';
      const page = await browser.newPage({
        viewport: { width, height: width === 320 ? 568 : 800 },
        isMobile: width === 320,
        hasTouch: width === 320,
      });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route('**/__shadow-commit', (r) =>
        r.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="world" style="position:absolute;inset:0"></div><div id="ui"></div><div id="select" style="position:absolute;inset:0;overflow:auto;background:#15151d;z-index:10"></div>',
        }),
      );
      await page.goto(`${process.env.SMOKE_DEV_URL || 'http://127.0.0.1:5173'}/__shadow-commit`);
      await page.evaluate(
        async ({ skill, portable }) => {
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
            classes: ['monk'],
            history: [],
            subSkills: [portable ? 'mo_shadow_cloud' : skill],
          };
          const root = createRoot(document.querySelector('#select'));
          let loadout = normalizeGrandLoadout(undefined, context);
          const render = () => {
            window.shadowLoadout = loadout;
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
        { skill, portable },
      );
      await page.getByLabel('New grand').selectOption('mo_shadow_g_b');
      const unlock = page.getByRole('button', { name: 'Unlock grand', exact: true });
      if (width === 320) await unlock.tap();
      else await unlock.click();
      await page.getByRole('status').filter({ hasText: '1/4 equipped' }).waitFor();
      await page.evaluate(
        async ({ skill, portable }) => {
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
          const { Renderer } = await import('/src/render/pipeline/renderer.ts');
          const { resolvedShadowCommit } = await import('/src/engine/content/classes.ts');
          const chosen = portable ? 'mo_shadow_cloud' : skill;
          const w = new World({
            seed: 31,
            monsterId: 'dragon',
            players: [
              {
                peerId: 'a',
                name: 'Shadow Monk',
                classId: 'monk',
                subSkills: [chosen],
                grandLoadout: window.shadowLoadout,
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
          b.pos = { x: 1000, y: 700 };
          b.hp = b.maxHp = 10000;
          b.moveSpeed = 0;
          b.decisionTimer = 1000;
          const renderer = await Renderer.create(document.querySelector('#world'), w.arena);
          useStore.setState({
            localClass: 'monk',
            myCharUpgrades: ['mo_shadow_g_b'],
            mySubSkills: [chosen],
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
            pushHud(local, 'keyboard');
            renderer.render(remote);
            window.shadowRemote = remote.players[0].shadowCommits;
          };
          const step = (buttons = {}, move = { x: 0, y: 0 }, dt = 0.01) => {
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
          const slot = portable
            ? Object.values(p.abilities).find((a) => a.kind === 'pbaoe' && resolvedShadowCommit(a))
                .slot
            : skill === 'mo_shadow_strike'
              ? 'sub1'
              : skill === 'mo_shadow_dart'
                ? 'a1'
                : 'a3';
          createRoot(document.querySelector('#ui')).render(
            React.createElement(
              React.Fragment,
              null,
              React.createElement(HUD),
              React.createElement(TouchControls),
            ),
          );
          window.fixture = { w, p, b, slot, step, publish, casts: () => casts };
          publish();
        },
        { skill, portable },
      );
      await page.waitForSelector(width === 320 ? '.wb-touch-btn-a1' : '.hud-ability');
      if (!portable)
        await page.evaluate(() => {
          const f = window.fixture;
          f.step({ a2: true }, { x: 0, y: -1 });
          for (let i = 0; i < 100 && f.p.glide; i++) f.step();
          if (!f.p.buffs.some((b) => b.kind === 'flow'))
            throw new Error('Real Step failed to prepare Flow');
        });
      await page.evaluate(() => {
        const f = window.fixture;
        f.b.pos = { x: f.p.pos.x + 80, y: f.p.pos.y };
      });
      const slot = await page.evaluate(() => window.fixture.slot);
      if (width === 320) {
        const button = page.locator(
          slot === 'sub1' ? '.wb-touch-btn-sub' : `.wb-touch-btn-${slot}`,
        );
        const box = await button.boundingBox();
        assert.ok(box);
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.evaluate(() => window.fixture.step());
        await page.mouse.up();
      } else await page.evaluate((slot) => window.fixture.step({ [slot]: true }), slot);
      const before = await page.evaluate(async () => {
        const f = window.fixture;
        if (f.b.hp !== 10000 || f.p.castTimer > 0 || f.p.glide)
          throw new Error('Original attack or body lock happened at launch');
        if (window.shadowRemote?.length !== 1) throw new Error('Missing remote committed shadow');
        return {
          origin: window.shadowRemote[0].origin,
          damage:
            f.p.shadowCommits[0].ab.damage *
            (await import('/src/engine/content/shadowRules.ts')).SHADOW_COMMIT_DAMAGE,
        };
      });
      assert.equal(
        await page.evaluate(() =>
          [...document.querySelectorAll('[title]')].some((el) => el.title.includes('after 0.6s')),
        ),
        true,
      );
      await page.evaluate(() => {
        for (let i = 0; i < 30; i++) window.fixture.step({}, { x: -1, y: 0 });
      });
      const pending = await page.evaluate(() => ({
        origin: window.shadowRemote?.[0].origin,
        x: window.fixture.p.pos.x,
        hp: window.fixture.b.hp,
      }));
      assert.deepEqual(pending.origin, before.origin);
      assert.ok(pending.x < before.origin.x - 50);
      assert.equal(pending.hp, 10000);
      await page.screenshot({
        path: `${process.env.SHOT_DIR || '/tmp'}/shadow-commit-${width}-${skill}.png`,
      });
      await page.evaluate(() => {
        for (let i = 0; i < 35; i++) window.fixture.step({}, { x: -1, y: 0 });
      });
      const after = await page.evaluate(() => ({
        hp: window.fixture.b.hp,
        casts: window.fixture.casts(),
        pending: window.shadowRemote?.length ?? 0,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
      }));
      assert.equal(after.hp, 10000 - before.damage);
      assert.equal(after.casts, 1);
      assert.equal(after.pending, 0);
      assert.equal(after.overflow, false);
      assert.deepEqual(errors, []);
      console.log(
        `PASS Shadow commitment ${width}px ${skill}: real grand selection/input, free withdrawal, remote fixed geometry, single original contact`,
      );
      await page.close();
    }
} finally {
  await browser.close();
}
