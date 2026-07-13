import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * item 7 — the main menu shows the running build version. It is injected at build
 * time via Vite `define` (`__APP_VERSION__`, see vite.config.ts) from package.json.
 * This locks the wiring in so the label can never silently go blank or stale.
 */
describe('app version (item 7)', () => {
  it('exposes package.json version as the __APP_VERSION__ build constant', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      version: string;
    };
    expect(typeof __APP_VERSION__).toBe('string');
    expect(__APP_VERSION__).toBe(pkg.version);
    expect(__APP_VERSION__).toMatch(/^\d+\.\d+\.\d+/); // semver-ish, never empty
  });
});
