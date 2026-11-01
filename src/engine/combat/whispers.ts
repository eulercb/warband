import { walkAroundBulwarks } from './apertureMovement';
/** Host-owned perception: real retreat, false targets and bounded add allegiance. */
import type { Add, ApparitionView, Boss, Player, Vec2, WhisperCast } from '../core/types';
import type { PlayerAbilityDef } from '../content/classes';
import type { World } from '../world/world';
import { dist, sub } from '../core/torus';
import { isSteadfast } from './defense';
import { ADD_DAMAGE, ADD_ATTACK_CD } from '../core/constants';
import { damageAdd, damageBoss, isRooted, buffMult } from './combat';

// Keep the stable passive ID so earned subclass records need no migration.
export const WHISPERS = 'whispers_echoed_refrain';
type Enemy = Boss | Add;
export const hostileAdd = (a: Add): boolean => a.hp > 0 && !a.charm;
const ownerAlive = (w: World, id: number) =>
  w.players.find((p) => p.id === id && p.state === 'alive' && p.hp > 0);
const eligible = (w: World, p: Player) =>
  w.scene === null && p.state === 'alive' && p.hp > 0 && p.subclassPassiveId === WHISPERS;
const enemyById = (w: World, id?: number): Enemy | undefined =>
  [...w.bosses, ...w.adds].find((e) => e.id === id && e.hp > 0 && !('charm' in e && e.charm));

export function whisperCast(w: World, p: Player, ab: PlayerAbilityDef): WhisperCast {
  return {
    ownerClass: p.classId,
    spent: false,
    targetId: eligible(w, p) ? p.whisperSecret?.targetId : undefined,
    source: { ...p.pos },
    discord: ab.slot !== 'basic' && ab.bardSong === 'discord',
    apparition: ab.apparition ? { ...ab.apparition } : undefined,
  };
}

function admit(
  w: World,
  p: Player,
  enemy: Enemy,
  pos: Vec2,
  mode: 'fear' | 'lure',
  duration: number,
  radius = 0,
): boolean {
  if (
    w.scene !== null ||
    !ownerAlive(w, p.id) ||
    enemy.hp <= 0 ||
    enemy.perception ||
    (enemy.perceptionRecovery ?? 0) > 0 ||
    (w.tauntTimer > 0 && w.tauntTargetId != null) ||
    (mode === 'fear' &&
      (enemy.moveSpeed <= 0 || isRooted(enemy) || isSteadfast(enemy) || enemy.shove))
  )
    return false;
  enemy.perception = {
    ownerId: p.id,
    ownerClass: p.classId,
    mode,
    pos: { ...pos },
    remaining: Math.min(6, duration),
    pending: mode === 'lure' ? duration : 5,
    active: false,
    travel: 0,
    radius,
  };
  enemy.perceptionRecovery = 8;
  return true;
}

/** Only an accepted effect spends a mark; taunts and control conflicts preserve it. */
export function spendSecret(
  w: World,
  p: Player,
  cast: WhisperCast,
  pos: Vec2,
  radius = 0,
): boolean {
  const secret = p.whisperSecret;
  if (
    !eligible(w, p) ||
    p.classId !== cast.ownerClass ||
    cast.spent ||
    !secret ||
    secret.targetId !== cast.targetId
  )
    return false;
  const enemy = enemyById(w, secret.targetId);
  if (!enemy || dist(p.pos, enemy.pos) > 600) return false;
  const identity = p.charUpgradeIds?.includes('ba_whispers_g_b')
    ? 'quarry'
    : p.charUpgradeIds?.includes('ba_whispers_g_a')
      ? 'directed'
      : undefined;
  let origin = { ...pos };
  if (identity === 'directed') {
    const len = Math.hypot(p.aim.x, p.aim.y) || 1;
    origin = {
      x: Math.max(20, Math.min(w.arena.w - 20, enemy.pos.x + (p.aim.x / len) * 100)),
      y: Math.max(20, Math.min(w.arena.h - 20, enemy.pos.y + (p.aim.y / len) * 100)),
    };
  }
  if (
    !admit(
      w,
      p,
      enemy,
      origin,
      identity === 'quarry' ? 'lure' : 'fear',
      identity === 'quarry' ? 6 : radius > 0 ? 3 : 1.4,
      radius,
    )
  )
    return false;
  enemy.perception!.requiresPassive = true;
  cast.spent = true;
  p.whisperSecret = undefined;
  p.whisperRecovery = 8;
  return true;
}

