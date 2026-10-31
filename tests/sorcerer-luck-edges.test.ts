import { describe, expect, it } from 'vitest';
import { World } from '../src/engine/world/world';
import { resolvePlayerAbility } from '../src/engine/combat/abilities';
import { applyBuff, buffMult, damageBoss, makeBuff } from '../src/engine/combat/combat';
import { consumeSpellSurge, prepareSpellSurge } from '../src/engine/combat/spellCombos';
import { buffView } from '../src/engine/core/buffView';
import { buffBadges } from '../src/render/overlays/buffGlyphs';
import { getClass, type PlayerAbilityDef } from '../src/engine/content/classes';
import { getSubSkill } from '../src/engine/content/subclasses';
import {
  componentValue,
  decompose,
  recompose,
  refreshComponents,
  synthesizeAbility,
  type Donor,
} from '../src/engine/content/forge';

function setup() {
  const world = new World({
    monsterId: 'lich',
    seed: 47,
    players: [{ peerId: 'a', name: 'A', classId: 'sorcerer', subSkills: ['so_wild_bend'] }],
  });
  world.scene = null;
  const player = world.players[0];
  const boss = world.boss!;
  boss.hp = boss.maxHp = 10000;
  return { world, player, boss };
}

describe('Sorcerer luck refresh and public feedback edges', () => {
  it('a weaker new Fortune preserves stronger and longer existing enemy misfortune', () => {
    const { world, player, boss } = setup();
    applyBuff(boss, makeBuff('castSlow', 1.8, 7, 'fortuneDelay'));
    applyBuff(boss, makeBuff('damageDealt', 0.6, 8, 'weakness:fortune'));
    resolvePlayerAbility(world, player, 'sub1', { x: 0, y: 0 });
    damageBoss(world, player, boss, 10, { direct: true });
    expect(boss.buffs.find((b) => b.source === 'fortuneDelay')).toMatchObject({
      mult: 1.8,
      remaining: 7,
    });
    expect(boss.buffs.find((b) => b.source === 'weakness:fortune')).toMatchObject({
      mult: 0.6,
      remaining: 8,
    });
    expect(buffMult(boss, 'damageDealt')).toBe(0.6);
    expect(player.buffs.some((b) => b.kind === 'fortune')).toBe(false);
  });
  it('expired Fortune debuffs cannot preserve old potency or duration', () => {
    const { world, player, boss } = setup();
    boss.buffs.push(makeBuff('castSlow', 1.8, 0, 'fortuneDelay'));
    boss.buffs.push(makeBuff('damageDealt', 0.6, 0, 'weakness:fortune'));
    resolvePlayerAbility(world, player, 'sub1', { x: 0, y: 0 });
    damageBoss(world, player, boss, 10, { direct: true });
    expect(boss.buffs.find((b) => b.source === 'fortuneDelay')).toMatchObject({
      mult: 1.4,
      remaining: 3,
    });
    expect(boss.buffs.find((b) => b.source === 'weakness:fortune')).toMatchObject({
      mult: 0.85,
      remaining: 3,
    });
  });
  it('clover readiness and dice exposure visibly explain their different recipients and timing', () => {
    const [clover, dice] = buffBadges([
      { kind: 'fortune', mult: 1, remaining: 6 },
      { kind: 'luckExposure', mult: 1.2, remaining: 5 },
    ]);
    expect(clover).toMatchObject({ glyph: '🍀', good: true, secs: 6 });
    expect(clover.label).toContain('next positive direct hit');
    expect(dice).toMatchObject({ glyph: '🎲', good: false, secs: 5 });
    expect(dice.label).toContain('different cast');
    expect(dice.label).toContain('+20%');
  });
  it('malformed legacy exposure labels do not invent a public owner or leak cast tokens', () => {
    expect(
      buffView({
        kind: 'luckExposure',
        mult: 1.2,
        remaining: 5,
        source: 'fortune:sorcerer:legacy-peer',
        openingCast: { spent: false },
      }),
    ).toEqual({
      kind: 'luckExposure',
      mult: 1.2,
      remaining: 5,
    });
  });
});

