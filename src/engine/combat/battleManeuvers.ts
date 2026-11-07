/** Direct special-hit steering and hit-independent defensive footwork. */
import type { Add, Boss, ManeuverCast, Player, PlayerView, Vec2 } from '../core/types';
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
export function maneuverCast(
  p: Player,
  ab: PlayerAbilityDef,
  move: Vec2,
  fresh = true,
): ManeuverCast {
  return {
    epoch: p.maneuverEpoch ?? 0,
    ownerClass: p.classId,
    move: normalize(move),
    effect: ab.slot === 'basic' ? undefined : resolvedManeuver(ab),
    fresh,
    spent: false,
  };
}
/** Only a successful eligible recipient spends this cast's single steering request. */
export function onManeuverHit(
  w: World,
  p: Player,
  foe: Foe,
  effective: number,
  cast: ManeuverCast,
): void {
  const e = cast.effect;
  if (!validCast(w, p, cast) || effective <= 0 || e?.mode !== 'push') return;
  p.maneuverLast = { effect: { ...e }, ownerClass: p.classId, targetId: foe.id };
  if (
    foe.hp <= 0 ||
    ('charm' in foe && !!foe.charm) ||
    foe.maneuverMotion ||
    (foe.maneuverRecovery ?? 0) > 0 ||
    isRooted(foe) ||
    isSteadfast(foe)
  )
    return;
  const dir = cast.move.x || cast.move.y ? { ...cast.move } : normalize(sub(foe.pos, p.pos));
  if (!dir.x && !dir.y) dir.x = 1;
  foe.maneuverMotion = {
    ownerId: p.id,
    ownerClass: p.classId,
    ownerEpoch: p.maneuverEpoch ?? 0,
    dir,
    remaining: e.distance,
    phase: 'queued',
  };
  cast.spent = true;
}
function validCast(w: World, p: Player, cast: ManeuverCast): boolean {
  return (
    w.scene === null &&
    !cast.spent &&
    p.state === 'alive' &&
    p.hp > 0 &&
    p.classId === cast.ownerClass &&
    cast.epoch === (p.maneuverEpoch ?? 0)
  );
}
/** Schedule after the utility payload; travel is committed after current-frame strikes. */
export function onManeuverCast(w: World, p: Player, cast: ManeuverCast): void {
  const e = cast.effect;
  if (
    !validCast(w, p, cast) ||
    e?.mode !== 'step' ||
    !cast.fresh ||
    (!cast.move.x && !cast.move.y) ||
    (p.maneuverRecovery ?? 0) > 0 ||
    isRooted(p) ||
    hasBuff(p, 'stun') ||
    p.castTimer > 0 ||
    p.glide ||
    p.shove ||
    p.maneuverStep
  )
    return;
  p.maneuverLast = { effect: { ...e }, ownerClass: p.classId };
  p.maneuverStep = { dir: { ...cast.move }, distance: e.distance, ownerClass: p.classId };
  cast.spent = true;
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
    p.maneuverRecovery = RECOVERY;
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
  const last = p.maneuverLast?.ownerClass === p.classId ? p.maneuverLast : undefined;
  const equipped = [...Object.values(p.abilities ?? {}), ...Object.values(p.subAbilities ?? {})]
    .filter((ab): ab is PlayerAbilityDef => !!ab)
    .map(resolvedManeuver)
    .find((e) => !!e);
  const effect = equipped ?? last?.effect;
  if (!effect) return undefined;
  const targetId = effect.mode === 'push' ? last?.targetId : undefined;
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
  return equipped ? { ...base, phase: 'ready', remaining: 0 } : undefined;
}

/** A swap permanently invalidates old delayed hits, including swap-away-and-back. */
export function invalidateManeuvers(w: World, p: Player): void {
  p.maneuverEpoch = (p.maneuverEpoch ?? 0) + 1;
  delete p.maneuverStep;
  delete p.maneuverLast;
  if (p.glide?.maneuverClass) p.glide = null;
  for (const foe of [...w.bosses, ...w.adds])
    if (foe.maneuverMotion?.ownerId === p.id) delete foe.maneuverMotion;
}
