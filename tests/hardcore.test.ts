/**
 * Hardcore mode (item 11): a deadlier run. Corruption opens sooner and comes
 * faster, and revives are limited per fight. Both are host-authoritative World
 * behaviour, so we drive a real World.
 */
import { describe, it, expect } from 'vitest';
import { World } from '../src/engine/world/world';
import { firstCorruptionDelay } from '../src/engine/world/corruption';
import {
  HARDCORE_CORRUPTION_MULT,
  HARDCORE_REVIVES_PER_FIGHT,
  REVIVE_TIME,
  DOWNED_BLEEDOUT,
  SIM_DT,
} from '../src/engine/core/constants';
import type { InputCommand } from '../src/engine/core/types';

function reviveInput(): InputCommand {
  return {
    seq: 0,
    move: { x: 0, y: 0 },
    aim: { x: 0, y: -1 },
    buttons: { basic: false, a1: false, a2: false, a3: false, revive: true },
  };
}

describe('hardcore corruption cadence', () => {
  it('opens the corruption clock sooner than a standard run (same seed)', () => {
    const std = new World({ monsterId: 'dragon', seed: 7, players: [{ peerId: 'a', name: 'A', classId: 'knight' }], corruption: true });
    const hc = new World({ monsterId: 'dragon', seed: 7, players: [{ peerId: 'a', name: 'A', classId: 'knight' }], corruption: true, hardcore: true });
    // Both consumed the same seeded draw for the base delay; hardcore scales it down.
    expect(hc.corruptionTimer).toBeLessThan(std.corruptionTimer);
    expect(hc.corruptionTimer).toBeCloseTo(std.corruptionTimer * HARDCORE_CORRUPTION_MULT, 5);
  });

  it('firstCorruptionDelay honours the hardcore flag', () => {
    const w = new World({ monsterId: 'dragon', seed: 3, players: [{ peerId: 'a', name: 'A', classId: 'knight' }], corruption: true, hardcore: true });
    expect(firstCorruptionDelay(w)).toBeGreaterThan(0);
  });
});

describe('hardcore revive budget', () => {
  it('limits revives per fight, then a downed hero can no longer be brought back', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 5,
      players: [
        { peerId: 'down', name: 'D', classId: 'knight' },
        { peerId: 'medic', name: 'M', classId: 'cleric' },
      ],
      hardcore: true,
    });
    expect(w.reviveBudget).toBe(HARDCORE_REVIVES_PER_FIGHT);
    const downed = w.players[0];
    const medic = w.players[1];
    const inputs = new Map<string, InputCommand>([['medic', reviveInput()]]);

    const reviveOnce = (): boolean => {
      downed.state = 'downed';
      downed.hp = 0;
      downed.reviveProgress = 0;
      downed.downedTimer = DOWNED_BLEEDOUT; // fresh bleedout, so it doesn't die first
      // Stand the medic right on the downed hero so it's always in revive range.
      medic.pos = { ...downed.pos };
      const ticks = Math.ceil(REVIVE_TIME / SIM_DT) + 4;
      for (let i = 0; i < ticks; i++) {
        medic.pos = { ...downed.pos };
        w.step(SIM_DT, inputs);
        if (downed.state === 'alive') return true;
      }
      return downed.state === 'alive';
    };

    // The first HARDCORE_REVIVES_PER_FIGHT revives succeed and drain the stock.
    for (let i = 0; i < HARDCORE_REVIVES_PER_FIGHT; i++) {
      expect(reviveOnce()).toBe(true);
    }
    expect(w.reviveBudget).toBeLessThanOrEqual(0);
    // The next down cannot be revived — the stock is spent.
    expect(reviveOnce()).toBe(false);
  });

  it('a standard run has an unlimited (Infinity) revive budget', () => {
    const w = new World({ monsterId: 'dragon', seed: 5, players: [{ peerId: 'a', name: 'A', classId: 'knight' }] });
    expect(w.reviveBudget).toBe(Infinity);
  });
});
