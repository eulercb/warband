import { describe, expect, it, vi } from 'vitest';
import { heroPowerRatio } from '../src/engine/content/balance';
import { buffBadges } from '../src/render/overlays/buffGlyphs';
import { World } from '../src/engine/world/world';
import { getSubSkill } from '../src/engine/content/subclasses';
import { getClass } from '../src/engine/content/classes';
import {
  decompose,
  recompose,
  refreshComponents,
  componentValue,
  describeComposed,
  synthesizeAbility,
} from '../src/engine/content/forge';
import { resolvePlayerAbility } from '../src/engine/combat/abilities';
import { damageBoss } from '../src/engine/combat/combat';
import {
  armMartialUtility,
  onParryHit,
  tickBloodPrice,
  bloodHitHealing,
  onHuntWalk,
  onMartialHit,
  prepareMartialFlow,
  consumeMartialFinishers,
} from '../src/engine/combat/martial';
const skill = (id: string) => ({ ...getSubSkill(id)!.ability, slot: 'sub1' as const });
function fixture() {
  const w = new World({
    monsterId: 'dragon',
    seed: 5,
    players: [{ peerId: 'a', name: 'A', classId: 'monk' }],
  });
  const p = w.players[0];
  p.pos = { x: 600, y: 400 };
  p.aim = { x: 1, y: 0 };
  p.critChance = 0;
  w.boss!.pos = { x: 640, y: 400 };
  w.boss!.hp = w.boss!.maxHp = 10000;
  return { w, p };
}
describe('subclass martial identities', () => {
  it('Riposte readies one counter after connecting, never after a miss', () => {
    const { w, p } = fixture();
    const ab = skill('kn_champion_riposte');
    p.subAbilities = { sub1: { ...ab, slot: 'sub1' } };
    resolvePlayerAbility(w, p, 'sub1', { x: 0, y: 0 });
    expect(p.buffs.find((b) => b.kind === 'counter')?.mult).toBe(1.3);
    expect(p.buffs.find((b) => b.source === 'parryDef')?.remaining).toBe(0.75);
    p.buffs = [];
    w.boss!.pos.x = 1000;
    resolvePlayerAbility(w, p, 'sub1', { x: 0, y: 0 });
    expect(p.buffs).toEqual([]);
    onParryHit(p, ab, 0);
    onParryHit(p, { ...ab, parryOnHit: undefined }, 10);
    p.state = 'downed';
    onParryHit(p, ab, 10);
    expect(p.buffs).toEqual([]);
    p.state = 'alive';
    p.hp = 0;
    onParryHit(p, ab, 10);
    expect(p.buffs).toEqual([]);
  });
  it('blood price uses only active time and cannot down the player', () => {
    const { p } = fixture();
    p.hp = p.maxHp;
    tickBloodPrice(p, 1);
    expect(p.hp).toBe(p.maxHp);
    armMartialUtility(p, skill('bb_berserker_frenzy'));
    tickBloodPrice(p, 1);
    expect(p.hp).toBeCloseTo(p.maxHp * 0.98);
    const blood = p.buffs.find((b) => b.kind === 'bloodRage')!;
    blood.remaining = 0.1;
    tickBloodPrice(p, 1);
    expect(p.hp).toBeCloseTo(p.maxHp * 0.978);
    p.hp = 1;
    tickBloodPrice(p, 100);
    expect(p.hp).toBe(1);
    p.hp = 0.5;
    tickBloodPrice(p, 1);
    expect(p.hp).toBe(0.5);
    p.hp = 1;
    p.state = 'downed';
    tickBloodPrice(p, 1);
    expect(p.hp).toBe(1);
    p.state = 'alive';
    p.hp = 0;
    tickBloodPrice(p, 1);
    expect(p.hp).toBe(0);
    p.hp = 20;
    tickBloodPrice(p, 0);
    expect(p.hp).toBe(20);
    blood.remaining = 0;
    tickBloodPrice(p, 1);
    expect(p.hp).toBe(20);
  });
  it('leeches effective direct damage, excluding overkill, zones and invalid sources', () => {
    const { w, p } = fixture();
    p.hp = 10;
    armMartialUtility(p, skill('bb_berserker_frenzy'));
    w.boss!.hp = 5;
    damageBoss(w, p, w.boss!, 100, { direct: true });
    expect(p.hp).toBe(11);
    expect(bloodHitHealing(p, 20, false)).toBe(0);
    expect(bloodHitHealing(p, 0, true)).toBe(0);
    p.state = 'downed';
    expect(bloodHitHealing(p, 20, true)).toBe(0);
    p.state = 'alive';
    p.hp = 0;
    expect(bloodHitHealing(p, 20, true)).toBe(0);
    p.hp = 10;
    p.buffs = [];
    expect(bloodHitHealing(p, 20, true)).toBe(0);
  });
  it('Wolf builds bounded momentum by walking rather than hitting and replaces blood rage', () => {
    const { p } = fixture();
    armMartialUtility(p, skill('bb_berserker_frenzy'));
    armMartialUtility(p, skill('bb_totem_wolf'));
    expect(p.buffs.some((b) => b.kind === 'bloodRage')).toBe(false);
    onMartialHit(p, 10, true);
    expect(p.buffs.some((b) => b.kind === 'momentum')).toBe(false);
    onHuntWalk(p, 60);
    onHuntWalk(p, 59);
    expect(p.huntDistance).toBe(119);
    onHuntWalk(p, 1);
    expect(p.buffs.find((b) => b.kind === 'momentum')?.mult).toBe(1);
    onHuntWalk(p, 10000);
    expect(p.huntDistance).toBe(120);
    p.buffs = p.buffs.filter((b) => b.kind !== 'momentumBeat');
    onHuntWalk(p, 1);
    expect(p.buffs.find((b) => b.kind === 'momentum')?.mult).toBe(2);
    p.buffs = p.buffs.filter((b) => b.kind !== 'momentumBeat');
    onHuntWalk(p, 120);
    p.buffs = p.buffs.filter((b) => b.kind !== 'momentumBeat');
    onHuntWalk(p, 120);
    expect(p.buffs.find((b) => b.kind === 'momentum')?.mult).toBe(3);
    onHuntWalk(p, 0);
    p.state = 'downed';
    onHuntWalk(p, 120);
    p.state = 'alive';
    p.buffs = [];
    onHuntWalk(p, 120);
    armMartialUtility(p, { ...skill('bb_berserker_frenzy'), momentumWindow: undefined });
    expect(p.buffs.map((b) => b.kind)).toEqual(['bloodRage']);
  });
  it('basic hits can extend an existing Flow by only one second total', () => {
    const { p } = fixture();
    const prep = { ...getClass('monk').abilities.a1, prepareFlow: 3 };
    onMartialHit(p, 10, true, 0.25);
    expect(p.buffs).toEqual([]);
    prepareMartialFlow(p, prep);
    const flow = p.buffs[0];
    onMartialHit(p, 0, true, 0.25);
    expect(flow.remaining).toBe(3);
    p.state = 'downed';
    onMartialHit(p, 10, true, 0.25);
    expect(flow.remaining).toBe(3);
    p.state = 'alive';
    for (let i = 0; i < 8; i++) onMartialHit(p, 10, true, 0.25);
    expect(flow.remaining).toBe(4);
    expect(flow.flowExtended).toBe(1);
    prepareMartialFlow(p, prep);
    expect(p.buffs[0].flowExtended).toBe(0);
  });
  it.each(['mo_shadow_dart', 'mo_shadow_cloud'])(
    '%s spends Flow with distinct control and survives Forge round trips',
    (id) => {
      const { p } = fixture();
      const original = skill(id);
      const before = structuredClone(original);
      for (const ab of [original, recompose(decompose(original), original)]) {
        prepareMartialFlow(p, { ...original, prepareFlow: 3 });
        const out = consumeMartialFinishers(p, ab);
        expect(out.castTime).toBe(0);
        expect(p.buffs.some((b) => b.kind === 'flow')).toBe(false);
        expect(out.damage).toBe(ab.damage);
        if (id === 'mo_shadow_dart') expect(out.freeze).toBeGreaterThanOrEqual(0.6);
        else {
          expect(out.radius).toBe((ab.radius ?? 130) + 35);
          expect(out.slowMult).toBe(0.6);
        }
        expect(original).toEqual(before);
      }
    },
  );
  it('Flow preserves stronger control and default zone reach without mutating components', () => {
    const { p } = fixture();
    const cloud = skill('mo_shadow_cloud');
    prepareMartialFlow(p, { ...cloud, prepareFlow: 3 });
    const out = consumeMartialFinishers(p, {
      ...cloud,
      radius: undefined,
      slowMult: 0.3,
      slowDuration: 2,
    });
    expect(out.radius).toBe(165);
    expect(out.slowMult).toBe(0.3);
    expect(out.slowDuration).toBe(2);
    prepareMartialFlow(p, { ...cloud, prepareFlow: 3 });
    expect(consumeMartialFinishers(p, { ...skill('mo_shadow_dart'), freeze: 2 }).freeze).toBe(2);
  });
});

