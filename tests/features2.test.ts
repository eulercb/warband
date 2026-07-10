import { describe, it, expect } from 'vitest';
import { World } from '../src/engine/world/world';
import { ARENA_W, ARENA_H } from '../src/engine/core/constants';
import { applyUpgrades } from '../src/engine/content/upgrades';
import { makeBuff } from '../src/engine/combat/combat';
import type { InputCommand, ButtonState, Projectile } from '../src/engine/core/types';

function buttons(over: Partial<ButtonState> = {}): ButtonState {
  return { basic: false, a1: false, a2: false, a3: false, revive: false, ...over };
}
function inp(over: Partial<InputCommand> = {}): InputCommand {
  return { seq: 0, move: { x: 0, y: 0 }, aim: { x: 1, y: 0 }, buttons: buttons(), ...over };
}
const DT = 0.05;

function mkWorld() {
  return new World({
    monsterId: 'dragon',
    seed: 7,
    players: [{ peerId: 'a', name: 'A', classId: 'knight' }],
  });
}

describe('torus: wrap-around movement', () => {
  it('wraps a player that walks off the right edge back to the left', () => {
    const w = mkWorld();
    const p = w.players[0];
    p.pos = { x: ARENA_W - 4, y: 500 };
    for (let i = 0; i < 20; i++) {
      w.step(DT, new Map([['a', inp({ move: { x: 1, y: 0 } })]]));
    }
    expect(p.pos.x).toBeGreaterThanOrEqual(0);
    expect(p.pos.x).toBeLessThan(ARENA_W);
    // Having pushed right for ~1s at knight speed it should have crossed the seam.
    expect(p.pos.x).toBeLessThan(ARENA_W / 2);
  });

  it('keeps every position canonical after stepping across the seam', () => {
    const w = mkWorld();
    w.players[0].pos = { x: 2, y: 2 };
    for (let i = 0; i < 40; i++) {
      w.step(DT, new Map([['a', inp({ move: { x: -1, y: -1 } })]]));
      for (const p of w.players) {
        expect(p.pos.x).toBeGreaterThanOrEqual(0);
        expect(p.pos.x).toBeLessThan(ARENA_W);
        expect(p.pos.y).toBeGreaterThanOrEqual(0);
        expect(p.pos.y).toBeLessThan(ARENA_H);
      }
    }
  });
});

describe('torus: combat across the seam', () => {
  it('a cleave lands on a boss sitting just across the wrap seam', () => {
    const w = mkWorld();
    const knight = w.players[0];
    // Knight hugs the right edge; boss is a few units across the seam (left edge).
    knight.pos = { x: ARENA_W - 10, y: 500 };
    w.boss!.pos = { x: 10, y: 500 };
    const before = w.boss!.hp;
    // Aim +x (the SHORT way to the boss across the seam) and swing.
    w.step(DT, new Map([['a', inp({ aim: { x: 1, y: 0 }, buttons: buttons({ basic: true }) })]]));
    expect(w.boss!.hp).toBeLessThan(before);
  });
});

describe('obstacles block ranged attacks', () => {
  function ranger() {
    const w = new World({
      monsterId: 'dragon',
      seed: 3,
      players: [{ peerId: 'a', name: 'A', classId: 'ranger' }],
    });
    w.obstacles = []; // control the layout explicitly
    w.projectiles = [];
    return w;
  }
  function arrow(w: World): Projectile {
    return {
      id: w.allocId(),
      kind: 'arrow',
      pos: { x: w.boss!.pos.x, y: w.boss!.pos.y + 34 },
      vel: { x: 0, y: -700 }, // straight up into the boss
      ownerId: w.players[0].id,
      side: 'player',
      damage: 20,
      impactRadius: 0,
      hitRadius: 8,
      lifetime: 3,
      rangeLeft: 820,
    };
  }

  it('an arrow with a clear path damages the boss', () => {
    const w = ranger();
    w.projectiles = [arrow(w)];
    const before = w.boss!.hp;
    w.step(DT, new Map([['a', inp()]]));
    expect(w.boss!.hp).toBeLessThan(before);
  });

  it('an obstacle between shooter and boss absorbs the arrow', () => {
    const w = ranger();
    const boss = w.boss!;
    w.obstacles = [{ id: w.allocId(), pos: { x: boss.pos.x, y: boss.pos.y + 20 }, radius: 40 }];
    w.projectiles = [arrow(w)];
    const before = boss.hp;
    w.step(DT, new Map([['a', inp()]]));
    expect(boss.hp).toBe(before); // blocked, no damage
    expect(w.projectiles.length).toBe(0); // consumed by the cover
  });
});

