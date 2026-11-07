import { emptyGrandLoadout, changeGrand } from '../src/engine/content/grandSelections';
import { drawProjectedShield } from '../src/render/pipeline/defenseVisuals';
import type { Graphics } from 'pixi.js';
import { getMonster } from '../src/engine/content/monsters';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { World } from '../src/engine/world/world';
import { resolveBossAbility } from '../src/engine/combat/abilities';
import { applyBuff, damagePlayer, makeBuff, tickBuffs } from '../src/engine/combat/combat';
import { grantFrontGuard } from '../src/engine/combat/defense';
import {
  previewAbilityTable,
  previewSubAbility,
  describeCharOffer,
} from '../src/engine/content/charUpgrades';
import {
  componentValue,
  decompose,
  recompose,
  refreshComponents,
  setForgeSeed,
  synthesizeAbility,
} from '../src/engine/content/forge';
import { getClass, describeAbility, resolvedFrontGuard } from '../src/engine/content/classes';
import { buffBadges } from '../src/render/overlays/buffGlyphs';
import type { ExtSlot, Player, Projectile } from '../src/engine/core/types';
const bolt = structuredClone(getMonster('lich').abilities.find((a) => a.shape === 'projectile')!);
const A = 'kn_champion_g_a',
  B = 'kn_champion_g_b';
const skills = [
  'kn_champion_slam',
  'kn_champion_charge',
  'kn_champion_rally',
  'kn_champion_riposte',
];
const zero = { x: 0, y: 0 };
afterEach(() => setForgeSeed(null));
function setup(skill = skills[0], upgrades = [A]) {
  const w = new World({
    seed: 31,
    monsterId: 'lich',
    players: [
      {
        peerId: 'a',
        name: 'Champion',
        classId: 'knight',
        charUpgrades: upgrades,
        subSkills: [skill],
      },
      { peerId: 'b', name: 'Ally', classId: 'knight', charUpgrades: [A], subSkills: [skills[0]] },
    ],
  });
  w.scene = null;
  w.obstacles = [];
  w.terrain = [];
  const p = w.players[0],
    ally = w.players[1],
    b = w.boss!;
  p.pos = { x: 500, y: 400 };
  p.aim = { x: 1, y: 0 };
  p.critChance = 0;
  ally.pos = { x: 450, y: 440 };
  ally.aim = { x: 1, y: 0 };
  b.pos = { x: 600, y: 400 };
  b.hp = b.maxHp = 10000;
  b.moveSpeed = 0;
  b.decisionTimer = 100;
  return { w, p, ally, b };
}
function use(w: World, p: Player, slot: ExtSlot = 'a2') {
  (w as unknown as { tryUseAbility(p: Player, s: ExtSlot, d: typeof zero): void }).tryUseAbility(
    p,
    slot,
    zero,
  );
}
function shot(w: World, changes: Partial<Projectile> = {}) {
  const b = w.boss!,
    ab = bolt;
  resolveBossAbility(w, b, ab, {
    ...b.action,
    targetId: w.players[0].id,
    targetPos: { ...w.players[0].pos },
    aimAngle: Math.PI,
  });
  const s = w.projectiles.pop()!;
  Object.assign(
    s,
    {
      pos: { x: 650, y: 440 },
      vel: { x: -300, y: 0 },
      damage: 20,
      lifetime: 4,
      rangeLeft: 1200,
      slowMult: 0.5,
      slowDuration: 2,
    },
    changes,
  );
  w.projectiles.push(s);
  return s;
}
function step(w: World, dt = 0.5) {
  (w as unknown as { updateProjectiles(n: number): void }).updateProjectiles(dt);
}
function allyBehind(w: World, p: Player) {
  const ally = w.players.find((x) => x !== p)!;
  ally.pos = { x: p.pos.x - 100, y: p.pos.y + 40 };
}
function guard(p: Player) {
  return p.buffs.find((b) => b.kind === 'frontGuard');
}

