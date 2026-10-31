/** Production grand controls with complete authored pilot builds. Existing host smoke covers credits. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless: true,
});
try {
  for (const width of [1280, 320]) {
    const subclasses =
      process.env.SMOKE_GRAND_COHORT === 'martial'
        ? ['kn_champion', 'kn_battlemaster', 'bb_berserker', 'bb_totem', 'mo_openhand', 'mo_shadow']
        : process.env.SMOKE_GRAND_COHORT === 'nature'
          ? ['rg_hunter', 'rg_beastmaster', 'dr_moon', 'dr_land']
          : process.env.SMOKE_GRAND_COHORT === 'support'
            ? ['cl_light', 'cl_life', 'pa_devotion', 'pa_vengeance', 'ba_valor', 'ba_whispers']
            : process.env.SMOKE_GRAND_COHORT === 'caster'
              ? ['mg_evoker', 'mg_abjurer', 'so_draconic', 'so_wild']
              : ['ro_assassin', 'ro_trickster', 'wa_fiend', 'wa_great_old_one'];
    for (const subclassId of subclasses) {
      const page = await browser.newPage({
        viewport: { width, height: width === 320 ? 568 : 800 },
        isMobile: width === 320,
        hasTouch: width === 320,
      });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route('**/__pilot-grands', (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{height:auto!important;overflow:visible!important}body{margin:0;padding:12px;box-sizing:border-box}#root{max-width:900px;margin:auto}</style><div id="root"></div>',
        }),
      );
      await page.goto(`${process.env.SMOKE_DEV_URL || 'http://127.0.0.1:5173'}/__pilot-grands`);
      const setup = await page.evaluate(async (subclassId) => {
        const refresh = (await import('/@react-refresh')).default;
        refresh.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => (type) => type;
        window.__vite_plugin_react_preamble_installed__ = true;
        await import('/src/ui/styles.css');
        const { createElement } = (await import('/node_modules/.vite/deps/react.js')).default;
        const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js'))
          .default;
        const { GrandManager } = await import('/src/ui/game/GrandManager.tsx');
        const { getSubclass } = await import('/src/engine/content/subclasses.ts');
        const { changeGrand, normalizeGrandLoadout, grandSlot } =
          await import('/src/engine/content/grandSelections.ts');
        const { CHAR_UPGRADES, GRAND_BY_CLASS, SKILL_GRANDS } =
          await import('/src/engine/content/charUpgrades.ts');
        const sub = getSubclass(subclassId),
          classId = sub.classId;
        const context = {
          classes: [classId],
          history: [],
          subSkills:
            subclassId === 'ba_whispers'
              ? ['ba_whispers_mantle', 'ba_whispers_song']
              : sub.skills.slice(0, 2).map((s) => s.id),
        };
        window.__pilotContext = context;
        const root = createRoot(document.getElementById('root'));
        let state = normalizeGrandLoadout(undefined, context);
        const render = () => {
          window.__pilotState = state;
          root.render(
            createElement(GrandManager, {
              context,
              value: state,
              credit: true,
              onChange: (request) => {
                const next = changeGrand(state, context, request, true);
                if (!next) throw new Error('Rejected production grand transaction');
                state = next;
                render();
              },
            }),
          );
        };
        render();
        return {
          classId,
          ids: [
            [
              ...(GRAND_BY_CLASS[classId] ?? []),
              ...SKILL_GRANDS.filter((d) => d.classId === classId),
            ].find((d) => grandSlot(d.id) === 'basic').id,
            [
              ...(GRAND_BY_CLASS[classId] ?? []),
              ...SKILL_GRANDS.filter((d) => d.classId === classId),
            ].find((d) => grandSlot(d.id) === 'a1').id,
            `${context.subSkills[0]}_g`,
            `${subclassId}_g_a`,
          ],
          alternate: `${subclassId}_g_b`,
          alternateName: CHAR_UPGRADES[`${subclassId}_g_b`].name,
        };
      }, subclassId);
      const click = async (locator) => {
        await locator.scrollIntoViewIfNeeded();
        if (width === 320) await locator.tap();
        else await locator.click();
      };
      const unlock = async (id) => {
        await page.getByLabel('New grand').selectOption(id);
        await click(page.getByRole('button', { name: 'Unlock grand', exact: true }));
      };
      try {
        await page.getByLabel('New grand').waitFor();
      } catch (error) {
        console.log({ errors, body: await page.locator('body').innerText() });
        throw error;
      }
      for (const id of setup.ids) await unlock(id);
      await page.getByRole('status').filter({ hasText: '4/4 equipped' }).waitFor();
      await unlock(setup.alternate);
      await page.getByRole('status').filter({ hasText: '4/4 equipped · 5 earned' }).waitFor();
      await click(page.getByText(/^Earned bank ·/));
      await click(page.getByText(`${setup.alternateName} · Banked`, { exact: false }));
      await page
        .getByLabel(`Replace grand for ${setup.alternateName}`, { exact: true })
        .selectOption(setup.ids[3]);
      await page
        .getByLabel(`Replacement preview for ${setup.alternateName}`, { exact: true })
        .waitFor();
      await click(page.getByRole('button', { name: `Equip ${setup.alternateName}`, exact: true }));
      const result = await page.evaluate(async () => {
        const { World } = await import('/src/engine/world/world.ts');
        const { grandCategory, grandHistory } =
          await import('/src/engine/content/grandSelections.ts');
        const { effectiveRecharge } = await import('/src/engine/content/abilityLimits.ts');
        const ctx = window.__pilotContext,
          state = window.__pilotState,
          classId = ctx.classes[0];
        const selected = state.classes[classId].equipped;
        const w = new World({
          monsterId: 'lich',
          seed: 31,
          players: [
            {
              peerId: 'a',
              name: 'Pilot',
              classId,
              subSkills: ctx.subSkills,
              grandLoadout: state,
              upgrades: Array(5).fill('haste'),
            },
          ],
        });
        const p = w.players[0];
        return {
          categories: selected.map(grandCategory).sort(),
          selected,
          active: grandHistory(classId, [], state, ctx.subSkills),
          cooldowns: [
            ...Object.values(p.abilities).filter((a) => a.slot !== 'basic'),
            ...Object.values(p.subAbilities),
          ].map((a) => effectiveRecharge(a, p.cooldownMult, p.castMult)),
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      assert.deepEqual(result.categories, ['base', 'base', 'identity', 'skill']);
      assert.ok(result.selected.includes(setup.alternate));
      assert.ok(!result.active.includes(setup.ids[3]));
      assert.ok(result.cooldowns.every((n) => Number.isFinite(n) && n >= 4));
      assert.equal(result.overflow, false);
      assert.deepEqual(errors, []);
      if (process.env.SHOT_DIR)
        await page.screenshot({
          path: `${process.env.SHOT_DIR}/grands-${subclassId}-${width}.png`,
          fullPage: true,
        });
      console.log(
        `PASS ${width}px ${subclassId}: four slots, identity bank/replacement, actual kit and Haste bounds`,
      );
      await page.close();
    }
  }
} finally {
  await browser.close();
}
