/** Shared, bounded active-skill payloads. Copied skills do not require donor passives. */
import type { World } from '../world/world';
import type { Player, Boss, Add } from '../core/types';
import { resolvedCoating, type PlayerAbilityDef } from '../content/classes';
import { dist } from '../core/torus';
import { applyBuff, damageBoss, damageAdd, isFlying, makeBuff, zoneReachesAir } from './combat';
import { spawnZone } from './abilities';

export function armRetouchEffects(world: World, p: Player, ab: PlayerAbilityDef): void {
  if (p.state !== 'alive' || p.hp <= 0 || world.scene !== null) return;
  if (ab.warCry) {
    applyBuff(
      p,
      makeBuff('challengeReady', 1.3, ab.warCry.duration, `challengeReady:${p.classId}`),
    );
    for (const foe of [...world.aliveBosses(), ...world.adds.filter((a) => a.hp > 0 && !a.charm)]) {
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
  const coating = resolvedCoating(ab);
  if (coating) {
    const buff = makeBuff('venomReady', coating.damage, coating.window, `venomReady:${p.classId}`);
    buff.coating = { damage: coating.damage, duration: coating.duration };
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
  for (const target of [
    ...world.aliveBosses(),
    ...world.adds.filter((a) => a.hp > 0 && !a.charm),
  ]) {
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

/** Host-only field poison shares Coated Blade's owner pool and preserves ticking phase. */
export function applyFieldPoison(
  world: World,
  owner: Player,
  target: Boss | Add,
  damage: number,
): void {
  if (
    damage <= 0 ||
    target.hp <= 0 ||
    owner.hp <= 0 ||
    owner.state !== 'alive' ||
    world.scene !== null
  )
    return;
  const source = `venom:${owner.id}`;
  const old = target.buffs.find((b) => b.source === source && b.remaining > 0);
  if (old && (old.mult > damage || (old.mult === damage && !old.venom?.field))) return;
  const recipients = [
    ...world.aliveBosses(),
    ...world.adds.filter((a) => a.hp > 0 && !a.charm),
  ].filter((t) => t.buffs.some((b) => b.remaining > 0 && b.source === source && b.venom?.field));
  if (!old?.venom?.field && recipients.length >= 3) return;
  if (old?.venom?.field && old.mult === damage) {
    old.remaining = Math.max(old.remaining, 2);
    old.venom.ticks = 0;
    return;
  }
  const poison = makeBuff('venom', damage, 2, source);
  poison.venom = { ownerId: owner.id, accum: old?.venom?.accum ?? 0, ticks: 0, field: true };
  applyBuff(target, poison);
}

/** Current actor list excludes bosses' decorative hazards, which are zones rather than actors. */
export function updateUpgradeZone(
  world: World,
  z: import('../core/types').GroundZone,
  dt: number,
): void {
  if (z.side !== 'player') return;
  const owner = world.players.find((p) => p.id === z.ownerId);
  if (!owner || owner.state !== 'alive' || owner.hp <= 0 || world.scene !== null) {
    z.poisonContacts?.clear();
    z.zoneFollow = 0;
    return;
  }
  const foes = [...world.aliveBosses(), ...world.adds.filter((a) => a.hp > 0 && !a.charm)];
  const reachable = (target: Boss | Add): boolean =>
    zoneReachesAir(z) ||
    (world.bosses.includes(target as Boss) ? !world.bossFlying(target as Boss) : !isFlying(target));
  if (z.followAcquired && (z.zoneFollow ?? 0) > 0) {
    const target = foes.find((t) => t.id === z.followId);
    if (target && reachable(target)) {
      z.pos = { ...target.pos };
      z.zoneFollow = Math.max(0, z.zoneFollow! - dt);
    } else z.zoneFollow = 0;
  }
  if (z.zonePoison?.onExit && z.poisonContacts) {
    for (const [id, magnitude] of z.poisonContacts) {
      const target = foes.find((t) => t.id === id);
      if (!target) {
        z.poisonContacts.delete(id);
        continue;
      }
      if (
        z.remaining > 0 &&
        dist(z.pos, target.pos) <= z.radius + target.radius &&
        reachable(target)
      )
        continue;
      z.poisonContacts.delete(id);
      if ((target.venomExitGates?.get(owner.id) ?? -Infinity) > world.elapsed) continue;
      target.venomExitGates ??= new Map();
      target.venomExitGates.set(owner.id, world.elapsed + 2);
      applyFieldPoison(world, owner, target, magnitude);
    }
  }
}

/** Called only after effective field damage, so immunity/misses cannot seed poison or follow. */
export function onUpgradeZoneDamage(
  world: World,
  z: import('../core/types').GroundZone,
  owner: Player | null,
  target: Boss | Add,
  effective: number,
): void {
  if (!owner || effective <= 0 || target.hp <= 0) return;
  if (z.zoneFollow && !z.followAcquired) {
    const current = [...world.aliveBosses(), ...world.adds].find((t) => t.id === z.followId);
    if (
      !current ||
      dist(z.pos, target.pos) < dist(z.pos, current.pos) ||
      (dist(z.pos, target.pos) === dist(z.pos, current.pos) && target.id < current.id)
    )
      z.followId = target.id;
  }
  if (!z.zonePoison) return;
  if (z.zonePoison.onExit) {
    z.poisonContacts ??= new Map();
    // A tail deals one post-allocation half-second field tick per second for 2s.
    z.poisonContacts.set(target.id, z.damagePerTick * (1 - z.zonePoison.share));
  } else applyFieldPoison(world, owner, target, z.damagePerTick * z.zonePoison.share * 2);
}
