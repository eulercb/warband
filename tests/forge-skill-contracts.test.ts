import { describe, expect, it } from 'vitest';
import {
  componentValue,
  decompose,
  describeComposed,
  recompose,
  refreshComponents,
  synthesizeAbility,
  type Donor,
} from '../src/engine/content/forge';
import type { PlayerAbilityDef } from '../src/engine/content/classes';
import { World } from '../src/engine/world/world';
import { resolvePlayerAbility } from '../src/engine/combat/abilities';
import { damagePlayer } from '../src/engine/combat/combat';

const base: PlayerAbilityDef = {
  slot: 'a2',
  name: 'Contract strike',
  kind: 'pbaoe',
  cooldown: 8,
  damage: 40,
  radius: 100,
};
const contracts = [
  { precisionOnHit: 4 },
  { preparedInvulnOnHit: 0.35 },
  { echoFraction: 0.35 },
  { markOnPreparedHit: 0.25 },
  { infernalClaim: true },
  { claimWard: 0.25 },
  { rebukeInvuln: 0.6 },
];
const donor = (def: PlayerAbilityDef): Donor => ({
  name: def.name,
  classId: 'warlock',
  className: 'Warlock',
  slot: 'a2',
  def,
});

describe('Forge authored contracts have real delivery, price and bounds', () => {
  it.each(contracts)('preserves and prices a supported authored payoff %j', (contract) => {
    const def = { ...base, ...contract };
    const components = decompose(def);
    expect(componentValue(components)).toBeGreaterThan(componentValue(decompose(base)));
    expect(describeComposed(components, 8)).not.toMatch(/NaN|undefined/);
    const rebuilt = recompose(components, base);
    for (const [key, value] of Object.entries(contract))
      expect(rebuilt[key as keyof PlayerAbilityDef]).toBe(value);
    for (const seed of [0, 7, 31, 4242]) {
      const fused = synthesizeAbility(seed, 'contract', 'a2', [donor(def)]).def;
      expect(fused.components!.effects.some((e) => e.kind === 'skillContract')).toBe(true);
      expect(describeComposed(fused.components!, fused.cooldown)).not.toMatch(/undefined|NaN/);
      expect(Number.isFinite(componentValue(fused.components!) / fused.cooldown)).toBe(true);
      // Refresh must preserve the actual payoff instead of silently dropping it.
      const refreshed = refreshComponents({ ...fused, damage: fused.damage + 10 });
      expect(refreshed.effects.some((e) => e.kind === 'skillContract')).toBe(true);
    }
  });

  it('caps and describes compound upgraded contracts, without making an absent rider appear', () => {
    const authored = contracts.reduce<PlayerAbilityDef>(
      (current, contract) => ({ ...current, ...contract }),
      base,
    );
    const components = decompose(authored);
    const upgraded = {
      ...recompose(components, base),
      precisionOnHit: 99,
      preparedInvulnOnHit: 99,
      echoFraction: 99,
      markOnPreparedHit: 99,
      claimWard: 99,
      rebukeInvuln: 99,
    };
    const bounded = recompose(refreshComponents(upgraded), base);
    expect(bounded.precisionOnHit).toBe(5);
    expect(bounded.preparedInvulnOnHit).toBe(0.6);
    expect(bounded.echoFraction).toBe(0.4);
    expect(bounded.markOnPreparedHit).toBe(0.25);
    expect(bounded.claimWard).toBe(0.25);
    expect(bounded.rebukeInvuln).toBe(0.6);
    const text = describeComposed(bounded.components!, 8);
    expect(text).toContain('retort');
    expect(text).toContain('echo');
    expect(text).toContain('protection');
    const plain = refreshComponents({ ...base, components: decompose(base) });
    expect(plain.effects.some((e) => e.kind === 'skillContract')).toBe(false);
  });

  it('shares an already selected retort rather than arming an extra charge for its aftermath', () => {
    const anchor = { ...base, rebukeInvuln: 0.6 };
    const counter = {
      ...base,
      name: 'Existing counter',
      damage: 0,
      rebukeDuration: 3,
      rebukeDirect: true,
      rebukeCurseBonus: 0.15,
    };
    for (const seed of [0, 7, 31, 42]) {
      const fused = synthesizeAbility(seed, 'paired-retort', 'a2', [
        donor(anchor),
        donor(counter),
      ]).def;
      expect(fused.components!.effects.filter((e) => e.kind === 'rebuke')).toHaveLength(1);
      expect(describeComposed(fused.components!, fused.cooldown)).toContain('counterburst');
    }
    expect(describeComposed(decompose(counter), 8)).toContain('next positive direct hit');
    expect(describeComposed(decompose(counter), 8)).toContain('searing curse');
  });

  it('keeps a successful-retort rider paired with a real retort through synthesis and live use', () => {
    const def = { ...base, rebukeInvuln: 0.6 }; // only the upgrade supplied the aftermath
    for (const seed of [0, 1, 7, 31, 99]) {
      const fused = synthesizeAbility(seed, 'retort', 'a2', [donor(def)]).def;
      expect(fused.rebukeInvuln).toBeGreaterThan(0);
      expect(fused.rebukeDuration).toBeGreaterThan(0);
      const w = new World({
        monsterId: 'lich',
        seed: 31,
        players: [{ peerId: 'a', name: 'A', classId: 'warlock' }],
      });
      w.scene = null;
      w.obstacles = [];
      w.terrain = [];
      const p = w.players[0],
        boss = w.boss!;
      p.pos = { x: 600, y: 400 };
      boss.pos = { x: 650, y: 400 };
      boss.hp = boss.maxHp = 10000;
      p.abilities!.a2 = fused;
      resolvePlayerAbility(w, p, 'a2', { x: 0, y: 0 });
      expect(p.buffs.some((b) => b.kind === 'rebuke')).toBe(true);
      damagePlayer(w, p, 1, boss.pos);
      expect(p.buffs.some((b) => b.kind === 'invuln' && b.source === 'infernalCataclysm')).toBe(
        true,
      );
      expect(p.buffs.some((b) => b.kind === 'rebuke')).toBe(false);
    }
  });
});