describe('martial integration boundaries', () => {
  it('credits resolved ordinary walking but not blocked movement or blink displacement', () => {
    const { w, p } = fixture();
    w.terrain = [];
    w.obstacles = [];
    w.boss!.pos = { x: 1000, y: 700 };
    const cmd = {
      seq: 0,
      move: { x: 1, y: 0 },
      aim: { x: 1, y: 0 },
      buttons: { basic: false, a1: false, a2: false, a3: false, revive: false },
    };
    const inputs = new Map([['a', cmd]]);
    armMartialUtility(p, skill('bb_totem_wolf'));
    w.step(0.05, inputs);
    expect(p.huntDistance).toBeGreaterThan(0);
    p.huntDistance = 0;
    const start = { ...p.pos };
    const clamp = vi
      .spyOn(w as unknown as { separateAndClamp: () => void }, 'separateAndClamp')
      .mockImplementation(() => {
        p.pos = { ...start };
      });
    w.step(0.05, inputs);
    expect(p.huntDistance).toBe(0);
    clamp.mockImplementation(() => {
      p.pos = { x: start.x + 200, y: start.y };
    });
    w.step(0.05, inputs);
    expect(p.huntDistance).toBe(0);
    clamp.mockImplementation(() => {
      w.events.push({ t: 'blink', id: p.id, from: { ...p.pos }, to: { ...p.pos } });
    });
    w.step(0.05, inputs);
    expect(p.huntDistance).toBe(0);
    clamp.mockRestore();
    w.step(0.05, new Map([['a', { ...cmd, move: { x: 0, y: 0 } }]]));
    expect(p.huntDistance).toBe(0);
  });
  it.each(['kn_champion_riposte', 'bb_berserker_frenzy', 'bb_totem_wolf'])(
    'preserves and prices %s through component refresh and synthesis',
    (id) => {
      const original = skill(id);
      const comp = decompose(original);
      expect(componentValue(comp)).toBeGreaterThan(0);
      expect(describeComposed(comp, original.cooldown).length).toBeGreaterThan(10);
      const rebuilt = recompose(comp, original);
      const keys = ['parryOnHit', 'bloodRage', 'wolfHunt'] as const;
      for (const key of keys) expect(rebuilt[key]).toBe(original[key]);
      for (const key of keys) rebuilt[key] = undefined;
      const refreshed = recompose(refreshComponents(rebuilt), original);
      for (const key of keys) expect(refreshed[key]).toBe(original[key]);
      for (let seed = 1; seed <= 40; seed++) {
        const fused = synthesizeAbility(seed, 'martial', 'a1', [
          {
            name: original.name,
            classId: 'barbarian',
            className: 'Barbarian',
            slot: 'a1',
            def: original,
          },
        ]);
        expect(componentValue(decompose(fused.def))).toBeGreaterThanOrEqual(0);
      }
    },
  );
});

