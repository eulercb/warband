import { afterEach, describe, expect, it, vi } from 'vitest';
import { Graphics } from 'pixi.js';
import { World } from '../src/engine/world/world';
import { resolvePlayerAbility, stepPlayerGlide } from '../src/engine/combat/abilities';
import {
  damageBoss,
  damageAdd,
  damagePlayer,
  tickBuffs,
  buffMult,
} from '../src/engine/combat/combat';
import {
  inMoonForm,
  maintainMoonForms,
  MOON_ASPECT,
  onMoonDirectHit,
} from '../src/engine/combat/moonForm';
import { setSubclassPassive, tickSubclassPassives } from '../src/engine/combat/subclassPassives';
import { getSubclass } from '../src/engine/content/subclasses';
import { decompose, recompose, setForgeSeed } from '../src/engine/content/forge';
import { setProceduralSeed } from '../src/engine/content/procgen';
import { buffBadges } from '../src/render/overlays/buffGlyphs';
import { drawMoonBear } from '../src/render/pipeline/moonFormVisuals';
import { playerUsesRig } from '../src/render/rig/registry';
import { SnapshotInterpolator } from '../src/render/pipeline/interpolate';
import { ARENA_W, INTERP_DELAY_MS } from '../src/engine/core/constants';
import type { Add, InputCommand, Snapshot } from '../src/engine/core/types';
const ZERO = { x: 0, y: 0 };
function setup(choice = 0) {
  const def = getSubclass('dr_moon')!;
  const w = new World({
    monsterId: 'lich',
    seed: 31,
    players: [
      {
        peerId: 'a',
        name: 'Moon',
        classId: 'druid',
        subSkills: [def.skills[choice].id],
        extraClasses: ['knight'],
      },
      { peerId: 'b', name: 'Ally', classId: 'knight' },
    ],
  });
  w.obstacles = [];
  w.terrain = [];
  w.scene = null;
  const [p, ally] = w.players;
  p.pos = { x: 600, y: 400 };
  p.aim = { x: 1, y: 0 };
  p.critChance = 0;
  ally.pos = { x: 650, y: 400 };
  const boss = w.boss!;
  boss.pos = { x: 700, y: 400 };
  boss.hp = boss.maxHp = 10000;
  boss.decisionTimer = 100;
  boss.moveSpeed = 0;
  boss.facing = Math.PI;
  return { w, p, ally, boss };
}
function activate(w: World) {
  resolvePlayerAbility(w, w.players[0], 'a2', ZERO);
}
function add(w: World, x = 660): Add {
  const a: Add = {
    id: w.allocId(),
    pos: { x, y: 400 },
    hp: 1000,
    maxHp: 1000,
    moveSpeed: 0,
    radius: 12,
    buffs: [],
    targetId: null,
    attackCd: 0,
  };
  w.adds.push(a);
  return a;
}
afterEach(() => {
  vi.restoreAllMocks();
  setForgeSeed(null);
  setProceduralSeed(null);
});

