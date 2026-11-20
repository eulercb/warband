import { expect, it } from 'vitest';
import { World } from '../src/engine/world/world';
import { resolvePlayerAbility } from '../src/engine/combat/abilities';
import { applyBuff, makeBuff } from '../src/engine/combat/combat';
import {
  decompose,
  recompose,
  componentValue,
  synthesizeAbility,
} from '../src/engine/content/forge';
import { describeAbility } from '../src/engine/content/classes';
import type { ExtSlot } from '../src/engine/core/types';

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
    expect(p.buffs.some((b) => b.kind === 'frontGuard')).toBe(false);
    expect(p.buffs.some((b) => b.kind === 'discord' || b.kind === 'harmony')).toBe(false);
    p.pos = { ...rally.pos };
    w.step(0.01, new Map());
    expect(p.buffs.find((b) => b.kind === 'frontGuard')?.mult).toBe(1);
    expect(p.buffs.some((b) => b.source === 'chorusMove')).toBe(true);
    p.buffs = p.buffs.filter((b) => b.kind !== 'frontGuard');
    w.step(0.01, new Map());
    expect(p.buffs.some((b) => b.kind === 'frontGuard')).toBe(false);
  },
);

it('Bolster lets allies visit independently, cleansing movement ailments and preserving a stronger guard', () => {
  const { w, p, ally, cast } = setup('ba_valor_bolster', true);
  cast('a3');
  cast('a2');
  cast('sub1');
  const z = w.groundZones.find((z) => z.rally)!;
  expect(ally.buffs.some((b) => b.kind === 'frontGuard')).toBe(false);
  applyBuff(ally, makeBuff('root', 0, 2, 'test'));
  applyBuff(ally, makeBuff('frontGuard', 2, 4, 'test'));
  ally.pos = { ...z.pos };
  w.step(0.01, new Map());
  expect(ally.buffs.some((b) => b.kind === 'root')).toBe(false);
  expect(ally.buffs.find((b) => b.kind === 'frontGuard')?.mult).toBe(2);
  expect(z.rally!.visitors).toEqual([ally.id]);
  expect(p.buffs.some((b) => b.kind === 'frontGuard')).toBe(false);
});

it('Battle Hymn replaces the old rally and a new rally within passive recovery gives speed only', () => {
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
  expect(zones[0].rally!.guard).toBe(false);
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
  expect(componentValue(comp) - componentValue(plain)).toBeCloseTo(10);
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

it('a copy outside Valor gives movement on entry without a passive block', () => {
  const { w, p, cast } = setup();
  delete p.subclassPassiveId;
  cast('a3');
  cast('a2');
  cast('a1');
  const z = w.groundZones.find((z) => z.rally)!;
  p.pos = { ...z.pos };
  w.step(0.01, new Map());
  expect(p.buffs.some((b) => b.kind === 'frontGuard')).toBe(false);
  expect(p.buffs.some((b) => b.source === 'chorusMove')).toBe(true);
});
