import { describe, it, expect } from 'vitest';
import { World } from '../src/engine/world';
import type { InputCommand, ButtonState } from '../src/engine/types';
import { getMonster } from '../src/engine/monsters';
import {
  DOWNED_BLEEDOUT,
  REVIVE_TIME,
  REVIVE_HP_FRAC,
} from '../src/engine/constants';

function buttons(over: Partial<ButtonState> = {}): ButtonState {
  return { basic: false, a1: false, a2: false, a3: false, revive: false, ...over };
}

function inp(over: Partial<InputCommand> = {}): InputCommand {
  return {
    seq: 0,
    move: { x: 0, y: 0 },
    aim: { x: 1, y: 0 },
    buttons: buttons(),
    ...over,
  };
}

const DT = 0.05;

describe('world: setup + scaling', () => {
  it('scales boss HP with player count at construction', () => {
    const solo = new World({
      monsterId: 'dragon',
      seed: 1,
      players: [{ peerId: 'a', name: 'A', classId: 'knight' }],
    });
    expect(solo.boss?.maxHp).toBe(2600);

    const duo = new World({
      monsterId: 'dragon',
      seed: 1,
      players: [
        { peerId: 'a', name: 'A', classId: 'knight' },
        { peerId: 'b', name: 'B', classId: 'ranger' },
      ],
    });
    expect(duo.boss?.maxHp).toBe(Math.round(2600 * 1.75));
  });

  it('serializes a valid snapshot', () => {
    const w = new World({
      monsterId: 'lich',
      seed: 5,
      players: [{ peerId: 'a', name: 'A', classId: 'mage' }],
    });
    const snap = w.serialize();
    expect(snap.players.length).toBe(1);
    expect(snap.boss?.monsterId).toBe('lich');
    expect(Array.isArray(snap.adds)).toBe(true);
  });
});

describe('world: cooldown gating', () => {
  it('an ability cannot be re-used while on cooldown', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 2,
      players: [{ peerId: 'k', name: 'K', classId: 'knight' }],
    });
    const k = w.players[0];
    const boss = w.boss!;
    const pin = () => {
      k.pos = { x: 800, y: 400 };
      boss.pos = { x: 800, y: 300 };
    };

    pin();
    w.step(DT, new Map([['k', inp({ aim: { x: 0, y: -1 }, buttons: buttons({ basic: true }) })]]));
    const hpAfterFirst = boss.hp;
    expect(hpAfterFirst).toBeLessThan(2600); // cleave landed
    expect(k.cooldowns.basic).toBeGreaterThan(0);

    // release, then press again while still on cooldown
    pin();
    w.step(DT, new Map([['k', inp({ aim: { x: 0, y: -1 }, buttons: buttons({ basic: false }) })]]));
    pin();
    w.step(DT, new Map([['k', inp({ aim: { x: 0, y: -1 }, buttons: buttons({ basic: true }) })]]));
    expect(boss.hp).toBe(hpAfterFirst); // no second cleave
  });
});

describe('world: enrage', () => {
  it('boss enters enraged phase at its HP threshold', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 3,
      players: [{ peerId: 'a', name: 'A', classId: 'ranger' }],
    });
    const boss = w.boss!;
    boss.hp = boss.maxHp * 0.24; // below dragon's 0.25 threshold
    w.step(DT, new Map());
    expect(boss.phase).toBe('enraged');
    const enrageEvent = w.events.find((e) => e.t === 'enrage');
    expect(enrageEvent).toBeTruthy();
  });

  it('monster enrage cooldown multipliers match the spec', () => {
    expect(getMonster('dragon').enrageCooldownMult).toBeCloseTo(0.7);
    expect(getMonster('troll').enrageCooldownMult).toBeCloseTo(0.6);
    expect(getMonster('lich').enrageCooldownMult).toBeCloseTo(0.7);
  });
});

