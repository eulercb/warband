/** Travelling special delivery and one fresh-press follow-up buffer. */
import type { PalmSweepCast, Player, Vec2, ExtSlot, PalmSweepView } from '../core/types';
import type { PlayerAbilityDef } from '../content/classes';
import type { World } from '../world/world';
import { resolvedPalmSweep } from '../content/classes';
import { boundedAbility } from '../content/abilityLimits';
import { abilityForSlot } from './abilities';
import { isRooted } from './combat';
import { consumeMartialFinishers } from './martial';
import { normalize } from '../core/math';
import { sub, wrapPos, pointInCone } from '../core/torus';
export const PALM_SPEED = 450;
const live = (w: World, p: Player) =>
  !w.finished && w.scene === null && p.state === 'alive' && p.hp > 0;
export function palmDirection(move: Vec2, aim: Vec2): Vec2 {
  const d = normalize(move.x || move.y ? move : aim);
  return d.x || d.y ? d : { x: 1, y: 0 };
}
export function reservePalmSweep(
  w: World,
  p: Player,
  ab: PlayerAbilityDef,
  slot: ExtSlot,
  move: Vec2,
  aim: Vec2 = p.aim,
): PalmSweepCast | undefined {
  if (!live(w, p) || !resolvedPalmSweep(ab)) return undefined;
  const source = abilityForSlot(p, slot);
  if (!source) return undefined;
  p.lastFlowSlot = slot;
  return {
    source,
    slot,
    ownerClass: p.classId,
    epoch: p.palmEpoch ?? 0,
    dir: palmDirection(move, aim),
    aim: palmDirection({ x: 0, y: 0 }, aim),
  };
}
export function validPalmSweep(w: World, p: Player, cast: PalmSweepCast): boolean {
  return (
    live(w, p) &&
    cast.ownerClass === p.classId &&
    cast.epoch === (p.palmEpoch ?? 0) &&
    abilityForSlot(p, cast.slot) === cast.source &&
    !!resolvedPalmSweep(cast.source)
  );
}
export function startPalmSweep(w: World, p: Player, ab: PlayerAbilityDef): boolean {
  const cast = ab.palmSweepCast,
    effect = resolvedPalmSweep(ab);
  if (!cast || !effect || !validPalmSweep(w, p, cast) || isRooted(p)) return false;
  p.glide = {
    dir: { ...cast.dir },
    remaining: Math.max(30, Math.min(180, effect.distance)),
    leap: false,
    ab,
    speed: PALM_SPEED,
    palmSweep: { cast, hitIds: [], origin: { ...p.pos } },
  };
  return true;
}
/** First contact with the swept circle, including wrapped arena seams. */
export function palmContact(from: Vec2, to: Vec2, target: Vec2, radius: number): Vec2 | null {
  const d = sub(to, from),
    r = sub(target, from),
    a = d.x * d.x + d.y * d.y,
    c = r.x * r.x + r.y * r.y - radius * radius;
  if (c <= 0) return { ...from };
  if (a <= 0) return null;
  const b = r.x * d.x + r.y * d.y,
    disc = b * b - a * c;
  if (disc < 0) return null;
  const t = (b - Math.sqrt(disc)) / a;
  return t >= 0 && t <= 1 ? wrapPos({ x: from.x + d.x * t, y: from.y + d.y * t }) : null;
}
export function palmSweepView(w: World, p: Player): PalmSweepView | undefined {
  if (!live(w, p)) return undefined;
  const g = p.glide,
    active = !!g?.palmSweep && validPalmSweep(w, p, g.palmSweep.cast);
  const receivers = [
    ...Object.values(p.abilities ?? {}),
    ...Object.values(p.subAbilities ?? {}),
  ].filter((a): a is PlayerAbilityDef => !!a && !!resolvedPalmSweep(a));
  const raw = active
    ? g.ab
    : p.castAbility && resolvedPalmSweep(p.castAbility)
      ? p.castAbility
      : (receivers.find((a) => a.slot === p.lastFlowSlot) ??
        receivers.find((a) => a.kind === 'pbaoe') ??
        receivers[0]);
  if (!raw) return undefined;
  const casting = !active && p.castTimer > 0 && p.castAbility === raw;
  // Preview the real resource resolver on isolated buff state, never spend live preparation.
  const prepared =
    active || casting
      ? raw
      : consumeMartialFinishers({ ...p, buffs: p.buffs.map((b) => ({ ...b })) }, raw);
  const ab = boundedAbility(prepared, w.arena),
    effect = resolvedPalmSweep(ab)!;
  const slot = active ? g.palmSweep!.cast.slot : casting ? p.castSlot! : ab.slot;
  return {
    queuedSlot: p.flowQueue?.slot,
    shape: ab.kind,
    angle: Math.atan2(
      (active ? g.palmSweep!.cast.aim : (ab.flowAim ?? ab.palmSweepCast?.aim ?? p.aim)).y,
      (active ? g.palmSweep!.cast.aim : (ab.flowAim ?? ab.palmSweepCast?.aim ?? p.aim)).x,
    ),
    halfAngle: ((ab.halfAngleDeg ?? 45) * Math.PI) / 180,
    range: ab.range ?? 70,
    dir: active
      ? { ...g.dir }
      : casting
        ? { ...ab.palmSweepCast!.dir }
        : palmDirection(p.maneuverMove ?? { x: 0, y: 0 }, p.aim),
    radius: ab.radius ?? 150,
    distance: active ? g.remaining : Math.min(180, effect.distance),
    active,
    casting,
    ready: (p.cooldowns[slot] ?? 0) <= 0,
    blocked: isRooted(p) ? 'Rooted · no travel' : null,
    slot,
    origin: active ? { ...g.palmSweep!.origin } : { ...p.pos },
  };
}

