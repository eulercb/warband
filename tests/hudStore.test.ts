import { describe, it, expect, beforeEach } from 'vitest';
import { useHudStore, hudSet } from '../src/ui/hudStore';
import type { HudBoss, HudTeammate } from '../src/ui/hudStore';
import type { BuffView } from '../src/engine/types';

// The HUD store is a module-level singleton, so reset it to the documented
// defaults before each test to keep the specs independent.
beforeEach(() => useHudStore.getState().resetHud());

describe('hudStore: defaults', () => {
  it('exposes the documented HUD defaults', () => {
    const s = useHudStore.getState();
    expect(s.active).toBe(false);
    expect(s.classId).toBeNull();
    expect(s.hp).toBe(0);
    expect(s.maxHp).toBe(1);
    expect(s.state).toBe('alive');
    expect(s.cooldowns).toEqual({ basic: 0, a1: 0, a2: 0, a3: 0 });
    expect(s.casting).toBe(false);
    expect(s.inputSource).toBe('keyboard');
    expect(s.buffs).toEqual([]);
    expect(s.score).toBe(0);
    expect(s.bosses).toEqual([]);
    expect(s.teammates).toEqual([]);
    expect(s.terrainKinds).toEqual([]);
    expect(s.hasObstacles).toBe(false);
    expect(s.reviveProgress).toBe(0);
    expect(s.downedTimer).toBe(0);
  });

  it('exposes the store actions', () => {
    const s = useHudStore.getState();
    expect(typeof s.set).toBe('function');
    expect(typeof s.resetHud).toBe('function');
  });
});

describe('hudStore: set', () => {
  it('applies a partial patch and leaves untouched fields alone', () => {
    useHudStore.getState().set({ active: true, hp: 50, maxHp: 100, classId: 'mage' });
    const s = useHudStore.getState();
    expect(s.active).toBe(true);
    expect(s.hp).toBe(50);
    expect(s.maxHp).toBe(100);
    expect(s.classId).toBe('mage');
    // fields not in the patch keep their defaults
    expect(s.casting).toBe(false);
    expect(s.score).toBe(0);
    expect(s.state).toBe('alive');
    expect(s.cooldowns).toEqual({ basic: 0, a1: 0, a2: 0, a3: 0 });
  });

  it('merges successive patches (later sets do not clear earlier fields)', () => {
    useHudStore.getState().set({ hp: 10 });
    useHudStore.getState().set({ score: 5 });
    useHudStore.getState().set({ casting: true });
    const s = useHudStore.getState();
    expect(s.hp).toBe(10);
    expect(s.score).toBe(5);
    expect(s.casting).toBe(true);
  });

  it('stores rich HUD collections (bosses, teammates, buffs, cooldowns)', () => {
    const buffs: BuffView[] = [{ kind: 'moveSpeed', remaining: 2, mult: 0.5 }];
    const boss: HudBoss = {
      id: 1,
      name: 'Dragon',
      hp: 100,
      maxHp: 200,
      phase: 'enraged',
      buffs: [],
      modName: 'Frost',
    };
    const teammate: HudTeammate = {
      id: 2,
      name: 'Aria',
      classId: 'ranger',
      hp: 80,
      maxHp: 130,
      state: 'alive',
      isLocal: true,
      buffs,
      score: 500,
    };
    useHudStore.getState().set({
      bosses: [boss],
      teammates: [teammate],
      buffs,
      cooldowns: { basic: 1.5, a1: 0, a2: 3, a3: 0 },
      terrainKinds: ['magma', 'ice'],
      hasObstacles: true,
      reviveProgress: 0.5,
      downedTimer: 12,
      inputSource: 'gamepad',
      state: 'downed',
    });
    const s = useHudStore.getState();
    expect(s.bosses).toHaveLength(1);
    expect(s.bosses[0]).toEqual(boss);
    expect(s.teammates[0].isLocal).toBe(true);
    // reference is stored as-is (hot path avoids cloning)
    expect(s.teammates[0].buffs).toBe(buffs);
    expect(s.buffs).toBe(buffs);
    expect(s.cooldowns.a2).toBe(3);
    expect(s.terrainKinds).toEqual(['magma', 'ice']);
    expect(s.hasObstacles).toBe(true);
    expect(s.reviveProgress).toBeCloseTo(0.5);
    expect(s.downedTimer).toBe(12);
    expect(s.inputSource).toBe('gamepad');
    expect(s.state).toBe('downed');
  });
});

