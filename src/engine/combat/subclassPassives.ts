import { cleanseMovement, grantFrontGuard } from './defense';
import { grantAbsorption } from './absorption';
import { isBurstControl } from '../core/control';
import { dist } from '../core/torus';
import { healPlayer, type EventSink } from './combat';
import type { World } from '../world/world';
import { personallyCursed } from '../core/curses';
/** Bounded passive hooks. All state is host-owned; no randomness or recursive hits. */
import type { Buff, Player } from '../core/types';
import type { PlayerAbilityDef } from '../content/classes';
import { getSubclassPassive } from '../content/subclassPassives';

const PREFIX = 'subclass:';
function putBuff(p: { buffs: Buff[] }, buff: Buff): void {
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
    ab.slot === 'basic' &&
    !(
      (ab.kind === 'blink' || ab.kind === 'dash') &&
      p.buffs.some((b) => b.kind === 'root' && b.remaining > 0)
    ) &&
    offCooldown(p, 'wild_spell_weave') &&
    !p.buffs.some((b) => b.kind === 'spellSurge' && b.remaining > 0)
  ) {
    const last = p.buffs.find((b) => b.kind === 'wildWeave' && b.remaining > 0);
    const count = (last?.mult ?? 0) + 1;
    if (count >= 3) {
      p.buffs = p.buffs.filter((b) => b.kind !== 'wildWeave');
      putBuff(p, {
        kind: 'spellSurge',
        mult: 1.2,
        remaining: 8,
        source: PREFIX + 'wild_spell_weave',
      });
      spendCooldown(p, 'wild_spell_weave', 8);
    } else
      putBuff(p, { kind: 'wildWeave', mult: count, remaining: 8, source: PREFIX + 'wildMemory' });
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
  direct?: boolean;
  prepared?: boolean;
  melee?: boolean;
}
/** Only connecting, positive hits call this; misses and invulnerability preserve readiness. */
export function subclassDamageMultiplier(p: Player, target: Target, hit?: PassiveHit): number {
  switch (p.subclassPassiveId) {
    case 'light_refulgence': {
      const ready =
        hit?.direct && p.buffs.find((b) => b.kind === 'radiantCharge' && b.remaining > 0);
      if (!ready) return 1;
      p.buffs.splice(p.buffs.indexOf(ready), 1);
      putBuff(target, { kind: 'castSlow', mult: 1.3, remaining: 3, source: 'lightRefulgence' });
      return 1.25;
    }
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
  melee?: boolean,
  counter?: boolean,
): void {
  const id = p.subclassPassiveId;
  if (!direct || effective <= 0 || p.state !== 'alive' || p.hp <= 0) return;
  if (id === 'hunter_quarry') {
    putBuff(target, { kind: 'damageTaken', mult: 1.1, remaining: 3, source: 'hunterQuarry' });
    return;
  }
  if (id === 'champion_reprise' && counter && offCooldown(p, id) && p.hp < p.maxHp) {
    healPlayer(sink, p, p, Math.min(20, p.maxHp * 0.08));
    spendCooldown(p, id);
    return;
  }
  if (
    id === 'battle_opening' &&
    target.buffs.some(isBurstControl) &&
    offCooldown(p, id) &&
    !p.buffs.some((b) => b.kind === 'counter' && b.remaining > 0)
  ) {
    putBuff(p, { kind: 'counter', mult: 1.3, remaining: 4, source: PREFIX + id });
    putBuff(target, { kind: 'castSlow', mult: 1.3, remaining: 3, source: 'battleOpening' });
    spendCooldown(p, id);
    return;
  }
  const aura = p.paladinAura;
  if (
    id === 'vengeance_procession' &&
    melee &&
    aura &&
    aura.remaining > 0 &&
    aura.classId === p.classId &&
    !aura.passiveExtended
  ) {
    aura.remaining = Math.min(aura.duration + 2, aura.remaining + 2);
    aura.passiveExtended = true;
    putBuff(target, { kind: 'moveSpeed', mult: 0.75, remaining: 2, source: 'vengeanceProcession' });
    return;
  }
  if (
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
  onSubclassProtection(p, effective);
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

/** Only an effective heal or a real direct shield gain may ready Light's follow-through. */
export function onSubclassProtection(p: Player, effective: number): void {
  const id = 'light_refulgence';
  if (
    p.subclassPassiveId !== id ||
    p.state !== 'alive' ||
    p.hp <= 0 ||
    effective <= 0 ||
    !offCooldown(p, id)
  )
    return;
  if (p.buffs.some((b) => b.kind === 'radiantCharge' && b.remaining > 0)) return;
  putBuff(p, { kind: 'radiantCharge', mult: 1.25, remaining: 6, source: PREFIX + id });
  spendCooldown(p, id);
}

export function onSubclassOverheal(world: World, p: Player, target: Player, unused: number): void {
  const id = 'life_abundance';
  if (
    p.subclassPassiveId !== id ||
    p.state !== 'alive' ||
    p.hp <= 0 ||
    unused <= 0 ||
    !offCooldown(p, id)
  )
    return;
  if (grantAbsorption(target, Math.min(25, unused * 0.5), 6, 'heal') <= 0) return;
  spendCooldown(p, id);
  world.events.push({
    t: 'support',
    sourceId: p.id,
    targetId: target.id,
    from: { ...p.pos },
    pos: { ...target.pos },
    kind: 'absorb',
  });
}

export function onSubclassAura(world: World, p: Player, radius: number): void {
  const id = 'devotion_anchor';
  if (p.subclassPassiveId !== id || !offCooldown(p, id)) return;
  for (const ally of world.players) {
    if (ally.state !== 'alive' || ally.hp <= 0 || dist(p.pos, ally.pos) > radius) continue;
    cleanseMovement(ally);
    ally.shove = null;
    putBuff(ally, { kind: 'steadfast', mult: 0, remaining: 2, source: PREFIX + id + ':' + p.id });
    world.events.push({
      t: 'support',
      sourceId: p.id,
      targetId: ally.id,
      from: { ...p.pos },
      pos: { ...ally.pos },
      kind: 'protect',
    });
  }
  spendCooldown(p, id, 8);
}

/** Fires once at resolution, on both native and composed paths. */
export function onSubclassFinisher(world: World, p: Player, ab: PlayerAbilityDef): void {
  if (p.state !== 'alive' || p.hp <= 0) return;
  const id = p.subclassPassiveId;
  if (ab.momentumUsed && id === 'berserker_rampage') {
    putBuff(p, {
      kind: 'rampage',
      mult: Math.min(3, ab.momentumUsed),
      remaining: 4,
      source: PREFIX + id,
    });
  }
  if (ab.momentumUsed && id === 'totem_shelter' && offCooldown(p, id)) {
    let gained = false;
    for (const ally of world.players) {
      if (ally.state !== 'alive' || ally.hp <= 0 || dist(p.pos, ally.pos) > 180) continue;
      if (grantAbsorption(ally, 8 + 4 * Math.min(3, ab.momentumUsed), 4) <= 0) continue;
      gained = true;
      world.events.push({
        t: 'support',
        sourceId: p.id,
        targetId: ally.id,
        from: { ...p.pos },
        pos: { ...ally.pos },
        kind: 'absorb',
      });
    }
    if (gained) spendCooldown(p, id);
  }
  if (!ab.flowUsed) return;
  if (id === 'openhand_flowguard') grantFrontGuard(p, 1, 3);
  if (id === 'shadow_rhythm' && offCooldown(p, id)) {
    let reduced = false;
    for (const slot of ['a1', 'a2', 'a3', 'sub1', 'sub2'] as const) {
      const skill =
        slot === 'sub1' || slot === 'sub2' ? p.subAbilities?.[slot] : p.abilities?.[slot];
      if (!skill || (skill.kind !== 'dash' && skill.kind !== 'blink')) continue;
      const remaining = p.cooldowns[slot] ?? 0;
      if (remaining <= 0) continue;
      p.cooldowns[slot] = Math.max(0, remaining - 2);
      reduced = true;
    }
    if (reduced) {
      spendCooldown(p, id, 4);
      world.events.push({
        t: 'support',
        sourceId: p.id,
        targetId: p.id,
        from: { ...p.pos },
        pos: { ...p.pos },
        kind: 'empower',
      });
    }
  }
}