describe('world: downed / revive / wipe', () => {
  it('0 HP downs a player; ally revive restores 40% HP; bleed-out kills; wipe = defeat', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 7,
      players: [
        { peerId: 'p1', name: 'P1', classId: 'ranger' },
        { peerId: 'p2', name: 'P2', classId: 'knight' },
      ],
    });
    w.boss = null; // isolate co-op mechanics from boss interference
    const p1 = w.players[0];
    const p2 = w.players[1];

    // --- down p1 ---
    p1.hp = 0;
    w.step(DT, new Map());
    expect(p1.state).toBe('downed');
    expect(p1.downedTimer).toBeGreaterThan(0);
    expect(p1.stats.deaths).toBe(1);

    // --- p2 revives p1 (hold revive within range) ---
    const steps = Math.ceil(REVIVE_TIME / DT) + 2;
    for (let i = 0; i < steps && p1.state !== 'alive'; i++) {
      p1.pos = { x: 400, y: 800 };
      p2.pos = { x: 430, y: 800 };
      w.step(
        DT,
        new Map([
          ['p1', inp()],
          ['p2', inp({ buttons: buttons({ revive: true }) })],
        ]),
      );
    }
    expect(p1.state).toBe('alive');
    expect(p1.hp).toBeCloseTo(p1.maxHp * REVIVE_HP_FRAC, 0);
    expect(p2.stats.revives).toBe(1);

    // --- down p1 again, let it bleed out with no reviver ---
    p1.hp = 0;
    w.step(DT, new Map());
    expect(p1.state).toBe('downed');
    const bleedSteps = Math.ceil(DOWNED_BLEEDOUT / DT) + 2;
    for (let i = 0; i < bleedSteps && p1.state !== 'dead'; i++) {
      w.step(DT, new Map([['p1', inp()], ['p2', inp()]]));
    }
    expect(p1.state).toBe('dead');

    // --- down p2 too -> full party non-alive -> defeat ---
    p2.hp = 0;
    w.step(DT, new Map());
    expect(w.finished).toBe(true);
    expect(w.outcome).toBe('defeat');
  });
});

describe('world: victory + robustness', () => {
  it('boss at 0 HP produces a victory', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 9,
      players: [{ peerId: 'a', name: 'A', classId: 'ranger' }],
    });
    w.boss!.hp = 0;
    w.step(DT, new Map([['a', inp()]]));
    expect(w.finished).toBe(true);
    expect(w.outcome).toBe('victory');
    expect(w.events.some((e) => e.t === 'death' && e.kind === 'boss')).toBe(true);
    expect(w.result().outcome).toBe('victory');
  });

  it('runs a 4-player fight for many ticks without throwing or NaNs', () => {
    const w = new World({
      monsterId: 'lich',
      seed: 11,
      players: [
        { peerId: 'p1', name: 'P1', classId: 'knight' },
        { peerId: 'p2', name: 'P2', classId: 'ranger' },
        { peerId: 'p3', name: 'P3', classId: 'mage' },
        { peerId: 'p4', name: 'P4', classId: 'cleric' },
      ],
    });
    for (let t = 0; t < 1200 && !w.finished; t++) {
      const map = new Map<string, InputCommand>();
      w.players.forEach((p, i) => {
        const ang = (t * 0.02 + i) % (Math.PI * 2);
        map.set(
          p.peerId,
          inp({
            move: { x: Math.cos(ang), y: Math.sin(ang) },
            aim: w.boss ? { x: w.boss.pos.x - p.pos.x, y: w.boss.pos.y - p.pos.y } : { x: 1, y: 0 },
            buttons: buttons({
              basic: t % 4 === 0,
              a1: t % 40 === 0,
              a2: t % 60 === 0,
              a3: t % 80 === 0,
              revive: false,
            }),
          }),
        );
      });
      w.step(DT, map);
      // invariants
      for (const p of w.players) {
        expect(Number.isFinite(p.pos.x)).toBe(true);
        expect(Number.isFinite(p.hp)).toBe(true);
        expect(p.pos.x).toBeGreaterThanOrEqual(0);
        expect(p.pos.x).toBeLessThanOrEqual(w.arena.w);
      }
      if (w.boss) expect(Number.isFinite(w.boss.hp)).toBe(true);
    }
    const snap = w.serialize();
    expect(Number.isFinite(snap.tick)).toBe(true);
  });
});