describe('hudStore: hudSet (non-reactive setter)', () => {
  it('routes a patch through the store state', () => {
    hudSet({ hp: 42, inputSource: 'gamepad', casting: true });
    const s = useHudStore.getState();
    expect(s.hp).toBe(42);
    expect(s.inputSource).toBe('gamepad');
    expect(s.casting).toBe(true);
  });

  it('is equivalent to getState().set', () => {
    hudSet({ score: 7 });
    expect(useHudStore.getState().score).toBe(7);
    useHudStore.getState().set({ score: 9 });
    expect(useHudStore.getState().score).toBe(9);
  });
});

describe('hudStore: subscriptions', () => {
  it('notifies subscribers with the next and previous state on set', () => {
    const calls: Array<{ active: boolean; prevActive: boolean }> = [];
    const unsub = useHudStore.subscribe((state, prev) => {
      calls.push({ active: state.active, prevActive: prev.active });
    });
    useHudStore.getState().set({ active: true });
    unsub();

    expect(calls).toHaveLength(1);
    expect(calls[0].active).toBe(true);
    expect(calls[0].prevActive).toBe(false);

    // after unsubscribe, further sets are not observed
    useHudStore.getState().set({ active: false });
    expect(calls).toHaveLength(1);
  });

  it('fires subscribers for hudSet too', () => {
    let count = 0;
    const unsub = useHudStore.subscribe(() => {
      count++;
    });
    hudSet({ hp: 5 });
    hudSet({ hp: 6 });
    unsub();
    expect(count).toBe(2);
  });

  it('fires subscribers on resetHud', () => {
    useHudStore.getState().set({ active: true, hp: 100 });
    let seen: boolean | null = null;
    const unsub = useHudStore.subscribe((state) => {
      seen = state.active;
    });
    useHudStore.getState().resetHud();
    unsub();
    expect(seen).toBe(false);
  });
});

describe('hudStore: resetHud', () => {
  it('restores every field to its default after heavy mutation', () => {
    useHudStore.getState().set({
      active: true,
      classId: 'knight',
      hp: 99,
      maxHp: 240,
      state: 'downed',
      cooldowns: { basic: 5, a1: 5, a2: 5, a3: 5 },
      casting: true,
      inputSource: 'gamepad',
      buffs: [{ kind: 'stun', remaining: 1, mult: 0 }],
      score: 1234,
      bosses: [{ id: 1, name: 'X', hp: 1, maxHp: 2, phase: 'normal', buffs: [], modName: '' }],
      teammates: [
        {
          id: 2,
          name: 'Y',
          classId: 'mage',
          hp: 1,
          maxHp: 2,
          state: 'alive',
          isLocal: false,
          buffs: [],
          score: 0,
        },
      ],
      terrainKinds: ['swamp'],
      hasObstacles: true,
      reviveProgress: 0.9,
      downedTimer: 7,
    });

    useHudStore.getState().resetHud();

    const s = useHudStore.getState();
    expect(s.active).toBe(false);
    expect(s.classId).toBeNull();
    expect(s.hp).toBe(0);
    expect(s.maxHp).toBe(1);
    expect(s.state).toBe('alive');
    expect(s.cooldowns).toEqual({ basic: 0, a1: 0, a2: 0, a3: 0 });
    expect(s.casting).toBe(false);
    expect(s.inputSource).toBe('keyboard');
    expect(s.buffs).toEqual([]);
    expect(s.score).toBe(0);
    expect(s.bosses).toEqual([]);
    expect(s.teammates).toEqual([]);
    expect(s.terrainKinds).toEqual([]);
    expect(s.hasObstacles).toBe(false);
    expect(s.reviveProgress).toBe(0);
    expect(s.downedTimer).toBe(0);
    // the actions survive the reset (they are not part of INITIAL)
    expect(typeof s.set).toBe('function');
    expect(typeof s.resetHud).toBe('function');
  });
});
