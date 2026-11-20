import { expect, it } from 'vitest';
import { World } from '../src/engine/world/world';
import { resolvePlayerAbility, spawnZone } from '../src/engine/combat/abilities';
import { applyBuff, damagePlayer, makeBuff } from '../src/engine/combat/combat';
import {
  decompose,
  recompose,
  componentValue,
  synthesizeAbility,
} from '../src/engine/content/forge';
import { describeAbility } from '../src/engine/content/classes';
import type { ExtSlot, InputCommand } from '../src/engine/core/types';

function setup(pick = 'ba_valor_blade', party = false, mods = ['ba_valor_g_b']) {
  const w = new World({
    seed: 31,
    monsterId: 'troll',
    players: [
      { peerId: 'a', name: 'Valor', classId: 'bard', subSkills: [pick], charUpgrades: mods },
      ...(party ? [{ peerId: 'b', name: 'Ally', classId: 'knight' as const }] : []),
    ],
  });
  w.scene = null;
  w.obstacles = [];
  w.terrain = [];
  const [p, ally] = w.players;
  p.pos = { x: 500, y: 400 };
  p.aim = { x: 1, y: 0 };
  if (ally) ally.pos = { x: 535, y: 400 };
  w.boss!.pos = { x: 1000, y: 600 };
  w.boss!.moveSpeed = 0;
  w.boss!.decisionTimer = 1000;
  function cast(slot: ExtSlot) {
    resolvePlayerAbility(w, p, slot, { x: 0, y: 0 });
  }
  return { w, p, ally, cast };
}

it.each(['blade', 'inspire', 'bolster', 'shatter'])(
  'first pick %s can prepare and visit a rally at full HP',
  (pick) => {
    const { w, p, cast } = setup('ba_valor_' + pick);
    cast('a2');
    expect(p.buffs.some((b) => b.kind === 'harmony')).toBe(false);
    cast('a3');
    cast('a2');
    expect(p.buffs.some((b) => b.kind === 'harmony')).toBe(true);
    expect(p.stats.healingDone).toBe(0);
    cast('a1');
    const rally = w.groundZones.find((z) => z.rally)!;
    expect(rally.pos).toEqual({ x: 700, y: 400 });
    expect(w.serialize().groundZones[0].rally).toBe(true);
    expect(p.buffs.some((b) => b.kind === 'frontGuard')).toBe(true);
    expect(p.buffs.some((b) => b.kind === 'rallyPassage')).toBe(false);
    expect(p.buffs.some((b) => b.kind === 'discord' || b.kind === 'harmony')).toBe(false);
    p.pos = { ...rally.pos };
    w.step(0.01, new Map());
    expect(p.buffs.find((b) => b.kind === 'rallyPassage')?.remaining).toBe(3);
    p.buffs = p.buffs.filter((b) => b.kind !== 'rallyPassage');
    w.step(0.01, new Map());
    expect(p.buffs.some((b) => b.kind === 'rallyPassage')).toBe(false);
  },
);

it.each(['blade', 'inspire', 'bolster'])(
  'a complete %s chorus buffs in-range allies immediately',
  (pick) => {
    const { w, p, ally, cast } = setup('ba_valor_' + pick, true);
    applyBuff(ally, makeBuff('root', 0, 2, 'testRoot'));
    applyBuff(ally, makeBuff('frontGuard', 2, 4, 'test'));
    cast('a3');
    cast('a2');
    cast(pick === 'blade' ? 'a1' : 'sub1');
    expect(ally.buffs.some((b) => b.source === 'chorusMove')).toBe(true);
    expect(ally.buffs.some((b) => b.kind === 'root')).toBe(pick !== 'bolster');
    expect(ally.buffs.some((b) => b.kind === 'damageDealt')).toBe(pick !== 'bolster');
    expect(ally.buffs.find((b) => b.kind === 'frontGuard')?.mult).toBe(2);
    expect(p.buffs.some((b) => b.kind === 'frontGuard')).toBe(true);
    expect(ally.buffs.some((b) => b.kind === 'rallyPassage')).toBe(false);
    const z = w.groundZones.find((z) => z.rally)!;
    ally.pos = { ...z.pos };
    w.step(0.01, new Map());
    expect(ally.buffs.some((b) => b.kind === 'rallyPassage')).toBe(true);
    expect(z.rally!.visitors).toEqual([ally.id]);
  },
);