describe('Moon identity, all loadouts and original ability preservation', () => {
  it.each([0, 1, 2, 3])(
    'choice %i has a full-health base route and its own subclass activation',
    (choice) => {
      for (const composed of [false, true]) {
        const { w, p } = setup(choice);
        const original = JSON.stringify(p.abilities);
        if (composed)
          p.subAbilities!.sub1 = recompose(decompose(p.subAbilities!.sub1!), p.subAbilities!.sub1!);
        expect(p.subclassPassiveId).toBe(MOON_ASPECT);
        activate(w);
        expect(inMoonForm(p)).toBe(true);
        expect(p.hp).toBe(p.maxHp);
        expect(JSON.stringify(p.abilities)).toBe(original);
        expect(buffMult(p, 'moveSpeed')).toBe(1.2);
        tickBuffs(p, 6);
        tickSubclassPassives(p, 12);
        maintainMoonForms(w);
        resolvePlayerAbility(w, p, 'sub1', ZERO);
        expect(inMoonForm(p)).toBe(true);
        expect(p.buffs.filter((b) => b.kind === 'moonForm')).toHaveLength(1);
      }
    },
  );
  it.each(['a1', 'a2', 'a3'] as const)('base %s works alone, even at full health', (slot) => {
    const { w, p } = setup();
    resolvePlayerAbility(w, p, slot, ZERO);
    expect(inMoonForm(p)).toBe(true);
    expect(p.subclassPassiveCooldowns?.[MOON_ASPECT]).toBe(12);
  });
  it('basics cannot activate or refresh form; its duration and trigger cooldown are separate', () => {
    const { w, p } = setup();
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(inMoonForm(p)).toBe(false);
    activate(w);
    tickBuffs(p, 2);
    tickSubclassPassives(p, 2);
    resolvePlayerAbility(w, p, 'a3', ZERO);
    expect(p.buffs.find((b) => b.kind === 'moonForm')!.remaining).toBe(4);
    tickBuffs(p, 4);
    tickSubclassPassives(p, 4);
    maintainMoonForms(w);
    expect(inMoonForm(p)).toBe(false);
    activate(w);
    expect(inMoonForm(p)).toBe(false);
    tickSubclassPassives(p, 6);
    activate(w);
    expect(inMoonForm(p)).toBe(true);
  });
  it('shows a truthful recovery countdown after expiry and after returning from another class', () => {
    const { w, p } = setup();
    activate(w);
    maintainMoonForms(w);
    expect(p.buffs.some((b) => b.kind === 'moonRest')).toBe(false);
    tickBuffs(p, 6);
    tickSubclassPassives(p, 6);
    maintainMoonForms(w);
    expect(p.buffs.find((b) => b.kind === 'moonRest')?.remaining).toBe(6);
    expect(buffBadges(p.buffs).some((b) => b.label.startsWith('Moon rest:'))).toBe(true);
    setSubclassPassive(p, undefined);
    tickSubclassPassives(p, 2);
    setSubclassPassive(p, MOON_ASPECT);
    maintainMoonForms(w);
    expect(p.buffs.find((b) => b.kind === 'moonRest')?.remaining).toBe(4);
    tickSubclassPassives(p, 4);
    maintainMoonForms(w);
    expect(p.buffs.some((b) => b.kind === 'moonRest')).toBe(false);
    activate(w);
    expect(inMoonForm(p)).toBe(true);
  });
  it('rooted movement cannot activate form; ordinary nonmovement spells still can', () => {
    const { w, p } = setup(1);
    p.buffs.push({ kind: 'root', mult: 0, remaining: 3, source: 'test' });
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(inMoonForm(p)).toBe(false);
    expect(p.subclassPassiveCooldowns?.[MOON_ASPECT]).toBeUndefined();
    activate(w);
    expect(inMoonForm(p)).toBe(true);
  });
  it('retains authored identity in variance/Forge; a graft cannot grant the passive', () => {
    setProceduralSeed(13);
    setForgeSeed(32);
    expect(getSubclass('dr_moon')!.passive!.id).toBe(MOON_ASPECT);
    const { w, p } = setup();
    setSubclassPassive(p, undefined);
    activate(w);
    expect(inMoonForm(p)).toBe(false);
  });
});

describe('bear basics: one aimed supplemental swipe, normal Thornlash retained', () => {
  it.each([false, true])(
    'native/composed basic keeps its own projectile and adds one claw (composed=%s)',
    (composed) => {
      const { w, p, boss } = setup();
      activate(w);
      if (composed)
        p.abilities!.basic = recompose(decompose(p.abilities!.basic), p.abilities!.basic);
      p.abilities!.basic.projCount = 3;
      p.critChance = 1;
      p.hp -= 20;
      const original = JSON.stringify(p.abilities!.basic);
      resolvePlayerAbility(w, p, 'basic', ZERO);
      expect(w.projectiles).toHaveLength(3);
      expect(boss.hp).toBe(9986);
      expect(p.hp).toBe(p.maxHp - 16);
      expect(JSON.stringify(p.abilities!.basic)).toBe(original);
      expect(w.events.filter((e) => e.t === 'skillArea' && e.area.kind === 'cone')).toHaveLength(1);
      expect(
        w.events
          .filter((e) => e.t === 'hit')
          .filter((e) => e.targetId === boss.id)
          .every((e) => !e.crit),
      ).toBe(true);
    },
  );
  it('hits each living enemy in the aimed cone, not allies, rear, distant or dead foes', () => {
    const { w, p, ally, boss } = setup();
    activate(w);
    const near = add(w),
      rear = add(w, 550),
      far = add(w, 950),
      dead = add(w);
    dead.hp = 0;
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(boss.hp).toBe(9986);
    expect(near.hp).toBe(986);
    expect(rear.hp).toBe(1000);
    expect(far.hp).toBe(1000);
    expect(dead.hp).toBe(0);
    expect(ally.hp).toBe(ally.maxHp);
    expect(p.stats.damageDealt).toBe(28);
  });
  it('misses and invulnerable foes do not heal; ranged attacks remain available outside claw range', () => {
    const { w, p, boss } = setup();
    activate(w);
    p.hp -= 20;
    boss.pos.x = 1050;
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(p.hp).toBe(p.maxHp - 20);
    expect(w.projectiles).toHaveLength(1);
    boss.pos.x = 700;
    boss.buffs.push({ kind: 'invuln', mult: 0, remaining: 3, source: 'test' });
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(p.hp).toBe(p.maxHp - 20);
    expect(p.subclassPassiveCooldowns?.moon_mend).toBeUndefined();
  });
  it('claws honor owner/enemy modifiers and wrap, without consuming direct-hit riders or melee counters', () => {
    const { w, p, boss } = setup();
    activate(w);
    p.pos.x = 10;
    p.aim.x = -1;
    boss.pos.x = ARENA_W - 40;
    p.damageMult = 2;
    boss.buffs.push({ kind: 'damageTaken', mult: 0.5, remaining: 3, source: 'test' });
    p.buffs.push({ kind: 'counter', mult: 1.3, remaining: 4, source: 'counterTest' });
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(boss.hp).toBe(9986);
    expect(p.buffs.some((b) => b.kind === 'counter')).toBe(true);
  });
  it('turning aim changes the swipe; a missed cone does not create an automatic homing hit', () => {
    const { w, p, boss } = setup();
    activate(w);
    p.aim = { x: -1, y: 0 };
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(boss.hp).toBe(10000);
    p.aim = { x: 1, y: 0 };
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(boss.hp).toBe(9986);
  });
});

