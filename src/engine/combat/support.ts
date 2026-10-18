import {
  onSubclassFinisher,
  onSubclassChorus,
  onSubclassHeal,
  onSubclassProtection,
  onSubclassOverheal,
} from './subclassPassives';
import { cleanseMovement, grantFrontGuard } from './defense';
import { armMartialUtility } from './martial';
import { personallyCursed } from '../core/curses';
import { supportCue, buffCues } from './visualCues';
import { armPaladinAura } from './paladinAuras';
import { grantAbsorption } from './absorption';
/** Authored support interactions travel with copied skills, not the active class. */
import type { Player } from '../core/types';
import type { PlayerAbilityDef } from '../content/classes';
import type { World } from '../world/world';
import { dist } from '../core/torus';
import { applyBuff, makeBuff, healPlayer, damageBoss, damageAdd } from './combat';
import { spawnZone } from './abilities';

export function nearbySupportAllies(world: World, p: Player, range: number): Player[] {
  return world.players.filter((a) => a.state === 'alive' && dist(p.pos, a.pos) <= range);
}

/** Both verses last eight seconds. A repeated verse refreshes, never adds stacks. */
export function beginSupportCast(world: World, p: Player, ab: PlayerAbilityDef): boolean {
  onSubclassFinisher(world, p, ab);
  if (ab.mirrorImages)
    applyBuff(
      p,
      makeBuff('mirrorImages', ab.mirrorImages.count, ab.mirrorImages.duration, 'mirrorImages'),
    );
  if ((ab.kind === 'selfBuff' || ab.kind === 'groundZone') && ab.prepareCrit)
    applyBuff(p, makeBuff('precision', 1, ab.prepareCrit, 'preparedCrit'));
  if (ab.frontGuard) grantFrontGuard(p, ab.frontGuard.charges, ab.frontGuard.duration);
  if (ab.steadfastDuration) {
    p.buffs = p.buffs.filter((b) => b.kind !== 'root');
    p.shove = null;
    applyBuff(p, makeBuff('steadfast', 0, ab.steadfastDuration, 'steadfast'));
  }
  if (ab.kind !== 'selfBuff' && ab.guardWindow) armMartialUtility(p, ab);
  if (ab.kind === 'selfBuff') {
    if (ab.iframes) applyBuff(p, makeBuff('invuln', 0, ab.iframes, 'divineGuard'));
    if (ab.cleanseOnHeal) cleanseMovement(p);
    if (!ab.components && ab.healOnUse && healPlayer(world, p, p, ab.healOnUse) > 0)
      supportCue(world, p, p, 'heal');
  }
  if (
    ab.kind === 'heal' ||
    ab.kind === 'buffAlly' ||
    (ab.absorption && ab.absorption.target !== 'self')
  )
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
      ab.absorption.target === 'self'
        ? [p]
        : ab.absorption.target === 'nearby'
          ? nearby
          : nearby.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp).slice(0, 1);
    const siphon = ab.absorption.target === 'self' ? ab.absorption.curseSiphon : undefined;
    const candidates =
      siphon && p.state === 'alive' && p.hp > 0
        ? [...world.aliveBosses(), ...world.adds]
            .filter(
              (e) => e.hp > 0 && dist(p.pos, e.pos) <= siphon.range && personallyCursed(p.id, e),
            )
            .slice(0, siphon.maxTargets)
        : [];
    const marked = candidates.filter((enemy) => {
      const before = enemy.hp;
      if ('monsterId' in enemy) damageBoss(world, p, enemy, siphon!.amount);
      else damageAdd(world, p, enemy, siphon!.amount);
      return enemy.hp < before;
    });
    const amount = ab.absorption.amount + (siphon ? marked.length * siphon.amount : 0);
    for (const ally of targets) {
      const gained = grantAbsorption(ally, amount, ab.absorption.duration);
      if (gained <= 0) continue;
      onSubclassProtection(p, gained);
      supportCue(world, p, ally, 'absorb');
      // Cosmetic incoming links identify the marks supplying the barrier, without
      // consuming the curse. Bound to the same target cap.
      for (const enemy of marked)
        world.events.push({
          t: 'support',
          sourceId: enemy.id,
          targetId: p.id,
          from: { ...enemy.pos },
          pos: { ...p.pos },
          kind: 'absorb',
        });
    }
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
  onSubclassChorus(world, p, ab.range ?? 420);
  for (const ally of nearbySupportAllies(world, p, ab.range ?? 420)) {
    if (ab.cleanseOnHeal) cleanseMovement(ally);
    applyBuff(ally, makeBuff('moveSpeed', 1.15, ab.buffDuration ?? 6, 'chorusMove'));
  }
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
  if (ab.cleanseOnHeal) cleanseMovement(target);
  const rescue = !!ab.rescueHealBonus && target.hp <= target.maxHp * 0.35;
  const requested = amount * (rescue ? 1 + ab.rescueHealBonus! : 1);
  const effective = healPlayer(world, p, target, requested);
  onSubclassOverheal(world, p, target, Math.max(0, requested - effective));
  if (effective <= 0) return 0;
  supportCue(world, p, target, 'heal');
  if (ab.kind === 'heal') {
    const boons = ab.components
      ? ab.components.effects.filter((e) => e.kind === 'buff' && e.target === 'allies')
      : [
          {
            kind: 'buff' as const,
            defMult: ab.buffDefMult,
            dmgMult: ab.buffDamageMult,
            moveMult: ab.buffMoveMult,
            duration: ab.buffDuration ?? 4,
          },
        ];
    for (const b of boons) {
      if (b.kind !== 'buff') continue;
      if (b.defMult != null)
        applyBuff(target, makeBuff('damageTaken', b.defMult, b.duration, 'healBoonDef'));
      if (b.dmgMult != null)
        applyBuff(target, makeBuff('damageDealt', b.dmgMult, b.duration, 'healBoonDmg'));
      if (b.moveMult != null)
        applyBuff(target, makeBuff('moveSpeed', b.moveMult, b.duration, 'healBoonMove'));
      buffCues(world, p, target, {
        buffDefMult: b.defMult,
        buffDamageMult: b.dmgMult,
        buffMoveMult: b.moveMult,
      });
    }
  }
  if (ab.paladinAura?.kind === 'renewal') armPaladinAura(world, p, ab);
  if (ab.rescueHealBonus) {
    const ordinary = Math.min(effective * 0.25, target.maxHp * 0.15);
    const rescueBubble = rescue ? Math.min(effective * 0.75, target.maxHp * 0.3) : 0;
    grantAbsorption(target, ordinary + rescueBubble, 6, 'heal');
  }
  onSubclassHeal(world, p, target, effective);
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