it('Battle Hymn replaces the old rally even while the passive recovers', () => {
  const { w, p, cast } = setup('ba_valor_inspire');
  cast('a3');
  cast('a2');
  cast('a1');
  const old = w.groundZones.find((z) => z.rally)!;
  p.aim = { x: 0, y: 1 };
  cast('a3');
  cast('a2');
  cast('sub1');
  const zones = w.groundZones.filter((z) => z.rally);
  expect(zones).toHaveLength(1);
  expect(zones[0]).not.toBe(old);
  expect(zones[0].pos).toEqual({ x: 500, y: 600 });
  p.castEpoch = (p.castEpoch ?? 0) + 1;
  w.step(0.02, new Map());
  expect(w.groundZones).not.toContain(zones[0]);
});

it('a normal chorus still delivers its guard immediately', () => {
  const { w, p, cast } = setup('ba_valor_blade', false, []);
  applyBuff(p, makeBuff('harmony', 0, 8, 'test'));
  cast('a3');
  cast('a1');
  expect(w.groundZones.some((z) => z.rally)).toBe(false);
  expect(p.buffs.some((b) => b.kind === 'frontGuard')).toBe(true);
});

it('the rally modifier is priced and survives a real Forge cast', () => {
  const { w, p, cast } = setup();
  const native = p.abilities!.a1,
    comp = decompose(native);
  const plain = {
    ...comp,
    effects: comp.effects.map((e) => (e.kind === 'bardSong' ? { ...e, rhapsody: false } : e)),
  };
  expect(componentValue(comp) - componentValue(plain)).toBeCloseTo(30);
  expect(describeAbility(recompose(comp, { slot: 'a1', name: 'Rally', cooldown: 12 }))).toContain(
    'place a rally',
  );
  let forged;
  for (let seed = 0; seed < 128 && !forged; seed++) {
    const def = synthesizeAbility(
      seed,
      'Rally',
      'a1',
      ['a', 'b', 'c'].map((name) => ({
        name,
        classId: 'bard' as const,
        className: 'Bard',
        slot: 'a1',
        def: native,
      })),
      new Set(['buffAlly']),
    ).def;
    if (def.rhapsody && def.bardSong === 'chorus') forged = def;
  }
  expect(forged).toBeDefined();
  p.abilities!.a1 = forged!;
  cast('a3');
  cast('a2');
  cast('a1');
  expect(w.groundZones.some((z) => z.rally)).toBe(true);
});

it('downed allies cannot collect a rally and unfinished verses leave it unplaced', () => {
  const { w, p, ally, cast } = setup('ba_valor_blade', true);
  cast('a3');
  cast('a1');
  expect(w.groundZones.some((z) => z.rally)).toBe(false);
  cast('a2');
  cast('a1');
  const z = w.groundZones.find((z) => z.rally)!;
  ally.pos = { ...z.pos };
  ally.state = 'downed';
  ally.downedTimer = 5;
  w.step(0.01, new Map());
  expect(z.rally!.visitors).toEqual([]);
  expect(p.pos.x).toBe(500);
  z.remaining = 0;
  w.step(0.01, new Map());
  expect(w.groundZones).not.toContain(z);
});

it('a copy outside Valor gives flight and passage on entry without a passive block', () => {
  const { w, p, cast } = setup();
  delete p.subclassPassiveId;
  cast('a3');
  cast('a2');
  cast('a1');
  const z = w.groundZones.find((z) => z.rally)!;
  p.pos = { ...z.pos };
  w.step(0.01, new Map());
  expect(p.buffs.some((b) => b.kind === 'frontGuard')).toBe(false);
  expect(p.buffs.some((b) => b.kind === 'flight')).toBe(true);
  expect(p.buffs.some((b) => b.kind === 'rallyPassage')).toBe(true);
});

