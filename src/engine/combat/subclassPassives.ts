import { grantAbsorption } from './absorption';
import { isBurstControl } from '../core/control';
import { dist } from '../core/torus';
import { healPlayer, type EventSink } from './combat';
import type { World } from '../world/world';
import { personallyCursed } from '../core/curses';
/** Bounded passive hooks. All state is host-owned; no randomness or recursive hits. */
import type { Buff, Player } from '../core/types';
import type { PlayerAbilityDef } from '../content/classes';
import { getSubclassPassive, WEAVE_DELIVERIES } from '../content/subclassPassives';

const PREFIX = 'subclass:';
function putBuff(p: Player, buff: Buff): void {
  const old = p.buffs.findIndex((b) => b.source === buff.source);
  if (old >= 0) p.buffs[old] = buff;
  else p.buffs.push(buff);
}

/** Active effects expire on a class change; proc cooldowns are never reset by swaps. */
export function setSubclassPassive(p: Player, id: string | undefined): void {
  if (p.subclassPassiveId === id) return;
  p.buffs = p.buffs.filter((b) => !b.source.startsWith(PREFIX));
  p.subclassPassiveId = id;
}

export function tickSubclassPassives(p: Player, dt: number): void {
  if (!p.subclassPassiveCooldowns) return;
  for (const id of Object.keys(p.subclassPassiveCooldowns))
    p.subclassPassiveCooldowns[id] = Math.max(0, p.subclassPassiveCooldowns[id] - dt);
}

function offCooldown(p: Player, id: string): boolean {
  return (p.subclassPassiveCooldowns?.[id] ?? 0) <= 0;
}
function spendCooldown(p: Player, id: string, seconds = 6): void {
  p.subclassPassiveCooldowns ??= {};
  p.subclassPassiveCooldowns[id] = seconds;
}

export function onSubclassAbility(p: Player, ab: PlayerAbilityDef): void {
  if (
    p.subclassPassiveId === 'wild_spell_weave' &&
    ab.slot !== 'basic' &&
    !(
      (ab.kind === 'blink' || ab.kind === 'dash') &&
      p.buffs.some((b) => b.kind === 'root' && b.remaining > 0)
    )
  ) {
    const last = p.buffs.find((b) => b.kind === 'wildWeave' && b.remaining > 0);
    const delivery = WEAVE_DELIVERIES.indexOf(ab.kind);
    if (
      last &&
      last.mult !== delivery &&
      offCooldown(p, 'wild_spell_weave') &&
      !ab.prepareSurge &&
      !p.buffs.some((b) => b.kind === 'spellSurge' && b.remaining > 0)
    ) {
      spendCooldown(p, 'wild_spell_weave', 8);
      putBuff(p, {
        kind: 'spellSurge',
        mult: 1.2,
        remaining: 8,
        source: PREFIX + 'wild_spell_weave',
      });
    }
    putBuff(p, { kind: 'wildWeave', mult: delivery, remaining: 8, source: PREFIX + 'wildMemory' });
  }

  const passive = getSubclassPassive(p.subclassPassiveId);
  if (
    passive?.id !== 'trickster_spellblade' ||
    ab.slot === 'basic' ||
    ab.kind === 'meleeCone' ||
    ((ab.kind === 'blink' || ab.kind === 'dash') && p.buffs.some((b) => b.kind === 'root')) ||
    !offCooldown(p, passive.id)
  )
    return;
  spendCooldown(p, passive.id);
  putBuff(p, { kind: 'spellblade', mult: 1.2, remaining: 5, source: PREFIX + passive.id });
}

export function preparedSubclassCritBonus(p: Player): number {
  return p.subclassPassiveId === 'assassin_opening' ? 0.2 : 0;
}

interface Target {
  hp: number;
  maxHp: number;
  buffs: Buff[];
}
interface PassiveHit {
  prepared?: boolean;
  melee?: boolean;
}
/** Only connecting, positive hits call this; misses and invulnerability preserve readiness. */
export function subclassDamageMultiplier(p: Player, target: Target, hit?: PassiveHit): number {
  switch (p.subclassPassiveId) {
    case 'assassin_opening':
      return hit?.prepared && target.hp <= target.maxHp * 0.35 ? 1.15 : 1;
    case 'trickster_spellblade': {
      const ready = hit?.melee && p.buffs.find((b) => b.kind === 'spellblade' && b.remaining > 0);
      if (!ready) return 1;
      p.buffs.splice(p.buffs.indexOf(ready), 1);
      return ready.mult;
    }
    case 'old_one_dread_insight':
      return personallyCursed(p.id, target) &&
        target.buffs.some(
          (b) =>
            b.remaining > 0 &&
            (b.kind === 'root' ||
              b.kind === 'stun' ||
              (b.kind === 'moveSpeed' && b.mult < 1) ||
              (b.kind === 'castSlow' && b.mult > 1) ||
              (b.kind === 'damageDealt' && b.mult < 1)),
        )
        ? 1.08
        : 1;
    default:
      return 1;
  }
}

