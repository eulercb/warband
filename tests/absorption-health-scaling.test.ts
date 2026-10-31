import { describe, expect, it } from 'vitest';
import { World } from '../src/engine/world/world';
import { resolvePlayerAbility } from '../src/engine/combat/abilities';
import { absorptionAmount, maintainAbsorption } from '../src/engine/combat/absorption';
import { getClass, describeAbility, type PlayerAbilityDef } from '../src/engine/content/classes';
import { getSubSkill } from '../src/engine/content/subclasses';
import { decompose, recompose, describeComposed } from '../src/engine/content/forge';
import { heroPowerRatio } from '../src/engine/content/balance';
import { applyBuff, makeBuff } from '../src/engine/combat/combat';

const zero = { x: 0, y: 0 };
function setup(composed: boolean, ranks = 2, skill = 'cl_life_preserve') {
  const w = new World({
    monsterId: 'lich',
    seed: 31,
    players: [
      { peerId: 'a', name: 'Caster', classId: 'cleric' },
      {
        peerId: 'b',
        name: 'Recipient',
        classId: 'knight',
        extraClasses: ['mage'],
        upgrades: Array(ranks).fill('vigor'),
      },
    ],
  });
  w.scene = null;
  w.terrain = [];
  w.obstacles = [];
  const [p, ally] = w.players;
  p.pos = { x: 600, y: 400 };
  p.aim = { x: 1, y: 0 };
  ally.pos = { x: 620, y: 400 };
  w.boss!.pos = { x: 1100, y: 700 };
  const ab: PlayerAbilityDef = { ...structuredClone(getSubSkill(skill)!.ability), slot: 'sub1' };
  p.subAbilities = { sub1: composed ? recompose(decompose(ab), ab) : ab };
  return { w, p, ally, ab: p.subAbilities.sub1! };
}

describe.each([false, true])('direct absorption health growth, composed=%s', (composed) => {
  it('scales separately for each recipient using actual Vigor upgrades, without compounding casts', () => {
    const { w, p, ally, ab } = setup(composed);
    const beforePower = heroPowerRatio(p);
    resolvePlayerAbility(w, p, 'sub1', zero);
    expect(absorptionAmount(p.buffs)).toBe(ab.absorption!.amount);
    const expected = ab.absorption!.amount * (ally.maxHp / getClass('knight').maxHp);
    expect(absorptionAmount(ally.buffs)).toBeCloseTo(expected);
    w.setActiveClass(ally, 'mage');
    ally.buffs = [];
    resolvePlayerAbility(w, p, 'sub1', zero);
    expect(absorptionAmount(ally.buffs)).toBeCloseTo(expected);
    expect(heroPowerRatio(p)).toBe(beforePower);
    expect(ab.absorption!.amount).toBe(getSubSkill('cl_life_preserve')!.ability.absorption!.amount);
    // Raising max HP does not retroactively refill a partially spent/active pool.
    ally.maxHp *= 2;
    maintainAbsorption(ally);
    expect(absorptionAmount(ally.buffs)).toBeCloseTo(expected);
    ally.maxHp = 40;
    maintainAbsorption(ally);
    expect(absorptionAmount(ally.buffs)).toBe(20);
  });

  it('keeps baseline strength below baseline HP and preserves the shared cap and downed rejection', () => {
    const { w, p, ally, ab } = setup(composed, 0, 'cl_light_warding');
    ally.maxHp = ally.hp = 150;
    resolvePlayerAbility(w, p, 'sub1', zero);
    // Injure the ally to make it the lowest-health recipient.
    ally.hp = 50;
    ally.buffs = [];
    resolvePlayerAbility(w, p, 'sub1', zero);
    expect(absorptionAmount(ally.buffs)).toBe(70);
    ab.absorption!.amount = 500;
    if (ab.components) ab.components = decompose(ab);
    resolvePlayerAbility(w, p, 'sub1', zero);
    expect(absorptionAmount(ally.buffs)).toBe(75);
    ally.state = 'downed';
    ally.hp = 0;
    ally.buffs = [];
    resolvePlayerAbility(w, p, 'sub1', zero);
    expect(absorptionAmount(ally.buffs)).toBe(0);
  });

  it('scales siphoned protection but not curse damage, with the same copied-skill behavior', () => {
    const { w, p, ab } = setup(composed, 0, 'wa_fiend_resilience');
    p.maxHp *= 2;
    p.hp = p.maxHp;
    p.critChance = 0;
    const boss = w.boss!;
    boss.pos = { x: 650, y: 400 };
    boss.hp = boss.maxHp = 10000;
    applyBuff(boss, makeBuff('curse', 1, 4, `curse:${p.id}`));
    resolvePlayerAbility(w, p, 'sub1', zero);
    expect(absorptionAmount(p.buffs)).toBe(100); // (30 base +20 siphon) x2 HP growth.
    expect(10000 - boss.hp).toBe(20);
    expect(ab.absorption!.curseSiphon!.amount).toBe(20);
    expect(describeAbility(ab)).toContain('30 absorption');
    expect(describeComposed(decompose(ab), ab.cooldown)).toContain('30 absorption');
  });

  it('raises the damage-earned Claim ceiling without multiplying the earned amount', () => {
    for (const damage of [80, 400]) {
      const { w, p, ab } = setup(composed, 0, 'wa_fiend_rebuke');
      p.maxHp *= 2;
      p.hp = p.maxHp;
      p.critChance = 0;
      w.boss!.pos = { x: 650, y: 400 };
      w.boss!.hp = w.boss!.maxHp = 10000;
      applyBuff(w.boss!, makeBuff('curse', 1, 4, `curse:${p.id}`));
      ab.damage = damage;
      ab.claimWard = 0.25;
      if (composed) ab.components = decompose(ab);
      resolvePlayerAbility(w, p, 'sub1', zero);
      expect(absorptionAmount(p.buffs)).toBe(damage === 80 ? 20 : 50);
    }
  });
});
