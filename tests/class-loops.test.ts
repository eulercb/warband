import { describe, expect, it } from 'vitest';
import { World } from '../src/engine/world/world';
import { resolvePlayerAbility } from '../src/engine/combat/abilities';
import {
  applyBuff,
  damageBoss,
  damageAdd,
  damagePlayer,
  makeBuff,
  tickBuffs,
} from '../src/engine/combat/combat';
import { getClass, describeAbility } from '../src/engine/content/classes';
import { decompose, recompose, refreshComponents } from '../src/engine/content/forge';
import { computeBotInput } from '../src/engine/ai/bot';
import { setProceduralSeed } from '../src/engine/content/procgen';
import { getSubSkill } from '../src/engine/content/subclasses';
import { buffBadges } from '../src/render/overlays/buffGlyphs';
import type { Add, ClassId, GroundZone } from '../src/engine/core/types';

const ZERO = { x: 0, y: 0 };
function world(classId: ClassId = 'rogue') {
  const w = new World({
    monsterId: 'dragon',
    seed: 42,
    players: [
      { peerId: 'a', name: 'A', classId },
      { peerId: 'b', name: 'B', classId: 'knight' },
    ],
  });
  w.players[0].pos = { x: 600, y: 400 };
  w.players[0].aim = { x: 1, y: 0 };
  w.boss!.pos = { x: 640, y: 400 };
  w.boss!.facing = Math.PI;
  w.players[0].critChance = 0;
  return w;
}
function prepare(w: World) {
  resolvePlayerAbility(w, w.players[0], 'a2', ZERO);
  w.players[0].pos = { x: 600, y: 400 };
}
function tickZone(w: World, z: GroundZone) {
  (w as unknown as { applyZoneTick: (z: GroundZone) => void }).applyZoneTick(z);
}
function add(w: World): Add {
  const a: Add = {
    id: w.allocId(),
    pos: { x: 640, y: 400 },
    hp: 1000,
    maxHp: 1000,
    radius: 12,
    moveSpeed: 0,
    targetId: null,
    attackCd: 0,
    buffs: [],
  };
  w.adds.push(a);
  return a;
}

describe('Rogue preparation', () => {
  it('basic attacks preserve preparation; the next Backstab consumes it and crits', () => {
    const w = world();
    const p = w.players[0];
    prepare(w);
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(p.buffs.some((b) => b.kind === 'precision')).toBe(true);
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(p.buffs.some((b) => b.kind === 'precision')).toBe(false);
    expect(w.events.filter((e) => e.t === 'hit').at(-1)).toMatchObject({ crit: true, amount: 90 });
    // Prevent random base ability crits for the second strike.
    p.abilities!.a1.critChanceBonus = 0;
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(w.events.filter((e) => e.t === 'hit').at(-1)).toMatchObject({ crit: false, amount: 50 });
  });
  it('a miss and an invulnerable boss preserve preparation', () => {
    const w = world();
    const p = w.players[0];
    prepare(w);
    p.aim = { x: -1, y: 0 };
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(p.buffs.some((b) => b.kind === 'precision')).toBe(true);
    p.aim = { x: 1, y: 0 };
    applyBuff(w.boss!, makeBuff('invuln', 0, 2, 'test'));
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(p.buffs.some((b) => b.kind === 'precision')).toBe(true);
  });
  it('expires, refreshes without stacking, and cannot be granted while rooted', () => {
    const w = world();
    const p = w.players[0];
    prepare(w);
    prepare(w);
    expect(p.buffs.filter((b) => b.kind === 'precision')).toHaveLength(1);
    tickBuffs(p, 4.1);
    expect(p.buffs.some((b) => b.kind === 'precision')).toBe(false);
    applyBuff(p, makeBuff('root', 0, 2, 'test'));
    resolvePlayerAbility(w, p, 'a2', ZERO);
    expect(p.buffs.some((b) => b.kind === 'precision')).toBe(false);
  });
  it('works for an equipped Assassin precision skill and a grafted Shadowstep', () => {
    const w = world('knight');
    const p = w.players[0];
    p.abilities!.a2 = { ...getClass('rogue').abilities.a2, slot: 'a2' };
    p.subAbilities = { sub1: { ...getSubSkill('ro_assassin_strike')!.ability, slot: 'sub1' } };
    prepare(w);
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(w.events.filter((e) => e.t === 'hit').at(-1)).toMatchObject({ crit: true });
    expect(p.buffs.some((b) => b.kind === 'precision')).toBe(false);
  });
});

