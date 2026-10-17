import { supportCue } from './visualCues';
import { armPaladinAura } from './paladinAuras';
import { grantAbsorption } from './absorption';
/** Authored support interactions travel with copied skills, not the active class. */
import type { Player } from '../core/types';
import type { PlayerAbilityDef } from '../content/classes';
import type { World } from '../world/world';
import { dist } from '../core/torus';
import { applyBuff, makeBuff, healPlayer } from './combat';
import { spawnZone } from './abilities';

export function nearbySupportAllies(world: World, p: Player, range: number): Player[] {
  return world.players.filter((a) => a.state === 'alive' && dist(p.pos, a.pos) <= range);
}

/** Both verses last eight seconds. A repeated verse refreshes, never adds stacks. */
export function beginSupportCast(world: World, p: Player, ab: PlayerAbilityDef): boolean {
  if (ab.kind === 'heal' || ab.kind === 'buffAlly' || ab.absorption)
    world.events.push({
      t: 'skillArea',
      sourceId: p.id,
      side: 'player',
      color: 0xaecde1,
      area: {
        kind: 'circle',
        reach: true,
        origin: { ...p.pos },
        angle: 0,
        range: 0,
        radius: ab.range ?? 400,
        halfAngle: 0,
      },
    });
  if (ab.paladinAura && ab.paladinAura.kind !== 'renewal') armPaladinAura(world, p, ab);
  if (ab.absorption) {
    const nearby = nearbySupportAllies(world, p, ab.range ?? 420);
    const targets =
      ab.absorption.target === 'nearby'
        ? nearby
        : nearby.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp).slice(0, 1);
    for (const ally of targets)
      if (grantAbsorption(ally, ab.absorption.amount, ab.absorption.duration) > 0)
        supportCue(world, p, ally, 'absorb');
  }
  if (ab.allyWard) {
    const ward = ab.allyWard;
    for (const ally of nearbySupportAllies(world, p, ward.range)) {
      // The caster already receives the skill's own stronger ward.
      if (ally !== p)
        applyBuff(ally, makeBuff('damageTaken', ward.mult, ward.duration, 'sharedWard'));
    }
  }
  if (ab.bardSong === 'discord') {
    applyBuff(p, makeBuff('discord', 0, 8, 'bardDiscord'));
  }
  if (ab.bardSong !== 'chorus') return false;
  const ready = (kind: 'harmony' | 'discord') =>
    p.buffs.some((b) => b.kind === kind && b.remaining > 0);
  if (!ready('harmony') || !ready('discord')) return false;
  p.buffs = p.buffs.filter((b) => b.kind !== 'harmony' && b.kind !== 'discord');
  for (const ally of nearbySupportAllies(world, p, ab.range ?? 420))
    applyBuff(ally, makeBuff('moveSpeed', 1.15, ab.buffDuration ?? 6, 'chorusMove'));
  return true;
}

/** Only dedicated, effective heals trigger rescue, harmony and recovery territory. */
export function healSupportAlly(
  world: World,
  p: Player,
  target: Player,
  amount: number,
  ab: PlayerAbilityDef,
): number {
  const rescue = !!ab.rescueHealBonus && target.hp <= target.maxHp * 0.35;
  const effective = healPlayer(world, p, target, amount * (rescue ? 1 + ab.rescueHealBonus! : 1));
  if (effective <= 0) return 0;
  supportCue(world, p, target, 'heal');
  if (ab.paladinAura?.kind === 'renewal') armPaladinAura(world, p, ab);
  if (ab.rescueHealBonus) {
    const ordinary = Math.min(effective * 0.25, target.maxHp * 0.15);
    const rescueBubble = rescue ? Math.min(effective * 0.75, target.maxHp * 0.3) : 0;
    grantAbsorption(target, ordinary + rescueBubble, 6, 'heal');
  }
  if (ab.bardSong === 'harmony') applyBuff(p, makeBuff('harmony', 0, 8, 'bardHarmony'));
  if (ab.recoveryZone) {
    // One grove per caster across base/subclass/copied heals; unrelated zones survive.
    world.groundZones = world.groundZones.filter((z) => !z.recovery || z.ownerId !== p.id);
    const grove = ab.recoveryZone;
    spawnZone(world, {
      kind: 'sanctuary',
      recovery: true,
      color: 0x6bbf59,
      pos: { ...target.pos },
      radius: grove.radius,
      duration: grove.duration,
      side: 'player',
      ownerId: p.id,
      damagePerTick: 0,
      healPerTick: grove.tickHeal,
    });
  }
  return effective;
}
