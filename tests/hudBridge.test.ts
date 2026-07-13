import { describe, it, expect, beforeEach } from 'vitest';
import { pushHud } from '../src/ui/state/hudBridge';
import { useHudStore } from '../src/ui/state/hudStore';
import { DEFAULT_MONSTER, getMonster } from '../src/engine/content/monsters';
import { REVIVE_TIME } from '../src/engine/core/constants';
import type { RenderState, PlayerView, BossView } from '../src/engine/core/types';

function player(over: Partial<PlayerView>): PlayerView {
  return {
    id: 1,
    name: 'Hero',
    classId: 'knight',
    pos: { x: 0, y: 0 },
    hp: 100,
    maxHp: 100,
    state: 'alive',
    cooldowns: { basic: 0, a1: 0, a2: 0, a3: 0 },
    castTimer: 0,
    buffs: [],
    score: 0,
    reviveProgress: 0,
    downedTimer: 0,
    ...over,
  } as PlayerView;
}

function boss(over: Partial<BossView>): BossView {
  return {
    id: 100,
    monsterId: DEFAULT_MONSTER,
    pos: { x: 0, y: 0 },
    hp: 500,
    maxHp: 1000,
    phase: 1,
    buffs: [],
    ...over,
  } as BossView;
}

function renderState(over: Partial<RenderState>): RenderState {
  return {
    localPlayerId: 1,
    players: [player({ id: 1 })],
    bosses: [boss({})],
    ...over,
  } as RenderState;
}

beforeEach(() => {
  useHudStore.getState().resetHud?.();
});

describe('pushHud', () => {
  it('mirrors the local player vitals into the hud store', () => {
    pushHud(
      renderState({
        players: [player({ id: 1, hp: 42, maxHp: 80, classId: 'mage', score: 7 })],
      }),
      'keyboard',
    );
    const h = useHudStore.getState();
    expect(h.active).toBe(true);
    expect(h.hp).toBe(42);
    expect(h.maxHp).toBe(80);
    expect(h.classId).toBe('mage');
    expect(h.score).toBe(7);
    expect(h.inputSource).toBe('keyboard');
  });

  it('names each boss via the monster catalog', () => {
    pushHud(renderState({ bosses: [boss({ monsterId: DEFAULT_MONSTER, hp: 250 })] }), 'gamepad');
    const h = useHudStore.getState();
    expect(h.bosses).toHaveLength(1);
    expect(h.bosses[0].name).toBe(getMonster(DEFAULT_MONSTER).name);
    expect(h.bosses[0].hp).toBe(250);
  });

  it('maps the whole roster as teammates, flagging the local player', () => {
    pushHud(
      renderState({
        localPlayerId: 2,
        players: [player({ id: 1, name: 'A' }), player({ id: 2, name: 'B' })],
      }),
      'keyboard',
    );
    const h = useHudStore.getState();
    expect(h.teammates.map((t) => t.name)).toEqual(['A', 'B']);
    expect(h.teammates.find((t) => t.id === 2)?.isLocal).toBe(true);
    expect(h.teammates.find((t) => t.id === 1)?.isLocal).toBe(false);
  });

  it('reports revive progress as a 0..1 fraction only while downed', () => {
    pushHud(
      renderState({
        players: [player({ id: 1, state: 'downed', reviveProgress: REVIVE_TIME / 2 })],
      }),
      'keyboard',
    );
    expect(useHudStore.getState().reviveProgress).toBeCloseTo(0.5);

    pushHud(
      renderState({ players: [player({ id: 1, state: 'alive', reviveProgress: 5 })] }),
      'keyboard',
    );
    expect(useHudStore.getState().reviveProgress).toBe(0);
  });

  it('falls back to safe defaults when there is no local player', () => {
    pushHud(renderState({ localPlayerId: null, players: [] }), 'keyboard');
    const h = useHudStore.getState();
    expect(h.hp).toBe(0);
    expect(h.maxHp).toBe(1);
    expect(h.classId).toBeNull();
    expect(h.state).toBe('dead');
  });

  it('falls back to safe defaults when the local id names no present player', () => {
    // localId is set (not null) but no player carries it -> find() returns undefined
    // and the `?? null` on line 13 makes lp null (a different branch from localId==null).
    pushHud(renderState({ localPlayerId: 5, players: [player({ id: 1, name: 'A' })] }), 'keyboard');
    const h = useHudStore.getState();
    expect(h.classId).toBeNull();
    expect(h.hp).toBe(0);
    expect(h.maxHp).toBe(1);
    expect(h.state).toBe('dead');
    // The roster is still mapped, and the present player is not flagged local.
    expect(h.teammates).toHaveLength(1);
    expect(h.teammates[0].isLocal).toBe(false);
  });
});