describe('copied Surge payload defaults', () => {
  it('preserves fallback cone angle and control duration without authored optional geometry', () => {
    const { player } = setup();
    const cone: PlayerAbilityDef = {
      slot: 'sub1',
      name: 'Copied Breath',
      kind: 'meleeCone',
      cooldown: 8,
      damage: 20,
      consumesSurge: true,
      surgeRider: { halfAngleDeg: 20, castSlow: 1.3 },
    };
    prepareSpellSurge(player, { ...cone, prepareSurge: 8 });
    const surged = consumeSpellSurge(player, cone);
    expect(surged.halfAngleDeg).toBe(65);
    expect(surged.castSlowDuration).toBe(3);
    expect(surged.damage).toBe(24);
  });
  it('adds to the actual default burst radius instead of shrinking a copied burst', () => {
    const { player } = setup();
    const burst: PlayerAbilityDef = {
      slot: 'sub1',
      name: 'Copied Tides',
      kind: 'pbaoe',
      cooldown: 8,
      damage: 40,
      consumesSurge: true,
      surgeRider: { radius: 50 },
    };
    prepareSpellSurge(player, { ...burst, prepareSurge: 8 });
    expect(consumeSpellSurge(player, burst).radius).toBe(200);
  });
  it('an already-straight legacy volley stays straight and can add a pierced body', () => {
    const { player } = setup();
    const volley: PlayerAbilityDef = {
      slot: 'sub1',
      name: 'Copied Chaos',
      kind: 'projectile',
      cooldown: 7,
      damage: 12,
      consumesSurge: true,
      surgeRider: { pierce: 1, spreadDeg: 28 },
    };
    prepareSpellSurge(player, { ...volley, prepareSurge: 8 });
    expect(consumeSpellSurge(player, volley)).toMatchObject({ spreadDeg: 0, pierce: 1 });
    const twin = { ...volley, surgeTwin: true, surgeRider: undefined };
    prepareSpellSurge(player, { ...twin, prepareSurge: 8 });
    const split = consumeSpellSurge(player, twin);
    expect(split.projCount).toBe(2);
    expect(split.spreadDeg).toBe(4);
    expect(split.damage * split.projCount!).toBeCloseTo(12 * 1.2);
  });
});

describe('Forge Fortune and Surge rider budget edges', () => {
  it('actual synthesis scales a surged piercing rider and executes its bounded budget', () => {
    const surge = getSubSkill('so_wild_surge')!.ability;
    const bolt = getClass('mage').abilities.basic;
    const donors: Donor[] = [
      { name: surge.name, classId: 'sorcerer', className: 'Sorcerer', slot: 'a1', def: surge },
      { name: bolt.name, classId: 'mage', className: 'Mage', slot: 'basic', def: bolt },
    ];
    const generated = Array.from(
      { length: 100 },
      (_, i) => synthesizeAbility(i + 1, 'surged-piercing-edge', 'a1', donors).def,
    );
    const ab = generated.find((a) => a.surgeRider?.pierce && a.damage > 0)!;
    expect(ab).toBeDefined();
    expect(ab.surgeRider!.pierce).toBeLessThanOrEqual(2);
    expect(ab.surgeRider!.spreadDeg).toBeGreaterThanOrEqual(10);
    const { player } = setup();
    prepareSpellSurge(player, { ...ab, prepareSurge: 8 });
    const powered = consumeSpellSurge(player, ab);
    expect(powered.pierce).toBe((ab.pierce ?? 0) + ab.surgeRider!.pierce!);
    expect(powered.damage * (powered.projCount ?? 1)).toBeCloseTo(
      ab.damage * (ab.projCount ?? 1) * 1.2,
    );
    const capped = recompose(
      refreshComponents({
        ...ab,
        surgeRider: { ...ab.surgeRider, pierce: 3, castSlow: 1.3, castSlowDuration: undefined },
      }),
      ab,
    );
    expect(capped.surgeRider!.pierce).toBe(2);
    expect(capped.surgeRider!.castSlowDuration).toBe(3);
  });
  it('synthesized Loaded Fate prices its mark and caps an upgraded Fortune contract', () => {
    const native = getSubSkill('so_wild_bend')!.ability;
    const loaded = { ...native, fortune: { ...native.fortune!, markBonus: 0.2 } };
    const donor: Donor = {
      name: loaded.name,
      classId: 'sorcerer',
      className: 'Sorcerer',
      slot: 'a2',
      def: loaded,
    };
    const ab = synthesizeAbility(17, 'loaded-fate-edge', 'a2', [donor]).def;
    expect(ab.fortune!.markBonus).toBe(0.2);
    const priced = decompose(ab);
    const unmarked = decompose({ ...ab, fortune: { ...ab.fortune!, markBonus: undefined } });
    expect(componentValue(priced)).toBeGreaterThan(componentValue(unmarked));
    const capped = recompose(
      refreshComponents({ ...ab, fortune: { ...ab.fortune!, markBonus: 0.35 } }),
      ab,
    );
    expect(capped.fortune!.markBonus).toBe(0.25);
  });
});
