import { afterEach, describe, expect, it } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import { World } from '../src/engine/world/world';
import {
  arrivalField,
  blinkArrival,
  dispelArrivalField,
  wardingViews,
  wardingTarget,
  wardingSlots,
} from '../src/engine/combat/warding';
import { refundRecharge } from '../src/engine/content/abilityLimits';
import { makeBuff } from '../src/engine/combat/combat';
import {
  decompose,
  recompose,
  refreshComponents,
  componentValue,
  synthesizeAbility,
  setForgeSeed,
  forgeVariant,
} from '../src/engine/content/forge';
import { CLASSES, describeAbility } from '../src/engine/content/classes';
import { applyCharUpgrades, getCharUpgrade } from '../src/engine/content/charUpgrades';
import { Fx } from '../src/render/overlays/fx';
import { Camera } from '../src/render/pipeline/camera';
import { drawDispelTarget } from '../src/render/pipeline/wardingVisuals';
import type { GroundZone, InputCommand } from '../src/engine/core/types';
const picks = ['mg_abjurer_ward', 'mg_abjurer_bind', 'mg_abjurer_teleport', 'mg_abjurer_mend'];
afterEach(() => setForgeSeed(null));
function setup(skill = picks[0], mods = ['mg_abjurer_g_a']) {
  const w = new World({
    seed: 31,
    monsterId: 'lich',
    players: [
      {
        peerId: 'a',
        name: 'Ward',
        classId: 'mage',
        subSkills: [skill],
        charUpgrades: mods,
        extraClasses: ['rogue'],
      },
      { peerId: 'b', name: 'Ally', classId: 'knight' },
    ],
  });
  w.scene = null;
  w.obstacles = [];
  w.terrain = [];
  const p = w.players[0],
    ally = w.players[1],
    boss = w.boss!;
  p.pos = { x: 500, y: 400 };
  p.aim = { x: 1, y: 0 };
  ally.pos = { x: 850, y: 400 };
  boss.pos = { x: 1200, y: 700 };
  boss.decisionTimer = 1000;
  boss.moveSpeed = 0;
  return { w, p, ally, boss };
}
function step(w: World, cast = false) {
  const buttons: InputCommand['buttons'] = {
    basic: false,
    a1: false,
    a2: false,
    a3: cast,
    revive: false,
  };
  w.step(
    0.01,
    new Map([
      ['a', { seq: w.tick, move: { x: 0, y: 0 }, aim: { x: 1, y: 0 }, buttons, autofire: false }],
    ]),
  );
}
function field(w: World, data: Partial<GroundZone> = {}) {
  const z: GroundZone = {
    id: w.allocId(),
    kind: 'voidZone',
    side: 'boss',
    ownerId: w.boss!.id,
    pos: { x: 850, y: 400 },
    radius: 170,
    damagePerTick: 10,
    healPerTick: 0,
    slowMult: 1,
    slowDuration: 1,
    duration: 10,
    remaining: 10,
    tickAccum: 0,
    ...data,
  };
  w.groundZones.push(z);
  return z;
}
describe('Grand Warding arrival dispel', () => {
  it.each(picks)('reclaims shared ground at full health with first pick %s', (skill) => {
    const { w, p, ally } = setup(skill);
    const landing = blinkArrival(w, p, p.abilities!.a3);
    const z = field(w, { pos: landing, tickAccum: 0.499 });
    const keep = field(w, { pos: { x: landing.x + 109, y: landing.y } });
    const before = { hp: p.hp, ally: ally.hp, duration: keep.remaining };
    expect(wardingViews(w, p).map((v) => v.id)).toEqual([z.id]);
    expect(w.serialize().players[0].dispelFields?.[0].id).toBe(z.id);
    step(w, true);
    expect(p.pos).toEqual(landing);
    expect(w.groundZones.map((v) => v.id)).toEqual([keep.id]);
    expect(keep.remaining).toBeCloseTo(before.duration - 0.01);
    expect(w.events.filter((e) => e.t === 'fieldDispel')).toEqual([
      { t: 'fieldDispel', pos: z.pos, radius: z.radius },
    ]);
    expect(p.hp).toBe(before.hp);
    expect(ally.hp).toBe(before.ally);
    expect(p.cooldowns.a3).toBeGreaterThan(0);
    expect(p.buffs.some((b) => b.kind === 'frontGuard')).toBe(true);
    expect(wardingViews(w, p)).toEqual([]);
  });
  it.each([
    { side: 'player' as const },
    { remaining: 0 },
    { armRemaining: 0.1 },
    { damagePerTick: 0 },
    { pos: { x: 961, y: 400 }, radius: 20 },
  ])('does not erase excluded fields %s', (data) => {
    const { w, p } = setup();
    const z = field(w, data);
    expect(arrivalField(w, { x: 850, y: 400 })).toBeUndefined();
    p.pos = { x: 850, y: 400 };
    dispelArrivalField(w, p, p.abilities!.a3, { x: 500, y: 400 });
    expect(w.groundZones).toContain(z);
    expect(w.events).toEqual([]);
  });
  it.each([
    { slowMult: 0.5 },
    { silence: 1 },
    { kind: 'rainOfArrows' as const, airborne: false, slowMult: 0.5 },
  ])('removes non-damaging harmful ground %s', (data) => {
    const { w, p } = setup();
    const z = field(w, { damagePerTick: 0, ...data });
    p.pos = { ...z.pos };
    dispelArrivalField(w, p, p.abilities!.a3, { x: 500, y: 400 });
    expect(w.groundZones).toEqual([]);
  });
  it('uses torus center distance, inclusive reach and deterministic IDs', () => {
    const { w, p } = setup();
    p.pos = { x: w.arena.w - p.abilities!.a3.range!, y: 400 };
    const endpoint = blinkArrival(w, p, p.abilities!.a3);
    expect(endpoint.x).toBe(0);
    const far = field(w, { pos: { x: w.arena.w - 110, y: 400 }, id: 100, radius: 10 });
    const low = field(w, { pos: { x: 110, y: 400 }, id: 99, radius: 10 });
    expect(arrivalField(w, endpoint)).toBe(low);
    step(w, true);
    expect(w.groundZones).toEqual([far]);
  });
  it.each(['root', 'stun'] as const)(
    'normal %s restriction prevents the paid cast and preview',
    (kind) => {
      const { w, p } = setup();
      const z = field(w);
      p.buffs.push(makeBuff(kind, 0, 2, 'test'));
      expect(wardingViews(w, p)).toEqual([]);
      step(w, true);
      expect(w.groundZones).toContain(z);
      expect(p.pos.x).toBe(500);
      expect(p.cooldowns.a3).toBe(0);
    },
  );
  it('removal does not cleanse allies or cancel a pending hostile field', () => {
    const { w, p, ally, boss } = setup();
    const active = field(w),
      pending = field(w, { armRemaining: 1 });
    ally.buffs.push(makeBuff('moveSpeed', 0.5, 2, 'zoneSlow'));
    const clock = boss.decisionTimer;
    step(w, true);
    expect(w.groundZones).not.toContain(active);
    expect(w.groundZones).toContain(pending);
    expect(pending.armRemaining).toBeCloseTo(0.99);
    expect(boss.decisionTimer).toBeCloseTo(clock - 0.01);
    expect(ally.buffs.find((b) => b.source === 'zoneSlow')?.remaining).toBeCloseTo(1.99);
    field(w, { pos: { ...p.pos } });
    step(w);
    expect(w.groundZones).toHaveLength(2); // no continuing exclusion
  });
  it('leaves a boss committed to its current wind-up', () => {
    const { w, p, boss } = setup();
    field(w);
    const ability = w.defOf(boss).abilities[0];
    boss.action = {
      ...boss.action,
      kind: 'windup',
      abilityId: ability.id,
      remaining: 2,
      total: 2,
      targetId: p.id,
      targetPos: { ...p.pos },
    };
    step(w, true);
    expect(w.groundZones).toEqual([]);
    expect(boss.action.kind).toBe('windup');
    expect(boss.action.abilityId).toBe(ability.id);
    expect(boss.action.remaining).toBeCloseTo(1.99);
  });
  it('two owners select remaining world state and cannot dispel one field twice', () => {
    const { w, p, ally } = setup();
    field(w);
    field(w, { pos: { x: 860, y: 400 } });
    p.pos = { x: 850, y: 400 };
    dispelArrivalField(w, p, p.abilities!.a3, { x: 500, y: 400 });
    dispelArrivalField(w, ally, p.abilities!.a3, { x: 500, y: 400 });
    dispelArrivalField(w, ally, p.abilities!.a3, { x: 500, y: 400 });
    expect(w.groundZones).toEqual([]);
    expect(w.events).toHaveLength(2);
  });
  it('keeps no-field guard and does not grant dispel to Dominion', () => {
    const { w, p } = setup();
    step(w, true);
    expect(p.buffs.some((b) => b.kind === 'frontGuard')).toBe(true);
    expect(w.events.some((e) => e.t === 'fieldDispel')).toBe(false);
    const other = setup(picks[0], ['mg_abjurer_g_b']);
    field(other.w);
    step(other.w, true);
    expect(other.w.groundZones).toHaveLength(1);
  });
  it('native Honed/grand combinations retain exactly one removal and leave Door separate', () => {
    const { w, p } = setup(picks[2], [
      'mg_abjurer_g_a',
      ...Array<string>(5).fill('subup_mg_abjurer_teleport'),
      'mg_abjurer_teleport_g',
      'mg_gk_a3_b',
    ]);
    const c = decompose(p.abilities!.a3);
    expect(c.effects.filter((e) => e.kind === 'dispelField')).toHaveLength(1);
    expect(p.subAbilities!.sub1!.dispelField).toBeUndefined();
    field(w, { pos: blinkArrival(w, p, p.abilities!.a3) });
    step(w, true);
    expect(w.groundZones).toEqual([]);
  });
});
describe('retained component and presentation', () => {
  it('preserves default and prepared Blink endpoints for native and composed copies', () => {
    const { w, p } = setup();
    const plain = { ...p.abilities!.a3, range: undefined };
    expect(blinkArrival(w, p, plain)).toEqual({ x: 750, y: 400 });
    const composed = recompose(
      { delivery: { kind: 'blink' }, effects: [{ kind: 'dispelField' }] },
      plain,
    );
    expect(blinkArrival(w, p, composed)).toEqual({ x: 720, y: 400 });
    composed.flowAim = { x: 0, y: -1 };
    expect(blinkArrival(w, p, composed)).toEqual({ x: 500, y: 180 });
  });
  it('removes previews during cast recovery and restores them when the same cast becomes available', () => {
    const { w, p } = setup();
    field(w);
    p.castTimer = 1;
    expect(wardingViews(w, p)).toEqual([]);
    p.castTimer = 0;
    expect(wardingViews(w, p)).toHaveLength(1);
    p.hp = 0;
    expect(wardingViews(w, p)).toEqual([]);
    p.hp = p.maxHp;
    expect(wardingViews(w, p)).toHaveLength(1);
  });

  it('prices, refreshes and casts a copied Blink without donor passive', () => {
    const { w, p } = setup();
    const native = p.abilities!.a3,
      comp = decompose(native);
    expect(
      componentValue(comp) -
        componentValue({ ...comp, effects: comp.effects.filter((e) => e.kind !== 'dispelField') }),
    ).toBe(56);
    w.setActiveClass(p, 'rogue');
    p.cooldowns.a3 = 0;
    p.abilities!.a3 = recompose(comp, { ...native, name: 'Copied Warding' });
    p.abilities!.a3.components = refreshComponents(p.abilities!.a3);
    expect(describeAbility(p.abilities!.a3)).toContain('110u');
    field(w, { pos: blinkArrival(w, p, p.abilities!.a3) });
    step(w, true);
    expect(w.groundZones).toEqual([]);
  });
  it('actual Forge identity offers match retained Blink and changed-delivery fallbacks', () => {
    for (let seed = 0; seed < 12; seed++) {
      setForgeSeed(seed);
      const { p } = setup(picks[0], []);
      const blink = p.abilities!.a3.kind === 'blink';
      const offer = getCharUpgrade('mg_abjurer_g_a')!;
      expect(offer.desc.includes('dispels one')).toBe(blink);
      applyCharUpgrades(p, ['mg_abjurer_g_a']);
      expect(!!p.abilities!.a3.dispelField).toBe(blink);
      expect(p.abilities!.a3.components!.effects.some((e) => e.kind === 'dispelField')).toBe(blink);
    }
    setForgeSeed(99);
    const cls = structuredClone(CLASSES.mage),
      source = cls.abilities.a3;
    cls.abilities.a3 = synthesizeAbility(
      31,
      'plain-blink',
      'a3',
      [{ name: source.name, classId: 'mage', className: 'Mage', slot: 'a3', def: source }],
      new Set(['blink']),
    ).def;
    forgeVariant('class', 'mage', () => cls);
    const { p } = setup(picks[0], []);
    expect(getCharUpgrade('mg_abjurer_g_a')!.desc).toContain('dispels one');
    applyCharUpgrades(p, ['mg_abjurer_g_a']);
    expect(p.abilities!.a3.components!.effects.some((e) => e.kind === 'dispelField')).toBe(true);
  });
  it('actual seeded synthesis retains a priced nonbasic Blink effect', () => {
    const { w, p } = setup();
    const source = p.abilities!.a3;
    const made = synthesizeAbility(
      31,
      'warding',
      'a3',
      [{ name: source.name, classId: 'mage', className: 'Mage', slot: 'a3', def: source }],
      new Set(['blink']),
    ).def;
    expect(made.components!.effects.some((e) => e.kind === 'dispelField')).toBe(true);
    expect(describeAbility(made)).toContain('dispel one');
    p.abilities!.a3 = made;
    field(w, { pos: blinkArrival(w, p, made) });
    step(w, true);
    expect(w.groundZones).toEqual([]);
  });
  it.each(['dash', 'projectile', 'selfBuff', 'blink'] as const)(
    'incompatible %s/basic copies cannot carry hidden dispel',
    (kind) => {
      const { w, p } = setup();
      const comp = decompose(p.abilities!.a3);
      comp.delivery.kind = kind;
      const copy = recompose(comp, {
        slot: kind === 'blink' ? 'basic' : 'a3',
        name: 'Copy',
        cooldown: 5,
      });
      expect(copy.dispelField).toBeUndefined();
      expect(describeAbility(copy)).not.toContain('dispel one');
      expect(copy.components!.effects.some((e) => e.kind === 'dispelField')).toBe(false);
      p.pos = { x: 850, y: 400 };
      field(w);
      dispelArrivalField(w, p, copy, { x: 500, y: 400 });
      expect(w.groundZones).toHaveLength(1);
    },
  );
  it('authoritative components reject stale flat payloads and previews deduplicate shared target', () => {
    const { w, p } = setup();
    field(w);
    const a = p.abilities!.a3;
    a.components = { delivery: { kind: 'blink', range: a.range }, effects: [] };
    expect(wardingViews(w, p)).toEqual([]);
    a.components.effects.push({ kind: 'dispelField' });
    a.components.delivery.kind = 'projectile';
    expect(wardingSlots(p)).toEqual([]);
    a.components.delivery.kind = 'blink';
    p.abilities!.a2 = { ...a, slot: 'a2' };
    expect(wardingViews(w, p)).toHaveLength(1);
    p.state = 'downed';
    expect(wardingViews(w, p)).toEqual([]);
  });
  it('shows the selected field boundary/center and a bounded collapsing success cue', () => {
    const g = new Graphics(),
      fx = new Fx(new Container()),
      camera = new Camera(1280, 800);
    drawDispelTarget(g, { x: 200, y: 200 }, 170, 1);
    expect(g.context.instructions.length).toBeGreaterThan(0);
    fx.processEvents([{ t: 'fieldDispel', pos: { x: 200, y: 200 }, radius: 170 }], camera);
    fx.draw(g, camera);
    expect(g.context.instructions.length).toBeGreaterThan(0);
    fx.update(1000);
    fx.draw(g, camera);
    expect(g.context.instructions.length).toBe(0);
  });
});