describe('bounded natural mending and subclass interactions', () => {
  it('one swipe across many enemies mends only once; full health/zero damage preserve the gate', () => {
    const { w, p, boss } = setup();
    activate(w);
    add(w);
    add(w);
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(p.subclassPassiveCooldowns?.moon_mend).toBeUndefined();
    p.hp -= 20;
    onMoonDirectHit(w, p, boss, 0, true);
    expect(p.subclassPassiveCooldowns?.moon_mend).toBeUndefined();
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(p.hp).toBe(p.maxHp - 16);
    damageBoss(w, p, boss, 1, { direct: true });
    expect(p.hp).toBe(p.maxHp - 16);
    tickSubclassPassives(p, 1);
    damageAdd(w, p, w.adds[0], 1, { direct: true });
    expect(p.hp).toBe(p.maxHp - 12);
    expect(p.stats.healingDone).toBe(8);
  });
  it('nearby direct hits mend; far hits and ground-zone ticks do not', () => {
    const { w, p, boss } = setup();
    activate(w);
    p.hp -= 20;
    boss.pos.x = 1100;
    damageBoss(w, p, boss, 10, { direct: true });
    expect(p.hp).toBe(p.maxHp - 20);
    boss.pos.x = 700;
    damageBoss(w, p, boss, 10);
    expect(p.hp).toBe(p.maxHp - 20);
    damageBoss(w, p, boss, 10, { direct: true });
    expect(p.hp).toBe(p.maxHp - 16);
  });
  for (const choice of [0, 1])
    it.each([false, true])(
      `Moon choice ${choice} activates form and can mend from its own hit (composed=%s)`,
      (composed) => {
        const { w, p, boss } = setup(choice);
        p.hp -= 30;
        if (composed)
          p.subAbilities!.sub1 = recompose(decompose(p.subAbilities!.sub1!), p.subAbilities!.sub1!);
        boss.pos.x = choice === 1 ? p.pos.x + (p.subAbilities!.sub1!.range ?? 220) : 640;
        resolvePlayerAbility(w, p, 'sub1', ZERO);
        if (choice === 1) stepPlayerGlide(w, p, 1);
        expect(inMoonForm(p)).toBe(true);
        expect(p.hp).toBeGreaterThan(p.maxHp - 30);
        expect(p.subclassPassiveCooldowns?.moon_mend).toBe(1);
      },
    );
  it('Regeneration retains its healing/grove and Roar retains its own buffs without removing form', () => {
    const { w, p } = setup(3);
    p.hp = 50;
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(p.hp).toBe(130);
    expect(w.groundZones.some((z) => z.recovery)).toBe(true);
    expect(inMoonForm(p)).toBe(true);
    const r = setup(2);
    resolvePlayerAbility(r.w, r.p, 'sub1', ZERO);
    expect(buffMult(r.p, 'damageDealt')).toBe(1.3);
    expect(buffMult(r.p, 'moveSpeed')).toBeCloseTo(1.44);
  });
});