it('lets real walking cross a boss and hostile summon while still blocking cover', () => {
  const { w, p, cast } = setup();
  const boss = w.boss!;
  boss.pos = { x: 730, y: 400 };
  boss.radius = 45;
  const add = {
    id: w.allocId(),
    pos: { x: 820, y: 400 },
    radius: 19,
    hp: 100,
    maxHp: 100,
    moveSpeed: 0,
    attackCd: 1000,
    targetId: null,
    buffs: [],
  };
  w.adds.push(add);
  const input: InputCommand = {
    seq: 1,
    move: { x: 1, y: 0 },
    aim: { x: 1, y: 0 },
    buttons: { basic: false, a1: false, a2: false, a3: false, revive: false },
  };
  const walk = (frames: number) => {
    for (let i = 0; i < frames; i++) w.step(1 / 60, new Map([['a', input]]));
  };
  const wall = { id: w.allocId(), pos: { x: 920, y: 400 }, radius: 27 };
  w.obstacles.push(wall);
  spawnZone(w, {
    kind: 'voidZone',
    pos: { ...boss.pos },
    radius: 92,
    side: 'boss',
    ownerId: boss.id,
    damagePerTick: 15,
    healPerTick: 0,
    duration: 15,
  });
  walk(75);
  expect(p.hp).toBeLessThan(p.maxHp);
  expect(p.pos.x).toBeLessThan(boss.pos.x);
  expect(p.buffs.some((b) => b.kind === 'rallyPassage')).toBe(false);

  p.pos = { x: 500, y: 400 };
  p.hp = p.maxHp;
  cast('a3');
  cast('a2');
  cast('a1');
  walk(100);
  expect(p.pos.x).toBeGreaterThan(add.pos.x);
  expect(add.pos.x).toBe(820);
  expect(p.hp).toBe(p.maxHp);
  expect(p.pos.x).toBeCloseTo(wall.pos.x - wall.radius - p.radius);
  expect(p.buffs.some((b) => b.kind === 'rallyPassage')).toBe(true);
  expect(damagePlayer(w, p, 10)).toBeGreaterThan(0);
  walk(130);
  expect(p.buffs.some((b) => b.kind === 'rallyPassage')).toBe(false);
  expect(p.buffs.some((b) => b.kind === 'flight')).toBe(false);
  p.pos = { x: boss.pos.x - boss.radius - p.radius, y: boss.pos.y };
  const landedHp = p.hp;
  walk(31);
  expect(p.hp).toBeLessThan(landedHp);
  expect(p.pos.x).toBeCloseTo(boss.pos.x - boss.radius - p.radius);
});

it('does not grant chorus buffs outside casting range', () => {
  const { w, ally, cast } = setup('ba_valor_blade', true);
  ally.pos = { x: 975, y: 400 };
  cast('a3');
  cast('a2');
  cast('a1');
  expect(ally.buffs).toEqual([]);
  expect(w.groundZones.some((z) => z.rally)).toBe(true);
});

it('airborne hazards still hit and friendly ground healing still reaches the lifted ally', () => {
  const { w, p, ally, cast } = setup('ba_valor_blade', true);
  cast('a3');
  cast('a2');
  cast('a1');
  ally.pos = { ...w.groundZones.find((z) => z.rally)!.pos };
  applyBuff(ally, makeBuff('flight', 0, 6, 'flight'));
  const zone = { pos: ally.pos, radius: 30, duration: 2 };
  spawnZone(w, {
    ...zone,
    kind: 'rainOfArrows',
    side: 'boss',
    ownerId: 0,
    damagePerTick: 20,
    healPerTick: 0,
  });
  w.step(0.5, new Map());
  const damaged = ally.hp;
  expect(damaged).toBeLessThan(ally.maxHp);
  expect(ally.buffs.find((b) => b.source === 'flight')?.remaining).toBe(5.5);
  expect(ally.buffs.find((b) => b.source === 'rallyFlight')?.remaining).toBe(3);

  spawnZone(w, {
    ...zone,
    kind: 'sanctuary',
    side: 'player',
    ownerId: p.id,
    damagePerTick: 0,
    healPerTick: 50,
  });
  w.step(0.5, new Map());
  expect(ally.hp).toBeGreaterThan(damaged);

  // An extended flight can outlast Passage and a fresh pickup keeps that time.
  ally.buffs.find((b) => b.source === 'rallyFlight')!.remaining = 5;
  cast('a3');
  cast('a2');
  cast('a1');
  w.step(0.5, new Map());
  expect(ally.buffs.find((b) => b.source === 'rallyFlight')?.remaining).toBe(4.5);
  expect(ally.buffs.find((b) => b.kind === 'rallyPassage')?.remaining).toBe(3);

  ally.hp = 0;
  w.step(0.01, new Map());
  expect(ally.buffs.some((b) => b.source === 'rallyFlight' || b.kind === 'rallyPassage')).toBe(
    false,
  );
});
