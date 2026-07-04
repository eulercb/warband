/**
 * Warband — PWA service worker registration. `registerType: 'autoUpdate'` in the
 * Vite config means new versions activate automatically; this just wires it up
 * and fails silently where service workers are unavailable.
 */
import { registerSW as viteRegisterSW } from 'virtual:pwa-register';

export function registerSW(): void {
  try {
    viteRegisterSW({ immediate: true });
  } catch {
    /* service workers unavailable (e.g. non-secure context) — ignore */
  }
}
