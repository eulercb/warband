import { describe, it, expect } from 'vitest';
import { World } from '../src/engine/world/world';
import type { InputCommand, ButtonState } from '../src/engine/core/types';
import { getMonster } from '../src/engine/content/monsters';
import {
  DOWNED_BLEEDOUT,
  REVIVE_TIME,
  REVIVE_HP_FRAC,
  REVIVE_MIN_TIME,
} from '../src/engine/core/constants';
import { coReviveSpeed, hasBuff, damageBoss } from '../src/engine/combat/combat';
import { spawnZone } from '../src/engine/combat/abilities';

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
    // Dragon base 2600 × BOSS_HP_SCALE (0.6) = 1560 at n=1 (see spawnBosses).
    expect(solo.boss?.maxHp).toBe(1560);

    const duo = new World({
      monsterId: 'dragon',
      seed: 1,
      players: [
        { peerId: 'a', name: 'A', classId: 'knight' },
        { peerId: 'b', name: 'B', classId: 'ranger' },
      ],
    });
    expect(duo.boss?.maxHp).toBe(Math.round(1560 * 1.75));
  });

  it('serializes a valid snapshot', () => {
    const w = new World({
      monsterId: 'lich',
      seed: 5,
      players: [{ peerId: 'a', name: 'A', classId: 'mage' }],
    });
    const snap = w.serialize();
    expect(snap.players.length).toBe(1);
    expect(snap.bosses[0]?.monsterId).toBe('lich');
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
    w.terrain = []; // ...and from static terrain hazards (slow/damage)
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
      w.step(
        DT,
        new Map([
          ['p1', inp()],
          ['p2', inp()],
        ]),
      );
    }
    expect(p1.state).toBe('dead');

    // --- down p2 too -> full party non-alive -> defeat ---
    p2.hp = 0;
    w.step(DT, new Map());
    expect(w.finished).toBe(true);
    expect(w.outcome).toBe('defeat');
  });

  it('co-revive: extra revivers speed the revive but never below the floor (item 10)', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 9,
      players: [
        { peerId: 'p1', name: 'P1', classId: 'ranger' },
        { peerId: 'p2', name: 'P2', classId: 'knight' },
        { peerId: 'p3', name: 'P3', classId: 'cleric' },
        { peerId: 'p4', name: 'P4', classId: 'bard' },
      ],
    });
    w.boss = null;
    w.terrain = [];
    const [p1, p2, p3, p4] = w.players;

    // Keep the three helpers piled onto the downed p1 within revive range.
    const cluster = (): void => {
      p1.pos = { x: 400, y: 800 };
      p2.pos = { x: 418, y: 800 };
      p3.pos = { x: 400, y: 818 };
      p4.pos = { x: 418, y: 818 };
    };
    const threeRevive = new Map([
      ['p1', inp()],
      ['p2', inp({ buttons: buttons({ revive: true }) })],
      ['p3', inp({ buttons: buttons({ revive: true }) })],
      ['p4', inp({ buttons: buttons({ revive: true }) })],
    ]);

    p1.hp = 0;
    w.step(DT, new Map());
    expect(p1.state).toBe('downed');

    let steps = 0;
    while (p1.state !== 'alive' && steps < 200) {
      cluster();
      w.step(DT, threeRevive);
      steps++;
      // First revive tick advances at DT × the co-revive multiplier for 3 revivers,
      // i.e. strictly faster than a lone reviver's plain DT.
      if (steps === 1) {
        expect(p1.reviveProgress).toBeCloseTo(DT * coReviveSpeed(3), 5);
        expect(coReviveSpeed(3)).toBeGreaterThan(1);
      }
    }
    expect(p1.state).toBe('alive');
    // Faster than a lone reviver (which needs REVIVE_TIME/DT = 60 ticks)…
    expect(steps).toBeLessThan(Math.ceil(REVIVE_TIME / DT));
    // …but the minimum-time floor holds: it never completes quicker than REVIVE_MIN_TIME.
    expect(steps * DT).toBeGreaterThanOrEqual(REVIVE_MIN_TIME - 1e-9);
    expect(p2.stats.revives).toBe(1); // the first in-range ally is credited
  });
});

describe('world: root immobilises the boss (item 9)', () => {
  it('a true-root entangle zone gives the boss a root buff and stops it walking', () => {
    const w = new World({
      monsterId: 'dragon', // no native blink/charge — isolates the walk gate
      seed: 4,
      players: [{ peerId: 'a', name: 'A', classId: 'druid' }],
    });
    w.terrain = [];
    const boss = w.boss!;
    const p = w.players[0];
    // Park the hero far away so the boss WANTS to march toward it…
    p.pos = { x: 200, y: 200 };
    boss.pos = { x: 900, y: 600 };
    // …then drop a wide true-root entangle zone on the boss.
    spawnZone(w, {
      kind: 'entangle',
      roots: true,
      pos: { ...boss.pos },
      radius: 320,
      side: 'player',
      ownerId: p.id,
      damagePerTick: 0,
      healPerTick: 0,
      slowMult: 1,
      slowDuration: 1.5,
      duration: 6,
    });
    // Step past the first zone tick (0.5s) so the root lands…
    for (let i = 0; i < 12; i++) w.step(DT, new Map([['a', inp()]]));
    expect(hasBuff(boss, 'root')).toBe(true);
    // …then confirm it can't walk toward the far hero while rooted.
    const rootedAt = { ...boss.pos };
    for (let i = 0; i < 24; i++) w.step(DT, new Map([['a', inp()]]));
    expect(hasBuff(boss, 'root')).toBe(true);
    expect(boss.pos.x).toBeCloseTo(rootedAt.x, 3);
    expect(boss.pos.y).toBeCloseTo(rootedAt.y, 3);
  });
});