describe('Warlock personal curses', () => {
  it('marks from a real Hex zone, amplifies only its owner, and does not stack on refresh', () => {
    const w = world('warlock');
    const p = w.players[0];
    const b = w.boss!;
    resolvePlayerAbility(w, p, 'a1', ZERO);
    const z = w.groundZones.at(-1)!;
    z.pos = { ...b.pos };
    tickZone(w, z);
    tickZone(w, z);
    expect(b.buffs.filter((v) => v.kind === 'curse')).toHaveLength(1);
    expect(damageBoss(w, p, b, 100)).toBeCloseTo(115);
    expect(damageBoss(w, w.players[1], b, 100)).toBe(100);
    tickBuffs(b, 1.6);
    expect(damageBoss(w, p, b, 100)).toBe(100);
  });
  it('marks adds and keeps curses from different owners independent', () => {
    const w = world('warlock');
    const a = add(w);
    const p = w.players[0];
    resolvePlayerAbility(w, p, 'a1', ZERO);
    const z = w.groundZones.at(-1)!;
    z.pos = { ...a.pos };
    tickZone(w, z);
    applyBuff(a, makeBuff('curse', 1.2, 2, `curse:${w.players[1].id}`));
    expect(damageAdd(w, p, a, 100)).toBeCloseTo(115);
    expect(damageAdd(w, w.players[1], a, 100)).toBeCloseTo(120);
  });
  it('ground Hex respects flight and the armed travel delay', () => {
    const w = world('warlock');
    const b = w.boss!;
    resolvePlayerAbility(w, w.players[0], 'a1', ZERO);
    const z = w.groundZones.at(-1)!;
    expect(z.armRemaining).toBeGreaterThan(0);
    expect(b.buffs.some((v) => v.kind === 'curse')).toBe(false);
    z.pos = { ...b.pos };
    applyBuff(b, makeBuff('flight', 0, 4, 'test'));
    tickZone(w, z);
    expect(b.buffs.some((v) => v.kind === 'curse')).toBe(false);
    z.airborne = true;
    tickZone(w, z);
    expect(b.buffs.some((v) => v.kind === 'curse')).toBe(true);
  });
});

describe('Warlock one-use retaliation', () => {
  it('retains the immediate burst, counterbursts once on damage, and drains life', () => {
    const w = world('warlock');
    const p = w.players[0];
    const b = w.boss!;
    p.hp = 80;
    const before = b.hp;
    resolvePlayerAbility(w, p, 'a2', ZERO);
    expect(before - b.hp).toBe(30);
    expect(p.hp).toBe(86);
    damagePlayer(w, p, 10);
    expect(before - b.hp).toBe(42);
    expect(p.hp).toBeCloseTo(78.4);
    expect(p.buffs.some((v) => v.kind === 'rebuke')).toBe(false);
    damagePlayer(w, p, 10);
    expect(before - b.hp).toBe(42);
  });
  it('does not trigger on dodged hits and expires without exploding', () => {
    const w = world('warlock');
    const p = w.players[0];
    resolvePlayerAbility(w, p, 'a2', ZERO);
    const before = w.boss!.hp;
    applyBuff(p, makeBuff('invuln', 0, 1, 'test'));
    damagePlayer(w, p, 10);
    expect(p.buffs.some((v) => v.kind === 'rebuke')).toBe(true);
    tickBuffs(p, 3.1);
    damagePlayer(w, p, 10);
    expect(w.boss!.hp).toBe(before);
  });
  it('cannot rescue a lethal hit or hurt an enemy outside its radius', () => {
    const w = world('warlock');
    const p = w.players[0];
    resolvePlayerAbility(w, p, 'a2', ZERO);
    const before = w.boss!.hp;
    w.boss!.pos.x += 1000;
    damagePlayer(w, p, 10);
    expect(w.boss!.hp).toBe(before);
    resolvePlayerAbility(w, p, 'a2', ZERO);
    p.hp = 1;
    damagePlayer(w, p, 1000);
    expect(p.hp).toBeLessThanOrEqual(0);
    expect(w.boss!.hp).toBe(before);
  });
});

