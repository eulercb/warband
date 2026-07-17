/**
 * Chaos Forge — the component-driven EXECUTOR (resolveComposedAbility) and the
 * two gated world hooks (projectile on-impact zone, ally-buff zone tick). Drives
 * hand-built synthesized abilities through a real World and asserts each delivery
 * resolves its full payload. Canonical parity lives in the existing suites.
 */
import { describe, it, expect } from 'vitest';
import { resolvePlayerAbility, stepPlayerGlide } from '../src/engine/combat/abilities';
import { World } from '../src/engine/world/world';
import { recompose, type AbilityComponents } from '../src/engine/content/forge';
import { makeBuff, applyBuff } from '../src/engine/combat/combat';
import type { Player, ClassId, Vec2, Add } from '../src/engine/core/types';
import { ADD_HP, ADD_MOVE_SPEED, ADD_RADIUS } from '../src/engine/core/constants';

/** A synthesized ability from hand-built components (precise branch control). */
function synth(comp: AbilityComponents, cooldown = 8): ReturnType<typeof recompose> {
  return recompose(comp, { slot: 'a1', name: 'Test Fusion', cooldown });
}

function duo(caster: ClassId = 'knight', ally: ClassId = 'ranger'): World {
  const w = new World({
    monsterId: 'dragon',
    seed: 1,
    players: [
      { peerId: 'a', name: 'A', classId: caster },
      { peerId: 'b', name: 'B', classId: ally },
    ],
  });
  w.terrain = [];
  w.obstacles = [];
  w.groundZones = [];
  return w;
}

function solo(cls: ClassId = 'mage'): World {
  const w = new World({
    monsterId: 'dragon',
    seed: 1,
    players: [{ peerId: 'a', name: 'A', classId: cls }],
  });
  w.terrain = [];
  w.obstacles = [];
  w.groundZones = [];
  return w;
}

function mkAdd(w: World, pos: Vec2): Add {
  const a: Add = {
    id: w.allocId(),
    pos: { ...pos },
    hp: ADD_HP,
    maxHp: ADD_HP,
    moveSpeed: ADD_MOVE_SPEED,
    radius: ADD_RADIUS,
    targetId: null,
    attackCd: 0,
    buffs: [],
  };
  w.adds.push(a);
  return a;
}

const RIGHT: Vec2 = { x: 1, y: 0 };
const ZERO: Vec2 = { x: 0, y: 0 };
const kinds = (p: Player): string[] => p.buffs.map((b) => b.kind);

