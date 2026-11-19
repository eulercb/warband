/** Real refuge casts, grounded pursuit, ally crossing and penetrating attacks. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless: true,
});
try {
  for (const width of [1280, 320])
    for (const mode of ['solo', 'bloom', 'party', 'forge']) {
      const page = await browser.newPage({
        viewport: { width, height: width === 320 ? 568 : 800 },
        isMobile: width === 320,
        hasTouch: width === 320,
      });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route('**/__living-refuge', (r) =>
        r.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="world" style="position:absolute;inset:0"></div><div id="ui"></div>',
        }),
      );
      await page.goto(`${process.env.SMOKE_DEV_URL || 'http://127.0.0.1:5173'}/__living-refuge`);
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
          const { getMonster } = await import('/src/engine/content/monsters.ts');
          const { resolveBossAbility } = await import('/src/engine/combat/abilities.ts');
          const { synthesizeAbility } = await import('/src/engine/content/forge.ts');
          const { refugeField } = await import('/src/engine/content/refugeRules.ts');
          const { SnapshotInterpolator } = await import('/src/render/pipeline/interpolate.ts');
          const { Renderer } = await import('/src/render/pipeline/renderer.ts');
          useStore.getState().setActiveChaosForge(false);
          useStore.getState().setActiveRunSeed(null);
          const skill = mode === 'bloom' ? 'cl_life_bloom' : 'cl_life_mend';
          const players = [
            {
              peerId: 'a',
              name: 'Life',
              classId: 'cleric',
              subSkills: [skill],
              charUpgrades: ['cl_life_g_b'],
              extraClasses: ['mage'],
            },
          ];
          if (mode === 'party') {
            players.push({ peerId: 'b', name: 'Companion', classId: 'knight' });
            players.push({ peerId: 'c', name: 'Companion 2', classId: 'ranger' });
          }
          const w = new World({ seed: 31, monsterId: 'troll', players });
          w.scene = null;
          w.obstacles = [];
          w.terrain = [];
          w.reviveBudget = 0;
          const p = w.players[0],
            b = w.boss,
            target = mode === 'party' ? w.players[1] : p;
          p.pos = { x: 500, y: 400 };
          p.aim = { x: 1, y: 0 };
          p.critChance = 0;
          if (target !== p)
            w.players.slice(1).forEach((ally, i) => {
              ally.pos = { x: 500, y: 340 + i * 120 };
            });
          b.pos = { x: 800, y: 400 };
          b.moveSpeed = 0;
          b.decisionTimer = 1000;
          b.hp = b.maxHp = 10000;
          if (mode === 'forge') {
            const native = p.abilities.a2;
            let made;
            for (let seed = 0; seed < 128 && !made; seed++) {
              const a = synthesizeAbility(
                seed,
                'font',
                'a2',
                ['Font', 'Grove', 'Sanctuary'].map((name) => ({
                  name,
                  classId: 'cleric',
                  className: 'Cleric',
                  slot: 'a2',
                  def: native,
                })),
                new Set(['groundZone']),
              ).def;
              if (refugeField(a)) made = a;
            }
            if (!made) throw Error('Actual font synthesis failed');
            w.setActiveClass(p, 'mage');
            p.abilities.a2 = made;
            p.cooldowns.a2 = 0;
          }
          const slot = 'a2';
          const keyboard = new KeyboardMouse(document.querySelector('#world'));
          const renderer = await Renderer.create(document.querySelector('#world'), w.arena);
          const host = Object.create(Host.prototype);
          Object.assign(host, { world: w, localPlayerId: p.id, drainEvents: () => w.events });
          const interp = new SnapshotInterpolator();
          let seq = 0;
          useStore.setState({
            localClass: p.classId,
            myCharUpgrades: ['cl_life_g_b'],
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
            window.refugeRemote = remote;
            pushHud(local, width === 320 ? 'touch' : 'keyboard');
            renderer.render(remote);
          }
          function step(dt = 0.01) {
            const s =
              width === 320 ? sampleTouch() : keyboard.sample(renderer.worldToScreen(p.pos));
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
          function strike() {
            const ab = getMonster('troll').abilities.find((a) => a.id === 'groundSlam');

            resolveBossAbility(w, b, ab, {
              kind: 'windup',
              abilityId: ab.id,
              remaining: 0,
              total: ab.windup,
              targetId: target.id,
              targetPos: { ...target.pos },
              aimAngle: 0,
              channelAccum: 0,
            });
          }
          window.refuge = { w, p, b, target, slot, step, publish, strike, renderer };
          publish();
        },
        { width, mode },
      );
      await page.waitForSelector(width === 320 ? '.wb-touch-btn-a2' : '.hud-ability');
      const slot = await page.evaluate(() => window.refuge.slot);
      if (width === 320) {
        const box = await page.locator(`.wb-touch-btn[data-slot="${slot}"]`).boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.evaluate(() => window.refuge.step());
        await page.mouse.up();
      } else {
        const key = slot === 'sub1' ? 'z' : 'e';
        await page.keyboard.down(key);
        await page.evaluate(() => window.refuge.step());
        await page.keyboard.up(key);
      }
      await page.evaluate(() => {
        const g = window.refuge;
        g.step();
        const r = window.refugeRemote.refuges?.[0];
        if (!r || !g.renderer.labels.some((t) => t.visible && t.text.startsWith('Refuge ·')))
          throw Error('No replicated visible refuge');
        g.zone = g.w.groundZones.find((z) => z.refuge);
        g.center = { ...r.pos };
        g.radius = r.radius;
      });
      if (mode === 'party') {
        const walk = async (right) => {
          if (width === 320) {
            const box = await page.locator('.wb-touch-stick-left').boundingBox();
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.mouse.down();
            await page.mouse.move(
              box.x + box.width / 2 + (right ? 90 : -90),
              box.y + box.height / 2,
            );
          } else await page.keyboard.down(right ? 'd' : 'a');
          await page.evaluate(() => {
            for (let i = 0; i < 80; i++) window.refuge.step();
          });
          if (width === 320) await page.mouse.up();
          else await page.keyboard.up(right ? 'd' : 'a');
          await page.evaluate(() => window.refuge.step());
        };
        await walk(true);
        await page.evaluate(() => {
          const g = window.refuge;
          if (g.p.pos.x - g.center.x < 145) throw Error('Ally could not leave refuge');
        });
        await walk(false);
        await page.evaluate(() => {
          const g = window.refuge;
          if (Math.abs(g.p.pos.x - g.center.x) > 25) throw Error('Ally could not re-enter refuge');
        });
      }
      await page.evaluate(() => {
        const g = window.refuge;
        g.b.moveSpeed = 180;
        for (let i = 0; i < 165; i++) g.step();
        const d = Math.hypot(g.b.pos.x - g.center.x, g.b.pos.y - g.center.y);
        if (d < g.radius + g.b.radius - 0.05) throw Error('Grounded boss crossed refuge');
        if (!window.refugeRemote.refuges?.length)
          throw Error('Refuge expired before encounter proof');
        g.b.moveSpeed = 0;
        if (g.w.players.length === 1) {
          g.b.pos = { x: g.center.x + 70, y: g.center.y };
          g.b.buffs.push({ kind: 'root', mult: 0, remaining: 2, source: 'fixture' });
          g.b.buffs.push({ kind: 'flight', mult: 0, remaining: 2, source: 'fixture' });
          g.step();
          const traveled = g.b.pos.x - g.center.x;
          if (traveled <= 70 || traveled >= g.radius + g.b.radius)
            throw Error('Refuge did not start a timed ejection');
          for (let i = 0; i < 40; i++) g.step();
          if (g.b.pos.x - g.center.x < g.radius + g.b.radius)
            throw Error('Rooted flyer was not expelled');
          g.b.pos.x -= 3;
        }

        const health = () =>
          g.p.hp +
          g.p.buffs.reduce(
            (n, b) => (b.kind === 'absorption' && b.remaining > 0 ? Math.max(n, b.mult) : n),
            0,
          );
        const hp = health();
        g.strike();
        g.publish();
        if (health() >= hp) throw Error('Refuge wrongly granted area damage immunity');
      });
      await page.screenshot({
        path: `${process.env.SHOT_DIR || '/tmp'}/living-refuge-${width}-${mode}.png`,
      });
      await page.evaluate(() => {
        const g = window.refuge;
        for (let i = 0; i < 420; i++) g.step();
        if (
          window.refugeRemote.refuges?.length ||
          g.renderer.labels.some((t) => t.visible && t.text.startsWith('Refuge ·'))
        )
          throw Error('Stale refuge after expiry');
      });
      assert.deepEqual(errors, []);
      console.log(`Living refuge ${width} ${mode}: passed`);
      await page.close();
    }
} finally {
  await browser.close();
}