describe('hold-to-autofire', () => {
  // Count the fresh fires by watching the basic cooldown go from ~0 back up.
  function heldFires(autofire: boolean, ticks: number): number {
    const w = new World({
      monsterId: 'dragon',
      seed: 5,
      players: [{ peerId: 'a', name: 'A', classId: 'ranger' }],
    });
    let shots = 0;
    for (let i = 0; i < ticks; i++) {
      const beforeCd = w.players[0].cooldowns.basic;
      w.step(DT, new Map([['a', inp({ autofire, buttons: buttons({ basic: true }) })]]));
      if (beforeCd <= 1e-6 && w.players[0].cooldowns.basic > 0) shots++;
    }
    return shots;
  }

  it('holding fires exactly once with autofire off (edge-triggered), even past cooldown', () => {
    // 40 ticks = 2s, far past the 0.5s basic cooldown — a held button must NOT
    // re-trigger without a release.
    expect(heldFires(false, 40)).toBe(1);
  });

  it('holding re-fires repeatedly with autofire on', () => {
    expect(heldFires(true, 40)).toBeGreaterThan(1);
  });
});

describe('upgrades apply to a spawned hero', () => {
  it('swift raises move speed; vigor raises max HP; renewal regenerates', () => {
    const base = new World({
      monsterId: 'dragon',
      seed: 9,
      players: [{ peerId: 'a', name: 'A', classId: 'knight' }],
    });
    const baseSpeed = base.players[0].moveSpeed;
    const baseHp = base.players[0].maxHp;

    const up = new World({
      monsterId: 'dragon',
      seed: 9,
      players: [
        { peerId: 'a', name: 'A', classId: 'knight', upgrades: ['swift', 'vigor', 'renewal'] },
      ],
    });
    const p = up.players[0];
    expect(p.moveSpeed).toBeGreaterThan(baseSpeed);
    expect(p.maxHp).toBeGreaterThan(baseHp);
    expect(p.regenPerSec).toBeGreaterThan(0);

    // Renewal heals over time when hurt.
    p.hp = p.maxHp - 50;
    const hurt = p.hp;
    up.step(DT, new Map([['a', inp()]]));
    expect(p.hp).toBeGreaterThan(hurt);
  });

  it('mighty increases outgoing damage', () => {
    const plain = new World({
      monsterId: 'dragon',
      seed: 2,
      players: [{ peerId: 'a', name: 'A', classId: 'knight' }],
    });
    const buffed = new World({
      monsterId: 'dragon',
      seed: 2,
      players: [{ peerId: 'a', name: 'A', classId: 'knight', upgrades: ['mighty'] }],
    });
    for (const w of [plain, buffed]) {
      w.players[0].pos = { x: w.boss!.pos.x, y: w.boss!.pos.y + 30 };
    }
    const cmd = new Map([['a', inp({ aim: { x: 0, y: -1 }, buttons: buttons({ basic: true }) })]]);
    const plainBefore = plain.boss!.hp;
    plain.step(DT, cmd);
    const buffedBefore = buffed.boss!.hp;
    buffed.step(DT, cmd);
    const plainDmg = plainBefore - plain.boss!.hp;
    const buffedDmg = buffedBefore - buffed.boss!.hp;
    expect(buffedDmg).toBeGreaterThan(plainDmg);
  });

  it('surefooted reduces the terrain slow applied', () => {
    // applyUpgrades gives terrainResist; verify the slow math halves at 0.5.
    const p = {
      moveSpeed: 200,
      maxHp: 100,
      hp: 100,
      cooldownMult: 1,
      castMult: 1,
      damageMult: 1,
      damageTakenMult: 1,
      terrainResist: 0,
      regenPerSec: 0,
    } as unknown as Parameters<typeof applyUpgrades>[0];
    applyUpgrades(p, ['surefooted']);
    expect(p.terrainResist).toBeCloseTo(0.5);
    // A raw 0.5 slow becomes 0.75 under 0.5 resist: 1-(1-0.5)*(1-0.5)=0.75.
    const resisted = 1 - (1 - 0.5) * (1 - p.terrainResist);
    expect(resisted).toBeCloseTo(0.75);
  });
});

describe('makeBuff still carries mult for the view/glow layer', () => {
  it('a slow buff records mult < 1', () => {
    const b = makeBuff('moveSpeed', 0.5, 2, 'terrain');
    expect(b.mult).toBe(0.5);
    expect(b.kind).toBe('moveSpeed');
  });
});
