import type { Snapshot, ButtonState } from '../src/engine/core/types';
import { Graphics } from 'pixi.js';
import { drawManeuverArrow, drawManeuverTarget } from '../src/render/pipeline/maneuverVisuals';
import { describe, expect, it, afterEach } from 'vitest';
import { World } from '../src/engine/world/world';
import { maneuverCast, onManeuverHit, tickManeuvers } from '../src/engine/combat/battleManeuvers';
import { applyBuff, makeBuff } from '../src/engine/combat/combat';
import { resolvePlayerAbility, stepPlayerGlide } from '../src/engine/combat/abilities';
import {
  decompose,
  recompose,
  refreshComponents,
  componentValue,
  synthesizeAbility,
  setForgeSeed,
} from '../src/engine/content/forge';
import { getClass, describeAbility, type PlayerAbilityDef } from '../src/engine/content/classes';
import { previewAbilityTable, previewSubAbility } from '../src/engine/content/charUpgrades';
const zero = { x: 0, y: 0 };
afterEach(() => setForgeSeed(null));
function setup(mode: 'push' | 'step' = 'push', skill = 'kn_battle_trip') {
  const w = new World({
    seed: 31,
    monsterId: 'dragon',
    players: [
      {
        peerId: 'a',
        name: 'Battle',
        classId: 'knight',
        charUpgrades: [mode === 'push' ? 'kn_battlemaster_g_a' : 'kn_battlemaster_g_b'],
        subSkills: [skill],
        extraClasses: ['mage'],
      },
    ],
  });
  w.scene = null;
  w.obstacles = [];
  w.terrain = [];
  const p = w.players[0],
    b = w.boss!;
  p.pos = { x: 500, y: 400 };
  p.aim = { x: 1, y: 0 };
  p.critChance = 0;
  b.pos = { x: 600, y: 400 };
  b.hp = b.maxHp = 10000;
  b.moveSpeed = 0;
  b.decisionTimer = 100;
  const counter = makeBuff('counter', 1.3, 4, 'test');
  counter.openingTargetId = b.id;
  p.buffs = [counter];
  const ab: PlayerAbilityDef = {
    ...p.abilities!.basic,
    maneuver: { mode, distance: mode === 'push' ? 80 : 90 },
  };
  return { w, p, b, ab, counter };
}
describe('Battlemaster positioning prototype', () => {
  it.each(['windup', 'channel'] as const)(
    'keeps committed %s origin/aim/target unchanged then moves in recovery',
    (kind) => {
      const { w, p, b, ab, counter } = setup();
      b.action = {
        ...b.action,
        kind,
        abilityId: kind === 'windup' ? 'fireBreath' : 'testBeam',
        remaining: 0.2,
        total: 0.2,
        aimAngle: Math.PI,
        targetId: p.id,
        targetPos: { ...p.pos },
        channelAccum: 0,
      };
      if (kind === 'channel')
        w.monsterDef = {
          ...w.monsterDef,
          abilities: [
            ...w.monsterDef.abilities,
            {
              id: 'testBeam',
              name: 'Beam',
              shape: 'beam',
              damage: 1,
              cooldown: 10,
              windup: 0,
              channelDuration: 0.2,
            },
          ],
        };
      const action = structuredClone(b.action),
        from = { ...b.pos };
      onManeuverHit(w, p, b, 10, maneuverCast(p, ab, { x: 0, y: 1 }), counter);
      expect(b.maneuverMotion?.phase).toBe('queued');
      expect(b.pos).toEqual(from);
      expect(b.action).toEqual(action);
      tickManeuvers(w, 0.05);
      expect(b.pos).toEqual(from);
      for (let i = 0; i < 10; i++) w.step(0.05, new Map());
      expect(b.pos.y).toBeCloseTo(from.y + 80);
      expect(b.maneuverMotion).toBeUndefined();
      expect(b.action.kind).not.toBe('windup');
      expect(b.maneuverRecovery).toBeGreaterThan(5);
    },
  );
  it('resolves charge landing before displacement, rather than moving its origin', () => {
    const { w, p, b, ab, counter } = setup();
    const charge = {
      id: 'testCharge',
      name: 'Charge',
      shape: 'line' as const,
      damage: 1,
      cooldown: 10,
      windup: 0.1,
      width: 20,
      range: 200,
    };
    w.monsterDef = { ...w.monsterDef, abilities: [charge] };
    b.action = {
      ...b.action,
      kind: 'windup',
      abilityId: charge.id,
      remaining: 0.1,
      total: 0.1,
      targetPos: { x: 670, y: 400 },
      aimAngle: 0,
    };
    onManeuverHit(w, p, b, 10, maneuverCast(p, ab, { x: 0, y: 1 }), counter);
    w.step(0.1, new Map());
    expect(b.pos).toEqual({ x: 670, y: 400 });
    for (let i = 0; i < 4; i++) w.step(0.05, new Map());
    expect(b.pos).toEqual({ x: 670, y: 480 });
  });
  it('steps only after the whole multi-target strike and grants no iframe or landing payload', () => {
    const { w, p, b, ab } = setup('step');
    b.pos.x = 600;
    resolvePlayerAbility(w, p, 'basic', { x: 0, y: 1 }, ab);
    expect(p.pos).toEqual({ x: 500, y: 400 });
    expect(p.maneuverStep).toBeDefined();
    tickManeuvers(w, 0);
    expect(p.glide?.remaining).toBe(90);
    expect(p.buffs.some((b) => b.kind === 'invuln')).toBe(false);
    stepPlayerGlide(w, p, 0.2);
    expect(p.pos.y).toBeCloseTo(490);
    expect(p.glide).toBeNull();
    expect(p.buffs.some((b) => b.kind === 'invuln')).toBe(false);
  });
  it('stops both displacement and personal footwork at solid cover', () => {
    for (const mode of ['push', 'step'] as const) {
      const { w, p, b, ab, counter } = setup(mode);
      w.obstacles = [
        { id: 999, pos: { x: mode === 'push' ? 600 : 500, y: 460 }, radius: 10, kind: 'pillar' },
      ];
      onManeuverHit(w, p, b, 10, maneuverCast(p, ab, { x: 0, y: 1 }), counter);
      tickManeuvers(w, 0.2);
      if (mode === 'step') stepPlayerGlide(w, p, 0.2);
      expect((mode === 'push' ? b : p).pos.y).toBeLessThan(460);
    }
  });
  it('cancels deferred enemy motion if its owner is downed or the target rooted', () => {
    for (const cancel of ['down', 'root'] as const) {
      const { w, p, b, ab, counter } = setup();
      b.action.kind = 'windup';
      onManeuverHit(w, p, b, 1, maneuverCast(p, ab, zero), counter);
      if (cancel === 'down') p.state = 'downed';
      else applyBuff(b, makeBuff('root', 0, 3, 'test'));
      tickManeuvers(w, 0.1);
      expect(b.maneuverMotion).toBeUndefined();
      expect(b.pos).toEqual({ x: 600, y: 400 });
    }
  });
});

