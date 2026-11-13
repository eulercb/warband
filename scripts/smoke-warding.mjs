/** Real grand selection, replicated target preview and paid native/copied Blink inputs. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless: true,
});
try {
  for (const width of [1280, 320])
    for (const pick of [
      'mg_abjurer_ward',
      'mg_abjurer_bind',
      'mg_abjurer_teleport',
      'mg_abjurer_mend',
      'forge',
    ]) {
      const page = await browser.newPage({
        viewport: { width, height: width === 320 ? 568 : 800 },
        isMobile: width === 320,
        hasTouch: width === 320,
      });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route('**/__warding', (r) =>
        r.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="world" style="position:absolute;inset:0"></div><div id="ui"></div><div id="select" style="position:absolute;inset:0;overflow:auto;background:#15151d;z-index:10"></div>',
        }),
      );
      await page.goto(`${process.env.SMOKE_DEV_URL || 'http://127.0.0.1:5173'}/__warding`);
      await page.evaluate(async (pick) => {
        const refresh = (await import('/@react-refresh')).default;
        refresh.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => (t) => t;
        window.__vite_plugin_react_preamble_installed__ = true;
        await import('/src/ui/styles.css');
        await import('/src/ui/hud.css');
        const { React, createRoot } = await import('/scripts/browser-smoke-react.mjs');
        const { GrandManager } = await import('/src/ui/game/GrandManager.tsx');
        const { normalizeGrandLoadout, changeGrand } =
          await import('/src/engine/content/grandSelections.ts');
        const { useStore } = await import('/src/ui/state/store.ts');
        useStore.getState().setActiveChaosForge(false);
        useStore.getState().setActiveRunSeed(null);
        const context = {
          classes: ['mage'],
          history: [],
          subSkills: [pick === 'forge' ? 'mg_abjurer_ward' : pick],
        };
        let loadout = normalizeGrandLoadout(undefined, context);
        const root = createRoot(document.querySelector('#select'));
        function render() {
          window.wardLoadout = loadout;
          root.render(
            React.createElement(GrandManager, {
              context,
              value: loadout,
              credit: true,
              onChange: (request) => {
                loadout = changeGrand(loadout, context, request, true);
                if (!loadout) throw new Error('Grand selection rejected');
                render();
              },
            }),
          );
        }
        render();
      }, pick);
      await page.getByLabel('New grand').selectOption('mg_abjurer_g_a');
      const unlock = page.getByRole('button', { name: 'Unlock grand', exact: true });
      if (width === 320) await unlock.tap();
      else await unlock.click();
      await page.getByRole('status').filter({ hasText: '1/4 equipped' }).waitFor();
      await page.evaluate(
        async ({ pick, width }) => {
          document.querySelector('#select').style.display = 'none';
          const { World } = await import('/src/engine/world/world.ts');
          const { Host } = await import('/src/net/session/host.ts');
          const { SnapshotInterpolator } = await import('/src/render/pipeline/interpolate.ts');
          const { pushHud } = await import('/src/ui/state/hudBridge.ts');
          const { useStore } = await import('/src/ui/state/store.ts');
          const { React, createRoot } = await import('/scripts/browser-smoke-react.mjs');
          const { default: HUD } = await import('/src/ui/game/HUD.tsx');
          const { default: TouchControls } = await import('/src/ui/game/TouchControls.tsx');
          const { KeyboardMouse } = await import('/src/input/keyboard.ts');
          const { sampleTouch } = await import('/src/input/touch.ts');
          const { blinkArrival } = await import('/src/engine/combat/warding.ts');
          const { synthesizeAbility } = await import('/src/engine/content/forge.ts');
          const { Renderer } = await import('/src/render/pipeline/renderer.ts');
          const skill = pick === 'forge' ? 'mg_abjurer_ward' : pick;
          const w = new World({
            seed: 31,
            monsterId: 'lich',
            players: [
              {
                peerId: 'a',
                name: 'Ward',
                classId: 'mage',
                subSkills: [skill],
                grandLoadout: window.wardLoadout,
                extraClasses: ['rogue'],
              },
            ],
          });
          w.scene = null;
          w.obstacles = [];
          w.terrain = [];
          const p = w.players[0],
            b = w.boss;
          p.pos = { x: 500, y: 400 };
          p.aim = { x: 1, y: 0 };
          b.pos = { x: 1200, y: 700 };
          b.moveSpeed = 0;
          b.decisionTimer = 1000;
          if (pick === 'forge') {
            const source = p.abilities.a3;
            const made = synthesizeAbility(
              31,
              'warding',
              'a3',
              [{ name: source.name, classId: 'mage', className: 'Mage', slot: 'a3', def: source }],
              new Set(['blink']),
            ).def;
            if (!made.components.effects.some((e) => e.kind === 'dispelField'))
              throw new Error('Forge dropped dispel');
            w.setActiveClass(p, 'rogue');
            p.abilities.a3 = made;
            p.cooldowns.a3 = 0;
          }
          const arrival = blinkArrival(w, p, p.abilities.a3);
          const z = {
            id: w.allocId(),
            kind: 'voidZone',
            side: 'boss',
            ownerId: b.id,
            pos: arrival,
            radius: 170,
            damagePerTick: 20,
            healPerTick: 0,
            slowMult: 1,
            slowDuration: 1,
            duration: 10,
            remaining: 8,
            tickAccum: 0.249,
          };
          const other = {
            ...z,
            id: w.allocId(),
            pos: { x: arrival.x + 100, y: arrival.y },
            tickAccum: 0,
          };
          w.groundZones.push(z, other);
          const renderer = await Renderer.create(document.querySelector('#world'), w.arena);
          const keyboard = new KeyboardMouse(document.querySelector('#world'));
          const host = Object.create(Host.prototype);
          Object.assign(host, { world: w, localPlayerId: p.id, drainEvents: () => w.events });
          const interp = new SnapshotInterpolator();
          let seq = 0;
          useStore.setState({
            localClass: p.classId,
            myCharUpgrades: ['mg_abjurer_g_a'],
            mySubSkills: [skill],
            autofire: false,
          });
          createRoot(document.querySelector('#ui')).render(
            React.createElement(
              React.Fragment,
              null,
              React.createElement(HUD),
              React.createElement(TouchControls),
            ),
          );
          function publish() {
            const local = host.getRenderState(performance.now());
            interp.push(JSON.parse(JSON.stringify({ ...w.serialize(), tick: seq++ })));
            const remote = interp.sample(performance.now() + 200, {
              localPlayerId: p.id,
              arena: w.arena,
            });
            window.wardRemote = remote.players.find((a) => a.id === p.id).dispelFields;
            pushHud(local, width === 320 ? 'touch' : 'keyboard');
            renderer.render(remote);
          }
          function step() {
            const s =
              width === 320
                ? sampleTouch()
                : keyboard.sample({ x: innerWidth / 2, y: innerHeight / 2 });
            w.step(
              0.01,
              new Map([
                [
                  'a',
                  { seq: w.tick, move: s.move, aim: s.aim, buttons: s.buttons, autofire: false },
                ],
              ]),
            );
            publish();
          }
          window.ward = { w, p, z, other, step, publish, renderer, arrival, hp: p.hp };
          publish();
        },
        { pick, width },
      );
      await page.waitForSelector(width === 320 ? '.wb-touch-btn-a3' : '.hud-ability', {
        state: 'attached',
      });
      // Set real aim, then freeze for readiness observation and screenshots.
      if (width === 320) {
        const box = await page.locator('.wb-touch-stick-right').boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 35, box.y + box.height / 2);
        await page.evaluate(() => window.ward.step());
        await page.mouse.up();
      } else {
        await page.mouse.move(width / 2 + 120, 400);
        await page.evaluate(() => window.ward.step());
      }
      await page.evaluate(() => {
        const f = window.ward;
        if (window.wardRemote?.[0]?.id !== f.z.id)
          throw new Error('Replicated preview selected wrong field');
        if (!f.renderer.aimLayer.context.instructions.length)
          throw new Error('Missing rendered preview');
      });
      await page.screenshot({
        path: `${process.env.SHOT_DIR || '/tmp'}/warding-${width}-${pick}-ready.png`,
      });
      if (width === 320) {
        const box = await page.locator('.wb-touch-btn-a3').boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.evaluate(() => window.ward.step());
        await page.mouse.up();
      } else {
        await page.keyboard.down('r');
        await page.evaluate(() => window.ward.step());
        await page.keyboard.up('r');
      }
      await page.evaluate(() => {
        const f = window.ward;
        if (
          f.w.groundZones.some((z) => z.id === f.z.id) ||
          !f.w.groundZones.some((z) => z.id === f.other.id)
        )
          throw new Error('Expected exactly selected field removal');
        if (!f.w.events.some((e) => e.t === 'fieldDispel'))
          throw new Error('Missing success event');
        if (!f.renderer.fxLayer.context.instructions.length)
          throw new Error('Missing rendered success FX');
        if (f.p.abilities.a3.frontGuard && !f.p.buffs.some((b) => b.kind === 'frontGuard'))
          throw new Error('Lost retained frontal guard');
        if (!(f.p.cooldowns.a3 > 0) || f.p.hp !== f.hp) throw new Error('Paid safe cast failed');
        if (window.wardRemote.length) throw new Error('Preview remained during recharge');
      });
      await page.screenshot({
        path: `${process.env.SHOT_DIR || '/tmp'}/warding-${width}-${pick}-dispel.png`,
      });
      assert.deepEqual(errors, []);
      console.log(`warding ${width} ${pick}: passed`);
      await page.close();
    }
} finally {
  await browser.close();
}
