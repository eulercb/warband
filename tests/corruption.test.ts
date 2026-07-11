/**
 * Warband — mid-fight corruption events + the pending-strike primitive
 * (world/corruption.ts + world.ts). Corruption is off unless the World is built
 * with `corruption: true`, so these tests opt in and drive the scheduler; the
 * pending-strike tests exercise the primitive directly (no flag needed).
 */
import { describe, it, expect } from 'vitest';
import { World } from '../src/engine/world/world';
import type { CorruptionKind } from '../src/engine/core/types';
import { firstCorruptionDelay } from '../src/engine/world/corruption';
import { CORRUPTION_FIRST_DELAY, CORRUPTION_INTERVAL_JITTER } from '../src/engine/core/constants';
import { buffMult } from '../src/engine/combat/combat';

// These sims run without player input; an empty input map suffices each tick.
const DT = 0.05;

function corruptWorld(seed = 5): World {
  return new World({
    monsterId: 'dragon',
    seed,
    players: [
      { peerId: 'a', name: 'A', classId: 'knight' },
      { peerId: 'b', name: 'B', classId: 'cleric' },
    ],
    corruption: true,
  });
}

describe('corruption gating', () => {
  it('is off by default and never fires without the flag', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 3,
      players: [{ peerId: 'a', name: 'A', classId: 'knight' }],
    });
    expect(w.corruptionEnabled).toBe(false);
    for (let i = 0; i < 120 && !w.finished; i++) w.step(DT, new Map());
    expect(w.pendingStrikes.length).toBe(0);
  });

  it('never runs in practice or scene worlds even if requested', () => {
    const practice = new World({
      monsterId: 'dragon',
      seed: 3,
      players: [{ peerId: 'a', name: 'A', classId: 'knight' }],
      practice: true,
      corruption: true,
    });
    expect(practice.corruptionEnabled).toBe(false);
    const scene = new World({
      monsterId: 'dragon',
      seed: 3,
      players: [{ peerId: 'a', name: 'A', classId: 'knight' }],
      scene: 'reward',
      corruption: true,
    });
    expect(scene.corruptionEnabled).toBe(false);
  });

  it('waits out a grace delay before the first beat', () => {
    const w = corruptWorld();
    expect(w.corruptionEnabled).toBe(true);
    expect(w.corruptionTimer).toBeGreaterThanOrEqual(CORRUPTION_FIRST_DELAY);
    expect(w.corruptionTimer).toBeLessThanOrEqual(
      CORRUPTION_FIRST_DELAY + CORRUPTION_INTERVAL_JITTER,
    );
    // A couple of ticks shouldn't be anywhere near the delay.
    w.step(DT, new Map());
    expect(w.events.some((e) => e.t === 'corruption')).toBe(false);
  });

  it('firstCorruptionDelay stays within the grace band', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const w = corruptWorld(seed);
      const d = firstCorruptionDelay(w);
      expect(d).toBeGreaterThanOrEqual(CORRUPTION_FIRST_DELAY);
      expect(d).toBeLessThanOrEqual(CORRUPTION_FIRST_DELAY + CORRUPTION_INTERVAL_JITTER);
    }
  });
});

describe('corruption scheduler', () => {
  it('fires a beat when the timer elapses, then reschedules', () => {
    const w = corruptWorld(11);
    w.corruptionTimer = 0.01;
    w.step(DT, new Map());
    expect(w.events.some((e) => e.t === 'corruption')).toBe(true);
    expect(w.corruptionCount).toBe(1);
    expect(w.corruptionTimer).toBeGreaterThan(0); // rescheduled
  });

  it('a beat always produces some in-world effect', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const w = corruptWorld(seed);
      const strikes0 = w.pendingStrikes.length;
      const adds0 = w.adds.length;
      const zones0 = w.groundZones.length;
      w.corruptionTimer = 0.01;
      w.step(DT, new Map());
      const surged = w.bosses.some((b) => buffMult(b, 'damageDealt') > 1);
      const changed =
        w.pendingStrikes.length > strikes0 ||
        w.adds.length > adds0 ||
        w.groundZones.length > zones0 ||
        surged;
      expect(changed).toBe(true);
    }
  });

  it('the beat table is fully reachable across seeds (incl. the reward beat)', () => {
    const seen = new Set<CorruptionKind>();
    for (let seed = 1; seed <= 200; seed++) {
      const w = corruptWorld(seed);
      w.corruptionTimer = 0.01;
      w.step(DT, new Map());
      for (const e of w.events) {
        if (e.t === 'corruption') {
          seen.add(e.kind);
          if (e.kind === 'healingRift') expect(e.good).toBe(true);
        }
      }
    }
    for (const kind of [
      'enrageSurge',
      'telegraphRain',
      'healingRift',
      'addSwarm',
      'ventEruption',
      'collapsingArena',
    ] as CorruptionKind[]) {
      expect(seen.has(kind)).toBe(true);
    }
  });

  it('does not fire once every boss is dead', () => {
    const w = corruptWorld(2);
    w.corruptionTimer = 0.01;
    for (const b of w.bosses) b.hp = 0;
    w.step(DT, new Map());
    expect(w.events.some((e) => e.t === 'corruption')).toBe(false);
  });
});

describe('pending strikes', () => {
  function plainWorld(): World {
    return new World({
      monsterId: 'dragon',
      seed: 1,
      players: [{ peerId: 'a', name: 'A', classId: 'knight' }],
    });
  }

  it('detonate after their fuse, damaging heroes inside, then vanish', () => {
    const w = plainWorld();
    w.players[0].pos = { x: 500, y: 500 };
    w.addPendingStrike({ pos: { x: 500, y: 500 }, radius: 120, fuse: 0.05, damage: 30 });
    const hp0 = w.players[0].hp;
    w.step(DT, new Map());
    expect(w.players[0].hp).toBeLessThan(hp0);
    expect(w.pendingStrikes.length).toBe(0);
  });

  it('can leave a lingering hazard pool on detonation (vents)', () => {
    const w = plainWorld();
    w.addPendingStrike({
      pos: { x: 500, y: 500 },
      radius: 90,
      fuse: 0.05,
      damage: 0,
      leaveZone: { kind: 'voidZone', duration: 5, tickDamage: 10 },
    });
    w.step(DT, new Map());
    expect(w.groundZones.some((z) => z.side === 'boss')).toBe(true);
  });

  it('serialize as circle telegraphs so clients can dodge them', () => {
    const w = plainWorld();
    w.addPendingStrike({ pos: { x: 400, y: 400 }, radius: 90, fuse: 1.5, damage: 30 });
    const snap = w.serialize();
    expect(snap.telegraphs?.length).toBe(1);
    expect(snap.telegraphs?.[0].kind).toBe('circle');
    expect(snap.telegraphs?.[0].radius).toBe(90);
    // A world with nothing pending omits the channel entirely.
    expect(plainWorld().serialize().telegraphs).toBeUndefined();
  });
});
