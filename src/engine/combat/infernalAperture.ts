import { placeAperture, type CoverCircle } from './aperturePlacement';
/** Fixed firing geometry. Conduits move existing shots, never clone or remotely cast them. */
import type { ExtSlot, Player, PlayerView, Projectile, Vec2 } from '../core/types';
import type { PlayerAbilityDef } from '../content/classes';
import type { World } from '../world/world';
import { abilityForSlot } from './abilities';
import { hasBuff } from './combat';
import { shadowRepriseView } from './shadowReprise';
import { hostileAdd } from './whispers';
import { nearestCopy, sub, wrapPos, dist } from '../core/torus';
import { PROJECTILE_MAX_RANGE, ARENA_W, ARENA_H } from '../core/constants';

export function resolvedAperture(ab: PlayerAbilityDef) {
  if (!ab.components) return ab.infernalAperture;
  const e = ab.components.effects.find((e) => e.kind === 'infernalAperture');
  return e?.kind === 'infernalAperture' ? e.aperture : undefined;
}
function active(w: World, p: Player): boolean {
  const a = p.infernalAperture;
  return (
    !!a &&
    w.scene === null &&
    p.state === 'alive' &&
    p.hp > 0 &&
    a.classId === p.classId &&
    a.remaining > 0 &&
    abilityForSlot(p, a.slot) === a.source &&
    !!resolvedAperture(a.source)
  );
}
export function openInfernalAperture(
  w: World,
  p: Player,
  ab: PlayerAbilityDef,
  slot: ExtSlot,
): void {
  const a = resolvedAperture(ab),
    source = abilityForSlot(p, slot);
  if (
    !a ||
    !source ||
    !ab.pilotCast ||
    slot === 'basic' ||
    w.scene !== null ||
    p.state !== 'alive' ||
    p.hp <= 0
  )
    return;
  const reach = Math.min(a.reach, Math.min(w.arena.w, w.arena.h) * 0.4);
  const mouths = w.players.flatMap((other) => {
    if (other === p || !active(w, other) || other.infernalAperture!.conduitReady === false)
      return [];
    const gate = other.infernalAperture!;
    return [
      { pos: gate.entry, radius: gate.radius },
      { pos: gate.exit, radius: gate.radius },
    ];
  });
  const placed = placeAperture(w, p, reach, a.radius, apertureBulwarks(w), mouths);
  if (!placed && active(w, p)) return; // a failed refresh never erases a usable lane
  p.infernalAperture = {
    conduitReady: !!placed,
    bulwark: placed?.bulwark,
    entry:
      placed?.entry ??
      wrapPos({ x: p.pos.x + (p.aim.x * reach) / 4, y: p.pos.y + (p.aim.y * reach) / 4 }),
    exit: placed?.exit ?? wrapPos({ x: p.pos.x + p.aim.x * reach, y: p.pos.y + p.aim.y * reach }),
    direction: { ...p.aim },
    remaining: Math.min(6, a.duration),
    radius: Math.min(24, a.radius),
    emberDamage: a.emberDamage,
    emberReady: true,
    createdTick: w.tick,
    slot,
    classId: p.classId,
    source,
    setupCast: ab.pilotCast,
  };
}
export function apertureBulwarks(w: World): CoverCircle[] {
  return w.players.flatMap((p) =>
    active(w, p) && p.infernalAperture?.bulwark
      ? [{ ...p.infernalAperture.bulwark, ownerId: p.id }]
      : [],
  );
}
export function dissolveBulwark(w: World, ownerId: number): void {
  const p = w.players.find((p) => p.id === ownerId);
  if (p?.infernalAperture) delete p.infernalAperture.bulwark;
}
/** Hostile landings/spawns fail open rather than teleporting bodies out of cover. */
export function dissolveOverlappedBulwarks(w: World): void {
  const enemies = [...w.aliveBosses(), ...w.adds.filter(hostileAdd)];
  for (const c of apertureBulwarks(w))
    if (enemies.some((e) => dist(e.pos, c.pos) < e.radius + c.radius - 1e-5))
      dissolveBulwark(w, c.ownerId);
}
function transitValid(w: World, p: Projectile): boolean {
  const tr = p.apertureTransit!;
  const owner = w.players.find((o) => o.id === p.ownerId);
  return (
    !!owner &&
    w.scene === null &&
    owner.state === 'alive' &&
    owner.hp > 0 &&
    owner.classId === tr.classId &&
    abilityForSlot(owner, tr.slot) === tr.source &&
    !!resolvedAperture(tr.source)
  );
}
export function tickInfernalApertures(w: World, dt: number): void {
  w.projectiles = w.projectiles.filter((p) => !p.apertureTransit || transitValid(w, p));
  for (const p of w.players) {
    if (!p.infernalAperture) continue;
    p.infernalAperture.remaining -= dt;
    if (!active(w, p)) delete p.infernalAperture;
  }
}
function blocked(p: Player): string | null {
  if (hasBuff(p, 'silence')) return 'Silenced';
  if (hasBuff(p, 'stun')) return 'Stunned';
  if (p.castTimer > 0) return 'Casting';
  if (p.glide || p.shove) return 'Moving';
  return null;
}
export function apertureView(w: World, p: Player): PlayerView['infernalAperture'] {
  if (!active(w, p)) return undefined;
  const a = p.infernalAperture!;
  return {
    conduitReady: a.conduitReady !== false,
    bulwark: a.bulwark && { pos: { ...a.bulwark.pos }, radius: a.bulwark.radius },
    entry: { ...a.entry },
    exit: { ...a.exit },
    direction: { ...a.direction },
    remaining: a.remaining,
    radius: a.radius,
    emberReady: a.emberReady,
    slot: a.slot,
    blocked: blocked(p),
  };
}
export function tryApertureEmber(w: World, p: Player, slot: ExtSlot, fresh: boolean): boolean {
  const a = p.infernalAperture;
  if (!a || a.slot !== slot || !active(w, p) || !a.emberReady) return false;
  // A retained return and aperture can share a Forge slot. Earned Return owns the press.
  const reprise = shadowRepriseView(w, p);
  if (reprise?.slot === slot && reprise.armed) return false;
  if (!fresh || w.tick <= a.createdTick || blocked(p)) return true;
  a.emberReady = false;
  const origin = wrapPos({
    x: p.pos.x + p.aim.x * (p.radius + 4),
    y: p.pos.y + p.aim.y * (p.radius + 4),
  });
  w.projectiles.push({
    id: w.allocId(),
    kind: 'fireball',
    pos: origin,
    vel: { x: p.aim.x * 660, y: p.aim.y * 660 },
    side: 'player',
    ownerId: p.id,
    damage: a.emberDamage,
    impactRadius: 0,
    hitRadius: 8,
    lifetime: 3,
    rangeLeft: PROJECTILE_MAX_RANGE,
    pilotCast: { spent: false },
    spreadOffset: 0,
  });
  w.events.push({ t: 'projectile', kind: 'fireball', pos: { ...origin } });
  return true;
}

