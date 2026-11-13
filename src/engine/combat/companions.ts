import type { PlayerAbilityDef } from '../content/classes';
import { abilityForSlot } from './abilities';
/** A commanded spirit, not a party bot: one host-owned wolf and one pending bite per owner. */
import type {
  Add,
  Boss,
  Player,
  SpiritCompanion,
  Vec2,
  CompanionCommandCast,
  ExtSlot,
  CompanionHunt,
  CompanionBody,
  InputCommand,
} from '../core/types';
import type { World } from '../world/world';
import { dist, sub, wrapPos } from '../core/torus';
import { isBurstControl } from '../core/control';
import { damageBoss, damageAdd } from './combat';
import { grantAbsorption } from './absorption';

export const PACK_BOND = 'beast_pack_bond';
export const COMPANION_RANGE = 600;
const WARD_SOURCE = 'subclass:packBond';
const active = (p: Player) => p.subclassPassiveId === PACK_BOND && p.state === 'alive' && p.hp > 0;
function home(p: Player): Vec2 {
  return wrapPos({
    x: p.pos.x - p.aim.x * 36 - p.aim.y * 26,
    y: p.pos.y - p.aim.y * 36 + p.aim.x * 26,
  });
}
function flankerHome(p: Player, i: number): Vec2 {
  const side = i === 0 ? -50 : 50;
  return wrapPos({
    x: p.pos.x - p.aim.x * 70 - p.aim.y * side,
    y: p.pos.y - p.aim.y * 70 + p.aim.x * side,
  });
}
function ensure(p: Player): SpiritCompanion {
  const pet = (p.spiritCompanion ??= { pos: home(p), facing: Math.atan2(p.aim.y, p.aim.x) });
  if (packTactics(p))
    pet.flankers ??= [0, 1].map((i) => ({ pos: flankerHome(p, i), facing: pet.facing }));
  else delete pet.flankers;
  return pet;
}

export const COMPANION_HUNT_TIME = 6;
export function packTactics(p: Player): boolean {
  return active(p) && !!p.charUpgradeIds?.includes('rg_beastmaster_g_b');
}
export function reserveCompanionCommand(
  p: Player,
  source: PlayerAbilityDef,
  slot: ExtSlot,
  fresh: boolean,
): CompanionCommandCast | undefined {
  if (!packTactics(p)) return undefined;
  const pending = p.companionPresses?.[slot];
  if (pending) {
    delete p.companionPresses![slot];
    return validCommand(p, pending) ? pending : undefined;
  }
  if (!fresh) return undefined;
  return {
    ownerId: p.id,
    ownerClass: p.classId,
    epoch: p.companionEpoch ?? 0,
    source,
    slot,
    spent: false,
  };
}
/** Preserve a held press through ordinary cast gates, but hand it to only one accepted cast. */
export function prepareCompanionInputs(
  w: World,
  p: Player,
  buttons: InputCommand['buttons'],
): void {
  if (!packTactics(p) || w.scene !== null || w.finished) {
    delete p.companionPresses;
    return;
  }
  for (const slot of ['basic', 'a1', 'a2', 'a3', 'sub1', 'sub2'] as const) {
    if (!buttons[slot]) {
      if (p.companionPresses) delete p.companionPresses[slot];
      continue;
    }
    if (p.prevButtons[slot]) continue;
    if (p.companionPresses) delete p.companionPresses[slot];
    const source = abilityForSlot(p, slot);
    if (source) {
      // Active Pack Tactics + an existing source + a fresh press always creates a token.
      (p.companionPresses ??= {})[slot] = reserveCompanionCommand(p, source, slot, true)!;
    }
  }
}
function validCommand(p: Player, c: CompanionCommandCast): boolean {
  return (
    packTactics(p) &&
    c.ownerId === p.id &&
    c.ownerClass === p.classId &&
    c.epoch === (p.companionEpoch ?? 0) &&
    abilityForSlot(p, c.slot) === c.source
  );
}
function huntTarget(w: World, p: Player, h: CompanionHunt): Boss | Add | undefined {
  if (w.finished || w.scene !== null || !validCommand(p, h.cast) || h.remaining <= 0)
    return undefined;
  const target =
    h.kind === 'boss'
      ? w.bosses.find((b) => b.id === h.targetId)
      : w.adds.find((a) => a.id === h.targetId);
  return target && target.hp > 0 && !('charm' in target && target.charm) ? target : undefined;
}
export function companionHuntView(w: World, p: Player) {
  const h = p.spiritCompanion?.hunt;
  if (!h) return undefined;
  const t = huntTarget(w, p, h);
  return t
    ? {
        targetId: t.id,
        pos: { ...t.pos },
        radius: t.radius,
        remaining: h.remaining,
        duration: COMPANION_HUNT_TIME,
      }
    : undefined;
}
function scheduleBite(
  p: Player,
  pet: SpiritCompanion,
  target: Boss | Add,
  kind: 'boss' | 'add',
): void {
  pet.order = {
    targetId: target.id,
    kind,
    windup: p.charUpgradeIds?.includes('rg_beastmaster_g_a') ? 0.15 : 0.3,
    remaining: 0.9,
  };
  if (packTactics(p) && pet.hunt) {
    pet.flankers!.forEach((wolf, i) => {
      wolf.order = { targetId: target.id, kind, windup: 0.45 + i * 0.15, remaining: 1.1 };
    });
  }
  p.subclassPassiveCooldowns ??= {};
  p.subclassPassiveCooldowns[PACK_BOND] = 2.5;
}

