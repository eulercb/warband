/** Real renderer + authoritative companion poses; no fixture is shipped in the production app. */
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
    await page.route('**/__companion-fixture', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}#fixture{width:100%;height:100%}</style><div id="fixture"></div>',
      }),
    );
    await page.goto(`${process.env.SMOKE_DEV_URL || 'http://127.0.0.1:5173'}/__companion-fixture`);
    await page.evaluate(async () => {
      const { Renderer } = await import('/src/render/pipeline/renderer.ts');
      const { World } = await import('/src/engine/world/world.ts');
      const { updateCompanions } = await import('/src/engine/combat/companions.ts');
      const { damageBoss } = await import('/src/engine/combat/combat.ts');
      const { resolvePlayerAbility } = await import('/src/engine/combat/abilities.ts');
      const { absorptionAmount } = await import('/src/engine/combat/absorption.ts');
      const world = new World({
        monsterId: 'lich',
        seed: 5,
        players: [
          { peerId: 'a', name: 'Beast Master', classId: 'ranger', subSkills: ['rg_beast_bond'] },
          { peerId: 'b', name: 'Ally', classId: 'knight' },
        ],
      });
      const [owner, ally] = world.players;
      const boss = world.boss;
      world.obstacles = [];
      world.terrain = [];
      const renderer = await Renderer.create(document.querySelector('#fixture'), world.arena);
      let frame = 0;
      const render = () => {
        renderer.render({ ...world.serialize(), localPlayerId: owner.id, arena: world.arena });
        frame++;
        requestAnimationFrame(render);
      };
      window.companionFixture = {
        mode(mode) {
          owner.pos = { x: 800, y: 700 };
          owner.aim = { x: 0, y: -1 };
          owner.state = 'alive';
          owner.hp = owner.maxHp;
          owner.buffs = [];
          owner.subclassPassiveCooldowns = {};
          delete owner.spiritCompanion;
          ally.pos = { x: 860, y: 700 };
          ally.hp = ally.maxHp;
          ally.buffs = [];
          boss.pos = { x: 800, y: 500 };
          boss.hp = boss.maxHp = 10000;
          boss.buffs = [];
          world.events = [];
          world.scene = null;
          if (mode !== 'absent') updateCompanions(world, 0);
          if (['bond-ready', 'attack', 'protected'].includes(mode)) {
            ally.hp -= 40;
            resolvePlayerAbility(world, owner, 'sub1', { x: 0, y: 0 });
          }
          if (mode === 'attack' || mode === 'protected') {
            damageBoss(world, owner, boss, 1, { direct: true });
            const steps = mode === 'attack' ? 6 : 30;
            for (let i = 0; i < steps; i++) updateCompanions(world, 1 / 60);
          }
          if (mode === 'downed') {
            owner.state = 'downed';
            updateCompanions(world, 0);
          }
          if (mode === 'reward') {
            world.scene = 'reward';
            updateCompanions(world, 0);
          }
          return frame;
        },
        probe() {
          return {
            frame,
            pet: world.serialize().players[0].spiritCompanion,
            privateState: owner.spiritCompanion,
            barrier: absorptionAmount(ally.buffs),
            hp: boss.hp,
            instructions: renderer.overlayLayer.context.instructions.length,
          };
        },
      };
      window.companionFixture.mode('absent');
      render();
    });
    const state = async (mode) => {
      const before = await page.evaluate((mode) => window.companionFixture.mode(mode), mode);
      await page.waitForFunction(
        (frame) => window.companionFixture.probe().frame > frame + 2,
        before,
      );
      return page.evaluate(() => window.companionFixture.probe());
    };
    const baseline = await state('absent');
    for (const mode of ['follow', 'bond-ready', 'attack', 'protected', 'downed', 'reward']) {
      const view = await state(mode);
      if (mode === 'downed' || mode === 'reward') {
        assert.equal(view.pet, undefined);
        assert.equal(view.privateState, undefined);
      } else {
        assert.ok(view.pet);
        assert.ok(view.instructions > baseline.instructions);
        assert.equal(view.pet.attacking, mode === 'attack');
        assert.equal(view.pet.bondReady, mode === 'bond-ready' || mode === 'attack');
        // The fixed Knight recipient has 240 max HP: its 8% ward is 19.2.
        assert.equal(view.barrier, mode === 'protected' ? 19.2 : 0);
        assert.equal(view.hp, mode === 'attack' ? 9999 : mode === 'protected' ? 9983 : 10000);
        assert.deepEqual(Object.keys(view.pet).sort(), ['attacking', 'bondReady', 'facing', 'pos']);
      }
      if (process.env.SHOT_DIR)
        await page.screenshot({
          path: `${process.env.SHOT_DIR}/companion-${viewport.width}x${viewport.height}-${mode}.png`,
        });
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${viewport.width}×${viewport.height} ${mode}: companion pose, actual rendering, damage/protection lifecycle`,
      );
    }
    await context.close();
  }
} catch (error) {
  if (currentPage && !currentPage.isClosed())
    await currentPage
      .screenshot({ path: `${process.env.SHOT_DIR || tmpdir()}/smoke-companions-failure.png` })
      .catch(() => {});
  throw error;
} finally {
  await browser.close();
}