/** First intersection parameter, including a body already touching the segment start. */
function singleCircleEntry(from: Vec2, to: Vec2, center: Vec2, radius: number): number | null {
  const c = center,
    dx = to.x - from.x,
    dy = to.y - from.y;
  const x = from.x - c.x,
    y = from.y - c.y,
    q = x * x + y * y - radius * radius;
  if (q <= 0) return 0;
  const aa = dx * dx + dy * dy;
  if (aa <= 1e-12) return null;
  const b = x * dx + y * dy,
    disc = b * b - aa * q;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / aa;
  return t >= 0 && t <= 1 ? t : null;
}
export function circleEntry(from: Vec2, to: Vec2, center: Vec2, radius: number): number | null {
  const c = nearestCopy(center, from);
  let earliest: number | null = null;
  // A capped shot can cross more than half a tile in a coarse frame. The nearest
  // image alone can then be behind it; consider the neighboring forward images.
  for (const dx of [-ARENA_W, 0, ARENA_W])
    for (const dy of [-ARENA_H, 0, ARENA_H]) {
      const t = singleCircleEntry(from, to, { x: c.x + dx, y: c.y + dy }, radius);
      if (t !== null && (earliest === null || t < earliest)) earliest = t;
    }
  return earliest;
}

function entryTime(
  p: Projectile,
  a: NonNullable<Player['infernalAperture']>,
  from: Vec2,
  to: Vec2,
): number | null {
  if (a.conduitReady === false || p.apertureUsed || p.pilotCast === a.setupCast) return null;
  const c = nearestCopy(a.entry, from),
    v = { x: to.x - from.x, y: to.y - from.y },
    u = a.direction;
  const forward = v.x * u.x + v.y * u.y;
  if (forward <= 0) return null;
  let earliest: number | null = null;
  for (const dx of [-ARENA_W, 0, ARENA_W])
    for (const dy of [-ARENA_H, 0, ARENA_H]) {
      const d = { x: from.x - c.x - dx, y: from.y - c.y - dy },
        start = d.x * u.x + d.y * u.y;
      if (start >= 0) continue;
      const t = -start / forward,
        across = (d.x + v.x * t) * -u.y + (d.y + v.y * t) * u.x;
      if (
        t <= 1 &&
        Math.abs(across) + p.hitRadius <= a.radius &&
        (earliest === null || t < earliest)
      )
        earliest = t;
    }
  return earliest;
}

