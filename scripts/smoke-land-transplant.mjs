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
      'dr_land_spike',
      'dr_land_wall',
      'dr_land_wind',
      'dr_land_spring',
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
      await page.route('**/__land-transplant', (r) =>
        r.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="world" style="position:absolute;inset:0"></div><div id="ui"></div><div id="select" style="position:absolute;inset:0;overflow:auto;background:#15151d;z-index:10"></div>',
        }),
      );
      await page.goto(`${process.env.SMOKE_DEV_URL || 'http://127.0.0.1:5173'}/__land-transplant`);
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
            classes: ['druid'],
            history: [],
            subSkills: [portable ? 'dr_land_spring' : pick],
          };
          const root = createRoot(document.querySelector('#select'));
          let loadout = normalizeGrandLoadout(undefined, context);
          const render = () => {
            window.landLoadout = loadout;
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
      await page.getByLabel('New grand').selectOption('dr_land_g_b');
      const unlock = page.getByRole('button', { name: 'Unlock grand', exact: true });
      if (width === 320) await unlock.tap();
      else await unlock.click();
      await page.getByRole('status').filter({ hasText: '1/4 equipped' }).waitFor();
      await page.evaluate(
        async ({ pick, portable, width }) => {
          document.querySelector('#select').style.display = 'none';
          const { World } = await import('/src/engine/world/world.ts');
          const { Host } = await import('/src/net/session/host.ts');
          const { SnapshotInterpolator } = await import('/src/render/pipeline/interpolate.ts');
          const { pushHud } = await import('/src/ui/state/hudBridge.ts');
          const { useStore } = await import('/src/ui/state/store.ts');
          const { React, createRoot } = await import('/scripts/browser-smoke-react.mjs');
          const { default: HUD } = await import('/src/ui/game/HUD.tsx');
          const { default: TouchControls } = await import('/src/ui/game/TouchControls.tsx');
          const { KeyboardMouse } = await import('/src/input/keyboard.ts');
          const { sampleTouch } = await import('/src/input/touch.ts');
          const { hasTransplant } = await import('/src/engine/combat/fieldTransplant.ts');
          const { Renderer } = await import('/src/render/pipeline/renderer.ts');
          const skill = portable ? 'dr_land_spring' : pick;
          const w = new World({
            seed: 31,
            monsterId: 'lich',
            players: [
              {
                peerId: 'a',
                name: 'Land',
                classId: 'druid',
                subSkills: [skill],
                charUpgrades: ['dr_land_g_b'],
                grandLoadout: window.landLoadout,
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
          b.pos = { x: 900, y: 400 };
          b.hp = b.maxHp = 10000;
          b.moveSpeed = 0;
          b.decisionTimer = 1000;
          const candidates = [
            ...Object.values(p.abilities),
            ...Object.values(p.subAbilities ?? {}),
          ].filter(hasTransplant);
          const receiver = candidates.find((a) => a.kind === 'groundZone') ?? candidates[0];
          if (!receiver) throw new Error('No retained field receiver');
          const slot = receiver.slot;
          const renderer = await Renderer.create(document.querySelector('#world'), w.arena);
          const keyboard = new KeyboardMouse(document.querySelector('#world'));
          const host = Object.create(Host.prototype);
          Object.assign(host, { world: w, localPlayerId: p.id, drainEvents: () => w.events });
          const interp = new SnapshotInterpolator();
          let seq = 0;
          useStore.setState({
            localClass: 'druid',
            myCharUpgrades: ['dr_land_g_b'],
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
            window.landRemote = remote.players.find((a) => a.id === p.id).fieldTransplants;
            pushHud(local, width === 320 ? 'touch' : 'keyboard');
            renderer.render(remote);
          }
          function step() {
            const sample =
              width === 320
                ? sampleTouch()
                : keyboard.sample({ x: innerWidth / 2, y: innerHeight / 2 });
            w.step(
              0.01,
              new Map([
                [
                  'a',
                  {
                    seq: w.tick,
                    move: sample.move,
                    aim: sample.aim,
                    buttons: sample.buttons,
                    autofire: false,
                  },
                ],
              ]),
            );
            publish();
          }
          window.land = { w, p, b, slot, step, publish, renderer };
          publish();
        },
        { pick, portable, width },
      );
      await page.waitForSelector(width === 320 ? '.wb-touch-btn-a1' : '.hud-ability', {
        state: 'attached',
      });
      const aim = async (direction) => {
        if (width === 320) {
          const box = await page.locator('.wb-touch-stick-right').boundingBox();
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width / 2 + direction * 35, box.y + box.height / 2);
          await page.evaluate(() => window.land.step());
          await page.mouse.up();
        } else await page.mouse.move(width / 2 + direction * 120, 400);
      };
      const press = async () => {
        const slot = await page.evaluate(() => window.land.slot);
        if (width === 320) {
          const box = await page
            .locator(`.wb-touch-btn-${slot === 'sub1' ? 'sub' : slot === 'sub2' ? 'sub2' : slot}`)
            .boundingBox();
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.evaluate(() => window.land.step());
          await page.mouse.up();
        } else {
          const key = { basic: 'Space', a1: 'q', a2: 'e', a3: 'r', sub1: 'z', sub2: 'x' }[slot];
          if (slot === 'basic') await page.mouse.down();
          else await page.keyboard.down(key);
          await page.evaluate(() => window.land.step());
          if (slot === 'basic') await page.mouse.up();
          else await page.keyboard.up(key);
        }
        await page.evaluate(() => window.land.step());
      };
      await aim(1);
      await press();
      await page.evaluate(() => {
        const f = window.land;
        for (let i = 0; i < 350 && !window.landRemote?.length; i++) f.step();
        if (!window.landRemote?.length) throw new Error('No rendered transplant readiness');
      });
      await aim(-1);
      await page.evaluate(() => window.land.step());
      await page.waitForFunction(() =>
        [...document.querySelectorAll('.hud-ability-name,.wb-touch-btn-label')].some(
          (el) => el.textContent === 'Transplant',
        ),
      );
      await page.evaluate(async () => {
        const f = window.land,
          t = window.landRemote[0],
          screen = f.renderer.camera.worldToScreen(t.to);
        const { transplantEdge } = await import('/src/render/pipeline/transplantVisuals.ts');
        const cue = transplantEdge(screen, { width: innerWidth, height: innerHeight });
        if (
          (screen.x < 0 || screen.x > innerWidth || screen.y < 0 || screen.y > innerHeight) &&
          !cue
        )
          throw new Error('Off-screen destination has no visible cue');
      });
      await page.screenshot({
        path: `${process.env.SHOT_DIR || '/tmp'}/land-transplant-${width}-${pick}-ready.png`,
      });
      const before = await page.evaluate(() => {
        const f = window.land,
          v = window.landRemote[0],
          z = f.w.groundZones.find((z) => z.id === v.zoneId);
        f.b.pos = { ...v.to };
        return {
          id: z.id,
          pos: z.pos,
          to: v.to,
          remaining: z.remaining,
          phase: z.tickAccum,
          cooldown: f.p.cooldowns[f.slot],
          hp: f.b.hp,
          count: f.w.groundZones.length,
        };
      });
      await press();
      await page.evaluate((before) => {
        const f = window.land,
          z = f.w.groundZones.find((z) => z.id === before.id);
        if (!z || z.pos.x !== before.to.x || z.pos.y !== before.to.y)
          throw new Error('Field failed to relocate to preview');
        if (z.remaining >= before.remaining || z.remaining < before.remaining - 0.05)
          throw new Error('Field lifetime was reset or lost');
        if (f.w.groundZones.length !== before.count) throw new Error('A duplicate field spawned');
        if (window.landRemote?.length) throw new Error('Transplant can be spent twice');
        for (let i = 0; i < 60; i++) f.step();
        if (z.damagePerTick > 0 && f.b.hp >= before.hp)
          throw new Error('Moved field did not damage its new recipient');
      }, before);
      await page.screenshot({
        path: `${process.env.SHOT_DIR || '/tmp'}/land-transplant-${width}-${pick}-moved.png`,
      });
      assert.deepEqual(errors, []);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        false,
      );
      console.log(
        `PASS Land transplant ${width}px ${pick}: grand selection, actual input, rendered destination, same field/timing, new-location payload`,
      );
      await page.close();
    }
} finally {
  await browser.close();
}
