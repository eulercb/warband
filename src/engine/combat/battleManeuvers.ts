/** Deliberate positioning: native counters, portable two-cast preparation, and safe travel. */
import type {
  Add,
  Boss,
  Buff,
  ManeuverCast,
  ManeuverEffect,
  Player,
  PlayerView,
  Vec2,
} from '../core/types';
import type { PlayerAbilityDef } from '../content/classes';
import { resolvedManeuver } from '../content/classes';
import type { World } from '../world/world';
import { sub, wrapPos } from '../core/torus';
import { normalize } from '../core/math';
import { isRooted, hasBuff } from './combat';
import { isSteadfast } from './defense';
import { firstObstacleStop } from './abilities';
import { clipBulwarkStep } from './apertureMovement';
const RECOVERY = 6;
type Foe = Boss | Add;
const ready = (p: Player) => p.buffs.find((b) => b.kind === 'counter' && b.remaining > 0);
function native(p: Player, e: ManeuverEffect): boolean {
  return (
    !e.portable &&
    p.classId === 'knight' &&
    p.subclassPassiveId === 'battle_opening' &&
    !!p.charUpgradeIds?.includes(e.mode === 'push' ? 'kn_battlemaster_g_a' : 'kn_battlemaster_g_b')
  );
}
export function maneuverCast(p: Player, ab: PlayerAbilityDef, move: Vec2): ManeuverCast {
  return {
    order: (p.maneuverOrder = (p.maneuverOrder ?? 0) + 1),
    epoch: p.maneuverEpoch ?? 0,
    ownerClass: p.classId,
    move: normalize(move),
    effect: resolvedManeuver(ab),
    counter: ready(p),
    spent: false,
  };
}
export function onManeuverHit(
  w: World,
  p: Player,
  foe: Foe,
  effective: number,
  cast: ManeuverCast,
  counter?: Buff,
): void {
  if (
    w.scene !== null ||
    cast.spent ||
    effective <= 0 ||
    p.state !== 'alive' ||
    p.hp <= 0 ||
    p.classId !== cast.ownerClass ||
    cast.epoch !== (p.maneuverEpoch ?? 0)
  )
    return;
  const effect = cast.effect;
  if (effect && native(p, effect)) {
    if (!counter || cast.counter !== counter) return;
    cast.spent = true;
    if (effect.mode === 'push' && counter.openingTargetId !== foe.id) return;
    perform(p, foe, effect, cast.move);
    return;
  }
  if ((p.maneuverRecovery ?? 0) > 0) return;
  if (cast.order < (p.maneuverLatestOrder ?? 0)) return;
  const mark = p.maneuverMark;
  const spendsMark = !!(
    mark &&
    mark.ownerClass === p.classId &&
    mark.remaining > 0 &&
    mark.targetId === foe.id &&
    cast.order > mark.cast.order
  );
  const portableEffect = spendsMark ? mark.effect : effect;
  if (portableEffect?.mode === 'push' && (foe.maneuverMotion || (foe.maneuverRecovery ?? 0) > 0)) {
    p.maneuverLast = { effect: { ...portableEffect }, ownerClass: p.classId, targetId: foe.id };
    return;
  }
  if (spendsMark && mark) {
    cast.spent = true;
    delete p.maneuverMark;
    p.maneuverLatestOrder = cast.order;
    perform(p, foe, mark.effect, cast.move);
  } else if (effect && foe.hp > 0) {
    cast.spent = true;
    p.maneuverLatestOrder = cast.order;
    p.maneuverMark = {
      targetId: foe.id,
      cast,
      effect: { ...effect, portable: true },
      remaining: 4,
      ownerClass: p.classId,
    };
  }
}
function perform(p: Player, foe: Foe, e: ManeuverEffect, move: Vec2): void {
  if (e.mode === 'step') {
    if (
      (p.maneuverRecovery ?? 0) > 0 ||
      (!move.x && !move.y) ||
      isRooted(p) ||
      hasBuff(p, 'stun') ||
      p.castTimer > 0 ||
      p.glide ||
      p.shove
    )
      return;
    p.maneuverLast = { effect: { ...e }, ownerClass: p.classId };
    p.maneuverStep = { dir: { ...move }, distance: e.distance, ownerClass: p.classId };
    p.maneuverRecovery = RECOVERY;
    return;
  }
  p.maneuverLast = { effect: { ...e }, ownerClass: p.classId, targetId: foe.id };
  if (
    foe.hp <= 0 ||
    foe.maneuverMotion ||
    (foe.maneuverRecovery ?? 0) > 0 ||
    isRooted(foe) ||
    isSteadfast(foe)
  )
    return;
  const dir = move.x || move.y ? { ...move } : normalize(sub(foe.pos, p.pos));
  if (!dir.x && !dir.y) dir.x = 1;
  foe.maneuverMotion = {
    ownerId: p.id,
    ownerClass: p.classId,
    dir: { ...dir },
    remaining: e.distance,
    phase: 'queued',
    ownerEpoch: p.maneuverEpoch ?? 0,
  };
}
/** Never relocate a committed attack; recover/idle are the only launch points. */
function releaseManeuver(w: World, foe: Foe, dt: number): void {
  const m = foe.maneuverMotion;
  if (!m || m.phase !== 'queued') return;
  const owner = w.players.find((p) => p.id === m.ownerId);
  if (
    !owner ||
    owner.state !== 'alive' ||
    owner.hp <= 0 ||
    owner.classId !== m.ownerClass ||
    (owner.maneuverEpoch ?? 0) !== m.ownerEpoch ||
    foe.hp <= 0 ||
    ('charm' in foe && !!foe.charm) ||
    isRooted(foe) ||
    isSteadfast(foe)
  ) {
    delete foe.maneuverMotion;
    return;
  }
  if ('action' in foe && (foe.action.kind === 'windup' || foe.action.kind === 'channel')) return;
  if (foe.shove) {
    m.blockedTime = (m.blockedTime ?? 0) + dt;
    // Competing pushes cannot reserve the boss's next decision indefinitely.
    if (m.blockedTime >= 1 - 1e-6) {
      delete foe.maneuverMotion;
      foe.maneuverRecovery = RECOVERY;
    }
    return;
  }
  m.phase = 'travel';
  foe.maneuverRecovery = RECOVERY;
  foe.shove = null;
}
/** Runs after all current-frame strikes and before boss decisions; moves host positions only. */
export function tickManeuvers(w: World, dt: number): void {
  for (const p of w.players) {
    p.maneuverRecovery = Math.max(0, (p.maneuverRecovery ?? 0) - dt);
    const mark = p.maneuverMark;
    if (mark) {
      mark.remaining -= dt;
      const foe = [...w.bosses, ...w.adds].find(
        (e) => e.id === mark.targetId && e.hp > 0 && !('charm' in e && e.charm),
      );
      if (
        mark.remaining <= 0 ||
        p.state !== 'alive' ||
        p.hp <= 0 ||
        p.classId !== mark.ownerClass ||
        !foe
      )
        delete p.maneuverMark;
    }
    const step = p.maneuverStep;
    if (!step) continue;
    delete p.maneuverStep;
    if (
      p.state !== 'alive' ||
      p.hp <= 0 ||
      p.classId !== step.ownerClass ||
      isRooted(p) ||
      hasBuff(p, 'stun') ||
      p.castTimer > 0 ||
      p.glide ||
      p.shove
    )
      continue;
    p.glide = {
      dir: step.dir,
      remaining: step.distance,
      leap: false,
      maneuverClass: step.ownerClass,
      ab: {
        name: 'Maneuver step',
        slot: 'basic',
        kind: 'dash',
        damage: 0,
        cooldown: 0,
        range: step.distance,
      },
    };
  }
  for (const foe of [...w.bosses, ...w.adds]) {
    foe.maneuverRecovery = Math.max(0, (foe.maneuverRecovery ?? 0) - dt);
    if (foe.maneuverMotion?.phase === 'travel' && foe.shove) foe.maneuverMotion.phase = 'queued';
    releaseManeuver(w, foe, dt);
    const m = foe.maneuverMotion;
    if (!m || m.phase !== 'travel') continue;
    const owner = w.players.find((p) => p.id === m.ownerId);
    if (
      !owner ||
      owner.state !== 'alive' ||
      owner.hp <= 0 ||
      owner.classId !== m.ownerClass ||
      (owner.maneuverEpoch ?? 0) !== m.ownerEpoch ||
      foe.hp <= 0 ||
      ('charm' in foe && !!foe.charm) ||
      isRooted(foe) ||
      isSteadfast(foe)
    ) {
      delete foe.maneuverMotion;
      continue;
    }
    const distance = Math.min(m.remaining, 600 * dt);
    const to = { x: foe.pos.x + m.dir.x * distance, y: foe.pos.y + m.dir.y * distance };
    // Existing large bodies can touch/overlap cover; allow escape, never deeper entry.
    if (
      w.obstacles.some((o) => {
        const rel = sub(foe.pos, o.pos);
        return (
          Math.hypot(rel.x, rel.y) < foe.radius + o.radius - 1e-6 &&
          rel.x * m.dir.x + rel.y * m.dir.y < 0
        );
      })
    ) {
      delete foe.maneuverMotion;
      continue;
    }
    const stop = firstObstacleStop(w, foe.pos, to, foe.radius, false);
    const clipped = clipBulwarkStep(w, foe, stop ?? to);
    foe.pos = wrapPos(clipped.pos);
    m.remaining -= distance;
    if (stop || clipped.stopped || m.remaining <= 1e-6) delete foe.maneuverMotion;
  }
}
export function maneuverView(w: World, p: Player): PlayerView['maneuver'] {
  if (p.state !== 'alive' || p.hp <= 0) return undefined;
  const mark = p.maneuverMark?.ownerClass === p.classId ? p.maneuverMark : undefined;
  const counter = ready(p);
  const last = p.maneuverLast?.ownerClass === p.classId ? p.maneuverLast : undefined;
  const candidate: ManeuverEffect | undefined =
    p.classId === 'knight' && p.subclassPassiveId === 'battle_opening'
      ? p.charUpgradeIds?.includes('kn_battlemaster_g_a')
        ? { mode: 'push', distance: 80 }
        : p.charUpgradeIds?.includes('kn_battlemaster_g_b')
          ? { mode: 'step', distance: 90 }
          : undefined
      : undefined;
  const nativeEffect =
    candidate &&
    [...Object.values(p.abilities ?? {}), ...Object.values(p.subAbilities ?? {})].some((ab) => {
      if (!ab) return false;
      const effect = resolvedManeuver(ab);
      return !!effect && effect.mode === candidate.mode && native(p, effect);
    })
      ? candidate
      : undefined;
  const effect = mark?.effect ?? nativeEffect ?? last?.effect;
  if (!effect) return undefined;
  const targetId =
    mark?.targetId ??
    (nativeEffect?.mode === 'push' && counter?.openingTargetId !== undefined
      ? counter.openingTargetId
      : last?.targetId);
  const foe = [...w.bosses, ...w.adds].find(
    (e) => e.id === targetId && e.hp > 0 && !('charm' in e && e.charm),
  );
  const base = {
    mode: effect.mode,
    distance: effect.distance,
    portable: !!effect.portable,
    dir: normalize(p.maneuverMove ?? { x: 0, y: 0 }),
    targetId,
  };
  if (effect.mode === 'push' && foe?.maneuverMotion)
    return {
      ...base,
      phase: foe.maneuverMotion.phase,
      remaining: foe.maneuverMotion.remaining,
      dir: { ...foe.maneuverMotion.dir },
    };
  const recovery =
    effect.mode === 'push' ? (foe?.maneuverRecovery ?? 0) : (p.maneuverRecovery ?? 0);
  if (recovery > 0) return { ...base, phase: 'recovery', remaining: recovery };
  if (mark && foe) return { ...base, phase: 'ready', remaining: mark.remaining };
  if (!nativeEffect || !counter || (effect.mode === 'push' && !foe)) return undefined;
  return { ...base, phase: 'ready', remaining: counter.remaining };
}

/** A swap permanently invalidates old delayed hits, including swap-away-and-back. */
export function invalidateManeuvers(w: World, p: Player): void {
  p.maneuverEpoch = (p.maneuverEpoch ?? 0) + 1;
  delete p.maneuverMark;
  delete p.maneuverStep;
  delete p.maneuverLast;
  if (p.glide?.maneuverClass) p.glide = null;
  for (const foe of [...w.bosses, ...w.adds])
    if (foe.maneuverMotion?.ownerId === p.id) delete foe.maneuverMotion;
}