describe('lifecycle, controls and replicated form', () => {
  it.each(['downed', 'dead', 'zeroHp', 'class', 'reward', 'war'] as const)(
    'ends shape and stride on %s without resetting its gate',
    (reason) => {
      const { w, p } = setup();
      activate(w);
      const hp = p.hp,
        max = p.maxHp;
      if (reason === 'downed' || reason === 'dead') p.state = reason;
      if (reason === 'zeroHp') p.hp = 0;
      if (reason === 'class') setSubclassPassive(p, undefined);
      if (reason === 'reward' || reason === 'war') w.scene = reason;
      expect(w.serialize().players[0].form).toBeUndefined();
      maintainMoonForms(w);
      expect(p.buffs.some((b) => b.kind === 'moonForm')).toBe(false);
      expect(buffMult(p, 'moveSpeed')).toBe(1);
      expect(p.maxHp).toBe(max);
      expect(p.hp).toBe(reason === 'zeroHp' ? 0 : hp);
      expect(p.subclassPassiveCooldowns?.[MOON_ASPECT]).toBe(12);
      p.state = 'alive';
      p.hp = max;
      w.scene = null;
      setSubclassPassive(p, MOON_ASPECT);
      activate(w);
      expect(inMoonForm(p)).toBe(false);
    },
  );
  it('does not tank, resurrect, heal when downed or leave lingering movement after expiry', () => {
    const { w, p, boss } = setup();
    activate(w);
    const before = p.hp;
    damagePlayer(w, p, 10, boss.pos);
    expect(p.hp).toBe(before - 10);
    p.state = 'downed';
    onMoonDirectHit(w, p, boss, 10, true);
    expect(p.hp).toBe(before - 10);
    p.state = 'alive';
    tickBuffs(p, 6);
    maintainMoonForms(w);
    expect(buffMult(p, 'moveSpeed')).toBe(1);
  });
  it('real edge-triggered input activates, swipes at actual cooldown cadence and expires safely', () => {
    const { w, p } = setup();
    const step = (slot?: 'basic' | 'a2') => {
      const cmd: InputCommand = {
        seq: 0,
        move: ZERO,
        aim: { x: 1, y: 0 },
        autofire: false,
        buttons: {
          basic: slot === 'basic',
          a1: false,
          a2: slot === 'a2',
          a3: false,
          revive: false,
        },
      };
      w.step(0.05, new Map([['a', cmd]]));
    };
    step('a2');
    expect(inMoonForm(p)).toBe(true);
    step();
    let swipes = 0;
    for (let i = 0; i < 40; i++) {
      step('basic');
      swipes += w.events.filter((e) => e.t === 'skillArea' && e.area.kind === 'cone').length;
    }
    expect(swipes).toBe(1);
    step();
    step('basic');
    expect(w.events.some((e) => e.t === 'skillArea' && e.area.kind === 'cone')).toBe(true);
    for (let i = 0; i < 100; i++) step();
    expect(w.serialize().players[0].form).toBeUndefined();
  });
  it('serializes a form tag and public countdown without exposing gates or mutating stored poses', () => {
    const { w } = setup();
    activate(w);
    const view = w.serialize().players[0];
    expect(view.form).toBe('moonBear');
    expect(playerUsesRig(view)).toBe(false);
    expect(buffBadges(view.buffs).some((b) => b.label.includes('Moon bear:'))).toBe(true);
    const copy = JSON.parse(JSON.stringify(w.serialize())) as Snapshot;
    expect(copy.players[0]).not.toHaveProperty('subclassPassiveCooldowns');
    expect(copy.players[0].buffs.find((b) => b.kind === 'moonForm')).not.toHaveProperty('source');
  });
  it('client interpolation carries transformation/removal from the newer snapshot while interpolating position', () => {
    const { w, p } = setup();
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const i = new SnapshotInterpolator();
    i.push(w.serialize());
    now = 1100;
    activate(w);
    p.pos.x += 100;
    i.push(w.serialize());
    const rs = i.sample(1050 + INTERP_DELAY_MS, { localPlayerId: null, arena: w.arena })!;
    expect(rs.players[0].pos.x).toBeCloseTo(650);
    expect(rs.players[0].form).toBe('moonBear');
    tickBuffs(p, 6);
    maintainMoonForms(w);
    now = 1200;
    i.push(w.serialize());
    expect(
      i.sample(1200 + INTERP_DELAY_MS, { localPlayerId: null, arena: w.arena })!.players[0].form,
    ).toBeUndefined();
  });
  it('draws a distinct bear at mobile scale and retains default-time and animated paths', () => {
    const { w } = setup();
    const p = w.serialize().players[0];
    const g = new Graphics();
    drawMoonBear(g, p, ZERO, 0.3);
    expect(g.context.instructions.length).toBeGreaterThan(0);
    g.clear();
    drawMoonBear(g, p, ZERO, 2, 2);
    expect(g.context.instructions.length).toBeGreaterThan(0);
    g.destroy();
  });
});
