/** Actual grand selection, pointer/stick steering, host replication and renderer evidence. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless: true,
});
try {
  for (const width of [1280, 320])
    for (const pick of [
      'so_wild_surge',
      'so_wild_tides',
      'so_wild_bend',
      'so_wild_font',
      'forge',
    ]) {
      const page = await browser.newPage({
        viewport: { width, height: width === 320 ? 568 : 800 },
        isMobile: width === 320,
        hasTouch: width === 320,
      });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route('**/__guidance', (r) =>
        r.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="world" style="position:absolute;inset:0"></div><div id="ui"></div><div id="select" style="position:absolute;inset:0;overflow:auto;background:#15151d;z-index:10"></div>',
        }),
      );
      await page.goto(`${process.env.SMOKE_DEV_URL || 'http://127.0.0.1:5173'}/__guidance`);
      await page.evaluate(async (pick) => {
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
        useStore.getState().setActiveChaosForge(false);
        useStore.getState().setActiveRunSeed(null);
        const context = {
          classes: ['sorcerer'],
          history: [],
          subSkills: [pick === 'forge' ? 'so_wild_surge' : pick],
        };
        let value = normalizeGrandLoadout(undefined, context);
        const root = createRoot(document.querySelector('#select'));
        function render() {
          window.guideLoadout = value;
          root.render(
            React.createElement(GrandManager, {
              context,
              value,
              credit: true,
              onChange: (r) => {
                value = changeGrand(value, context, r, true);
                if (!value) throw Error('Grand rejected');
                render();
              },
            }),
          );
        }
        render();
      }, pick);
      await page.getByLabel('New grand').selectOption('so_wild_g_b');
      const unlock = page.getByRole('button', { name: 'Unlock grand', exact: true });
      if (width === 320) await unlock.tap();
      else await unlock.click();
      await page.getByRole('status').filter({ hasText: '1/4 equipped' }).waitFor();
      await page.evaluate(
        async ({ pick, width }) => {
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
          const { synthesizeAbility } = await import('/src/engine/content/forge.ts');
          const { guidedSpell } = await import('/src/engine/content/guidanceRules.ts');
          const { Renderer } = await import('/src/render/pipeline/renderer.ts');
          const skill = pick === 'forge' ? 'so_wild_surge' : pick;
          const w = new World({
            seed: 31,
            monsterId: 'lich',
            players: [
              {
                peerId: 'a',
                name: 'Crossing',
                classId: 'sorcerer',
                subSkills: [skill],
                grandLoadout: window.guideLoadout,
                extraClasses: ['mage'],
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
          b.pos = { x: 1400, y: 700 };
          b.moveSpeed = 0;
          b.decisionTimer = 1000;
          if (pick === 'forge') {
            const source = p.abilities.a1;
            let made;
            for (let seed = 0; seed < 32 && !made; seed++) {
              const candidate = synthesizeAbility(
                seed,
                'guided',
                'a1',
                [
                  {
                    name: 'Guided source',
                    classId: 'sorcerer',
                    className: 'Sorcerer',
                    slot: 'a1',
                    def: source,
                  },
                  {
                    name: 'Other shot',
                    classId: 'mage',
                    className: 'Mage',
                    slot: 'a1',
                    def: { ...source, guidedShot: undefined },
                  },
                ],
                new Set(['projectile']),
              ).def;
              if (guidedSpell(candidate)) made = candidate;
            }
            if (!made) throw Error('No actual guided synthesis');
            w.setActiveClass(p, 'mage');
            p.abilities.a1 = made;
            p.cooldowns.a1 = 0;
          }
          const slot = pick === 'so_wild_surge' ? 'sub1' : 'a1';
          const renderer = await Renderer.create(document.querySelector('#world'), w.arena);
          renderer.camera.follow(p.pos, 0);
          const keyboard = new KeyboardMouse(document.querySelector('#world'));
          const host = Object.create(Host.prototype);
          Object.assign(host, { world: w, localPlayerId: p.id, drainEvents: () => w.events });
          const interp = new SnapshotInterpolator();
          let seq = 0;
          useStore.setState({
            localClass: p.classId,
            myCharUpgrades: ['so_wild_g_b'],
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
            window.guideRemote = remote;
            pushHud(local, width === 320 ? 'touch' : 'keyboard');
            renderer.render(remote);
          }
          function step(dt = 0.05) {
            const s =
              width === 320
                ? sampleTouch()
                : keyboard.sample({ x: innerWidth / 2, y: innerHeight / 2 });
            w.step(
              dt,
              new Map([
                [
                  'a',
                  { seq: w.tick, move: s.move, aim: s.aim, buttons: s.buttons, autofire: false },
                ],
              ]),
            );
            publish();
          }
          window.guide = { w, p, b, slot, step, publish, renderer };
          publish();
        },
        { pick, width },
      );
      await page.waitForSelector(width === 320 ? '.wb-touch-btn-a1' : '.hud-ability', {
        state: 'attached',
      });
      const aim = async (dx, dy, dt) => {
        if (width === 320) {
          const box = await page.locator('.wb-touch-stick-right').boundingBox();
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width / 2 + dx * 35, box.y + box.height / 2 + dy * 35);
          await page.evaluate((dt) => window.guide.step(dt), dt);
          await page.mouse.up();
        } else {
          await page.mouse.move(width / 2 + dx * 140, 400 + dy * 140);
          await page.evaluate((dt) => window.guide.step(dt), dt);
        }
      };
      const press = async (slot) => {
        if (width === 320) {
          const box = await page
            .locator(`.wb-touch-btn-${slot === 'sub1' ? 'sub' : slot}`)
            .boundingBox();
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.evaluate(() => window.guide.step());
          await page.mouse.up();
        } else {
          const key = { a1: 'q', a2: 'e', sub1: 'z' }[slot];
          await page.keyboard.down(key);
          await page.evaluate(() => window.guide.step());
          await page.keyboard.up(key);
        }
        await page.evaluate(() => window.guide.step(0.01));
      };
      await aim(1, 0, 0.01);
      if (pick !== 'forge') await press('a2');
      await press(await page.evaluate(() => window.guide.slot));
      await page.evaluate(() => {
        const g = window.guide;
        for (let i = 0; i < 100 && g.p.castTimer > 0; i++) g.step(0.01);
        if (!g.p.guidance) throw Error('No launched guidance');
        g.c = g.p.guidance;
        g.shots = g.w.projectiles.filter((q) => q.guidance === g.c);
        g.before = g.shots.map((q) => ({
          id: q.id,
          angle: Math.atan2(q.vel.y, q.vel.x),
          speed: Math.hypot(q.vel.x, q.vel.y),
          range: q.rangeLeft,
          lifetime: q.lifetime,
        }));
        if (!g.shots.length) throw Error('No guided shots');
        if (!g.renderer.labels.some((t) => t.visible && t.text.startsWith('Steering ')))
          throw Error('Missing persistent steering label');
        if (!window.guideRemote.projectiles.some((q) => q.guidance))
          throw Error('No replicated guided shots');
      });
      await aim(0, 1, 0.1);
      await page.evaluate(() => {
        const g = window.guide;
        for (let i = 0; i < g.shots.length; i++) {
          const q = g.shots[i],
            before = g.before[i],
            delta = Math.atan2(
              Math.sin(Math.atan2(q.vel.y, q.vel.x) - before.angle),
              Math.cos(Math.atan2(q.vel.y, q.vel.x) - before.angle),
            );
          if (delta < 0.2 || delta > 0.33) throw Error(`Turn bound/input failed: ${delta}`);
          if (Math.abs(Math.hypot(q.vel.x, q.vel.y) - before.speed) > 0.001)
            throw Error('Speed changed');
          if (q.rangeLeft >= before.range || q.lifetime >= before.lifetime)
            throw Error('Budgets reset');
        }
        if (!g.renderer.projectilesLayer.context.instructions.length)
          throw Error('No rendered projectile cue');
      });
      await page.screenshot({
        path: `${process.env.SHOT_DIR || '/tmp'}/guidance-${width}-${pick}-steering.png`,
      });
      await page.evaluate(() => {
        const g = window.guide;
        for (let i = 0; i < 130; i++) g.step(0.01);
        if (g.p.guidance || window.guideRemote.players[0].guidance)
          throw Error('Guidance did not expire');
        if (g.renderer.labels.some((t) => t.visible && t.text.startsWith('Steering ')))
          throw Error('Steering indicator persisted');
      });
      assert.deepEqual(errors, []);
      console.log(`guidance ${width} ${pick}: passed`);
      await page.close();
    }
} finally {
  await browser.close();
}
