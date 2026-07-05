/**
 * Warband — facing angle → discrete sprite direction.
 *
 * Pure. World y is down and `worldToScreen` doesn't flip, so a world-space
 * aim/facing angle maps directly to on-screen direction (aim.y>0 === south).
 */
import type { DirMode, DirToken } from './manifest';

const TAU = Math.PI * 2;

// Clockwise from east because +angle rotates toward +y (down/south).
const OCT: DirToken[] = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'];

export interface Facing {
  dir: DirToken | null; // null for 'single'
  flipX: boolean;
}

/** Resolve a radians angle to a direction token + horizontal flip for `mode`. */
export function facingFor(angle: number, mode: DirMode): Facing {
  if (mode === 'single') return { dir: null, flipX: false };
  if (mode === 'flip') return { dir: 'side', flipX: Math.cos(angle) < 0 };
  const a = ((angle % TAU) + TAU) % TAU;
  if (mode === '8dir') {
    const idx = Math.round(a / (TAU / 8)) % 8;
    return { dir: OCT[idx], flipX: false };
  }
  // '4dir': nearest of e/s/w/n; mirror w from e art.
  const q = Math.round(a / (TAU / 4)) % 4; // 0:e 1:s 2:w 3:n
  if (q === 2) return { dir: 'e', flipX: true };
  return { dir: (['e', 's', 'e', 'n'] as DirToken[])[q], flipX: false };
}
