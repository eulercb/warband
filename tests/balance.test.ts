/**
 * Tests for the MATCH BALANCE engine (engine/content/balance.ts): the hero /
 * band power index, the kill-pace tracking, the bounded adjustment math, and
 * the World integration that folds it all into a fight's boss scaling.
 */
import { describe, it, expect } from 'vitest';
import { World } from '../src/engine/world/world';
import type { WorldInit, WorldPlayerInit } from '../src/engine/world/world';
import {
  heroPowerRatio,
  bandPowerRatio,
  runClears,
  expectedBandPower,
  encounterPace,
  recordEncounter,
  balanceAdjust,
  NEUTRAL_BALANCE,
} from '../src/engine/content/balance';
import { CLASS_IDS } from '../src/engine/content/classes';
import type { ClassId } from '../src/engine/core/types';
import type { Player } from '../src/engine/core/types';
import type { UpgradeId } from '../src/engine/content/upgrades';
import {
  BALANCE_TARGET_TTK,
  BALANCE_PACK_TTK_BONUS,
  BALANCE_PACE_SAMPLE_MIN,
  BALANCE_PACE_SAMPLE_MAX,
  BALANCE_PACE_ALPHA,
  BALANCE_DEFEAT_PACE,
  BALANCE_EXPECTED_GROWTH,
  BALANCE_POWER_EXCESS_MAX,
  BALANCE_EXTRA_CLASS_BONUS,
  BALANCE_HP_MIN,
  BALANCE_HP_MAX,
  BALANCE_DMG_MIN,
  BALANCE_DMG_MAX,
  BOSS_HP_SCALE,
} from '../src/engine/core/constants';
import { MONSTERS } from '../src/engine/content/monsters';

/** Spawn a world (default: solo knight vs dragon) and hand back its players. */
function mkWorld(players: Array<Partial<WorldPlayerInit>>, init: Partial<WorldInit> = {}): World {
  return new World({
    monsterId: 'dragon',
    seed: 7,
    players: players.map((p, i) => ({
      peerId: `p${i}`,
      name: `P${i}`,
      classId: 'knight',
      ...p,
    })),
    ...init,
  });
}

function spawnHero(p: Partial<WorldPlayerInit> = {}): Player {
  return mkWorld([p]).players[0];
}

describe('balance: hero / band power index', () => {
  it('an un-upgraded hero of every class measures exactly 1', () => {
    for (const classId of CLASS_IDS) {
      const hero = spawnHero({ classId });
      expect(heroPowerRatio(hero), classId).toBeCloseTo(1, 5);
    }
  });

  it('offense stacking raises power, and more stacks raise it further', () => {
    const one = heroPowerRatio(spawnHero({ upgrades: ['mighty'] as UpgradeId[] }));
    const three = heroPowerRatio(
      spawnHero({ upgrades: ['mighty', 'mighty', 'mighty'] as UpgradeId[] }),
    );
    expect(one).toBeGreaterThan(1);
    expect(three).toBeGreaterThan(one);
  });

  it('weighs offense above durability, and pure utility barely moves it', () => {
    const mighty = heroPowerRatio(
      spawnHero({ upgrades: ['mighty', 'mighty', 'mighty'] as UpgradeId[] }),
    );
    const vigor = heroPowerRatio(
      spawnHero({ upgrades: ['vigor', 'vigor', 'vigor'] as UpgradeId[] }),
    );
    const surefooted = heroPowerRatio(
      spawnHero({ upgrades: ['surefooted', 'surefooted'] as UpgradeId[] }),
    );
    expect(mighty).toBeGreaterThan(vigor);
    expect(vigor).toBeGreaterThan(1);
    expect(surefooted).toBeCloseTo(1, 5); // terrain resist is utility, not power
  });

  it('haste (tempo) and renewal (sustain) both register as power', () => {
    expect(heroPowerRatio(spawnHero({ upgrades: ['haste'] as UpgradeId[] }))).toBeGreaterThan(1);
    expect(heroPowerRatio(spawnHero({ upgrades: ['renewal'] as UpgradeId[] }))).toBeGreaterThan(1);
  });

  it('character upgrades that retune the kit count (hybrid Juggernaut)', () => {
    const hero = spawnHero({ charUpgrades: ['hy_juggernaut'] });
    expect(heroPowerRatio(hero)).toBeGreaterThan(1);
  });

  it('bound subclass skills add kit power', () => {
    const plain = heroPowerRatio(spawnHero());
    const skilled = heroPowerRatio(spawnHero({ subSkills: ['kn_champion_slam'] }));
    expect(skilled).toBeGreaterThan(plain);
  });

  it('each extra multiclass kit multiplies power by the flat bonus', () => {
    const plain = heroPowerRatio(spawnHero());
    const multi = heroPowerRatio(spawnHero({ extraClasses: ['mage'] as ClassId[] }));
    expect(multi / plain).toBeCloseTo(1 + BALANCE_EXTRA_CLASS_BONUS, 5);
  });

  it('ephemeral shop elixirs count for the fight they ride into', () => {
    const plain = heroPowerRatio(spawnHero());
    const juiced = heroPowerRatio(spawnHero({ ephemeral: { damage: true } }));
    expect(juiced).toBeGreaterThan(plain);
  });

  it('falls back to the class baseline table when a hero has no resolved kit', () => {
    const hero = spawnHero();
    const bare = { ...hero, abilities: undefined } as Player;
    expect(heroPowerRatio(bare)).toBeCloseTo(1, 5);
  });

  it('band power is the mean hero ratio; an empty roster is neutral', () => {
    const w = mkWorld([
      { upgrades: ['mighty', 'mighty', 'mighty'] as UpgradeId[] },
      {}, // fresh hero
    ]);
    const [strong, fresh] = w.players.map(heroPowerRatio);
    const band = bandPowerRatio(w.players);
    expect(band).toBeGreaterThan(fresh);
    expect(band).toBeLessThan(strong);
    expect(band).toBeCloseTo((strong + fresh) / 2, 5);
    expect(bandPowerRatio([])).toBe(1);
  });
});

