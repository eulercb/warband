/**
 * Bots progress their power between bosses (item 6). `pickBotUpgrades` is pure and
 * seeded, so we can assert both the personality bias (a Reckless bot hoards
 * offence, a Timid one stacks defence) and the hard invariants (stacking caps,
 * class-pool membership, determinism).
 */
import { describe, it, expect } from 'vitest';
import { pickBotUpgrades, botRoleWeight, type BotPersonality } from '../src/engine/ai/bot';
import { UPGRADES } from '../src/engine/content/upgrades';
import {
  CHAR_UPGRADES_BY_CLASS,
  HYBRID_UPGRADES,
  upgradeAllowedFor,
} from '../src/engine/content/charUpgrades';
import { Rng } from '../src/engine/core/math';

function persona(over: Partial<BotPersonality>): BotPersonality {
  return {
    label: 'Test',
    smart: 0.5,
    aggression: 0.5,
    chaos: 0,
    rng: new Rng(1),
    wander: { x: 0, y: 0 },
    nextWanderTick: 0,
    ...over,
  };
}

describe('pickBotUpgrades', () => {
  it('is deterministic for a given seed + owned state', () => {
    const p = persona({ aggression: 0.8 });
    const a = pickBotUpgrades('knight', p, [], [], new Rng(42));
    const b = pickBotUpgrades('knight', p, [], [], new Rng(42));
    expect(a).toEqual(b);
  });

  it('draws the class pick from the class pool or an eligible hybrid (item 59)', () => {
    // A bot's between-boss pick is now its class pool ∪ the hybrids it's allowed.
    const classPool = CHAR_UPGRADES_BY_CLASS.mage.map((d) => d.id);
    const hybridPool = HYBRID_UPGRADES.filter((d) => upgradeAllowedFor(d, 'mage')).map((d) => d.id);
    const eligible = new Set([...classPool, ...hybridPool]);
    for (let seed = 1; seed <= 30; seed++) {
      const pick = pickBotUpgrades('mage', persona({}), [], [], new Rng(seed));
      expect(pick.char).not.toBeNull();
      expect(eligible.has(pick.char as string)).toBe(true);
    }
  });

  it('bots keep pace with humans by sometimes grafting a hybrid (item 59)', () => {
    // Over a spread of seeds, a bot draws hybrids at roughly the human offer rate,
    // never one its class is excluded from, honouring the maxStacks-1 cap.
    const hybridIds = new Set(HYBRID_UPGRADES.map((d) => d.id));
    let hybridPicks = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const pick = pickBotUpgrades('knight', persona({}), [], [], new Rng(seed));
      if (pick.char && hybridIds.has(pick.char)) hybridPicks++;
    }
    expect(hybridPicks).toBeGreaterThan(0); // hybrids really do surface for bots
  });

  it('never picks a hybrid its class is excluded from (item 59)', () => {
    // hy_pyromancer excludes mage/sorcerer — a mage bot must never graft a Fireball.
    for (let seed = 1; seed <= 80; seed++) {
      const pick = pickBotUpgrades('mage', persona({}), [], [], new Rng(seed));
      expect(pick.char).not.toBe('hy_pyromancer');
    }
  });

  it('never offers a boon already at its stacking cap', () => {
    // Surefooted caps at 2; owning two must keep it out of every roll.
    const owned = ['surefooted', 'surefooted'];
    for (let seed = 1; seed <= 40; seed++) {
      const pick = pickBotUpgrades('ranger', persona({}), owned, [], new Rng(seed));
      expect(pick.generic).not.toBe('surefooted');
    }
  });

  it('a Reckless bot favours offence more than a Timid one', () => {
    const reckless = persona({ aggression: 0.95, smart: 0.4 });
    const timid = persona({ aggression: 0.1, smart: 0.7 });
    const countOffence = (p: BotPersonality): number => {
      let n = 0;
      for (let seed = 1; seed <= 200; seed++) {
        const pick = pickBotUpgrades('knight', p, [], [], new Rng(seed));
        if (pick.generic && UPGRADES[pick.generic].role === 'offense') n++;
      }
      return n;
    };
    expect(countOffence(reckless)).toBeGreaterThan(countOffence(timid));
  });

  it('botRoleWeight ranks the extremes sensibly', () => {
    const reckless = persona({ aggression: 1, smart: 0.3, chaos: 0 });
    expect(botRoleWeight('offense', reckless)).toBeGreaterThan(botRoleWeight('defense', reckless));
    const timid = persona({ aggression: 0, smart: 0.3, chaos: 0 });
    expect(botRoleWeight('defense', timid)).toBeGreaterThan(botRoleWeight('offense', timid));
  });
});
