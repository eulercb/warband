/** Reward-room fixture against Vite's development server. Injects only the
 * between-boss state, then drives the real scene/renderer with real touch input.
 * Run npm run dev, then CHROMIUM_PATH=/usr/bin/chromium npm run smoke:rewards.
 */
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless: true,
});
let currentPage;
try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 568 },
    { width: 844, height: 390 },
    { width: 1280, height: 800 },
  ]) {
    const mobile = viewport.width !== 1280;
    const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage();
    currentPage = page;
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(process.env.REWARD_SMOKE_URL || 'http://localhost:5173/');
    await page.waitForSelector('canvas');
    await page.evaluate(async () => {
      const { useStore } = await import('/src/ui/state/store.ts');
      window.rewardState = useStore.getState;
      const { Renderer } = await import('/src/render/pipeline/renderer.ts');
      const original = Renderer.prototype.render;
      Renderer.prototype.render = function (state, presentation) {
        original.call(this, state, presentation);
        if (!state.vortex) return;
        const texts = [];
        const visit = (node) => {
          if (node.visible === false) return;
          if (typeof node.text === 'string') texts.push(node.text);
          for (const child of node.children || []) visit(child);
        };
        visit(this.app.stage);
        if (window.rewardRenderer !== this) {
          window.rewardRenderer = this;
          window.rewardGeneration = (window.rewardGeneration || 0) + 1;
        }
        window.rewardProbe = {
          generation: window.rewardGeneration,
          tick: state.tick,
          hero: state.players.find((p) => p.id === state.localPlayerId).pos,
          loot: state.loot,
          vortex: state.vortex,
          texts,
        };
      };
      useStore.setState({
        phase: 'result',
        isHost: true,
        localClass: 'knight',
        activeDraftedClass: null,
        myCoins: 100,
        myUpgrades: [],
        myCharUpgrades: [],
        myExtraClasses: ['mage'],
        mySubSkills: ['kn_champion_slam', 'kn_champion_charge'],
        myEphemeral: { potions: 2 },
        rerollCount: 0,
        nextReadyTotal: 1,
        result: {
          outcome: 'victory',
          timeMs: 12345,
          stats: [],
          monsterId: 'goblin',
          nextMonsterId: 'troll',
          runIndex: 0,
          runTotal: 5,
          runSeed: 1234,
          rewardSeed: 5678,
        },
      });
    });
    await page.waitForFunction(() => window.rewardProbe?.loot.length);
    const labels = await page.evaluate(() => window.rewardProbe.texts);
    if (!mobile) {
      assert.ok(
        labels.some((text) => text.includes('💰')),
        'Desktop retains full shop captions',
      );
      assert.equal(await page.getByRole('region', { name: 'Reward room guide' }).count(), 1);
      assert.ok(await page.getByText('Gold · Generic boons', { exact: true }).isVisible());
      await context.close();
      console.log('PASS reward desktop: full captions retained');
      continue;
    }
    assert.ok(
      labels.includes('G1') &&
        labels.includes('C1') &&
        labels.includes('S1') &&
        labels.includes('↓'),
      labels.join(', '),
    );
    assert.equal(
      labels.some((text) => text.includes('💰') || text.includes('DESCEND')),
      false,
      'Full floor captions must not clutter the mobile canvas',
    );
    console.log(`reward ${viewport.width}: compact labels verified`);
    const checkTouchTargets = async () => {
      const blocked = await page.locator('.wb-touch-btn,.wb-touch-stick').evaluateAll((elements) =>
        elements
          .filter((el) => {
            const r = el.getBoundingClientRect();
            const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return !hit || !(el === hit || el.contains(hit));
          })
          .map((el) => el.className),
      );
      assert.deepEqual(blocked, [], 'Information cards must leave all touch controls usable');
    };
    const guide = page.getByRole('region', { name: 'Reward room guide' });
    await guide.waitFor();
    await checkTouchTargets();
    assert.equal(await page.locator('.wb-reward-inspect').count(), 0);
    const cdp = await context.newCDPSession(page);
    const moveTo = async (target, stop = 8, stopAfterReroll = false) => {
      await page.locator('.wb-touch-stick-left').waitFor({ state: 'visible' });
      const box = await page.locator('.wb-touch-stick-left').boundingBox();
      assert.ok(box, 'Movement stick is available');
      let holding = false;
      try {
        for (let i = 0; i < 180; i++) {
          if (stopAfterReroll && (await page.evaluate(() => window.rewardState().rerollCount > 0)))
            return;
          const hero = await page.evaluate(() => window.rewardProbe.hero);
          let dx = target.x - hero.x,
            dy = target.y - hero.y;
          dx -= Math.round(dx / 1600) * 1600;
          dy -= Math.round(dy / 1000) * 1000;
          const distance = Math.hypot(dx, dy);
          if (distance <= stop) {
            if (holding) {
              await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
              holding = false;
            }
            const tick = await page.evaluate(() => window.rewardProbe.tick);
            await page.waitForFunction((previous) => window.rewardProbe.tick > previous, tick);
            const settled = await page.evaluate(() => window.rewardProbe.hero);
            const sx = target.x - settled.x,
              sy = target.y - settled.y;
            if (
              Math.hypot(sx - Math.round(sx / 1600) * 1600, sy - Math.round(sy / 1000) * 1000) <=
              stop
            )
              return;
            continue;
          }
          // Slow the real joystick near the target so a delayed render frame cannot overshoot.
          const magnitude = Math.min(48, Math.max(6, distance * 0.2));
          const point = {
            x: box.x + box.width / 2 + (magnitude * dx) / distance,
            y: box.y + box.height / 2 + (magnitude * dy) / distance,
          };
          await cdp.send('Input.dispatchTouchEvent', {
            type: holding ? 'touchMove' : 'touchStart',
            touchPoints: [point],
          });
          holding = true;
          await page.waitForTimeout(50);
        }
        throw new Error('Hero did not reach reward target');
      } finally {
        if (holding)
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      }
    };
    // Begin walking: the automatic guide yields immediately to the inspector.
    const potion = await page.evaluate(() =>
      window.rewardProbe.loot.find((l) => l.kind === 'shop' && l.label.includes('Healing Vial')),
    );
    await moveTo(potion.pos);
    console.log(`reward ${viewport.width}: walked to shop`);
    await checkTouchTargets();
    assert.equal(await guide.count(), 0);
    await page.waitForFunction(() => window.rewardState().myEphemeral.potions > 2);

    assert.equal(await page.locator('.wb-reward-inspect').count(), 1);
    await page.getByRole('button', { name: 'Room guide', exact: true }).tap();
    await guide.waitFor();
    await checkTouchTargets();
    assert.equal(await page.locator('.wb-reward-inspect').count(), 0);
    for (let i = 0; i < 3; i++)
      await page.getByRole('button', { name: 'Next tip', exact: true }).tap();
    await page.getByRole('button', { name: 'Done', exact: true }).tap();
    assert.equal(await page.locator('.wb-reward-inspect').count(), 1);
    if (viewport.width === 390) {
      const reroll = await page.evaluate(() =>
        window.rewardProbe.loot.find((l) => l.kind === 'shop' && l.label.includes('🎲')),
      );
      const generation = await page.evaluate(() => window.rewardProbe.generation);
      await moveTo(reroll.pos, 8, true);
      await page.waitForFunction(() => window.rewardState().rerollCount > 0);

      // Reroll rebuilds the existing scene/renderer; wait for its new first frame.
      await page.waitForFunction(
        (previous) =>
          window.rewardProbe.generation > previous &&
          document.querySelector('.wb-touch-stick-left'),
        generation,
      );
      for (const kind of ['generic', 'char']) {
        console.log(`reward ${viewport.width}: walking to ${kind}`);
        const offer = await page.evaluate((kind) => {
          const p = window.rewardProbe;
          return p.loot
            .filter((l) => l.kind === kind)
            .sort(
              (a, b) =>
                Math.hypot(a.pos.x - p.hero.x, a.pos.y - p.hero.y) -
                Math.hypot(b.pos.x - p.hero.x, b.pos.y - p.hero.y),
            )[0];
        }, kind);
        await moveTo(offer.pos, 120);
        await page.waitForTimeout(120);
        assert.equal(await page.locator('.wb-reward-inspect').count(), 1);
        assert.ok(
          (await page.locator('.wb-reward-inspect-name').textContent()).startsWith(
            kind === 'generic' ? 'G' : 'C',
          ),
        );
        await moveTo(offer.pos);
        await page.waitForFunction(
          (kind) => window.rewardProbe.loot.some((l) => l.kind === kind && l.claimed),
          kind,
        );
      }
      await page.getByRole('button', { name: 'List view', exact: true }).tap();
      await page.getByRole('dialog', { name: 'Between-boss upgrades' }).waitFor();
      assert.equal(await page.locator('.wb-reward-inspect,.wb-reward-guide').count(), 0);
      assert.ok(
        await page
          .getByRole('dialog', { name: 'Between-boss upgrades' })
          .getByText('Seed: YA', { exact: true })
          .isVisible(),
      );
      await page.getByRole('button', { name: 'Close list', exact: true }).tap();
      const vortex = await page.evaluate(() => window.rewardProbe.vortex.pos);
      await moveTo(vortex);
      await page.getByText('Descending…', { exact: true }).waitFor();
    }
    assert.deepEqual(errors, []);
    console.log(
      `PASS reward ${viewport.width}×${viewport.height}: compact floor markers, guide yields to walking, contextual shop and purchases${viewport.width === 390 ? ', both boon claims, list fallback, descent' : ''}`,
    );
    await context.close();
  }
} catch (error) {
  await currentPage
    ?.screenshot({ path: `${process.env.SHOT_DIR || tmpdir()}/smoke-rewards-failure.png` })
    .catch(() => {});
  throw error;
} finally {
  await browser.close();
}
