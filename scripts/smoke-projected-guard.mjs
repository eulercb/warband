/** Real Shield Wall input, finite swept interception and host/client-visible geometry. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless: true,
});
try {
  for (const width of [1280, 320]) {
    const page = await browser.newPage({
      viewport: { width, height: width === 320 ? 568 : 800 },
      isMobile: width === 320,
      hasTouch: width === 320,
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/__projected-guard', (r) =>
      r.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="world" style="position:absolute;inset:0"></div><div id="ui"></div>',
      }),
    );
    await page.goto(`${process.env.SMOKE_DEV_URL || 'http://127.0.0.1:5173'}/__projected-guard`);
    await page.evaluate(async () => {
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
      const { resolveBossAbility } = await import('/src/engine/combat/abilities.ts');
      const { pushHud } = await import('/src/ui/state/hudBridge.ts');
      const { useStore } = await import('/src/ui/state/store.ts');
      const { sampleTouch } = await import('/src/input/touch.ts');
      const React = (await import('/node_modules/.vite/deps/react.js')).default;
      const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
      const { default: HUD } = await import('/src/ui/game/HUD.tsx');
      const { default: TouchControls } = await import('/src/ui/game/TouchControls.tsx');
      const w = new World({
        seed: 31,
        monsterId: 'lich',
        players: [
          {
            peerId: 'a',
            name: 'Champion',
            classId: 'knight',
            charUpgrades: ['kn_champion_g_a'],
            subSkills: ['kn_champion_slam'],
          },
          { peerId: 'b', name: 'Ally', classId: 'ranger' },
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
      ally.pos = { x: 450, y: 440 };
      b.pos = { x: 700, y: 440 };
      b.moveSpeed = 0;
      b.hp = b.maxHp = 10000;
      b.decisionTimer = 100;
      const renderer = await Renderer.create(document.querySelector('#world'), w.arena);
      useStore.setState({
        localClass: 'knight',
        myCharUpgrades: ['kn_champion_g_a'],
        mySubSkills: ['kn_champion_slam'],
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
        window.remoteShield = remote.players[0].buffs.find(
          (b) => b.kind === 'frontGuard',
        )?.projectedGuard;
        pushHud(local, 'keyboard');
        renderer.render(remote);
      };
      const step = (buttons) => {
        const touch = sampleTouch();
        w.step(
          0.05,
          new Map([
            [
              'a',
              {
                seq: w.tick,
                move: { x: 0, y: 0 },
                aim: { x: 1, y: 0 },
                buttons: { ...touch.buttons, ...buttons },
              },
            ],
          ]),
        );
        publish();
      };
      const fire = () => {
        const ab = w.monsterDef.abilities.find((a) => a.shape === 'projectile');
        resolveBossAbility(w, b, ab, {
          ...b.action,
          targetId: ally.id,
          targetPos: { ...ally.pos },
          aimAngle: Math.PI,
        });
        for (const s of w.projectiles) {
          s.slowMult = 0.5;
          s.slowDuration = 2;
        }
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
      window.fixture = { w, p, ally, b, renderer, step, fire, publish };
      publish();
    });
    if (width === 320) {
      const button = page.locator('.wb-touch-btn-a2');
      await button.waitFor();
      const r = await button.boundingBox();
      assert.ok(r);
      await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
      await page.mouse.down();
      await page.evaluate(() => window.fixture.step());
      await page.mouse.up();
      await page.evaluate(() => window.fixture.step());
    } else {
      await page.evaluate(() => window.fixture.step({ a2: true }));
      await page.evaluate(() => window.fixture.step({ a2: false }));
    }
    await page.waitForSelector('.hud-buff[title*="Projected shield"]');
    assert.deepEqual(await page.evaluate(() => window.remoteShield), { reach: 60, halfWidth: 60 });
    const still = async () =>
      page.evaluate(async () => {
        const f = window.fixture,
          s = f.w.toRenderState(f.p.id);
        s.events = [];
        for (let i = 0; i < 30; i++) {
          await new Promise(requestAnimationFrame);
          f.renderer.render(s);
        }
      });
    await still();
    if (process.env.SHOT_DIR)
      await page.screenshot({ path: `${process.env.SHOT_DIR}/projected-shield-${width}.png` });
    const hit = async () =>
      page.evaluate(() => {
        const f = window.fixture;
        f.fire();
        for (let i = 0; i < 15; i++) f.step({});
        return {
          hp: f.ally.hp,
          maxHp: f.ally.maxHp,
          charges: f.p.buffs.find((b) => b.kind === 'frontGuard')?.mult,
          counter: f.p.buffs.some((b) => b.kind === 'counter'),
          slow: f.ally.buffs.some((b) => b.source === 'bossSlow'),
          remote: window.remoteShield,
        };
      });
    const first = await hit();
    assert.equal(first.hp, first.maxHp);
    assert.equal(first.charges, 1);
    assert.equal(first.counter, true);
    assert.equal(first.slow, false);
    await still();
    if (process.env.SHOT_DIR)
      await page.screenshot({ path: `${process.env.SHOT_DIR}/projected-shield-one-${width}.png` });
    const second = await hit();
    assert.equal(second.hp, second.maxHp);
    assert.equal(second.charges, undefined);
    assert.equal(second.remote, undefined);
    const third = await hit();
    assert.ok(third.hp < third.maxHp);
    assert.equal(third.slow, true);
    // The same real renderer/HUD and remote snapshot also exercise emitted-wave cover.
    await page.evaluate(async () => {
      const f = window.fixture;
      const { grantFrontGuard } = await import('/src/engine/combat/defense.ts');
      const { getMonster } = await import('/src/engine/content/monsters.ts');
      const ab = structuredClone(getMonster('dragon').abilities.find((a) => a.id === 'fireBreath'));
      f.w.monsterDef = { ...f.w.monsterDef, abilities: [...f.w.monsterDef.abilities, ab] };
      f.wave = ab;
      f.p.buffs = [];
      f.ally.buffs = [];
      f.b.pos = { x: 700, y: 400 };
      f.b.action = {
        ...f.b.action,
        kind: 'windup',
        abilityId: ab.id,
        aimAngle: Math.PI,
        targetId: f.ally.id,
        remaining: 1,
        total: 1,
      };
      grantFrontGuard(f.p, 1, 4, undefined, { reach: 60, halfWidth: 60 });
      f.publish();
    });
    assert.equal(
      await page.evaluate(() => {
        const f = window.fixture;
        return f.w
          .toRenderState(f.p.id)
          .players.find((p) => p.id === f.ally.id)
          .waveCover.includes(f.b.id);
      }),
      true,
    );
    await still();
    if (process.env.SHOT_DIR)
      await page.screenshot({ path: `${process.env.SHOT_DIR}/wave-cover-${width}.png` });
    assert.equal(
      await page.evaluate(async () => {
        const f = window.fixture;
        const { resolveBossAbility } = await import('/src/engine/combat/abilities.ts');
        const before = f.ally.hp;
        resolveBossAbility(f.w, f.b, f.wave, f.b.action);
        f.b.action.kind = 'idle';
        f.publish();
        return f.ally.hp === before && !f.p.buffs.some((b) => b.kind === 'frontGuard');
      }),
      true,
    );
    await page.evaluate(async () => {
      const f = window.fixture;
      const { resolveBossAbility } = await import('/src/engine/combat/abilities.ts');
      const { getMonster } = await import('/src/engine/content/monsters.ts');
      const ab = getMonster('beholder').abilities.find((a) => a.id === 'disintegrate');
      resolveBossAbility(f.w, f.b, ab, { ...f.b.action, targetPos: { ...f.p.pos } });
      f.publish();
    });
    await page.waitForSelector('.hud-silence');
    assert.match(await page.locator('.hud-silence').innerText(), /Silenced.*2\.0s/s);
    assert.match(await page.locator('.hud-silence').innerText(), /Basic attack available/);
    assert.ok((await page.locator('.hud-ability.silenced').count()) >= 4);
    if (width === 320) {
      assert.equal(await page.locator('.wb-touch-btn-a2').getAttribute('aria-disabled'), 'true');
      const banner = await page.locator('.hud-silence').boundingBox();
      const party = await page.locator('.hud-teammates').boundingBox();
      assert.ok(
        banner && party && banner.x >= party.x + party.width,
        'silence notice clears party health',
      );
      assert.equal(await page.locator('.wb-touch-btn-basic.silenced').count(), 0);
    }
    await still();
    if (process.env.SHOT_DIR)
      await page.screenshot({ path: `${process.env.SHOT_DIR}/silence-${width}.png` });
    await page.evaluate(async () => {
      const f = window.fixture;
      const { resolveBossAbility } = await import('/src/engine/combat/abilities.ts');
      const { getMonster } = await import('/src/engine/content/monsters.ts');
      const ab = getMonster('beholder').abilities.find((a) => a.id === 'antimagic');
      resolveBossAbility(f.w, f.b, ab, f.b.action);
      const zone = f.w.groundZones[0];
      Object.assign(zone, { pos: { ...f.p.pos }, armRemaining: 0 });
      f.w.groundZones = [zone];
      f.publish();
    });
    await page.waitForFunction(() =>
      document.querySelector('.hud-silence')?.textContent.includes('Leave the antimagic pool'),
    );
    await page.evaluate(async () => {
      const f = window.fixture;
      f.w.groundZones = [];
      const { tickBuffs } = await import('/src/engine/combat/combat.ts');
      tickBuffs(f.p, 3);
      f.publish();
    });
    await page.waitForFunction(() => !document.querySelector('.hud-silence'));
    assert.equal(await page.locator('.hud-ability.silenced').count(), 0);
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${width}px: Shield Wall input, shared finite blocks, wave cover, remote preview, Beholder silence/pool feedback and recovery`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
