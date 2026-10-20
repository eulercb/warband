/** Shared, bounded active-skill payloads. Copied skills do not require donor passives. */
import type { World } from '../world/world';
import type { Player, Boss, Add } from '../core/types';
import type { PlayerAbilityDef } from '../content/classes';
import { dist } from '../core/torus';
import { applyBuff, damageBoss, damageAdd, makeBuff } from './combat';
import { spawnZone } from './abilities';

export function armRetouchEffects(world: World, p: Player, ab: PlayerAbilityDef): void {
  if (p.state !== 'alive' || p.hp <= 0 || world.scene !== null) return;
  if (ab.warCry) {
    applyBuff(
      p,
      makeBuff('challengeReady', 1.3, ab.warCry.duration, `challengeReady:${p.classId}`),
    );
    for (const foe of [...world.aliveBosses(), ...world.adds.filter((a) => a.hp > 0)]) {
      if (dist(p.pos, foe.pos) <= ab.warCry.radius + foe.radius)
        applyBuff(foe, makeBuff('damageDealt', 0.8, ab.warCry.duration, 'weakness:challenge'));
    }
    world.events.push({
      t: 'skillArea',
      sourceId: p.id,
      side: 'player',
      color: 0xd4b16b,
      area: {
        kind: 'circle',
        origin: { ...p.pos },
        radius: ab.warCry.radius,
        range: 0,
        angle: 0,
        halfAngle: 0,
      },
    });
  }
  if (ab.venomCoating) {
    const buff = makeBuff(
      'venomReady',
      ab.venomCoating.damage,
      ab.venomCoating.window,
      `venomReady:${p.classId}`,
    );
    buff.coating = { damage: ab.venomCoating.damage, duration: ab.venomCoating.duration };
    applyBuff(p, buff);
  }
  if (ab.momentumFissure && ab.momentumUsed)
    spawnZone(world, {
      kind: 'entangle',
      color: 0xbc774e,
      pos: { ...p.pos },
      ownerId: p.id,
      side: 'player',
      radius: ab.radius ?? 150,
      duration: 3,
      damagePerTick: ab.momentumFissure * ab.momentumUsed,
      healPerTick: 0,
      slowMult: 0.65,
      slowDuration: 0.8,
    });
}

export function applyCoating(
  world: World,
  p: Player,
  target: Boss | Add,
  prepared?: boolean,
): void {
  if (p.state !== 'alive' || p.hp <= 0 || target.hp <= 0 || world.scene !== null) return;
  const coat = p.buffs.find(
    (b) =>
      b.kind === 'venomReady' &&
      b.remaining > 0 &&
      b.coating &&
      b.source === `venomReady:${p.classId}`,
  );
  if (
    !coat?.coating ||
    (!prepared && p.buffs.some((b) => b.kind === 'precision' && b.remaining > 0))
  )
    return;
  const amount = coat.coating.damage * (prepared ? 1.5 : 1);
  const source = `venom:${p.id}`;
  const old = target.buffs.find((b) => b.source === source && b.remaining > 0);
  if (old && (old.mult > amount || (old.mult === amount && old.remaining >= coat.coating.duration)))
    return;
  p.buffs.splice(p.buffs.indexOf(coat), 1);
  const poison = makeBuff('venom', amount, coat.coating.duration, source);
  poison.venom = { ownerId: p.id, accum: 0, ticks: 0 };
  applyBuff(target, poison);
}

/** Tick before ordinary buff decay so the final second is delivered, including large time steps. */
export function tickVenoms(world: World, dt: number): void {
  if (dt <= 0 || world.scene !== null) return;
  for (const target of [...world.aliveBosses(), ...world.adds.filter((a) => a.hp > 0)]) {
    for (const buff of target.buffs.filter(
      (b) => b.kind === 'venom' && b.remaining > 0 && b.venom,
    )) {
      const state = buff.venom!;
      const owner = world.players.find((p) => p.id === state.ownerId);
      if (!owner) {
        buff.remaining = 0;
        continue;
      }
      state.accum += Math.min(dt, buff.remaining);
      while (state.accum >= 1 && state.ticks < 8 && target.hp > 0) {
        state.accum -= 1;
        state.ticks++;
        if (world.bosses.includes(target as Boss))
          damageBoss(world, owner, target as Boss, buff.mult);
        else damageAdd(world, owner, target as Add, buff.mult);
      }
    }
  }
}
