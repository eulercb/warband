/** Real support input, native hostile shot, host/client reflection and recipient visibility. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless: true,
});
try {
  for (const width of [1280, 320])
    for (const mode of ['blessing', 'warding', 'ally', 'forge']) {
      const page = await browser.newPage({
        viewport: { width, height: width === 320 ? 568 : 800 },
        isMobile: width === 320,
        hasTouch: width === 320,
      });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route('**/__reflection', (r) =>
        r.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="world" style="position:absolute;inset:0"></div><div id="ui"></div>',
        }),
      );
      await page.goto(`${process.env.SMOKE_DEV_URL || 'http://127.0.0.1:5173'}/__reflection`);
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
          const { reflectiveWard } = await import('/src/engine/content/reflectionRules.ts');
          const { getMonster } = await import('/src/engine/content/monsters.ts');
          const { resolveBossAbility } = await import('/src/engine/combat/abilities.ts');
          const { absorptionAmount } = await import('/src/engine/combat/absorption.ts');
          const { SnapshotInterpolator } = await import('/src/render/pipeline/interpolate.ts');
          const { Renderer } = await import('/src/render/pipeline/renderer.ts');
          useStore.getState().setActiveChaosForge(false);
          useStore.getState().setActiveRunSeed(null);
          const w = new World({
            seed: 31,
            monsterId: 'lich',
            players: [
              {
                peerId: 'a',
                name: 'Light',
                classId: 'cleric',
                subSkills: ['cl_light_warding'],
                charUpgrades: ['cl_light_g_b', 'cl_light_warding_g'],
                extraClasses: ['mage'],
              },
              { peerId: 'b', name: 'Ally', classId: 'mage' },
            ],
          });
          w.scene = null;
          w.obstacles = [];
          w.terrain = [];
          const p = w.players[0],
            ally = w.players[1],
            b = w.boss;
          p.pos = { x: 500, y: 400 };
          p.aim = { x: 1, y: 0 };
          p.critChance = 0;
          ally.pos = { x: 1200, y: 700 };
          b.pos = { x: 800, y: 400 };
          b.moveSpeed = 0;
          b.decisionTimer = 1000;
          b.hp = b.maxHp = 10000;
          if (mode === 'ally') {
            ally.pos = { x: 540, y: 430 };
            ally.hp -= 10;
            b.pos.y = 430;
          }
          if (mode === 'forge') {
            const native = p.abilities.a3;
            let made;
            for (let seed = 0; seed < 128 && !made; seed++) {
              const c = synthesizeAbility(
                seed,
                'reflect',
                'a3',
                ['Ward', 'Barrier', 'Blessing'].map((name) => ({
                  name,
                  classId: 'cleric',
                  className: 'Cleric',
                  slot: 'a3',
                  def: native,
                })),
                new Set(['buffAlly']),
              ).def;
              if (reflectiveWard(c)) made = c;
            }
            if (!made) throw Error('No actual reflective synthesis');
            w.setActiveClass(p, 'mage');
            p.abilities.a3 = made;
            p.cooldowns.a3 = 0;
          }
          const target = mode === 'ally' ? ally : p,
            slot = mode === 'warding' ? 'sub1' : 'a3';
          const keyboard = new KeyboardMouse(document.querySelector('#world'));
          const renderer = await Renderer.create(document.querySelector('#world'), w.arena);
          const host = Object.create(Host.prototype);
          Object.assign(host, { world: w, localPlayerId: p.id, drainEvents: () => w.events });
          const interp = new SnapshotInterpolator();
          let seq = 0;
          useStore.setState({
            localClass: p.classId,
            myCharUpgrades: ['cl_light_g_b', 'cl_light_warding_g'],
            mySubSkills: ['cl_light_warding'],
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
            window.reflectRemote = remote;
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
          function incoming() {
            const ab = getMonster('lich').abilities.find((a) => a.shape === 'projectile');
            resolveBossAbility(w, b, ab, {
              kind: 'windup',
              abilityId: ab.id,
              remaining: 0,
              total: ab.windup,
              targetId: target.id,
              targetPos: { ...target.pos },
              aimAngle: Math.PI,
              channelAccum: 0,
            });
            const q = w.projectiles.find((q) => q.side === 'boss');
            if (!q) throw Error('No real hostile projectile');
            return q;
          }
          window.reflect = {
            w,
            p,
            b,
            target,
            slot,
            step,
            publish,
            incoming,
            renderer,
            absorptionAmount,
          };
          publish();
        },
        { width, mode },
      );
      await page.waitForSelector(width === 320 ? '.wb-touch-btn-a3' : '.hud-ability');
      const slot = await page.evaluate(() => window.reflect.slot);
      if (width === 320) {
        const box = await page.locator(`.wb-touch-btn[data-slot="${slot}"]`).boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.evaluate(() => window.reflect.step());
        await page.mouse.up();
      } else {
        const key = slot === 'sub1' ? 'z' : 'r';
        await page.keyboard.down(key);
        await page.evaluate(() => window.reflect.step());
        await page.keyboard.up(key);
      }
      if (mode !== 'forge') {
        const expected = await page.evaluate(() => {
          const g = window.reflect;
          return (g.slot === 'sub1' ? g.p.subAbilities.sub1 : g.p.abilities[g.slot]).name.slice(
            0,
            5,
          );
        });
        const labels = await page
          .locator(width === 320 ? '.wb-touch-btn-label' : '.hud-ability-name')
          .allTextContents();
        if (!labels.some((s) => s.includes(expected)))
          throw Error(`Native control label mismatch: ${expected}: ${labels}`);
      }
      await page.evaluate(() => {
        const g = window.reflect;
        g.step();
        if (!window.reflectRemote.players.find((p) => p.id === g.target.id).reflectionWard)
          throw Error('Halo not replicated to actual recipient');
        if (!g.renderer.labels.some((t) => t.visible && t.text.startsWith('Reflect 1')))
          throw Error('Missing persistent charge/countdown');
        if (!g.renderer.zonesLayer.context.instructions.length) throw Error('No halo graphics');
      });
      await page.screenshot({
        path: `${process.env.SHOT_DIR || '/tmp'}/reflection-${width}-${mode}-ready.png`,
      });
      await page.evaluate(() => {
        const g = window.reflect,
          hp = g.target.hp,
          shield = g.absorptionAmount(g.target.buffs),
          q = g.incoming();
        g.q = q;
        for (let i = 0; i < 200 && !q.reflected && g.w.projectiles.includes(q); i++) g.step();
        if (!q.reflected || q.side !== 'player' || q.vel.x <= 0)
          throw Error('Hostile shot did not reverse allegiance/direction');
        if (g.target.hp !== hp || g.absorptionAmount(g.target.buffs) !== shield)
          throw Error('Reflection spent ordinary protection');
        if (window.reflectRemote.players.find((p) => p.id === g.target.id).reflectionWard)
          throw Error('Halo did not spend');
        if (!window.reflectRemote.projectiles.some((p) => p.id === q.id && p.reflected))
          throw Error('Returned shot not replicated');
        g.hpBoss = g.b.hp;
      });
      await page.screenshot({
        path: `${process.env.SHOT_DIR || '/tmp'}/reflection-${width}-${mode}-return.png`,
      });
      await page.evaluate(() => {
        const g = window.reflect;
        for (let i = 0; i < 200 && g.w.projectiles.includes(g.q); i++) g.step();
        if (g.b.hp >= g.hpBoss) throw Error('Returned shot never reached boss');
      });
      assert.deepEqual(errors, []);
      console.log(`reflection ${width} ${mode}: passed`);
      await page.close();
    }
} finally {
  await browser.close();
}
