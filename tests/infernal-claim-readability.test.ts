import { afterEach, describe, expect, it } from 'vitest';
import { World } from '../src/engine/world/world';
import { applyBuff, makeBuff } from '../src/engine/combat/combat';
import { findInfernalClaimTarget } from '../src/engine/combat/abilities';
import { SnapshotInterpolator } from '../src/render/pipeline/interpolate';
import { pushHud } from '../src/ui/state/hudBridge';
import { useHudStore } from '../src/ui/state/hudStore';
import type { Snapshot } from '../src/engine/core/types';

function setup() {
  const world = new World({
    monsterId: 'lich',
    seed: 31,
    players: [{ peerId: 'remote', name: 'A', classId: 'warlock', subSkills: ['wa_fiend_rebuke'] }],
  });
  world.scene = null;
  const player = world.players[0],
    boss = world.boss!;
  player.pos = { x: 600, y: 400 };
  player.aim = { x: 1, y: 0 };
  boss.pos = { x: 700, y: 400 };
  boss.buffs = [];
  return { world, player, boss, ability: player.subAbilities!.sub1! };
}

afterEach(() => useHudStore.getState().resetHud());

describe('Infernal Claim target readability', () => {
  it('reports exactly the cast target after ownership, expiry, bounded range, aim and death checks', () => {
    const { world, player, boss, ability } = setup();
    const target = () => {
      const expected = findInfernalClaimTarget(world, player, ability)?.id ?? null;
      expect(world.serialize().players[0].infernalClaimTargets).toEqual({ sub1: expected });
      return expected;
    };
    expect(target()).toBeNull();
    applyBuff(boss, makeBuff('curse', 1.15, 4, `curse:${player.id + 1}:hex`));
    expect(target()).toBeNull();
    const own = makeBuff('curse', 1.15, 4, `curse:${player.id}:hex`);
    applyBuff(boss, own);
    expect(target()).toBe(boss.id);
    boss.buffs.find((b) => b.source === own.source)!.remaining = 0;
    expect(target()).toBeNull();
    boss.buffs.find((b) => b.source === own.source)!.remaining = 4;
    ability.range = 10000; // Presentation must honor the same arena cap as casting.
    boss.pos.x = 1050;
    expect(target()).toBeNull();
    boss.pos.x = 990;
    player.aim.x = -1;
    expect(target()).toBeNull();
    player.aim.x = 1;
    expect(target()).toBe(boss.id);
    boss.hp = 0;
    expect(target()).toBeNull();
  });

  it('chooses the actual best aimed add and carries it through remote snapshots and HUD', () => {
    const { world, player, boss } = setup();
    boss.pos = { x: 650, y: 430 };
    applyBuff(boss, makeBuff('curse', 1.15, 4, `curse:${player.id}:hex`));
    world.spawnAddWave({ x: 750, y: 400 }, 1, { minR: 0, maxR: 0 });
    const add = world.adds[0];
    applyBuff(add, makeBuff('curse', 1.15, 4, `curse:${player.id}:hex`));
    player.cooldowns.sub1 = 3;
    const local = world.toRenderState(player.id);
    expect(local.players[0].infernalClaimTargets).toEqual({ sub1: add.id });
    const interpolator = new SnapshotInterpolator();
    interpolator.push(JSON.parse(JSON.stringify(world.serialize())) as Snapshot);
    const remote = interpolator.sample(performance.now() + 1000, {
      localPlayerId: player.id,
      arena: world.arena,
    })!;
    pushHud(remote, 'touch');
    expect(useHudStore.getState().infernalClaimTargets).toEqual(
      local.players[0].infernalClaimTargets,
    );
    expect(useHudStore.getState().cooldowns.sub1).toBe(3);
    delete remote.players[0].infernalClaimTargets;
    pushHud(remote, 'touch');
    expect(useHudStore.getState().infernalClaimTargets).toEqual({});
  });

  it('supports forged Claim in a base slot without requiring a curse and clears removed slots', () => {
    const { world, player, boss, ability } = setup();
    player.abilities!.a2 = { ...ability, slot: 'a2', forgeClaimFallback: true };
    expect(world.serialize().players[0].infernalClaimTargets).toEqual({ a2: boss.id, sub1: null });
    delete player.subAbilities!.sub1;
    expect(world.serialize().players[0].infernalClaimTargets).toEqual({ a2: boss.id });
    delete player.abilities!.a2.infernalClaim;
    expect(world.serialize().players[0].infernalClaimTargets).toBeUndefined();
  });
});
