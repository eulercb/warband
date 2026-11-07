/** Reproduce CI's empty dependency cache before spending time on game scenarios. */
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

test('browser smoke scripts never import generated dependency-cache files', async () => {
  for (const name of await readdir(new URL('.', import.meta.url))) {
    if (!/^smoke-.*\.mjs$/.test(name) || name.endsWith('.test.mjs')) continue;
    const source = await readFile(new URL(name, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\/node_modules\/\.vite\//, name);
  }
});

test(
  'a fresh Vite cache can mount React hooks and the actual HUD',
  { timeout: 90000 },
  async () => {
    const scratch = await mkdtemp(join(tmpdir(), 'warband-smoke-startup-'));
    let server, browser;
    try {
      server = await createServer({
        cacheDir: join(scratch, 'deps'),
        logLevel: 'error',
        server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false },
      });
      await server.listen();
      const address = server.httpServer.address();
      assert.ok(address && typeof address !== 'string');
      browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
        headless: true,
      });
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/__cold-smoke', (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><div id="root"></div>',
        }),
      );
      await page.goto(`http://127.0.0.1:${address.port}/__cold-smoke`);
      await page.evaluate(async () => {
        const refresh = (await import('/@react-refresh')).default;
        refresh.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => (component) => component;
        window.__vite_plugin_react_preamble_installed__ = true;
        const { React, createRoot } = await import('/scripts/browser-smoke-react.mjs');
        const { default: HUD } = await import('/src/ui/game/HUD.tsx');
        function Probe() {
          const [label] = React.useState('Cold startup ready');
          return React.createElement(
            'div',
            null,
            React.createElement('span', { id: 'cold-ready' }, label),
            React.createElement(HUD),
          );
        }
        createRoot(document.querySelector('#root')).render(React.createElement(Probe));
      });
      await page.locator('#cold-ready').waitFor();
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await server?.close();
      await rm(scratch, { recursive: true, force: true });
    }
  },
);