const skills = ['kn_battle_trip', 'kn_battle_menacing', 'kn_battle_precision', 'kn_battle_rally'];
function portable(mode: 'push' | 'step' = 'push') {
  const result = setup(mode),
    { p } = result;
  p.classId = 'mage';
  p.subclassPassiveId = undefined;
  p.charUpgradeIds = [];
  p.buffs = [];
  p.abilities = structuredClone(getClass('mage').abilities);
  const ab: PlayerAbilityDef = {
    name: 'Copied maneuver',
    slot: 'a1',
    kind: 'meleeCone',
    damage: 10,
    range: 200,
    cooldown: 6,
    maneuver: { mode, distance: mode === 'push' ? 80 : 90, portable: true },
  };
  return { ...result, ab };
}
describe('Battlemaster runtime contracts', () => {
  it.each(skills)(
    'both native identities work with %s as the only first pick and full health',
    (skill) => {
      for (const mode of ['push', 'step'] as const) {
        const { w, p, b } = setup(mode);
        p.subSkillIds = [skill];
        p.buffs = [];
        b.pos.x = 600;
        resolvePlayerAbility(w, p, 'a3', zero);
        resolvePlayerAbility(w, p, 'basic', zero);
        expect(p.buffs.some((b) => b.kind === 'counter')).toBe(true);
        const before = { ...p.pos };
        resolvePlayerAbility(w, p, 'basic', { x: 0, y: 1 });
        if (mode === 'push') {
          expect(b.maneuverMotion?.phase).toBe('queued');
          tickManeuvers(w, 0.2);
          expect(b.pos.y).toBe(480);
        } else {
          expect(p.maneuverStep).toBeDefined();
          tickManeuvers(w, 0);
          stepPlayerGlide(w, p, 0.2);
          expect(p.pos.y).toBe(before.y + 90);
        }
      }
    },
  );
  it('portable setup cannot spend itself, old delayed hits cannot spend or replace a newer mark, and basic can finish it', () => {
    const { w, p, b, ab } = portable();
    const old = maneuverCast(p, ab, zero),
      prep = maneuverCast(p, ab, zero);
    onManeuverHit(w, p, b, 10, prep);
    const mark = p.maneuverMark;
    onManeuverHit(w, p, b, 10, prep);
    expect(p.maneuverMark).toBe(mark);
    expect(b.maneuverMotion).toBeUndefined();
    onManeuverHit(w, p, b, 10, old);
    expect(p.maneuverMark).toBe(mark);
    expect(b.maneuverMotion).toBeUndefined();
    const later = maneuverCast(p, p.abilities!.basic, { x: 0, y: 1 });
    onManeuverHit(w, p, b, 10, later);
    expect(p.maneuverMark).toBeUndefined();
    expect(b.maneuverMotion?.phase).toBe('queued');
    tickManeuvers(w, 0.2);
    expect(b.pos.y).toBe(480);
    onManeuverHit(w, p, b, 10, old);
    expect(p.maneuverMark).toBeUndefined();
  });
  it('a real class swap invalidates old projectiles even after returning, and clears pending movement', () => {
    const { w, p, b, ab, counter } = setup();
    const old = maneuverCast(
      p,
      { ...ab, maneuver: { mode: 'push', distance: 80, portable: true } },
      zero,
    );
    onManeuverHit(w, p, b, 10, maneuverCast(p, ab, zero), counter);
    expect(b.maneuverMotion).toBeDefined();
    w.requestClassSwap('a', 'mage');
    w.requestClassSwap('a', 'knight');
    expect(b.maneuverMotion).toBeUndefined();
    onManeuverHit(w, p, b, 10, old);
    expect(p.maneuverMark).toBeUndefined();
  });
  it.each(['root', 'steadfast'] as const)(
    'does not move a %s enemy or invent compensation',
    (kind) => {
      const { w, p, b, ab, counter } = setup();
      applyBuff(b, makeBuff(kind, 0, 4, 'test'));
      onManeuverHit(w, p, b, 10, maneuverCast(p, ab, zero), counter);
      expect(b.maneuverMotion).toBeUndefined();
      expect(b.hp).toBe(10000);
    },
  );
  it('shares target recovery across owners and waits for an existing shove', () => {
    const { w, p, b, ab, counter } = setup();
    b.shove = { vx: 1, vy: 0, remaining: 0.2 };
    onManeuverHit(w, p, b, 1, maneuverCast(p, ab, zero), counter);
    tickManeuvers(w, 0.1);
    expect(b.maneuverMotion?.phase).toBe('queued');
    b.shove = null;
    tickManeuvers(w, 0);
    expect(b.maneuverRecovery).toBe(6);
    const before = b.maneuverMotion;
    onManeuverHit(w, p, b, 1, maneuverCast(p, ab, { x: 0, y: -1 }), counter);
    expect(b.maneuverMotion).toBe(before);
  });
  it('does not walk feared/lured adds during maneuver travel; conversion cancels it', () => {
    const { w, p, b, ab, counter } = setup();
    b.pos = { x: 900, y: 800 };
    w.spawnAddWave({ x: 650, y: 400 }, 1, { minR: 0, maxR: 0 });
    const add = w.adds[0];
    counter.openingTargetId = add.id;
    add.moveSpeed = 500;
    add.perception = {
      mode: 'lure',
      pos: { x: 500, y: 800 },
      remaining: 4,
      pending: 0,
      ownerId: p.id,
      ownerClass: p.classId,
      active: true,
      travel: 0,
      radius: 500,
    };
    onManeuverHit(w, p, add, 1, maneuverCast(p, ab, { x: 1, y: 0 }), counter);
    expect(w.serialize().adds[0].maneuver?.ownerId).toBe(p.id);
    const start = { ...add.pos };
    w.step(0.05, new Map());
    expect(add.pos.x).toBeCloseTo(start.x + 30);
    expect(add.pos.y).toBeCloseTo(start.y);
    // Real conversion payload shape is irrelevant to collision; any active charm removes hostility.
    add.charm = { ownerId: p.id, ownerClass: p.classId, remaining: 2 };
    tickManeuvers(w, 0.05);
    expect(add.maneuverMotion).toBeUndefined();
  });
  it.each(['stationary', 'root', 'stun', 'invulnerable', 'zero', 'dead', 'wrongTarget'] as const)(
    'preserves safe outcomes for %s',
    (failure) => {
      const { w, p, b, ab, counter } = setup(failure === 'wrongTarget' ? 'push' : 'step');
      if (failure === 'root' || failure === 'stun') applyBuff(p, makeBuff(failure, 0, 3, 'test'));
      if (failure === 'dead') p.state = 'downed';
      if (failure === 'wrongTarget') counter.openingTargetId = 999;
      if (failure === 'invulnerable') applyBuff(b, makeBuff('invuln', 0, 3, 'test'));
      if (failure === 'invulnerable') resolvePlayerAbility(w, p, 'basic', { x: 0, y: 1 }, ab);
      else
        onManeuverHit(
          w,
          p,
          b,
          failure === 'zero' ? 0 : 10,
          maneuverCast(p, ab, failure === 'stationary' ? zero : { x: 0, y: 1 }),
          counter,
        );
      expect(p.maneuverStep).toBeUndefined();
      expect(b.maneuverMotion).toBeUndefined();
    },
  );
  it('post-strike steps stop if rooted or class-swapped mid-travel', () => {
    const { w, p, b, ab, counter } = setup('step');
    onManeuverHit(w, p, b, 10, maneuverCast(p, ab, { x: 0, y: 1 }), counter);
    tickManeuvers(w, 0);
    applyBuff(p, makeBuff('root', 0, 3, 'test'));
    stepPlayerGlide(w, p, 0.1);
    expect(p.glide).toBeNull();
  });
  it('portable preparation expires, clears on downing and cannot mark a corpse', () => {
    const { w, p, b, ab } = portable();
    onManeuverHit(w, p, b, 1, maneuverCast(p, ab, zero));
    tickManeuvers(w, 4.1);
    expect(p.maneuverMark).toBeUndefined();
    onManeuverHit(w, p, b, 1, maneuverCast(p, ab, zero));
    p.state = 'downed';
    tickManeuvers(w, 0.1);
    expect(p.maneuverMark).toBeUndefined();
    p.state = 'alive';
    b.hp = 0;
    onManeuverHit(w, p, b, 1, maneuverCast(p, ab, zero));
    expect(p.maneuverMark).toBeUndefined();
  });
});
describe('maneuver catalogue and Forge', () => {
  it.each(['push', 'step'] as const)(
    '%s removes old numerical packages and preserves ordinary/honed/grand layers',
    (mode) => {
      const id = mode === 'push' ? 'kn_battlemaster_g_a' : 'kn_battlemaster_g_b';
      const base = previewAbilityTable('knight', []),
        table = previewAbilityTable('knight', [id]);
      expect(table.basic.controlDamageBonus).toBe(base.basic.controlDamageBonus);
      expect(table.a1.absorption).toEqual(base.a1.absorption);
      expect(table.a3.castSlow).toBe(base.a3.castSlow);
      expect(table.basic.maneuver?.mode).toBe(mode);
      for (const skill of skills)
        for (const n of [0, 5]) {
          const history = [...Array<string>(n).fill('subup_' + skill), skill + '_g', id];
          const ab = previewSubAbility(skill, history)!;
          if (skill === 'kn_battle_trip') expect(ab.maneuver?.mode).toBe(mode);
          else expect(ab.maneuver).toBeUndefined();
          expect(ab.cooldown).toBeGreaterThan(0);
        }
    },
  );
  it.each(['push', 'step'] as const)(
    '%s is a priced, scalable, capped, refreshed standalone component',
    (mode) => {
      const { ab } = setup(mode),
        comp = decompose(ab),
        copy = recompose(comp, ab);
      expect(copy.maneuver).toMatchObject({ mode, portable: true });
      expect(describeAbility(copy)).toContain('first direct cast');
      const without = { ...comp, effects: comp.effects.filter((e) => e.kind !== 'maneuver') };
      expect(componentValue(comp)).toBeGreaterThan(componentValue(without));
      expect(refreshComponents(copy).effects.some((e) => e.kind === 'maneuver')).toBe(true);
      expect(
        refreshComponents({ ...ab, maneuver: { mode, distance: 999 } }).effects.find(
          (e) => e.kind === 'maneuver',
        ),
      ).toEqual({ kind: 'maneuver', mode, distance: mode === 'push' ? 80 : 90 });
      const { w, p, b } = portable(mode);
      p.abilities!.a1 = copy;
      b.pos.x = 600;
      resolvePlayerAbility(w, p, 'a1', zero);
      expect(p.maneuverMark).toBeDefined();
      resolvePlayerAbility(w, p, 'basic', { x: 0, y: 1 });
      w.step(0.05, new Map());
      if (mode === 'push') expect(b.maneuverMotion).toBeDefined();
      else expect(p.glide).toBeDefined();
    },
  );
});

