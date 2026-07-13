/**
 * Hardcore mode (item 11): a deadlier run. Corruption opens sooner and comes
 * faster, revives are limited per fight, and a real kill-DEADLINE wipes the band
 * to defeat if the boss isn't down in time. All host-authoritative World
 * behaviour, so we drive a real World.
 */
import { describe, it, expect } from 'vitest';
import { World } from '../src/engine/world/world';
import { firstCorruptionDelay } from '../src/engine/world/corruption';
import {
  HARDCORE_CORRUPTION_MULT,
  HARDCORE_REVIVES_PER_FIGHT,
  HARDCORE_TIME_BUDGET,
  HARDCORE_DEADLINE_MULT,
  REVIVE_TIME,
  DOWNED_BLEEDOUT,
  SIM_DT,
} from '../src/engine/core/constants';
import type { InputCommand } from '../src/engine/core/types';

/** A one-player hardcore World on `dragon` (the balance-reference boss). */
function hcWorld(seed = 9, hardcore = true): World {
  return new World({
    monsterId: 'dragon',
    seed,
    players: [{ peerId: 'a', name: 'A', classId: 'knight' }],
    hardcore,
  });
}

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
    const std = new World({
      monsterId: 'dragon',
      seed: 7,
      players: [{ peerId: 'a', name: 'A', classId: 'knight' }],
      corruption: true,
    });
    const hc = new World({
      monsterId: 'dragon',
      seed: 7,
      players: [{ peerId: 'a', name: 'A', classId: 'knight' }],
      corruption: true,
      hardcore: true,
    });
    // Both consumed the same seeded draw for the base delay; hardcore scales it down.
    expect(hc.corruptionTimer).toBeLessThan(std.corruptionTimer);
    expect(hc.corruptionTimer).toBeCloseTo(std.corruptionTimer * HARDCORE_CORRUPTION_MULT, 5);
  });

  it('firstCorruptionDelay honours the hardcore flag', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 3,
      players: [{ peerId: 'a', name: 'A', classId: 'knight' }],
      corruption: true,
      hardcore: true,
    });
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
      const isAlive = (): boolean => w.players[0].state === 'alive';
      for (let i = 0; i < ticks; i++) {
        medic.pos = { ...downed.pos };
        w.step(SIM_DT, inputs);
        if (isAlive()) return true;
      }
      return isAlive();
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
    const w = new World({
      monsterId: 'dragon',
      seed: 5,
      players: [{ peerId: 'a', name: 'A', classId: 'knight' }],
    });
    expect(w.reviveBudget).toBe(Infinity);
  });
});