describe('resolveComposedAbility — strike deliveries', () => {
  it('meleeCone: damages boss + add, riders, lifesteal, self buff, rallies allies', () => {
    const w = duo('knight', 'ranger');
    const [p, ally] = w.players;
    p.pos = { x: 500, y: 500 };
    p.aim = { ...RIGHT };
    p.hp = p.maxHp - 40; // room to lifesteal
    ally.pos = { x: 560, y: 500 };
    ally.hp = ally.maxHp * 0.3; // most wounded → rally target
    w.boss!.pos = { x: 560, y: 500 };
    const add = mkAdd(w, { x: 555, y: 500 });
    const hp0 = w.boss!.hp;

    p.abilities!.a1 = synth({
      delivery: { kind: 'meleeCone', range: 120, halfAngleDeg: 60 },
      effects: [
        { kind: 'damage', amount: 30 },
        { kind: 'stun', seconds: 0.8 },
        { kind: 'slow', mult: 0.6, duration: 2 },
        { kind: 'lifesteal', frac: 0.5 },
        { kind: 'buff', target: 'self', dmgMult: 1.3, duration: 5 },
        { kind: 'buff', target: 'allies', defMult: 0.7, duration: 5 },
      ],
    });
    resolvePlayerAbility(w, p, 'a1', ZERO);

    expect(w.boss!.hp).toBeLessThan(hp0); // boss took damage
    expect(w.boss!.buffs.some((b) => b.kind === 'stun')).toBe(true); // rider
    expect(add.hp).toBeLessThan(ADD_HP); // add hit too
    expect(kinds(p)).toContain('damageDealt'); // self buff
    expect(p.hp).toBeGreaterThan(p.maxHp - 40); // lifesteal healed
    expect(kinds(ally)).toContain('damageTaken'); // rallied ally buff
  });

  it('meleeCone: an ally buff with no ally in range falls back to the caster', () => {
    const w = solo('knight');
    const p = w.players[0];
    p.pos = { x: 500, y: 500 };
    p.abilities!.a1 = synth({
      delivery: { kind: 'meleeCone', range: 80, halfAngleDeg: 45 },
      effects: [
        { kind: 'damage', amount: 20 },
        { kind: 'buff', target: 'allies', moveMult: 1.2, duration: 4 },
      ],
    });
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(kinds(p)).toContain('moveSpeed'); // rally fell back to self
  });

  it('meleeCone: a plain damage strike takes the no-ally-buff guard', () => {
    const w = duo();
    const p = w.players[0];
    p.abilities!.a1 = synth({
      delivery: { kind: 'meleeCone', range: 80, halfAngleDeg: 45 },
      effects: [{ kind: 'damage', amount: 15 }],
    });
    expect(() => resolvePlayerAbility(w, p, 'a1', ZERO)).not.toThrow();
    expect(kinds(p)).not.toContain('damageDealt'); // no buff applied
  });

  it('pbaoe: damages the boss and self-buffs', () => {
    const w = duo();
    const p = w.players[0];
    p.pos = { x: 500, y: 500 };
    w.boss!.pos = { x: 540, y: 500 };
    const add = mkAdd(w, { x: 520, y: 500 });
    const hp0 = w.boss!.hp;
    p.abilities!.a1 = synth({
      delivery: { kind: 'pbaoe', radius: 160 },
      effects: [
        { kind: 'damage', amount: 25 },
        { kind: 'buff', target: 'self', defMult: 0.6, duration: 4 },
      ],
    });
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(w.boss!.hp).toBeLessThan(hp0);
    expect(add.hp).toBeLessThan(ADD_HP); // burst caught the add too
    expect(kinds(p)).toContain('damageTaken');
  });
});

describe('resolveComposedAbility — projectile + on-impact zone (the flagship)', () => {
  it('a projectile blooms an ally-buff zone where it lands', () => {
    const w = duo('ranger', 'cleric');
    const p = w.players[0];
    p.pos = { x: 400, y: 500 };
    p.aim = { ...RIGHT };
    w.boss!.pos = { x: 540, y: 500 };

    p.abilities!.a1 = synth({
      delivery: { kind: 'projectile', projSpeed: 700, projCount: 1, impactRadius: 90 },
      effects: [
        {
          kind: 'zone',
          zone: {
            zoneKind: 'sanctuary',
            radius: 100,
            duration: 4,
            allyBuff: { defMult: 0.8, duration: 4 },
          },
        },
      ],
    });
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(w.projectiles.length).toBe(1);
    expect(w.projectiles[0].onImpact).toBeDefined();

    // Fly the shot into the boss; on impact it spawns the ally-buff zone.
    for (let t = 0; t < 30 && w.groundZones.length === 0; t++) w.step(0.05, new Map());
    expect(w.groundZones.length).toBeGreaterThan(0);
    expect(w.groundZones[0].allyBuff?.defMult).toBe(0.8);
  });

  it('a plain damage projectile hits its target (no zone)', () => {
    const w = duo();
    const p = w.players[0];
    p.pos = { x: 400, y: 500 };
    p.aim = { ...RIGHT };
    w.boss!.pos = { x: 500, y: 500 };
    const hp0 = w.boss!.hp;
    p.abilities!.a1 = synth({
      delivery: { kind: 'projectile', projSpeed: 700, projCount: 1 },
      effects: [
        { kind: 'damage', amount: 40 },
        { kind: 'buff', target: 'self', dmgMult: 1.2, duration: 4 },
      ],
    });
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(kinds(p)).toContain('damageDealt'); // self buff on cast
    for (let t = 0; t < 30 && w.boss!.hp === hp0; t++) w.step(0.05, new Map());
    expect(w.boss!.hp).toBeLessThan(hp0);
  });
});

