/** Bounded passive hooks. All state is host-owned; no randomness or recursive hits. */
import type { Buff, Player } from '../core/types';
import type { PlayerAbilityDef } from '../content/classes';
import { getSubclassPassive } from '../content/subclassPassives';

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
function spendCooldown(p: Player, id: string): void {
  p.subclassPassiveCooldowns ??= {};
  p.subclassPassiveCooldowns[id] = 6;
}

export function onSubclassAbility(p: Player, ab: PlayerAbilityDef): void {
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
function personallyCursed(p: Player, target: Target): boolean {
  return target.buffs.some(
    (b) => b.kind === 'curse' && b.source === `curse:${p.id}` && b.remaining > 0,
  );
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
      return personallyCursed(p, target) &&
        target.buffs.some(
          (b) =>
            b.remaining > 0 &&
            (b.kind === 'root' ||
              b.kind === 'stun' ||
              (b.kind === 'moveSpeed' && b.mult < 1) ||
              (b.kind === 'castSlow' && b.mult > 1)),
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
    !personallyCursed(p, target) ||
    !offCooldown(p, id)
  )
    return 0;
  spendCooldown(p, id);
  putBuff(p, { kind: 'damageTaken', mult: 0.9, remaining: 3, source: PREFIX + id });
  return p.maxHp * 0.05;
}
