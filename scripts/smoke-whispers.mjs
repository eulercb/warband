/** Actual World/renderer perception fixtures, desktop and phone. No production debug API. */
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
    await page.route('**/__whispers-fixture', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}#fixture{width:100%;height:100%}</style><div id="fixture"></div>',
      }),
    );
    await page.goto(`${process.env.SMOKE_DEV_URL || 'http://127.0.0.1:5173'}/__whispers-fixture`);
    await page.evaluate(async () => {
      const { World } = await import('/src/engine/world/world.ts');
      const { Renderer } = await import('/src/render/pipeline/renderer.ts');
      const { resolvePlayerAbility } = await import('/src/engine/combat/abilities.ts');
      const { damageBoss } = await import('/src/engine/combat/combat.ts');
      const { tickWhispers, stepFear, stepCharmedAdd } =
        await import('/src/engine/combat/whispers.ts');
      let world;
      const renderer = await Renderer.create(document.querySelector('#fixture'), {
        w: 1600,
        h: 1400,
      });
      const frame = () => {
        if (world)
          renderer.render({
            ...world.serialize(),
            localPlayerId: world.players[0].id,
            arena: world.arena,
          });
        if (world) world.events = [];
        requestAnimationFrame(frame);
      };
      frame();
      window.whispersFixture = (mode) => {
        const history =
          mode === 'directed'
            ? ['ba_whispers_g_a']
            : mode === 'quarry'
              ? ['ba_whispers_g_b']
              : mode === 'charm'
                ? ['ba_whispers_words_g']
                : [];
        world = new World({
          monsterId: 'troll',
          seed: 31,
          players: [
            {
              peerId: 'a',
              name: 'Whispers',
              classId: 'bard',
              subSkills: [
                mode === 'charm'
                  ? 'ba_whispers_words'
                  : mode === 'quarry'
                    ? 'ba_whispers_mantle'
                    : 'ba_whispers_song',
              ],
              charUpgrades: history,
            },
          ],
        });
        world.scene = null;
        world.terrain = [];
        world.obstacles = [];
        const p = world.players[0],
          boss = world.boss;
        p.pos = { x: 800, y: 700 };
        p.aim = { x: 1, y: 0 };
        boss.pos = { x: 880, y: 700 };
        boss.hp = boss.maxHp = 10000;
        boss.action.kind = 'idle';
        if (mode === 'charm') {
          boss.pos = { x: 1260, y: 700 };
          world.spawnAddWave({ x: 1240, y: 700 }, 1, { minR: 0, maxR: 0 });
          resolvePlayerAbility(world, p, 'sub1', { x: 0, y: 0 });
          const z = world.groundZones.at(-1);
          z.armRemaining = 0;
          world.applyZoneTick(z);
          const add = world.adds[0];
          // A small step proves the converted actor actually attacks its old side.
          add.pos = { x: boss.pos.x - boss.radius - add.radius - 1, y: boss.pos.y };
          add.attackCd = 0;
          const hp = boss.hp;
          stepCharmedAdd(world, add, 0.05);
          tickWhispers(world, 0);
          return {
            converted: !!add.charm,
            attacked: boss.hp < hp,
            apparitions: world.serialize().apparitions,
          };
        }
        damageBoss(world, p, boss, 1, { direct: true });
        resolvePlayerAbility(world, p, 'sub1', { x: 0, y: 0 });
        const before = boss.pos.x;
        if (mode !== 'quarry') stepFear(world, boss, 0.05);
        tickWhispers(world, 0);
        return {
          mode: boss.perception?.mode,
          movement: boss.pos.x - before,
          origin: boss.perception?.pos,
          apparitions: world.serialize().apparitions,
        };
      };
    });
    for (const mode of ['fear', 'directed', 'quarry', 'charm']) {
      const state = await page.evaluate((mode) => window.whispersFixture(mode), mode);
      if (mode === 'fear') assert.ok(state.movement > 0);
      if (mode === 'directed') assert.ok(state.movement < 0);
      if (mode === 'quarry') {
        assert.equal(state.mode, 'lure');
        assert.deepEqual(state.origin, { x: 800, y: 700 });
      }
      if (mode === 'charm') {
        assert.ok(state.converted);
        assert.ok(state.attacked);
      }
      await page.waitForTimeout(900);
      if (process.env.SHOT_DIR)
        await page.screenshot({ path: `${process.env.SHOT_DIR}/whispers-${width}-${mode}.png` });
      assert.deepEqual(errors, []);
    }
    await page.close();
  }
  console.log('Whispers: fear, directed retreat, quarry and conversion pass at 1280px and 320px.');
} finally {
  await browser.close();
}
