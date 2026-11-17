/** Real field casts, genuine boss downing, and host/client recovery in solo and co-op. */
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
      await page.route('**/__life-font', (r) =>
        r.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="world" style="position:absolute;inset:0"></div><div id="ui"></div>',
        }),
      );
      await page.goto(`${process.env.SMOKE_DEV_URL || 'http://127.0.0.1:5173'}/__life-font`);
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
          const { revivalFont } = await import('/src/engine/content/fontRules.ts');
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
              charUpgrades: ['cl_life_g_a'],
              extraClasses: ['mage'],
            },
          ];
          if (mode === 'party') players.push({ peerId: 'b', name: 'Companion', classId: 'knight' });
          const w = new World({ seed: 31, monsterId: 'troll', players });
          w.scene = null;
          w.obstacles = [];
          w.terrain = [];
          w.reviveBudget = 1;
          const p = w.players[0],
            b = w.boss,
            target = mode === 'party' ? w.players[1] : p;
          p.pos = { x: 500, y: 400 };
          p.aim = { x: 1, y: 0 };
          p.critChance = 0;
          if (target !== p) target.pos = { x: 530, y: 400 };
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
              if (revivalFont(a)) made = a;
            }
            if (!made) throw Error('Actual font synthesis failed');
            w.setActiveClass(p, 'mage');
            p.abilities.a2 = made;
            p.cooldowns.a2 = 0;
          }
          const slot = mode === 'bloom' ? 'sub1' : 'a2';
          const keyboard = new KeyboardMouse(document.querySelector('#world'));
          const renderer = await Renderer.create(document.querySelector('#world'), w.arena);
          const host = Object.create(Host.prototype);
          Object.assign(host, { world: w, localPlayerId: p.id, drainEvents: () => w.events });
          const interp = new SnapshotInterpolator();
          let seq = 0;
          useStore.setState({
            localClass: p.classId,
            myCharUpgrades: ['cl_life_g_a'],
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
            window.fontRemote = remote;
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
            b.pos = { ...target.pos };
            b.dmgScale = 10;
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
            b.pos = { x: 800, y: 400 };
          }
          window.font = { w, p, b, target, slot, step, publish, strike, renderer };
          publish();
        },
        { width, mode },
      );
      await page.waitForSelector(width === 320 ? '.wb-touch-btn-a2' : '.hud-ability');
      const slot = await page.evaluate(() => window.font.slot);
      if (width === 320) {
        const box = await page.locator(`.wb-touch-btn[data-slot="${slot}"]`).boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.evaluate(() => window.font.step());
        await page.mouse.up();
      } else {
        const key = slot === 'sub1' ? 'z' : 'e';
        await page.keyboard.down(key);
        await page.evaluate(() => window.font.step());
        await page.keyboard.up(key);
      }
      await page.evaluate(() => {
        const g = window.font;
        g.step();
        if (!window.fontRemote.groundZones.some((z) => z.revivalFont))
          throw Error('No replicated ready font');
        if (!g.renderer.labels.some((t) => t.visible && t.text.startsWith('Rescue font')))
          throw Error('No field readiness label');
        g.zone = g.w.groundZones.find((z) => z.revivalFont);
      });
      if (mode === 'party') {
        if (width === 320) {
          const box = await page.locator('.wb-touch-stick-left').boundingBox();
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width / 2 - 35, box.y + box.height / 2);
          await page.evaluate(() => {
            for (let i = 0; i < 150; i++) window.font.step();
          });
          await page.mouse.up();
        } else {
          await page.keyboard.down('a');
          await page.evaluate(() => {
            for (let i = 0; i < 150; i++) window.font.step();
          });
          await page.keyboard.up('a');
        }
        await page.evaluate(() => window.font.step());
      }
      await page.screenshot({
        path: `${process.env.SHOT_DIR || '/tmp'}/life-font-${width}-${mode}-ready.png`,
      });
      await page.evaluate((mode) => {
        const g = window.font;
        g.strike();
        g.step();
        if (g.target.state !== 'downed' || g.w.finished)
          throw Error('Font did not preserve a genuine downed recovery window');
        if (g.w.groundZones.includes(g.zone) || !g.w.fontSpent.has(g.p.id))
          throw Error('Font did not consume territory and encounter attempt');
        if (
          !window.fontRemote.fontRescues?.length ||
          !window.fontRemote.players.find((p) => p.id === g.target.id).fontRecovery
        )
          throw Error('Claimed footprint/body recovery not replicated');
        for (let i = 0; i < 120; i++) g.step();
        if (g.target.state !== 'downed' || g.target.reviveProgress <= 0)
          throw Error('No noninstant channel');
        if (!g.renderer.labels.some((t) => t.visible && t.text.startsWith('Font rescue')))
          throw Error('No recovery progress label');
        if (mode === 'party' && g.p.state !== 'alive')
          throw Error('Caster could not remain active away from the body');
      }, mode);
      await page.screenshot({
        path: `${process.env.SHOT_DIR || '/tmp'}/life-font-${width}-${mode}-rescuing.png`,
      });
      await page.evaluate(() => {
        const g = window.font;
        for (let i = 0; i < 230 && g.target.state === 'downed'; i++) g.step();
        if (g.target.state !== 'alive' || Math.abs(g.target.hp - g.target.maxHp * 0.4) > 0.01)
          throw Error('Not a normal 40% revival');
        if (
          g.w.reviveBudget !== 0 ||
          g.w.fontRescues.length ||
          window.fontRemote.fontRescues?.length
        )
          throw Error('Stock/claim cleanup failed');
        if (g.w.finished) throw Error('Recovered run still finished');
      });
      assert.deepEqual(errors, []);
      console.log(`Life font ${width} ${mode}: passed`);
      await page.close();
    }
} finally {
  await browser.close();
}
