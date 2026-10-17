import type { BuffView } from './types';
/** The exact live condition used by control-burst attacks at impact. */
export function isBurstControl(b: BuffView): boolean {
  return (
    b.remaining > 0 &&
    (b.kind === 'stun' || b.kind === 'root' || (b.kind === 'moveSpeed' && b.mult < 1))
  );
}
