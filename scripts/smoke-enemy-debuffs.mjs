/** Development-only real-renderer fixture: debuffs remain visible under dense hit text. */
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
    await page.route('**/__enemy-debuff-fixture', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}#fixture{width:100%;height:100%}</style><div id="fixture"></div>',
      }),
    );
    await page.goto(
      `${process.env.SMOKE_DEV_URL || 'http://127.0.0.1:5173'}/__enemy-debuff-fixture`,
    );
    await page.evaluate(async () => {
      const { Renderer } = await import('/src/render/pipeline/renderer.ts');
      const { World } = await import('/src/engine/world/world.ts');
      const { enemyDebuffs } = await import('/src/render/pipeline/enemyDebuffs.ts');
      const { isBurstControl } = await import('/src/engine/core/control.ts');
      const world = new World({
        monsterId: 'dragon',
        seed: 5,
        players: [{ peerId: 'a', name: 'Mage', classId: 'mage' }],
      });
      const owner = world.players[0];
      owner.pos = { x: 800, y: 700 };
      world.boss.pos = { x: 800, y: 440 };
      const renderer = await Renderer.create(document.querySelector('#fixture'), world.arena);
      let buffs = [];
      let frame = 0;
      const render = () => {
        world.boss.buffs = buffs;
        const state = { ...world.serialize(), localPlayerId: owner.id, arena: world.arena };
        // Enough fresh numbers to fill the normal pool, over the enemy's body and status lane.
        state.events = Array.from({ length: 40 }, (_, i) => ({
          t: 'hit',
          side: 'boss',
          targetId: world.boss.id,
          amount: 100 + i,
          pos: { x: world.boss.pos.x + ((i % 5) - 2) * 12, y: world.boss.pos.y + 60 + (i % 4) * 8 },
        }));
        renderer.render(state);
        frame++;
        requestAnimationFrame(render);
      };
      window.debuffFixture = {
        set(next) {
          buffs = next.map((b) => ({
            ...b,
            source:
              b.kind === 'curse'
                ? `curse:${b.owner === false ? owner.id + 99 : owner.id}`
                : 'fixture',
          }));
        },
        probe() {
          const snapshot = world.serialize().bosses[0];
          return {
            frame,
            kinds: enemyDebuffs(snapshot.buffs, owner.id).map((x) => x.kind),
            own: enemyDebuffs(snapshot.buffs, owner.id).some((x) => x.own),
            controlled: snapshot.buffs.some(isBurstControl),
            instructions: renderer.enemyStatusLayer.context.instructions.length,
            foreground:
              renderer.root.getChildIndex(renderer.enemyStatusLayer) >
              renderer.root.getChildIndex(renderer.fxTextLayer),
          };
        },
      };
      render();
    });
    const cases = [
      {
        name: 'slow-hit-text',
        buffs: [{ kind: 'moveSpeed', mult: 0.5, remaining: 4 }],
        controlled: true,
        kinds: ['slow'],
      },
      {
        name: 'combined',
        buffs: [
          { kind: 'stun', mult: 0, remaining: 3 },
          { kind: 'root', mult: 0, remaining: 4 },
          { kind: 'moveSpeed', mult: 0.5, remaining: 4 },
          { kind: 'castSlow', mult: 1.4, remaining: 4 },
          { kind: 'silence', mult: 0, remaining: 3 },
          { kind: 'curse', mult: 1.15, remaining: 4 },
          { kind: 'damageDealt', mult: 0.7, remaining: 4 },
          { kind: 'damageTaken', mult: 1.2, remaining: 4 },
        ],
        controlled: true,
        kinds: ['stun', 'castSlow', 'silence', 'curse', 'weak', 'vulnerable'],
        own: true,
      },
      {
        name: 'other-curse',
        buffs: [
          { kind: 'curse', mult: 1.15, remaining: 4, owner: false },
          { kind: 'castSlow', mult: 1.5, remaining: 4 },
        ],
        controlled: false,
        kinds: ['castSlow', 'curse'],
        own: false,
      },
      {
        name: 'expired',
        buffs: [
          { kind: 'root', mult: 0, remaining: 0 },
          { kind: 'moveSpeed', mult: 0.5, remaining: -1 },
        ],
        controlled: false,
        kinds: [],
      },
    ];
    for (const test of cases) {
      const previous = await page.evaluate((next) => {
        const f = window.debuffFixture;
        f.set(next);
        return f.probe().frame;
      }, test.buffs);
      await page.waitForFunction(
        (frame) => window.debuffFixture.probe().frame > frame + 2,
        previous,
      );
      const probe = await page.evaluate(() => window.debuffFixture.probe());
      assert.deepEqual(probe.kinds, test.kinds);
      assert.equal(probe.controlled, test.controlled);
      assert.equal(probe.foreground, true);
      if (test.own !== undefined) assert.equal(probe.own, test.own);
      assert.equal(probe.instructions > 0, test.kinds.length > 0);
      if (process.env.SHOT_DIR)
        await page.screenshot({
          path: `${process.env.SHOT_DIR}/enemy-${viewport.width}x${viewport.height}-${test.name}.png`,
        });
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${viewport.width}×${viewport.height} ${test.name}: foreground statuses, ownership, control semantics`,
      );
    }
    await context.close();
  }
} catch (error) {
  if (currentPage && !currentPage.isClosed())
    await currentPage
      .screenshot({ path: `${process.env.SHOT_DIR || tmpdir()}/enemy-debuff-failure.png` })
      .catch(() => {});
  throw error;
} finally {
  await browser.close();
}