describe('resolveComposedAbility — ground zones + ally-buff tick', () => {
  it('a centered sanctuary refreshes a 3-axis ally buff on allies inside', () => {
    const w = duo('cleric', 'knight');
    const [p, ally] = w.players;
    p.pos = { x: 500, y: 500 };
    ally.pos = { x: 510, y: 500 }; // inside the zone
    w.boss!.pos = { x: 100, y: 100 }; // out of the way
    p.abilities!.a1 = synth({
      delivery: { kind: 'groundZone' },
      effects: [
        {
          kind: 'zone',
          zone: {
            zoneKind: 'sanctuary',
            radius: 140,
            duration: 5,
            allyBuff: { defMult: 0.8, dmgMult: 1.2, moveMult: 1.15, duration: 4 },
          },
        },
      ],
    });
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(w.groundZones.length).toBe(1);
    // Zone centered on the caster (sanctuary), not ground-targeted.
    expect(w.groundZones[0].pos.x).toBeCloseTo(500, 0);
    for (let t = 0; t < 14; t++) w.step(0.05, new Map()); // > one zone tick
    expect(kinds(ally)).toEqual(
      expect.arrayContaining(['damageTaken', 'damageDealt', 'moveSpeed']),
    );
  });

  it('a ground-targeted damaging zone lands at the aim offset and hurts the boss', () => {
    const w = duo();
    const p = w.players[0];
    p.pos = { x: 300, y: 500 };
    p.aim = { ...RIGHT };
    w.boss!.pos = { x: 500, y: 500 };
    const hp0 = w.boss!.hp;
    p.abilities!.a1 = synth({
      delivery: { kind: 'groundZone', range: 200 },
      effects: [
        { kind: 'zone', zone: { zoneKind: 'poison', radius: 120, duration: 4, tickDamage: 12 } },
      ],
    });
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(w.groundZones[0].pos.x).toBeGreaterThan(400); // placed toward the aim
    // item 12 — a ranged zone ARMS (telegraphs) before it bites; step past the
    // arming window AND the first live tick before checking damage.
    for (let t = 0; t < 22; t++) w.step(0.05, new Map());
    expect(w.boss!.hp).toBeLessThan(hp0);
  });
});