/** Carried skill payloads work on actual retained Forge/copy recipients. */
export function apparitionHit(w: World, p: Player, enemy: Enemy, cast?: WhisperCast): void {
  if (
    !cast?.apparition ||
    cast.payloadSpent ||
    enemy.hp <= 0 ||
    !ownerAlive(w, p.id) ||
    p.classId !== cast.ownerClass
  )
    return;
  const { duration } = cast.apparition;
  // Bosses are not converted. Following-field value remains available in solo.
  if ('monsterId' in enemy || !hostileAdd(enemy) || (enemy.perceptionRecovery ?? 0) > 0) return;
  enemy.charm = { ownerId: p.id, ownerClass: p.classId, remaining: Math.min(4, duration) };
  enemy.perception = undefined;
  enemy.perceptionRecovery = 8;
  cast.payloadSpent = true;
}

export function onWhisperHit(
  w: World,
  p: Player,
  enemy: Enemy,
  effective: number,
  cast?: WhisperCast,
): void {
  if (effective <= 0 || (cast && cast.ownerClass !== p.classId)) return;
  // A grand payload and the passive share a cast budget, rather than stacking AI overrides.
  apparitionHit(w, p, enemy, cast);
  if (!eligible(w, p) || enemy.hp <= 0 || ('charm' in enemy && enemy.charm)) return;
  if (cast?.discord && cast.targetId === enemy.id && spendSecret(w, p, cast, cast.source)) return;
  if (!p.whisperSecret && (p.whisperRecovery ?? 0) <= 0) {
    p.whisperSecret = { targetId: enemy.id, remaining: 8 };
  }
}

export function zoneWhisperHit(
  w: World,
  p: Player | null,
  enemy: Enemy,
  effective: number,
  cast?: WhisperCast,
  pos?: Vec2,
  radius = 0,
): void {
  if (!p || effective <= 0 || (cast && cast.ownerClass !== p.classId)) return;
  if (cast?.discord && cast.targetId === enemy.id && pos) spendSecret(w, p, cast, pos, radius);
  apparitionHit(w, p, enemy, cast);
  if (
    eligible(w, p) &&
    !p.whisperSecret &&
    (p.whisperRecovery ?? 0) <= 0 &&
    enemy.hp > 0 &&
    !('charm' in enemy && enemy.charm)
  )
    p.whisperSecret = { targetId: enemy.id, remaining: 8 };
}

export function tickWhispers(w: World, dt: number): void {
  for (const p of w.players) {
    p.whisperRecovery = Math.max(0, (p.whisperRecovery ?? 0) - dt);
    p.buffs = p.buffs.filter((b) => !['refrainEcho', 'secretReady'].includes(b.kind));
    if (p.whisperSecret) {
      p.whisperSecret.remaining -= dt;
      if (
        !eligible(w, p) ||
        p.whisperSecret.remaining <= 0 ||
        !enemyById(w, p.whisperSecret.targetId)
      )
        p.whisperSecret = undefined;
      else
        p.buffs.push({
          kind: 'secretReady',
          mult: p.whisperSecret.targetId,
          remaining: p.whisperSecret.remaining,
          source: 'whispers:ready',
        });
    }
  }
  for (const e of [...w.bosses, ...w.adds]) {
    e.perceptionRecovery = Math.max(0, (e.perceptionRecovery ?? 0) - dt);
    e.buffs = e.buffs.filter((b) => !['secretMark', 'nightmare', 'beguiling'].includes(b.kind));
    for (const p of w.players)
      if (p.whisperSecret?.targetId === e.id)
        e.buffs.push({
          kind: 'secretMark',
          mult: p.id,
          remaining: p.whisperSecret.remaining,
          source: `secret:${p.id}`,
        });
    const effect = e.perception;
    if (effect) {
      const owner = ownerAlive(w, effect.ownerId);
      effect.pending -= dt;
      if (effect.mode === 'lure') effect.remaining -= dt;
      if (
        !owner ||
        owner.classId !== effect.ownerClass ||
        w.scene !== null ||
        e.hp <= 0 ||
        effect.pending <= 0 ||
        effect.remaining <= 0 ||
        (effect.requiresPassive && owner.subclassPassiveId !== WHISPERS)
      )
        e.perception = undefined;
      else
        e.buffs.push({
          kind: 'nightmare',
          mult: effect.mode === 'fear' ? 1 : 2,
          remaining: effect.remaining,
          source: 'whispers:perception',
        });
    }
    if ('charm' in e && e.charm) {
      e.charm.remaining -= dt;
      if (
        !ownerAlive(w, e.charm.ownerId) ||
        ownerAlive(w, e.charm.ownerId)?.classId !== e.charm.ownerClass ||
        e.charm.remaining <= 0 ||
        w.scene !== null ||
        e.hp <= 0
      )
        e.charm = undefined;
      else
        e.buffs.push({
          kind: 'beguiling',
          mult: 1,
          remaining: e.charm.remaining,
          source: 'whispers:charm',
        });
    }
  }
}