/** null leaves the legacy path untouched; boolean says whether the swept shot survives. */
export function stepApertureProjectile(
  w: World,
  p: Projectile,
  dt: number,
  hit: (p: Projectile) => boolean,
): boolean | null {
  if (p.side !== 'player') return null;
  const owner = w.players.find((o) => o.id === p.ownerId);
  const a = owner && active(w, owner) ? owner.infernalAperture : undefined;
  // A shot in transit owns a frozen transaction; gate expiry cannot duplicate or strand it.
  if (!p.apertureTransit && !p.apertureUsed && !a) return null;
  if (w.scene !== null || (p.apertureTransit && !transitValid(w, p))) return false;
  if (dt <= 0) return null;
  let time = Math.max(0, Math.min(dt, p.lifetime));
  const speed = Math.hypot(p.vel.x, p.vel.y);
  if (speed <= 1e-6 || p.rangeLeft < -1e-9) return false;
  // Each pass consumes time, a gate event, or one distinct piercing recipient.
  const limit = w.bosses.length + w.adds.length + 5;
  for (let count = 0; count < limit; count++) {
    if (p.apertureTransit) {
      const tr = p.apertureTransit,
        spent = Math.min(time, tr.remaining);
      tr.remaining -= spent;
      p.lifetime -= spent;
      time -= spent;
      if (tr.remaining > 1e-9) return p.lifetime > 0;
      p.pos = { ...tr.exit };
      p.vel = { ...tr.velocity };
      delete p.apertureTransit;
      // Landing bodies/cover are tested even when transit ends at the tick boundary.
    }
    const distance = Math.max(0, Math.min(speed * time, p.rangeLeft));
    const from = { ...p.pos },
      to = { x: from.x + (p.vel.x / speed) * distance, y: from.y + (p.vel.y / speed) * distance };
    let event: 'none' | 'cover' | 'body' | 'gate' = 'none',
      at = 1;
    const gate = a && entryTime(p, a, from, to);
    if (gate != null) {
      at = gate;
      event = 'gate';
    }
    for (const o of [...w.obstacles, ...apertureBulwarks(w)]) {
      const t = circleEntry(from, to, o.pos, o.radius + p.hitRadius);
      if (t !== null && t <= at) {
        at = t;
        event = 'cover';
      }
    }
    for (const body of [...w.aliveBosses(), ...w.adds.filter(hostileAdd)]) {
      if (p.hitIds?.includes(body.id)) continue;
      const t = circleEntry(from, to, body.pos, body.radius + p.hitRadius);
      // Cover wins ties. Otherwise a physical body precedes a coincident gate.
      if (t !== null && (t < at || (t === at && event !== 'cover'))) {
        at = t;
        event = 'body';
      }
    }
    const moved = distance * at,
      spent = moved / speed;
    p.pos = wrapPos({ x: from.x + (to.x - from.x) * at, y: from.y + (to.y - from.y) * at });
    p.rangeLeft -= moved;
    p.lifetime -= spent;
    time -= spent;
    if (event === 'cover') return false;
    if (event === 'body') {
      // Nudge only toward contact, well below a world-space pixel, to avoid roundoff misses.
      p.pos = wrapPos({
        x: p.pos.x + (p.vel.x / speed) * 1e-7,
        y: p.pos.y + (p.vel.y / speed) * 1e-7,
      });
      if (hit(p)) return false;
      continue;
    }
    if (event === 'gate' && a) {
      const delta = sub(p.pos, a.entry),
        across = delta.x * -a.direction.y + delta.y * a.direction.x;
      const exit = wrapPos({
        x: a.exit.x - a.direction.y * across,
        y: a.exit.y + a.direction.x * across,
      });
      const gap = dist(p.pos, exit);
      p.apertureUsed = true;
      if (p.rangeLeft < gap - 1e-9 || p.lifetime < gap / speed - 1e-9) return false;
      p.rangeLeft = Math.max(0, p.rangeLeft - gap);
      const angle = Math.atan2(a.direction.y, a.direction.x) + (p.spreadOffset ?? 0);
      p.apertureTransit = {
        remaining: gap / speed,
        exit,
        velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
        classId: a.classId,
        slot: a.slot,
        source: a.source,
      };
      continue;
    }
    return p.rangeLeft > 0 && p.lifetime > 0;
  }
  return p.rangeLeft > 0 && p.lifetime > 0;
}