it.each(['push', 'step'] as const)(
  'actual synthesis carries a standalone %s maneuver without Knight passive/counters',
  (mode) => {
    const { ab } = setup(mode);
    let found: PlayerAbilityDef | undefined;
    for (let seed = 0; seed < 100; seed++) {
      const out = synthesizeAbility(seed, 'battle-copy', 'a1', [
        {
          name: 'Receiving strike',
          classId: 'mage',
          className: 'Mage',
          slot: 'a1',
          def: { ...getClass('knight').abilities.basic },
        },
        { name: 'Maneuver donor', classId: 'knight', className: 'Knight', slot: 'sub1', def: ab },
      ]).def;
      if (out.maneuver?.mode === mode) {
        found = out;
        break;
      }
    }
    expect(found).toBeDefined();
    if (!found) throw new Error('No maneuver synthesis');
    const { w, p, b } = portable(mode);
    p.abilities!.a1 = found;
    resolvePlayerAbility(w, p, 'a1', zero);
    expect(p.maneuverMark).toBeDefined();
    resolvePlayerAbility(w, p, 'basic', { x: 0, y: 1 });
    w.step(0.05, new Map());
    if (mode === 'push') {
      expect(b.pos.y).toBeGreaterThan(400);
      expect(b.maneuverRecovery).toBeGreaterThan(5);
    } else expect(p.glide).toBeDefined();
  },
);

