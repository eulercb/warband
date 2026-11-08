import { afterEach, describe, expect, it } from 'vitest';
import { World } from '../src/engine/world/world';
import { resolvePlayerAbility, stepPlayerGlide } from '../src/engine/combat/abilities';
import { consumeMartialFinishers } from '../src/engine/combat/martial';
import { applyBuff, makeBuff } from '../src/engine/combat/combat';
import { boundedAbility } from '../src/engine/content/abilityLimits';
import { flowConeEffects, flowPayoff } from '../src/engine/content/martialRules';
import { CLASSES, describeAbility } from '../src/engine/content/classes';
import { decompose, recompose, synthesizeAbility, setForgeSeed } from '../src/engine/content/forge';
const right = { x: 1, y: 0 },
  zero = { x: 0, y: 0 };
afterEach(() => setForgeSeed(null));
function setup(ids: string[] = [], composed = false) {
  const w = new World({
    seed: 31,
    monsterId: 'dragon',
    players: [
      {
        peerId: 'a',
        name: 'Wave',
        classId: 'monk',
        charUpgrades: ids,
        subSkills: ['mo_openhand_wave'],
      },
    ],
  });
  w.scene = null;
  w.obstacles = [];
  w.terrain = [];
  const p = w.players[0],
    b = w.boss!;
  p.pos = { x: 500, y: 400 };
  p.aim = right;
  p.critChance = 0;
  p.buffs = [];
  b.pos = { x: 725, y: 400 };
  b.hp = b.maxHp = 10000;
  b.moveSpeed = 0;
  b.decisionTimer = 1000;
  if (composed) {
    const ab = p.subAbilities!.sub1!;
    p.subAbilities!.sub1 = recompose(decompose(ab), ab);
    p.subclassPassiveId = undefined;
  }
  return { w, p, b };
}
function prepare(p: ReturnType<typeof setup>['p']) {
  applyBuff(p, makeBuff('flow', 0, 4, 'test'));
}
function displacement(b: ReturnType<typeof setup>['b']) {
  return (b.shove?.vx ?? 0) * (b.shove?.remaining ?? 0);
}
describe('Wave Palm Flow payoff', () => {
  it.each([false, true])(
    'adds actual push/pull to native, Honed and grand casts, composed=%s',
    (composed) => {
      for (const [ids, force, pull] of [
        [[], 140, false],
        [Array.from({ length: 5 }, () => 'subup_mo_openhand_wave'), 190, false],
        [['mo_openhand_wave_g'], 180, true],
        [
          [...Array.from({ length: 5 }, () => 'subup_mo_openhand_wave'), 'mo_openhand_wave_g'],
          230,
          true,
        ],
      ] as [string[], number, boolean][]) {
        const { w, p, b } = setup(ids, composed);
        prepare(p);
        const ab = p.subAbilities!.sub1!,
          before = structuredClone(ab);
        expect(describeAbility(ab)).toContain(`+40u ${pull ? 'pull' : 'push'}`);
        expect(describeAbility(ab)).not.toContain('cone reach');
        resolvePlayerAbility(w, p, 'sub1', zero);
        expect(displacement(b)).toBeCloseTo(pull ? -Math.min(force, 225) : force);
        expect(b.hp).toBeLessThan(b.maxHp);
        expect(p.buffs.some((b) => b.kind === 'flow')).toBe(false);
        expect(ab).toEqual(before);
      }
    },
  );
  it('does not strengthen an unprepared cast, change damage or widen its cone', () => {
    const { w, p, b } = setup();
    const ab = p.subAbilities!.sub1!;
    resolvePlayerAbility(w, p, 'sub1', zero);
    expect(displacement(b)).toBeCloseTo(100);
    prepare(p);
    const out = boundedAbility(consumeMartialFinishers(p, ab));
    expect(out.range).toBe(200);
    expect(out.halfAngleDeg).toBe(ab.halfAngleDeg);
    expect(out.damage).toBe(ab.damage);
    b.pos = { x: 640, y: 600 };
    b.shove = null;
    const hp = b.hp;
    resolvePlayerAbility(w, p, 'sub1', zero);
    expect(b.hp).toBe(hp);
    expect(b.shove).toBeNull();
  });
  it.each([false, true])(
    'preserves root thresholds and normal movement immunity, pull=%s',
    (pull) => {
      for (const honed of [false, true]) {
        const ids = [
          ...(pull ? ['mo_openhand_wave_g'] : []),
          ...(honed ? ['subup_mo_openhand_wave'] : []),
        ];
        const { w, p, b } = setup(ids);
        prepare(p);
        applyBuff(b, makeBuff('root', 0, 4, 'root'));
        resolvePlayerAbility(w, p, 'sub1', zero);
        const overcomes = pull || honed;
        expect(b.buffs.some((b) => b.kind === 'root')).toBe(!overcomes);
        expect(!!b.shove).toBe(overcomes);
      }
      const { w, p, b } = setup(pull ? ['mo_openhand_wave_g'] : []);
      prepare(p);
      applyBuff(b, makeBuff('steadfast', 1, 4, 'steadfast'));
      resolvePlayerAbility(w, p, 'sub1', zero);
      expect(b.shove).toBeFalsy();
    },
  );
  it('keeps accepted travelling contact, Flowguard and once-per-foe behavior', () => {
    const { w, p, b } = setup(['mo_openhand_g_b']);
    prepare(p);
    resolvePlayerAbility(w, p, 'sub1', right);
    expect(p.glide?.palmSweep).toBeDefined();
    expect(p.glide?.ab.knockback).toBe(140);
    expect(p.buffs.filter((b) => b.kind === 'frontGuard')).toHaveLength(1);
    const hp = b.hp,
      force = displacement(b);
    stepPlayerGlide(w, p, 1);
    expect(p.pos.x).toBe(680);
    expect(b.hp).toBe(hp);
    expect(displacement(b)).toBe(force);
  });
  it('uses the fallback only at zero remaining reach, preserves stronger forces and push precedence', () => {
    expect(flowConeEffects({ range: 190, knockback: 100 })).toEqual({ range: 220 });
    expect(flowConeEffects({ range: 200, knockback: 250 })).toEqual({ range: 230, knockback: 260 });
    expect(flowConeEffects({ range: 200, pull: 250 })).toEqual({ range: 230, pull: 260 });
    expect(flowConeEffects({ range: 200, pull: 300 }).pull).toBe(300);
    expect(flowConeEffects({ range: 200, knockback: 300 }).knockback).toBe(300);
    expect(flowPayoff('meleeCone', 0, { range: 200, pull: 250 })).toBe('spend Flow for +10u pull');
    expect(flowPayoff('meleeCone', 0, { range: 200, pull: 260 })).toBe('consumes Flow');
    expect(flowPayoff('meleeCone', 0, { range: 200, knockback: 260, pull: 100 })).toBe(
      'consumes Flow',
    );
    expect(flowPayoff('meleeCone', 0, { range: 200 })).toBe('consumes Flow');
  });
  it('dropping the retained shove removes its prepared force and description', () => {
    const { p } = setup();
    const ab = p.subAbilities!.sub1!;
    const comp = decompose(ab);
    comp.effects = comp.effects.filter((e) => e.kind !== 'shove');
    const copy = recompose(comp, ab);
    prepare(p);
    expect(consumeMartialFinishers(p, copy).knockback).toBeUndefined();
    expect(describeAbility(copy)).not.toMatch(/u push|u pull/);
  });
  it('actual synthesis computes its Flow readout from retained delivery and shove', () => {
    const { p } = setup();
    const ab = p.subAbilities!.sub1!;
    let seen = 0;
    for (let seed = 0; seed < 40; seed++) {
      const syn = synthesizeAbility(seed, 'Wave flow', 'a3', [
        {
          classId: 'monk',
          className: 'Monk',
          name: ab.name,
          slot: 'a3',
          def: ab,
        },
        {
          classId: 'monk',
          className: 'Monk',
          name: CLASSES.monk.abilities.a1.name,
          slot: 'a1',
          def: CLASSES.monk.abilities.a1,
        },
        {
          classId: 'monk',
          className: 'Monk',
          name: CLASSES.monk.abilities.a3.name,
          slot: 'a3',
          def: CLASSES.monk.abilities.a3,
        },
      ]).def;
      if (syn.kind !== 'meleeCone' || !syn.consumesFlow) continue;
      seen++;
      prepare(p);
      const out = boundedAbility(consumeMartialFinishers(p, syn));
      const before = boundedAbility(syn);
      const delta = (out.knockback ?? 0) - (before.knockback ?? 0);
      if (delta > 0) expect(describeAbility(syn)).toContain(`+${Math.round(delta)}u push`);
      else expect(describeAbility(syn)).not.toContain('u push');
    }
    expect(seen).toBeGreaterThan(0);
  });
});

