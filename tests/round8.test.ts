import { describe, it, expect } from 'vitest';
import { World } from '../src/engine/world/world';
import type { InputCommand, ButtonState, Projectile, Player } from '../src/engine/core/types';
import { CLASSES, CLASS_IDS, cloneAbilities } from '../src/engine/content/classes';
import {
  applyCharUpgrades,
  rollCharChoices,
  CHAR_UPGRADES,
} from '../src/engine/content/charUpgrades';
import {
  buildRun,
  modifierForCycle,
  MONSTER_IDS,
  MONSTERS_BY_TIER,
} from '../src/engine/content/monsters';
import { computeScaling } from '../src/engine/content/scaling';
import { computeBotInput } from '../src/engine/ai/bot';
import { damageBoss, applyBuff, makeBuff } from '../src/engine/combat/combat';
import type { Add, GroundZone } from '../src/engine/core/types';
import { ADD_HP, ADD_MOVE_SPEED, ADD_RADIUS } from '../src/engine/core/constants';
import { buffBadges, buffLabel } from '../src/render/overlays/buffGlyphs';
import { padIndexToLabel } from '../src/input/bindings';
import { Camera } from '../src/render/pipeline/camera';
import { Rng } from '../src/engine/core/math';
import { PROJECTILE_MAX_RANGE } from '../src/engine/core/constants';

function buttons(over: Partial<ButtonState> = {}): ButtonState {
  return { basic: false, a1: false, a2: false, a3: false, revive: false, ...over };
}
function inp(over: Partial<InputCommand> = {}): InputCommand {
  return { seq: 0, move: { x: 0, y: 0 }, aim: { x: 1, y: 0 }, buttons: buttons(), ...over };
}
const DT = 0.05;

// ---------------------------------------------------------------------------
// New classes
// ---------------------------------------------------------------------------
describe('expansion classes', () => {
  it('adds eight DnD-flavoured classes (12 total)', () => {
    expect(CLASS_IDS).toHaveLength(12);
    for (const id of [
      'barbarian',
      'rogue',
      'paladin',
      'druid',
      'bard',
      'monk',
      'sorcerer',
      'warlock',
    ] as const) {
      expect(CLASSES[id]).toBeTruthy();
      expect(CLASSES[id].abilities.basic).toBeTruthy();
    }
  });

  it('a spawned hero gets a private (cloned) ability table', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 1,
      players: [{ peerId: 'a', name: 'A', classId: 'mage' }],
    });
    const p = w.players[0];
    expect(p.abilities).toBeTruthy();
    expect(p.abilities).not.toBe(CLASSES.mage.abilities); // a copy, not the shared table
  });
});

// ---------------------------------------------------------------------------
// Character upgrades
// ---------------------------------------------------------------------------
describe('character upgrades', () => {
  it("Deep Freeze teaches the Mage's Frost Nova to freeze (stun)", () => {
    const abilities = cloneAbilities(CLASSES.mage.abilities);
    const player = { classId: 'mage', abilities, maxHp: 100, hp: 100 } as unknown as Player;
    expect(abilities.a2.freeze ?? 0).toBe(0);
    applyCharUpgrades(player, ['mg_freeze']);
    expect(abilities.a2.freeze ?? 0).toBeGreaterThan(0.9);
  });

  it('Quickened Casting shaves the Fireball cast time', () => {
    const abilities = cloneAbilities(CLASSES.mage.abilities);
    const player = { classId: 'mage', abilities } as unknown as Player;
    const before = abilities.a1.castTime ?? 0;
    applyCharUpgrades(player, ['mg_quickcast']);
    expect(abilities.a1.castTime!).toBeLessThan(before);
  });

  it('a mismatched-class upgrade is ignored', () => {
    const abilities = cloneAbilities(CLASSES.knight.abilities);
    const player = { classId: 'knight', abilities } as unknown as Player;
    applyCharUpgrades(player, ['mg_freeze']); // mage upgrade on a knight
    expect(abilities.a2.freeze ?? 0).toBe(0);
  });

  it('an upgraded Frost Nova actually freezes the boss in a live fight', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 2,
      players: [{ peerId: 'm', name: 'M', classId: 'mage', charUpgrades: ['mg_freeze'] }],
    });
    const m = w.players[0];
    const boss = w.boss!;
    m.pos = { x: boss.pos.x, y: boss.pos.y + 100 }; // inside Frost Nova radius
    w.step(DT, new Map([['m', inp({ buttons: buttons({ a2: true }) })]]));
    expect(boss.buffs.some((b) => b.kind === 'stun' && b.source === 'freeze')).toBe(true);
  });

  it('rollCharChoices offers the class pool, plus at most one hybrid pick', () => {
    const offers = rollCharChoices('rogue', 3, () => 0.42);
    expect(offers.length).toBeGreaterThan(0);
    // Everything offered must be usable by the class: its own pool or 'any'.
    for (const id of offers) {
      expect(['rogue', 'any']).toContain(CHAR_UPGRADES[id].classId);
    }
    const hybrids = offers.filter((id) => CHAR_UPGRADES[id].classId === 'any');
    expect(hybrids.length).toBeLessThanOrEqual(1);
    // A roll stream that never crosses the hybrid threshold stays pure-class.
    let calls = 0;
    const pureRolls = [0.1, 0.2, 0.3, 0.99, 0.99];
    const pure = rollCharChoices('rogue', 3, () => pureRolls[calls++ % pureRolls.length]);
    for (const id of pure) expect(CHAR_UPGRADES[id].classId).toBe('rogue');
  });
});