describe('maneuver lifecycle and public cues', () => {
  it.each(['push', 'step'] as const)(
    '%s publishes ready, pending/travel and recovery without host tokens',
    (mode) => {
      const { w, p, b, ab, counter } = setup(mode);
      p.maneuverMove = { x: 0, y: 1 };
      const view = () =>
        (JSON.parse(JSON.stringify(w.serialize())) as Snapshot).players[0].maneuver;
      expect(view()).toMatchObject({ mode, phase: 'ready' });
      expect(JSON.stringify(w.serialize())).not.toContain('openingTargetId');
      if (mode === 'push') b.action.kind = 'windup';
      onManeuverHit(w, p, b, 1, maneuverCast(p, ab, { x: 0, y: 1 }), counter);
      if (mode === 'push') {
        expect(view()?.phase).toBe('queued');
        b.action.kind = 'recover';
        tickManeuvers(w, 0.05);
        expect(view()?.phase).toBe('travel');
        tickManeuvers(w, 0.2);
        expect(view()).toMatchObject({ phase: 'recovery', targetId: b.id });
      } else {
        expect(view()?.phase).toBe('recovery');
        tickManeuvers(w, 0);
        expect(p.glide).toBeDefined();
      }
      p.buffs = [];
      tickManeuvers(w, 7);
      expect(view()).toBeUndefined();
    },
  );
  it.each(['push', 'step'] as const)(
    'portable %s preparation/recovery cues work without any donor passive',
    (mode) => {
      const { w, p, b, ab } = portable(mode);
      const view = () => w.toRenderState(p.id).players[0].maneuver;
      expect(view()).toBeUndefined();
      onManeuverHit(w, p, b, 1, maneuverCast(p, ab, zero));
      expect(view()).toMatchObject({ phase: 'ready', portable: true, targetId: b.id });
      onManeuverHit(w, p, b, 1, maneuverCast(p, p.abilities!.basic, { x: 0, y: 1 }));
      tickManeuvers(w, 0.2);
      expect(view()?.phase).toBe('recovery');
      onManeuverHit(w, p, b, 1, maneuverCast(p, ab, zero));
      expect(p.maneuverMark).toBeUndefined();
      p.state = 'downed';
      expect(view()).toBeUndefined();
    },
  );
  it('hides invalid or no-longer-actionable preparation across missing identities, class mismatch and dead targets', () => {
    const { w, p, b, ab } = portable();
    onManeuverHit(w, p, b, 1, maneuverCast(p, ab, zero));
    p.maneuverMark!.ownerClass = 'knight';
    p.maneuverLast = { effect: { mode: 'step', distance: 90 }, ownerClass: 'knight' };
    expect(w.toRenderState(p.id).players[0].maneuver).toBeUndefined();
    p.classId = 'knight';
    p.maneuverMark = undefined;
    p.subclassPassiveId = 'battle_opening';
    p.subAbilities = { sub1: undefined };
    p.charUpgradeIds = undefined;
    p.buffs = [];
    expect(w.toRenderState(p.id).players[0].maneuver).toBeUndefined();
    p.charUpgradeIds = ['kn_battlemaster_g_a'];
    b.hp = 0;
    p.maneuverMark = undefined;
    expect(w.toRenderState(p.id).players[0].maneuver).toBeUndefined();
    p.hp = 0;
    expect(w.toRenderState(p.id).players[0].maneuver).toBeUndefined();
  });
  it.each(['scene', 'hp', 'class', 'expired', 'deadTarget'] as const)(
    'rejects late/invalid portable context: %s',
    (context) => {
      const { w, p, b, ab } = portable();
      const cast = maneuverCast(p, ab, zero);
      if (context === 'scene') w.scene = 'reward';
      if (context === 'hp') p.hp = 0;
      if (context === 'class') p.classId = 'knight';
      if (context === 'expired') {
        onManeuverHit(w, p, b, 1, cast);
        tickManeuvers(w, 5);
        onManeuverHit(w, p, b, 1, cast);
      } else {
        if (context === 'deadTarget') b.hp = 0;
        onManeuverHit(w, p, b, 1, cast);
      }
      expect(p.maneuverMark).toBeUndefined();
    },
  );
  it.each(['down', 'hp', 'class', 'root', 'stun', 'glide', 'shove', 'casting'] as const)(
    'does not override a new %s state between step request and launch',
    (blocked) => {
      const { w, p, b, ab, counter } = setup('step');
      onManeuverHit(w, p, b, 1, maneuverCast(p, ab, { x: 0, y: 1 }), counter);
      if (blocked === 'casting') p.castTimer = 1;
      if (blocked === 'down') p.state = 'downed';
      if (blocked === 'hp') p.hp = 0;
      if (blocked === 'class') p.classId = 'mage';
      if (blocked === 'root' || blocked === 'stun') applyBuff(p, makeBuff(blocked, 0, 2, 'test'));
      if (blocked === 'glide') p.glide = { dir: { x: 1, y: 0 }, remaining: 10, leap: false, ab };
      if (blocked === 'shove') p.shove = { vx: 100, vy: 0, remaining: 1 };
      const existing = p.glide;
      tickManeuvers(w, 0.05);
      expect(p.maneuverStep).toBeUndefined();
      expect(p.glide).toBe(existing);
    },
  );
  it.each(['glide', 'shove', 'casting'] as const)(
    'does not prepare counter footwork during an existing %s',
    (blocked) => {
      const { w, p, b, ab, counter } = setup('step');
      if (blocked === 'casting') p.castTimer = 1;
      if (blocked === 'glide') p.glide = { dir: { x: 1, y: 0 }, remaining: 10, leap: false, ab };
      else if (blocked === 'shove') p.shove = { vx: 100, vy: 0, remaining: 1 };
      onManeuverHit(w, p, b, 1, maneuverCast(p, ab, { x: 0, y: 1 }), counter);
      expect(p.maneuverStep).toBeUndefined();
    },
  );
  it.each(['queued', 'travel'] as const)(
    '%s enemy movement cancels for owner/target lifecycle loss',
    (phase) => {
      for (const reason of [
        'missing',
        'down',
        'hp',
        'class',
        'epoch',
        'dead',
        'root',
        'steadfast',
      ] as const) {
        const { w, p, b, ab, counter } = setup();
        b.action.kind = phase === 'queued' ? 'windup' : 'idle';
        onManeuverHit(w, p, b, 1, maneuverCast(p, ab, zero), counter);
        if (phase === 'travel') tickManeuvers(w, 0);
        if (reason === 'down') p.state = 'downed';
        if (reason === 'missing') w.players = [];
        if (reason === 'hp') p.hp = 0;
        if (reason === 'class') p.classId = 'mage';
        if (reason === 'epoch') p.maneuverEpoch = 1;
        if (reason === 'dead') b.hp = 0;
        if (reason === 'root' || reason === 'steadfast')
          applyBuff(b, makeBuff(reason, 0, 2, 'test'));
        tickManeuvers(w, 0.1);
        expect(b.maneuverMotion).toBeUndefined();
      }
    },
  );
  it('clears portable preparation on class/target loss and cancels active footwork immediately on swap', () => {
    for (const reason of ['class', 'dead', 'hp'] as const) {
      const { w, p, b, ab } = portable();
      onManeuverHit(w, p, b, 1, maneuverCast(p, ab, zero));
      if (reason === 'class') p.classId = 'knight';
      else if (reason === 'hp') p.hp = 0;
      else b.hp = 0;
      tickManeuvers(w, 0.1);
      expect(p.maneuverMark).toBeUndefined();
    }
    const { w, p, b, ab, counter } = setup('step');
    onManeuverHit(w, p, b, 1, maneuverCast(p, ab, { x: 0, y: 1 }), counter);
    tickManeuvers(w, 0);
    w.requestClassSwap('a', 'mage');
    expect(p.glide).toBeNull();
  });
  it.each([false, true])(
    'draws distinct solid/dashed arrows for local and allied movement, queued=%s',
    (queued) => {
      const g = new Graphics();
      drawManeuverArrow(g, { x: 100, y: 100 }, 20, zero, 80, queued, true);
      expect(g.context.instructions).toHaveLength(0);
      for (const own of [false, true]) {
        g.clear();
        drawManeuverArrow(g, { x: 100, y: 100 }, 20, { x: 0, y: 1 }, 80, queued, own, !own);
        expect(g.context.instructions.some((i) => i.action === 'fill')).toBe(true);
        expect(g.context.instructions.some((i) => i.action === 'stroke')).toBe(true);
      }
      g.destroy();
    },
  );
});