describe('composed abilities and compact feedback', () => {
  it.each([
    ['rogue', 'a1'],
    ['rogue', 'a2'],
    ['warlock', 'a1'],
    ['warlock', 'a2'],
  ] as const)(
    'preserves %s/%s interactions through Forge round-trip and upgrade refresh',
    (c, slot) => {
      const ab = getClass(c).abilities[slot];
      const rebuilt = recompose(decompose(ab), ab);
      for (const key of [
        'prepareCrit',
        'consumesPrecision',
        'rebukeDuration',
        'curseBonus',
      ] as const)
        expect(rebuilt[key]).toBe(ab[key]);
      const refreshed = recompose(refreshComponents(rebuilt), ab);
      for (const key of [
        'prepareCrit',
        'consumesPrecision',
        'rebukeDuration',
        'curseBonus',
      ] as const)
        expect(refreshed[key]).toBe(ab[key]);
      expect(describeAbility(rebuilt)).toMatch(/prepar|counterburst|curse/);
    },
  );
  it('executes composed blink, precision strike, Hex and counterburst', () => {
    for (const c of ['rogue', 'warlock'] as const) {
      const w = world(c);
      const p = w.players[0];
      for (const slot of ['a1', 'a2'] as const)
        p.abilities![slot] = recompose(decompose(p.abilities![slot]), p.abilities![slot]);
      if (c === 'rogue') {
        prepare(w);
        resolvePlayerAbility(w, p, 'a1', ZERO);
        expect(w.events.filter((e) => e.t === 'hit').at(-1)).toMatchObject({ crit: true });
      } else {
        resolvePlayerAbility(w, p, 'a1', ZERO);
        const z = w.groundZones.at(-1)!;
        z.pos = { ...w.boss!.pos };
        tickZone(w, z);
        expect(w.boss!.buffs.some((b) => b.kind === 'curse')).toBe(true);
        resolvePlayerAbility(w, p, 'a2', ZERO);
        const before = w.boss!.hp;
        damagePlayer(w, p, 10);
        expect(w.boss!.hp).toBeLessThan(before);
      }
    }
  });
  it('shows one compact readable badge for each new state', () => {
    expect(
      buffBadges(
        ['precision', 'curse', 'rebuke'].map((kind) => ({
          kind: kind as 'precision' | 'curse' | 'rebuke',
          mult: 1,
          remaining: 3,
        })),
      ),
    ).toHaveLength(3);
  });
});

describe('identity survives run systems', () => {
  it('keeps behavior in procedural variants without changing the shared kit', () => {
    try {
      setProceduralSeed(123);
      expect(getClass('rogue').abilities.a2.prepareCrit).toBe(4);
      expect(getClass('rogue').abilities.a1.consumesPrecision).toBe(true);
      expect(getClass('warlock').abilities.a1.curseBonus).toBe(0.15);
      expect(getClass('warlock').abilities.a2.rebukeDuration).toBe(3);
    } finally {
      setProceduralSeed(null);
    }
  });
  it('retains preparation across a multiclass swap without refreshing it', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 42,
      players: [{ peerId: 'a', name: 'A', classId: 'rogue', extraClasses: ['warlock'] }],
    });
    const p = w.players[0];
    prepare(w);
    tickBuffs(p, 1);
    w.setActiveClass(p, 'warlock');
    w.setActiveClass(p, 'rogue');
    expect(p.buffs.find((b) => b.kind === 'precision')?.remaining).toBe(3);
    expect(p.cooldowns.a1).toBeGreaterThan(0);
  });
  it('replays a seeded sequence deterministically and serializes compact statuses', () => {
    const run = () => {
      const w = world('warlock');
      const p = w.players[0];
      resolvePlayerAbility(w, p, 'a1', ZERO);
      const z = w.groundZones.at(-1)!;
      z.pos = { ...w.boss!.pos };
      tickZone(w, z);
      resolvePlayerAbility(w, p, 'a2', ZERO);
      const snap = w.serialize();
      expect(snap.players[0].buffs?.some((b) => b.kind === 'rebuke')).toBe(true);
      expect(snap.bosses[0].buffs?.some((b) => b.kind === 'curse')).toBe(true);
      damagePlayer(w, p, 10);
      return { events: w.events, snapshot: w.serialize() };
    };
    expect(run()).toEqual(run());
  });
});

