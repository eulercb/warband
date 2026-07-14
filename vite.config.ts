/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// The site is served from the root of the custom domain (warband.zen.dev.br),
// so the base path is '/'. BASE_PATH can still override it at build time (e.g.
// for a project site under '/<repo>/'); defaults to '/' for local dev/preview.
const base = process.env.BASE_PATH ?? '/';

// item 7: expose the app version (from package.json) to the client at build time so
// the main menu can show which build is running. A plain fs read keeps this
// toolchain-robust (no JSON import-attribute caveats) and runs at config-eval time.
const { version: appVersion } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

// item 1: the semantic version alone never changes between deploys — every push to
// main ships the same "1.0.0" — so it can't tell one build from the next. Inject the
// short commit SHA and its date at build time; these DO change every deploy, so the
// menu can show an identifier that actually moves. Git resolves HEAD even in CI's
// shallow checkout (actions/checkout@v4), but if the call ever fails the build must
// still succeed, so fall back to a static 'dev' marker (empty date). GITHUB_SHA is a
// belt-and-braces fallback for CI runs where the .git dir isn't present.
function buildStamp(): { sha: string; date: string } {
  const run = (cmd: string): string =>
    execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  try {
    return {
      sha: run('git rev-parse --short HEAD'),
      date: run('git log -1 --format=%cd --date=format:%Y-%m-%d'),
    };
  } catch {
    const envSha = process.env.GITHUB_SHA;
    return { sha: envSha ? envSha.slice(0, 7) : 'dev', date: '' };
  }
}
const { sha: buildSha, date: buildDate } = buildStamp();

export default defineConfig({
  base,
  // Inlined as literals at build/transform time; declared in src/vite-env.d.ts.
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_SHA__: JSON.stringify(buildSha),
    __BUILD_DATE__: JSON.stringify(buildDate),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Warband',
        short_name: 'Warband',
        description: 'A browser-hosted co-op boss fight.',
        theme_color: '#0e0e14',
        background_color: '#0e0e14',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest,woff2}'],
      },
    }),
  ],
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
  test: {
    // Default to a fast Node environment; DOM-dependent specs opt in per-file
    // with a `// @vitest-environment jsdom` docblock.
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      // `include` reports on the whole source tree (not just files a test
      // imported) so untested modules show up as 0% rather than vanishing.
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.d.ts',
        '**/*.md', // docs (e.g. sprites/README.md) — not code
        'src/main.tsx', // app entry: mounts React, nothing to unit test
        'src/pwa/**', // service-worker registration glue (virtual module)
        'src/**/*types.ts', // type-only declarations (no runtime code)
        // The I/O edges below execute only against a real browser canvas
        // (PixiJS/WebGL) or a live WebRTC/relay peer connection, so they carry
        // no meaningful unit-test surface — they are exercised by the headless
        // Playwright end-to-end smoke test (npm run smoke / the `smoke` CI job)
        // instead. Excluding them keeps this metric focused on the pure,
        // unit-testable logic (engine, net protocol, input, stores, view models).
        'src/net/session/host.ts', // host-authoritative session over a live Trystero room
        'src/net/session/client.ts', // client session over a live Trystero room
        'src/net/transport/relayRoom.ts', // global-server WebSocket relay transport
        'src/render/pipeline/renderer.ts', // PixiJS application + draw loop
        'src/render/pipeline/entityView.ts', // immediate-mode Pixi Graphics drawing
        'src/render/overlays/balloons.ts', // Pixi text/emote balloons
        'src/render/overlays/fx.ts', // Pixi particle / screen-fx layer
        'src/render/rig/rig.ts', // Pixi skeletal rig runtime
        'src/render/rig/rigLayer.ts', // Pixi rig render layer
        'src/render/rig/shading.ts', // Pixi shading/tint helpers
        'src/render/lighting/litMesh.ts', // Pixi Mesh + custom lighting shader (GPU only)
        'src/render/sprites/particles.ts', // Pixi particle sprites
        'src/render/sprites/spriteLayer.ts', // Pixi retained sprite layer
        'src/ui/screens/MainMenu.tsx', // boots a Pixi Renderer (walkable menu)
        'src/ui/game/GameView.tsx', // boots a Pixi Renderer (in-fight view)
        'src/ui/game/RewardRoom.tsx', // boots a Pixi Renderer (walkable reward room)
        'src/ui/game/WarRoom.tsx', // boots a Pixi Renderer (walkable war room)
        'src/ui/game/MusterHall.tsx', // boots a Pixi Renderer (walkable lobby)
        'src/ui/App.tsx', // shell that mounts MainMenu/GameView
      ],
      reporter: ['text', 'text-summary', 'lcov'],
      // Ratchet floor for the unit-testable surface. Achieved coverage is
      // currently ~99.6% statements/functions/lines and ~98.8% branches; all
      // four gates sit at 98 — a point or two below the achieved numbers so
      // ordinary v8 variance never fails CI, while a real coverage regression
      // does. Branches is the limiting metric: the remaining uncovered branches
      // are unreachable defensive fallbacks (factory-guaranteed ability fields,
      // guards behind disabled buttons, ref-null checks inside effects, and
      // data-driven caps that fixed run/tier sizes never hit), so ~98.8% is
      // effectively the branch ceiling. Raise these as coverage climbs.
      thresholds: {
        statements: 98,
        branches: 98,
        functions: 98,
        lines: 98,
      },
    },
  },
});