describe('Unbroken Champion projected shield', () => {
  it.each(skills)(
    'all first picks %s protect at full health then spend the existing counter',
    (skill) => {
      const { w, p, ally, b } = setup(skill);
      use(w, p, 'a1');
      expect(guard(p)?.mult).toBe(1);
      const s = shot(w);
      step(w);
      expect(w.projectiles).toHaveLength(0);
      expect(s.pos.x).toBeCloseTo(560 + s.hitRadius);
      expect(p.hp).toBe(p.maxHp);
      expect(ally.hp).toBe(ally.maxHp);
      expect(p.buffs.some((x) => x.kind === 'moveSpeed' && x.mult < 1)).toBe(false);
      expect(p.buffs.find((x) => x.kind === 'counter')?.mult).toBe(1.3);
      expect(w.events.some((e) => e.t === 'hit' && e.side === 'player')).toBe(false);
      const hp = b.hp;
      use(w, p, 'basic');
      expect(b.hp).toBeLessThan(hp);
      expect(p.buffs.some((x) => x.kind === 'counter')).toBe(false);
    },
  );
  it('removes a chilling shot before owner body contact rather than merely blocking its damage', () => {
    const { w, p } = setup();
    use(w, p);
    shot(w, { pos: { x: 650, y: 400 } });
    step(w);
    expect(p.hp).toBe(p.maxHp);
    expect(p.buffs.some((b) => b.source === 'bossSlow')).toBe(false);
    expect(guard(p)?.mult).toBe(1);
    const plain = setup(skills[0], []);
    use(plain.w, plain.p);
    shot(plain.w, { pos: { x: 550, y: 400 } });
    step(plain.w, 1 / 6);
    expect(plain.p.hp).toBe(plain.p.maxHp);
    expect(plain.p.buffs.some((b) => b.source === 'bossSlow')).toBe(true);
  });
  it('shares body blocks and projected interceptions, then stops protecting when exhausted', () => {
    const { w, p, ally } = setup();
    use(w, p);
    damagePlayer(w, p, 10, { x: 600, y: 400 });
    expect(guard(p)?.mult).toBe(1);
    shot(w);
    step(w);
    expect(guard(p)).toBeUndefined();
    shot(w);
    step(w, 2 / 3);
    expect(ally.hp).toBeLessThan(ally.maxHp);
  });
  it.each([false, true])(
    'a body ahead of the shield is hit first regardless of roster order (%s)',
    (reverse) => {
      const { w, p, ally } = setup();
      use(w, p);
      ally.pos = { x: 620, y: 440 };
      if (reverse) w.players.reverse();
      shot(w);
      step(w, 1);
      expect(ally.hp).toBeLessThan(ally.maxHp);
      expect(guard(p)?.mult).toBe(2);
    },
  );
  it('cover ahead absorbs the shot without spending a shield charge', () => {
    const { w, p } = setup();
    use(w, p);
    w.obstacles = [
      {
        id: 200,
        pos: { x: 610, y: 440 },
        radius: 12,
        height: 'tall',
      } as (typeof w.obstacles)[number],
    ];
    shot(w);
    step(w);
    expect(w.projectiles).toHaveLength(0);
    expect(guard(p)?.mult).toBe(2);
  });
  it('the shield intercepts before cover behind it', () => {
    const { w, p } = setup();
    use(w, p);
    w.obstacles = [
      {
        id: 200,
        pos: { x: 520, y: 440 },
        radius: 12,
        height: 'tall',
      } as (typeof w.obstacles)[number],
    ];
    const s = shot(w);
    step(w);
    expect(guard(p)?.mult).toBe(1);
    expect(s.pos.x).toBeCloseTo(560 + s.hitRadius);
  });
  it('competing shields choose the first contact, with stable owner-id ties', () => {
    for (const same of [false, true]) {
      const { w, p, ally } = setup();
      ally.pos = { x: same ? 500 : 530, y: 400 };
      use(w, p);
      use(w, ally);
      w.players.reverse();
      shot(w);
      step(w);
      expect(guard(same ? p : ally)?.mult).toBe(1);
      expect(guard(same ? ally : p)?.mult).toBe(2);
    }
  });
  it('a fast off-body shot cannot tunnel through the projected segment', () => {
    const { w, p } = setup();
    use(w, p);
    shot(w, { pos: { x: 1000, y: 440 }, vel: { x: -700, y: 0 } });
    step(w, 1);
    expect(w.projectiles).toHaveLength(0);
    expect(guard(p)?.mult).toBe(1);
  });
  it.each(['x', 'y'] as const)('the projected segment works across the %s torus seam', (axis) => {
    const { w, p, ally } = setup();
    ally.pos = { x: 900, y: 700 };
    use(w, p);
    if (axis === 'x') {
      p.pos = { x: 1580, y: 400 };
      shot(w, { pos: { x: 100, y: 440 }, vel: { x: -200, y: 0 } });
    } else {
      p.pos = { x: 500, y: 980 };
      p.aim = { x: 0, y: 1 };
      shot(w, { pos: { x: 540, y: 100 }, vel: { x: 0, y: -200 } });
    }
    step(w, 0.5);
    expect(w.projectiles).toHaveLength(0);
    expect(guard(p)?.mult).toBe(1);
  });
  it('rounded shield ends catch a graze but not a shot outside the segment', () => {
    const { w, p } = setup();
    use(w, p);
    shot(w, { pos: { x: 650, y: 466 } });
    step(w);
    expect(guard(p)?.mult).toBe(1);
    shot(w, { pos: { x: 650, y: 480 } });
    step(w);
    expect(guard(p)?.mult).toBe(1);
  });
  it.each(['rear', 'friendly', 'zero', 'aim', 'down', 'hp', 'class', 'room', 'expiry'] as const)(
    'bypasses safely for %s',
    (why) => {
      const { w, p, ally } = setup();
      ally.pos = { x: 900, y: 700 };
      use(w, p);
      const change: Partial<Projectile> = {};
      if (why === 'rear') {
        change.pos = { x: 500, y: 440 };
        change.vel = { x: 300, y: 0 };
      }
      if (why === 'friendly') change.side = 'player';
      if (why === 'zero') change.damage = 0;
      if (why === 'aim') p.aim = zero;
      if (why === 'down') p.state = 'downed';
      if (why === 'hp') p.hp = 0;
      if (why === 'class') p.classId = 'mage';
      if (why === 'room') w.scene = {} as typeof w.scene;
      if (why === 'expiry') tickBuffs(p, 4);
      shot(w, change);
      step(w);
      expect(guard(p)?.mult).toBe(why === 'expiry' ? undefined : 2);
      if (why === 'class' || why === 'down' || why === 'hp')
        expect(
          w
            .serialize()
            .players.find((x) => x.id === p.id)!
            .buffs.find((x) => x.kind === 'frontGuard')?.projectedGuard,
        ).toBeUndefined();
    },
  );
  it('physical interception still spends one charge during owner invulnerability', () => {
    const { w, p } = setup();
    use(w, p);
    applyBuff(p, makeBuff('invuln', 0, 2, 'test'));
    shot(w);
    step(w);
    expect(guard(p)?.mult).toBe(1);
  });
  it('zero-dt overlap on the face consumes only one block', () => {
    const { w, p } = setup();
    use(w, p);
    shot(w, { pos: { x: 560, y: 440 } });
    step(w, 0);
    step(w, 0);
    expect(guard(p)?.mult).toBe(1);
  });
  it('body hits already reached at shot origin cannot be rescued by a later shield', () => {
    const { w, p, ally } = setup();
    use(w, p);
    ally.pos = { x: 650, y: 440 };
    shot(w);
    step(w);
    expect(ally.hp).toBeLessThan(ally.maxHp);
    expect(guard(p)?.mult).toBe(2);
  });
  it('stronger guard precedence preserves one pool, not stacked projected charges', () => {
    const { w, p } = setup();
    use(w, p);
    grantFrontGuard(p, 1, 8);
    expect(guard(p)?.mult).toBe(2);
    expect(guard(p)?.projectedGuard).toBeDefined();
    grantFrontGuard(p, 4, 5);
    expect(guard(p)?.mult).toBe(4);
    expect(guard(p)?.projectedGuard).toBeUndefined();
    p.cooldowns.a2 = 0;
    use(w, p);
    expect(guard(p)?.mult).toBe(4);
    expect(guard(p)?.projectedGuard).toBeUndefined();
    expect(p.buffs.filter((x) => x.kind === 'frontGuard')).toHaveLength(1);
  });
  it('ordinary guard, Honed ranks, grands and the alternative identity remain separate', () => {
    const base = getClass('knight').abilities;
    const a = previewAbilityTable('knight', [A, 'kn_gk_a1_a', 'kn_gk_a2_a']);
    expect(a.a1.frontGuard?.charges).toBe(base.a1.frontGuard!.charges);
    expect(a.a1.absorption?.amount).toBe(30);
    expect(a.a2.allyWard?.mult).toBe(0.8);
    expect(a.a2.frontGuard?.projection).toEqual({ reach: 60, halfWidth: 60 });
    expect(previewAbilityTable('knight', [B]).a1.frontGuard?.projection).toBeUndefined();
    for (const skill of skills)
      for (const n of [0, 5]) {
        const history = [...Array<string>(n).fill(`subup_${skill}`), `${skill}_g`];
        const before = previewSubAbility(skill, history)!,
          after = previewSubAbility(skill, [A, ...history])!;
        expect(after.lifestealFrac).toBe(before.lifestealFrac);
      }
  });
  it('copies a self-contained projected shield without a Champion passive', () => {
    const native = previewAbilityTable('knight', [A]).a2;
    const copy = recompose(decompose(native), { slot: 'a2', name: 'Copied shield', cooldown: 16 });
    const { w, p } = setup(skills[0], []);
    p.classId = 'mage';
    p.subclassPassiveId = undefined;
    p.subSkillIds = [];
    p.subAbilities = {};
    p.abilities = structuredClone(getClass('mage').abilities);
    p.hp = p.maxHp = getClass('mage').maxHp;
    p.abilities.a2 = copy;
    use(w, p);
    shot(w);
    step(w);
    expect(guard(p)?.mult).toBe(1);
    expect(p.buffs.find((x) => x.kind === 'counter')?.mult).toBe(1.3);
    expect(describeAbility(copy)).toContain('intercept');
    const comp = decompose(copy),
      without = {
        ...comp,
        effects: comp.effects.map((e) =>
          e.kind === 'frontGuard' ? { ...e, projection: undefined } : e,
        ),
      };
    // Counter readiness is already priced on the charged guard; projection adds geometry.
    expect(componentValue(comp) - componentValue(without)).toBe(24);
    expect(
      refreshComponents(copy).effects.some((e) => e.kind === 'frontGuard' && e.projection),
    ).toBe(true);
  });
  it('actual synthesis prices and carries projection onto a direct receiving special', () => {
    const native = previewAbilityTable('knight', [A]).a2;
    let found;
    for (let seed = 0; seed < 100; seed++) {
      const out = synthesizeAbility(seed, 'projected', 'a2', [
        {
          name: 'Strike',
          classId: 'knight',
          className: 'Knight',
          slot: 'a2',
          def: { ...getClass('knight').abilities.basic },
        },
        { name: 'Shield', classId: 'knight', className: 'Knight', slot: 'sub1', def: native },
      ]).def;
      if (resolvedFrontGuard(out)?.projection) {
        found = out;
        break;
      }
    }
    expect(found).toBeDefined();
    if (!found) throw new Error('No projected shield synthesis');
    const { w, p } = setup(skills[0], []);
    p.abilities!.a2 = found;
    use(w, p);
    shot(w);
    step(w);
    expect(p.buffs.some((x) => x.kind === 'counter')).toBe(true);
  });
  it('actual Forge first picks have an explicit projected shield carrier', () => {
    for (const seed of [7, 47, 4242])
      for (const skill of skills) {
        setForgeSeed(seed);
        const { w, p } = setup(skill);
        use(w, p);
        expect(guard(p)?.projectedGuard).toBeDefined();
        expect(describeCharOffer('knight', [], A)?.desc).toContain(
          'first and second starting specials',
        );
        allyBehind(w, p);
        shot(w, { pos: { x: p.pos.x + 150, y: p.pos.y + 40 } });
        step(w);
        expect(
          p.buffs.some((x) => x.kind === 'counter'),
          `${seed}/${skill}`,
        ).toBe(true);
      }
  });
  it('component removal wins over stale flat projection, and graft reclaim restores only the native shield', () => {
    const native = previewAbilityTable('knight', [A]).a2;
    const copy = recompose(decompose(native), { slot: 'a2', name: 'Copy', cooldown: 16 });
    copy.components!.effects = copy.components!.effects.filter((e) => e.kind !== 'frontGuard');
    const { w, p } = setup(skills[0], []);
    p.abilities!.a2 = copy;
    use(w, p);
    expect(guard(p)).toBeUndefined();
    for (const history of [
      [A, 'hy_pyromancer'],
      ['hy_pyromancer', A],
    ]) {
      expect(previewAbilityTable('knight', history).a2.frontGuard?.projection).toBeUndefined();
      expect(
        previewAbilityTable('knight', [...history, 'restore:a2']).a2.frontGuard?.projection,
      ).toBeDefined();
    }
  });
  it('banked interception does not install until the exclusive identity is equipped', () => {
    const context = { classes: ['knight' as const], history: [], subSkills: [skills[0]] };
    let state = changeGrand(
      emptyGrandLoadout(),
      context,
      { classId: 'knight', id: B, action: 'earn' },
      true,
    )!;
    state = changeGrand(state, context, { classId: 'knight', id: A, action: 'earn' }, true)!;
    const make = () =>
      new World({
        seed: 31,
        monsterId: 'lich',
        players: [
          {
            peerId: 'a',
            name: 'A',
            classId: 'knight',
            charUpgrades: [A, B],
            subSkills: [skills[0]],
            grandLoadout: state,
          },
        ],
      }).players[0];
    expect(make().abilities!.a2.frontGuard?.projection).toBeUndefined();
    state = changeGrand(state, context, { classId: 'knight', id: A, action: 'equip', replace: B })!;
    expect(make().abilities!.a2.frontGuard?.projection).toBeDefined();
  });
  it.each([0, 5])(
    'Haste with %s Shield Wall ranks preserves its actual charges and lifetime',
    (rank) => {
      const { w, p } = setup(skills[0], [A, ...Array<string>(rank).fill('kn_bulwark')]);
      p.cooldownMult = 0.1;
      use(w, p);
      expect(guard(p)?.projectedGuard).toBeDefined();
      expect(guard(p)?.mult).toBe(rank ? 4 : 2);
      expect(guard(p)?.remaining).toBe(rank ? 8 : 4);
      expect(p.cooldowns.a2).toBeGreaterThanOrEqual(guard(p)!.remaining);
    },
  );
  it('projection is carried and capped as part of the priced guard component', () => {
    const native = previewAbilityTable('knight', [A]).a2;
    const copy = recompose(decompose(native), { slot: 'a2', name: 'Shield', cooldown: 16 });
    copy.frontGuard!.projection = { reach: 999, halfWidth: 999 };
    const capped = refreshComponents(copy),
      e = capped.effects.find((e) => e.kind === 'frontGuard')!;
    expect(e.kind === 'frontGuard' && e.projection).toEqual({ reach: 60, halfWidth: 60 });
    const withCounter = decompose({
      ...native,
      frontGuard: { ...native.frontGuard!, counter: 1.3 },
    });
    const without = {
      ...withCounter,
      effects: withCounter.effects.map((e) =>
        e.kind === 'frontGuard' ? { ...e, projection: undefined } : e,
      ),
    };
    expect(componentValue(withCounter) - componentValue(without)).toBe(24); // Counter value is not priced twice.
  });
  it.each(['expired', 'empty', 'behind', 'short', 'awayFromCorner'] as const)(
    'rejects a retained invalid guard or non-crossing path: %s',
    (why) => {
      const { w, p, ally } = setup();
      ally.pos = { x: 900, y: 700 };
      use(w, p);
      if (why === 'expired') guard(p)!.remaining = 0;
      if (why === 'empty') guard(p)!.mult = 0;
      const changes: Partial<Projectile> = {};
      let dt = 0.1;
      if (why === 'behind') changes.pos = { x: 540, y: 440 };
      if (why === 'awayFromCorner') changes.pos = { x: 549, y: 471 };
      if (why === 'expired' || why === 'empty') dt = 0.5;
      shot(w, changes);
      step(w, dt);
      expect(guard(p)?.mult).toBe(why === 'empty' ? 0 : 2);
    },
  );
  it('foreground geometry matches the actual projection and visibly loses charge pips', () => {
    const { w, p } = setup();
    use(w, p);
    const calls = { poly: vi.fn(), fill: vi.fn(), stroke: vi.fn(), circle: vi.fn() };
    const g = calls as unknown as Graphics;
    for (const key of ['poly', 'fill', 'stroke', 'circle'] as const) calls[key].mockReturnValue(g);
    drawProjectedShield(g, w.serialize().players[0], { x: 100, y: 100 }, 2);
    const points = calls.poly.mock.calls[0][0] as number[];
    expect(Math.min(...points.filter((_, i) => i % 2 === 0))).toBe(217);
    expect(Math.max(...points.filter((_, i) => i % 2 === 0))).toBe(223);
    expect(Math.min(...points.filter((_, i) => i % 2 === 1))).toBe(-20);
    expect(Math.max(...points.filter((_, i) => i % 2 === 1))).toBe(220);
    expect(calls.circle).toHaveBeenCalledTimes(2);
    shot(w);
    step(w);
    calls.circle.mockClear();
    drawProjectedShield(g, w.serialize().players[0], { x: 100, y: 100 }, 2);
    expect(calls.circle).toHaveBeenCalledTimes(1);
  });
  it.each(['missing', 'down', 'hp', 'aim'] as const)(
    'does not draw an unavailable projection: %s',
    (why) => {
      const { w, p } = setup();
      if (why !== 'missing') use(w, p);
      if (why === 'down') p.state = 'downed';
      if (why === 'hp') p.hp = 0;
      if (why === 'aim') p.aim = zero;
      const poly = vi.fn();
      drawProjectedShield(
        { poly } as unknown as Graphics,
        w.serialize().players[0],
        { x: 100, y: 100 },
        1,
      );
      expect(poly).not.toHaveBeenCalled();
    },
  );
  it('exposes geometry and charge readout without leaking source class provenance', () => {
    const { w, p } = setup();
    use(w, p);
    const view = w.serialize().players[0].buffs.find((x) => x.kind === 'frontGuard')!;
    expect(view.projectedGuard).toEqual({ reach: 60, halfWidth: 60 });
    expect(JSON.stringify(view)).not.toContain('Class');
    expect(buffBadges([view])[0].label).toContain('2 shared frontal blocks');
  });
});
