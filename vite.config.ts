/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// The site is served from the root of the custom domain (warband.zen.dev.br),
// so the base path is '/'. BASE_PATH can still override it at build time (e.g.
// for a project site under '/<repo>/'); defaults to '/' for local dev/preview.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
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
      // currently ~98% lines / ~94% branches; all four gates sit at 90 — a few
      // points below the branch number so ordinary v8 variance never fails CI,
      // while a real coverage regression does. Raise these as coverage climbs.
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
    },
  },
});
