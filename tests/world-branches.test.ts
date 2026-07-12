/**
 * Branch-coverage tests for the world simulation engine (src/engine/world/world.ts).
 *
 * These drive the guard clauses, status effects, downed/revive/phoenix logic,
 * boss phases, adds, affixes, corruption primitives and serialization edges that
 * the happy-path suites in world.test.ts / combat.test.ts / chaos.test.ts don't
 * reach. Everything is deterministic (fixed seeds; the engine is seeded) and
 * asserts real state changes (HP, buffs, positions, serialize() output, events).
 */
import { describe, it, expect } from 'vitest';
import { World } from '../src/engine/world/world';
import type {
  InputCommand,
  ButtonState,
  GroundZone,
  Projectile,
  Add,
  TerrainPatch,
} from '../src/engine/core/types';
import { applyBuff, makeBuff } from '../src/engine/combat/combat';

const DT = 0.05;

function buttons(over: Partial<ButtonState> = {}): ButtonState {
  return { basic: false, a1: false, a2: false, a3: false, revive: false, ...over };
}

function inp(over: Partial<InputCommand> = {}): InputCommand {
  return { seq: 0, move: { x: 0, y: 0 }, aim: { x: 1, y: 0 }, buttons: buttons(), ...over };
}

function solo(over: Partial<Parameters<typeof makeWorld>[0]> = {}) {
  return makeWorld({ classId: 'knight', ...over });
}

function makeWorld(opts: {
  monsterId?: 'dragon' | 'troll' | 'lich';
  seed?: number;
  classId?: 'knight' | 'ranger' | 'mage' | 'cleric';
  players?: ConstructorParameters<typeof World>[0]['players'];
  bossAffixes?: ConstructorParameters<typeof World>[0]['bossAffixes'];
  coBosses?: ConstructorParameters<typeof World>[0]['coBosses'];
}): World {
  const w = new World({
    monsterId: opts.monsterId ?? 'dragon',
    seed: opts.seed ?? 1,
    players: opts.players ?? [{ peerId: 'a', name: 'A', classId: opts.classId ?? 'knight' }],
    bossAffixes: opts.bossAffixes,
    coBosses: opts.coBosses,
  });
  return w;
}

function mkZone(w: World, over: Partial<GroundZone> = {}): GroundZone {
  return {
    id: w.allocId(),
    kind: 'voidZone',
    pos: { x: 0, y: 0 },
    radius: 120,
    side: 'player',
    ownerId: 0,
    damagePerTick: 0,
    healPerTick: 0,
    slowMult: 1,
    slowDuration: 0,
    duration: 10,
    remaining: 10,
    tickAccum: 0,
    ...over,
  };
}

