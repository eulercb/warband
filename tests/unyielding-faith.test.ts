import { expect, it } from 'vitest';
import { World } from '../src/engine/world/world';
import { damagePlayer, healPlayer, applyBuff, makeBuff } from '../src/engine/combat/combat';
import { resolvePlayerAbility } from '../src/engine/combat/abilities';
import {
  componentValue,
  decompose,
  recompose,
  synthesizeAbility,
} from '../src/engine/content/forge';
import { describeAbility } from '../src/engine/content/classes';

function setup(pick = 'pa_devotion_aura', party = false) {
  const w = new World({
    seed: 31,
    monsterId: 'troll',
    players: [
      {
        peerId: 'a',
        name: 'Devotion',
        classId: 'paladin',
        subSkills: [pick],
        charUpgrades: ['pa_devotion_g_b'],
      },
      ...(party ? [{ peerId: 'b', name: 'Ally', classId: 'knight' as const }] : []),
    ],
  });
  w.scene = null;
  w.obstacles = [];
  w.terrain = [];
  const [p, ally] = w.players;
  p.pos = { x: 500, y: 400 };
  if (ally) ally.pos = { x: 540, y: 400 };
  w.boss!.pos = { x: 1000, y: 600 };
  w.boss!.moveSpeed = 0;
  w.boss!.decisionTimer = 1000;
  function step(slot?: 'a2' | 'a3', dt = 0.01) {
    w.step(
      dt,
      new Map([
        [
          'a',
          {
            seq: w.tick,
            move: { x: 0, y: 0 },
            aim: { x: 1, y: 0 },
            buttons: {
              basic: false,
              a1: false,
              a2: slot === 'a2',
              a3: slot === 'a3',
              revive: false,
            },
          },
        ],
      ]),
    );
  }
  function wait(seconds: number) {
    for (let i = 0; i < Math.round(seconds * 100); i++) step();
  }
  return { w, p, ally, step, wait };
}
it.each(['smite', 'sanctuary', 'bless', 'aura'])(
  'first pick %s can prepare at full HP and use Lay on Hands',
  (pick) => {
    const { w, p, step, wait } = setup('pa_devotion_' + pick);
    step('a3');
    expect(w.serialize().players[0].paladinAura?.faithReady).toBe(true);
    expect(damagePlayer(w, p, 100)).toBe(0);
    expect(p.faithWound).toBeUndefined();
    wait(1.3);
    expect(damagePlayer(w, p, 60)).toBeCloseTo(25.5);
    expect(p.faithWound?.amount).toBeCloseTo(25.5);
    expect(w.serialize().players[0].faithWound).toBeDefined();
    step('a2');
    expect(p.faithWound).toBeUndefined();
    expect(p.hp).toBeCloseTo(p.maxHp);
    expect(p.paladinAura?.kind).toBe('renewal');
  },
);
it('a single aura charge is shared, and only an in-range HP hit can claim it', () => {
  const { w, p, ally, step } = setup('pa_devotion_aura', true);
  step('a3');
  ally.pos = { x: 850, y: 400 };
  step();
  expect(damagePlayer(w, ally, 20)).toBeCloseTo(20);
  expect(p.paladinAura?.faithReady).toBe(true);
  ally.pos = { x: 540, y: 400 };
  step();
  applyBuff(ally, makeBuff('absorption', 20, 1, 'test'));
  expect(damagePlayer(w, ally, 20)).toBe(0);
  expect(p.paladinAura?.faithReady).toBe(true);
  expect(damagePlayer(w, ally, 150)).toBeGreaterThan(0);
  expect(ally.faithWound?.amount).toBeCloseTo(ally.maxHp * 0.25);
  expect(p.paladinAura?.faithReady).toBe(false);
  expect(damagePlayer(w, ally, 10)).toBeCloseTo(8.5);
});
it('small heals pay the wound before restoring HP and settlement bypasses a later shield', () => {
  const { w, p, ally, step, wait } = setup('pa_devotion_aura', true);
  step('a3');
  damagePlayer(w, ally, 60);
  const hp = ally.hp;
  expect(healPlayer(w, p, ally, 5)).toBe(0);
  expect(ally.hp).toBe(hp);
  expect(ally.faithWound?.amount).toBeCloseTo(20.5);
  delete p.paladinAura;
  ally.pos = { x: 850, y: 400 };
  applyBuff(ally, makeBuff('invuln', 0, 4, 'test'));
  wait(3.01);
  expect(ally.hp).toBeCloseTo(hp - 20.5);
  expect(ally.faithWound).toBeUndefined();
});
it('lethal settlement downs a recipient before they can act and Phoenix clears the wound', () => {
  for (const phoenix of [false, true]) {
    const { w, p, step, wait } = setup();
    step('a3');
    wait(1.3);
    damagePlayer(w, p, 50);
    p.hp = 1;
    p.selfRevives = Number(phoenix);
    wait(3.01);
    expect(p.state).toBe(phoenix ? 'alive' : 'downed');
    expect(p.faithWound).toBeUndefined();
  }
});
it('a paid aura component survives actual synthesis and a composed cast', () => {
  const { w, p, ally } = setup('pa_devotion_aura', true);
  const native = p.abilities!.a3,
    comp = decompose(native);
  const plain = {
    ...comp,
    effects: comp.effects.map((e) =>
      e.kind === 'paladinAura' ? { ...e, aura: { ...e.aura, unyielding: false } } : e,
    ),
  };
  expect(componentValue(comp) - componentValue(plain)).toBeCloseTo(32);
  const roundtrip = recompose(comp, { slot: 'a3', name: 'Faith', cooldown: 16 });
  expect(describeAbility(roundtrip)).toContain('healing pays it first');
  let forged;
  for (let seed = 0; seed < 128 && !forged; seed++) {
    const def = synthesizeAbility(
      seed,
      'Faith',
      'a3',
      ['a', 'b', 'c'].map((name) => ({
        name,
        classId: 'paladin' as const,
        className: 'Paladin',
        slot: 'a3',
        def: native,
      })),
      new Set(['selfBuff']),
    ).def;
    if (def.paladinAura?.unyielding) forged = def;
  }
  expect(forged).toBeDefined();
  p.abilities!.a3 = forged!;
  resolvePlayerAbility(w, p, 'a3', { x: 0, y: 0 });
  damagePlayer(w, ally, 40);
  expect(ally.faithWound?.amount).toBeCloseTo(17);
});

