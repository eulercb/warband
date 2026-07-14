/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// item 7: the app version, inlined at build time by Vite `define` (see vite.config.ts).
declare const __APP_VERSION__: string;
// item 1: the build's short git SHA and commit date, inlined the same way, so the
// menu shows an identifier that actually changes per deployed build. Empty/`dev`
// when git is unavailable (see buildStamp in vite.config.ts).
declare const __BUILD_SHA__: string;
declare const __BUILD_DATE__: string;
