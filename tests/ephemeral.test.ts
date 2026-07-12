/**
 * Ephemeral coin shop (item 21) — host-authoritative World behaviour + the pure
 * coin/def helpers. Passive perks fold into stats at spawn, the item button
 * quaffs a healing vial, a Phoenix charm auto-revives once, and a boss clear
 * pays out coins ranked by performance.
 */
import { describe, it, expect } from 'vitest';
import { World } from '../src/engine/world/world';
import { SIM_DT } from '../src/engine/core/constants';
import { getClass } from '../src/engine/content/classes';
import {
  EPHEMERAL,
  coinsForRank,
  isEphemeralId,
  COIN_BY_RANK,
} from '../src/engine/content/ephemeral';
import type { InputCommand } from '../src/engine/core/types';

function input(over: Partial<InputCommand['buttons']>): InputCommand {
  return {
    seq: 1,
    move: { x: 0, y: 0 },
    aim: { x: 0, y: -1 },
    buttons: { basic: false, a1: false, a2: false, a3: false, revive: false, ...over },
  };
}

describe('ephemeral perks — spawn folding', () => {
  it('passive perks fold into the stat multipliers at spawn', () => {
    const base = getClass('knight');
    const w = new World({
      monsterId: 'dragon',
      seed: 1,
      players: [
        {
          peerId: 'a',
          name: 'A',
          classId: 'knight',
          ephemeral: { speed: true, damage: true, defense: true, potions: 2, revives: 1 },
        },
      ],
    });
    const p = w.players[0];
    expect(p.moveSpeed).toBeGreaterThan(base.moveSpeed); // Swiftness Draught
    expect(p.damageMult).toBeCloseTo(1.25); // Fury Elixir
    expect(p.damageTakenMult).toBeCloseTo(0.75); // Stoneskin Tonic
    expect(p.potions).toBe(2);
    expect(p.selfRevives).toBe(1);
  });

  it('a hero with no purchases carries no ephemeral resources', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 1,
      players: [{ peerId: 'a', name: 'A', classId: 'knight' }],
    });
    const p = w.players[0];
    expect(p.potions).toBeUndefined();
    expect(p.selfRevives).toBeUndefined();
    expect(p.damageMult).toBe(1);
  });
});

describe('ephemeral perks — in-fight resources', () => {
  it('the item button quaffs a healing vial and consumes a charge', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 2,
      players: [{ peerId: 'a', name: 'A', classId: 'knight', ephemeral: { potions: 1 } }],
    });
    const p = w.players[0];
    p.hp = 1; // hurt, so the vial isn't wasted
    w.step(SIM_DT, new Map([['a', input({ item: true })]]));
    expect(p.potions).toBe(0);
    expect(p.hp).toBeGreaterThan(1);
  });

  it('a healing vial is not wasted at full health', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 2,
      players: [{ peerId: 'a', name: 'A', classId: 'knight', ephemeral: { potions: 1 } }],
    });
    const p = w.players[0];
    w.step(SIM_DT, new Map([['a', input({ item: true })]]));
    expect(p.potions).toBe(1); // still full — no charge spent
  });

  it('a Phoenix charm auto-revives once instead of falling', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 3,
      players: [{ peerId: 'a', name: 'A', classId: 'knight', ephemeral: { revives: 1 } }],
    });
    const p = w.players[0];
    p.hp = -5; // lethal
    w.step(SIM_DT, new Map([['a', input({})]]));
    expect(p.state).toBe('alive'); // sprang back up
    expect(p.selfRevives).toBe(0); // charge spent
    expect(p.hp).toBeGreaterThan(0);
    // A second lethal blow with no charge left downs them for real.
    p.hp = -5;
    w.step(SIM_DT, new Map([['a', input({})]]));
    expect(w.players[0].state).toBe('downed');
  });
});

describe('ephemeral coins — ranked payout', () => {
  it('coinsForRank pays the leader most and the tail nothing', () => {
    expect(coinsForRank(0)).toBe(COIN_BY_RANK[0]);
    expect(coinsForRank(3)).toBe(0);
    expect(coinsForRank(99)).toBe(0); // clamps past the band
  });

  it('coinsForRank floors a negative rank to zero (the ?? 0 guard)', () => {
    // A stray negative rank indexes off the front of COIN_BY_RANK → undefined,
    // which the `?? 0` fallback turns into a safe zero payout.
    expect(coinsForRank(-1)).toBe(0);
    expect(coinsForRank(-10)).toBe(0);
  });

  it('a victory ranks coins by participation score', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 4,
      players: [
        { peerId: 'a', name: 'A', classId: 'knight' },
        { peerId: 'b', name: 'B', classId: 'mage' },
      ],
    });
    // Force a clean ranking: A out-scores B.
    w.players[0].stats.damageDealt = 1000;
    w.players[1].stats.damageDealt = 10;
    w.forceFinish('victory');
    const res = w.result();
    const a = res.stats.find((s) => s.peerId === 'a')!;
    const b = res.stats.find((s) => s.peerId === 'b')!;
    expect(a.coins).toBe(coinsForRank(0));
    expect(b.coins).toBe(coinsForRank(1));
  });

  it('a defeat pays no coins', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 4,
      players: [{ peerId: 'a', name: 'A', classId: 'knight' }],
    });
    w.players[0].stats.damageDealt = 1000;
    w.forceFinish('defeat');
    expect(w.result().stats[0].coins).toBe(0);
  });
});

describe('ephemeral defs', () => {
  it('isEphemeralId accepts real ids and rejects junk', () => {
    expect(isEphemeralId('potion')).toBe(true);
    expect(isEphemeralId('retry')).toBe(true);
    expect(isEphemeralId('nonsense')).toBe(false);
    expect(isEphemeralId(42)).toBe(false);
  });

  it('the Second Chance is hardcore-only, others are not', () => {
    expect(EPHEMERAL.retry.hardcoreOnly).toBe(true);
    expect(EPHEMERAL.potion.hardcoreOnly).toBeUndefined();
  });
});