it('values blood sustain conservatively and explains both rage modes in HUD badges', () => {
  const { p } = fixture();
  const ab = skill('bb_berserker_frenzy');
  p.subAbilities = { sub1: { ...ab, bloodRage: undefined } };
  const plain = heroPowerRatio(p);
  p.subAbilities = { sub1: ab };
  expect(heroPowerRatio(p)).toBeGreaterThan(plain);
  armMartialUtility(p, ab);
  expect(
    buffBadges(p.buffs)
      .map((b) => b.label)
      .join(' '),
  ).toContain('cost cannot kill you');
  armMartialUtility(p, skill('bb_totem_wolf'));
  expect(
    buffBadges(p.buffs)
      .map((b) => b.label)
      .join(' '),
  ).toContain('walk 120u');
});

it('initializes missing preparation bookkeeping and preserves updated Forge durations', () => {
  const { p } = fixture();
  p.buffs.push({ kind: 'flow', mult: 0, remaining: 2, source: 'martialFlow' });
  onMartialHit(p, 10, true, 0.25);
  expect(p.buffs[0]).toMatchObject({ remaining: 2.25, flowExtended: 0.25 });
  armMartialUtility(p, skill('bb_totem_wolf'));
  p.huntDistance = undefined;
  onHuntWalk(p, 60);
  expect(p.huntDistance).toBe(60);
  for (const [source, key, value] of [
    [skill('kn_champion_riposte'), 'parryOnHit', 1],
    [skill('bb_berserker_frenzy'), 'bloodRage', 7],
    [skill('bb_totem_wolf'), 'wolfHunt', 6],
    [getClass('monk').abilities.basic, 'flowExtendOnHit', 0.4],
  ] as const) {
    const fused = recompose(decompose(source), source);
    fused[key] = value;
    expect(recompose(refreshComponents(fused), source)[key]).toBe(value);
    fused[key] = undefined;
    expect(recompose(refreshComponents(fused), source)[key]).toBe(source[key]);
  }
});
