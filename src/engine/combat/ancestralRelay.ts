/** A prepared burst origin, owned by the caster; never a decoy or extra attack. */
import type { AncestralCast, ExtSlot, Player, PlayerView, Vec2 } from '../core/types';
import type { PlayerAbilityDef } from '../content/classes';
import type { World } from '../world/world';
import { resolvedAncestralRelay } from '../content/classes';
import { occupancyAfter } from '../content/charUpgrades';
import { boundedAbility } from '../content/abilityLimits';
import { abilityForSlot } from './abilities';
import { dist, wrapPos } from '../core/torus';
import { normalize } from '../core/math';

function carriers(p: Player): PlayerAbilityDef[] {
  return [...Object.values(p.abilities ?? {}), ...Object.values(p.subAbilities ?? {})].filter(
    (ab): ab is PlayerAbilityDef => !!ab && !!resolvedAncestralRelay(ab),
  );
}
export function nativeRelayIdentity(p: Player): boolean {
  return (
    p.classId === 'barbarian' &&
    p.subclassPassiveId === 'totem_shelter' &&
    !!p.charUpgradeIds?.includes('bb_totem_g_b')
  );
}
const nativeSources = new WeakMap<
  Player,
  { source: PlayerAbilityDef; history: string; native: boolean }
>();
/** Provenance comes from skill occupancy, never a display name or a graft's slot alone. */
function nativeRage(p: Player): boolean {
  const source = p.abilities?.a1;
  if (
    !nativeRelayIdentity(p) ||
    !source ||
    source.components ||
    source.kind !== 'selfBuff' ||
    !source.momentumWindow
  )
    return false;
  const history = (p.charUpgradeIds ?? []).join('|');
  const cached = nativeSources.get(p);
  if (cached?.source === source && cached.history === history) return cached.native;
  const native = occupancyAfter('barbarian', p.charUpgradeIds ?? []).a1 === 'a1';
  nativeSources.set(p, { source, history, native });
  return native;
}
function live(w: World, p: Player): boolean {
  return w.scene === null && p.state === 'alive' && p.hp > 0;
}
function station(p: Player) {
  const s = p.ancestralStation;
  return s?.ownerClass === p.classId && s.epoch === (p.ancestralEpoch ?? 0) ? s : undefined;
}
export function reserveAncestralCast(
  w: World,
  p: Player,
  ab: PlayerAbilityDef,
  slot: ExtSlot,
): AncestralCast | undefined {
  if (!live(w, p) || slot === 'basic') return undefined;
  const source = abilityForSlot(p, slot);
  if (!source) return undefined;
  const effect = resolvedAncestralRelay(ab);
  if (effect) {
    const s = station(p);
    const remote = !!s && dist(p.pos, s.pos) <= Math.min(360, effect.range);
    return {
      kind: 'relay',
      ownerClass: p.classId,
      epoch: p.ancestralEpoch ?? 0,
      origin: { ...(remote ? s.pos : p.pos) },
      next: { ...p.pos },
      remote,
      source,
      slot,
      spent: false,
    };
  }
  if (slot === 'a1' && nativeRage(p) && carriers(p).length) {
    const aim = normalize(p.aim);
    const origin = wrapPos({
      x: p.pos.x + (aim.x || (!aim.y ? 1 : 0)) * 180,
      y: p.pos.y + aim.y * 180,
    });
    return {
      kind: 'seed',
      ownerClass: p.classId,
      epoch: p.ancestralEpoch ?? 0,
      origin,
      next: origin,
      remote: false,
      source,
      slot,
      spent: false,
    };
  }
  return undefined;
}
function valid(w: World, p: Player, cast: AncestralCast): boolean {
  return (
    live(w, p) &&
    !cast.spent &&
    p.classId === cast.ownerClass &&
    (p.ancestralEpoch ?? 0) === cast.epoch &&
    abilityForSlot(p, cast.slot) === cast.source &&
    carriers(p).length > 0
  );
}
export function ancestralOrigin(w: World, p: Player, ab: PlayerAbilityDef): Vec2 {
  const cast = ab.ancestralCast;
  return cast?.kind === 'relay' && valid(w, p, cast) ? { ...cast.origin } : { ...p.pos };
}
export function finishAncestralCast(w: World, p: Player, ab: PlayerAbilityDef): void {
  const cast = ab.ancestralCast;
  if (!cast || !valid(w, p, cast)) return;
  cast.spent = true;
  p.ancestralStation = {
    pos: wrapPos(cast.next),
    ownerClass: p.classId,
    epoch: p.ancestralEpoch ?? 0,
  };
}
export function invalidateAncestralRelay(p: Player): void {
  p.ancestralEpoch = (p.ancestralEpoch ?? 0) + 1;
  delete p.ancestralStation;
}
export function tickAncestralRelay(w: World): void {
  for (const p of w.players)
    if (p.ancestralStation && (!live(w, p) || !station(p) || !carriers(p).length))
      invalidateAncestralRelay(p);
}
export function ancestralRelayView(w: World, p: Player): PlayerView['ancestralRelay'] {
  if (!live(w, p)) return undefined;
  const list = carriers(p);
  if (!list.length) return undefined;
  const cast = p.castAbility?.ancestralCast;
  const casting = !!cast && cast.kind === 'relay' && valid(w, p, cast);
  const raw = casting ? p.castAbility! : list[0];
  const ab = boundedAbility(raw, w.arena);
  const range = Math.min(360, resolvedAncestralRelay(ab)!.range);
  const s = station(p);
  const remote = casting ? cast.remote : !!s && dist(p.pos, s.pos) <= range;
  const momentum =
    !casting && ab.spendsMomentum && p.buffs.some((b) => b.kind === 'rageRhythm' && b.remaining > 0)
      ? Math.min(3, p.buffs.find((b) => b.kind === 'momentum' && b.remaining > 0)?.mult ?? 0)
      : 0;
  return {
    station: s ? { ...s.pos } : undefined,
    origin: casting ? { ...cast.origin } : { ...(remote ? s!.pos : p.pos) },
    next: casting ? { ...cast.next } : undefined,
    remote,
    radius: (ab.radius ?? 150) + momentum * 10,
    range,
    casting,
    slot: casting ? cast.slot : ab.slot,
    seedSlot: nativeRage(p) ? 'a1' : undefined,
  };
}
