/**
 * Bots progress their power between bosses (item 6). `pickBotUpgrades` is pure and
 * seeded, so we can assert both the personality bias (a Reckless bot hoards
 * offence, a Timid one stacks defence) and the hard invariants (stacking caps,
 * class-pool membership, determinism).
 */
import { describe, it, expect } from 'vitest';
import { pickBotUpgrades, botRoleWeight, type BotPersonality } from '../src/engine/ai/bot';
import { UPGRADES } from '../src/engine/content/upgrades';
import { CHAR_UPGRADES_BY_CLASS } from '../src/engine/content/charUpgrades';
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

  it('draws the class pick from the class pool', () => {
    const pool = new Set(CHAR_UPGRADES_BY_CLASS.mage.map((d) => d.id));
    for (let seed = 1; seed <= 30; seed++) {
      const pick = pickBotUpgrades('mage', persona({}), [], [], new Rng(seed));
      expect(pick.char).not.toBeNull();
      expect(pool.has(pick.char as string)).toBe(true);
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