/** Returns attributed healing to apply through combat.healPlayer, after effective damage. */
export function subclassHitHealing(p: Player, target: Target, effective: number): number {
  const id = p.subclassPassiveId;
  if (
    id !== 'fiend_soul_ember' ||
    effective <= 0 ||
    p.state !== 'alive' ||
    p.hp <= 0 ||
    p.hp >= p.maxHp ||
    !personallyCursed(p.id, target) ||
    !offCooldown(p, id)
  )
    return 0;
  spendCooldown(p, id);
  putBuff(p, { kind: 'damageTaken', mult: 0.9, remaining: 3, source: PREFIX + id });
  return p.maxHp * 0.05;
}

/** Positive direct hits only: neither zone ticks nor invulnerable hits spend a gate. */
export function onSubclassDirectHit(
  sink: EventSink,
  p: Player,
  target: Target,
  effective: number,
  direct?: boolean,
): void {
  const id = p.subclassPassiveId;
  if (
    !direct ||
    effective <= 0 ||
    p.state !== 'alive' ||
    p.hp <= 0 ||
    (id !== 'evoker_arcane_cadence' && id !== 'abjurer_binding_ward') ||
    !target.buffs.some(isBurstControl) ||
    !offCooldown(p, id)
  )
    return;
  if (id === 'evoker_arcane_cadence') {
    let reduced = false;
    for (const slot of ['a1', 'a2', 'a3', 'sub1', 'sub2'] as const) {
      const remaining = p.cooldowns[slot];
      if (remaining == null || remaining <= 0) continue;
      p.cooldowns[slot] = Math.max(0, remaining - 1);
      reduced = true;
    }
    if (!reduced) return;
  } else {
    if (grantAbsorption(p, 20, 5) <= 0) return;
  }
  spendCooldown(p, id);
  sink.events.push({
    t: 'support',
    sourceId: p.id,
    targetId: p.id,
    from: { ...p.pos },
    pos: { ...p.pos },
    kind: id === 'abjurer_binding_ward' ? 'absorb' : 'empower',
  });
}

export function onSubclassSurge(p: Player): void {
  const id = 'draconic_surge_ascent';
  if (p.subclassPassiveId !== id || !offCooldown(p, id)) return;
  const flight = p.buffs
    .filter((b) => b.kind === 'flight' && b.remaining > 0)
    .sort((a, b) => b.remaining - a.remaining)[0];
  if (flight) flight.remaining = Math.max(flight.remaining, Math.min(9, flight.remaining + 1));
  else putBuff(p, { kind: 'flight', mult: 0, remaining: 2, source: PREFIX + id });
  spendCooldown(p, id);
}

/** Called only after a real two-verse chorus, never ordinary Inspiration spam. */
export function onSubclassChorus(world: World, p: Player, range: number): void {
  const id = p.subclassPassiveId;
  if ((id !== 'valor_rallying_chorus' && id !== 'whispers_echoed_refrain') || !offCooldown(p, id))
    return;
  spendCooldown(p, id, 8);
  if (id === 'whispers_echoed_refrain') {
    putBuff(p, { kind: 'refrainEcho', mult: 0.5, remaining: 8, source: PREFIX + id });
    return;
  }
  for (const ally of world.players) {
    if (ally.state !== 'alive' || ally.hp <= 0 || dist(p.pos, ally.pos) > range) continue;
    if (ally.buffs.some((b) => b.kind === 'frontGuard' && b.remaining > 0 && b.mult > 0)) continue;
    putBuff(ally, { kind: 'frontGuard', mult: 1, remaining: 3, source: PREFIX + id + ':' + p.id });
    world.events.push({
      t: 'support',
      sourceId: p.id,
      targetId: ally.id,
      from: { ...p.pos },
      pos: { ...ally.pos },
      kind: 'protect',
    });
  }
}

export function onSubclassHeal(
  world: World,
  p: Player,
  recipient: Player,
  effective: number,
): void {
  if (p.subclassPassiveId !== 'whispers_echoed_refrain' || effective <= 0) return;
  const ready = p.buffs.find((b) => b.kind === 'refrainEcho' && b.remaining > 0);
  if (!ready) return;
  const other = world.players
    .filter(
      (a) =>
        a !== recipient &&
        a.state === 'alive' &&
        a.hp > 0 &&
        a.hp < a.maxHp &&
        dist(p.pos, a.pos) <= 420,
    )
    .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.id - b.id)[0];
  const target = other ?? recipient;
  if (target.hp >= target.maxHp) return;
  p.buffs.splice(p.buffs.indexOf(ready), 1);
  if (healPlayer(world, p, target, Math.min(35, effective * ready.mult)) > 0)
    world.events.push({
      t: 'support',
      sourceId: p.id,
      targetId: target.id,
      from: { ...p.pos },
      pos: { ...target.pos },
      kind: 'heal',
    });
}