// ---------------------------------------------------------------------------
// Ranged travel cap (torus fix)
// ---------------------------------------------------------------------------
describe('ranged range cap', () => {
  it('a projectile fizzles once its travel budget is spent', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 3,
      players: [{ peerId: 'a', name: 'A', classId: 'ranger' }],
    });
    w.obstacles = [];
    w.boss!.pos = { x: 50, y: 50 }; // far from the shot's path
    const proj: Projectile = {
      id: w.allocId(),
      kind: 'arrow',
      pos: { x: 800, y: 800 },
      vel: { x: 700, y: 0 },
      ownerId: w.players[0].id,
      side: 'player',
      damage: 20,
      impactRadius: 0,
      hitRadius: 8,
      lifetime: 5,
      rangeLeft: 120,
    };
    w.projectiles = [proj];
    // 120 units / 700 u/s ≈ 0.17s → gone within ~4 ticks (well under its lifetime).
    for (let i = 0; i < 6; i++) w.step(DT, new Map());
    expect(w.projectiles.length).toBe(0);
  });

  it('default player projectiles carry the arena range cap', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 4,
      players: [{ peerId: 'a', name: 'A', classId: 'ranger' }],
    });
    w.players[0].pos = { x: 200, y: 800 };
    w.boss!.pos = { x: 1400, y: 200 };
    w.step(DT, new Map([['a', inp({ aim: { x: 0, y: -1 }, buttons: buttons({ basic: true }) })]]));
    expect(w.projectiles.length).toBeGreaterThan(0);
    expect(w.projectiles[0].rangeLeft).toBeLessThanOrEqual(PROJECTILE_MAX_RANGE + 1);
  });
});

// ---------------------------------------------------------------------------
// Obstacles as walls
// ---------------------------------------------------------------------------
describe('obstacles block movement', () => {
  it('ejects a player who ends up inside a solid obstacle', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 5,
      players: [{ peerId: 'a', name: 'A', classId: 'knight' }],
    });
    w.obstacles = [{ id: 999, pos: { x: 400, y: 400 }, radius: 60 }];
    const p = w.players[0];
    p.pos = { x: 400, y: 400 }; // dead centre of the obstacle
    w.step(DT, new Map());
    const dx = p.pos.x - 400;
    const dy = p.pos.y - 400;
    expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(60 + p.radius - 1);
  });
});