/** Obstacle-aware local steps; never wrap a feared enemy across the arena. */
function walk(w: World, e: Enemy, toward: Vec2, dt: number, away: boolean): number {
  const d = sub(toward, e.pos);
  let angle = Math.atan2(d.y, d.x) + (away ? Math.PI : 0);
  if (Math.hypot(d.x, d.y) < 0.01) angle = ((e.id % 8) * Math.PI) / 4;
  const length = Math.min(e.moveSpeed * buffMult(e, 'moveSpeed') * dt, 12);
  for (const turn of [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2]) {
    let pos = {
      x: e.pos.x + Math.cos(angle + turn) * length,
      y: e.pos.y + Math.sin(angle + turn) * length,
    };
    if (
      pos.x < e.radius ||
      pos.y < e.radius ||
      pos.x > w.arena.w - e.radius ||
      pos.y > w.arena.h - e.radius
    )
      continue;
    pos = walkAroundBulwarks(w, e, pos, dt);
    if (away && dist(pos, toward) <= dist(e.pos, toward) + 0.001) continue;
    if (w.obstacles.some((o) => dist(pos, o.pos) < e.radius + o.radius)) continue;
    if (w.bosses.some((b) => b !== e && b.hp > 0 && dist(pos, b.pos) < e.radius + b.radius))
      continue;
    e.pos = pos;
    if ('facing' in e) e.facing = angle + turn;
    return length;
  }
  return 0;
}

export function stepFear(w: World, e: Enemy, dt: number): boolean {
  const effect = e.perception;
  if (!effect || effect.mode !== 'fear') return false;
  if ('action' in e && ['windup', 'channel'].includes(e.action.kind)) return false;
  if (isRooted(e) || e.shove || w.tauntTimer > 0) return false;
  effect.active = true;
  effect.remaining -= dt;
  const moved = walk(w, e, effect.pos, dt, true);
  effect.travel += moved;
  if (
    effect.remaining <= 0 ||
    effect.travel >= (effect.radius > 0 ? Math.min(300, effect.radius + e.radius + 20) : 160) ||
    moved === 0 ||
    (effect.radius > 0 && dist(e.pos, effect.pos) > effect.radius + e.radius + 20)
  )
    e.perception = undefined;
  return true;
}

export function moveToQuarry(w: World, e: Enemy, dt: number): boolean {
  const effect = e.perception;
  if (!effect || effect.mode !== 'lure' || w.tauntTimer > 0) return false;
  const reach = 'monsterId' in e ? w.defOf(e).meleeRange * 0.85 : e.radius + 35;
  if (!isRooted(e) && !e.shove && dist(e.pos, effect.pos) > reach)
    walk(w, e, effect.pos, dt, false);
  return true;
}

export function takeQuarry(w: World, b: Boss, shape: string): Vec2 | undefined {
  if (
    w.tauntTimer > 0 ||
    !['cone', 'circleAtTarget', 'line', 'projectile', 'beam'].includes(shape) ||
    b.perception?.mode !== 'lure'
  )
    return;
  const pos = { ...b.perception.pos };
  b.perception = undefined;
  return pos;
}

export function stepCharmedAdd(w: World, a: Add, dt: number): boolean {
  if (!a.charm) return false;
  const owner = ownerAlive(w, a.charm.ownerId);
  if (!owner) {
    a.charm = undefined;
    return false;
  }
  const target = [
    ...w.bosses.filter((b) => b.hp > 0),
    ...w.adds.filter((b) => b !== a && hostileAdd(b)),
  ].sort((x, y) => dist(a.pos, x.pos) - dist(a.pos, y.pos) || x.id - y.id)[0];
  if (!target) return true;
  if (dist(a.pos, target.pos) > a.radius + target.radius + 6) {
    if (!isRooted(a) && !a.shove) walk(w, a, target.pos, dt, false);
  } else if (a.attackCd <= 0) {
    if ('monsterId' in target)
      damageBoss(w, owner, target, ADD_DAMAGE * buffMult(a, 'damageDealt'), { borrowed: true });
    else damageAdd(w, owner, target, ADD_DAMAGE * buffMult(a, 'damageDealt'), { borrowed: true });
    a.attackCd = ADD_ATTACK_CD;
  }
  return true;
}

export function apparitionViews(w: World): ApparitionView[] {
  const views: ApparitionView[] = [];
  for (const e of [...w.bosses, ...w.adds])
    if (e.perception)
      views.push({
        enemyId: e.id,
        ownerId: e.perception.ownerId,
        mode: e.perception.mode,
        pos: { ...e.perception.pos },
        remaining: e.perception.remaining,
        pending: !e.perception.active,
      });
  for (const b of w.bosses)
    if (b.action.illusionPos && ['windup', 'channel'].includes(b.action.kind))
      views.push({
        enemyId: b.id,
        ownerId: 0,
        mode: 'lure',
        pos: { ...b.action.illusionPos },
        remaining: b.action.remaining,
        pending: false,
      });
  return views;
}