describe('Grand Warding escape and reclaim', () => {
  it.each([true, false])('removes airborne fields at departure or arrival (%s)', (departure) => {
    const { w, p } = setup();
    const z = field(w, {
      kind: 'rainOfArrows',
      pos: departure ? { ...p.pos } : blinkArrival(w, p, p.abilities!.a3),
    });
    expect(wardingViews(w, p)[0].id).toBe(z.id);
    step(w, true);
    expect(w.groundZones).toEqual([]);
  });
  it('prioritizes a departure silence field over a closer damaging field and arrival', () => {
    const { w, p } = setup();
    const damage = field(w, { pos: { ...p.pos }, radius: 30 });
    const silence = field(w, {
      pos: { x: p.pos.x + 100, y: p.pos.y },
      radius: 110,
      silence: 1,
      damagePerTick: 0,
    });
    const arrival = field(w, { pos: blinkArrival(w, p, p.abilities!.a3) });
    expect(wardingTarget(w, p, p.pos, arrival.pos)).toBe(silence);
    step(w, true);
    expect(w.groundZones).toEqual([damage, arrival]);
    expect(w.events.filter((e) => e.t === 'fieldDispel')).toHaveLength(1);
  });
  it('prioritizes threats reaching a flyer over ground silence beneath them', () => {
    const { w, p } = setup();
    p.buffs.push(makeBuff('flight', 0, 5, 'flight'));
    const ground = field(w, { pos: { ...p.pos }, silence: 1 });
    const air = field(w, { pos: { x: p.pos.x + 80, y: p.pos.y }, airborne: true });
    expect(wardingViews(w, p)[0].id).toBe(air.id);
    step(w, true);
    expect(w.groundZones).toEqual([ground]);
  });
  it('still reclaims a ground field beneath a flyer for allies, before remote arrival', () => {
    const { w, p } = setup();
    p.buffs.push(makeBuff('flight', 0, 5, 'flight'));
    const ground = field(w, { pos: { ...p.pos } });
    const remote = field(w);
    step(w, true);
    expect(w.groundZones).toEqual([remote]);
    expect(w.events.some((e) => e.t === 'fieldDispel' && e.pos.x === ground.pos.x)).toBe(true);
  });
  it('uses departure body overlap across the torus and stable nearest/ID ties', () => {
    const { w, p } = setup();
    p.pos = { x: 5, y: 400 };
    const a = field(w, { id: 90, pos: { x: w.arena.w - 20, y: 400 }, radius: 12 });
    field(w, { id: 91, pos: { x: 30, y: 400 }, radius: 12 });
    expect(wardingViews(w, p)[0].id).toBe(a.id);
    step(w, true);
    expect(w.groundZones.map((z) => z.id)).toEqual([91]);
  });
  it.each(picks)('breaks actual field silence with first pick %s, charging exactly 2s', (pick) => {
    const { w, p } = setup(pick);
    const control = setup(pick);
    const z = field(w, { pos: { ...p.pos }, silence: 1, damagePerTick: 0, tickAccum: 0.499 });
    step(w);
    expect(p.buffs.some((b) => b.kind === 'silence')).toBe(true);
    expect(wardingSlots(p)).toEqual(['a3']);
    expect(w.serialize().players[0].wardingSlots).toEqual(['a3']);
    expect(wardingViews(w, p)[0].id).toBe(z.id);
    step(w, true);
    step(control.w, true);
    expect(p.buffs.some((b) => b.kind === 'silence')).toBe(false);
    expect(w.groundZones).toEqual([]);
    expect(p.cooldowns.a3).toBeCloseTo(control.p.cooldowns.a3 + 2);
    expect(p.rechargeLocks!.mage!.a3).toBeCloseTo(control.p.rechargeLocks!.mage!.a3! + 2);
    expect(w.events.some((e) => e.t === 'silenceBreak')).toBe(true);
    p.buffs.push(makeBuff('silence', 0, 2, 'bossSilence'));
    step(w, true);
    expect(p.buffs.some((b) => b.kind === 'silence')).toBe(true); // cannot use exception through recharge
  });
  it.each([false, true])(
    'copied escape clears multiple silences and preserves other debuffs (composed %s)',
    (composed) => {
      const { w, p } = setup();
      const native = p.abilities!.a3;
      w.setActiveClass(p, 'rogue');
      p.cooldowns.a3 = 0;
      p.abilities!.a3 = composed ? recompose(decompose(native), native) : native;
      p.buffs.push(
        makeBuff('silence', 0, 2, 'bossSilence'),
        makeBuff('silence', 0, 3, 'zoneSilence'),
        makeBuff('moveSpeed', 0.6, 3, 'zoneSlow'),
      );
      step(w, true);
      expect(p.buffs.filter((b) => b.kind === 'silence')).toEqual([]);
      expect(p.buffs.some((b) => b.source === 'zoneSlow')).toBe(true);
      expect(w.events.filter((e) => e.t === 'silenceBreak')).toHaveLength(1);
      expect(p.cooldowns.a3).toBeGreaterThan(2);
    },
  );
  it('does not import silence escape on an ordinary Blink or other specials', () => {
    const { w, p } = setup(picks[0], []);
    p.buffs.push(makeBuff('silence', 0, 3, 'bossSilence'));
    expect(wardingSlots(p)).toEqual([]);
    step(w, true);
    expect(p.pos.x).toBe(500);
    expect(p.cooldowns.a3).toBe(0);
  });
  it('protects the conditional surcharge through refunds and active-class swaps', () => {
    const { w, p } = setup();
    p.cooldownMult = 0.1;
    p.buffs.push(makeBuff('silence', 0, 3, 'bossSilence'));
    step(w, true);
    const protectedCd = p.rechargeLocks!.mage!.a3!;
    refundRecharge(p, 'a3', 100);
    expect(p.cooldowns.a3).toBe(protectedCd);
    w.setActiveClass(p, 'rogue');
    w.setActiveClass(p, 'mage');
    expect(p.cooldowns.a3).toBe(protectedCd);
  });
  it('surviving silence fields reapply silence on the ordinary tick without immunity', () => {
    const { w, p } = setup();
    p.buffs.push(makeBuff('silence', 0, 1, 'bossSilence'));
    const departure = field(w, { pos: { ...p.pos }, silence: 1, damagePerTick: 0 });
    const arrival = field(w, {
      pos: blinkArrival(w, p, p.abilities!.a3),
      silence: 1,
      damagePerTick: 0,
      tickAccum: 0.499,
    });
    step(w, true);
    expect(w.groundZones).toEqual([arrival]);
    expect(w.groundZones).not.toContain(departure);
    expect(w.events.some((e) => e.t === 'silenceBreak')).toBe(true);
    expect(p.buffs.some((b) => b.kind === 'silence')).toBe(true);
  });
  it('failed composed Door placement cannot remove a field, clear silence or add recovery', () => {
    const { w, p } = setup();
    p.abilities!.a3 = recompose(decompose({ ...p.abilities!.a3, swap: true }), p.abilities!.a3);
    expect(wardingViews(w, p)).toEqual([]);
    w.obstacles = [
      { id: w.allocId(), pos: { x: 750, y: 400 }, radius: 2000, kind: 'rock', variant: 0 },
    ];
    field(w, { pos: { ...p.pos } });
    p.buffs.push(makeBuff('silence', 0, 2, 'bossSilence'));
    expect(wardingViews(w, p)).toHaveLength(1);
    const control = setup();
    control.p.abilities!.a3 = p.abilities!.a3;
    step(control.w, true);
    step(w, true);
    const blink = w.events.find((e) => e.t === 'blink' && e.id === p.id);
    expect(blink && blink.t === 'blink' && blink.from).toEqual(
      blink && blink.t === 'blink' && blink.to,
    );
    expect(w.groundZones).toHaveLength(1);
    expect(p.buffs.some((b) => b.kind === 'silence')).toBe(true);
    expect(p.cooldowns.a3).toBe(control.p.cooldowns.a3);
    expect(w.events.some((e) => e.t === 'silenceBreak' || e.t === 'fieldDispel')).toBe(false);
  });
  it('zero displacement gives no cleanse, surcharge or field removal', () => {
    const { w, p } = setup();
    field(w, { pos: { ...p.pos } });
    p.buffs.push(makeBuff('silence', 0, 2, 'bossSilence'));
    dispelArrivalField(w, p, p.abilities!.a3, { ...p.pos });
    expect(w.groundZones).toHaveLength(1);
    expect(p.cooldowns.a3).toBe(0);
    expect(p.buffs.some((b) => b.kind === 'silence')).toBe(true);
  });
  it('renders successful silence break feedback and releases it normally', () => {
    const g = new Graphics(),
      fx = new Fx(new Container()),
      camera = new Camera(1280, 800);
    fx.processEvents([{ t: 'silenceBreak', pos: { x: 200, y: 200 } }], camera);
    fx.draw(g, camera);
    expect(g.context.instructions.length).toBeGreaterThan(0);
    fx.update(1000);
    fx.draw(g, camera);
    expect(g.context.instructions.length).toBe(0);
  });
});