it('stationary overlapping centers use a deterministic away fallback instead of losing displacement', () => {
  const { w, p, b, ab, counter } = setup();
  b.pos = { ...p.pos };
  onManeuverHit(w, p, b, 1, maneuverCast(p, ab, zero), counter);
  tickManeuvers(w, 0.2);
  expect(b.pos.x).toBe(580);
});

it.each(['push', 'step'] as const)(
  'native and portable flat %s descriptions explain their different triggers',
  (mode) => {
    const { ab } = setup(mode);
    expect(describeAbility(ab)).toContain('melee counter');
    expect(describeAbility({ ...ab, maneuver: { mode, distance: 80, portable: true } })).toContain(
      'first direct cast',
    );
    const copy = recompose(decompose(ab), ab);
    delete copy.maneuver;
    expect(refreshComponents(copy).effects.some((e) => e.kind === 'maneuver')).toBe(true);
    const merged = recompose(
      {
        ...decompose(ab),
        effects: [
          { kind: 'damage', amount: 10 },
          { kind: 'maneuver', mode: 'push', distance: 80 },
          { kind: 'maneuver', mode: 'step', distance: 90 },
        ],
      },
      ab,
    );
    expect(merged.components!.effects.filter((e) => e.kind === 'maneuver')).toHaveLength(1);
  },
);
it('another owner and a different portable payload cannot bypass shared foe recovery or consume the waiting mark', () => {
  const { w, p, b, ab } = portable('push');
  onManeuverHit(w, p, b, 1, maneuverCast(p, ab, zero));
  const mark = p.maneuverMark;
  b.maneuverRecovery = 2;
  const otherPayload = { ...ab, maneuver: { mode: 'step' as const, distance: 90, portable: true } };
  onManeuverHit(w, p, b, 1, maneuverCast(p, otherPayload, { x: 0, y: 1 }));
  expect(p.maneuverMark).toBe(mark);
  expect(p.maneuverStep).toBeUndefined();
  expect(b.maneuverMotion).toBeUndefined();
  b.maneuverRecovery = 0;
  onManeuverHit(w, p, b, 1, maneuverCast(p, p.abilities!.basic, { x: 0, y: 1 }));
  expect(b.maneuverMotion?.ownerId).toBe(p.id);
});
it('two native owners cannot stack requests or reverse a foe during shared recovery', () => {
  const { w, p, b, ab, counter } = setup();
  const other = structuredClone(p);
  other.id = 999;
  other.peerId = 'other';
  w.players.push(other);
  const counter2 = other.buffs.find((b) => b.kind === 'counter')!;
  b.action.kind = 'windup';
  onManeuverHit(w, p, b, 1, maneuverCast(p, ab, { x: 0, y: 1 }), counter);
  onManeuverHit(w, other, b, 1, maneuverCast(other, ab, { x: 0, y: -1 }), counter2);
  expect(b.maneuverMotion?.ownerId).toBe(p.id);
  b.action.kind = 'recover';
  tickManeuvers(w, 0.2);
  const pos = { ...b.pos };
  onManeuverHit(w, other, b, 1, maneuverCast(other, ab, { x: 0, y: -1 }), counter2);
  expect(b.pos).toEqual(pos);
  expect(b.maneuverMotion).toBeUndefined();
});
it('converted targets lose portable marks and public target hints', () => {
  const { w, p, ab } = portable();
  w.spawnAddWave({ x: 700, y: 700 }, 1, { minR: 0, maxR: 0 });
  const add = w.adds[0];
  onManeuverHit(w, p, add, 1, maneuverCast(p, ab, zero));
  add.charm = { ownerId: p.id, ownerClass: p.classId, remaining: 3 };
  expect(w.toRenderState(p.id).players[0].maneuver).toBeUndefined();
  tickManeuvers(w, 0.1);
  expect(p.maneuverMark).toBeUndefined();
});
it('actual Forge first picks retain a priced portable starting carrier and keep the existing recharge floors', () => {
  for (const seed of [7, 47, 4242])
    for (const skill of skills)
      for (const mode of ['push', 'step'] as const) {
        setForgeSeed(seed);
        const { p, w } = setup(mode, skill);
        const basic = p.abilities!.basic;
        expect(w.toRenderState(p.id).players[0].maneuver).toBeUndefined();
        expect(basic.maneuver?.portable).toBe(true);
        expect(basic.components?.effects.some((e) => e.kind === 'maneuver')).toBe(true);
        expect(basic.cooldown).toBeGreaterThan(0);
      }
});