// ---------------------------------------------------------------------------
// Score
// ---------------------------------------------------------------------------
describe('player score', () => {
  it('combines damage, healing, revives, deaths and carried score', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 6,
      players: [{ peerId: 'a', name: 'A', classId: 'knight', baseScore: 500 }],
    });
    const p = w.players[0];
    p.stats.damageDealt = 1000;
    p.stats.healingDone = 200;
    p.stats.revives = 2;
    p.stats.deaths = 1;
    // 500 + 1000 + 200*1 + 2*250 - 1*60 = 2140
    expect(w.playerScore(p)).toBe(2140);
  });

  it('never goes negative', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 7,
      players: [{ peerId: 'a', name: 'A', classId: 'knight' }],
    });
    const p = w.players[0];
    p.stats.deaths = 10;
    expect(w.playerScore(p)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Run assembly + endless
// ---------------------------------------------------------------------------
describe('run assembly + endless', () => {
  it('builds a 5-boss run led by the chosen boss', () => {
    const run = buildRun('troll', 0, new Rng(1));
    expect(run).toHaveLength(5);
    expect(run[0]).toBe('troll');
    for (const id of run) expect(MONSTER_IDS).toContain(id);
  });

  it('escalates HP + damage per endless cycle', () => {
    const s0 = computeScaling(1, 0);
    const s2 = computeScaling(1, 2);
    expect(s2.hpMultiplier).toBeGreaterThan(s0.hpMultiplier);
    expect(s2.bossDamageMult).toBeGreaterThan(s0.bossDamageMult);
    expect(s2.cycle).toBe(2);
  });

  it('assigns an elemental modifier from cycle 1 onward', () => {
    expect(modifierForCycle(0)).toBeNull();
    expect(modifierForCycle(1)?.aura).toBe('frost');
    expect(modifierForCycle(2)?.aura).toBe('shadow');
  });

  it('has bosses across all three difficulty tiers', () => {
    expect(MONSTERS_BY_TIER.easy.length).toBeGreaterThanOrEqual(10);
    expect(MONSTERS_BY_TIER.medium.length).toBeGreaterThanOrEqual(10);
    expect(MONSTERS_BY_TIER.hard.length).toBeGreaterThanOrEqual(10);
    expect(MONSTER_IDS.length).toBeGreaterThanOrEqual(33);
  });

  it('a Frost-modified boss chills nearby players over time', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 8,
      cycle: 1,
      modifier: modifierForCycle(1),
      players: [{ peerId: 'a', name: 'A', classId: 'knight' }],
    });
    const p = w.players[0];
    p.pos = { x: w.boss!.pos.x, y: w.boss!.pos.y + 80 };
    for (let i = 0; i < 90; i++) w.step(DT, new Map([['a', inp()]])); // ~4.5s > aura interval
    expect(p.buffs.some((b) => b.kind === 'moveSpeed' && b.mult < 1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Bots drive the new classes
// ---------------------------------------------------------------------------
describe('bots use the expansion classes', () => {
  for (const classId of ['barbarian', 'rogue', 'paladin', 'druid'] as const) {
    it(`a ${classId} bot issues an attack when a boss is in reach`, () => {
      const w = new World({
        monsterId: 'dragon',
        seed: 11,
        players: [{ peerId: 'b', name: 'B', classId }],
      });
      const bot = w.players[0];
      bot.pos = { x: w.boss!.pos.x, y: w.boss!.pos.y + 60 }; // right up on the boss
      // Two ticks: first may set prevButtons, second yields a fresh rising edge.
      computeBotInput(w, bot, 0);
      bot.prevButtons = { basic: false, a1: false, a2: false, a3: false, revive: false };
      const cmd = computeBotInput(w, bot, 1);
      const anyPress = cmd.buttons.basic || cmd.buttons.a1 || cmd.buttons.a2 || cmd.buttons.a3;
      expect(anyPress).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// Review fixes: boss self-buffs, snare zones, stunned adds
// ---------------------------------------------------------------------------
describe('boss defensive/offensive self-buffs are consumed', () => {
  it('a boss damage-taken buff mitigates incoming damage', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 20,
      players: [{ peerId: 'a', name: 'A', classId: 'knight' }],
    });
    const boss = w.boss!;
    applyBuff(boss, makeBuff('damageTaken', 0.5, 5, 'brace'));
    const before = boss.hp;
    damageBoss(w, w.players[0], boss, 100);
    expect(before - boss.hp).toBeCloseTo(50, 5); // halved by Brace
  });
});

describe('boss snare zones mire the party', () => {
  it('a boss-side slow zone applies a moveSpeed debuff', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 21,
      players: [{ peerId: 'a', name: 'A', classId: 'knight' }],
    });
    const p = w.players[0];
    p.pos = { x: 300, y: 800 };
    w.boss!.pos = { x: 1200, y: 200 };
    const zone: GroundZone = {
      id: w.allocId(),
      kind: 'voidZone',
      pos: { ...p.pos },
      radius: 120,
      side: 'boss',
      ownerId: w.boss!.id,
      damagePerTick: 0,
      healPerTick: 0,
      slowMult: 0.4,
      slowDuration: 2,
      duration: 8,
      remaining: 8,
      tickAccum: 0,
    };
    w.groundZones.push(zone);
    for (let i = 0; i < 12; i++) w.step(DT, new Map([['a', inp()]])); // > one zone tick
    expect(
      p.buffs.some((b) => b.kind === 'moveSpeed' && b.mult < 1 && b.source === 'zoneSlow'),
    ).toBe(true);
  });
});

describe('stunned adds hold still', () => {
  it("a frozen skeleton doesn't attack", () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 22,
      players: [{ peerId: 'a', name: 'A', classId: 'knight' }],
    });
    const p = w.players[0];
    p.pos = { x: 300, y: 300 };
    w.boss!.pos = { x: 1300, y: 700 }; // far away, boss won't act this tick
    const add: Add = {
      id: w.allocId(),
      pos: { x: 330, y: 300 },
      hp: ADD_HP,
      maxHp: ADD_HP,
      moveSpeed: ADD_MOVE_SPEED,
      radius: ADD_RADIUS,
      targetId: null,
      attackCd: 0,
      buffs: [],
    };
    applyBuff(add, makeBuff('stun', 0, 2, 'freeze'));
    w.adds = [add];
    const hpBefore = p.hp;
    w.step(DT, new Map([['a', inp()]]));
    expect(p.hp).toBe(hpBefore); // stunned add dealt no damage
  });
});