it('every authored Flow spender retains an attack payoff through Honed and its individual grand', async () => {
  const { ALL_SUBCLASSES } = await import('../src/engine/content/subclasses');
  const { previewSubAbility } = await import('../src/engine/content/charUpgrades');
  const { p } = setup();
  const defs = Object.values(CLASSES.monk.abilities).filter((a) => a.consumesFlow);
  for (const sub of ALL_SUBCLASSES)
    for (const skill of sub.skills)
      if (skill.ability.consumesFlow) {
        for (const ids of [
          [],
          Array.from({ length: 5 }, () => `subup_${skill.id}`),
          [`${skill.id}_g`],
          [...Array.from({ length: 5 }, () => `subup_${skill.id}`), `${skill.id}_g`],
        ])
          defs.push(previewSubAbility(skill.id, ids)!);
      }
  const payload = (a: (typeof defs)[number]) => [
    a.castTime ?? 0,
    a.range ?? 0,
    a.radius ?? 0,
    a.freeze ?? 0,
    a.slowMult ?? 1,
    a.slowDuration ?? 0,
    a.knockback ?? 0,
    a.pull ?? 0,
  ];
  expect(defs.length).toBeGreaterThan(20);
  for (const ab of defs) {
    prepare(p);
    const out = boundedAbility(consumeMartialFinishers(p, ab));
    expect(payload(out), ab.name).not.toEqual(payload(boundedAbility(ab)));
  }
});
