/** Reproduce a rendered barrier that disappears before a Node-side assertion starts. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { installDefenseCastProbe } from './defense-cast-probe.mjs';
async function fixture(run) {
  const dom = new JSDOM(
    '<body><div class="hud-ability ready" aria-label="Test — skill"></div><div class="hud-selfhp"><span class="hud-healthbar-num">100/100</span></div></body>',
  );
  const before = {
    window: globalThis.window,
    document: globalThis.document,
    MutationObserver: globalThis.MutationObserver,
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    MutationObserver: dom.window.MutationObserver,
  });
  try {
    await run(dom.window.document);
  } finally {
    dom.window.__defenseCastProbe?.dispose();
    dom.window.close();
    Object.assign(globalThis, before);
  }
}
const turn = () => new Promise((resolve) => queueMicrotask(resolve));
function cooling(doc) {
  doc.querySelector('.hud-ability').innerHTML = '<div class="hud-cd-num">5.0</div>';
}
function meter(doc, amount = 20, max = 50) {
  doc
    .querySelector('.hud-selfhp')
    .insertAdjacentHTML(
      'beforeend',
      `<div role="meter" aria-label="Absorption" aria-valuenow="${amount}" aria-valuemax="${max}"></div>`,
    );
}
test('captures positive bounded absorption even when the live meter is gone before the assertion', async () =>
  fixture(async (doc) => {
    installDefenseCastProbe({ name: 'Test', bubble: true });
    cooling(doc);
    meter(doc);
    await turn();
    doc.querySelector('[role="meter"]').remove();
    await turn();
    assert.equal(doc.querySelector('[role="meter"]'), null);
    assert.deepEqual(window.__defenseCastProbe.state.effect, { amount: 20, max: 50 });
    assert.equal(window.__defenseCastProbe.state.cooldown, 5);
  }));
test('silenced appearance, cooldown alone and invalid meters do not prove a barrier', async () =>
  fixture(async (doc) => {
    installDefenseCastProbe({ name: 'Test', bubble: true });
    doc.querySelector('.hud-ability').classList.remove('ready');
    meter(doc);
    await turn();
    assert.equal(window.__defenseCastProbe.state.effect, null);
    doc.querySelector('[role="meter"]').remove();
    cooling(doc);
    await turn();
    assert.equal(window.__defenseCastProbe.state.effect, null);
    for (const amount of [0, 100]) {
      meter(doc, amount);
      await turn();
      assert.equal(window.__defenseCastProbe.state.effect, null);
      doc.querySelector('[role="meter"]').remove();
      await turn();
    }
  }));
test('records short badges and late-armed zones without requiring them to survive an IPC round trip', async () =>
  fixture(async (doc) => {
    for (const options of [{ badge: 'Steadfast:' }, { zone: true }]) {
      installDefenseCastProbe({ name: 'Test', ...options });
      cooling(doc);
      await turn();
      assert.equal(window.__defenseCastProbe.state.effect, null);
      const title = options.zone ? 'Hastened · 3s' : 'Steadfast: control resistance · 2s';
      const badge = doc.createElement('span');
      badge.title = title;
      doc.querySelector('.hud-selfhp').append(badge);
      await turn();
      badge.remove();
      await turn();
      assert.deepEqual(window.__defenseCastProbe.state.effect, { title });
    }
  }));

test('matches the actual icon-prefixed subclass label', async () =>
  fixture(async (doc) => {
    doc.querySelector('.hud-ability').setAttribute('aria-label', '💚 Test — barrier');
    installDefenseCastProbe({ name: 'Test', label: '💚 Test', bubble: true });
    cooling(doc);
    meter(doc);
    await turn();
    assert.deepEqual(window.__defenseCastProbe.state.effect, { amount: 20, max: 50 });
  }));
