/**
 * Warband — attack-pattern fairness governor (world/grammar.ts) + its inertness
 * for lone bosses (world.ts). The pure overlap test is driven with hand-built
 * fixtures; the world-level test confirms a single boss is never affected.
 */
import { describe, it, expect } from 'vitest';
import { World } from '../src/engine/world/world';
import { overlapsActiveTelegraph, WALLING_SHAPES } from '../src/engine/world/grammar';
import type { Boss, BossAction, PendingStrike, Vec2 } from '../src/engine/core/types';

function action(over: Partial<BossAction> = {}): BossAction {
  return {
    kind: 'idle',
    abilityId: null,
    remaining: 0,
    total: 0,
    targetId: null,
    targetPos: null,
    aimAngle: 0,
    channelAccum: 0,
    ...over,
  };
}

/** Minimal boss fixture — only the fields the governor reads. */
function boss(pos: Vec2, over: Partial<Boss> = {}): Boss {
  return {
    id: 1,
    monsterId: 'dragon',
    pos,
    facing: 0,
    hp: 1000,
    maxHp: 1000,
    moveSpeed: 100,
    radius: 60,
    phase: 'normal',
    action: action(),
    cooldowns: {},
    decisionTimer: 0,
    regen: 0,
    blinkTimer: 0,
    buffs: [],
    ...over,
  };
}

describe('overlapsActiveTelegraph', () => {
  const GAP = 175;

  it('flags a spot another boss is already winding up onto', () => {
    const a = boss({ x: 100, y: 100 }, { id: 1 });
    const b = boss(
      { x: 900, y: 100 },
      {
        id: 2,
        action: action({ kind: 'windup', abilityId: 'fireball', targetPos: { x: 500, y: 500 } }),
      },
    );
    // A new impact right on b's target overlaps; one far away does not.
    expect(overlapsActiveTelegraph({ x: 500, y: 500 }, a, [a, b], [], GAP)).toBe(true);
    expect(overlapsActiveTelegraph({ x: 500, y: 900 }, a, [a, b], [], GAP)).toBe(false);
  });

  it('ignores idle / recovering / dead bosses', () => {
    const a = boss({ x: 100, y: 100 }, { id: 1 });
    const idle = boss({ x: 500, y: 500 }, { id: 2, action: action({ kind: 'idle' }) });
    const dead = boss(
      { x: 500, y: 500 },
      { id: 3, hp: 0, action: action({ kind: 'windup', targetPos: { x: 500, y: 500 } }) },
    );
    expect(overlapsActiveTelegraph({ x: 500, y: 500 }, a, [a, idle, dead], [], GAP)).toBe(false);
  });

  it('falls back to the boss position when its telegraph has no explicit target', () => {
    const a = boss({ x: 100, y: 100 }, { id: 1 });
    // A channelling boss with a null targetPos — the threatened spot is its own
    // position (the `?? other.pos` fallback), not a separate aimed point.
    const b = boss(
      { x: 500, y: 500 },
      { id: 2, action: action({ kind: 'channel', targetPos: null }) },
    );
    expect(overlapsActiveTelegraph({ x: 500, y: 500 }, a, [a, b], [], GAP)).toBe(true);
    expect(overlapsActiveTelegraph({ x: 900, y: 900 }, a, [a, b], [], GAP)).toBe(false);
  });

  it('flags a spot a pending corruption strike is about to hit', () => {
    const a = boss({ x: 100, y: 100 }, { id: 1 });
    const strike: PendingStrike = {
      id: 9,
      pos: { x: 500, y: 500 },
      radius: 100,
      fuse: 1,
      totalFuse: 1.5,
      damage: 30,
    };
    expect(overlapsActiveTelegraph({ x: 560, y: 500 }, a, [a], [strike], GAP)).toBe(true);
    expect(overlapsActiveTelegraph({ x: 900, y: 500 }, a, [a], [strike], GAP)).toBe(false);
  });

  it('exposes the walling shapes it governs', () => {
    expect(WALLING_SHAPES.has('cone')).toBe(true);
    expect(WALLING_SHAPES.has('circleAtTarget')).toBe(true);
    expect(WALLING_SHAPES.has('projectile')).toBe(false);
    expect(WALLING_SHAPES.has('summon')).toBe(false);
  });
});

describe('governor is inert for a lone boss', () => {
  it('a single boss still attacks normally even with a far pending strike', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 4,
      players: [{ peerId: 'a', name: 'A', classId: 'knight' }],
    });
    // Park a hero in melee so the boss wants to swing, and a strike far away.
    w.players[0].pos = { x: w.boss!.pos.x, y: w.boss!.pos.y + 120 };
    w.addPendingStrike({ pos: { x: 50, y: 950 }, radius: 90, fuse: 5, damage: 10 });
    let cast = false;
    for (let i = 0; i < 120 && !w.finished; i++) {
      w.step(0.05, new Map());
      if (w.events.some((e) => e.t === 'cast' && e.side === 'boss')) cast = true;
    }
    expect(cast).toBe(true); // the lone boss was never blocked from acting
  });
});