/** Exact boundary candidates for a translated aimed sector; verify with the normal cone test. */
export function sweptConeContact(
  from: Vec2,
  to: Vec2,
  target: Vec2,
  angle: number,
  range: number,
  half: number,
  targetRadius: number,
): Vec2 | null {
  if (half >= Math.PI) return palmContact(from, to, target, range + targetRadius);
  const d = sub(to, from),
    r = sub(target, from),
    a = d.x * d.x + d.y * d.y;
  if (a === 0)
    return pointInCone(target, from, angle, range, half, targetRadius) ? { ...from } : null;
  const cuts = [0, 1],
    put = (t: number) => {
      if (t >= 0 && t <= 1) cuts.push(t);
    };
  const circle = (radius: number) => {
    if (a <= 0) return;
    const b = r.x * d.x + r.y * d.y,
      c = r.x * r.x + r.y * r.y - radius * radius,
      disc = b * b - a * c;
    if (disc >= 0) {
      put((b - Math.sqrt(disc)) / a);
      put((b + Math.sqrt(disc)) / a);
    }
  };
  const line = (nx: number, ny: number, offset: number) => {
    const denominator = nx * d.x + ny * d.y;
    if (Math.abs(denominator) > 1e-12) put((nx * r.x + ny * r.y - offset) / denominator);
  };
  circle(range + targetRadius);
  circle(targetRadius);
  circle(1e-6);
  for (const sign of [-1, 1]) {
    const side = angle + sign * half;
    line(-sign * Math.sin(side), sign * Math.cos(side), targetRadius);
    line(-Math.sin(side), Math.cos(side), 0);
    const limit = angle + sign * (half + Math.PI / 2);
    line(-Math.sin(limit), Math.cos(limit), 0);
  }
  line(Math.cos(angle), Math.sin(angle), 0);
  line(-Math.sin(angle), Math.cos(angle), 0);
  cuts.sort((x, y) => x - y);
  const pos = (t: number) => wrapPos({ x: from.x + d.x * t, y: from.y + d.y * t });
  const inside = (t: number) => pointInCone(target, pos(t), angle, range, half, targetRadius);
  for (let i = 0; i < cuts.length; i++) {
    if (inside(cuts[i])) return pos(cuts[i]);
    if (i + 1 < cuts.length) {
      let lo = cuts[i],
        hi = (lo + cuts[i + 1]) / 2;
      if (inside(hi)) {
        for (let n = 0; n < 24; n++) {
          const mid = (lo + hi) / 2;
          if (inside(mid)) hi = mid;
          else lo = mid;
        }
        return pos(hi);
      }
    }
  }
  return null;
}

export function flowChainAction(ab: PlayerAbilityDef | undefined): boolean {
  return !!ab && (!!ab.prepareFlow || !!resolvedPalmSweep(ab));
}
export function maintainFlowQueue(w: World, p: Player): void {
  const q = p.flowQueue;
  if (
    q &&
    (!live(w, p) ||
      q.ownerClass !== p.classId ||
      q.epoch !== (p.palmEpoch ?? 0) ||
      abilityForSlot(p, q.slot) !== q.source ||
      !flowChainAction(q.source) ||
      isRooted(p) ||
      p.shove ||
      p.buffs.some((b) => b.kind === 'stun' && b.remaining > 0))
  )
    delete p.flowQueue;
}
export function bufferFlowAction(
  w: World,
  p: Player,
  slot: ExtSlot,
  move: Vec2,
  aim: Vec2,
): boolean {
  const g = p.glide,
    source = abilityForSlot(p, slot);
  if (!live(w, p) || !g || !flowChainAction(source)) return false;
  const enabled =
    !!g.palmSweep ||
    (!!g.ab.prepareFlow &&
      [...Object.values(p.abilities ?? {}), ...Object.values(p.subAbilities ?? {})].some(
        (a) => a && resolvedPalmSweep(a),
      ));
  if (
    !enabled ||
    isRooted(p) ||
    p.shove ||
    p.buffs.some((b) => b.kind === 'stun' && b.remaining > 0)
  )
    return false;
  p.flowQueue = {
    slot,
    source: source!,
    ownerClass: p.classId,
    epoch: p.palmEpoch ?? 0,
    move: { ...move },
    aim: { ...aim },
  };
  return true;
}
