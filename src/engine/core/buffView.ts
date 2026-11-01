import { curseOwner } from './curses';
import type { Buff, BuffView } from './types';
/** Expose curse ownership without copying private source labels or proc payloads. */
export function buffView(b: Buff): BuffView {
  const view: BuffView = { kind: b.kind, remaining: b.remaining, mult: b.mult };
  if (b.kind === 'secretMark') view.ownerId = b.mult;
  if (b.kind === 'whisperRefrain' && b.whisperRefrainState)
    view.whisperRefrain = {
      anchor: { ...b.whisperRefrainState.anchor },
      radius: b.whisperRefrainState.radius,
      charges: b.mult,
    };
  if (b.kind === 'invuln' && b.source === 'divineGuard') view.visual = 'divineShield';
  const owner = b.kind === 'curse' ? curseOwner(b.source) : undefined;
  if (b.kind === 'venom' && b.venom) view.ownerId = b.venom.ownerId;
  if (b.kind === 'luckExposure') {
    const luckOwner = /^fortune:[^:]+:(\d+)$/.exec(b.source);
    if (luckOwner) view.ownerId = Number(luckOwner[1]);
  }
  if (owner !== undefined) view.ownerId = owner;
  return view;
}
