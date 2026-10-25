/** Real production UI: select each pilot subclass, start a fight, inspect its passive. */
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright-core';
const cases = [
  ['barbarian', 'Chain Pull', 'Rampage'],
  ['barbarian', 'Bear Spirit', 'Spirit Shelter'],
  ['monk', 'Flurry Barrage', 'Flowguard'],
  ['monk', 'Shadow Dart', 'Shadow Rhythm'],
  ['ranger', 'Hail of Thorns', 'Exposed Quarry'],
  ['ranger', "Nature's Bond", 'Pack Bond'],
  ['druid', 'Wall of Thorns', 'Living Paths'],
  ['druid', 'Frenzied Regen', 'Moon Aspect'],
  ['druid', 'Primal Roar', 'Moon Aspect'],
  ['knight', 'Riposte', 'Victorious Reprise'],
  ['knight', 'Trip Attack', 'Tactical Opening'],
  ['cleric', 'Warding Flare', 'Refulgence'],
  ['cleric', 'Preserve Life', 'Abundance'],
  ['paladin', 'Sacred Weapon', 'Oath Anchor'],
  ['paladin', 'Wrathful Smite', 'Relentless Procession'],
  ['mage', 'Lightning Bolt', 'Arcane Cadence'],
  ['mage', 'Arcane Ward', 'Binding Ward'],
  ['sorcerer', 'Dragon Wings', 'Surge Ascent'],
  ['sorcerer', 'Chaos Surge', 'Spell Weave'],
  ['bard', 'Bolster', 'Rallying Chorus'],
  ['bard', 'Healing Refrain', 'Echoed Refrain'],
  ['rogue', 'Smoke Bomb', "Death's Opening"],
  ['rogue', 'Shield Spell', 'Spellblade'],
  ['warlock', 'Dark Resilience', 'Soul Ember'],
  ['warlock', 'Infernal Claim', 'Soul Ember'],
  ['warlock', 'Mind Blast', 'Dread Insight'],
];
cases.push(
  ['cleric', 'Mass Cure', 'Abundance'],
  ['cleric', 'Flash of Light', 'Refulgence'],
  ['monk', 'Wind Step', 'Flowguard'],
  ['knight', 'Menacing Roar', 'Tactical Opening'],
  ['barbarian', 'Ground Slam', 'Rampage'],
  ['barbarian', 'Earth Totem', 'Spirit Shelter'],
  ['rogue', 'Coated Blade', "Death's Opening"],
  ['druid', 'Erupting Earth', 'Living Paths'],
);
const activeCases = new Map([
  ['Mass Cure', null],
  ['Flash of Light', null],
  ['Wind Step', null],
  ['Hail of Thorns', null],
  ['Menacing Roar', /Challenge ready:/],
  ['Bear Spirit', /Frontal guard:/],
  ['Coated Blade', /Blade coated:/],
  ['Ground Slam', null],
  ['Earth Totem', null],
  ['Erupting Earth', null],
]);
const selected = process.env.SMOKE_PASSIVE_NAMES?.split(',');
if (selected)
  for (const name of selected)
    assert.ok(
      cases.some(([, , passive]) => passive === name),
      `Unknown passive: ${name}`,
    );
const skills = process.env.SMOKE_PASSIVE_SKILLS?.split(',');
const tests = cases.filter(
  ([, skill, passive]) =>
    (!selected || selected.includes(passive)) && (!skills || skills.includes(skill)),
);
assert.ok(tests.length, 'No passive cases selected');
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless: true,
});
let currentPage;
try {
  for (const mobile of [false, true]) {
    for (const [classId, skill, passive] of tests) {
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
      await click(button('Hero: Knight'));
      await click(page.locator(`.wb-codex-card[data-cls="${classId}"]`));
      if (mobile) await click(button('Menu'));
      await click(button('Host Game'));
      await click(button('List view'));
      await click(button('Create Room'));
      if (mobile) await click(button('Lobby menu'));
      await click(page.locator('.wb-sf-loadout-toggle'));
      await click(page.getByRole('button', { name: new RegExp(skill) }));
      await click(button('Start Fight'));
      const icon = page.getByLabel(`Subclass passive: ${passive}`, { exact: true });
      await icon.waitFor();
      assert.equal(await icon.count(), 1);
      assert.ok((await icon.getAttribute('title')).includes(passive));
      if (
        ['Spell Weave', 'Flowguard', 'Shadow Rhythm', 'Moon Aspect'].includes(passive) ||
        skill === 'Infernal Claim' ||
        activeCases.has(skill) ||
        passive === 'Arcane Cadence'
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
        if (activeCases.has(skill) || passive === 'Arcane Cadence') {
          const badge = activeCases.get(skill);
          const slot = passive === 'Arcane Cadence' ? 'a2' : 'sub1';
          const name = passive === 'Arcane Cadence' ? 'Frost Nova' : skill;
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
          if (passive === 'Arcane Cadence')
            assert.ok((await icon.getAttribute('title')).includes('Fireball, Frost Nova, Blink'));
        } else if (passive === 'Spell Weave') {
          const surge = page
            .locator('.hud-selfhp')
            .getByTitle(/Spell surge: next heavy spell empowered/);
          for (let count = 1; count <= 3; count++) {
            await hold('basic', 'Space', () =>
              count === 3
                ? surge.waitFor()
                : page
                    .locator('.hud-selfhp')
                    .getByTitle(new RegExp(`Spell Weave: ${count}/3 basic casts`))
                    .waitFor(),
            );
            if (count < 3)
              await page.waitForFunction(() =>
                document
                  .querySelector('.hud-ability[aria-label^="Chaos Bolt"]')
                  ?.classList.contains('ready'),
              );
          }
          await hold('a1', 'KeyQ', () => surge.waitFor({ state: 'hidden' }));
        } else if (passive === 'Moon Aspect') {
          const form = page.locator('.hud-selfhp').getByTitle(/Moon bear:/);
          if (skill === 'Primal Roar') {
            await hold('sub1', 'KeyZ', () =>
              page
                .locator('.hud-selfhp')
                .getByTitle(/Bramble ready:/)
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
        } else if (skill === 'Infernal Claim') {
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
          if (passive === 'Flowguard')
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
