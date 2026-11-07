/** Real World input + remote snapshots + native/portable receiving kit presentation. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless: true,
});
try {
  for (const width of [1280, 320])
    for (const mode of ['push', 'step', 'portableStep']) {
      const page = await browser.newPage({
        viewport: { width, height: width === 320 ? 568 : 800 },
        hasTouch: width === 320,
        isMobile: width === 320,
      });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route('**/__battle-maneuvers', (r) =>
        r.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="world" style="position:absolute;inset:0"></div><div id="ui"></div>',
        }),
      );
      await page.goto(`${process.env.SMOKE_DEV_URL || 'http://127.0.0.1:5173'}/__battle-maneuvers`);
      await page.evaluate(async (mode) => {
        const refresh = (await import('/@react-refresh')).default;
        refresh.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => (t) => t;
        window.__vite_plugin_react_preamble_installed__ = true;
        await import('/src/ui/styles.css');
        await import('/src/ui/hud.css');
        const { World } = await import('/src/engine/world/world.ts');
        const { Host } = await import('/src/net/session/host.ts');
        const { SnapshotInterpolator } = await import('/src/render/pipeline/interpolate.ts');
        const { Renderer } = await import('/src/render/pipeline/renderer.ts');
        const { pushHud } = await import('/src/ui/state/hudBridge.ts');
        const { useStore } = await import('/src/ui/state/store.ts');
        const { sampleTouch } = await import('/src/input/touch.ts');
        const React = (await import('/node_modules/.vite/deps/react.js')).default;
        const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js'))
          .default;
        const { default: HUD } = await import('/src/ui/game/HUD.tsx');
        const { default: TouchControls } = await import('/src/ui/game/TouchControls.tsx');
        useStore.getState().setActiveChaosForge(mode === 'portableStep');
        useStore.getState().setActiveRunSeed(mode === 'portableStep' ? 7 : null);
        const id = mode === 'push' ? 'kn_battlemaster_g_a' : 'kn_battlemaster_g_b';
        const w = new World({
          seed: 31,
          monsterId: 'dragon',
          players: [
            {
              peerId: 'a',
              name: 'Battlemaster',
              classId: 'knight',
              charUpgrades: [id],
              subSkills: ['kn_battle_trip'],
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
        b.pos = { x: 600, y: 400 };
        b.moveSpeed = 0;
        b.decisionTimer = 100;
        b.blinkTimer = 100;
        b.hp = b.maxHp = 10000;
        const renderer = await Renderer.create(document.querySelector('#world'), w.arena);
        useStore.setState({
          localClass: 'knight',
          myCharUpgrades: [id],
          mySubSkills: ['kn_battle_trip'],
          autofire: false,
        });
        const host = Object.create(Host.prototype);
        Object.assign(host, { world: w, localPlayerId: p.id, drainEvents: () => w.events });
        const interp = new SnapshotInterpolator();
        let sequence = 0;
        const publish = () => {
          const local = host.getRenderState(performance.now());
          interp.push(JSON.parse(JSON.stringify({ ...w.serialize(), tick: sequence++ })));
          const remote = interp.sample(performance.now() + 200, {
            localPlayerId: p.id,
            arena: w.arena,
          });
          window.remoteManeuver = {
            player: remote.players[0].maneuver,
            boss: remote.bosses[0].maneuver,
          };
          if (p.glide?.maneuverClass)
            window.stepPayload = {
              iframes: p.glide.ab.iframes ?? 0,
              landingDamage: p.glide.ab.landingDamage ?? 0,
              healOnUse: p.glide.ab.healOnUse ?? 0,
            };
          pushHud(local, 'keyboard');
          renderer.render(remote);
        };
        const step = (buttons = {}, move = { x: 0, y: 0 }, dt = 0.05) => {
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
        window.fixture = { w, p, b, renderer, publish, step };
        publish();
      }, mode);
      const press = async (slot, move = { x: 0, y: 0 }) => {
        if (width === 320) {
          const el = page.locator(`.wb-touch-btn-${slot}`);
          await el.waitFor();
          const box = await el.boundingBox();
          assert.ok(box);
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.evaluate(({ move }) => window.fixture.step({}, move), { move });
          await page.mouse.up();
          await page.evaluate(() => window.fixture.step());
        } else {
          await page.evaluate(({ slot, move }) => window.fixture.step({ [slot]: true }, move), {
            slot,
            move,
          });
          await page.evaluate(() => window.fixture.step());
        }
      };
      const slot = await page.evaluate((mode) => {
        const f = window.fixture;
        if (mode !== 'push') f.b.pos = { x: 1200, y: 1000 };
        const carrier = Object.entries(f.p.abilities).find(
          ([slot, ab]) =>
            slot !== 'basic' && ab.maneuver?.mode === (mode === 'push' ? 'push' : 'step'),
        );
        if (!carrier) throw new Error('No receiving special');
        f.step({}, { x: 0, y: 1 }, 0.01);
        return carrier[0];
      }, mode);
      await page.waitForSelector('.hud-maneuver.ready');
      assert.equal(
        await page.evaluate(() => window.remoteManeuver.player.mode),
        mode === 'push' ? 'push' : 'step',
      );
      if (mode === 'portableStep') {
        assert.equal(await page.evaluate(() => window.remoteManeuver.player.targetId), undefined);
        assert.equal(
          await page.evaluate(
            (slot) =>
              window.fixture.p.abilities[slot].components.effects.some(
                (e) => e.kind === 'maneuver',
              ),
            slot,
          ),
          true,
        );
      }
      const still = async () =>
        page.evaluate(async () => {
          const f = window.fixture,
            s = f.w.toRenderState(f.p.id);
          s.events = [];
          for (let i = 0; i < 15; i++) {
            await new Promise(requestAnimationFrame);
            f.renderer.render(s);
          }
        });
      if (mode === 'step') {
        await page.evaluate(async () => {
          const { applyBuff, makeBuff } = await import('/src/engine/combat/combat.ts');
          applyBuff(window.fixture.p, makeBuff('silence', 0, 3, 'smoke-silence'));
          window.fixture.step({}, { x: 1, y: 1 }, 0.01);
        });
        await page.waitForSelector('.hud-silence');
        if (width === 320) {
          assert.equal(await page.locator('.hud-maneuver').isVisible(), false);
          const notice = await page.locator('.hud-silence').boundingBox(),
            control = await page.locator('.wb-touch-btn-a3').boundingBox();
          assert.ok(notice && control && notice.y + notice.height < control.y);
        }
      }
      await still();
      if (process.env.SHOT_DIR)
        await page.screenshot({
          path: `${process.env.SHOT_DIR}/battle-${mode}-ready-${width}.png`,
        });
      if (mode === 'step') {
        await press(slot, { x: 0, y: 1 });
        assert.equal(await page.evaluate(() => !!window.fixture.p.glide), false);
        await page.evaluate(() => {
          for (let i = 0; i < 70 && window.fixture.p.buffs.some((b) => b.kind === 'silence'); i++)
            window.fixture.step();
        });
      }
      if (mode === 'push')
        await page.evaluate(() => {
          const f = window.fixture;
          f.b.action = {
            ...f.b.action,
            kind: 'windup',
            abilityId: 'fireBreath',
            remaining: 2,
            total: 2,
            aimAngle: Math.PI,
            targetId: f.p.id,
            targetPos: { ...f.p.pos },
          };
          f.publish();
        });
      const before = await page.evaluate(() => ({
        player: { ...window.fixture.p.pos },
        boss: { ...window.fixture.b.pos },
      }));
      await press(slot, { x: 0, y: 1 });
      if (mode === 'push') {
        assert.deepEqual(await page.evaluate(() => window.fixture.b.pos), before.boss);
        const debug = await page.evaluate(() => ({
          cd: window.fixture.p.cooldowns.a3,
          last: window.fixture.p.maneuverLast,
          source: window.fixture.p.abilities.a3.maneuver,
          events: window.fixture.w.events,
          player: window.fixture.p.pos,
          boss: window.fixture.b.pos,
        }));
        assert.equal(
          await page.evaluate(() => window.remoteManeuver.boss?.phase),
          'queued',
          JSON.stringify(debug),
        );
        await page.waitForSelector('.hud-maneuver.queued');
        await still();
        if (process.env.SHOT_DIR)
          await page.screenshot({
            path: `${process.env.SHOT_DIR}/battle-push-queued-${width}.png`,
          });
        await page.evaluate(() => {
          for (let i = 0; i < 70; i++) window.fixture.step();
        });
        assert.ok(await page.evaluate((y) => window.fixture.b.pos.y >= y + 79, before.boss.y));
      } else {
        await page.evaluate(() => {
          for (let i = 0; i < 60 && (window.fixture.p.maneuverRecovery ?? 0) <= 0; i++)
            window.fixture.step();
          for (let i = 0; i < 5; i++) window.fixture.step();
        });
        assert.ok(await page.evaluate((y) => window.fixture.p.pos.y >= y + 179, before.player.y));
        assert.deepEqual(await page.evaluate(() => window.stepPayload), {
          iframes: 0,
          landingDamage: 0,
          healOnUse: 0,
        });
        if (mode === 'step') {
          assert.equal(
            await page.evaluate(() => window.fixture.p.buffs.some((b) => b.kind === 'invuln')),
            false,
          );
          assert.deepEqual(await page.evaluate(() => window.fixture.b.pos), before.boss);
        }
        if (mode === 'step')
          await page.evaluate(() => {
            for (let i = 0; i < 70 && window.fixture.p.buffs.some((b) => b.kind === 'silence'); i++)
              window.fixture.step();
          });
        await page.waitForSelector('.hud-maneuver.recovery');
      }
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${width}px ${mode}: real special input, remote cue, ${mode === 'push' ? 'single-hit steering preserves committed attack' : 'hit-independent 180u defensive movement'}`,
      );
      await page.close();
    }
} finally {
  await browser.close();
}