describe('world: progression-aware boss sustain + invuln (items 2 & 5)', () => {
  /** A "strong band": a knight who has multiclassed into mage with its 2 sub-skills. */
  function strongWorld(monsterId: 'treant' | 'dragon'): World {
    const w = new World({
      monsterId,
      seed: 3,
      players: [
        {
          peerId: 'a',
          name: 'A',
          classId: 'knight',
          extraClasses: ['mage'],
          subSkills: ['mg_evoker_lightning', 'mg_evoker_cone'],
        },
      ],
    });
    w.terrain = [];
    return w;
  }

  it('a fresh/weak band never turns a boss immune, and out-DPSes its damped heals (items 2 & 5)', () => {
    const w = new World({
      monsterId: 'treant',
      seed: 5,
      players: [{ peerId: 'a', name: 'A', classId: 'barbarian' }],
    });
    w.terrain = [];
    const boss = w.boss!;
    expect(boss.invulnThresholds).toBeUndefined(); // weak party → mechanic disabled
    expect(boss.healScale).toBeCloseTo(0.35, 6); // earliest-run active-heal floor
    const p = w.players[0];
    p.maxHp = 1e9;
    p.hp = 1e9;
    p.damageTakenMult = 0; // survive the grind so we can measure the boss
    let steps = 0;
    while (boss.hp > 0 && steps < 8000) {
      damageBoss(w, p, boss, boss.maxHp * 0.005);
      expect(hasBuff(boss, 'invuln')).toBe(false); // never immune for a weak band
      w.step(DT, new Map([['a', inp()]]));
      steps++;
    }
    expect(boss.hp).toBeLessThanOrEqual(0); // killable — no infinite fight
  });

  it('a strong band on a hard boss meets a telegraphed, damage-proof invuln window (item 5)', () => {
    const w = strongWorld('treant');
    const boss = w.boss!;
    expect(boss.invulnThresholds).toEqual([0.5, 0.25]);
    expect(boss.invulnNextIdx).toBe(0);
    // Cross the first threshold → next tick arms the window (a boss aura telegraphs it).
    boss.hp = boss.maxHp * 0.49;
    w.step(DT, new Map([['a', inp()]]));
    expect(hasBuff(boss, 'invuln')).toBe(true);
    expect(boss.invulnNextIdx).toBe(1);
    // Immune while the window is up — even a huge hit soaks nothing.
    const hp = boss.hp;
    expect(damageBoss(w, w.players[0], boss, boss.maxHp)).toBe(0);
    expect(boss.hp).toBe(hp);
  });

  it('boss invuln fires ≥once, is bounded to two windows, and never walls the kill (item 5)', () => {
    const w = strongWorld('treant');
    const boss = w.boss!;
    boss.healScale = 0; // isolate the invuln from any healing
    boss.regen = 0;
    const p = w.players[0];
    p.maxHp = 1e9;
    p.hp = 1e9;
    p.damageTakenMult = 0;
    let windows = 0;
    let wasInvuln = false;
    let steps = 0;
    while (boss.hp > 0 && steps < 8000) {
      if (!hasBuff(boss, 'invuln')) damageBoss(w, p, boss, boss.maxHp * 0.01);
      const now = hasBuff(boss, 'invuln');
      if (now && !wasInvuln) windows++;
      wasInvuln = now;
      w.step(DT, new Map([['a', inp()]]));
      steps++;
    }
    expect(boss.hp).toBeLessThanOrEqual(0); // killable — invuln never makes it infinite
    expect(windows).toBeGreaterThanOrEqual(1); // triggered at least once before death
    expect(windows).toBeLessThanOrEqual(2); // hard-bounded to the two thresholds
  });

  it('late in a run a boss keeps its full sustain (item 2)', () => {
    // Many clears (deep endless) → active-heal damping fully lifts.
    const w = new World({
      monsterId: 'treant',
      seed: 5,
      cycle: 3,
      runIndex: 2,
      runTotal: 4,
      pace: 1,
      players: [{ peerId: 'a', name: 'A', classId: 'barbarian' }],
    });
    expect(w.boss!.healScale).toBeCloseTo(1, 6);
  });
});

describe('world: flying creatures ignore ground zones (item 5)', () => {
  const zoneDamageOver = (monsterId: 'harpy' | 'dragon'): number => {
    const w = new World({
      monsterId,
      seed: 2,
      players: [{ peerId: 'a', name: 'A', classId: 'druid' }],
    });
    w.terrain = [];
    const boss = w.boss!;
    // A wide, damaging player ground zone centred on the boss.
    spawnZone(w, {
      kind: 'poison',
      pos: { ...boss.pos },
      radius: 320,
      side: 'player',
      ownerId: w.players[0].id,
      damagePerTick: 40,
      healPerTick: 0,
      slowMult: 0.5,
      slowDuration: 1,
      duration: 5,
    });
    const before = boss.hp;
    for (let i = 0; i < 16; i++) w.step(DT, new Map([['a', inp()]]));
    return before - boss.hp;
  };

  it('a FLYING boss takes no damage from a player ground zone', () => {
    expect(zoneDamageOver('harpy')).toBe(0);
  });

  it('a grounded boss DOES take ground-zone damage (control)', () => {
    expect(zoneDamageOver('dragon')).toBeGreaterThan(0);
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
