/** Cosmetic recipient feedback. Target selection and effect resolution stay authoritative. */
import type { Player, GroundZone, SupportCueKind } from '../core/types';
import type { World } from '../world/world';
export function supportCue(
  world: World,
  source: Player,
  target: Player,
  kind: SupportCueKind,
): void {
  world.events.push({
    t: 'support',
    sourceId: source.id,
    targetId: target.id,
    from: { ...source.pos },
    pos: { ...target.pos },
    kind,
  });
}
export function buffCues(
  world: World,
  source: Player,
  target: Player,
  effects: {
    buffDefMult?: number;
    buffDamageMult?: number;
    buffMoveMult?: number;
    grantsFlight?: number;
  },
): void {
  if (effects.buffDamageMult) supportCue(world, source, target, 'empower');
  if (effects.buffDefMult) supportCue(world, source, target, 'protect');
  if (effects.buffMoveMult || effects.grantsFlight) supportCue(world, source, target, 'haste');
}

/** Use actual zone payloads, including Forge mixtures, rather than ability names/colors. */
export function zoneSupportKinds(z: GroundZone): SupportCueKind[] {
  if (z.side !== 'player') return [];
  const kinds: SupportCueKind[] = [];
  if (z.healPerTick > 0) kinds.push('heal');
  if (z.overflowShield) kinds.push('absorb');
  if (z.allyBuff?.defMult) kinds.push('protect');
  if (z.allyBuff?.dmgMult) kinds.push('empower');
  if (z.allyBuff?.moveMult) kinds.push('haste');
  return kinds;
}