/** Only actual positive direct hits can issue orders. Multi-hit attacks share one gate. */
export function commandCompanion(
  p: Player,
  target: Boss | Add,
  kind: 'boss' | 'add',
  effective: number,
  direct?: boolean,
  command?: CompanionCommandCast,
): void {
  if (
    !active(p) ||
    !direct ||
    effective <= 0 ||
    target.hp <= 0 ||
    ('charm' in target && !!target.charm) ||
    dist(p.pos, target.pos) > COMPANION_RANGE
  )
    return;
  if (!packTactics(p) && (p.subclassPassiveCooldowns?.[PACK_BOND] ?? 0) > 0) return;
  const pet = ensure(p);
  if (packTactics(p)) {
    if (!command || command.spent || !validCommand(p, command)) return;
    command.spent = true;
    if (pet.hunt?.targetId !== target.id) {
      delete pet.order;
      for (const wolf of pet.flankers ?? []) delete wolf.order;
    }
    pet.hunt = { targetId: target.id, kind, remaining: COMPANION_HUNT_TIME, cast: command };
    return;
  }
  scheduleBite(p, pet, target, kind);
}

/** Nature's Bond (or a copied dedicated heal) links its actually healed recipient. */
export function prepareCompanionWard(p: Player, target: Player, effective: number): void {
  if (!active(p) || effective <= 0 || target.state !== 'alive' || target.hp <= 0) return;
  ensure(p).wardTargetId = target.id;
  p.buffs = p.buffs.filter((b) => b.source !== WARD_SOURCE);
  p.buffs.push({ kind: 'packBond', mult: 1, remaining: 6, source: WARD_SOURCE });
}
function move(pet: CompanionBody, to: Vec2, distance: number): void {
  const d = sub(to, pet.pos);
  const length = Math.hypot(d.x, d.y);
  if (length < 0.001) return;
  pet.facing = Math.atan2(d.y, d.x);
  const f = Math.min(1, distance / length);
  pet.pos = wrapPos({ x: pet.pos.x + d.x * f, y: pet.pos.y + d.y * f });
}
function protect(world: World, p: Player, pet: SpiritCompanion): void {
  if (pet.wardTargetId == null) return;
  const ally = world.players.find((a) => a.id === pet.wardTargetId);
  if (!ally || ally.state !== 'alive' || ally.hp <= 0 || dist(p.pos, ally.pos) > 420) return;
  if (grantAbsorption(ally, Math.max(12, ally.maxHp * 0.08), 4) <= 0) return;
  p.buffs = p.buffs.filter((b) => b.source !== WARD_SOURCE);
  delete pet.wardTargetId;
  world.events.push({
    t: 'support',
    sourceId: p.id,
    targetId: ally.id,
    from: { ...pet.pos },
    pos: { ...ally.pos },
    kind: 'absorb',
  });
}

