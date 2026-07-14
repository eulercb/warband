import { describe, it, expect } from 'vitest';
import { formatBuildLabel } from '../src/ui/screens/buildInfo';

/**
 * item 1 — the menu build identifier. A pure formatter so the label logic is
 * covered even though MainMenu (which renders it) boots Pixi and isn't unit-tested.
 */
describe('formatBuildLabel (item 1)', () => {
  it('appends the short SHA and commit date beside the version', () => {
    const { text, aria } = formatBuildLabel('1.0.0', 'a1b2c3d', '2026-07-14');
    expect(text).toBe('v1.0.0 · a1b2c3d · 2026-07-14');
    expect(aria).toBe('Version 1.0.0, build a1b2c3d, 2026-07-14');
  });

  it('shows the SHA alone when there is no date (git-less `dev` build)', () => {
    const { text, aria } = formatBuildLabel('1.0.0', 'dev', '');
    expect(text).toBe('v1.0.0 · dev');
    expect(aria).toBe('Version 1.0.0, build dev');
  });

  it('drops an empty SHA but keeps a present date', () => {
    const { text, aria } = formatBuildLabel('1.0.0', '', '2026-07-14');
    expect(text).toBe('v1.0.0 · 2026-07-14');
    expect(aria).toBe('Version 1.0.0, build 2026-07-14');
  });

  it('falls back to just the version when no stamp is available', () => {
    const { text, aria } = formatBuildLabel('2.3.4', '', '');
    expect(text).toBe('v2.3.4');
    expect(aria).toBe('Version 2.3.4');
  });
});
