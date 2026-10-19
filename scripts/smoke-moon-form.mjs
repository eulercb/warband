/** Development-only actual engine/renderer fixture for Moon's shape and lifecycle. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { tmpdir } from 'node:os';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless: true,
});
let currentPage;
try {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    const context = await browser.newContext({
      viewport,
      isMobile: viewport.width < 900,
      hasTouch: viewport.width < 900,
    });
    const page = await context.newPage();
    currentPage = page;
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/__moon-fixture', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}#fixture{width:100%;height:100%}</style><div id="fixture"></div>',
      }),
    );
    await page.goto(`${process.env.SMOKE_DEV_URL || 'http://127.0.0.1:5173'}/__moon-fixture`);
    await page.evaluate(async () => {
      const { Renderer } = await import('/src/render/pipeline/renderer.ts');
      const { World } = await import('/src/engine/world/world.ts');
      const { resolvePlayerAbility } = await import('/src/engine/combat/abilities.ts');
      const { maintainMoonForms } = await import('/src/engine/combat/moonForm.ts');
      const { tickBuffs } = await import('/src/engine/combat/combat.ts');
      const { tickSubclassPassives, setSubclassPassive } =
        await import('/src/engine/combat/subclassPassives.ts');
      const { playerUsesRig } = await import('/src/render/rig/registry.ts');
      const world = new World({
        monsterId: 'lich',
        seed: 5,
        players: [
          { peerId: 'a', name: 'Moon Druid', classId: 'druid', subSkills: ['dr_moon_regen'] },
        ],
      });
      world.obstacles = [];
      world.terrain = [];
      const owner = world.players[0],
        boss = world.boss;
      const renderer = await Renderer.create(document.querySelector('#fixture'), world.arena);
      let frame = 0;
      const render = () => {
        renderer.render({ ...world.serialize(), localPlayerId: owner.id, arena: world.arena });
        world.events = []; // Deliver cast/support/hit events once, as the real session does.
        frame++;
        requestAnimationFrame(render);
      };
      window.moonFixture = {
        mode(mode) {
          owner.pos = { x: 800, y: 700 };
          owner.aim = { x: 0, y: -1 };
          owner.hp = owner.maxHp;
          owner.state = 'alive';
          owner.buffs = [];
          owner.subclassPassiveCooldowns = {};
          owner.subclassPassiveId = 'moon_aspect';
          world.scene = null;
          world.projectiles = [];
          world.groundZones = [];
          world.events = [];
          boss.pos = { x: 800, y: 590 };
          boss.hp = boss.maxHp = 10000;
          boss.buffs = [];
          if (mode !== 'human') resolvePlayerAbility(world, owner, 'a2', { x: 0, y: 0 });
          if (mode === 'claw') {
            owner.hp -= 20;
            resolvePlayerAbility(world, owner, 'basic', { x: 0, y: 0 });
          }
          if (mode === 'rest' || mode === 'ready') {
            tickBuffs(owner, 6);
            tickSubclassPassives(owner, mode === 'ready' ? 12 : 6);
            maintainMoonForms(world);
          }
          if (mode === 'downed') {
            owner.state = 'downed';
            maintainMoonForms(world);
          }
          if (mode === 'swapped') {
            setSubclassPassive(owner, undefined);
            maintainMoonForms(world);
          }
          if (mode === 'reward') {
            world.scene = 'reward';
            maintainMoonForms(world);
          }
          return frame;
        },
        probe() {
          const view = world.serialize().players[0];
          return {
            frame,
            form: view.form,
            rig: playerUsesRig(view),
            hp: owner.hp,
            maxHp: owner.maxHp,
            rest: owner.buffs.find((b) => b.kind === 'moonRest')?.remaining,
            projectiles: world.projectiles.length,
            bossHp: boss.hp,
            instructions: renderer.overlayLayer.context.instructions.length,
          };
        },
      };
      window.moonFixture.mode('human');
      render();
    });
    const state = async (mode) => {
      const before = await page.evaluate((mode) => window.moonFixture.mode(mode), mode);
      await page.waitForFunction((frame) => window.moonFixture.probe().frame > frame + 2, before);
      await page.waitForTimeout(750); // Let the one-shot activation flash clear before inspecting the body.
      return page.evaluate(() => window.moonFixture.probe());
    };
    const human = await state('human');
    assert.equal(human.rig, true);
    for (const mode of ['bear', 'claw', 'rest', 'ready', 'downed', 'swapped', 'reward']) {
      const result = await state(mode);
      if (mode === 'bear' || mode === 'claw') {
        assert.equal(result.form, 'moonBear');
        assert.equal(result.rig, false);
        assert.ok(result.instructions > human.instructions);
      } else assert.equal(result.form, undefined);
      if (mode === 'claw') {
        assert.equal(result.bossHp, 9986);
        assert.ok(
          Math.abs(result.hp - (result.maxHp - 20 + Math.max(4, result.maxHp * 0.03))) < 1e-8,
        );
        assert.equal(result.projectiles, 1);
      }
      if (mode === 'rest') assert.equal(result.rest, 6);
      if (mode === 'ready') assert.equal(result.rest, undefined);
      if (process.env.SHOT_DIR)
        await page.screenshot({
          path: `${process.env.SHOT_DIR}/moon-${viewport.width}x${viewport.height}-${mode}.png`,
        });
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${viewport.width}×${viewport.height} ${mode}: form replacement, real claw/recovery, lifecycle`,
      );
    }
    await context.close();
  }
} catch (error) {
  if (currentPage && !currentPage.isClosed())
    await currentPage
      .screenshot({ path: `${process.env.SHOT_DIR || tmpdir()}/smoke-moon-failure.png` })
      .catch(() => {});
  throw error;
} finally {
  await browser.close();
}
