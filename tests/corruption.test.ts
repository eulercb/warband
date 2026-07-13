/**
 * Warband — mid-fight corruption events + the pending-strike primitive
 * (world/corruption.ts + world.ts). Corruption is off unless the World is built
 * with `corruption: true`, so these tests opt in and drive the scheduler; the
 * pending-strike tests exercise the primitive directly (no flag needed).
 */
import { describe, it, expect } from 'vitest';
import { World } from '../src/engine/world/world';
import type { CorruptionKind } from '../src/engine/core/types';
import { firstCorruptionDelay, stepCorruption } from '../src/engine/world/corruption';
import type { Rng } from '../src/engine/core/math';
import {
  CORRUPTION_FIRST_DELAY,
  CORRUPTION_INTERVAL_JITTER,
  CORRUPTION_RAIN_COUNT,
  ARENA_W,
  ARENA_H,
  HARDCORE_TIME_BUDGET,
  HARDCORE_MIN_INTERVAL,
} from '../src/engine/core/constants';
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

  it('pickKind falls back to the last beat when the weighted roll overshoots (line 143)', () => {
    // pickKind normally returns as soon as its running roll crosses 0. With an rng
    // whose range() overshoots the weight total, the roll never crosses 0, so the
    // loop runs off the end to its defensive `return src[src.length - 1]`. A real
    // seeded Rng (range ∈ [0,total)) can never reach it, so we prove it by swapping
    // in an rng stand-in (as monsters.test.ts does with its stub rng).
    const w = corruptWorld(3);
    w.rng = {
      range: (): number => 1e9,
      next: (): number => 0,
      int: (): number => 0,
      pick: <T>(a: T[]): T => a[0],
    } as unknown as Rng;
    w.corruptionTimer = 0.01;
    stepCorruption(w, DT);
    const ev = w.events.find((e) => e.t === 'corruption');
    if (ev?.t !== 'corruption') throw new Error('expected a corruption beat to fire');
    // The fallback yields the LAST entry of the beat table — the healing rift.
    expect(ev.kind).toBe('healingRift');
    expect(w.corruptionCount).toBe(1);
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

describe('corruption: hardcore cadence + party-wipe placement', () => {
  function hardcoreWorld(seed = 5): World {
    return new World({
      monsterId: 'dragon',
      seed,
      players: [
        { peerId: 'a', name: 'A', classId: 'knight' },
        { peerId: 'b', name: 'B', classId: 'cleric' },
      ],
      corruption: true,
      hardcore: true,
    });
  }

  it('floors the reschedule interval once a hardcore fight drags past its budget', () => {
    const w = hardcoreWorld(9);
    expect(w.hardcore).toBe(true);
    // Push far past the time budget so the acceleration ramp collapses toward
    // zero and the hardcore branch clamps the next beat to its hard floor.
    w.elapsed = HARDCORE_TIME_BUDGET + 1e7;
    w.corruptionTimer = 0.01;
    w.step(DT, new Map());
    expect(w.corruptionTimer).toBeCloseTo(HARDCORE_MIN_INTERVAL);
  });

  it('never rolls the benevolent healing rift in a hardcore run', () => {
    const seen = new Set<CorruptionKind>();
    for (let seed = 1; seed <= 120; seed++) {
      const w = hardcoreWorld(seed);
      w.corruptionTimer = 0.01;
      w.step(DT, new Map());
      for (const e of w.events) if (e.t === 'corruption') seen.add(e.kind);
    }
    expect(seen.size).toBeGreaterThan(1); // beats really did fire
    expect(seen.has('healingRift')).toBe(false); // the good beat is filtered out
  });

  it('centres a beat on the arena when the whole party is down', () => {
    const w = corruptWorld(7);
    for (const p of w.players) {
      p.hp = 0;
      p.state = 'dead';
    }
    w.corruptionTimer = 0.01;
    w.step(DT, new Map());
    const ev = w.events.find((e) => e.t === 'corruption');
    if (ev?.t !== 'corruption') throw new Error('expected a corruption beat to fire');
    // partyCentroid found no living heroes and fell back to the arena centre.
    expect(ev.pos.x).toBeCloseTo(ARENA_W / 2);
    expect(ev.pos.y).toBeCloseTo(ARENA_H / 2);
  });

  it('rains telegraphs on the arena centre when the whole party is down', () => {
    let covered = false;
    for (let seed = 1; seed <= 400 && !covered; seed++) {
      const w = corruptWorld(seed);
      w.terrain = []; // isolate: only corruption can add pending strikes now
      for (const p of w.players) {
        p.hp = 0;
        p.state = 'dead';
      }
      w.corruptionTimer = 0.01;
      w.step(DT, new Map());
      if (!w.events.some((e) => e.t === 'corruption' && e.kind === 'telegraphRain')) continue;
      // nearParty saw zero living heroes, so every strike lands on the exact centre.
      expect(w.pendingStrikes.length).toBe(CORRUPTION_RAIN_COUNT);
      for (const s of w.pendingStrikes) {
        expect(s.pos.x).toBeCloseTo(ARENA_W / 2);
        expect(s.pos.y).toBeCloseTo(ARENA_H / 2);
      }
      covered = true;
    }
    expect(covered).toBe(true);
  });

  // corruption.ts:136 `pool.length > 0 ? pool : table` — the `: table` fallback is
  // unreachable: `pool` removes only the single last-fired kind from a table of
  // >=5 distinct kinds, so it can never be emptied. Left as defensive code.
});