describe('balance: expected progression curve', () => {
  it('counts cleared encounters across the run and endless cycles', () => {
    expect(runClears(0, 0, 1)).toBe(0); // a single fight
    expect(runClears(0, 2, 5)).toBe(2); // third encounter of a run
    expect(runClears(1, 0, 5)).toBe(5); // endless lap 2 opener
    expect(runClears(2, 3, 5)).toBe(13);
    expect(runClears(-1, -2, 0)).toBe(0); // degenerate inputs clamp
  });

  it('compounds the tuned growth per cleared encounter', () => {
    expect(expectedBandPower(0)).toBe(1);
    expect(expectedBandPower(-3)).toBe(1);
    expect(expectedBandPower(2)).toBeCloseTo((1 + BALANCE_EXPECTED_GROWTH) ** 2, 8);
    expect(expectedBandPower(5)).toBeGreaterThan(expectedBandPower(4));
  });
});

describe('balance: kill-pace tracking', () => {
  it('a kill on the target time is pace 1', () => {
    expect(encounterPace(BALANCE_TARGET_TTK, 1)).toBeCloseTo(1, 8);
  });

  it('fast kills read > 1, slogs < 1', () => {
    expect(encounterPace(BALANCE_TARGET_TTK / 2, 1)).toBeCloseTo(2, 8);
    expect(encounterPace(BALANCE_TARGET_TTK * 1.5, 1)).toBeCloseTo(2 / 3, 8);
  });

  it('a multi-boss pack earns a stretched target', () => {
    const packTarget = BALANCE_TARGET_TTK * (1 + BALANCE_PACK_TTK_BONUS);
    expect(encounterPace(packTarget, 2)).toBeCloseTo(1, 8);
    // The same kill time against a lone boss would have read as slow-ish.
    expect(encounterPace(packTarget, 1)).toBeLessThan(1);
  });

  it('clamps cheese kills and endless slogs', () => {
    expect(encounterPace(1, 1)).toBe(BALANCE_PACE_SAMPLE_MAX); // TTK floor + cap
    expect(encounterPace(3600, 1)).toBe(BALANCE_PACE_SAMPLE_MIN);
  });

  it('EMA folds a victory toward its sample', () => {
    const next = recordEncounter(1, {
      durationS: BALANCE_TARGET_TTK / 2,
      bossCount: 1,
      victory: true,
    });
    expect(next).toBeCloseTo(1 + BALANCE_PACE_ALPHA * (2 - 1), 8);
  });

  it('a wipe records the fixed struggling sample and converges toward it', () => {
    let pace = 1;
    pace = recordEncounter(pace, { durationS: 30, bossCount: 1, victory: false });
    expect(pace).toBeCloseTo(1 + BALANCE_PACE_ALPHA * (BALANCE_DEFEAT_PACE - 1), 8);
    for (let i = 0; i < 20; i++) {
      pace = recordEncounter(pace, { durationS: 30, bossCount: 1, victory: false });
    }
    expect(pace).toBeCloseTo(BALANCE_DEFEAT_PACE, 3);
  });
});

