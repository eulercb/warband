import type { Buff, BuffView } from './types';
/** Expose curse ownership without copying private source labels or proc payloads. */
export function buffView(b: Buff): BuffView {
  const view: BuffView = { kind: b.kind, remaining: b.remaining, mult: b.mult };
  const owner = b.kind === 'curse' ? /^curse:(\d+)$/.exec(b.source) : null;
  if (owner) view.ownerId = Number(owner[1]);
  return view;
}
