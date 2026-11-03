import { emptyGrandLoadout, changeGrand } from '../src/engine/content/grandSelections';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { World } from '../src/engine/world/world';
import { applyBuff, damageBoss, damageEcho, makeBuff } from '../src/engine/combat/combat';
import { resolvePlayerAbility } from '../src/engine/combat/abilities';
import { forethoughtView, tickForethought } from '../src/engine/combat/forethought';
import { forethoughtLabel } from '../src/engine/content/forethought';
import {
  previewAbilityTable,
  previewSubAbility,
  describeCharOffer,
} from '../src/engine/content/charUpgrades';
import {
  decompose,
  recompose,
  componentValue,
  setForgeSeed,
  synthesizeAbility,
  refreshComponents,
} from '../src/engine/content/forge';
import { describeAbility, getClass, resolvedForethought } from '../src/engine/content/classes';
import type { Boss, ExtSlot, MonsterId, Player } from '../src/engine/core/types';
const identity = 'wa_great_old_one_g_a';
const skills = ['wa_goo_blast', 'wa_goo_tentacle', 'wa_goo_whispers', 'wa_goo_flee'];
const zero = { x: 0, y: 0 };
afterEach(() => {
  setForgeSeed(null);
  vi.restoreAllMocks();
});
function setup(skill = skills[0], monsterId: MonsterId = 'troll', upgrades = [identity]) {
  const w = new World({
    seed: 31,
    monsterId,
    players: [
      {
        peerId: 'a',
        name: 'Reader',
        classId: 'warlock',
        charUpgrades: upgrades,
        subSkills: [skill],
      },
      { peerId: 'b', name: 'Ally', classId: 'knight' },
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
  w.players[1].pos = { x: 1100, y: 700 };
  b.pos = { x: 600, y: 400 };
  b.hp = b.maxHp = 10000;
  b.moveSpeed = 0;
  b.decisionTimer = 1.2;
  return { w, p, b };
}
function curse(p: Player, b: Boss) {
  applyBuff(b, makeBuff('curse', 1.15, 5, `curse:${p.id}`));
}
function hit(w: World, p: Player, b: Boss, requiresCurse = true, amount = 1) {
  return damageBoss(w, p, b, amount, {
    direct: true,
    forethought: { ownerClass: p.classId, requiresCurse },
  });
}
function update(w: World, b: Boss, dt = 0) {
  (w as unknown as { updateBoss(dt: number, b: Boss, i: number): void }).updateBoss(dt, b, 0);
}
function use(w: World, p: Player, slot: ExtSlot) {
  (w as unknown as { tryUseAbility(p: Player, s: ExtSlot, d: typeof zero): void }).tryUseAbility(
    p,
    slot,
    w.boss!.pos,
  );
}
function impact(w: World, b: Boss) {
  for (const shot of w.projectiles) shot.pos = { ...b.pos };
  (w as unknown as { updateProjectiles(dt: number): void }).updateProjectiles(0);
}
function recovery(b: Boss) {
  b.action.kind = 'recover';
  b.action.remaining = 0.4;
  b.action.total = 0.4;
  b.action.abilityId = null;
}
function decide(w: World, b: Boss, p: Player) {
  (w as unknown as { bossDecide(b: Boss, d: typeof w.monsterDef, p: Player): void }).bossDecide(
    b,
    w.defOf(b),
    p,
  );
}

describe('Elder Mind forethought', () => {
  it.each(skills)('full-health first pick %s reads through actual Hex and basic', (skill) => {
    const { w, p, b } = setup(skill);
    b.pos.x = p.pos.x + 460;
    use(w, p, 'a1');
    w.step(0.8, new Map());
    expect(b.buffs.some((x) => x.kind === 'curse')).toBe(true);
    use(w, p, 'basic');
    impact(w, b);
    update(w, b);
    expect(b.forethought?.abilityId).toBeDefined();
    expect(p.hp).toBe(p.maxHp);
    expect(p.abilities!.a2.cursePayoff).toBeUndefined();
  });
  it('keeps the current wind-up untouched and reads only after recovery, with genuine early lead', () => {
    const { w, p, b } = setup();
    curse(p, b);
    b.action.kind = 'windup';
    b.action.abilityId = 'smash';
    b.action.remaining = 2;
    b.action.total = 2;
    hit(w, p, b);
    update(w, b);
    expect(b.forethought?.abilityId).toBeUndefined();
    expect(b.action.remaining).toBe(2);
    recovery(b);
    b.cooldowns.smash = 5;
    update(w, b);
    const next = b.forethought!.abilityId!;
    expect(next).toBe('groundSlam');
    expect(b.action.kind).toBe('recover');
    expect(b.action.remaining).toBe(0.4);
    expect(b.decisionTimer).toBe(1.2);
    // Retreat after the early commitment: a close nova remains the chosen move.
    p.pos = { x: 1100, y: 700 };
    update(w, b, 0.4);
    expect(b.action.kind).toBe('idle');
    update(w, b, 1.19);
    expect(b.action.kind).toBe('idle');
    update(w, b, 0.02);
    expect(b.action.abilityId).toBe(next);
    expect(b.forethought).toBeUndefined();
    expect(b.action.remaining).toBe(w.defOf(b).abilities.find((a) => a.id === next)!.windup);
  });
  it('does not interrupt a channel or inherit its already committed aim', () => {
    const { w, p, b } = setup(skills[0], 'beholder');
    curse(p, b);
    const beam = w.defOf(b).abilities.find((a) => a.shape === 'beam')!;
    b.action.kind = 'channel';
    b.action.abilityId = beam.id;
    b.action.remaining = 3;
    b.action.targetPos = { x: 1, y: 2 };
    hit(w, p, b);
    update(w, b);
    expect(b.action.kind).toBe('channel');
    expect(b.action.remaining).toBe(3);
    expect(b.action.targetPos).toEqual({ x: 1, y: 2 });
    expect(b.forethought?.abilityId).toBeUndefined();
    recovery(b);
    b.cooldowns[beam.id] = 10;
    update(w, b);
    expect(b.forethought?.abilityId).toBeDefined();
  });
  it('uses late targets and aim, including taunt and random targeting', () => {
    const { w, p, b } = setup();
    p.pos = { x: 1100, y: 700 };
    curse(p, b);
    hit(w, p, b);
    update(w, b);
    expect(b.forethought!.abilityId).toBe('charge');
    const ally = w.players[1];
    ally.pos = { x: 600, y: 700 };
    vi.spyOn(w.rng, 'pick').mockReturnValue(ally);
    decide(w, b, ally);
    expect(b.action.abilityId).toBe('charge');
    expect(b.action.targetId).toBe(ally.id);
    expect(b.action.aimAngle).toBeCloseTo(Math.PI / 2);
  });
  it('joins one shared plan without rerolling or changing the original owner', () => {
    const { w, p, b } = setup();
    curse(p, b);
    hit(w, p, b);
    update(w, b);
    const chosen = b.forethought!.abilityId,
      owner = b.forethought!.ownerId;
    const spy = vi.spyOn(w.defOf(b), 'decide');
    hit(w, w.players[1], b, false);
    update(w, b);
    expect(spy).not.toHaveBeenCalled();
    expect(b.forethought!.abilityId).toBe(chosen);
    expect(b.forethought!.ownerId).toBe(owner);
    expect(w.serialize().bosses[0].forethought?.abilityId).toBe(chosen);
    expect(JSON.stringify(w.serialize().bosses[0].forethought)).not.toContain('ownerClass');
  });
  it.each(['cooldown', 'unknown'] as const)(
    'invalidates a genuinely illegal %s forecast without waiting',
    (reason) => {
      const { w, p, b } = setup();
      curse(p, b);
      hit(w, p, b);
      update(w, b);
      if (reason === 'cooldown') b.cooldowns[b.forethought!.abilityId!] = 100;
      if (reason === 'unknown') b.forethought!.abilityId = 'missing';
      expect(forethoughtView(w, b)).toBeUndefined();
      update(w, b);
      expect(b.forethought).toBeUndefined();
      b.decisionTimer = 0;
      update(w, b);
      expect(b.action.kind).toBe('windup');
    },
  );
  it('honors an actual HP gate and allows enrage without rerolling a legal plan', () => {
    const { w, p, b } = setup(skills[0], 'dragon');
    curse(p, b);
    hit(w, p, b);
    b.forethought!.abilityId = 'wingGust';
    expect(forethoughtView(w, b)).toBeUndefined();
    b.hp = b.maxHp * 0.2;
    b.forethought!.abilityId = 'fireBreath';
    update(w, b);
    expect(b.phase).toBe('enraged');
    expect(b.forethought!.abilityId).toBe('fireBreath');
  });
  it('keeps fairness deferral and the same forecast until a later legal start', () => {
    const { w, p, b } = setup();
    curse(p, b);
    hit(w, p, b);
    update(w, b);
    const next = b.forethought!.abilityId;
    const guard = vi
      .spyOn(w as unknown as { wouldWallUnfairly(): boolean }, 'wouldWallUnfairly')
      .mockReturnValue(true);
    decide(w, b, p);
    expect(b.action.kind).toBe('idle');
    expect(b.forethought!.abilityId).toBe(next);
    guard.mockReturnValue(false);
    decide(w, b, p);
    expect(b.action.abilityId).toBe(next);
  });
  it('has no fabricated forecast when all abilities are cooling; expires without delaying AI', () => {
    const { w, p, b } = setup();
    curse(p, b);
    hit(w, p, b);
    for (const ab of w.defOf(b).abilities) b.cooldowns[ab.id] = 100;
    update(w, b);
    expect(b.forethought?.abilityId).toBeUndefined();
    expect(forethoughtLabel(b.monsterId, forethoughtView(w, b))).toBe('Reading next move…');
    tickForethought(w, b, 8);
    expect(b.forethought).toBeUndefined();
    expect(b.decisionTimer).toBe(1.2);
  });
  it.each(['down', 'hp', 'class', 'scene', 'expiry'] as const)(
    'clears source state %s',
    (reason) => {
      const { w, p, b } = setup();
      curse(p, b);
      hit(w, p, b);
      if (reason === 'down') p.state = 'downed';
      if (reason === 'hp') p.hp = 0;
      if (reason === 'class') p.classId = 'mage';
      if (reason === 'scene') w.scene = {} as typeof w.scene;
      tickForethought(w, b, reason === 'expiry' ? 8 : 0);
      expect(b.forethought).toBeUndefined();
    },
  );
  it('requires the personal curse, positive damage, a live boss and a source in the reserving class', () => {
    const { w, p, b } = setup();
    hit(w, p, b);
    expect(b.forethought).toBeUndefined();
    curse(w.players[1], b);
    hit(w, p, b);
    expect(b.forethought).toBeUndefined();
    curse(p, b);
    hit(w, p, b, true, 0);
    expect(b.forethought).toBeUndefined();
    damageBoss(w, p, b, 1, {
      direct: true,
      forethought: { ownerClass: 'mage', requiresCurse: true },
    });
    expect(b.forethought).toBeUndefined();
    applyBuff(b, makeBuff('invuln', 0, 1, 'test'));
    hit(w, p, b);
    expect(b.forethought).toBeUndefined();
    b.buffs = b.buffs.filter((x) => x.kind !== 'invuln');
    hit(w, p, b, true, b.hp * 2);
    expect(b.forethought).toBeUndefined();
  });
  it('zone/echo/borrowed hits cannot read and missed projectiles do not arm', () => {
    const { w, p, b } = setup();
    curse(p, b);
    damageBoss(w, p, b, 1, { forethought: { ownerClass: 'warlock', requiresCurse: true } });
    damageEcho(w, p, b, 10);
    damageBoss(w, p, b, 1, {
      direct: true,
      borrowed: true,
      forethought: { ownerClass: 'warlock', requiresCurse: true },
    });
    use(w, p, 'basic');
    expect(b.forethought).toBeUndefined();
    expect(w.projectiles[0].forethoughtHit?.ownerClass).toBe('warlock');
  });
  it('carries the direct effect on native burst and piercing projectiles without restarting a read', () => {
    const { w, p, b } = setup('wa_goo_tentacle');
    curse(p, b);
    use(w, p, 'sub1');
    expect(b.forethought).toBeDefined();
    update(w, b);
    const next = b.forethought!.abilityId;
    hit(w, p, b);
    update(w, b);
    expect(b.forethought!.abilityId).toBe(next);
    const blast = previewSubAbility('wa_goo_blast', [
      identity,
      'wa_goo_blast_g',
      'subup_wa_goo_blast',
    ]);
    expect(blast?.forethought).toEqual({ requiresCurse: true });
    expect(blast?.pierce).toBe(1);
    expect(blast?.cursePayoff).toBe(4);
  });
  it('keeps Honed and individual grands useful without the old identity package', () => {
    for (const n of [0, 5])
      for (const skill of skills) {
        const a = previewSubAbility(skill, [
          identity,
          ...Array<string>(n).fill(`subup_${skill}`),
          `${skill}_g`,
        ])!;
        const base = previewSubAbility(skill, [
          ...Array<string>(n).fill(`subup_${skill}`),
          `${skill}_g`,
        ])!;
        expect(a.zoneDuration).toBe(base.zoneDuration);
        expect(a.healOnUse).toBe(base.healOnUse);
        expect(a.slowMult).toBe(base.slowMult);
        expect(a.cursePayoff).toBe(base.cursePayoff);
      }
    expect(previewAbilityTable('warlock', [identity]).a1.zoneDuration).toBe(
      getClass('warlock').abilities.a1.zoneDuration,
    );
  });
  it('copied components are standalone, deduplicated, fixed-price and usable with no curse/passive', () => {
    const native = previewAbilityTable('warlock', [identity]).a2;
    const comp = decompose(native);
    expect(comp.effects.some((e) => e.kind === 'forethought' && e.requiresCurse)).toBe(true);
    comp.effects.push({ kind: 'forethought' });
    const copy = recompose(comp, { slot: 'a2', name: 'Read', cooldown: 9 });
    expect(copy.components!.effects.filter((e) => e.kind === 'forethought')).toHaveLength(1);
    expect(resolvedForethought(copy)).toEqual({ requiresCurse: false });
    expect(
      componentValue({ delivery: { kind: 'pbaoe' }, effects: [{ kind: 'forethought' }] }),
    ).toBe(24);
    expect(describeAbility(copy)).toContain('reads and commits');
    const { w, p, b } = setup(skills[0], 'troll', []);
    p.abilities!.a2 = copy;
    use(w, p, 'a2');
    expect(b.forethought).toBeDefined();
    const refreshed = refreshComponents(copy);
    expect(refreshed.effects.some((e) => e.kind === 'forethought')).toBe(true);
  });
  it('real synthesis keeps an explicit standalone contract and excludes random basics', () => {
    const native = previewAbilityTable('warlock', [identity]).a2;
    let found;
    for (let seed = 0; seed < 100; seed++) {
      const out = synthesizeAbility(seed, 'read', 'a2', [
        {
          name: 'Strike',
          classId: 'warlock',
          className: 'Warlock',
          slot: 'a2',
          def: { ...getClass('warlock').abilities.a2, rebukeDuration: undefined },
        },
        { name: 'Mind', classId: 'warlock', className: 'Warlock', slot: 'sub1', def: native },
      ]).def;
      if (resolvedForethought(out)) {
        found = out;
        break;
      }
    }
    expect(found).toBeDefined();
    expect(resolvedForethought(found)).toEqual({ requiresCurse: false });
    const basic = synthesizeAbility(5, 'basic', 'basic', [
      { name: 'Mind', classId: 'warlock', className: 'Warlock', slot: 'basic', def: native },
    ]).def;
    expect(resolvedForethought(basic)).toBeUndefined();
  });
  it('actual Forge first picks always have a carrier and an honest basic fallback', () => {
    let fallback = false;
    for (const seed of [7, 47, 4242])
      for (const skill of skills) {
        setForgeSeed(seed);
        const { w, p, b } = setup(skill);
        const slot = resolvedForethought(p.abilities!.a2) ? 'a2' : 'basic';
        expect(resolvedForethought(p.abilities![slot])).toEqual({ requiresCurse: false });
        fallback ||= slot === 'basic';
        expect(describeCharOffer('warlock', [], identity)?.desc).toContain('without a curse');
        resolvePlayerAbility(w, p, slot, zero);
        impact(w, b);
        expect(b.forethought).toBeDefined();
      }
    expect(fallback).toBe(true);
  });
  it('does not spill the native contract onto a graft, and reclaim restores it', () => {
    for (const history of [
      [identity, 'hy_pyromancer'],
      ['hy_pyromancer', identity],
    ]) {
      expect(previewAbilityTable('warlock', history).a2.forethought).toBeUndefined();
      expect(previewAbilityTable('warlock', [...history, 'restore:a2']).a2.forethought).toEqual({
        requiresCurse: true,
      });
    }
  });
  it('banked Elder Mind does not install until equipped in the exclusive identity slot', () => {
    const doom = 'wa_great_old_one_g_b',
      context = { classes: ['warlock' as const], history: [], subSkills: [skills[0]] };
    let state = changeGrand(
      emptyGrandLoadout(),
      context,
      { classId: 'warlock', id: doom, action: 'earn' },
      true,
    )!;
    state = changeGrand(
      state,
      context,
      { classId: 'warlock', id: identity, action: 'earn' },
      true,
    )!;
    const make = () =>
      new World({
        seed: 31,
        monsterId: 'troll',
        players: [
          {
            peerId: 'a',
            name: 'A',
            classId: 'warlock',
            subSkills: [skills[0]],
            charUpgrades: [doom, identity],
            grandLoadout: state,
          },
        ],
      }).players[0];
    expect(make().abilities!.basic.forethought).toBeUndefined();
    state = changeGrand(state, context, {
      classId: 'warlock',
      id: identity,
      action: 'equip',
      replace: doom,
    })!;
    expect(make().abilities!.basic.forethought).toEqual({ requiresCurse: true });
    expect(make().abilities!.a2.surgeRider?.interrupt).toBeUndefined();
  });
  it.each([0, 5])('Haste with %s Honed ranks retains real recovery and direct reading', (rank) => {
    const { w, p, b } = setup(skills[0], 'troll', [
      identity,
      ...Array<string>(rank).fill('subup_wa_goo_blast'),
    ]);
    p.cooldownMult = 0.1;
    curse(p, b);
    use(w, p, 'sub1');
    impact(w, b);
    expect(b.forethought).toBeDefined();
    expect(p.cooldowns.sub1).toBeGreaterThanOrEqual(4);
  });
  it('independent bosses can each be read by the same direct burst', () => {
    const { w, p, b } = setup();
    const other = {
      ...b,
      id: 123,
      pos: { ...b.pos },
      buffs: [],
      cooldowns: { ...b.cooldowns },
      action: { ...b.action },
    };
    w.bosses.push(other);
    curse(p, b);
    curse(p, other);
    use(w, p, 'a2');
    expect(b.forethought).toBeDefined();
    expect(other.forethought).toBeDefined();
  });
  it('an invalid plan at the decision boundary falls back normally and missing targets never lock aim', () => {
    const { w, p, b } = setup();
    curse(p, b);
    hit(w, p, b);
    update(w, b);
    b.cooldowns[b.forethought!.abilityId!] = 100;
    decide(w, b, p);
    expect(b.action.kind).toBe('windup');
    expect(b.forethought).toBeUndefined();
    recovery(b);
    hit(w, p, b);
    p.state = 'downed';
    w.players[1].state = 'downed';
    update(w, b);
    expect(b.forethought).toBeUndefined();
  });
  it.each(['down', 'hp', 'class', 'room'] as const)(
    'rejects late projectile reads after source %s',
    (reason) => {
      const { w, p, b } = setup();
      curse(p, b);
      use(w, p, 'basic');
      if (reason === 'down') p.state = 'downed';
      if (reason === 'hp') p.hp = 0;
      if (reason === 'class') p.classId = 'mage';
      if (reason === 'room') w.scene = {} as typeof w.scene;
      impact(w, b);
      expect(b.forethought).toBeUndefined();
    },
  );
  it('component removal overrides a stale flat read and standalone duplicates price once', () => {
    const native = previewAbilityTable('warlock', [identity]).a2;
    const copy = recompose(decompose(native), { slot: 'a2', name: 'Read', cooldown: 9 });
    const comp = copy.components!;
    // Canonical components survive refresh even when the redundant flat field is absent.
    const refreshed = refreshComponents({ ...copy, forethought: undefined });
    expect(refreshed.effects.some((e) => e.kind === 'forethought')).toBe(true);
    const value = componentValue(comp);
    const dedup = recompose(
      { ...comp, effects: [...comp.effects, { kind: 'forethought' }] },
      { slot: 'a2', name: 'Read', cooldown: 9 },
    );
    expect(componentValue(dedup.components!)).toBe(value);
    copy.components = { ...comp, effects: comp.effects.filter((e) => e.kind !== 'forethought') };
    expect(resolvedForethought(copy)).toBeUndefined();
    const { w, p, b } = setup(skills[0], 'troll', []);
    p.abilities!.a2 = copy;
    use(w, p, 'a2');
    expect(b.forethought).toBeUndefined();
  });
  it('public labels distinguish pending reads, committed next moves and old snapshots', () => {
    expect(forethoughtLabel('troll', undefined)).toBeUndefined();
    expect(forethoughtLabel('troll', { remaining: 0 })).toBeUndefined();
    expect(forethoughtLabel('troll', { remaining: 2, abilityId: 'groundSlam' })).toBe(
      'Next: Ground Slam · nearby burst',
    );
  });
});
