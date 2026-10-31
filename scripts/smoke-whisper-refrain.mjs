/** Actual Mantle cast, serialized afterimage and production renderer at phone/desktop sizes. */
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
    await page.route('**/__whisper-refrain', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#fixture{margin:0;width:100%;height:100%;overflow:hidden}</style><div id="fixture"></div>',
      }),
    );
    await page.goto(`${process.env.SMOKE_DEV_URL || 'http://127.0.0.1:5173'}/__whisper-refrain`);
    const result = await page.evaluate(async () => {
      const { World } = await import('/src/engine/world/world.ts');
      const { resolvePlayerAbility } = await import('/src/engine/combat/abilities.ts');
      const { Renderer } = await import('/src/render/pipeline/renderer.ts');
      const { ARENA_W, ARENA_H } = await import('/src/engine/core/constants.ts');
      const w = new World({
        monsterId: 'lich',
        seed: 31,
        players: [
          {
            peerId: 'a',
            name: 'Whispers',
            classId: 'bard',
            subSkills: ['ba_whispers_mantle'],
          },
        ],
      });
      w.scene = null;
      w.obstacles = [];
      w.terrain = [];
      const p = w.players[0];
      p.pos = { x: 600, y: 400 };
      p.aim = { x: 1, y: 0 };
      w.boss.pos = { x: 650, y: 400 };
      p.hp -= 10;
      resolvePlayerAbility(w, p, 'a2', { x: 0, y: 0 });
      resolvePlayerAbility(w, p, 'a3', { x: 0, y: 0 });
      resolvePlayerAbility(w, p, 'sub1', { x: 1, y: 0 });
      const state = w.serialize();
      const image = state.players[0].buffs.find((b) => b.kind === 'whisperRefrain');
      const renderer = await Renderer.create(document.querySelector('#fixture'), {
        w: ARENA_W,
        h: ARENA_H,
      });
      renderer.render({ ...state, localPlayerId: p.id, arena: w.arena });
      // Inspect the persistent cue after cast flashes settle, not only the instant burst.
      for (let frame = 0; frame < 90; frame++) {
        await new Promise(requestAnimationFrame);
        renderer.render({ ...state, events: [], localPlayerId: p.id, arena: w.arena });
      }
      return { image, pos: p.pos, draws: renderer.overlayLayer.context.instructions.length };
    });
    assert.equal(result.image?.whisperRefrain.charges, 3, JSON.stringify(result));
    assert.deepEqual(result.image.whisperRefrain.anchor, { x: 600, y: 400 });
    assert.notEqual(result.pos.x, 600);
    assert.ok(result.draws > 0);
    assert.ok(!JSON.stringify(result.image).includes('usedCasts'));
    assert.deepEqual(errors, []);
    if (process.env.SHOT_DIR)
      await page.screenshot({ path: `${process.env.SHOT_DIR}/whisper-refrain-${width}.png` });
    console.log(`PASS ${width}px: real chorus blink and rendered departure afterimage`);
    await page.close();
  }
} finally {
  await browser.close();
}