describe('bot preparation and zone activation', () => {
  it('uses Shadowstep to prepare a nearby approach, without teleporting from melee range', () => {
    const w = world();
    const p = w.players[0];
    w.boss!.pos.x = p.pos.x + 240;
    const cmd = computeBotInput(w, p, 1);
    expect(cmd.buttons.a2).toBe(true);
    p.aim = cmd.aim;
    resolvePlayerAbility(w, p, 'a2', cmd.move);
    expect(p.buffs.some((b) => b.kind === 'precision')).toBe(true);
    w.boss!.pos.x = p.pos.x + 40;
    expect(computeBotInput(w, p, 2).buttons.a2).toBe(false);
    p.cooldowns.a1 = 2;
    w.boss!.pos.x = p.pos.x + 240;
    expect(computeBotInput(w, p, 3).buttons.a2).toBe(false);
  });
  it('keeps a Hex mark inert during travel, then activates it on a normal zone tick', () => {
    const w = world('warlock');
    const p = w.players[0];
    resolvePlayerAbility(w, p, 'a1', ZERO);
    const z = w.groundZones.at(-1)!;
    z.pos = { ...w.boss!.pos };
    z.armRemaining = 0.2;
    const update = (dt: number) =>
      (w as unknown as { updateZones: (dt: number) => void }).updateZones(dt);
    update(0.1);
    expect(w.boss!.buffs.some((b) => b.kind === 'curse')).toBe(false);
    update(0.6);
    expect(w.boss!.buffs.some((b) => b.kind === 'curse')).toBe(true);
  });
});

describe('counterburst ownership and payload', () => {
  it('refreshes with upgraded values and hits live nearby adds, preserving attribution', () => {
    const w = world('warlock');
    const p = w.players[0];
    const nearby = add(w);
    const dead = add(w);
    dead.hp = 0;
    const distant = add(w);
    distant.pos.x += 1000;
    resolvePlayerAbility(w, p, 'a2', ZERO);
    p.abilities!.a2.damage = 60;
    p.abilities!.a2.radius = 200;
    resolvePlayerAbility(w, p, 'a2', ZERO);
    expect(p.buffs.filter((b) => b.kind === 'rebuke')).toHaveLength(1);
    const before = nearby.hp;
    const bossBefore = w.boss!.hp;
    const score = p.stats.damageDealt;
    damagePlayer(w, p, 10);
    expect(before - nearby.hp).toBe(24);
    expect(bossBefore - w.boss!.hp).toBe(24);
    expect(p.stats.damageDealt - score).toBe(48);
    expect(dead.hp).toBe(0);
    expect(distant.hp).toBe(1000);
  });
  it('supports a burst without optional radius or lifesteal and ignores zero damage', () => {
    const w = world('warlock');
    const p = w.players[0];
    delete p.abilities!.a2.radius;
    delete p.abilities!.a2.lifestealFrac;
    resolvePlayerAbility(w, p, 'a2', ZERO);
    damagePlayer(w, p, 0);
    expect(p.buffs.some((b) => b.kind === 'rebuke')).toBe(true);
    const hp = p.hp;
    damagePlayer(w, p, 10);
    expect(p.hp).toBe(hp - 10);
    expect(p.buffs.some((b) => b.kind === 'rebuke')).toBe(false);
  });
  it('supports a precision strike hitting only an add', () => {
    const w = world();
    const p = w.players[0];
    const a = add(w);
    w.boss!.pos.x += 1000;
    prepare(w);
    const hp = a.hp;
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(hp - a.hp).toBe(90);
    expect(p.buffs.some((b) => b.kind === 'precision')).toBe(false);
  });
});
