/** Fixed-target engine + renderer checks; production keyboard/touch is covered by smoke:passives. */
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
    for (const mode of ['ready', 'bramble', 'fiend', 'counter', 'mind', 'ward', 'cadence']) {
      const page = await context.newPage();
      currentPage = page;
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route('**/__coherence-fixture', (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}#fixture{width:100%;height:100%}</style><div id="fixture"></div>',
        }),
      );
      await page.goto(
        `${process.env.SMOKE_DEV_URL || 'http://127.0.0.1:5173'}/__coherence-fixture`,
      );
      await page.evaluate(async (mode) => {
        const { Renderer } = await import('/src/render/pipeline/renderer.ts');
        const { ARENA_W, ARENA_H } = await import('/src/engine/core/constants.ts');
        const { World } = await import('/src/engine/world/world.ts');
        const { resolvePlayerAbility } = await import('/src/engine/combat/abilities.ts');
        const { applyBuff, makeBuff, damageBoss, damagePlayer } =
          await import('/src/engine/combat/combat.ts');
        const { absorptionAmount } = await import('/src/engine/combat/absorption.ts');
        let world,
          owner,
          boss,
          frame = 0;
        const renderer = await Renderer.create(document.querySelector('#fixture'), {
          w: ARENA_W,
          h: ARENA_H,
        });
        const modes = {
          ready: ['druid', 'dr_moon_roar'],
          bramble: ['druid', 'dr_moon_roar'],
          fiend: ['warlock', 'wa_fiend_hurl'],
          counter: ['warlock', 'wa_fiend_rebuke'],
          mind: ['warlock', 'wa_goo_blast'],
          ward: ['mage', 'mg_abjurer_ward'],
          cadence: ['mage', 'mg_evoker_lightning'],
        };
        window.coherence = {
          mode(name) {
            const [classId, skill] = modes[name];
            world = new World({
              monsterId: 'lich',
              seed: 31,
              players: [{ peerId: 'a', name: classId, classId, subSkills: [skill] }],
            });
            world.scene = null;
            world.obstacles = [];
            world.terrain = [];
            owner = world.players[0];
            boss = world.boss;
            owner.pos = { x: 800, y: 700 };
            owner.aim = { x: 0, y: -1 };
            owner.critChance = 0;
            boss.pos = { x: 800, y: 630 };
            boss.hp = boss.maxHp = 10000;
            boss.buffs = [];
            if (name === 'ready' || name === 'bramble') {
              resolvePlayerAbility(world, owner, 'sub1', { x: 0, y: 0 });
              if (name === 'bramble') resolvePlayerAbility(world, owner, 'basic', { x: 0, y: 0 });
            } else if (name === 'fiend') {
              applyBuff(boss, makeBuff('curse', 1.15, 6, `curse:${owner.id}:searing`));
              damageBoss(world, owner, boss, 10);
            } else if (name === 'counter') {
              resolvePlayerAbility(world, owner, 'sub1', { x: 0, y: 0 });
              damagePlayer(world, owner, 1);
            } else if (name === 'mind') {
              applyBuff(boss, makeBuff('curse', 1.15, 6, `curse:${owner.id}:hex`));
              resolvePlayerAbility(world, owner, 'sub1', { x: 0, y: 0 });
              const shot = world.projectiles[0];
              shot.pos = { ...boss.pos };
              world.resolvePlayerProjectile(shot);
            } else {
              owner.maxHp = owner.hp = 400;
              owner.cooldowns.a1 = 14;
              owner.cooldowns.a2 = 20;
              applyBuff(boss, makeBuff('moveSpeed', 0.6, 3, 'fixture'));
              damageBoss(world, owner, boss, 10, { direct: true });
            }
            return frame;
          },
          probe() {
            return {
              frame,
              form: world.serialize().players[0].form,
              hp: owner.hp,
              maxHp: owner.maxHp,
              absorption: absorptionAmount(owner.buffs),
              ready: owner.buffs.some((b) => b.kind === 'brambleReady'),
              slowed: boss.buffs.some((b) => b.source === 'brambleSlow'),
              cursed: boss.buffs.some((b) => b.kind === 'curse'),
              weakened: boss.buffs.some((b) => b.kind === 'damageDealt' && b.mult === 0.85),
              windup: boss.buffs.some((b) => b.source === 'mindBlastWindup'),
              a1: owner.cooldowns.a1,
              a2: owner.cooldowns.a2,
              instructions: renderer.overlayLayer.context.instructions.length,
            };
          },
        };
        window.coherence.mode(mode);
        const render = () => {
          renderer.render({ ...world.serialize(), localPlayerId: owner.id, arena: world.arena });
          world.events = [];
          frame++;
          requestAnimationFrame(render);
        };
        render();
      }, mode);
      const frame = 0;
      await page.waitForFunction((frame) => window.coherence.probe().frame > frame + 2, frame);
      const p = await page.evaluate(() => window.coherence.probe());
      if (mode === 'ready') {
        assert.equal(p.ready, true);
        assert.equal(p.form, 'moonBear');
      }
      if (mode === 'bramble') {
        assert.equal(p.ready, false);
        assert.equal(p.slowed, true);
      }
      if (mode === 'fiend' || mode === 'counter') {
        assert.ok(p.absorption > 15);
        assert.equal(p.cursed, true);
      }
      if (mode === 'fiend') assert.equal(p.hp, p.maxHp);
      if (mode === 'mind') {
        assert.equal(p.weakened, true);
        assert.equal(p.windup, true);
      }
      if (mode === 'ward') assert.equal(p.absorption, 40);
      if (mode === 'cadence') {
        assert.equal(p.a1, 12);
        assert.equal(p.a2, 18);
      }
      assert.ok(p.instructions > 0);
      assert.deepEqual(errors, []);
      if (process.env.SHOT_DIR)
        await page.screenshot({
          path: `${process.env.SHOT_DIR}/coherence-${viewport.width}-${mode}.png`,
        });
      console.log(
        `PASS ${viewport.width}×${viewport.height} ${mode}: real engine payload and rendered state`,
      );
      await page.close();
    }
    await context.close();
  }
} catch (error) {
  if (currentPage && !currentPage.isClosed())
    await currentPage
      .screenshot({ path: `${process.env.SHOT_DIR || tmpdir()}/smoke-coherence-failure.png` })
      .catch(() => {});
  throw error;
} finally {
  await browser.close();
}
