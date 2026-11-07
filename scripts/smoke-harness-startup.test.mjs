/** Reproduce CI's empty dependency cache before spending time on game scenarios. */
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createServer, resolveConfig } from 'vite';
import { chromium } from 'playwright-core';
import ts from 'typescript';
import { loadPassiveRegistry } from './passive-smoke-cases.mjs';

test('fixed prebundles cover runtime imports and both JSX runtimes', async () => {
  const config = await resolveConfig({ logLevel: 'silent' }, 'serve');
  assert.equal(config.optimizeDeps.noDiscovery, true);
  const imports = new Set(['react/jsx-runtime', 'react/jsx-dev-runtime']);
  const scan = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await scan(path);
      else if (/\.(ts|tsx)$/.test(entry.name)) {
        const source = ts.createSourceFile(
          path,
          await readFile(path, 'utf8'),
          ts.ScriptTarget.Latest,
          true,
        );
        const visit = (node) => {
          const specifier =
            ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
              ? node.moduleSpecifier
              : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
                ? node.arguments[0]
                : undefined;
          if (
            specifier &&
            ts.isStringLiteral(specifier) &&
            !specifier.text.startsWith('.') &&
            !specifier.text.startsWith('/') &&
            !specifier.text.startsWith('virtual:')
          )
            imports.add(specifier.text);
          ts.forEachChild(node, visit);
        };
        visit(source);
      }
    }
  };
  await scan(new URL('../src', import.meta.url).pathname);
  for (const dependency of imports)
    assert.ok(
      config.optimizeDeps.include.includes(dependency),
      `Missing fixed prebundle: ${dependency}`,
    );
});

test('browser smoke scripts never import generated dependency-cache files', async () => {
  for (const name of await readdir(new URL('.', import.meta.url))) {
    if (!/^smoke-.*\.mjs$/.test(name) || name.endsWith('.test.mjs')) continue;
    const source = await readFile(new URL(name, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\/node_modules\/\.vite\//, name);
  }
});

test(
  'cold renderer survives registry reading and delayed UI imports without cache replacement',
  { timeout: 90000 },
  async () => {
    const scratch = await mkdtemp(join(tmpdir(), 'warband-smoke-startup-'));
    let server, browser;
    try {
      server = await createServer({
        cacheDir: join(scratch, 'deps'),
        // Intentionally bypass index.html discovery: fixtures import the renderer
        // before the UI and must not replace Pixi when its lazy backend loads.
        optimizeDeps: { entries: [] },
        logLevel: 'error',
        server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false },
      });
      await server.listen();
      const address = server.httpServer.address();
      assert.ok(address && typeof address !== 'string');
      // CI checks the real index before launching the registry-reading smoke.
      const index = await fetch(`http://127.0.0.1:${address.port}/`);
      assert.equal(index.status, 200);
      await index.text();
      const registry = await loadPassiveRegistry();
      assert.ok(registry.classes.knight && registry.subclasses.length > 0);
      browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
        headless: true,
      });
      const page = await browser.newPage();
      const errors = [];
      let beforeUiHash;
      await page.exposeFunction('recordDependencyVersion', () => {
        beforeUiHash = server.environments.client.depsOptimizer.metadata.browserHash;
      });
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/__cold-smoke', (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><div id="world"></div><div id="root"></div>',
        }),
      );
      await page.goto(`http://127.0.0.1:${address.port}/__cold-smoke`);
      await page.evaluate(async () => {
        const refresh = (await import('/@react-refresh')).default;
        refresh.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => (component) => component;
        window.__vite_plugin_react_preamble_installed__ = true;
        const { World } = await import('/src/engine/world/world.ts');
        await import('/src/net/session/host.ts');
        const { Renderer } = await import('/src/render/pipeline/renderer.ts');
        await window.recordDependencyVersion();
        const { React, createRoot } = await import('/scripts/browser-smoke-react.mjs');
        const { default: HUD } = await import('/src/ui/game/HUD.tsx');
        const world = new World({
          seed: 31,
          monsterId: 'lich',
          players: [{ peerId: 'a', name: 'Startup', classId: 'knight' }],
        });
        const renderer = await Renderer.create(document.querySelector('#world'), world.arena);
        renderer.render(world.toRenderState(world.players[0].id));
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
      assert.ok(beforeUiHash);
      assert.equal(
        server.environments.client.depsOptimizer.metadata.browserHash,
        beforeUiHash,
        'UI imports must not replace the dependency version already used by Pixi',
      );
    } finally {
      await browser?.close();
      await server?.close();
      await rm(scratch, { recursive: true, force: true });
    }
  },
);
