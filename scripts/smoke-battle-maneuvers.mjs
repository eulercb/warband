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
      if (mode !== 'portableStep') await press('a3');
      await press('basic');
      if (mode === 'portableStep') {
        await page.evaluate(() => {
          for (let i = 0; i < 20 && !window.fixture.p.maneuverMark; i++) window.fixture.step();
        });
        const preparation = await page.evaluate(() => {
          const f = window.fixture,
            a = f.p.abilities.basic;
          return {
            mark: f.p.maneuverMark,
            kind: a.kind,
            damage: a.damage,
            range: a.range,
            radius: a.radius,
            cast: a.castTime,
            effect: a.maneuver,
            components: a.components,
            cooldown: f.p.cooldowns.basic,
            pos: f.p.pos,
            boss: { pos: f.b.pos, radius: f.b.radius, buffs: f.b.buffs, hp: f.b.hp },
            shots: f.w.projectiles.map((s) => ({
              pos: s.pos,
              range: s.rangeLeft,
              effect: s.maneuverCast?.effect,
            })),
          };
        });
        assert.equal(
          await page.evaluate(() => window.fixture.p.maneuverMark?.effect.mode),
          'step',
          JSON.stringify(preparation),
        );
      } else
        assert.equal(
          await page.evaluate(() => window.fixture.p.buffs.some((b) => b.kind === 'counter')),
          true,
        );
      // Wait for the real basic recharge while preserving counter preparation.
      await page.evaluate(() => {
        for (let i = 0; i < 100 && window.fixture.p.cooldowns.basic > 0; i++) window.fixture.step();
        window.fixture.step({}, { x: 0, y: 1 }, 0.01);
      });
      await page.waitForSelector('.hud-maneuver.ready');
      assert.equal(
        await page.evaluate(() => window.remoteManeuver.player.mode),
        mode === 'portableStep' ? 'step' : mode,
      );
      if (mode === 'portableStep') {
        assert.equal(await page.evaluate(() => window.remoteManeuver.player.portable), true);
        assert.equal(
          await page.evaluate(() => window.remoteManeuver.player.targetId === window.fixture.b.id),
          true,
        );
        await page.evaluate(() => {
          const f = window.fixture;
          for (let i = 0; i < 40; i++) {
            const dx = f.b.pos.x - f.p.pos.x,
              dy = f.b.pos.y - f.p.pos.y,
              d = Math.hypot(dx, dy);
            if (d <= f.b.radius + f.p.radius + 8) break;
            f.step({}, { x: dx / d, y: dy / d });
          }
          f.step({}, { x: 0, y: 1 }, 0.01);
        });
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
      await press('basic', { x: 0, y: 1 });
      if (mode === 'push') {
        assert.deepEqual(await page.evaluate(() => window.fixture.b.pos), before.boss);
        const debug = await page.evaluate(() => ({
          counter: window.fixture.p.buffs.filter((b) => b.kind === 'counter'),
          cd: window.fixture.p.cooldowns.basic,
          last: window.fixture.p.maneuverLast,
          source: window.fixture.p.abilities.basic.maneuver,
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
        assert.ok(await page.evaluate((y) => window.fixture.p.pos.y >= y + 89, before.player.y));
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
        `PASS ${width}px ${mode}: ${mode === 'portableStep' ? 'actual Forge mark→later direct cast input' : 'actual Bash→Opening→counter input'}, directional preparation, remote cue and ${mode === 'push' ? 'queued attack-safe enemy repositioning' : mode === 'portableStep' ? 'standalone Forge mark, marked-enemy brackets and personal step' : 'post-strike footwork without immunity'}`,
      );
      await page.close();
    }
} finally {
  await browser.close();
}
