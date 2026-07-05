import { describe, it, expect } from 'vitest';
import { World } from '../src/engine/world';
import type { InputCommand, ButtonState, BossAction } from '../src/engine/types';

function buttons(over: Partial<ButtonState> = {}): ButtonState {
  return { basic: false, a1: false, a2: false, a3: false, revive: false, ...over };
}
function inp(over: Partial<InputCommand> = {}): InputCommand {
  return { seq: 0, move: { x: 0, y: 0 }, aim: { x: 1, y: 0 }, buttons: buttons(), ...over };
}

const DT = 0.05;

describe('forceFinish (pause-menu End Run)', () => {
  it('ends the fight immediately with the chosen outcome', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 1,
      players: [{ peerId: 'a', name: 'A', classId: 'knight' }],
    });
    w.forceFinish('defeat');
    expect(w.finished).toBe(true);
    expect(w.outcome).toBe('defeat');
    expect(w.result().outcome).toBe('defeat');
    expect(w.result().monsterId).toBe('dragon');
    // Idempotent — a later win can't overwrite it.
    w.boss!.hp = 0;
    w.step(DT, new Map());
    expect(w.outcome).toBe('defeat');
  });
});

describe('skill-area cues', () => {
  it("a Knight cleave emits a cone skillArea + a slotted cast", () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 2,
      players: [{ peerId: 'k', name: 'K', classId: 'knight' }],
    });
    const k = w.players[0];
    const boss = w.boss!;
    k.pos = { x: 800, y: 400 };
    boss.pos = { x: 800, y: 350 };
    w.step(DT, new Map([['k', inp({ aim: { x: 0, y: -1 }, buttons: buttons({ basic: true }) })]]));

    const area = w.events.find((e) => e.t === 'skillArea');
    expect(area).toBeTruthy();
    if (area && area.t === 'skillArea') {
      expect(area.area.kind).toBe('cone');
      expect(area.side).toBe('player');
    }
    const cast = w.events.find((e) => e.t === 'cast' && e.side === 'player');
    expect(cast && cast.t === 'cast' ? cast.slot : undefined).toBe('basic');
  });
});

describe('Lich summon telegraph cue', () => {
  it('exposes a telegraph while the summon is winding up', () => {
    const w = new World({
      monsterId: 'lich',
      seed: 5,
      players: [{ peerId: 'a', name: 'A', classId: 'mage' }],
    });
    const action: BossAction = {
      kind: 'windup',
      abilityId: 'summonSkeletons',
      remaining: 1,
      total: 1.5,
      targetId: null,
      targetPos: null,
      aimAngle: 0,
      channelAccum: 0,
    };
    w.boss!.action = action;
    const snap = w.serialize();
    expect(snap.boss?.telegraph).not.toBeNull();
    expect(snap.boss?.telegraph?.kind).toBe('circle');
  });
});
