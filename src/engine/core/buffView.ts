import { curseOwner } from './curses';
import type { Buff, BuffView } from './types';
/** Expose curse ownership without copying private source labels or proc payloads. */
export function buffView(b: Buff): BuffView {
  const view: BuffView = { kind: b.kind, remaining: b.remaining, mult: b.mult };
  const owner = b.kind === 'curse' ? curseOwner(b.source) : undefined;
  if (owner !== undefined) view.ownerId = owner;
  return view;
}