function mkProj(w: World, over: Partial<Projectile> = {}): Projectile {
  return {
    id: w.allocId(),
    kind: 'arrow',
    pos: { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    ownerId: 0,
    side: 'player',
    damage: 20,
    impactRadius: 0,
    hitRadius: 8,
    lifetime: 5,
    rangeLeft: 500,
    ...over,
  };
}

function mkAdd(w: World, over: Partial<Add> = {}): Add {
  return {
    id: w.allocId(),
    pos: { x: 0, y: 0 },
    hp: 60,
    maxHp: 60,
    moveSpeed: 160,
    radius: 12,
    targetId: null,
    attackCd: 0,
    buffs: [],
    ...over,
  };
}

function mkTerrain(w: World, over: Partial<TerrainPatch> = {}): TerrainPatch {
  return {
    id: w.allocId(),
    kind: 'magma',
    pos: { x: 0, y: 0 },
    radius: 120,
    damagePerTick: 0,
    slowMult: 1,
    slowDuration: 2,
    tickAccum: 0,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// boss get/set accessor edges
// ---------------------------------------------------------------------------

describe('world-branches: boss accessor', () => {
  it('boss getter returns null when the arena is empty', () => {
    const w = solo();
    expect(w.boss).not.toBeNull();
    w.bosses = [];
    expect(w.boss).toBeNull();
  });

  it('boss setter swaps in a single boss or clears to none', () => {
    const w = solo();
    const b = w.boss!;
    w.boss = null;
    expect(w.bosses.length).toBe(0);
    w.boss = b;
    expect(w.bosses.length).toBe(1);
    expect(w.boss).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// subclass skill binding
// ---------------------------------------------------------------------------

describe('world-branches: subclass binding', () => {
  it('binds a valid subskill and records its id', () => {
    const w = makeWorld({
      players: [{ peerId: 'a', name: 'A', classId: 'knight', subSkills: ['kn_champion_slam'] }],
    });
    const p = w.players[0];
    expect(p.subAbilities?.sub1).toBeTruthy();
    expect(p.subSkillIds).toEqual(['kn_champion_slam']);
    expect(p.cooldowns.sub1).toBe(0);
  });

  it('skips unknown subskill ids and leaves subSkillIds unset when none bind', () => {
    const w = makeWorld({
      players: [{ peerId: 'a', name: 'A', classId: 'knight', subSkills: ['bogus1', 'bogus2'] }],
    });
    const p = w.players[0];
    expect(p.subAbilities?.sub1).toBeUndefined();
    expect(p.subSkillIds).toBeUndefined();
  });

  it('binds only the valid id when mixed with an unknown one', () => {
    const w = makeWorld({
      players: [
        { peerId: 'a', name: 'A', classId: 'knight', subSkills: ['nope', 'kn_champion_slam'] },
      ],
    });
    const p = w.players[0];
    // The invalid id is dropped entirely (not just skipped), so the valid skill
    // takes the first slot rather than wasting sub1 (item 15 binding).
    expect(p.subAbilities?.sub1).toBeTruthy();
    expect(p.subAbilities?.sub2).toBeUndefined();
    expect(p.subSkillIds).toEqual(['kn_champion_slam']);
  });

  it('firing a bound subclass skill damages the boss (edge + autofire paths)', () => {
    const w = makeWorld({
      players: [{ peerId: 'a', name: 'A', classId: 'knight', subSkills: ['kn_champion_slam'] }],
    });
    w.terrain = [];
    w.obstacles = [];
    const p = w.players[0];
    const boss = w.boss!;
    boss.pos = { x: 800, y: 400 };
    p.pos = { x: 800, y: 460 }; // inside Earthshaker's 150u nova radius
    const before = boss.hp;
    // Edge-triggered press of the sub1 button.
    w.step(DT, new Map([['a', inp({ buttons: buttons({ sub1: true }) })]]));
    expect(boss.hp).toBeLessThan(before);

    // A player without any subclass skills simply never touches the sub path.
    const w2 = solo();
    const p2 = w2.players[0];
    expect(p2.cooldowns.sub1).toBeUndefined();
    w2.step(DT, new Map([['a', inp({ buttons: buttons({ sub1: true }) })]]));
    expect(p2.state).toBe('alive');
  });

  it('autofire re-fires a held subclass skill without a fresh press', () => {
    const w = makeWorld({
      players: [{ peerId: 'a', name: 'A', classId: 'knight', subSkills: ['kn_champion_slam'] }],
    });
    w.terrain = [];
    w.obstacles = [];
    const p = w.players[0];
    const boss = w.boss!;
    boss.pos = { x: 800, y: 400 };
    p.pos = { x: 800, y: 460 };
    // Hold sub1 with autofire; even with prevButtons.sub1 already true it fires.
    p.prevButtons = buttons({ sub1: true });
    const before = boss.hp;
    w.step(DT, new Map([['a', inp({ autofire: true, buttons: buttons({ sub1: true }) })]]));
    expect(boss.hp).toBeLessThan(before);
  });
});

// ---------------------------------------------------------------------------
// ephemeral potions (item 21)
// ---------------------------------------------------------------------------

describe('world-branches: healing vials', () => {
  it('quaffs a vial when wounded, no-ops at full health or with no charges', () => {
    const w = makeWorld({
      players: [{ peerId: 'a', name: 'A', classId: 'knight', ephemeral: { potions: 2 } }],
    });
    w.boss = null;
    w.terrain = [];
    const p = w.players[0];
    expect(p.potions).toBe(2);

    // Wounded → the vial heals and one charge is spent.
    p.hp = 1;
    w.step(DT, new Map([['a', inp({ buttons: buttons({ item: true }) })]]));
    expect(p.hp).toBeGreaterThan(1);
    expect(p.potions).toBe(1);

    // Full health → the vial is not wasted (edge re-armed first).
    p.hp = p.maxHp;
    p.prevButtons = buttons();
    w.step(DT, new Map([['a', inp({ buttons: buttons({ item: true }) })]]));
    expect(p.potions).toBe(1);

    // Spend the last charge, then a further press with none left is a no-op.
    p.hp = 1;
    p.prevButtons = buttons();
    w.step(DT, new Map([['a', inp({ buttons: buttons({ item: true }) })]]));
    expect(p.potions).toBe(0);
    const hpNow = p.hp;
    p.hp = 1;
    p.prevButtons = buttons();
    w.step(DT, new Map([['a', inp({ buttons: buttons({ item: true }) })]]));
    expect(p.potions).toBe(0);
    expect(p.hp).toBe(1); // no heal without a charge
    void hpNow;
  });
});

// ---------------------------------------------------------------------------
// peer lookup / disconnect
// ---------------------------------------------------------------------------

describe('world-branches: peer id lookup + removal', () => {
  it('resolves a known peer and returns null for an unknown one', () => {
    const w = solo({ players: [{ peerId: 'a', name: 'A', classId: 'knight' }] });
    expect(w.playerIdByPeer('a')).toBe(w.players[0].id);
    expect(w.playerIdByPeer('ghost')).toBeNull();
  });

  it('removing an unknown peer is a no-op; removing the taunt holder clears the taunt', () => {
    const w = makeWorld({
      players: [
        { peerId: 'a', name: 'A', classId: 'knight' },
        { peerId: 'b', name: 'B', classId: 'ranger' },
      ],
    });
    w.removePlayerByPeer('ghost'); // unknown → early return, nothing changes
    expect(w.players.length).toBe(2);

    const a = w.players[0];
    w.tauntTargetId = a.id;
    w.tauntTimer = 5;
    w.removePlayerByPeer('a');
    expect(w.players.length).toBe(1);
    expect(w.tauntTargetId).toBeNull();
    expect(w.tauntTimer).toBe(0);
  });

  it('removing a non-taunt player leaves an active taunt intact', () => {
    const w = makeWorld({
      players: [
        { peerId: 'a', name: 'A', classId: 'knight' },
        { peerId: 'b', name: 'B', classId: 'ranger' },
      ],
    });
    const a = w.players[0];
    w.tauntTargetId = a.id;
    w.tauntTimer = 5;
    w.removePlayerByPeer('b'); // not the taunt holder
    expect(w.tauntTargetId).toBe(a.id);
    expect(w.tauntTimer).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// input edges: aim, cast completion, cooldown gate
// ---------------------------------------------------------------------------

describe('world-branches: input + cast', () => {
  it('a zero aim vector leaves the previous aim untouched', () => {
    const w = solo();
    w.boss = null;
    const p = w.players[0];
    p.aim = { x: 0, y: -1 };
    w.step(DT, new Map([['a', inp({ aim: { x: 0, y: 0 } })]]));
    expect(p.aim).toEqual({ x: 0, y: -1 }); // unchanged
    w.step(DT, new Map([['a', inp({ aim: { x: 1, y: 0 } })]]));
    expect(p.aim.x).toBeCloseTo(1);
    expect(p.aim.y).toBeCloseTo(0);
  });

  it('a cast resolves on completion while alive, but is dropped if stunned mid-cast', () => {
    // Resolves normally.
    const w = makeWorld({ classId: 'mage' });
    w.boss = null;
    w.terrain = [];
    w.obstacles = [];
    const p = w.players[0];
    p.pos = { x: 400, y: 400 };
    w.step(DT, new Map([['a', inp({ aim: { x: 1, y: 0 }, buttons: buttons({ a1: true }) })]]));
    expect(p.castSlot).toBe('a1'); // Fireball is a cast
    for (let i = 0; i < 40 && p.castSlot; i++) w.step(DT, new Map([['a', inp()]]));
    expect(p.castSlot).toBeNull();
    expect(w.projectiles.length).toBeGreaterThan(0); // the cast produced a fireball

    // Stunned mid-cast → the cast completes its timer but never resolves.
    const w2 = makeWorld({ classId: 'mage', seed: 2 });
    w2.boss = null;
    w2.terrain = [];
    w2.obstacles = [];
    const p2 = w2.players[0];
    p2.pos = { x: 400, y: 400 };
    w2.step(DT, new Map([['a', inp({ aim: { x: 1, y: 0 }, buttons: buttons({ a1: true }) })]]));
    expect(p2.castSlot).toBe('a1');
    applyBuff(p2, makeBuff('stun', 0, 5, 'test'));
    for (let i = 0; i < 40 && p2.castSlot; i++) w2.step(DT, new Map([['a', inp()]]));
    expect(p2.castSlot).toBeNull();
    expect(w2.projectiles.length).toBe(0); // stunned: the fireball never fired
  });

  it('an ability on cooldown does not fire again', () => {
    const w = solo();
    w.terrain = [];
    w.obstacles = [];
    const p = w.players[0];
    const boss = w.boss!;
    boss.pos = { x: 800, y: 400 };
    p.pos = { x: 800, y: 500 };
    w.step(DT, new Map([['a', inp({ aim: { x: 0, y: -1 }, buttons: buttons({ basic: true }) })]]));
    const hp1 = boss.hp;
    expect(p.cooldowns.basic).toBeGreaterThan(0);
    // Re-press while still on cooldown: no additional hit.
    p.pos = { x: 800, y: 500 };
    boss.pos = { x: 800, y: 400 };
    p.prevButtons = buttons();
    w.step(DT, new Map([['a', inp({ aim: { x: 0, y: -1 }, buttons: buttons({ basic: true }) })]]));
    expect(boss.hp).toBe(hp1);
  });
});

// ---------------------------------------------------------------------------
// multiclass (item 14)
// ---------------------------------------------------------------------------

describe('world-branches: multiclass swap (requestClassSwap)', () => {
  function multi() {
    const w = makeWorld({
      players: [{ peerId: 'a', name: 'A', classId: 'knight', extraClasses: ['mage', 'cleric'] }],
    });
    w.boss = null;
    w.terrain = [];
    return w;
  }

  it('a targetless request cycles to the next owned class and arms the swap gate', () => {
    const w = multi();
    const p = w.players[0];
    expect(p.classes).toEqual(['knight', 'mage', 'cleric']);
    expect(p.swapCd).toBe(0);
    w.requestClassSwap('a'); // tap → cycle
    expect(p.classId).toBe('mage');
    expect(p.swapCd).toBeGreaterThan(0);
    const cd1 = p.swapCd!;
    // The gate decays on subsequent ticks (and blocks an immediate re-cycle).
    w.step(DT, new Map([['a', inp()]]));
    expect(p.swapCd!).toBeLessThan(cd1);
  });

  it('a targeted request swaps directly to that owned class (the radial)', () => {
    const w = multi();
    const p = w.players[0];
    w.requestClassSwap('a', 'cleric'); // radial release onto Cleric — skips Mage
    expect(p.classId).toBe('cleric');
    expect(p.abilities?.a2.name).toBe(w.players[0].classTables?.cleric?.a2.name);
  });

  it('the swap gate blocks a second swap until it decays', () => {
    const w = multi();
    const p = w.players[0];
    w.requestClassSwap('a', 'mage');
    expect(p.classId).toBe('mage');
    w.requestClassSwap('a', 'cleric'); // gated — swapCd still > 0
    expect(p.classId).toBe('mage');
  });

  it('ignores a target the hero does not own', () => {
    const w = multi();
    const p = w.players[0];
    w.requestClassSwap('a', 'ranger'); // not an owned class
    expect(p.classId).toBe('knight');
    expect(p.swapCd).toBe(0);
  });

  it('a single-class hero ignores a swap request', () => {
    const w = solo();
    w.boss = null;
    const p = w.players[0];
    w.requestClassSwap('a'); // nothing to cycle to
    expect(p.classId).toBe('knight');
    expect(p.swapCd).toBeUndefined();
  });

  it('ignores requests for an unknown or downed peer, and outside a fight', () => {
    const w = multi();
    const p = w.players[0];
    w.requestClassSwap('nobody', 'mage'); // no such peer
    expect(p.classId).toBe('knight');
    p.state = 'downed';
    w.requestClassSwap('a', 'mage'); // downed hero can't swap
    expect(p.classId).toBe('knight');
    p.state = 'alive';
    w.scene = 'reward'; // a calm menu scene, not a live fight
    w.requestClassSwap('a', 'mage');
    expect(p.classId).toBe('knight');
  });

  it('setActiveClass ignores a swap to the class already active', () => {
    const w = multi();
    const p = w.players[0];
    const abilities = p.abilities;
    w.setActiveClass(p, 'knight'); // same class → no-op
    expect(p.classId).toBe('knight');
    expect(p.abilities).toBe(abilities);
    expect(p.swapCd).toBe(0); // gate not armed
  });
});

// ---------------------------------------------------------------------------
// player projectiles: owners, adds, AoE, riders
// ---------------------------------------------------------------------------

describe('world-branches: player projectiles', () => {
  it('an ownerless player shot still damages the boss via mitigation', () => {
    const w = solo();
    w.obstacles = [];
    const boss = w.boss!;
    boss.pos = { x: 800, y: 400 };
    const before = boss.hp;
    w.projectiles = [mkProj(w, { ownerId: 0, pos: { x: 800, y: 400 }, damage: 40, hitRadius: 8 })];
    w.step(DT, new Map());
    expect(boss.hp).toBeLessThan(before);
    expect(w.events.some((e) => e.t === 'hit' && e.side === 'boss')).toBe(true);
  });

  it('on-hit riders (slow + freeze) apply to the struck boss', () => {
    const w = solo();
    w.obstacles = [];
    const boss = w.boss!;
    boss.pos = { x: 800, y: 400 };
    w.projectiles = [
      mkProj(w, {
        ownerId: w.players[0].id,
        pos: { x: 800, y: 400 },
        damage: 10,
        slowMult: 0.5,
        slowDuration: 2,
        freeze: 1,
      }),
    ];
    w.step(DT, new Map());
    expect(boss.buffs.some((b) => b.kind === 'moveSpeed' && b.mult < 1)).toBe(true);
    expect(boss.buffs.some((b) => b.kind === 'stun')).toBe(true);
  });

  it('a plain shot into an add deals damage with no riders (ownerless subtracts directly)', () => {
    const w = solo();
    w.boss = null;
    w.obstacles = [];
    const add = mkAdd(w, { pos: { x: 500, y: 500 } });
    w.adds = [add];
    w.projectiles = [mkProj(w, { ownerId: 0, pos: { x: 500, y: 500 }, damage: 25 })];
    w.step(DT, new Map());
    expect(add.hp).toBe(35); // 60 - 25, subtracted directly (no owner)
    expect(add.buffs.length).toBe(0);
  });

  it('an owner-attributed shot into an add credits the owner', () => {
    const w = solo();
    w.boss = null;
    w.obstacles = [];
    const p = w.players[0];
    const add = mkAdd(w, { pos: { x: 500, y: 500 } });
    w.adds = [add];
    w.projectiles = [mkProj(w, { ownerId: p.id, pos: { x: 500, y: 500 }, damage: 25 })];
    w.step(DT, new Map());
    expect(add.hp).toBeLessThan(60);
    expect(p.stats.damageDealt).toBeGreaterThan(0);
  });

  it('an AoE impact skips dead adds and flashes the fallback blast color for non-fireballs', () => {
    const w = solo();
    w.boss = null;
    w.obstacles = [];
    const live = mkAdd(w, { pos: { x: 500, y: 500 } });
    const dead = mkAdd(w, { pos: { x: 500, y: 500 }, hp: 0 });
    w.adds = [live, dead];
    // kind 'arrow' with an impact radius → the color map misses → fallback color.
    w.projectiles = [
      mkProj(w, {
        ownerId: 0,
        kind: 'arrow',
        pos: { x: 500, y: 500 },
        damage: 30,
        impactRadius: 120,
      }),
    ];
    w.step(DT, new Map());
    expect(live.hp).toBeLessThan(60);
    expect(dead.hp).toBeLessThanOrEqual(0);
    const area = w.events.find((e) => e.t === 'skillArea');
    expect(area && area.t === 'skillArea' ? area.color : 0).toBe(0xff8a3d);
  });

  it('a fireball AoE uses its mapped impact color and hits the boss', () => {
    const w = solo();
    w.obstacles = [];
    const boss = w.boss!;
    boss.pos = { x: 800, y: 400 };
    const before = boss.hp;
    w.projectiles = [
      mkProj(w, {
        ownerId: w.players[0].id,
        kind: 'fireball',
        pos: { x: 800, y: 400 },
        damage: 30,
        impactRadius: 120,
      }),
    ];
    w.step(DT, new Map());
    expect(boss.hp).toBeLessThan(before);
    const area = w.events.find((e) => e.t === 'skillArea');
    expect(area && area.t === 'skillArea' ? area.color : 0).toBe(0xff8a3d);
  });
});

// ---------------------------------------------------------------------------
// boss projectiles
// ---------------------------------------------------------------------------

describe('world-branches: boss projectiles', () => {
  it('a boss bolt skips a downed player, then strikes and chills the next alive one', () => {
    const w = makeWorld({
      players: [
        { peerId: 'a', name: 'A', classId: 'knight' },
        { peerId: 'b', name: 'B', classId: 'ranger' },
      ],
    });
    w.boss = null;
    w.terrain = [];
    const [downed, alive] = w.players;
    downed.state = 'downed';
    downed.hp = 0;
    downed.pos = { x: 500, y: 500 };
    alive.pos = { x: 500, y: 500 };
    const hpBefore = alive.hp;
    w.projectiles = [
      mkProj(w, {
        side: 'boss',
        ownerId: 999,
        pos: { x: 500, y: 500 },
        damage: 20,
        slowMult: 0.5,
        slowDuration: 2,
      }),
    ];
    w.step(DT, new Map());
    expect(alive.hp).toBeLessThan(hpBefore);
    expect(alive.buffs.some((b) => b.kind === 'moveSpeed' && b.mult < 1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ground zones (player-side): boss, adds, slow, ownerless
// ---------------------------------------------------------------------------

describe('world-branches: player ground zones', () => {
  it('a damaging + snaring player zone hits the boss and adds, skipping dead adds', () => {
    const w = solo();
    w.terrain = [];
    w.obstacles = [];
    const boss = w.boss!;
    boss.pos = { x: 800, y: 400 };
    const live = mkAdd(w, { pos: { x: 800, y: 400 } });
    const dead = mkAdd(w, { pos: { x: 800, y: 400 }, hp: 0 });
    w.adds = [live, dead];
    const bossBefore = boss.hp;
    w.groundZones = [
      mkZone(w, {
        side: 'player',
        ownerId: 0, // ownerless
        pos: { x: 800, y: 400 },
        radius: 140,
        damagePerTick: 15,
        slowMult: 0.5,
        slowDuration: 2,
        tickAccum: 0.5, // cross a tick on the first step
      }),
    ];
    w.step(DT, new Map());
    expect(boss.hp).toBeLessThan(bossBefore);
    expect(boss.buffs.some((b) => b.kind === 'moveSpeed' && b.mult < 1)).toBe(true);
    expect(live.hp).toBeLessThan(60);
    expect(live.buffs.some((b) => b.kind === 'moveSpeed' && b.mult < 1)).toBe(true);
    expect(dead.hp).toBeLessThanOrEqual(0);
  });

  it('a boss well outside a player zone is untouched', () => {
    const w = solo();
    w.terrain = [];
    w.obstacles = [];
    const boss = w.boss!;
    boss.pos = { x: 200, y: 200 };
    const before = boss.hp;
    w.groundZones = [
      mkZone(w, {
        side: 'player',
        ownerId: w.players[0].id,
        pos: { x: 1400, y: 800 },
        radius: 100,
        damagePerTick: 40,
        tickAccum: 0.5,
      }),
    ];
    w.step(DT, new Map());
    expect(boss.hp).toBe(before); // out of range, no damage
  });
});

// ---------------------------------------------------------------------------
// terrain hazards + surge
// ---------------------------------------------------------------------------

describe('world-branches: terrain', () => {
  it('terrain slow + burn respects terrainResist (applied at 0, ignored at 1)', () => {
    const w = makeWorld({
      players: [
        { peerId: 'a', name: 'A', classId: 'knight' },
        { peerId: 'b', name: 'B', classId: 'ranger' },
      ],
    });
    w.boss = null;
    w.obstacles = [];
    const [normal, immune] = w.players;
    normal.terrainResist = 0;
    immune.terrainResist = 1;
    normal.pos = { x: 500, y: 500 };
    immune.pos = { x: 500, y: 500 };
    const immuneHpBefore = immune.hp;
    const normalHpBefore = normal.hp;
    w.terrain = [
      mkTerrain(w, {
        kind: 'swamp',
        pos: { x: 500, y: 500 },
        radius: 150,
        slowMult: 0.4,
        slowDuration: 2,
        damagePerTick: 12,
        tickAccum: 0.5,
      }),
    ];
    w.step(DT, new Map());
    expect(normal.buffs.some((b) => b.kind === 'moveSpeed' && b.source === 'terrain')).toBe(true);
    expect(normal.hp).toBeLessThan(normalHpBefore);
    expect(immune.buffs.some((b) => b.source === 'terrain')).toBe(false);
    expect(immune.hp).toBe(immuneHpBefore); // fully resisted
  });

  it('an abyss patch surges: it schedules a pull-strike that plunges a caught hero', () => {
    const w = solo();
    w.boss = null;
    w.obstacles = [];
    const p = w.players[0];
    p.pos = { x: 500, y: 500 };
    w.terrain = [
      mkTerrain(w, {
        kind: 'abyss',
        pos: { x: 500, y: 500 },
        radius: 160,
        lethalRadius: 80,
        surgeAccum: 7.5, // at the surge threshold → fires on the first tick
      }),
    ];
    w.step(DT, new Map());
    expect(w.pendingStrikes.length).toBeGreaterThan(0); // a surge was scheduled
    // Let the telegraphed surge detonate and drag the hero into the lethal core.
    for (let i = 0; i < 60 && p.state === 'alive'; i++) {
      p.pos = { x: 500, y: 500 };
      w.step(DT, new Map([['a', inp()]]));
    }
    expect(p.state).not.toBe('alive'); // plunged into the void
  });

  it('a tide patch (no surgeAccum yet) seeds its accumulator without surging immediately', () => {
    const w = solo();
    w.boss = null;
    w.obstacles = [];
    w.terrain = [mkTerrain(w, { kind: 'tide', pos: { x: 500, y: 500 }, radius: 160 })];
    w.step(DT, new Map());
    // Far below the 7.5s interval → no strike yet, but the accumulator now exists.
    expect(w.pendingStrikes.length).toBe(0);
    expect(w.terrain[0].surgeAccum).toBeGreaterThan(-1);
  });
});

// ---------------------------------------------------------------------------
// pending strikes
// ---------------------------------------------------------------------------

describe('world-branches: pending strikes', () => {
  it('a detonating strike with a slow rider mires whoever it catches', () => {
    const w = solo();
    w.boss = null;
    w.terrain = [];
    w.obstacles = [];
    const p = w.players[0];
    p.pos = { x: 500, y: 500 };
    const hpBefore = p.hp;
    w.addPendingStrike({
      pos: { x: 500, y: 500 },
      radius: 120,
      fuse: 0.01,
      damage: 20,
      slowMult: 0.5,
      slowDuration: 2,
    });
    w.step(DT, new Map([['a', inp()]]));
    expect(p.hp).toBeLessThan(hpBefore);
    expect(p.buffs.some((b) => b.kind === 'moveSpeed' && b.source === 'strikeSlow')).toBe(true);
  });

  it('a plain strike (no slow) still damages, without a slow buff', () => {
    const w = solo();
    w.boss = null;
    w.terrain = [];
    w.obstacles = [];
    const p = w.players[0];
    p.pos = { x: 500, y: 500 };
    w.addPendingStrike({ pos: { x: 500, y: 500 }, radius: 120, fuse: 0.01, damage: 20 });
    w.step(DT, new Map([['a', inp()]]));
    expect(p.buffs.some((b) => b.source === 'strikeSlow')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// spawnAddWave (both defaulted + explicit opts)
// ---------------------------------------------------------------------------

describe('world-branches: spawnAddWave', () => {
  it('spawns with default hp/radius when no options are given', () => {
    const w = solo();
    w.adds = [];
    w.spawnAddWave({ x: 800, y: 500 }, 3);
    expect(w.adds.length).toBe(3);
    expect(w.adds[0].maxHp).toBe(60); // ADD_HP × 1
    expect(w.events.filter((e) => e.t === 'spawn').length).toBe(3);
  });

  it('honours explicit hp/speed/radius options', () => {
    const w = solo();
    w.adds = [];
    w.spawnAddWave({ x: 800, y: 500 }, 2, { hpMult: 0.5, speedMult: 2, minR: 40, maxR: 60 });
    expect(w.adds.length).toBe(2);
    expect(w.adds[0].maxHp).toBe(30); // ADD_HP × 0.5
  });
});

// ---------------------------------------------------------------------------
// adds without a live target
// ---------------------------------------------------------------------------

describe('world-branches: adds', () => {
  it('an add with no living player to chase just idles in place', () => {
    const w = solo();
    w.boss = null;
    w.terrain = [];
    w.obstacles = [];
    const p = w.players[0];
    p.state = 'dead';
    const add = mkAdd(w, { pos: { x: 500, y: 500 } });
    w.adds = [add];
    w.finished = false;
    w.step(DT, new Map());
    // No target → no movement toward anyone.
    expect(add.pos.x).toBeCloseTo(500);
    expect(add.pos.y).toBeCloseTo(500);
  });

  it('a dead add emits a death event and is culled', () => {
    const w = solo();
    w.boss = null;
    const add = mkAdd(w, { pos: { x: 500, y: 500 }, hp: 0 });
    w.adds = [add];
    w.step(DT, new Map());
    expect(w.adds.length).toBe(0);
    expect(w.events.some((e) => e.t === 'death' && e.kind === 'add')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// phoenix charm (self-revive)
// ---------------------------------------------------------------------------

describe('world-branches: phoenix charm', () => {
  it('a self-revive springs a fallen hero back up once, then normal downing resumes', () => {
    const w = makeWorld({
      players: [{ peerId: 'a', name: 'A', classId: 'knight', ephemeral: { revives: 1 } }],
    });
    w.boss = null;
    w.terrain = [];
    const p = w.players[0];
    expect(p.selfRevives).toBe(1);

    p.hp = 0;
    w.step(DT, new Map());
    expect(p.state).toBe('alive'); // sprang back up
    expect(p.hp).toBeGreaterThan(0);
    expect(p.selfRevives).toBe(0);
    expect(p.buffs.some((b) => b.kind === 'invuln')).toBe(true);
    expect(w.events.some((e) => e.t === 'revive')).toBe(true);

    // No charges left → the next lethal blow downs normally.
    p.hp = 0;
    w.step(DT, new Map());
    expect(p.state).toBe('downed');
    expect(p.stats.deaths).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// forceFinish / result / end conditions
// ---------------------------------------------------------------------------

describe('world-branches: finish + result', () => {
  it('forceFinish is idempotent and freezes further stepping', () => {
    const w = solo();
    w.forceFinish('defeat');
    expect(w.finished).toBe(true);
    expect(w.outcome).toBe('defeat');
    const endMs = w.endMs;
    w.forceFinish('victory'); // already finished → ignored
    expect(w.outcome).toBe('defeat');
    expect(w.endMs).toBe(endMs);
    const tick = w.tick;
    w.step(DT, new Map()); // finished → returns immediately
    expect(w.tick).toBe(tick);
  });

  it('result() defaults to a defeat (no coins) before the fight resolves', () => {
    const w = solo();
    const r = w.result();
    expect(r.outcome).toBe('defeat');
    expect(r.stats[0].coins).toBe(0);
  });

  it('a won fight ranks coins by participation for the survivors', () => {
    const w = solo();
    const p = w.players[0];
    p.stats.damageDealt = 500;
    w.boss!.hp = 0;
    w.step(DT, new Map([['a', inp()]]));
    expect(w.outcome).toBe('victory');
    const r = w.result();
    expect(r.outcome).toBe('victory');
    expect(r.stats[0].coins).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// serialization: boss telegraphs per ability shape
// ---------------------------------------------------------------------------

describe('world-branches: telegraph serialization', () => {
  function windup(w: World, abilityId: string) {
    const b = w.boss!;
    b.action = {
      kind: 'windup',
      abilityId,
      remaining: 1,
      total: 1.2,
      targetId: w.players[0].id,
      targetPos: { x: b.pos.x + 50, y: b.pos.y + 50 },
      aimAngle: 0.5,
      channelAccum: 0,
    };
  }

  it('cone / circleAtTarget / pbaoe telegraphs (dragon)', () => {
    const w = solo();
    const b = w.boss!;
    windup(w, 'fireBreath');
    expect(w.serialize().bosses[0].telegraph?.kind).toBe('cone');
    windup(w, 'fireball');
    expect(w.serialize().bosses[0].telegraph?.kind).toBe('circle');
    windup(w, 'tailSweep');
    const pbaoe = w.serialize().bosses[0].telegraph!;
    expect(pbaoe.kind).toBe('circle');
    expect(pbaoe.target).toEqual({ ...b.pos }); // pbaoe recentres on the boss
  });

  it('line + summon telegraphs, and projectile/voidzone shapes have none', () => {
    const w = makeWorld({ monsterId: 'lich' });
    windup(w, 'summonSkeletons');
    expect(w.serialize().bosses[0].telegraph?.kind).toBe('circle');
    windup(w, 'lifeDrain'); // beam → line
    expect(w.serialize().bosses[0].telegraph?.kind).toBe('line');
    windup(w, 'shadowBolt'); // projectile → no ground telegraph
    expect(w.serialize().bosses[0].telegraph).toBeNull();
    windup(w, 'voidZone'); // voidzones → no ground telegraph
    expect(w.serialize().bosses[0].telegraph).toBeNull();

    const wt = makeWorld({ monsterId: 'troll' });
    windup(wt, 'charge'); // line
    expect(wt.serialize().bosses[0].telegraph?.kind).toBe('line');
  });

  it('an idle boss, a null ability id, and a corpse all telegraph nothing', () => {
    const w = solo();
    const b = w.boss!;
    expect(w.serialize().bosses[0].telegraph).toBeNull(); // idle
    b.action = {
      kind: 'windup',
      abilityId: null,
      remaining: 1,
      total: 1,
      targetId: null,
      targetPos: null,
      aimAngle: 0,
      channelAccum: 0,
    };
    expect(w.serialize().bosses[0].telegraph).toBeNull(); // no ability id
    windup(w, 'fireBreath');
    b.hp = 0;
    expect(w.serialize().bosses[0].telegraph).toBeNull(); // corpse
  });
});

// ---------------------------------------------------------------------------
// totem views
// ---------------------------------------------------------------------------

describe('world-branches: totem views', () => {
  it('reports proximity for a known hero and inert views for an unknown id', () => {
    const w = new World({
      monsterId: 'dummy',
      seed: 3,
      players: [{ peerId: 'me', name: 'Me', classId: 'knight' }],
      practice: true,
    });
    const p = w.players[0];
    const totem = w.totems[0];
    p.pos = { x: totem.pos.x, y: totem.pos.y };
    expect(w.totemViews(p.id).find((t) => t.id === totem.id)?.active).toBe(true);
    // Unknown local id → no "me" → nothing is active.
    expect(w.totemViews(9999).every((t) => t.active === false)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// boss regen (troll): lockout + enrage multiplier
// ---------------------------------------------------------------------------

describe('world-branches: boss regen', () => {
  it('a wounded, undisturbed troll knits itself back together', () => {
    const w = makeWorld({ monsterId: 'troll' });
    w.terrain = [];
    const boss = w.boss!;
    boss.regenLockout = undefined; // exercise the `?? 0` fallback
    boss.hp = boss.maxHp - 500;
    boss.decisionTimer = 100; // keep it from acting
    const before = boss.hp;
    for (let i = 0; i < 30; i++) w.step(DT, new Map());
    expect(boss.hp).toBeGreaterThan(before);
  });

  it('regen is suppressed while the lockout is up', () => {
    const w = makeWorld({ monsterId: 'troll' });
    w.terrain = [];
    const boss = w.boss!;
    boss.hp = boss.maxHp - 500;
    boss.regenLockout = 5; // freshly damaged
    boss.decisionTimer = 100;
    const before = boss.hp;
    w.step(DT, new Map());
    expect(boss.hp).toBe(before); // no regen this tick
  });

  it('an enraged troll regenerates on the enrage multiplier', () => {
    const w = makeWorld({ monsterId: 'troll' });
    w.terrain = [];
    const boss = w.boss!;
    boss.phase = 'enraged';
    boss.regenLockout = 0;
    boss.hp = boss.maxHp - 500;
    boss.decisionTimer = 100;
    const before = boss.hp;
    for (let i = 0; i < 20; i++) w.step(DT, new Map());
    expect(boss.hp).toBeGreaterThan(before);
  });
});

// ---------------------------------------------------------------------------
// boss channel (lich Life Drain beam)
// ---------------------------------------------------------------------------

describe('world-branches: boss channel', () => {
  it('a beam channel drains the target then recovers, banking its cooldown', () => {
    const w = makeWorld({ monsterId: 'lich' });
    w.terrain = [];
    const boss = w.boss!;
    const p = w.players[0];
    boss.pos = { x: 800, y: 300 };
    p.pos = { x: 800, y: 350 };
    const hpBefore = p.hp;
    boss.action = {
      kind: 'channel',
      abilityId: 'lifeDrain',
      remaining: 0.02,
      total: 1,
      targetId: p.id,
      targetPos: { ...p.pos },
      aimAngle: 0,
      channelAccum: 0.5,
    };
    w.step(DT, new Map([['a', inp()]]));
    expect(p.hp).toBeLessThan(hpBefore);
    expect(boss.action.kind).toBe('recover');
    expect(boss.cooldowns.lifeDrain).toBeGreaterThan(0);
  });

  it('a channel with no ability id just recovers harmlessly', () => {
    const w = makeWorld({ monsterId: 'lich' });
    w.terrain = [];
    const boss = w.boss!;
    const p = w.players[0];
    boss.pos = { x: 800, y: 300 };
    p.pos = { x: 800, y: 350 };
    const hpBefore = p.hp;
    boss.action = {
      kind: 'channel',
      abilityId: null,
      remaining: 0.02,
      total: 1,
      targetId: p.id,
      targetPos: { ...p.pos },
      aimAngle: 0,
      channelAccum: 0.5,
    };
    w.step(DT, new Map([['a', inp()]]));
    expect(p.hp).toBe(hpBefore); // no beam ticked
    expect(boss.action.kind).toBe('recover');
  });
});

// ---------------------------------------------------------------------------
// endless "type" modifier auras
// ---------------------------------------------------------------------------

describe('world-branches: modifier auras', () => {
  function auraWorld(aura: string, seed = 5) {
    const w = makeWorld({
      seed,
      players: [
        { peerId: 'a', name: 'A', classId: 'knight' },
        { peerId: 'b', name: 'B', classId: 'ranger' },
      ],
    });
    w.terrain = [];
    w.obstacles = [];
    const boss = w.boss!;
    boss.decisionTimer = 100; // don't let the boss act
    boss.modAura = aura;
    boss.modAuraTimer = 5; // over the ~3.5s interval → fires on the next tick
    // A second, downed hero exercises the "not alive" side of each aura loop.
    const other = w.players[1];
    other.state = 'downed';
    other.hp = 0;
    other.downedTimer = 100;
    other.pos = { x: 50, y: 950 };
    return w;
  }

  it('ember scorches nearby heroes', () => {
    const w = auraWorld('ember');
    const boss = w.boss!;
    const p = w.players[0];
    p.pos = { x: boss.pos.x, y: boss.pos.y + 100 };
    const before = p.hp;
    w.step(DT, new Map([['a', inp()]]));
    expect(p.hp).toBeLessThan(before);
    expect(w.events.some((e) => e.t === 'telegraph')).toBe(true);
  });

  it('shadow knits the boss back together', () => {
    const w = auraWorld('shadow');
    const boss = w.boss!;
    boss.hp = boss.maxHp - 200;
    const before = boss.hp;
    w.step(DT, new Map([['a', inp()]]));
    expect(boss.hp).toBeGreaterThan(before);
  });

  it('venom poisons and slows nearby heroes (with a twin damage scale)', () => {
    const w = auraWorld('venom');
    const boss = w.boss!;
    boss.dmgScale = 0.5; // exercise the dmgScale branch
    const p = w.players[0];
    p.pos = { x: boss.pos.x, y: boss.pos.y + 120 };
    const before = p.hp;
    w.step(DT, new Map([['a', inp()]]));
    expect(p.hp).toBeLessThan(before);
    expect(p.buffs.some((b) => b.kind === 'moveSpeed' && b.source === 'modVenom')).toBe(true);
  });

  it('storm arcs onto a random hero', () => {
    const w = auraWorld('storm');
    const boss = w.boss!;
    const p = w.players[0];
    p.pos = { x: boss.pos.x, y: boss.pos.y + 60 };
    const before = p.hp;
    w.step(DT, new Map([['a', inp()]]));
    expect(p.hp).toBeLessThan(before);
  });

  it('a boss with no modifier aura is unaffected', () => {
    const w = solo();
    w.terrain = [];
    const boss = w.boss!;
    boss.decisionTimer = 100;
    const p = w.players[0];
    p.pos = { x: boss.pos.x, y: boss.pos.y + 100 };
    const before = p.hp;
    w.step(DT, new Map([['a', inp()]]));
    expect(p.hp).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// boss decision / execution / instant abilities
// ---------------------------------------------------------------------------

describe('world-branches: boss decisions', () => {
  it('with every hero down, the dragon still commits a fireball at no target', () => {
    const w = solo();
    w.terrain = [];
    const boss = w.boss!;
    const p = w.players[0];
    p.state = 'dead';
    boss.decisionTimer = 0.01; // force a decision this tick
    w.step(DT, new Map());
    expect(boss.action.kind).toBe('windup');
    expect(boss.action.abilityId).toBe('fireball');
    expect(boss.action.targetId).toBeNull(); // no target to lock
  });

  it('a troll charge locks a line target and caps its length', () => {
    const w = makeWorld({ monsterId: 'troll' });
    w.terrain = [];
    w.obstacles = [];
    const boss = w.boss!;
    boss.pos = { x: 400, y: 300 };
    const p = w.players[0];
    p.pos = { x: 900, y: 300 }; // well out of melee → charge
    boss.decisionTimer = 0.01;
    w.step(DT, new Map());
    expect(boss.action.abilityId).toBe('charge');
    expect(boss.action.targetId).toBe(p.id);
    expect(boss.action.targetPos).not.toBeNull();
  });

  it('an instant boss ability resolves immediately and recovers', () => {
    const w = makeWorld({ monsterId: 'lich' });
    w.terrain = [];
    w.obstacles = [];
    const boss = w.boss!;
    const p = w.players[0];
    boss.pos = { x: 800, y: 300 };
    p.pos = { x: 820, y: 340 };
    // Only Shadow Bolt (windup 0) available.
    boss.cooldowns.summonSkeletons = 20;
    boss.cooldowns.voidZone = 20;
    boss.cooldowns.lifeDrain = 20;
    boss.cooldowns.shadowBolt = 0;
    boss.blinkTimer = 20; // don't blink away first
    boss.decisionTimer = 0.01;
    w.step(DT, new Map());
    // Instant resolve → a shadow bolt projectile is in flight and the boss recovers.
    expect(w.projectiles.some((pr) => pr.side === 'boss')).toBe(true);
    expect(boss.cooldowns.shadowBolt).toBeGreaterThan(0);
  });

  it('bossExecute recovers on a null / unknown ability id', () => {
    const w = solo();
    w.terrain = [];
    const boss = w.boss!;
    boss.action = {
      kind: 'windup',
      abilityId: null,
      remaining: 0.01,
      total: 1,
      targetId: null,
      targetPos: null,
      aimAngle: 0,
      channelAccum: 0,
    };
    w.step(DT, new Map());
    expect(boss.action.kind).toBe('recover');

    boss.action = {
      kind: 'windup',
      abilityId: 'notAnAbility',
      remaining: 0.01,
      total: 1,
      targetId: null,
      targetPos: null,
      aimAngle: 0,
      channelAccum: 0,
    };
    w.step(DT, new Map());
    expect(boss.action.kind).toBe('recover');
  });
});

// ---------------------------------------------------------------------------
// fairness governor (telegraph walling)
// ---------------------------------------------------------------------------

describe('world-branches: fairness governor', () => {
  it('a boss defers a line attack that would stack on a pending strike', () => {
    const w = makeWorld({ monsterId: 'troll' });
    w.terrain = [];
    w.obstacles = [];
    const boss = w.boss!;
    boss.pos = { x: 400, y: 300 };
    const p = w.players[0];
    p.pos = { x: 900, y: 300 };
    boss.decisionTimer = 0.01;
    // A hostile telegraph already threatening the charge's impact (the target).
    w.addPendingStrike({ pos: { x: 900, y: 300 }, radius: 120, fuse: 5, damage: 10 });
    w.step(DT, new Map());
    expect(boss.action.kind).toBe('idle'); // deferred, no wind-up started
  });

  it('an enraged boss walls deliberately (ignores the fairness gap)', () => {
    const w = makeWorld({ monsterId: 'troll' });
    w.terrain = [];
    w.obstacles = [];
    const boss = w.boss!;
    boss.phase = 'enraged';
    boss.pos = { x: 400, y: 300 };
    const p = w.players[0];
    p.pos = { x: 900, y: 300 };
    boss.decisionTimer = 0.01;
    w.addPendingStrike({ pos: { x: 900, y: 300 }, radius: 120, fuse: 5, damage: 10 });
    w.step(DT, new Map());
    expect(boss.action.kind).toBe('windup'); // enrage overrides the deferral
  });

  it('a pbaoe defers around the boss itself when a strike overlaps it', () => {
    const w = makeWorld({ monsterId: 'troll' });
    w.terrain = [];
    w.obstacles = [];
    const boss = w.boss!;
    boss.pos = { x: 500, y: 300 };
    const p = w.players[0];
    p.pos = { x: 900, y: 300 }; // out of melee
    boss.cooldowns.charge = 20; // force the pbaoe Ground Slam instead of Charge
    boss.decisionTimer = 0.01;
    w.addPendingStrike({ pos: { x: 505, y: 300 }, radius: 120, fuse: 5, damage: 10 });
    w.step(DT, new Map());
    expect(boss.action.kind).toBe('idle');
  });
});

// ---------------------------------------------------------------------------
// boss blink (lich / teleport affix)
// ---------------------------------------------------------------------------

describe('world-branches: boss blink', () => {
  it('blinks away from a crowding hero, randomising the direction when stacked', () => {
    const w = makeWorld({ monsterId: 'lich' });
    w.terrain = [];
    w.obstacles = [];
    const boss = w.boss!;
    const p = w.players[0];
    boss.pos = { x: 800, y: 400 };
    p.pos = { x: 800, y: 400 }; // exactly on top → zero direction → random blink
    boss.blinkTimer = 0;
    boss.decisionTimer = 100;
    w.step(DT, new Map([['a', inp()]]));
    expect(w.events.some((e) => e.t === 'blink')).toBe(true);
    expect(boss.blinkTimer).toBeGreaterThan(0);
  });

  it('does not blink when there is no living hero to flee', () => {
    const w = makeWorld({ monsterId: 'lich' });
    w.terrain = [];
    const boss = w.boss!;
    const p = w.players[0];
    p.state = 'dead';
    boss.blinkTimer = 0;
    boss.decisionTimer = 100;
    w.step(DT, new Map());
    expect(w.events.some((e) => e.t === 'blink')).toBe(false);
  });

  it('the Teleporting affix shortens a real blinker’s internal cooldown', () => {
    const plain = makeWorld({ monsterId: 'lich', seed: 7 });
    const affixed = makeWorld({ monsterId: 'lich', seed: 7, bossAffixes: [['teleporting']] });
    for (const w of [plain, affixed]) {
      w.terrain = [];
      w.obstacles = [];
      const boss = w.boss!;
      const p = w.players[0];
      boss.pos = { x: 800, y: 400 };
      p.pos = { x: 850, y: 400 };
      boss.blinkTimer = 0;
      boss.decisionTimer = 100;
      w.step(DT, new Map([['a', inp()]]));
    }
    // Both blinked; the affixed lich's cooldown is the shorter (× 0.6).
    expect(affixed.boss!.blinkTimer).toBeLessThan(plain.boss!.blinkTimer);
  });
});

// ---------------------------------------------------------------------------
// boss cooldown scaling: enrage + frenzied affix
// ---------------------------------------------------------------------------

describe('world-branches: boss cooldown scaling', () => {
  function executeTailSweep(w: World): number {
    const boss = w.boss!;
    const p = w.players[0];
    boss.pos = { x: 800, y: 400 };
    p.pos = { x: 800, y: 460 };
    boss.action = {
      kind: 'windup',
      abilityId: 'tailSweep',
      remaining: 0.01,
      total: 0.9,
      targetId: p.id,
      targetPos: { ...p.pos },
      aimAngle: Math.PI / 2,
      channelAccum: 0,
    };
    w.step(DT, new Map([['a', inp()]]));
    return boss.cooldowns.tailSweep;
  }

  it('a normal-phase boss banks the full base cooldown', () => {
    const w = solo();
    w.terrain = [];
    w.obstacles = [];
    expect(executeTailSweep(w)).toBeCloseTo(8, 1); // Tail Sweep base cd
  });

  it('an enraged boss banks a shorter cooldown', () => {
    const w = solo({ seed: 2 });
    w.terrain = [];
    w.obstacles = [];
    w.boss!.phase = 'enraged';
    expect(executeTailSweep(w)).toBeCloseTo(8 * 0.7, 1); // × enrageCooldownMult
  });

  it('a Frenzied boss below half HP fires faster; above half it is normal', () => {
    const low = solo({ seed: 3 });
    low.terrain = [];
    low.obstacles = [];
    low.boss!.affixes = ['frenzied'];
    low.boss!.hp = low.boss!.maxHp * 0.3; // below half → cooldown reduction
    const lowCd = executeTailSweep(low);
    expect(lowCd).toBeLessThan(8);
    expect(lowCd).toBeGreaterThan(8 * 0.7);

    const high = solo({ seed: 4 });
    high.terrain = [];
    high.obstacles = [];
    high.boss!.affixes = ['frenzied'];
    high.boss!.hp = high.boss!.maxHp * 0.8; // above half → no reduction
    expect(executeTailSweep(high)).toBeCloseTo(8, 1);
  });
});

// ---------------------------------------------------------------------------
// affix upkeep (molten / warding / splitting / barbed / accelerating)
// ---------------------------------------------------------------------------

describe('world-branches: affix upkeep', () => {
  function affixWorld(seed = 9) {
    const w = solo({
      seed,
      bossAffixes: [['molten', 'warding', 'splitting', 'barbed', 'accelerating']],
    });
    w.terrain = [];
    w.obstacles = [];
    const boss = w.boss!;
    boss.decisionTimer = 100;
    boss.pos = { x: 800, y: 400 };
    return w;
  }

  it('below their cadence only the always-on haste refreshes', () => {
    const w = affixWorld();
    const boss = w.boss!;
    w.adds = [];
    w.groundZones = [];
    w.step(DT, new Map([['a', inp()]]));
    expect(boss.buffs.some((b) => b.kind === 'moveSpeed' && b.source === 'affixAccel')).toBe(true);
    expect(w.adds.length).toBe(0); // splitting hasn't reached its interval
    expect(w.groundZones.length).toBe(0); // molten hasn't either
    expect(boss.buffs.some((b) => b.source === 'affixWard')).toBe(false);
  });

  it('at cadence it trails fire, wards, splits and lashes out with thorns', () => {
    const w = affixWorld(10);
    const boss = w.boss!;
    const p = w.players[0];
    p.pos = { x: 800, y: 420 }; // inside the barbed radius
    w.adds = [];
    w.groundZones = [];
    boss.recentDamageTaken = 200; // fuels the barbed pulse
    boss.affixTimers = { molten: 5, warding: 100, splitting: 100, barbed: 100 };
    const hpBefore = p.hp;
    w.step(DT, new Map([['a', inp()]]));
    expect(w.groundZones.length).toBeGreaterThan(0); // molten trail
    expect(boss.buffs.some((b) => b.source === 'affixWard')).toBe(true);
    expect(w.adds.length).toBeGreaterThan(0); // split wave
    expect(p.hp).toBeLessThan(hpBefore); // barbed thorns
  });

  it('a stunned boss still smoulders + wards but cannot split or lash out', () => {
    const w = affixWorld(11);
    const boss = w.boss!;
    const p = w.players[0];
    p.pos = { x: 800, y: 420 };
    w.adds = [];
    w.groundZones = [];
    boss.recentDamageTaken = 200;
    boss.affixTimers = { molten: 5, warding: 100, splitting: 100, barbed: 100 };
    applyBuff(boss, makeBuff('stun', 0, 3, 'test'));
    const hpBefore = p.hp;
    w.step(DT, new Map([['a', inp()]]));
    expect(w.groundZones.length).toBeGreaterThan(0); // passive molten runs
    expect(boss.buffs.some((b) => b.source === 'affixWard')).toBe(true); // passive ward runs
    expect(w.adds.length).toBe(0); // active split paused
    expect(p.hp).toBe(hpBefore); // active barbed paused
  });

  it('a barbed pulse with negligible soaked damage does nothing', () => {
    const w = solo({ seed: 12, bossAffixes: [['barbed']] });
    w.terrain = [];
    w.obstacles = [];
    const boss = w.boss!;
    boss.decisionTimer = 100;
    const p = w.players[0];
    p.pos = { x: boss.pos.x, y: boss.pos.y + 20 };
    boss.recentDamageTaken = 0; // base ≤ 1 → the pulse bails out
    boss.affixTimers = { barbed: 100 };
    const before = p.hp;
    w.step(DT, new Map([['a', inp()]]));
    expect(p.hp).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// vampiric + volatile affix reactions
// ---------------------------------------------------------------------------

describe('world-branches: vampiric + volatile', () => {
  function execute(w: World, abilityId: string, targetPos: { x: number; y: number } | null) {
    const boss = w.boss!;
    const p = w.players[0];
    boss.action = {
      kind: 'windup',
      abilityId,
      remaining: 0.01,
      total: 1,
      targetId: p.id,
      targetPos,
      aimAngle: Math.PI / 2,
      channelAccum: 0,
    };
    w.step(DT, new Map([['a', inp()]]));
  }

  it('a Vampiric hit heals the boss and emits a heal; a pbaoe leaves a Volatile pool', () => {
    const w = solo({ seed: 13, bossAffixes: [['vampiric', 'volatile']] });
    w.terrain = [];
    w.obstacles = [];
    w.groundZones = [];
    const boss = w.boss!;
    const p = w.players[0];
    boss.pos = { x: 800, y: 400 };
    p.pos = { x: 800, y: 460 };
    boss.hp = boss.maxHp * 0.5; // room to heal
    const hpBefore = boss.hp;
    const pHpBefore = p.hp;
    execute(w, 'tailSweep', { ...p.pos }); // pbaoe
    expect(p.hp).toBeLessThan(pHpBefore); // it dealt damage
    expect(boss.hp).toBeGreaterThan(hpBefore); // vampiric heal
    expect(w.events.some((e) => e.t === 'heal' && e.targetId === boss.id)).toBe(true);
    expect(w.groundZones.some((z) => z.side === 'boss')).toBe(true); // volatile pool
  });

  it('Volatile salts the floor for cone + circle impacts but not projectiles', () => {
    // Cone (fireBreath) → pool at an offset from the boss.
    const cone = solo({ seed: 14, bossAffixes: [['volatile']] });
    cone.terrain = [];
    cone.obstacles = [];
    cone.groundZones = [];
    cone.boss!.pos = { x: 800, y: 400 };
    cone.players[0].pos = { x: 800, y: 470 };
    execute(cone, 'fireBreath', { x: 800, y: 470 });
    expect(cone.groundZones.some((z) => z.side === 'boss')).toBe(true);

    // circleAtTarget (fireball) with a target position.
    const circle = solo({ seed: 15, bossAffixes: [['volatile']] });
    circle.terrain = [];
    circle.obstacles = [];
    circle.groundZones = [];
    circle.boss!.pos = { x: 800, y: 400 };
    circle.players[0].pos = { x: 700, y: 400 };
    execute(circle, 'fireball', { x: 700, y: 400 });
    expect(circle.groundZones.some((z) => z.side === 'boss')).toBe(true);

    // circleAtTarget with a NULL target position → salts under the boss.
    const noTarget = solo({ seed: 16, bossAffixes: [['volatile']] });
    noTarget.terrain = [];
    noTarget.obstacles = [];
    noTarget.groundZones = [];
    noTarget.boss!.pos = { x: 800, y: 400 };
    execute(noTarget, 'fireball', null);
    expect(noTarget.groundZones.some((z) => z.side === 'boss')).toBe(true);

    // Projectile (lich shadowBolt) → nothing to salt.
    const proj = makeWorld({ monsterId: 'lich', seed: 17, bossAffixes: [['volatile']] });
    proj.terrain = [];
    proj.obstacles = [];
    proj.groundZones = [];
    proj.boss!.pos = { x: 800, y: 400 };
    proj.players[0].pos = { x: 800, y: 460 };
    execute(proj, 'shadowBolt', { x: 800, y: 460 });
    expect(proj.groundZones.some((z) => z.side === 'boss')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// boss-vs-boss synergy (twin bond)
// ---------------------------------------------------------------------------

describe('world-branches: pack synergy bond', () => {
  it('a twin pack forms, telegraphs and resolves a bond over time', () => {
    const w = makeWorld({ monsterId: 'dragon', seed: 21, coBosses: ['troll'] });
    w.terrain = [];
    w.obstacles = [];
    // Keep both bosses pinned and full so the bond can wind up and land.
    let sawBondTelegraph = false;
    let sawResolvedBond = false;
    for (let i = 0; i < 240; i++) {
      for (const b of w.bosses) {
        b.hp = b.maxHp;
        b.pos = { x: 400 + b.id * 60, y: 300 };
      }
      w.step(DT, new Map());
      if (w.bond) {
        const snap = w.serialize();
        if (snap.telegraphs?.some((t) => t.kind === 'line')) sawBondTelegraph = true;
      }
      if (
        w.events.some(
          (e) => e.t === 'cast' && (e.ability === 'Empower Pack' || e.ability === 'Ward Pack'),
        )
      ) {
        sawResolvedBond = true;
      }
      if (sawBondTelegraph && sawResolvedBond) break;
    }
    expect(sawBondTelegraph).toBe(true);
    expect(sawResolvedBond).toBe(true);
  });

  it('killing a bonded boss mid wind-up cancels the pulse', () => {
    const w = makeWorld({ monsterId: 'dragon', seed: 22, coBosses: ['troll'] });
    w.terrain = [];
    w.obstacles = [];
    for (let i = 0; i < 260 && !w.bond; i++) {
      for (const b of w.bosses) {
        b.hp = b.maxHp;
        b.pos = { x: 400 + b.id * 60, y: 300 };
      }
      w.step(DT, new Map());
    }
    expect(w.bond).not.toBeNull();
    // Kill one end of the forming bond → the next step cancels it.
    w.bosses[0].hp = 0;
    w.step(DT, new Map());
    expect(w.bond).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// scene mode (diegetic menu world) + item edge cases
// ---------------------------------------------------------------------------

describe('world-branches: scene mode', () => {
  it('a reward scene is heroes-only: no boss, inert abilities, never resolves', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 41,
      players: [{ peerId: 'a', name: 'A', classId: 'mage' }],
      scene: 'reward',
    });
    expect(w.scene).toBe('reward');
    expect(w.bosses.length).toBe(0);
    expect(w.boss).toBeNull();
    expect(w.terrain.length).toBe(0);
    const p = w.players[0];
    const startX = p.pos.x;
    // Movement is free; the ability + item buttons are inert inside a scene.
    w.step(
      DT,
      new Map([['a', inp({ move: { x: 1, y: 0 }, buttons: buttons({ a1: true, item: true }) })]]),
    );
    expect(p.pos.x).toBeGreaterThan(startX); // walked
    expect(w.projectiles.length).toBe(0); // abilities inert
    expect(p.castSlot).toBeNull();
    // Even with no heroes standing the scene never flips to a defeat.
    p.state = 'dead';
    w.step(DT, new Map());
    expect(w.finished).toBe(false);
  });
});

describe('world-branches: hardcore setup', () => {
  it('a hardcore fight caps its revive budget', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 42,
      hardcore: true,
      players: [{ peerId: 'a', name: 'A', classId: 'knight' }],
    });
    expect(w.hardcore).toBe(true);
    expect(w.reviveBudget).toBe(2); // HARDCORE_REVIVES_PER_FIGHT
    // Practice/scene flags force hardcore back off (guarded at construction).
    const calm = new World({
      monsterId: 'dummy',
      seed: 42,
      hardcore: true,
      practice: true,
      players: [{ peerId: 'a', name: 'A', classId: 'knight' }],
    });
    expect(calm.hardcore).toBe(false);
    expect(calm.reviveBudget).toBe(Infinity);
  });

  it('a spent hardcore revive budget blocks any further revive', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 43,
      hardcore: true,
      players: [
        { peerId: 'a', name: 'A', classId: 'knight' },
        { peerId: 'b', name: 'B', classId: 'cleric' },
      ],
    });
    w.boss = null;
    w.terrain = [];
    const [downed, reviver] = w.players;
    downed.state = 'downed';
    downed.hp = 0;
    downed.downedTimer = 100;
    w.reviveBudget = 0; // stock already spent
    downed.pos = { x: 400, y: 800 };
    reviver.pos = { x: 420, y: 800 };
    w.step(DT, new Map([['b', inp({ buttons: buttons({ revive: true }) })]]));
    expect(downed.state).toBe('downed'); // no revive while the budget is empty
    expect(downed.reviveProgress).toBe(0);
  });
});

describe('world-branches: item button with no vials', () => {
  it('pressing the item button with no charges heals nothing', () => {
    const w = solo({ classId: 'mage' });
    w.boss = null;
    w.terrain = [];
    const p = w.players[0];
    expect(p.potions).toBeUndefined();
    p.hp = 1;
    w.step(DT, new Map([['a', inp({ buttons: buttons({ item: true }) })]]));
    expect(p.hp).toBe(1); // no vial → nothing to quaff
    expect(p.potions).toBeUndefined();
  });
});

describe('world-branches: teleporting affix on a non-blinker', () => {
  it('grants a synthetic blink to a boss that cannot normally teleport', () => {
    const w = solo({ bossAffixes: [['teleporting']] });
    w.terrain = [];
    w.obstacles = [];
    const boss = w.boss!;
    // A dragon has no innate blink, so the affix seeds a synthetic blink cooldown.
    expect(boss.blinkTimer).toBeGreaterThan(0);
    const p = w.players[0];
    boss.pos = { x: 800, y: 400 };
    p.pos = { x: 850, y: 400 }; // crowding it
    boss.blinkTimer = 0;
    boss.decisionTimer = 100;
    w.step(DT, new Map([['a', inp()]]));
    expect(w.events.some((e) => e.t === 'blink')).toBe(true);
  });
});

describe('world-branches: soft enrage + passive regen', () => {
  it('the boss damage scalar ramps past the soft-enrage time', () => {
    const w = solo();
    const base = w.bossDamageScalar();
    w.elapsed = 400; // past SOFT_ENRAGE_TIME (300s)
    expect(w.bossDamageScalar()).toBeGreaterThan(base);
  });

  it('a Renewal hero regenerates while up, but not while down', () => {
    const w = solo();
    w.boss = null;
    w.terrain = [];
    const p = w.players[0];
    p.regenPerSec = 40;
    p.hp = 100;
    w.step(DT, new Map([['a', inp()]]));
    expect(p.hp).toBeGreaterThan(100); // regen ticked

    p.state = 'downed';
    p.hp = 0;
    p.downedTimer = 100;
    w.step(DT, new Map([['a', inp()]]));
    expect(p.hp).toBe(0); // no regen while downed
  });

  it('a downed hero bleeds out to dead once the timer elapses', () => {
    const w = solo();
    w.boss = null;
    w.terrain = [];
    const p = w.players[0];
    p.state = 'downed';
    p.hp = 0;
    p.downedTimer = 0.01;
    w.step(DT, new Map());
    expect(p.state).toBe('dead');
    expect(w.events.some((e) => e.t === 'death' && e.kind === 'player')).toBe(true);
  });
});

describe('world-branches: boss-side + healing zones', () => {
  it('a boss damage+snare zone bites a standing hero', () => {
    const w = solo();
    w.boss = null;
    w.terrain = [];
    w.obstacles = [];
    const p = w.players[0];
    p.pos = { x: 500, y: 500 };
    const before = p.hp;
    w.groundZones = [
      mkZone(w, {
        side: 'boss',
        pos: { x: 500, y: 500 },
        radius: 130,
        damagePerTick: 14,
        slowMult: 0.5,
        slowDuration: 2,
        tickAccum: 0.5,
      }),
    ];
    w.step(DT, new Map([['a', inp()]]));
    expect(p.hp).toBeLessThan(before);
    expect(p.buffs.some((b) => b.kind === 'moveSpeed' && b.mult < 1)).toBe(true);
  });

  it('a player heal zone with an owner mends a wounded ally and credits the healer', () => {
    const w = makeWorld({
      players: [
        { peerId: 'a', name: 'A', classId: 'cleric' },
        { peerId: 'b', name: 'B', classId: 'knight' },
      ],
    });
    w.boss = null;
    w.terrain = [];
    const [owner, wounded] = w.players;
    wounded.hp = 20;
    wounded.pos = { x: 500, y: 500 };
    w.groundZones = [
      mkZone(w, {
        kind: 'sanctuary',
        side: 'player',
        ownerId: owner.id,
        pos: { x: 500, y: 500 },
        radius: 150,
        healPerTick: 25,
        tickAccum: 0.5,
      }),
    ];
    w.step(DT, new Map());
    expect(wounded.hp).toBeGreaterThan(20);
    expect(owner.stats.healingDone).toBeGreaterThan(0);
  });
});

describe('world-branches: enrage + dummy regen transitions', () => {
  it('a boss crossing its HP threshold enters the enraged phase', () => {
    const w = solo();
    w.terrain = [];
    const boss = w.boss!;
    boss.decisionTimer = 100;
    boss.hp = boss.maxHp * 0.24; // below the dragon's 0.25 threshold
    w.step(DT, new Map());
    expect(boss.phase).toBe('enraged');
    expect(w.events.some((e) => e.t === 'enrage')).toBe(true);
  });

  it('a practice dummy self-heals briskly (uncapped) once you stop hitting it', () => {
    const w = new World({
      monsterId: 'dummy',
      seed: 44,
      players: [{ peerId: 'a', name: 'A', classId: 'knight' }],
      practice: true,
    });
    const dummy = w.boss!;
    dummy.hp = dummy.maxHp - 200;
    dummy.regenLockout = 0;
    const before = dummy.hp;
    for (let i = 0; i < 20; i++) w.step(DT, new Map());
    expect(dummy.hp).toBeGreaterThan(before);
  });
});

describe('world-branches: silenced casters', () => {
  it('silence blocks the specials but never the basic attack', () => {
    const w = solo();
    w.terrain = [];
    w.obstacles = [];
    const p = w.players[0];
    const boss = w.boss!;
    boss.pos = { x: 800, y: 400 };
    p.pos = { x: 800, y: 460 };
    applyBuff(p, makeBuff('silence', 0, 5, 'test'));
    // A silenced A1 does nothing.
    w.step(DT, new Map([['a', inp({ aim: { x: 0, y: -1 }, buttons: buttons({ a1: true }) })]]));
    expect(p.cooldowns.a1).toBe(0); // never fired

    // The basic still lands.
    const before = boss.hp;
    p.pos = { x: 800, y: 460 };
    boss.pos = { x: 800, y: 400 };
    p.prevButtons = buttons();
    w.step(DT, new Map([['a', inp({ aim: { x: 0, y: -1 }, buttons: buttons({ basic: true }) })]]));
    expect(boss.hp).toBeLessThan(before);
  });
});

describe('world-branches: applyEphemeral passives', () => {
  it('speed/damage/defence perks fold into the stat multipliers at spawn', () => {
    const plain = new World({
      monsterId: 'dragon',
      seed: 45,
      players: [{ peerId: 'a', name: 'A', classId: 'knight' }],
    });
    const buffed = new World({
      monsterId: 'dragon',
      seed: 45,
      players: [
        {
          peerId: 'a',
          name: 'A',
          classId: 'knight',
          ephemeral: { speed: true, damage: true, defense: true },
        },
      ],
    });
    const a = plain.players[0];
    const b = buffed.players[0];
    expect(b.moveSpeed).toBeGreaterThan(a.moveSpeed);
    expect(b.damageMult).toBeGreaterThan(a.damageMult);
    expect(b.damageTakenMult).toBeLessThan(a.damageTakenMult);
  });
});

// ---------------------------------------------------------------------------
// long soak: keep the sim honest with affixes + corruption enabled
// ---------------------------------------------------------------------------

describe('world-branches: soak', () => {
  it('runs an affixed, corrupted twin fight for many ticks without NaNs', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 31,
      cycle: 1,
      corruption: true,
      players: [
        { peerId: 'p1', name: 'P1', classId: 'knight' },
        { peerId: 'p2', name: 'P2', classId: 'cleric' },
      ],
      coBosses: ['lich'],
      bossAffixes: [
        ['molten', 'vampiric'],
        ['splitting', 'warding'],
      ],
    });
    for (let t = 0; t < 400 && !w.finished; t++) {
      const map = new Map<string, InputCommand>();
      w.players.forEach((p, i) => {
        map.set(
          p.peerId,
          inp({
            move: { x: Math.cos(t * 0.03 + i), y: Math.sin(t * 0.03 + i) },
            buttons: buttons({ basic: t % 3 === 0, a1: t % 20 === 0, revive: t % 7 === 0 }),
          }),
        );
      });
      w.step(DT, map);
      for (const p of w.players) expect(Number.isFinite(p.hp)).toBe(true);
      for (const b of w.bosses) expect(Number.isFinite(b.hp)).toBe(true);
    }
    const snap = w.serialize();
    expect(Number.isFinite(snap.tick)).toBe(true);
  });
});

// ===========================================================================
// Extra branch coverage: subclass-slot decay, defensive numeric fallbacks,
// aura / affix / telegraph edges, HP-gated abilities, hardcore deadline, the
// fairness governor with no target, and the end-conditions finished guard.
// ===========================================================================

describe('world-branches: subclass slot edges', () => {
  it('a bound sub2 skill decays its cooldown and is not fired without its button', () => {
    const w = makeWorld({
      players: [
        {
          peerId: 'a',
          name: 'A',
          classId: 'knight',
          subSkills: ['kn_champion_slam', 'kn_champion_riposte'],
        },
      ],
    });
    w.boss = null;
    w.terrain = [];
    const p = w.players[0];
    // Two skills of the same subclass fill sub1 + sub2.
    expect(p.subAbilities?.sub1).toBeTruthy();
    expect(p.subAbilities?.sub2).toBeTruthy();
    p.cooldowns.sub2 = 5;
    // inp() carries no sub2 button → the `cmd.buttons[slot] ?? false` nullish path.
    w.step(DT, new Map([['a', inp()]]));
    // Decayed by tickTimers (sub2 != null branch), and NOT reset by a fire.
    expect(p.cooldowns.sub2).toBeLessThan(5);
    expect(p.cooldowns.sub2).toBeGreaterThan(4.9);
  });

  it('an undefined sub cooldown counts as ready (?? 0) so the skill still fires', () => {
    const w = makeWorld({
      players: [{ peerId: 'a', name: 'A', classId: 'knight', subSkills: ['kn_champion_slam'] }],
    });
    w.terrain = [];
    w.obstacles = [];
    const p = w.players[0];
    const boss = w.boss!;
    boss.pos = { x: 800, y: 400 };
    p.pos = { x: 800, y: 460 };
    delete p.cooldowns.sub1; // (undefined ?? 0) > 0 is false → not on cooldown
    const before = boss.hp;
    w.step(DT, new Map([['a', inp({ autofire: true, buttons: buttons({ sub1: true }) })]]));
    expect(boss.hp).toBeLessThan(before);
  });
});

describe('world-branches: setActiveClass fallbacks', () => {
  function multi() {
    const w = makeWorld({
      players: [{ peerId: 'a', name: 'A', classId: 'knight', extraClasses: ['mage', 'cleric'] }],
    });
    w.boss = null;
    w.terrain = [];
    return w;
  }

  it('ignores a swap to a class with no resolved table', () => {
    const w = multi();
    const p = w.players[0];
    const abilities = p.abilities;
    w.setActiveClass(p, 'ranger'); // not an owned class → no classTables entry
    expect(p.classId).toBe('knight');
    expect(p.abilities).toBe(abilities);
    expect(p.swapCd).toBe(0); // gate not armed
  });

  it('falls back to zeroed cooldowns when the target class has no saved bank', () => {
    const w = multi();
    const p = w.players[0];
    // Drop the saved cooldown bank for mage while keeping its ability table.
    p.classCooldowns = { knight: { basic: 0, a1: 0, a2: 0, a3: 0 } };
    w.setActiveClass(p, 'mage');
    expect(p.classId).toBe('mage'); // table present → swap proceeds
    expect(p.cooldowns.a1).toBe(0); // ?? default zeroed bank
    expect(p.swapCd).toBeGreaterThan(0);
  });
});

describe('world-branches: projectile branch edges', () => {
  it('an AoE impact spares a boss outside the blast while still catching a nearby add', () => {
    const w = solo();
    w.terrain = [];
    w.obstacles = [];
    const boss = w.boss!;
    boss.pos = { x: 200, y: 200 }; // far from the blast centre
    const add = mkAdd(w, { pos: { x: 500, y: 500 } });
    w.adds = [add];
    const bossBefore = boss.hp;
    w.projectiles = [
      mkProj(w, {
        ownerId: 0,
        kind: 'fireball',
        pos: { x: 500, y: 500 },
        damage: 30,
        impactRadius: 120,
      }),
    ];
    w.step(DT, new Map());
    expect(boss.hp).toBe(bossBefore); // boss outside impactRadius → skipped
    expect(add.hp).toBeLessThan(60); // add inside the AoE
  });

  it('a direct add hit resolves even with a live boss present but out of reach', () => {
    const w = solo();
    w.terrain = [];
    w.obstacles = [];
    const boss = w.boss!;
    boss.pos = { x: 200, y: 200 };
    const p = w.players[0];
    const add = mkAdd(w, { pos: { x: 900, y: 600 } });
    w.adds = [add];
    const bossBefore = boss.hp;
    w.projectiles = [mkProj(w, { ownerId: p.id, pos: { x: 900, y: 600 }, damage: 25 })];
    w.step(DT, new Map());
    expect(add.hp).toBeLessThan(60); // struck the add (else-if hitAdd branch)
    expect(boss.hp).toBe(bossBefore); // boss loop ran but found no collision
    expect(p.stats.damageDealt).toBeGreaterThan(0);
  });

  it('a player shot with a frost rider but no explicit duration chills for the default', () => {
    const w = solo();
    w.terrain = [];
    w.obstacles = [];
    const boss = w.boss!;
    boss.pos = { x: 800, y: 400 };
    const before = boss.hp;
    w.projectiles = [
      mkProj(w, { ownerId: w.players[0].id, pos: { x: 800, y: 400 }, damage: 10, slowMult: 0.5 }),
    ];
    w.step(DT, new Map());
    expect(boss.hp).toBeLessThan(before);
    const slow = boss.buffs.find((b) => b.kind === 'moveSpeed' && b.mult < 1);
    expect(slow).toBeTruthy();
    expect(slow!.remaining).toBeGreaterThan(0); // slowDuration ?? 2
  });

  it('a boss bolt with a frost rider but no explicit duration chills for the default', () => {
    const w = solo();
    w.boss = null;
    w.terrain = [];
    w.obstacles = [];
    const p = w.players[0];
    p.pos = { x: 500, y: 500 };
    const before = p.hp;
    w.projectiles = [
      mkProj(w, { side: 'boss', ownerId: 999, pos: { x: 500, y: 500 }, damage: 15, slowMult: 0.5 }),
    ];
    w.step(DT, new Map());
    expect(p.hp).toBeLessThan(before);
    expect(p.buffs.some((b) => b.kind === 'moveSpeed' && b.source === 'bossSlow')).toBe(true);
  });
});

describe('world-branches: snare-only player zone', () => {
  it('mires the boss and adds without a damage tick', () => {
    const w = solo();
    w.terrain = [];
    w.obstacles = [];
    const boss = w.boss!;
    boss.pos = { x: 800, y: 400 };
    const add = mkAdd(w, { pos: { x: 800, y: 400 } });
    w.adds = [add];
    const bossBefore = boss.hp;
    w.groundZones = [
      mkZone(w, {
        side: 'player',
        ownerId: 0,
        pos: { x: 800, y: 400 },
        radius: 140,
        damagePerTick: 0, // slow-only → the `damagePerTick > 0` guard is false
        slowMult: 0.5,
        slowDuration: 2,
        tickAccum: 0.5,
      }),
    ];
    w.step(DT, new Map());
    expect(boss.hp).toBe(bossBefore); // no damage
    expect(boss.buffs.some((b) => b.kind === 'moveSpeed' && b.mult < 1)).toBe(true);
    expect(add.hp).toBe(60); // no damage
    expect(add.buffs.some((b) => b.kind === 'moveSpeed' && b.mult < 1)).toBe(true);
  });
});

describe('world-branches: modifier aura fallbacks', () => {
  it('seeds an undefined aura timer via the ?? 0 fallback', () => {
    const w = solo();
    w.terrain = [];
    const boss = w.boss!;
    boss.decisionTimer = 100;
    boss.modAura = 'ember';
    boss.modAuraTimer = undefined;
    w.step(DT, new Map([['a', inp()]]));
    expect(Number.isFinite(boss.modAuraTimer)).toBe(true);
    expect(boss.modAuraTimer).toBeCloseTo(DT, 5); // 0 + dt, not NaN
  });

  it('an ember aura with an undefined dmgScale still scorches (?? 1 fallback)', () => {
    const w = solo();
    w.terrain = [];
    const boss = w.boss!;
    boss.decisionTimer = 100;
    boss.modAura = 'ember';
    boss.modAuraTimer = 5; // over the interval → fires this tick
    boss.dmgScale = undefined;
    const p = w.players[0];
    p.pos = { x: boss.pos.x, y: boss.pos.y + 100 };
    const before = p.hp;
    w.step(DT, new Map([['a', inp()]]));
    expect(p.hp).toBeLessThan(before);
    expect(Number.isFinite(p.hp)).toBe(true); // scalar was finite, not NaN
  });

  it('a storm aura with no living target arcs onto nobody', () => {
    const w = makeWorld({
      players: [
        { peerId: 'a', name: 'A', classId: 'knight' },
        { peerId: 'b', name: 'B', classId: 'ranger' },
      ],
    });
    w.terrain = [];
    const boss = w.boss!;
    boss.decisionTimer = 100;
    boss.modAura = 'storm';
    boss.modAuraTimer = 5;
    for (const p of w.players) {
      p.state = 'downed';
      p.hp = 0;
      p.downedTimer = 100;
    }
    w.step(DT, new Map());
    expect(w.events.some((e) => e.t === 'telegraph')).toBe(false); // alive.length === 0 → no arc
  });

  it('a storm aura arcs onto exactly one of two spread-out heroes', () => {
    const w = makeWorld({
      players: [
        { peerId: 'a', name: 'A', classId: 'knight' },
        { peerId: 'b', name: 'B', classId: 'ranger' },
      ],
    });
    w.terrain = [];
    const boss = w.boss!;
    boss.decisionTimer = 100;
    boss.modAura = 'storm';
    boss.modAuraTimer = 5;
    const [a, b] = w.players;
    a.pos = { x: 300, y: 500 };
    b.pos = { x: 900, y: 500 }; // 600 apart → the 130u arc catches only the struck hero
    const aBefore = a.hp;
    const bBefore = b.hp;
    w.step(DT, new Map());
    const damaged = [a.hp < aBefore, b.hp < bBefore].filter(Boolean);
    expect(damaged.length).toBe(1); // one within the arc (true), one outside (false)
  });
});

describe('world-branches: frenzied with zero max HP', () => {
  it('uses the hpFrac=0 fallback (maximum cooldown reduction) when maxHp is 0', () => {
    const w = solo();
    w.terrain = [];
    w.obstacles = [];
    const boss = w.boss!;
    boss.affixes = ['frenzied'];
    boss.maxHp = 0; // `maxHp > 0 ? hp/maxHp : 0` → 0
    boss.hp = 100; // still counts as alive
    const p = w.players[0];
    boss.pos = { x: 800, y: 400 };
    p.pos = { x: 800, y: 460 };
    boss.action = {
      kind: 'windup',
      abilityId: 'tailSweep',
      remaining: 0.01,
      total: 0.9,
      targetId: p.id,
      targetPos: { ...p.pos },
      aimAngle: Math.PI / 2,
      channelAccum: 0,
    };
    w.step(DT, new Map([['a', inp()]]));
    // hpFrac forced to 0 → deepest frenzy CDR, below even the enraged 0.7 mult.
    expect(boss.cooldowns.tailSweep).toBeGreaterThan(0);
    expect(boss.cooldowns.tailSweep).toBeLessThan(8 * 0.7);
  });
});

describe('world-branches: affix numeric fallbacks', () => {
  it('molten upkeep with an undefined dmgScale still trails a finite-damage pool', () => {
    const w = solo({ bossAffixes: [['molten']] });
    w.terrain = [];
    w.obstacles = [];
    w.groundZones = [];
    const boss = w.boss!;
    boss.decisionTimer = 100;
    boss.dmgScale = undefined; // ?? 1 in the scalar
    boss.affixTimers = { molten: 1 }; // over AFFIX_MOLTEN_INTERVAL → fires this tick
    w.step(DT, new Map([['a', inp()]]));
    const pool = w.groundZones.find((z) => z.side === 'boss');
    expect(pool).toBeTruthy();
    expect(Number.isFinite(pool!.damagePerTick)).toBe(true);
    expect(pool!.damagePerTick).toBeGreaterThan(0);
  });

  it('affix cadence accumulators seed from ?? 0 rather than going NaN', () => {
    const w = solo({ bossAffixes: [['molten', 'warding', 'splitting', 'barbed']] });
    w.terrain = [];
    w.obstacles = [];
    const boss = w.boss!;
    boss.decisionTimer = 100;
    boss.affixTimers = {}; // wipe the seeded timers → each reads undefined ?? 0
    w.step(DT, new Map([['a', inp()]]));
    const t = boss.affixTimers;
    for (const key of ['molten', 'warding', 'splitting', 'barbed'] as const) {
      expect(Number.isFinite(t[key])).toBe(true);
      expect(t[key]).toBeCloseTo(DT, 5);
    }
  });

  it('a barbed pulse with an undefined recent-damage window deals no NaN damage', () => {
    const w = solo({ bossAffixes: [['barbed']] });
    w.terrain = [];
    w.obstacles = [];
    const boss = w.boss!;
    boss.decisionTimer = 100;
    boss.recentDamageTaken = undefined; // ?? 0 → base 0 → bails cleanly
    boss.affixTimers = { barbed: 100 };
    const p = w.players[0];
    p.pos = { x: boss.pos.x, y: boss.pos.y + 20 };
    const before = p.hp;
    w.step(DT, new Map([['a', inp()]]));
    expect(p.hp).toBe(before); // no NaN damage
  });

  it('a barbed pulse skips downed heroes, spares those out of range, and flashes on a hit', () => {
    const w = makeWorld({
      players: [
        { peerId: 'a', name: 'A', classId: 'knight' },
        { peerId: 'b', name: 'B', classId: 'ranger' },
        { peerId: 'c', name: 'C', classId: 'cleric' },
      ],
      bossAffixes: [['barbed']],
    });
    w.terrain = [];
    w.obstacles = [];
    const boss = w.boss!;
    boss.decisionTimer = 100;
    boss.pos = { x: 800, y: 400 };
    boss.recentDamageTaken = 200; // base clamps to the cap → a real pulse
    boss.affixTimers = { barbed: 100 };
    const [near, far, downed] = w.players;
    near.pos = { x: 800, y: 420 }; // inside the thorn radius
    far.pos = { x: 100, y: 950 }; // well outside
    downed.pos = { x: 800, y: 415 };
    downed.state = 'downed';
    downed.hp = 0;
    downed.downedTimer = 100;
    const nearBefore = near.hp;
    const farBefore = far.hp;
    w.step(DT, new Map());
    expect(near.hp).toBeLessThan(nearBefore); // in range → hit
    expect(far.hp).toBe(farBefore); // out of range → spared
    expect(downed.hp).toBe(0); // not alive → skipped
    expect(w.events.some((e) => e.t === 'telegraph')).toBe(true); // hitAny → flash
  });

  it('a barbed pulse that catches nobody emits no flash', () => {
    const w = solo({ bossAffixes: [['barbed']] });
    w.terrain = [];
    w.obstacles = [];
    const boss = w.boss!;
    boss.decisionTimer = 100;
    boss.pos = { x: 800, y: 400 };
    boss.recentDamageTaken = 200; // base > 1, so it does NOT bail early
    boss.affixTimers = { barbed: 100 };
    const p = w.players[0];
    p.pos = { x: 100, y: 950 }; // out of range → hitAny stays false
    const before = p.hp;
    w.step(DT, new Map());
    expect(p.hp).toBe(before);
    expect(w.events.some((e) => e.t === 'telegraph')).toBe(false);
  });
});

describe('world-branches: vampiric at full health', () => {
  it('a Vampiric hit at full HP deals damage but banks no heal event', () => {
    const w = solo({ bossAffixes: [['vampiric']] });
    w.terrain = [];
    w.obstacles = [];
    const boss = w.boss!;
    const p = w.players[0];
    boss.pos = { x: 800, y: 400 };
    p.pos = { x: 800, y: 460 };
    boss.hp = boss.maxHp; // no room to heal → healed === 0
    boss.action = {
      kind: 'windup',
      abilityId: 'tailSweep',
      remaining: 0.01,
      total: 0.9,
      targetId: p.id,
      targetPos: { ...p.pos },
      aimAngle: Math.PI / 2,
      channelAccum: 0,
    };
    const pBefore = p.hp;
    w.step(DT, new Map([['a', inp()]]));
    expect(p.hp).toBeLessThan(pBefore); // it dealt damage
    expect(boss.hp).toBe(boss.maxHp); // clamped at full
    expect(w.events.some((e) => e.t === 'heal' && e.targetId === boss.id)).toBe(false);
  });
});

describe('world-branches: volatile with undefined dmgScale', () => {
  it('a Volatile pbaoe salts a finite-damage pool despite an undefined dmgScale', () => {
    const w = solo({ bossAffixes: [['volatile']] });
    w.terrain = [];
    w.obstacles = [];
    w.groundZones = [];
    const boss = w.boss!;
    const p = w.players[0];
    boss.pos = { x: 800, y: 400 };
    p.pos = { x: 800, y: 460 };
    boss.dmgScale = undefined; // ?? 1 in the pool tick scalar
    boss.action = {
      kind: 'windup',
      abilityId: 'tailSweep',
      remaining: 0.01,
      total: 0.9,
      targetId: p.id,
      targetPos: { ...p.pos },
      aimAngle: Math.PI / 2,
      channelAccum: 0,
    };
    w.step(DT, new Map([['a', inp()]]));
    const pool = w.groundZones.find((z) => z.side === 'boss');
    expect(pool).toBeTruthy();
    expect(Number.isFinite(pool!.damagePerTick)).toBe(true);
    expect(pool!.damagePerTick).toBeGreaterThan(0);
  });
});

describe('world-branches: pending strike default slow duration', () => {
  it('a slow-riding strike with no explicit duration mires for the default', () => {
    const w = solo();
    w.boss = null;
    w.terrain = [];
    w.obstacles = [];
    const p = w.players[0];
    p.pos = { x: 500, y: 500 };
    w.addPendingStrike({
      pos: { x: 500, y: 500 },
      radius: 120,
      fuse: 0.01,
      damage: 20,
      slowMult: 0.5, // no slowDuration → the ?? 2 default
    });
    w.step(DT, new Map([['a', inp()]]));
    const slow = p.buffs.find((b) => b.kind === 'moveSpeed' && b.source === 'strikeSlow');
    expect(slow).toBeTruthy();
    expect(slow!.remaining).toBeGreaterThan(0);
  });
});

describe('world-branches: pack bond telegraph guard', () => {
  it('a killed bond caster drops the line telegraph on serialize', () => {
    const w = makeWorld({ monsterId: 'dragon', seed: 21, coBosses: ['troll'] });
    w.terrain = [];
    w.obstacles = [];
    for (let i = 0; i < 260 && !w.bond; i++) {
      for (const b of w.bosses) {
        b.hp = b.maxHp;
        b.pos = { x: 400 + b.id * 60, y: 300 };
      }
      w.step(DT, new Map());
    }
    expect(w.bond).not.toBeNull();
    // Kill the anchor, then serialize BEFORE the next step can cancel the bond.
    const caster = w.bosses.find((b) => b.id === w.bond!.casterId)!;
    caster.hp = 0;
    const snap = w.serialize();
    expect((snap.telegraphs ?? []).some((t) => t.kind === 'line')).toBe(false);
  });
});

describe('world-branches: degenerate pack bond', () => {
  it('a boss listed twice cannot bond with itself', () => {
    const w = makeWorld({ monsterId: 'dragon', seed: 21, coBosses: ['troll'] });
    w.terrain = [];
    w.obstacles = [];
    const b = w.bosses[0];
    b.hp = b.maxHp;
    b.decisionTimer = 100;
    w.bosses = [b, b]; // same object twice → caster.id === partner.id
    w.bond = null;
    w.synergyTimer = 0; // force a bond attempt this tick
    w.step(DT, new Map());
    expect(w.bond).toBeNull(); // startBond bailed on the degenerate pair
    expect(w.events.some((e) => e.t === 'telegraph')).toBe(false);
  });
});

describe('world-branches: HP-gated boss ability (minHpFrac)', () => {
  function wraith(seed: number): World {
    const w = new World({
      monsterId: 'wraith',
      seed,
      players: [{ peerId: 'a', name: 'A', classId: 'knight' }],
    });
    w.terrain = [];
    w.obstacles = [];
    return w;
  }

  it('skips an HP-gated ability above its threshold and commits it below', () => {
    // Above the gate (full HP): Wail (minHpFrac 0.5) is unusable → Drain Soul chosen.
    const high = wraith(3);
    const hb = high.boss!;
    hb.pos = { x: 800, y: 400 };
    high.players[0].pos = { x: 820, y: 420 };
    hb.decisionTimer = 0.01;
    high.step(DT, new Map([['a', inp()]]));
    expect(hb.action.abilityId).toBe('drainSoul');

    // Below the gate (30% HP) and in melee: Wail becomes usable and is chosen.
    const low = wraith(3);
    const lb = low.boss!;
    lb.pos = { x: 800, y: 400 };
    low.players[0].pos = { x: 820, y: 420 };
    lb.hp = lb.maxHp * 0.3;
    lb.decisionTimer = 0.01;
    low.step(DT, new Map([['a', inp()]]));
    expect(lb.action.abilityId).toBe('wail');
  });
});

describe('world-branches: fairness governor with no target', () => {
  it('defers a walling attack centred on the boss when every hero is down', () => {
    const w = solo();
    w.terrain = [];
    w.obstacles = [];
    const boss = w.boss!;
    const p = w.players[0];
    p.state = 'dead'; // no live target → target?.pos ?? boss.pos falls back to the boss
    boss.pos = { x: 800, y: 400 };
    boss.decisionTimer = 0.01;
    // A strike overlapping the boss's own position walls the centred fireball.
    w.addPendingStrike({ pos: { x: 800, y: 400 }, radius: 120, fuse: 5, damage: 10 });
    w.step(DT, new Map());
    expect(boss.action.kind).toBe('idle'); // deferred, no wind-up started
  });
});

describe('world-branches: end-conditions guard after a forced finish', () => {
  it('does not overturn a forced defeat when a disconnect re-checks end conditions', () => {
    const w = makeWorld({
      players: [
        { peerId: 'a', name: 'A', classId: 'knight' },
        { peerId: 'b', name: 'B', classId: 'ranger' },
      ],
    });
    const boss = w.boss!;
    boss.hp = 0; // a dead boss would normally flip the result to victory...
    w.forceFinish('defeat'); // ...but the fight is already resolved
    w.removePlayerByPeer('b'); // re-enters checkEndConditions with finished = true
    expect(w.players.length).toBe(1);
    expect(w.outcome).toBe('defeat'); // guard returned early → no victory flip
  });
});

describe('world-branches: hardcore kill deadline', () => {
  it('wipes the surviving band when the deadline passes with a boss alive', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 46,
      hardcore: true,
      players: [
        { peerId: 'a', name: 'A', classId: 'knight' },
        { peerId: 'b', name: 'B', classId: 'ranger' },
        { peerId: 'c', name: 'C', classId: 'cleric' },
      ],
    });
    w.terrain = [];
    w.obstacles = [];
    const boss = w.boss!;
    boss.decisionTimer = 100; // keep it alive + idle
    const [aliveHero, downedHero, deadHero] = w.players;
    downedHero.state = 'downed';
    downedHero.hp = 0;
    downedHero.downedTimer = 100;
    deadHero.state = 'dead';
    deadHero.hp = 0;
    const aliveDeathsBefore = aliveHero.stats.deaths;
    const downedDeathsBefore = downedHero.stats.deaths;
    w.hardcoreDeadline = 0; // clock already blown → the chasm opens at once
    // The closing chasm devours the band over a few seconds (not an instant wipe).
    let sawDeadline = false;
    for (let i = 0; i < 600 && !w.finished; i++) {
      w.step(DT, new Map());
      if (w.events.some((e) => e.t === 'deadline')) sawDeadline = true;
    }
    expect(w.finished).toBe(true);
    expect(w.outcome).toBe('defeat');
    expect(sawDeadline).toBe(true);
    expect(aliveHero.state).toBe('dead');
    expect(downedHero.state).toBe('dead');
    expect(deadHero.state).toBe('dead'); // already dead → skipped by the swallow
    expect(aliveHero.stats.deaths).toBe(aliveDeathsBefore + 1); // alive → newly counted
    expect(downedHero.stats.deaths).toBe(downedDeathsBefore); // downed → not double-counted
  });
});

describe('world-branches: telegraph for an unresolved ability id', () => {
  it('a windup referencing an unknown ability serializes no telegraph', () => {
    const w = solo();
    const boss = w.boss!;
    boss.action = {
      kind: 'windup',
      abilityId: 'notARealAbility', // non-null but unresolvable → abilityById miss
      remaining: 1,
      total: 1,
      targetId: null,
      targetPos: null,
      aimAngle: 0,
      channelAccum: 0,
    };
    expect(w.serialize().bosses[0].telegraph).toBeNull();
  });
});

describe('world-branches: player score without a base score', () => {
  it('treats an undefined baseScore as 0 (?? 0) instead of NaN', () => {
    const w = solo();
    w.boss = null;
    const p = w.players[0];
    p.baseScore = undefined;
    p.stats.damageDealt = 100;
    expect(w.playerScore(p)).toBe(100);
  });
});
