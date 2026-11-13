import { afterEach, describe, expect, it } from 'vitest';
import { Graphics } from 'pixi.js';
import { World } from '../src/engine/world/world';
import { resolvePlayerAbility } from '../src/engine/combat/abilities';
import {
  commitShadow,
  tickShadowCommits,
  shadowCommitViews,
} from '../src/engine/combat/shadowCommit';
import { applyBuff, makeBuff } from '../src/engine/combat/combat';
import {
  CLASSES,
  describeAbility,
  resolvedShadowCommit,
  resolvedPalmSweep,
  resolvedAncestralRelay,
} from '../src/engine/content/classes';
import { previewSubAbility, previewAbilityTable } from '../src/engine/content/charUpgrades';
import {
  decompose,
  recompose,
  refreshComponents,
  componentValue,
  synthesizeAbility,
  setForgeSeed,
} from '../src/engine/content/forge';
import { drawShadowCommit } from '../src/render/pipeline/shadowCommitVisuals';
import type { ExtSlot, InputCommand, Player, Vec2 } from '../src/engine/core/types';
const zero = { x: 0, y: 0 },
  right = { x: 1, y: 0 },
  left = { x: -1, y: 0 };
const skills = ['mo_shadow_dart', 'mo_shadow_step', 'mo_shadow_cloud', 'mo_shadow_strike'];
afterEach(() => setForgeSeed(null));
function setup(skill = skills[0], ids = ['mo_shadow_g_b']) {
  const w = new World({
    seed: 31,
    monsterId: 'dragon',
    players: [
      {
        peerId: 'a',
        name: 'Shadow',
        classId: 'monk',
        charUpgrades: ids,
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
  p.aim = right;
  p.critChance = 0;
  p.buffs = [];
  b.pos = { x: 580, y: 400 };
  b.hp = b.maxHp = 10000;
  b.moveSpeed = 0;
  b.decisionTimer = 1000;
  return { w, p, b };
}
function input(
  w: World,
  buttons: Partial<InputCommand['buttons']> = {},
  move = zero,
  aim = right,
  autofire = false,
  dt = 0.01,
) {
  w.step(
    dt,
    new Map([
      [
        'a',
        {
          seq: w.tick,
          move,
          aim,
          autofire,
          buttons: { basic: false, a1: false, a2: false, a3: false, revive: false, ...buttons },
        },
      ],
    ]),
  );
}
function use(w: World, p: Player, slot: ExtSlot) {
  (w as unknown as { tryUseAbility: (p: Player, s: ExtSlot, d: Vec2) => void }).tryUseAbility(
    p,
    slot,
    zero,
  );
}
function compose(p: Player, slot: ExtSlot) {
  const ab = slot === 'sub1' ? p.subAbilities!.sub1! : p.abilities![slot as 'a1'];
  const copy = recompose(decompose(ab), ab);
  if (slot === 'sub1') p.subAbilities!.sub1 = copy;
  else p.abilities![slot as 'a1'] = copy;
  return copy;
}
describe('detached original Shadow strike', () => {
  it.each(skills)('has a full-health solo route with first pick %s', (skill) => {
    const { w, p, b } = setup(skill);
    input(w, { a3: true }, left);
    const origin = { ...shadowCommitViews(w, p)![0].origin };
    expect(p.castTimer).toBe(0);
    expect(p.glide).toBeFalsy();
    expect(b.hp).toBe(10000);
    const cd = p.cooldowns.a3;
    expect(cd).toBeGreaterThan(0);
    for (let i = 0; i < 55; i++) input(w, {}, left, left);
    expect(p.pos.x).toBeLessThan(origin.x - 100);
    expect(b.hp).toBe(10000);
    expect(shadowCommitViews(w, p)?.[0].origin).toEqual(origin);
    for (let i = 0; i < 8; i++) input(w, {}, left, left);
    expect(b.hp).toBeLessThan(10000);
    expect(p.shadowCommits).toHaveLength(0);
    expect(p.cooldowns.a3).toBeLessThan(cd);
  });
  it.each([false, true])(
    'captures prepared geometry, releases one direct contact and does not move the body, composed=%s',
    (composed) => {
      const { w, p, b } = setup();
      if (composed) compose(p, 'a3');
      applyBuff(p, makeBuff('flow', 0, 4, 'flow'));
      p.cooldowns.a2 = 8;
      use(w, p, 'a3');
      expect(p.buffs.some((b) => b.kind === 'flow')).toBe(false);
      expect(p.cooldowns.a2).toBe(6);
      expect(p.subclassPassiveCooldowns?.shadow_rhythm).toBe(4);
      const c = shadowCommitViews(w, p)![0];
      expect(c).toMatchObject({ kind: 'pbaoe', radius: 165, duration: 0.6 });
      expect(b.hp).toBe(10000);
      expect(p.pos).toEqual({ x: 500, y: 400 });
      p.pos = { x: 1000, y: 700 };
      tickShadowCommits(w, 0.59);
      expect(b.hp).toBe(10000);
      tickShadowCommits(w, 0.01);
      expect(b.hp).toBeCloseTo(10000 - p.abilities!.a3.damage * 1.1);
      const hp = b.hp;
      tickShadowCommits(w, 1);
      expect(b.hp).toBe(hp);
      expect(p.cooldowns.a2).toBe(6);
      expect(w.events.filter((e) => e.t === 'cast' && e.slot === 'a3')).toHaveLength(1);
      expect(w.events.filter((e) => e.t === 'skillArea')).toHaveLength(1);
    },
  );
  it.each([false, true])(
    'locks cone aim and attacks from its shadow rather than the live body, composed=%s',
    (composed) => {
      const { w, p, b } = setup(skills[3]);
      if (composed) compose(p, 'sub1');
      use(w, p, 'sub1');
      p.pos = { x: 900, y: 400 };
      p.aim = left;
      tickShadowCommits(w, 0.6);
      expect(b.hp).toBeLessThan(10000);
      const second = setup();
      use(second.w, second.p, 'a1');
      second.p.pos = { x: 900, y: 400 };
      second.b.pos = { x: 950, y: 400 };
      tickShadowCommits(second.w, 0.6);
      expect(second.b.hp).toBe(10000);
    },
  );
  it.each(['leave', 'immune', 'dead'] as const)(
    'does not force a hit when the target is %s',
    (reason) => {
      const { w, p, b } = setup();
      use(w, p, 'a3');
      if (reason === 'leave') b.pos = { x: 1100, y: 700 };
      if (reason === 'immune') applyBuff(b, makeBuff('invuln', 0, 2, 'invuln'));
      if (reason === 'dead') b.hp = 0;
      const hp = b.hp;
      tickShadowCommits(w, 0.6);
      expect(b.hp).toBe(hp);
      expect(p.shadowCommits).toHaveLength(0);
    },
  );
  it('keeps multiple paid strikes and lets ready abilities work during commitment', () => {
    const { w, p, b } = setup(skills[3]);
    input(w, { a1: true, a3: true, sub1: true });
    expect(p.shadowCommits).toHaveLength(3);
    expect(p.castTimer).toBe(0);
    const hp = b.hp;
    input(w, { basic: true });
    expect(b.hp).toBeLessThan(hp);
    p.pos = { x: 1000, y: 700 };
    tickShadowCommits(w, 0.6);
    expect(p.shadowCommits).toHaveLength(0);
    expect(b.hp).toBeLessThan(hp - p.abilities!.basic.damage);
  });
  it('held autofire preserves the pending cast, aim and normal cooldown cadence', () => {
    const { w, p } = setup();
    input(w, { a1: true }, zero, right, true);
    const id = p.shadowCommits![0].id,
      cd = p.cooldowns.a1;
    for (let i = 0; i < 20; i++) input(w, { a1: true }, left, left, true);
    expect(p.shadowCommits).toHaveLength(1);
    expect(p.shadowCommits![0].id).toBe(id);
    expect(p.shadowCommits![0].aim).toEqual(right);
    expect(p.cooldowns.a1).toBeLessThan(cd);
    expect(p.cooldowns.a1).toBeGreaterThan(cd - 0.3);
  });
  it.each(['root', 'stun', 'silence', 'shove'] as const)(
    'body %s after launch does not cancel independent contact',
    (reason) => {
      const { w, p, b } = setup();
      use(w, p, 'a3');
      if (reason === 'shove') p.shove = { vx: 300, vy: 0, remaining: 1 };
      else applyBuff(p, makeBuff(reason, 0, 2, reason));
      tickShadowCommits(w, 0.6);
      expect(b.hp).toBeLessThan(10000);
    },
  );
  it.each([
    'down',
    'dead',
    'zeroHP',
    'scene',
    'finished',
    'class',
    'epoch',
    'source',
    'removed',
  ] as const)('cancels a pending shadow after %s', (reason) => {
    const { w, p, b } = setup();
    use(w, p, 'a3');
    if (reason === 'down') p.state = 'downed';
    if (reason === 'dead') p.state = 'dead';
    if (reason === 'zeroHP') p.hp = 0;
    if (reason === 'scene') w.scene = 'reward';
    if (reason === 'finished') w.finished = true;
    if (reason === 'class') {
      w.setActiveClass(p, 'mage');
      w.setActiveClass(p, 'monk');
    }
    if (reason === 'epoch') p.shadowCommitEpoch = (p.shadowCommitEpoch ?? 0) + 1;
    if (reason === 'source') p.abilities!.a3 = { ...p.abilities!.a3 };
    if (reason === 'removed') p.abilities!.a3.shadowCommit = false;
    expect(shadowCommitViews(w, p)).toBeUndefined();
    tickShadowCommits(w, 1);
    expect(b.hp).toBe(10000);
  });
  it('preserves prelaunch silence/stun/cooldown gates and rooted local casting', () => {
    for (const kind of ['silence', 'stun'] as const) {
      const { w, p } = setup();
      applyBuff(p, makeBuff(kind, 0, 2, kind));
      use(w, p, 'a3');
      expect(p.shadowCommits).toBeUndefined();
      expect(p.cooldowns.a3).toBe(0);
    }
    const { w, p, b } = setup();
    p.cooldowns.a3 = 1;
    use(w, p, 'a3');
    expect(p.shadowCommits).toBeUndefined();
    p.cooldowns.a3 = 0;
    applyBuff(p, makeBuff('root', 0, 2, 'root'));
    use(w, p, 'a3');
    expect(p.shadowCommits).toHaveLength(1);
    tickShadowCommits(w, 0.6);
    expect(b.hp).toBeLessThan(10000);
  });
  it('free movement has no new immunity and Haste/Focus do not shorten commitment', () => {
    const { w, p, b } = setup();
    p.cooldownMult = 0.1;
    p.castMult = 0.1;
    input(w, { a3: true });
    expect(p.shadowCommits![0].remaining).toBe(0.6);
    expect(p.buffs.some((b) => b.kind === 'invuln')).toBe(false);
    tickShadowCommits(w, 0.3);
    expect(b.hp).toBe(10000);
    tickShadowCommits(w, 0.3);
    expect(b.hp).toBeLessThan(10000);
  });
  it('applies forces from shadow contact and shares one token across multiple foes', () => {
    const { w, p, b } = setup(skills[0], ['mo_shadow_g_b', 'mo_gk_a3_a']);
    b.pos = { x: 620, y: 400 };
    const add = {
      id: w.allocId(),
      pos: { x: 580, y: 420 },
      hp: 1000,
      maxHp: 1000,
      radius: 12,
      moveSpeed: 0,
      targetId: null,
      attackCd: 0,
      buffs: [],
    };
    w.adds.push(add);
    use(w, p, 'a3');
    p.pos = { x: 1000, y: 700 };
    tickShadowCommits(w, 0.6);
    expect(b.shove!.vx).toBeLessThan(0);
    expect(add.hp).toBeLessThan(1000);
    expect(p.shadowCommits).toHaveLength(0);
  });
});
describe('Shadow content, ownership and Forge', () => {
  it('retains A growth, passive and useful simple first skills, removing B riders', () => {
    const b = previewAbilityTable('monk', ['mo_shadow_g_b']);
    expect(b.a1.shadowCommit).toBe(true);
    expect(b.a3.castTime).toBe(0);
    expect(b.a2.prepareFlow).toBe(CLASSES.monk.abilities.a2.prepareFlow);
    expect(b.a2.healOnUse).toBe(CLASSES.monk.abilities.a2.healOnUse);
    expect(b.a1.castSlow).toBeUndefined();
    expect(previewSubAbility(skills[3], ['mo_shadow_g_b'])?.shadowCommit).toBe(true);
    for (const skill of skills.slice(0, 3))
      expect(previewSubAbility(skill, ['mo_shadow_g_b'])?.shadowCommit).toBeUndefined();
    expect(previewAbilityTable('monk', ['mo_shadow_g_a']).a2.prepareCrit).toBe(4);
    expect(describeAbility(b.a3)).toContain('after 0.6s');
    expect(describeAbility(b.a3)).not.toContain('no wind-up');
  });
  it('copies work without donor resources/passive and normalize away nonexistent body windup', () => {
    const { w, p, b } = setup(skills[0], []);
    p.subclassPassiveId = undefined;
    p.abilities!.a3 = recompose(
      decompose({ ...p.abilities!.a3, shadowCommit: true }),
      p.abilities!.a3,
    );
    expect(p.abilities!.a3.castTime).toBe(0);
    use(w, p, 'a3');
    expect(b.hp).toBe(10000);
    tickShadowCommits(w, 0.6);
    expect(b.hp).toBeLessThan(10000);
    const comp = decompose(p.abilities!.a3),
      normal = { ...comp, delivery: { ...comp.delivery, castTime: 1 } };
    expect(componentValue(normal)).toBe(componentValue(comp));
    expect(componentValue(comp)).toBeGreaterThan(
      componentValue({ ...comp, effects: comp.effects.filter((e) => e.kind !== 'shadowCommit') }),
    );
    expect(refreshComponents(p.abilities!.a3).effects).toContainEqual({ kind: 'shadowCommit' });
  });
  it.each(['projectile', 'groundZone', 'dash', 'blink', 'selfBuff'] as const)(
    'rejects incompatible copied delivery %s',
    (kind) => {
      const ab = previewAbilityTable('monk', ['mo_shadow_g_b']).a3,
        comp = decompose(ab);
      comp.delivery.kind = kind;
      expect(recompose(comp, ab).shadowCommit).toBeUndefined();
      expect(resolvedShadowCommit({ ...ab, kind })).toBe(false);
    },
  );
  it.each(['palmSweep', 'ancestralRelay', 'infernalClaim'] as const)(
    'rejects competing origin %s without an orphaned contract',
    (origin) => {
      const ab = previewAbilityTable('monk', ['mo_shadow_g_b']).a3;
      const raw = {
        ...ab,
        ...(origin === 'palmSweep'
          ? { palmSweep: { distance: 180 } }
          : origin === 'ancestralRelay'
            ? { ancestralRelay: { range: 360 } }
            : { infernalClaim: true }),
      };
      expect(resolvedShadowCommit(raw)).toBe(false);
      expect(resolvedPalmSweep(raw)).toBeUndefined();
      expect(resolvedAncestralRelay(raw)).toBeUndefined();
      const c = decompose(ab);
      c.effects.push(
        ...decompose({ ...raw, shadowCommit: false }).effects.filter(
          (e) => e.kind === origin || e.kind === 'skillContract',
        ),
      );
      expect(recompose(c, ab).shadowCommit).toBeUndefined();
    },
  );
  it('drops basic and duplicate contracts, respects component authority and isolated public state', () => {
    const { w, p } = setup();
    const ab = p.abilities!.a3,
      comp = decompose(ab);
    comp.effects.push({ kind: 'shadowCommit' });
    expect(
      recompose(comp, ab).components!.effects.filter((e) => e.kind === 'shadowCommit'),
    ).toHaveLength(1);
    expect(recompose(comp, { ...ab, slot: 'basic' }).shadowCommit).toBeUndefined();
    expect(resolvedShadowCommit({ ...ab, components: decompose(CLASSES.monk.abilities.a3) })).toBe(
      false,
    );
    expect(commitShadow(w, p, p.abilities!.basic, 'basic', p.pos, right)).toBe(false);
    expect(commitShadow(w, p, ab, 'sub2', p.pos, right)).toBe(false);
    use(w, p, 'a3');
    const views = shadowCommitViews(w, p)!;
    views[0].origin.x = 1;
    expect(p.shadowCommits![0].origin.x).toBe(500);
    const json = JSON.stringify(w.serialize());
    expect(json).toContain('shadowCommits');
    expect(json).not.toContain('ownerClass');
    w.scene = 'reward';
    expect(commitShadow(w, p, ab, 'a3', p.pos, right)).toBe(false);
  });
  it('provides an actual compatible Forge starting receiver for every first pick', () => {
    for (const skill of skills) {
      setForgeSeed(7);
      const { w, p, b } = setup(skill);
      const ab = Object.values(p.abilities!).find(resolvedShadowCommit)!;
      expect(ab).toBeDefined();
      resolvePlayerAbility(w, p, ab.slot, zero);
      expect(p.shadowCommits).toHaveLength(1);
      expect(b.hp).toBe(10000);
      tickShadowCommits(w, 0.6);
      expect(p.shadowCommits).toHaveLength(0);
      setForgeSeed(null);
    }
  });
  it('can synthesize and price the component through actual donor selection', () => {
    const ab = previewAbilityTable('monk', ['mo_shadow_g_b']).a3;
    const donors = Object.values(CLASSES).flatMap((c) =>
      Object.values(c.abilities).map((def) => ({
        classId: c.id,
        className: c.name,
        name: def.name,
        slot: def.slot,
        def,
      })),
    );
    donors.push({
      classId: 'monk',
      className: 'Monk',
      name: 'Committed Palm',
      slot: 'a3',
      def: ab,
    });
    let found = false;
    for (let seed = 0; seed < 200; seed++) {
      const syn = synthesizeAbility(seed, 'shadow-contract', 'a3', donors);
      if (resolvedShadowCommit(syn.def)) {
        found = true;
        expect(syn.def.castTime ?? 0).toBe(0);
        expect(syn.def.cooldown).toBeGreaterThan(0);
        expect(describeAbility(syn.def)).toContain('after 0.6s');
        break;
      }
    }
    expect(found).toBe(true);
  });
  it('draws both actual prepared footprints and a distinct stationary pending silhouette', () => {
    const { w, p } = setup();
    const g = new Graphics();
    use(w, p, 'a1');
    use(w, p, 'a3');
    for (const c of shadowCommitViews(w, p)!) {
      drawShadowCommit(g, c, (v) => v, 1, true);
      drawShadowCommit(g, { ...c, remaining: 0 }, (v) => v, 0.6, false);
    }
    expect(g.context.instructions.length).toBeGreaterThan(10);
    g.destroy();
  });
});

it('intercepts a foe entering the saved cone after launch while the live body is out of reach', () => {
  const { w, p, b } = setup();
  b.pos = { x: 750, y: 400 };
  input(w, { a1: true });
  const origin = { ...p.shadowCommits![0].origin };
  expect(b.hp).toBe(10000);
  for (let i = 0; i < 55; i++) input(w, {}, left);
  expect(p.pos.x).toBeLessThan(origin.x - 100);
  expect(b.hp).toBe(10000);
  // A pursuer now enters the already committed footprint, after the body has withdrawn.
  b.pos = { x: origin.x + 80, y: origin.y };
  for (let i = 0; i < 8; i++) input(w, {}, left);
  expect(b.hp).toBeLessThan(10000);
  expect(b.pos.x - p.pos.x).toBeGreaterThan((p.abilities!.a1.range ?? 70) + b.radius);
  expect(p.shadowCommits).toHaveLength(0);
});