it('cast-time follow-up keeps its initial movement direction when later input changes', () => {
  const { w, p, b, ab } = portable('step');
  onManeuverHit(w, p, b, 1, maneuverCast(p, ab, zero));
  p.abilities!.a1 = { ...ab, maneuver: undefined, castTime: 0.2 };
  const input = (move: { x: number; y: number }, buttons: Partial<ButtonState> = {}) =>
    new Map([
      [
        'a',
        {
          seq: w.tick,
          move,
          aim: { x: 1, y: 0 },
          buttons: { basic: false, a1: false, a2: false, a3: false, revive: false, ...buttons },
        },
      ],
    ]);
  w.step(0.05, input({ x: 0, y: 1 }, { a1: true }));
  expect(p.castTimer).toBeGreaterThan(0);
  w.step(0.1, input({ x: 0, y: -1 }));
  w.step(0.1, input({ x: 0, y: -1 }));
  expect(p.glide?.dir).toEqual({ x: 0, y: 1 });
  expect(p.buffs.some((b) => b.kind === 'invuln')).toBe(false);
});
it('enemy maneuvers wrap across the seam and stop at the nearest copy of solid cover', () => {
  for (const obstacle of [false, true]) {
    const { w, p, b, ab, counter } = setup();
    p.pos = { x: w.arena.w - 180, y: 400 };
    b.pos = { x: w.arena.w - 80, y: 400 };
    if (obstacle) w.obstacles = [{ id: 999, pos: { x: 20, y: 400 }, radius: 10, kind: 'pillar' }];
    onManeuverHit(w, p, b, 1, maneuverCast(p, ab, { x: 1, y: 0 }), counter);
    tickManeuvers(w, 0.2);
    if (obstacle) {
      expect(b.pos.x).toBeGreaterThan(w.arena.w - 80);
      expect(b.pos.x).toBeLessThan(w.arena.w);
    } else expect(b.pos.x).toBeCloseTo(0);
  }
});
it('personal counter footwork wraps across the seam through the ordinary glide path', () => {
  const { w, p, b, ab, counter } = setup('step');
  p.pos = { x: w.arena.w - 40, y: 400 };
  b.pos = { x: w.arena.w - 140, y: 400 };
  p.aim = { x: -1, y: 0 };
  onManeuverHit(w, p, b, 1, maneuverCast(p, ab, { x: 1, y: 0 }), counter);
  tickManeuvers(w, 0);
  stepPlayerGlide(w, p, 0.2);
  expect(p.pos.x).toBeCloseTo(50);
  expect(p.glide).toBeNull();
});

