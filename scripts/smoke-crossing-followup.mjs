/** Real keyboard/touch casts, replicated nuclei/relays and multi-target Fortune. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless: true,
});
try {
  for (const width of [1280, 320])
    for (const mode of ['tides', 'forge', 'relay', 'fortune']) {
      const page = await browser.newPage({
        viewport: { width, height: width === 320 ? 568 : 800 },
        isMobile: width === 320,
        hasTouch: width === 320,
      });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route('**/__crossing', (r) =>
        r.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="world" style="position:absolute;inset:0"></div><div id="ui"></div>',
        }),
      );
      await page.goto(`${process.env.SMOKE_DEV_URL || 'http://127.0.0.1:5173'}/__crossing`);
      await page.evaluate(
        async ({ width, mode }) => {
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
          const { synthesizeAbility } = await import('/src/engine/content/forge.ts');
          const { guidedBurst } = await import('/src/engine/content/guidanceRules.ts');
          const { SnapshotInterpolator } = await import('/src/render/pipeline/interpolate.ts');
          const { Renderer } = await import('/src/render/pipeline/renderer.ts');
          useStore.getState().setActiveChaosForge(false);
          useStore.getState().setActiveRunSeed(null);
          const skills = mode === 'fortune' ? ['so_wild_bend', 'so_wild_surge'] : ['so_wild_tides'];
          const mods = mode === 'fortune' ? ['so_wild_bend_g'] : ['so_wild_g_b'];
          const w = new World({
            seed: 31,
            monsterId: 'lich',
            players: [
              {
                peerId: 'a',
                name: 'Crossing',
                classId: 'sorcerer',
                subSkills: skills,
                charUpgrades: mods,
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
          p.critChance = 0;
          b.pos = { x: 1400, y: 700 };
          b.moveSpeed = 0;
          b.decisionTimer = 1000;
          b.hp = b.maxHp = 10000;
          if (mode === 'fortune') {
            b.pos = { x: 700, y: 360 };
            b.radius = 28;
            w.adds.push({
              id: w.allocId(),
              pos: { x: 700, y: 440 },
              hp: 1000,
              maxHp: 1000,
              moveSpeed: 0,
              radius: 28,
              targetId: null,
              attackCd: 1000,
              buffs: [],
            });
          }
          let slot = mode === 'relay' ? 'a1' : 'sub1';
          if (mode === 'forge') {
            const source = p.subAbilities.sub1;
            let made;
            for (let seed = 0; seed < 32 && !made; seed++) {
              const candidate = synthesizeAbility(
                seed,
                'nucleus',
                'a1',
                [
                  {
                    name: source.name,
                    classId: 'sorcerer',
                    className: 'Sorcerer',
                    slot: 'sub1',
                    def: source,
                  },
                  {
                    name: 'Burst',
                    classId: 'mage',
                    className: 'Mage',
                    slot: 'a1',
                    def: { ...source, guidedBurst: undefined },
                  },
                ],
                new Set(['pbaoe']),
              ).def;
              if (guidedBurst(candidate)) made = candidate;
            }
            if (!made) throw Error('Actual nucleus synthesis failed');
            w.setActiveClass(p, 'mage');
            p.abilities.a1 = made;
            p.cooldowns.a1 = 0;
            slot = 'a1';
          }
          const keyboard = new KeyboardMouse(document.querySelector('#world'));
          const renderer = await Renderer.create(document.querySelector('#world'), w.arena);
          renderer.camera.follow(p.pos, 0);
          const host = Object.create(Host.prototype);
          Object.assign(host, { world: w, localPlayerId: p.id, drainEvents: () => w.events });
          const interp = new SnapshotInterpolator();
          let seq = 0;
          useStore.setState({
            localClass: p.classId,
            myCharUpgrades: mods,
            mySubSkills: skills,
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
            window.crossRemote = remote;
            pushHud(local, width === 320 ? 'touch' : 'keyboard');
            renderer.render(remote);
          }
          function step(dt = 0.01) {
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
          window.cross = { w, p, b, slot, step, publish, renderer };
          publish();
        },
        { width, mode },
      );
      await page.waitForSelector(width === 320 ? '.wb-touch-btn-a1' : '.hud-ability');
      const press = async (slot, dt = 0.01) => {
        if (width === 320) {
          const box = await page.locator(`.wb-touch-btn[data-slot="${slot}"]`).boundingBox();
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.evaluate((dt) => window.cross.step(dt), dt);
          await page.mouse.up();
        } else {
          const key = { a1: 'q', a2: 'e', a3: 'r', sub1: 'z', sub2: 'x' }[slot];
          await page.keyboard.down(key);
          await page.evaluate((dt) => window.cross.step(dt), dt);
          await page.keyboard.up(key);
        }
        await page.evaluate(() => window.cross.step(0.001));
      };
      // Default right aim comes from the real controls; avoid the touch aim stick's basic-fire side effect during Fortune setup.
      await page.mouse.move(width / 2 + 140, (width === 320 ? 568 : 800) / 2);
      const slot = await page.evaluate(() => window.cross.slot);
      await press(slot);
      await page.evaluate(() => {
        const g = window.cross;
        for (let i = 0; i < 100 && g.p.castTimer > 0; i++) g.step();
      });
      if (mode === 'fortune') {
        await press('sub2');
        await page.evaluate(() => {
          const g = window.cross;
          for (
            let i = 0;
            i < 150 &&
            (!g.b.buffs.some((b) => b.source === 'fortuneDelay') ||
              !g.w.adds[0].buffs.some((b) => b.source === 'fortuneDelay'));
            i++
          )
            g.step();
          for (const target of [g.b, g.w.adds[0]]) {
            if (
              !target.buffs.some((b) => b.source === 'fortuneDelay') ||
              !target.buffs.some((b) => b.kind === 'luckExposure')
            )
              throw Error('Fortune missed a volley recipient');
          }
          if (g.p.buffs.some((b) => b.kind === 'fortune')) throw Error('Fortune was not spent');
        });
      } else {
        await page.evaluate(() => {
          const g = window.cross;
          g.c = g.p.guidance;
          if (!g.c) throw Error('No guided cast');
          g.old = g.c.burst
            ? { ...g.c.burst.pos }
            : { ...g.w.projectiles.find((q) => q.guidance === g.c).pos };
          g.time = g.c.remaining;
        });
        if (mode !== 'forge') {
          await press('a3');
          await page.evaluate(() => {
            const g = window.cross;
            if (!g.c.relayed) throw Error('Phase did not relay');
            if (g.c.remaining >= g.time) throw Error('Relay reset lifetime');
            const remote = window.crossRemote;
            if (
              g.c.burst
                ? !remote.guidedBursts[0].relayed
                : !remote.projectiles.some((q) => q.guidance?.relayed)
            )
              throw Error('Relay was not replicated');
          });
        }
        if (mode !== 'relay') {
          const label =
            width === 320
              ? `.wb-touch-btn-${slot === 'sub1' ? 'sub' : slot} .wb-touch-btn-label`
              : `.hud-ability-name`;
          await page.locator(label).filter({ hasText: 'Detonate' }).waitFor();
          await press(slot);
          await page.locator(label).filter({ hasText: 'Queued' }).waitFor();
          await page.screenshot({
            path: `${process.env.SHOT_DIR || '/tmp'}/crossing-${width}-${mode}-queued.png`,
          });
          await page.evaluate(() => {
            const g = window.cross;
            if (
              !window.crossRemote.guidedBursts.length ||
              !g.renderer.zonesLayer.context.instructions.length
            )
              throw Error('No replicated/rendered burst');
            g.b.pos = { ...g.c.burst.pos };
            const hp = g.b.hp;
            for (let i = 0; i < 40; i++) g.step();
            if (g.w.guidedBursts.length || window.crossRemote.guidedBursts.length)
              throw Error('Queued burst remained');
            if (g.b.hp >= hp) throw Error('Burst did no damage');
            const after = g.b.hp;
            for (let i = 0; i < 30; i++) g.step();
            if (g.b.hp !== after) throw Error('Burst repeated');
          });
        }
      }
      assert.deepEqual(errors, []);
      console.log(`crossing follow-up ${width} ${mode}: passed`);
      await page.close();
    }
} finally {
  await browser.close();
}