describe('resolveComposedAbility — mobility, buffs, heals, taunt', () => {
  it('dash: moves, slams for landing damage, self-buffs and self-heals', () => {
    const w = duo('barbarian');
    const p = w.players[0];
    p.pos = { x: 400, y: 500 };
    p.aim = { ...RIGHT };
    p.hp = p.maxHp - 30;
    w.boss!.pos = { x: 500, y: 500 };
    const add = mkAdd(w, { x: 500, y: 500 });
    const hp0 = w.boss!.hp;
    p.abilities!.a1 = synth({
      delivery: { kind: 'dash', range: 100, iframes: 0.3 },
      effects: [
        { kind: 'landingDamage', amount: 40 },
        { kind: 'healOnUse', amount: 20 },
        { kind: 'buff', target: 'self', moveMult: 1.3, duration: 4 },
      ],
    });
    resolvePlayerAbility(w, p, 'a1', RIGHT);
    // item 2: buffs, self-heal and i-frames fire ON USE; the travel + landing slam
    // play out over the following ticks (a composed dash glides, it doesn't teleport).
    expect(kinds(p)).toContain('moveSpeed');
    expect(p.hp).toBeGreaterThan(p.maxHp - 30); // self-heal on use
    expect(p.buffs.some((b) => b.kind === 'invuln')).toBe(true); // i-frames on use
    for (let i = 0; i < 40 && p.glide; i++) stepPlayerGlide(w, p, 0.05);
    expect(p.pos.x).toBeGreaterThan(400); // dashed east
    expect(w.boss!.hp).toBeLessThan(hp0); // landing slam on touchdown
    expect(add.hp).toBeLessThan(ADD_HP); // slam caught the add
  });

  it('dash: a zero move vector falls back to the aim direction', () => {
    const w = solo('barbarian');
    const p = w.players[0];
    p.pos = { x: 400, y: 500 };
    p.aim = { ...RIGHT };
    p.abilities!.a1 = synth({
      delivery: { kind: 'dash', range: 120 },
      effects: [{ kind: 'buff', target: 'self', moveMult: 1.2, duration: 3 }],
    });
    resolvePlayerAbility(w, p, 'a1', ZERO);
    for (let i = 0; i < 40 && p.glide; i++) stepPlayerGlide(w, p, 0.05);
    expect(p.pos.x).toBeGreaterThan(400);
  });

  it('dash/blink: a root locks a composed mover (item 2)', () => {
    const w = solo('barbarian');
    const p = w.players[0];
    p.pos = { x: 400, y: 500 };
    p.aim = { ...RIGHT };
    applyBuff(p, makeBuff('root', 0, 1, 'testRoot'));
    p.abilities!.a1 = synth({ delivery: { kind: 'dash', range: 120 }, effects: [] });
    resolvePlayerAbility(w, p, 'a1', RIGHT);
    expect(p.glide == null).toBe(true); // rooted → no glide started
    expect(p.pos.x).toBeCloseTo(400, 4); // and no movement
  });

  it('blink: teleports along the aim, self-buffs and heals', () => {
    const w = solo('mage');
    const p = w.players[0];
    p.pos = { x: 400, y: 500 };
    p.aim = { ...RIGHT };
    p.hp = p.maxHp - 25;
    p.abilities!.a1 = synth({
      delivery: { kind: 'blink', range: 150, iframes: 0.2 },
      effects: [
        { kind: 'healOnUse', amount: 15 },
        { kind: 'buff', target: 'self', defMult: 0.7, duration: 4 },
      ],
    });
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(p.pos.x).toBeGreaterThan(400);
    expect(p.hp).toBeGreaterThan(p.maxHp - 25);
    expect(kinds(p)).toContain('damageTaken');
  });

  it('selfBuff: applies every self axis and heals on use', () => {
    const w = solo('knight');
    const p = w.players[0];
    p.hp = p.maxHp - 20;
    p.abilities!.a1 = synth({
      delivery: { kind: 'selfBuff' },
      effects: [
        { kind: 'buff', target: 'self', defMult: 0.5, dmgMult: 1.4, moveMult: 1.2, duration: 5 },
        { kind: 'healOnUse', amount: 12 },
      ],
    });
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(kinds(p)).toEqual(expect.arrayContaining(['damageTaken', 'damageDealt', 'moveSpeed']));
    expect(p.hp).toBeGreaterThan(p.maxHp - 20);
  });

  it('buffAlly: buffs and heals a wounded ally; heal no-ops with none in range', () => {
    const w = duo('cleric', 'knight');
    const [p, ally] = w.players;
    p.pos = { x: 500, y: 500 };
    ally.pos = { x: 520, y: 500 };
    ally.hp = ally.maxHp * 0.4;
    p.abilities!.a1 = synth({
      delivery: { kind: 'buffAlly', range: 400 },
      effects: [
        { kind: 'buff', target: 'allies', defMult: 0.75, duration: 6 },
        { kind: 'heal', amount: 30 },
      ],
    });
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(kinds(ally)).toContain('damageTaken');
    expect(ally.hp).toBeGreaterThan(ally.maxHp * 0.4);

    // With the ally out of range, the heal simply finds no target.
    const w2 = solo('cleric');
    const s = w2.players[0];
    s.hp = s.maxHp; // full → still a valid (self) target for heal
    s.abilities!.a1 = synth({
      delivery: { kind: 'heal', range: 5 },
      effects: [{ kind: 'heal', amount: 20 }],
    });
    expect(() => resolvePlayerAbility(w2, s, 'a1', ZERO)).not.toThrow();
  });

  it('heal: mends the lowest-HP ally in range', () => {
    const w = duo('cleric', 'knight');
    const [p, ally] = w.players;
    p.pos = { x: 500, y: 500 };
    ally.pos = { x: 520, y: 500 };
    ally.hp = ally.maxHp * 0.5;
    p.abilities!.a1 = synth({
      delivery: { kind: 'heal', range: 400 },
      effects: [{ kind: 'heal', amount: 40 }],
    });
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(ally.hp).toBeGreaterThan(ally.maxHp * 0.5);
  });

  it('bare deliveries fall back to sensible defaults; dead entities are skipped', () => {
    const w = duo('knight');
    const p = w.players[0];
    p.pos = { x: 500, y: 500 };
    p.aim = { ...RIGHT };
    w.boss!.hp = 0; // dead boss → the strike loops skip it (continue branch)
    w.boss!.pos = { x: 520, y: 500 };
    const dead = mkAdd(w, { x: 515, y: 500 });
    dead.hp = 0; // dead add → skipped too

    // meleeCone with no range/halfAngle → 70u / 45° defaults.
    let live = mkAdd(w, { x: 515, y: 500 });
    p.abilities!.a1 = synth({
      delivery: { kind: 'meleeCone' },
      effects: [{ kind: 'damage', amount: 10 }],
    });
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(live.hp).toBeLessThan(ADD_HP);

    // pbaoe with no radius → 150u default.
    live = mkAdd(w, { x: 515, y: 500 });
    p.abilities!.a1 = synth({
      delivery: { kind: 'pbaoe' },
      effects: [{ kind: 'damage', amount: 10 }],
    });
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(live.hp).toBeLessThan(ADD_HP);

    // dash with no range → 220u; landing with no radius → 120u; dead entities skipped.
    mkAdd(w, { x: 560, y: 500 });
    p.abilities!.a1 = synth({
      delivery: { kind: 'dash' },
      effects: [{ kind: 'landingDamage', amount: 10 }],
    });
    resolvePlayerAbility(w, p, 'a1', RIGHT);

    // projectile: bare (defaults) then a fan (count > 1 spread branch).
    w.projectiles = [];
    p.abilities!.a1 = synth({
      delivery: { kind: 'projectile' },
      effects: [{ kind: 'damage', amount: 10 }],
    });
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(w.projectiles.length).toBe(1);
    w.projectiles = [];
    p.abilities!.a1 = synth({
      delivery: { kind: 'projectile', projCount: 3, spreadDeg: 20 },
      effects: [{ kind: 'damage', amount: 10 }],
    });
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(w.projectiles.length).toBe(3);

    // groundZone with no aim range → 500u ground-target default.
    w.groundZones = [];
    p.abilities!.a1 = synth({
      delivery: { kind: 'groundZone' },
      effects: [
        { kind: 'zone', zone: { zoneKind: 'poison', radius: 100, duration: 3, tickDamage: 6 } },
      ],
    });
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(w.groundZones.length).toBe(1);

    // blink with no range → 250u default (self-buff too).
    p.abilities!.a1 = synth({
      delivery: { kind: 'blink' },
      effects: [{ kind: 'buff', target: 'self', defMult: 0.8, duration: 3 }],
    });
    expect(() => resolvePlayerAbility(w, p, 'a1', ZERO)).not.toThrow();

    // taunt with no buffDuration → 4s default timer.
    p.abilities!.a1 = synth({ delivery: { kind: 'taunt' }, effects: [] });
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(w.tauntTimer).toBeGreaterThan(0);

    // bare buffAlly / heal → 400u default range (the caster is always reached).
    p.abilities!.a1 = synth({
      delivery: { kind: 'buffAlly' },
      effects: [{ kind: 'buff', target: 'allies', defMult: 0.8, duration: 4 }],
    });
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(kinds(p)).toContain('damageTaken'); // caster in the 400u default
    p.abilities!.a1 = synth({ delivery: { kind: 'heal' }, effects: [{ kind: 'heal', amount: 5 }] });
    expect(() => resolvePlayerAbility(w, p, 'a1', ZERO)).not.toThrow();
  });

  it('buffAlly skips allies out of its range (dist gate)', () => {
    const w = duo('cleric', 'knight');
    const [p, ally] = w.players;
    p.pos = { x: 500, y: 500 };
    ally.pos = { x: 700, y: 500 }; // 200u east on the torus → outside a 40u rally
    p.abilities!.a1 = synth({
      delivery: { kind: 'buffAlly', range: 40 },
      effects: [{ kind: 'buff', target: 'allies', defMult: 0.75, duration: 5 }],
    });
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(kinds(p)).toContain('damageTaken'); // caster (dist 0) in range
    expect(kinds(ally)).not.toContain('damageTaken'); // ally out of reach, skipped
  });

  it('taunt: pulls aggro, shields the taunter and self-heals', () => {
    const w = duo('knight');
    const p = w.players[0];
    p.hp = p.maxHp - 15;
    p.abilities!.a1 = synth({
      delivery: { kind: 'taunt' },
      effects: [
        { kind: 'buff', target: 'self', defMult: 0.5, duration: 4 },
        { kind: 'healOnUse', amount: 10 },
      ],
    });
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(w.tauntTargetId).toBe(p.id);
    expect(kinds(p)).toContain('damageTaken');
    expect(p.hp).toBeGreaterThan(p.maxHp - 15);
  });
});