it("a portable attempt on another owner's recovering foe reports shared recovery without consuming preparation", () => {
  const { w, p, b, ab } = portable();
  b.maneuverRecovery = 3;
  onManeuverHit(w, p, b, 1, maneuverCast(p, ab, zero));
  expect(p.maneuverMark).toBeUndefined();
  expect(b.maneuverMotion).toBeUndefined();
  expect(w.toRenderState(p.id).players[0].maneuver).toMatchObject({
    mode: 'push',
    phase: 'recovery',
    remaining: 3,
    targetId: b.id,
  });
});
it.each(['push', 'step'] as const)(
  'a lethal native %s counter moves only its living recipient',
  (mode) => {
    const { w, p, b, ab } = setup(mode);
    b.hp = 1;
    resolvePlayerAbility(w, p, 'basic', { x: 0, y: 1 }, ab);
    expect(b.hp).toBeLessThanOrEqual(0);
    expect(b.maneuverMotion).toBeUndefined();
    if (mode === 'step') expect(p.maneuverStep).toBeDefined();
    else expect(p.maneuverStep).toBeUndefined();
  },
);

it('portable footwork marks its enemy without drawing a misleading enemy movement arrow', () => {
  const g = new Graphics();
  drawManeuverTarget(g, { x: 200, y: 100 }, 30, true);
  expect(g.context.instructions.filter((i) => i.action === 'stroke')).toHaveLength(4);
  expect(g.context.instructions.some((i) => i.action === 'fill')).toBe(false);
  g.destroy();
});

