import type { BuffView } from './types';
/** Same public status for keyboard, controller, touch and arena overlays. */
export function silenceStatus(buffs: BuffView[]): string | undefined {
  const active = buffs.filter((b) => b.kind === 'silence' && b.remaining > 0);
  if (!active.length) return undefined;
  return active.some((b) => b.sustainedSilence)
    ? 'Silenced · Leave the antimagic pool'
    : `Silenced · ${Math.max(...active.map((b) => b.remaining)).toFixed(1)}s`;
}