/** Two formation followers share the quarry and wave gate, never direct-hit or ward hooks. */
function tickFlankers(
  world: World,
  p: Player,
  pet: SpiritCompanion,
  quarry: Boss | Add | undefined,
  dt: number,
): void {
  if (!quarry) {
    for (const [i, wolf] of (pet.flankers ?? []).entries()) {
      delete wolf.order;
      move(wolf, flankerHome(p, i), Math.max(420, p.moveSpeed * 1.5) * dt);
    }
    return;
  }
  const toward = sub(p.pos, quarry.pos),
    angle = Math.atan2(toward.y, toward.x);
  for (const [i, wolf] of (pet.flankers ?? []).entries()) {
    const side = angle + ((i === 0 ? 1 : -1) * Math.PI * 2) / 3;
    const station = wrapPos({
      x: quarry.pos.x + Math.cos(side) * (quarry.radius + 12),
      y: quarry.pos.y + Math.sin(side) * (quarry.radius + 12),
    });
    move(wolf, station, wolf.order ? 1800 * dt : 600 * dt);
    // Face inward once stationed, so both silhouettes visibly flank their quarry.
    if (dist(wolf.pos, station) < 1) {
      const aim = sub(quarry.pos, wolf.pos);
      wolf.facing = Math.atan2(aim.y, aim.x);
    }
    const order = wolf.order;
    if (!order) continue;
    order.remaining -= dt;
    order.windup -= dt;
    if (order.targetId !== quarry.id || order.remaining <= 0) {
      delete wolf.order;
      continue;
    }
    if (order.windup > 0 || dist(wolf.pos, quarry.pos) > quarry.radius + 18) continue;
    delete wolf.order;
    const amount = 4 * (quarry.buffs.some(isBurstControl) ? 1.25 : 1);
    if (pet.hunt?.kind === 'boss') damageBoss(world, p, quarry as Boss, amount);
    else damageAdd(world, p, quarry as Add, amount);
  }
}

/** No target scanning, collision, independent aggro, damage zones, crits or recursive orders. */
export function updateCompanions(world: World, dt: number): void {
  for (const p of world.players) {
    if (!active(p) || world.scene !== null || world.finished) {
      p.companionEpoch = (p.companionEpoch ?? 0) + 1;
      delete p.spiritCompanion;
      delete p.companionPresses;
      p.buffs = p.buffs.filter((b) => b.source !== WARD_SOURCE);
      continue;
    }
    const pet = ensure(p);
    if (!p.buffs.some((b) => b.kind === 'packBond' && b.remaining > 0)) delete pet.wardTargetId;
    let quarry: Boss | Add | undefined;
    if (pet.hunt) {
      pet.hunt.remaining -= dt;
      quarry = huntTarget(world, p, pet.hunt);
      if (!quarry) {
        delete pet.hunt;
        delete pet.order;
      } else if (!pet.order && (p.subclassPassiveCooldowns?.[PACK_BOND] ?? 0) <= 0)
        scheduleBite(p, pet, quarry, pet.hunt.kind);
    }
    const order = pet.order;
    if (order) {
      const target =
        order.kind === 'boss'
          ? world.bosses.find((b) => b.id === order.targetId)
          : world.adds.find((a) => a.id === order.targetId);
      order.remaining -= dt;
      order.windup = Math.max(0, order.windup - dt);
      if (
        !target ||
        target.hp <= 0 ||
        ('charm' in target && !!target.charm) ||
        order.remaining <= 0 ||
        (!pet.hunt && dist(p.pos, target.pos) > COMPANION_RANGE)
      )
        delete pet.order;
      else {
        // Spirits can cross cover and reach flyers, but never shove or tank attacks.
        move(pet, target.pos, 1800 * dt);
        if (order.windup <= 0 && dist(pet.pos, target.pos) <= target.radius + 18) {
          delete pet.order; // clear before damage callbacks; this strike cannot command itself
          const controlBonus = p.charUpgradeIds?.includes('rg_beastmaster_g_a') ? 1.5 : 1.25;
          const base = 16 * (target.buffs.some(isBurstControl) ? controlBonus : 1);
          const before = target.hp;
          if (order.kind === 'boss') damageBoss(world, p, target as Boss, base);
          else damageAdd(world, p, target as Add, base);
          if (target.hp < before) protect(world, p, pet);
        }
      }
    }
    tickFlankers(world, p, pet, quarry, dt);
    if (!pet.order) {
      if (quarry) {
        const d = sub(p.pos, quarry.pos),
          length = Math.hypot(d.x, d.y) || 1;
        move(
          pet,
          wrapPos({
            x: quarry.pos.x + (d.x / length) * (quarry.radius + 32),
            y: quarry.pos.y + (d.y / length) * (quarry.radius + 32),
          }),
          600 * dt,
        );
        continue;
      }
      const rest = home(p);
      if (!packTactics(p) && dist(pet.pos, rest) > COMPANION_RANGE) pet.pos = rest;
      else move(pet, rest, Math.max(420, p.moveSpeed * 1.5) * dt);
    }
  }
}
