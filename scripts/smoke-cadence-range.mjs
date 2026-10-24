/** Production host input and renderer at desktop/phone sizes, with stacked growth. */
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
    const page = await browser.newPage({
      viewport,
      isMobile: viewport.width < 900,
      hasTouch: viewport.width < 900,
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/__cadence-fixture', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}#fixture{width:100%;height:100%}</style><div id="fixture"></div>',
      }),
    );
    await page.goto(`${process.env.SMOKE_DEV_URL || 'http://127.0.0.1:5173'}/__cadence-fixture`);
    const result = await page.evaluate(async () => {
      const { World } = await import('/src/engine/world/world.ts');
      const { Renderer } = await import('/src/render/pipeline/renderer.ts');
      const { effectiveRecharge, refundRecharge } =
        await import('/src/engine/content/abilityLimits.ts');
      const { describeAbility } = await import('/src/engine/content/classes.ts');
      const { stepPlayerGlide } = await import('/src/engine/combat/abilities.ts');
      const w = new World({
        monsterId: 'lich',
        seed: 31,
        players: [
          {
            peerId: 'a',
            name: 'Cadence',
            classId: 'ranger',
            upgrades: Array(5).fill('haste'),
            charUpgrades: [
              ...Array(5).fill('rg_fleet'),
              ...Array(5).fill('rg_barbed'),
              'rg_gk_a3_a',
              'rg_gk_a3_b',
              'rg_gk_a2_a',
              'rg_gk_a2_b',
            ],
          },
        ],
      });
      w.scene = null;
      w.obstacles = [];
      w.terrain = [];
      const p = w.players[0];
      p.pos = { x: 1550, y: 400 };
      p.aim = { x: 1, y: 0 };
      w.boss.pos = { x: 800, y: 800 };
      w.boss.decisionTimer = 1000;
      const command = (slot, seq) => ({
        seq,
        aim: { x: 1, y: 0 },
        move: { x: 0, y: 0 },
        buttons: {
          basic: false,
          a1: false,
          a2: slot === 'a2',
          a3: slot === 'a3',
          sub1: false,
          sub2: false,
          revive: false,
        },
      });
      w.step(0, new Map([[p.peerId, command('a3', 1)]]));
      const rollCooldown = p.cooldowns.a3;
      const refunded = refundRecharge(p, 'a3', 99);
      stepPlayerGlide(w, p, 1);
      const endpoint = p.pos.x;
      p.pos = { x: 600, y: 400 };
      w.step(0, new Map([[p.peerId, command('a2', 2)]]));
      const zone = w.groundZones.at(-1);
      const cd = effectiveRecharge(p.abilities.a2, p.cooldownMult, p.castMult);
      const description = describeAbility(p.abilities.a2, {
        cooldownMult: p.cooldownMult,
        castMult: p.castMult,
      });
      const renderer = await Renderer.create(document.querySelector('#fixture'), w.arena);
      renderer.render({ ...w.serialize(), localPlayerId: p.id, arena: w.arena });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return {
        rollCooldown,
        refunded,
        endpoint,
        zoneX: zone.pos.x,
        radius: zone.radius,
        duration: p.abilities.a2.zoneDuration,
        cooldown: p.cooldowns.a2,
        cd,
        description,
        canvases: document.querySelectorAll('canvas').length,
      };
    });
    assert.ok(result.rollCooldown >= 4);
    assert.equal(result.refunded, 0);
    assert.equal(result.endpoint, 370);
    assert.equal(result.zoneX, 1000);
    assert.ok(result.radius <= 240);
    assert.ok(result.cooldown >= result.duration + 2);
    assert.equal(result.cooldown, result.cd);
    assert.match(result.description, /cooldown/);
    assert.equal(result.canvases, 1);
    assert.deepEqual(errors, []);
    if (process.env.SHOT_DIR)
      await page.screenshot({
        path: `${process.env.SHOT_DIR}/cadence-range-${viewport.width}.png`,
      });
    console.log(
      `PASS ${viewport.width}×${viewport.height}: Haste/refund floor, seam travel, bounded placement and rendered field`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
