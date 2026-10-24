/** Real engine/renderer fixtures at desktop and touch sizes; input regression has separate smoke suites. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless: true,
});
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
    for (const classId of ['rogue', 'warlock'])
      for (const composed of [false, true]) {
        const page = await context.newPage(),
          errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.route('**/__upgrade-fixture', (route) =>
          route.fulfill({
            contentType: 'text/html',
            body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}#fixture{width:100%;height:100%}</style><div id="fixture"></div>',
          }),
        );
        await page.goto(
          `${process.env.SMOKE_DEV_URL || 'http://127.0.0.1:5173'}/__upgrade-fixture`,
        );
        const result = await page.evaluate(
          async ({ classId, composed }) => {
            const { World } = await import('/src/engine/world/world.ts');
            const { Renderer } = await import('/src/render/pipeline/renderer.ts');
            const { ARENA_W, ARENA_H } = await import('/src/engine/core/constants.ts');
            const { resolvePlayerAbility } = await import('/src/engine/combat/abilities.ts');
            const { applyBuff, makeBuff, damageBoss } =
              await import('/src/engine/combat/combat.ts');
            const { decompose, recompose } = await import('/src/engine/content/forge.ts');
            const { updateUpgradeZone } = await import('/src/engine/combat/skillRetouches.ts');
            const w = new World({
              monsterId: 'lich',
              seed: 31,
              players: [
                {
                  peerId: 'a',
                  name: 'Pilot',
                  classId,
                  charUpgrades:
                    classId === 'rogue'
                      ? ['ro_assassin', 'ro_poison', 'ro_grand_venom']
                      : ['wa_hex', 'wa_rebuke', 'wa_grand_ruin'],
                },
              ],
            });
            w.scene = null;
            w.obstacles = [];
            w.terrain = [];
            const p = w.players[0],
              boss = w.boss;
            p.pos = { x: 800, y: 700 };
            p.aim = { x: 0, y: -1 };
            p.critChance = 0;
            boss.pos = { x: 800, y: 630 };
            boss.hp = boss.maxHp = 10000;
            boss.buffs = [];
            if (composed)
              for (const slot of ['a1', 'a2', 'a3'])
                p.abilities[slot] = recompose(decompose(p.abilities[slot]), p.abilities[slot]);
            let refund = 0,
              consumed = false;
            if (classId === 'rogue') {
              p.cooldowns.a2 = 5;
              applyBuff(p, makeBuff('precision', 1, 4, 'precision'));
              resolvePlayerAbility(w, p, 'a1', { x: 0, y: 0 });
              refund = 5 - p.cooldowns.a2;
            } else {
              resolvePlayerAbility(w, p, 'a2', { x: 0, y: 0 });
              damageBoss(w, p, boss, 1, { direct: true });
              consumed = !p.buffs.some((b) => b.kind === 'rebuke');
            }
            resolvePlayerAbility(w, p, classId === 'rogue' ? 'a3' : 'a1', { x: 0, y: 0 });
            const z = w.groundZones.at(-1);
            z.pos = { ...boss.pos };
            z.armRemaining = 0;
            w.applyZoneTick(z);
            boss.pos.x += 30;
            updateUpgradeZone(w, z, 0.5);
            const renderer = await Renderer.create(document.querySelector('#fixture'), {
              w: ARENA_W,
              h: ARENA_H,
            });
            renderer.render({ ...w.serialize(), localPlayerId: p.id, arena: w.arena });
            await new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            );
            return {
              refund,
              consumed,
              poison: boss.buffs.some((b) => b.kind === 'venom'),
              followed: z.followId === boss.id && z.pos.x === boss.pos.x,
              instructions: renderer.overlayLayer.context.instructions.length,
              curse: boss.buffs.some((b) => b.kind === 'curse'),
            };
          },
          { classId, composed },
        );
        assert.ok(result.instructions > 0);
        if (classId === 'rogue') {
          assert.equal(result.refund, 1);
          assert.equal(result.poison, true);
        } else {
          assert.equal(result.consumed, true);
          assert.equal(result.followed, true);
          assert.equal(result.curse, true);
        }
        assert.deepEqual(errors, []);
        if (process.env.SHOT_DIR)
          await page.screenshot({
            path: `${process.env.SHOT_DIR}/upgrade-${classId}-${composed}-${viewport.width}.png`,
          });
        console.log(
          `PASS ${viewport.width}×${viewport.height} ${classId} composed=${composed}: engine payload and renderer`,
        );
        await page.close();
      }
    await context.close();
  }
} finally {
  await browser.close();
}
