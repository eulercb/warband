/**
 * item 1 — format the main-menu build identifier.
 *
 * The semantic version never changes between deploys (every push to main ships
 * the same "1.0.0"), so on its own it can't identify which build is live. The
 * short git SHA and commit date (injected by Vite `define`, see vite.config.ts)
 * DO change every deploy, so we append them beside the version. Kept as a pure
 * helper because MainMenu itself boots a Pixi renderer and isn't unit-tested.
 */

export interface BuildLabel {
  /** Visible text, e.g. `v1.0.0 · a1b2c3d · 2026-07-14`. */
  text: string;
  /** Screen-reader label, spoken more naturally than the dot-separated text. */
  aria: string;
}

/**
 * Build the version label from the semantic version plus the per-build stamp.
 * Falsy stamp parts are dropped, so a missing date (or a git-less `dev` build
 * with no stamp at all) degrades cleanly to just `v<version>`.
 */
export function formatBuildLabel(version: string, sha: string, date: string): BuildLabel {
  const stamp = [sha, date].filter(Boolean);
  return stamp.length > 0
    ? {
        text: `v${version} · ${stamp.join(' · ')}`,
        aria: `Version ${version}, build ${stamp.join(', ')}`,
      }
    : { text: `v${version}`, aria: `Version ${version}` };
}
