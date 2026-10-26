/** Real engine and renderer contracts for revised pilot skills, at desktop and phone sizes. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless: true,
});
try {
  for (const width of [1280, 320])
    for (const classId of ['rogue', 'warlock'])
      for (const composed of [false, true]) {
        const page = await browser.newPage({
          viewport: { width, height: width === 320 ? 568 : 800 },
          isMobile: width === 320,
          hasTouch: width === 320,
        });
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.route('**/__coherence-followup', (route) =>
          route.fulfill({
            contentType: 'text/html',
            body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#fixture{margin:0;width:100%;height:100%;overflow:hidden}</style><div id="fixture"></div>',
          }),
        );
        await page.goto(
          `${process.env.SMOKE_DEV_URL || 'http://127.0.0.1:5173'}/__coherence-followup`,
        );
        const result = await page.evaluate(
          async ({ classId, composed }) => {
            const { World } = await import('/src/engine/world/world.ts');
            const { resolvePlayerAbility } = await import('/src/engine/combat/abilities.ts');
            const { decompose, recompose } = await import('/src/engine/content/forge.ts');
            const { applyBuff, makeBuff } = await import('/src/engine/combat/combat.ts');
            const { updateUpgradeZone } = await import('/src/engine/combat/skillRetouches.ts');
            const { normalizeGrandLoadout } =
              await import('/src/engine/content/grandSelections.ts');
            const { Renderer } = await import('/src/render/pipeline/renderer.ts');
            const { ARENA_W, ARENA_H } = await import('/src/engine/core/constants.ts');
            const subSkills =
              classId === 'rogue'
                ? ['ro_trickster_bolt', 'ro_trickster_step']
                : ['wa_fiend_pit', 'wa_fiend_rebuke'];
            const grands =
              classId === 'rogue'
                ? ['ro_gk_basic_b', 'ro_gk_a1_a', 'ro_trickster_step_g', 'ro_trickster_g_b']
                : ['wa_gk_a1_a', 'wa_gk_a2_a', 'wa_fiend_rebuke_g', 'wa_fiend_g_a'];
            const ctx = { classes: [classId], history: grands, subSkills };
            const w = new World({
              monsterId: 'lich',
              seed: 31,
              players: [
                {
                  peerId: 'a',
                  name: 'Pilot',
                  classId,
                  subSkills,
                  grandLoadout: normalizeGrandLoadout(undefined, ctx),
                },
              ],
            });
            w.scene = null;
            w.obstacles = [];
            w.terrain = [];
            const p = w.players[0],
              boss = w.boss;
            p.pos = { x: 600, y: 400 };
            p.aim = { x: 1, y: 0 };
            boss.pos = { x: classId === 'rogue' ? 650 : 900, y: 400 };
            boss.hp = boss.maxHp = 10000;
            if (composed)
              for (const ab of [...Object.values(p.abilities), ...Object.values(p.subAbilities)])
                Object.assign(ab, recompose(decompose(ab), ab));
            let contracts;
            let claimReadyState;
            if (classId === 'rogue') {
              resolvePlayerAbility(w, p, 'sub1', { x: 0, y: 0 });
              for (let i = 0; i < 20; i++) w.updateProjectiles(1 / 60);
              const prepared = p.buffs.some((b) => b.kind === 'precision' && b.remaining > 0);
              w.events = [];
              resolvePlayerAbility(w, p, 'sub2', { x: 0, y: 0 });
              const hits = w.events.filter(
                (e) => e.t === 'hit' && e.targetId === boss.id && e.amount > 0,
              );
              contracts = {
                prepared,
                name: p.subAbilities.sub2.name,
                phase: p.buffs.some((b) => b.kind === 'invuln' && b.source === 'mirrorCut'),
                echoRatio: hits.length === 2 ? hits[1].amount / hits[0].amount : 0,
              };
            } else {
              w.tryUseAbility(p, 'sub2', { x: 0, y: 0 });
              const targetlessCd = p.cooldowns.sub2 ?? 0;
              assertClaimState(null);
              applyBuff(boss, makeBuff('flight', 1, 20, 'fixture'));
              resolvePlayerAbility(w, p, 'a1', { x: 0, y: 0 });
              const hex = w.groundZones.at(-1);
              hex.pos = { ...boss.pos };
              hex.armRemaining = 0;
              w.applyZoneTick(hex);
              boss.pos.x += 20;
              updateUpgradeZone(w, hex, 0.25);
              const followed = hex.pos.x === boss.pos.x && hex.followId === boss.id;
              resolvePlayerAbility(w, p, 'sub1', { x: 0, y: 0 });
              const pit = w.groundZones.at(-1);
              pit.pos = { ...boss.pos };
              pit.armRemaining = 0;
              const beforePit = boss.hp;
              w.applyZoneTick(pit);
              const pitMissed = beforePit === boss.hp;
              p.buffs = [];
              w.events = [];
              const beforeClaim = boss.hp;
              assertClaimState(boss.id);
              claimReadyState = w.serialize();
              w.tryUseAbility(p, 'sub2', { x: 0, y: 0 });
              contracts = {
                targetlessCd,
                followed,
                pitMissed,
                claimDamage: beforeClaim - boss.hp,
                ward: p.buffs.some((b) => b.kind === 'absorption'),
                remoteCue: w.events.some(
                  (e) => e.t === 'skillArea' && e.area.origin.x === boss.pos.x,
                ),
              };
            }
            function assertClaimState(expected) {
              const actual = w.serialize().players[0].infernalClaimTargets?.sub2;
              if (actual !== expected)
                throw new Error(`Claim eligibility: ${actual} !== ${expected}`);
            }
            const renderer = await Renderer.create(document.querySelector('#fixture'), {
              w: ARENA_W,
              h: ARENA_H,
            });
            if (claimReadyState) {
              renderer.render({ ...claimReadyState, localPlayerId: p.id, arena: w.arena });
              contracts.readyMarkerDraws = renderer.claimLayer.context.instructions.length;
              contracts.markerAboveEffects =
                renderer.root.getChildIndex(renderer.claimLayer) >
                renderer.root.getChildIndex(renderer.enemyStatusLayer);
            }
            renderer.render({ ...w.serialize(), localPlayerId: p.id, arena: w.arena });
            if (claimReadyState)
              contracts.coolingMarkerDraws = renderer.claimLayer.context.instructions.length;
            if (claimReadyState)
              renderer.render({ ...claimReadyState, localPlayerId: p.id, arena: w.arena });
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            return { ...contracts, draws: renderer.overlayLayer.context.instructions.length };
          },
          { classId, composed },
        );
        assert.ok(result.draws > 0);
        if (classId === 'rogue') {
          assert.equal(result.prepared, true);
          assert.equal(result.name, 'Mirror Cut');
          assert.equal(result.phase, true);
          assert.ok(Math.abs(result.echoRatio - 0.35) < 1e-8);
        } else {
          assert.equal(result.targetlessCd, 0);
          assert.equal(result.followed, true);
          assert.equal(result.pitMissed, true);
          assert.ok(result.claimDamage > 0);
          assert.equal(result.ward, true);
          assert.equal(result.remoteCue, true);
          assert.ok(result.readyMarkerDraws > 0, 'Eligible Claim target has a visible marker');
          assert.equal(
            result.markerAboveEffects,
            true,
            'Target marker renders above combat effects',
          );
          assert.equal(result.coolingMarkerDraws, 0, 'Claim marker clears during recharge');
        }
        assert.deepEqual(errors, []);
        if (process.env.SHOT_DIR)
          await page.screenshot({
            path: `${process.env.SHOT_DIR}/coherence-followup-${classId}-${composed}-${width}.png`,
          });
        console.log(
          `PASS ${width}px ${classId} composed=${composed}: revised skill execution and rendered effects`,
        );
        await page.close();
      }
} finally {
  await browser.close();
}