it('native readiness is hidden when the receiving kit has no matching native counter payload', () => {
  for (const state of ['missing', 'otherMode', 'portableOnly'] as const) {
    const { w, p } = setup();
    if (state === 'missing') {
      p.abilities = undefined;
      p.subAbilities = undefined;
    } else {
      p.abilities = structuredClone(getClass('mage').abilities);
      p.subAbilities = {
        sub1: {
          ...p.abilities.basic,
          maneuver:
            state === 'otherMode'
              ? { mode: 'step', distance: 90 }
              : { mode: 'push', distance: 80, portable: true },
        },
      };
    }
    expect(w.toRenderState(p.id).players[0].maneuver).toBeUndefined();
  }
});

it.each(['idle', 'recover'] as const)(
  'reserves the next boss decision until existing forced movement finishes, from %s',
  (kind) => {
    const { w, p, b, ab, counter } = setup();
    b.action.kind = kind;
    b.action.remaining = 0.01;
    b.decisionTimer = 0;
    b.shove = { vx: 10, vy: 0, remaining: 0.6 };
    onManeuverHit(w, p, b, 1, maneuverCast(p, ab, { x: 0, y: 1 }), counter);
    w.step(0.1, new Map());
    expect(b.action.kind).toBe(kind);
    expect(b.maneuverMotion?.phase).toBe('queued');
    for (let i = 0; i < 8; i++) w.step(0.1, new Map());
    expect(b.pos.y).toBeCloseTo(480);
  },
);
it('a new shove pauses remaining enemy maneuver travel without applying two movement paths', () => {
  const { w, p, b, ab, counter } = setup();
  onManeuverHit(w, p, b, 1, maneuverCast(p, ab, { x: 0, y: 1 }), counter);
  tickManeuvers(w, 0.05);
  expect(b.pos.y).toBe(430);
  b.shove = { vx: 100, vy: 0, remaining: 0.2 };
  w.step(0.05, new Map());
  expect(b.pos.y).toBe(430);
  expect(b.maneuverMotion?.phase).toBe('queued');
  for (let i = 0; i < 5; i++) w.step(0.05, new Map());
  expect(b.pos).toEqual({ x: 620, y: 480 });
});
it('continually competing pushes cannot hold the next boss decision indefinitely', () => {
  const { w, p, b, ab, counter } = setup();
  b.decisionTimer = 0;
  onManeuverHit(w, p, b, 1, maneuverCast(p, ab, { x: 0, y: 1 }), counter);
  for (let i = 0; i < 11; i++) {
    b.shove = { vx: 1, vy: 0, remaining: 0.5 };
    w.step(0.1, new Map());
  }
  expect(b.maneuverMotion).toBeUndefined();
  expect(b.maneuverRecovery).toBeGreaterThan(5);
  expect(w.toRenderState(p.id).players[0].maneuver?.phase).toBe('recovery');
});
it('a same-cast interruption and shove finish before queued maneuver launch', () => {
  const { w, p, b, ab } = portable();
  onManeuverHit(w, p, b, 1, maneuverCast(p, ab, zero));
  b.action = {
    ...b.action,
    kind: 'windup',
    abilityId: 'fireBreath',
    remaining: 1,
    total: 1,
    targetId: p.id,
    targetPos: { ...p.pos },
    aimAngle: Math.PI,
  };
  const follow = { ...ab, thoughtBreak: true, knockback: 100 };
  resolvePlayerAbility(w, p, 'a1', { x: 0, y: 1 }, follow);
  expect(b.action.kind).toBe('recover');
  expect(b.shove).toBeDefined();
  expect(b.maneuverMotion?.phase).toBe('queued');
  const from = { ...b.pos };
  w.step(0.05, new Map());
  expect(b.pos.y).toBe(from.y);
  for (let i = 0; i < 15; i++) w.step(0.05, new Map());
  expect(b.pos.y).toBeCloseTo(from.y + 80);
});
it.each(['shove', 'lethal'] as const)(
  'an incoming %s state interrupts unprotected personal footwork before another glide step',
  (reason) => {
    const { w, p, b, ab, counter } = setup('step');
    onManeuverHit(w, p, b, 1, maneuverCast(p, ab, { x: 0, y: 1 }), counter);
    tickManeuvers(w, 0);
    if (reason === 'shove') p.shove = { vx: 100, vy: 0, remaining: 0.2 };
    else p.hp = 0;
    const pos = { ...p.pos };
    stepPlayerGlide(w, p, 0.05);
    expect(p.pos).toEqual(pos);
    expect(p.glide).toBeNull();
  },
);
