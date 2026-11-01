/** Real production UI: select each pilot subclass, start a fight, inspect its passive. */
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright-core';
import { loadPassiveRegistry, resolvePassiveSmokeCases } from './passive-smoke-cases.mjs';
const registry = await loadPassiveRegistry();
const activeCases = new Map([
  ['cl_life_mend', null],
  ['cl_light_flash', null],
  ['mo_openhand_wind', null],
  ['rg_hunter_hail', null],
  ['kn_battle_menacing', /Challenge ready:/],
  ['bb_totem_bear', /Frontal guard:/],
  ['ro_assassin_poison', /Blade coated:/],
  ['bb_berserker_slam', null],
  ['bb_totem_quake', null],
  ['dr_land_spike', null],
]);
assert.ok(
  !process.env.SMOKE_PASSIVE_NAMES && !process.env.SMOKE_PASSIVE_SKILLS,
  'Use stable SMOKE_PASSIVE_COHORT / SMOKE_PASSIVE_SKILL_IDS filters, not display names',
);
const tests = resolvePassiveSmokeCases(registry.subclasses, {
  cohort: process.env.SMOKE_PASSIVE_COHORT,
  skillIds: process.env.SMOKE_PASSIVE_SKILL_IDS?.split(','),
});
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless: true,
});
let currentPage;
try {
  for (const mobile of [false, true]) {
    for (const { classId, skillId, skill, passiveId, passive } of tests) {
      const context = await browser.newContext({
        viewport: mobile ? { width: 320, height: 568 } : { width: 1280, height: 800 },
        isMobile: mobile,
        hasTouch: mobile,
      });
      const page = await context.newPage();
      currentPage = page;
      const errors = [];
      page.on('pageerror', (e) => {
        if (!/tracker|websocket|webrtc|\bice\b|trystero|net::ERR/i.test(e.message))
          errors.push(e.message);
      });
      const click = async (locator) => {
        await locator.scrollIntoViewIfNeeded();
        if (mobile) await locator.tap();
        else await locator.click();
      };
      const button = (name) => page.getByRole('button', { name, exact: true });
      await page.goto(process.env.SMOKE_URL || 'http://localhost:4173/');
      if (mobile) await click(button('Menu'));
      await click(button(`Hero: ${registry.defaultHeroName}`));
      await click(page.locator(`.wb-codex-card[data-cls="${classId}"]`));
      if (mobile) await click(button('Menu'));
      await click(button('Host Game'));
      await click(button('List view'));
      await click(button('Create Room'));
      if (mobile) await click(button('Lobby menu'));
      await click(page.locator('.wb-sf-loadout-toggle'));
      await click(page.getByRole('button', { name: skill }));
      await click(button('Start Fight'));
      const icon = page.getByLabel(`Subclass passive: ${passive}`, { exact: true });
      await icon.waitFor();
      assert.equal(await icon.count(), 1);
      assert.ok((await icon.getAttribute('title')).includes(passive));
      if (
        [
          'wild_spell_weave',
          'draconic_surge_ascent',
          'openhand_flowguard',
          'shadow_rhythm',
          'moon_aspect',
        ].includes(passiveId) ||
        skillId === 'wa_fiend_rebuke' ||
        activeCases.has(skillId) ||
        passiveId === 'evoker_arcane_cadence'
      ) {
        if (mobile) await page.locator('.wb-touch-btn-basic').waitFor();
        const touch = mobile ? await context.newCDPSession(page) : null;
        const hold = async (slot, key, until) => {
          if (mobile) {
            const control =
              slot === 'sub1'
                ? page.locator('.wb-touch-btn-sub').last()
                : page.locator(`.wb-touch-btn-${slot}`);
            const box = await control.boundingBox();
            assert.ok(box);
            await touch.send('Input.dispatchTouchEvent', {
              type: 'touchStart',
              touchPoints: [{ id: 1, x: box.x + box.width / 2, y: box.y + box.height / 2 }],
            });
          } else await page.keyboard.down(key);
          try {
            await until();
          } finally {
            if (mobile)
              await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            else await page.keyboard.up(key);
          }
        };
        if (activeCases.has(skillId) || passiveId === 'evoker_arcane_cadence') {
          const badge = activeCases.get(skillId);
          const slot = passiveId === 'evoker_arcane_cadence' ? 'a2' : 'sub1';
          const name = passiveId === 'evoker_arcane_cadence' ? registry.cadenceSkillName : skill;
          await hold(slot, slot === 'a2' ? 'KeyE' : 'KeyZ', () =>
            badge
              ? page.locator('.hud-selfhp').getByTitle(badge).waitFor()
              : page.waitForFunction((name) => {
                  const tile = Array.from(document.querySelectorAll('.hud-ability')).find((tile) =>
                    tile.querySelector('.hud-ability-name')?.textContent?.endsWith(name),
                  );
                  return tile && !tile.classList.contains('ready');
                }, name),
          );
          if (passiveId === 'evoker_arcane_cadence')
            for (const name of registry.cadenceRefundNames)
              assert.ok((await icon.getAttribute('title')).includes(name));
        } else if (passiveId === 'wild_spell_weave') {
          const surge = page
            .locator('.hud-selfhp')
            .getByTitle(/Spell surge: next heavy spell empowered/);
          const weave = page
            .locator('.hud-selfhp')
            .getByTitle(/Spell Weave: next positive direct hit/);
          if (skillId === 'so_wild_bend') {
            await hold('sub1', 'KeyZ', () => weave.waitFor());
            await page
              .locator('.hud-selfhp')
              .getByTitle(/^Fortune:/)
              .waitFor();
          } else await hold('a2', 'KeyE', () => weave.waitFor());
          await surge.waitFor();
          await hold('a1', 'KeyQ', () => surge.waitFor({ state: 'hidden' }));
        } else if (passiveId === 'draconic_surge_ascent') {
          const surge = page
            .locator('.hud-selfhp')
            .getByTitle(/Spell surge: next heavy spell empowered/);
          await hold('sub1', 'KeyZ', () => surge.waitFor());
          await page
            .locator('.hud-selfhp')
            .getByTitle(/^Airborne/)
            .waitFor();
          const shield = page.locator('.hud-selfhp').getByTitle(/^Absorption:/);
          await hold('a1', 'KeyQ', () => shield.waitFor());
          await surge.waitFor({ state: 'hidden' });
        } else if (passiveId === 'moon_aspect') {
          const form = page.locator('.hud-selfhp').getByTitle(/Moon bear:/);
          if (skillId === 'dr_moon_roar') {
            await hold('sub1', 'KeyZ', () =>
              page
                .locator('.hud-selfhp')
                .getByTitle(/^Burst ready:/)
                .waitFor(),
            );
          } else await hold('a2', 'KeyE', () => form.waitFor());
          await hold('basic', 'Space', () =>
            page.waitForFunction(() => {
              const tile = document.querySelector('.hud-ability[aria-label^="Thornlash"]');
              return tile && !tile.classList.contains('ready');
            }),
          );
          assert.ok(await form.isVisible());
        } else if (skillId === 'wa_fiend_rebuke') {
          // Claim now pays off an owned curse rather than arming a counterburst.
          if (!mobile) await page.mouse.move(640, 200);
          await hold('a1', 'KeyQ', () =>
            page
              .locator('.hud-selfhp')
              .getByTitle(/Absorption:/)
              .waitFor(),
          );
          await hold('sub1', 'KeyZ', () =>
            page.waitForFunction(() => {
              const tile = document.querySelector('.hud-ability[aria-label*="Infernal Claim —"]');
              return tile && !tile.classList.contains('ready');
            }),
          );
          assert.equal(
            await page
              .locator('.hud-selfhp')
              .getByTitle(/Counterburst ready/)
              .count(),
            0,
          );
        } else {
          const flow = page.locator('.hud-selfhp').getByTitle(/Flow: next marked/);
          await hold('a2', 'KeyE', () => flow.waitFor());
          // The dash owns the hero until landing; release, then press after it finishes.
          await page.waitForTimeout(700);
          await hold('a3', 'KeyR', () => flow.waitFor({ state: 'hidden' }));
          if (passiveId === 'openhand_flowguard')
            await page
              .locator('.hud-selfhp')
              .getByTitle(/Frontal guard: 1 damage blocks/)
              .waitFor();
        }
      }
      if (mobile) {
        assert.ok(await page.getByRole('group', { name: 'Touch controls' }).isVisible());
        await click(button('Pause'));
      } else await page.keyboard.press('Escape');
      const description = page
        .locator('.wb-pause-skills')
        .getByLabel(`Subclass passive: ${passive}`);
      await description.waitFor();
      assert.ok((await description.textContent()).length > 70);
      if (process.env.SHOT_DIR)
        await page.screenshot({
          path: `${process.env.SHOT_DIR}/passive-${`${passive}-${skill}`.replace(/[^a-z0-9]/gi, '-')}-${mobile ? 'touch' : 'desktop'}.png`,
        });
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${mobile ? 'mobile 320×568' : 'desktop'}: ${passive} unlock, fight icon, pause description`,
      );
      await context.close();
    }
  }
} catch (error) {
  if (currentPage && !currentPage.isClosed())
    await currentPage
      .screenshot({ path: `${process.env.SHOT_DIR || tmpdir()}/smoke-passives-failure.png` })
      .catch(() => {});
  throw error;
} finally {
  await browser.close();
}