it('overlapping Bulwarks preserve the second charge while the recipient owes damage', () => {
  const { w, p, ally } = setup('pa_devotion_aura', true);
  const native = p.abilities!.a3;
  ally.abilities!.a3 = native;
  resolvePlayerAbility(w, p, 'a3', { x: 0, y: 0 });
  resolvePlayerAbility(w, ally, 'a3', { x: 0, y: 0 });
  ally.buffs = ally.buffs.filter((b) => b.kind !== 'invuln');
  damagePlayer(w, ally, 40);
  expect(p.paladinAura?.faithReady).toBe(false);
  expect(ally.paladinAura?.faithReady).toBe(true);
  const wound = ally.faithWound;
  damagePlayer(w, ally, 20);
  expect(ally.faithWound).toBe(wound);
  expect(ally.paladinAura?.faithReady).toBe(true);
  healPlayer(w, ally, ally, 50);
  damagePlayer(w, ally, 20);
  expect(ally.paladinAura?.faithReady).toBe(false);
});

it('Consecration repays a pending wound before restoring health', () => {
  const { w, p, step, wait } = setup();
  step('a3');
  wait(1.3);
  damagePlayer(w, p, 60);
  const before = p.faithWound!.amount;
  const hp = p.hp;
  resolvePlayerAbility(w, p, 'a1', { x: 0, y: 0 });
  wait(0.51);
  expect(p.faithWound!.amount).toBeLessThan(before);
  expect(p.hp).toBe(hp);
});

it('a non-combat scene clears a pending wound without applying it', () => {
  const { w, p, step, wait } = setup();
  step('a3');
  wait(1.3);
  damagePlayer(w, p, 60);
  const hp = p.hp;
  w.scene = 'reward';
  step();
  expect(p.faithWound).toBeUndefined();
  expect(p.hp).toBe(hp);
});