describe('balance: the bounded adjustment', () => {
  it('is a no-op for an on-target, on-curve band', () => {
    const adj = balanceAdjust(1, 1, 0);
    expect(adj.hpMult).toBe(1);
    expect(adj.dmgMult).toBe(1);
    expect(adj.powerExcess).toBe(1);
  });

  it('stiffens for a fast band and eases for a struggling one, HP more than damage', () => {
    const fast = balanceAdjust(1.5, 1, 0);
    expect(fast.hpMult).toBeGreaterThan(1);
    expect(fast.dmgMult).toBeGreaterThan(1);
    expect(fast.hpMult).toBeGreaterThan(fast.dmgMult);

    const slow = balanceAdjust(0.8, 1, 0);
    expect(slow.hpMult).toBeLessThan(1);
    expect(slow.dmgMult).toBeLessThan(1);
    expect(slow.hpMult).toBeLessThan(slow.dmgMult);
  });

  it('answers power stacked past the curve, but not on-curve progression', () => {
    // Band 30% over the tuned curve at the same pace → tougher boss.
    const stacked = balanceAdjust(1, 1.3, 0);
    expect(stacked.hpMult).toBeGreaterThan(1);
    expect(stacked.dmgMult).toBeGreaterThan(1);
    // The same absolute power three clears in sits ON the curve → ~neutral.
    const onCurve = balanceAdjust(1, expectedBandPower(3), 3);
    expect(onCurve.powerExcess).toBeCloseTo(1, 8);
    expect(onCurve.hpMult).toBeCloseTo(1, 8);
  });

  it('gives an under-curve band gentler slack than it answers excess', () => {
    const over = balanceAdjust(1, 1.5, 0);
    const under = balanceAdjust(1, 1 / 1.5, 0);
    expect(over.hpMult - 1).toBeGreaterThan(1 - under.hpMult);
  });

  it('hard caps hold under runaway inputs', () => {
    const wall = balanceAdjust(BALANCE_PACE_SAMPLE_MAX, 10, 0);
    expect(wall.powerExcess).toBe(BALANCE_POWER_EXCESS_MAX);
    expect(wall.hpMult).toBe(BALANCE_HP_MAX);
    expect(wall.dmgMult).toBe(BALANCE_DMG_MAX);

    const pit = balanceAdjust(BALANCE_PACE_SAMPLE_MIN, 0.1, 0);
    expect(pit.hpMult).toBe(BALANCE_HP_MIN);
    expect(pit.dmgMult).toBe(BALANCE_DMG_MIN);
  });
});

describe('balance: World integration', () => {
  const soloDragonHp = Math.round(MONSTERS.dragon.baseHp * BOSS_HP_SCALE);

  it('a world with no pace signal is fully neutral (tests, scenes, playground)', () => {
    const w = mkWorld([{}]);
    expect(w.balance).toBe(NEUTRAL_BALANCE);
    expect(w.boss?.maxHp).toBe(soloDragonHp);
  });

  it('a fresh band on pace spawns an unchanged boss', () => {
    const w = mkWorld([{}], { pace: 1 });
    expect(w.balance.hpMult).toBe(1);
    expect(w.balance.dmgMult).toBe(1);
    expect(w.boss?.maxHp).toBe(soloDragonHp);
  });

  it('a fast previous kill stiffens this boss (HP and outgoing damage)', () => {
    const w = mkWorld([{}], { pace: 1.8 });
    expect(w.balance.hpMult).toBeGreaterThan(1);
    expect(w.boss?.maxHp).toBe(
      Math.round(MONSTERS.dragon.baseHp * BOSS_HP_SCALE * w.balance.hpMult),
    );
    expect(w.bossDamageScalar()).toBeCloseTo(w.balance.dmgMult, 8);
    expect(w.boss!.maxHp).toBeGreaterThan(soloDragonHp);
  });

  it('a struggling band gets a bounded ease on the retry', () => {
    const w = mkWorld([{}], { pace: 0.7 });
    expect(w.balance.hpMult).toBeLessThan(1);
    expect(w.balance.hpMult).toBeGreaterThanOrEqual(BALANCE_HP_MIN);
    expect(w.boss!.maxHp).toBeLessThan(soloDragonHp);
  });

  it('rewards stacked past the curve toughen the boss even at pace 1', () => {
    const stacked = mkWorld([{ upgrades: ['mighty', 'mighty', 'mighty'] as UpgradeId[] }], {
      pace: 1,
    });
    expect(stacked.balance.powerExcess).toBeGreaterThan(1);
    expect(stacked.boss!.maxHp).toBeGreaterThan(soloDragonHp);
    // The same picks three encounters into a run sit ~on the tuned curve — the
    // engine compensates ESCALATION, not ordinary progression.
    const onCurve = mkWorld([{ upgrades: ['mighty', 'mighty', 'mighty'] as UpgradeId[] }], {
      pace: 1,
      runIndex: 3,
      runTotal: 5,
    });
    expect(onCurve.balance.powerExcess).toBeLessThan(stacked.balance.powerExcess);
    expect(onCurve.balance.hpMult).toBeLessThan(stacked.balance.hpMult);
  });

  it('practice worlds and menu scenes ignore the signal entirely', () => {
    const playground = mkWorld([{}], { pace: 2, practice: true });
    expect(playground.balance).toBe(NEUTRAL_BALANCE);
    expect(playground.boss?.maxHp).toBe(soloDragonHp);

    const scene = mkWorld([{}], { pace: 2, scene: 'reward' });
    expect(scene.balance).toBe(NEUTRAL_BALANCE);
    expect(scene.bosses.length).toBe(0);
  });

  it('composes with player-count and endless-cycle scaling', () => {
    const w = mkWorld([{}, { classId: 'ranger' }], { pace: 1.5, cycle: 1, runTotal: 5 });
    // n=2 → ×1.75, cycle 1 → ×1.35, then the balance hpMult on top.
    expect(w.boss?.maxHp).toBe(
      Math.round(MONSTERS.dragon.baseHp * BOSS_HP_SCALE * 1.75 * 1.35 * w.balance.hpMult),
    );
    expect(w.balance.hpMult).toBeGreaterThan(1);
  });
});