describe('hardcore kill-deadline', () => {
  it('fixes a finite deadline at spawn (multiple of the expected kill budget)', () => {
    const w = hcWorld();
    expect(Number.isFinite(w.hardcoreDeadline)).toBe(true);
    // A lone boss ⇒ budget × the base multiplier.
    expect(w.hardcoreDeadline).toBeCloseTo(HARDCORE_TIME_BUDGET * HARDCORE_DEADLINE_MULT, 5);
    // The countdown starts at the full deadline and clamps at 0.
    expect(w.deadlineRemaining()).toBeCloseTo(w.hardcoreDeadline, 5);
  });

  it('opens a closing chasm that devours the band when the deadline passes (items 21/27)', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 9,
      players: [
        { peerId: 'a', name: 'A', classId: 'knight' },
        { peerId: 'b', name: 'B', classId: 'cleric' },
      ],
      hardcore: true,
    });
    expect(w.boss!.hp).toBeGreaterThan(0);
    expect(w.finished).toBe(false);

    // Cross the deadline: the Abyss opens (a warning banner) — but the band is NOT
    // instantly wiped; the chasm now has to close in on them.
    w.elapsed = w.hardcoreDeadline - SIM_DT / 2;
    w.step(SIM_DT, new Map());
    expect(w.events.some((e) => e.t === 'deadlineWarn')).toBe(true);
    expect(w.finished).toBe(false);

    // Let the ring close over the next several seconds — it eventually swallows the
    // whole band, ending the run as a defeat with the classic time's-up cue.
    let sawDeadline = false;
    for (let i = 0; i < 600 && !w.finished; i++) {
      w.step(SIM_DT, new Map());
      if (w.events.some((e) => e.t === 'deadline')) sawDeadline = true;
    }
    expect(w.finished).toBe(true);
    expect(w.outcome).toBe('defeat');
    expect(w.result().outcome).toBe('defeat');
    expect(w.players.every((p) => p.state === 'dead')).toBe(true);
    expect(sawDeadline).toBe(true);
  });

  it('warns the band at 30 / 15 / 5s before the deadline instead of a ticking timer (item 24)', () => {
    const w = hcWorld();
    const marks: number[] = [];
    // Sample near each warning threshold and collect the spoken-banner texts.
    for (const mark of [30, 15, 5]) {
      w.elapsed = w.hardcoreDeadline - mark - SIM_DT; // a hair before the mark…
      w.step(SIM_DT, new Map()); // …this tick crosses it
      for (const e of w.events) if (e.t === 'deadlineWarn') marks.push(mark);
    }
    // All three warnings fired, once each.
    expect(marks).toEqual([30, 15, 5]);
  });

  it('does NOT fail the fight one tick before the deadline', () => {
    const w = hcWorld();
    // Land just shy of the wall — the fight is still live after a tick.
    w.elapsed = w.hardcoreDeadline - SIM_DT * 3;
    w.step(SIM_DT, new Map());
    expect(w.finished).toBe(false);
    expect(w.outcome).toBeNull();
  });

  it('a kill landing on the deadline tick still wins (victory checked first)', () => {
    const w = hcWorld(2);
    w.elapsed = w.hardcoreDeadline; // exactly at the wall…
    for (const b of w.bosses) b.hp = 0; // …but the boss just fell
    w.step(SIM_DT, new Map());
    expect(w.outcome).toBe('victory');
  });

  it('a shared-arena pack earns a longer deadline than a lone boss', () => {
    const solo = hcWorld(1);
    const twin = new World({
      monsterId: 'dragon',
      coBosses: ['dragon'],
      seed: 1,
      players: [{ peerId: 'a', name: 'A', classId: 'knight' }],
      hardcore: true,
    });
    expect(twin.bosses.length).toBe(2);
    expect(twin.hardcoreDeadline).toBeGreaterThan(solo.hardcoreDeadline);
  });

  it('a standard (non-hardcore) fight has no deadline and never times out', () => {
    const w = hcWorld(9, false);
    expect(w.hardcoreDeadline).toBe(Infinity);
    expect(w.deadlineRemaining()).toBe(Infinity);
    // Far beyond any hardcore deadline, a standard fight simply keeps going.
    w.elapsed = 100_000;
    w.step(SIM_DT, new Map());
    expect(w.finished).toBe(false);
    expect(w.outcome).toBeNull();
  });

  it('ships the countdown in a hardcore snapshot and nothing in a standard one', () => {
    const hc = hcWorld(4);
    const std = hcWorld(4, false);
    // Present + full at spawn for hardcore; absent for a standard fight.
    expect(hc.serialize().deadlineRemaining).toBeCloseTo(hc.hardcoreDeadline, 5);
    expect(std.serialize().deadlineRemaining).toBeUndefined();
    // It counts down as the fight runs, and reaches the render state the HUD reads.
    hc.step(SIM_DT, new Map());
    expect(hc.serialize().deadlineRemaining!).toBeLessThan(hc.hardcoreDeadline);
    expect(hc.toRenderState(null).deadlineRemaining!).toBeGreaterThan(0);
    expect(std.toRenderState(null).deadlineRemaining).toBeUndefined();
  });
});