// ---------------------------------------------------------------------------
// Buff glyphs
// ---------------------------------------------------------------------------
describe('buff glyphs', () => {
  it('summarises a slow + shield into badges with seconds', () => {
    const badges = buffBadges([
      { kind: 'moveSpeed', mult: 0.5, remaining: 2.4 },
      { kind: 'damageTaken', mult: 0.5, remaining: 3.1 },
    ]);
    expect(badges).toHaveLength(2);
    const slow = badges.find((b) => b.glyph === '🐌');
    expect(slow?.secs).toBe(3);
    expect(slow?.good).toBe(false);
    expect(buffLabel([{ kind: 'stun', mult: 0, remaining: 1.2 }])).toContain('💫');
  });
});

// ---------------------------------------------------------------------------
// Controller glyph schemes
// ---------------------------------------------------------------------------
describe('controller glyph schemes', () => {
  it('renders PlayStation shapes vs. Xbox/Nintendo letters', () => {
    expect(padIndexToLabel(0, 'playstation')).toBe('✕');
    expect(padIndexToLabel(0, 'xbox')).toBe('A');
    expect(padIndexToLabel(1, 'xbox')).toBe('B');
    expect(padIndexToLabel(0, 'nintendo')).toBe('B'); // Nintendo swaps A/B physically
    expect(padIndexToLabel(3, 'letters')).toBe('Y');
  });
});

// ---------------------------------------------------------------------------
// Dynamic camera zoom
// ---------------------------------------------------------------------------
describe('dynamic camera zoom', () => {
  it('zooms out (toward cover) when the group spreads, in when it clumps', () => {
    const cam = new Camera(1600, 1000);
    cam.fit(800, 600);
    const cover = Math.max(800 / 1600, 600 / 1000); // 0.6

    // Huge spread → clamp to the aspect-aware floor. This 800×600 viewport is
    // NOT arena-aspect (1.333 vs 1.6), so the floor loosens below cover to keep a
    // spread group framed: minZoom = min(1, max(contain/cover=0.833, 1/2.5)) = 0.833.
    cam.frameGroup(5000);
    for (let i = 0; i < 40; i++) cam.update(500);
    expect(cam.scale).toBeCloseTo(cover * 0.8333, 1); // ≈ 0.5, looser than plain cover

    // Tight clump → clamp to closest (zoom 1.5).
    cam.frameGroup(1);
    for (let i = 0; i < 40; i++) cam.update(500);
    expect(cam.scale).toBeCloseTo(cover * 1.5, 1);
  });
});
