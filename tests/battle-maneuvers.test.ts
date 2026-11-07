import type { ButtonState } from '../src/engine/core/types';
import { Graphics } from 'pixi.js';
import { drawManeuverArrow } from '../src/render/pipeline/maneuverVisuals';
import { describe, expect, it, afterEach } from 'vitest';
import { World } from '../src/engine/world/world';
import {
  maneuverCast,
  onManeuverCast,
  onManeuverHit,
  tickManeuvers,
} from '../src/engine/combat/battleManeuvers';
import { applyBuff, makeBuff, damagePlayer } from '../src/engine/combat/combat';
import { grantFrontGuard } from '../src/engine/combat/defense';
import { onGuardedDamage } from '../src/engine/combat/martial';
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
const zero = { x: 0, y: 0 },
  down = { x: 0, y: 1 };
const skills = ['kn_battle_trip', 'kn_battle_menacing', 'kn_battle_precision', 'kn_battle_rally'];
afterEach(() => setForgeSeed(null));
function setup(mode: 'push' | 'step' = 'push', skill = skills[0]) {
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
  p.buffs = [];
  b.pos = { x: 600, y: 400 };
  b.hp = b.maxHp = 10000;
  b.moveSpeed = 0;
  b.decisionTimer = 100;
  const ab: PlayerAbilityDef = {
    ...(mode === 'push' ? getClass('knight').abilities.a3 : getClass('knight').abilities.a2),
    maneuver: { mode, distance: mode === 'push' ? 80 : 180 },
  };
  return { w, p, b, ab };
}
function input(w: World, move = zero, buttons: Partial<ButtonState> = {}, autofire = false) {
  return new Map([
    [
      'a',
      {
        seq: w.tick,
        move,
        aim: { x: 1, y: 0 },
        buttons: { basic: false, a1: false, a2: false, a3: false, revive: false, ...buttons },
        autofire,
      },
    ],
  ]);
}
function start(mode: 'push' | 'step', s: ReturnType<typeof setup>, move = down) {
  const cast = maneuverCast(s.p, s.ab, move);
  if (mode === 'push') onManeuverHit(s.w, s.p, s.b, 1, cast);
  else onManeuverCast(s.w, s.p, cast);
  return cast;
}

describe('direct controls available with every first pick', () => {
  it.each(skills)('native identities work without counters or targets with %s', (skill) => {
    for (const mode of ['push', 'step'] as const) {
      const s = setup(mode, skill),
        { w, p, b } = s;
      if (mode === 'step') b.pos = { x: 1200, y: 1000 };
      w.step(0.01, input(w, down, { [mode === 'push' ? 'a3' : 'a2']: true }));
      if (mode === 'push') {
        expect(b.maneuverMotion).toBeDefined();
        for (let i = 0; i < 4; i++) w.step(0.05, new Map());
        expect(b.pos.y).toBeCloseTo(480);
      } else {
        expect(p.glide?.remaining).toBe(180);
        expect(p.maneuverRecovery).toBe(6);
        const from = p.pos.y;
        stepPlayerGlide(w, p, 1);
        expect(p.pos.y).toBe(from + 180);
        expect(b.hp).toBe(10000);
      }
    }
  });
  it.each(['a1', 'a2', 'sub1'] as const)(
    'moving fresh utility %s steps without a hit at full health',
    (slot) => {
      const { w, p, b } = setup('step', slot === 'sub1' ? 'kn_battle_rally' : skills[0]);
      b.pos = { x: 1200, y: 1000 };
      resolvePlayerAbility(w, p, slot, down);
      tickManeuvers(w, 0);
      expect(p.glide?.remaining).toBe(180);
      expect(b.hp).toBe(10000);
      expect(p.hp).toBe(p.maxHp);
      expect(p.glide?.ab).toMatchObject({ damage: 0, range: 180 });
      expect(p.glide?.ab.iframes).toBeUndefined();
      expect(p.glide?.ab.landingDamage).toBeUndefined();
    },
  );
  it('stationary defense holds position and saves movement recovery; attacks never launch player', () => {
    const { w, p } = setup('step');
    resolvePlayerAbility(w, p, 'a2', zero);
    tickManeuvers(w, 0);
    expect(p.glide).toBeFalsy();
    expect(p.maneuverRecovery ?? 0).toBe(0);
    expect(p.buffs.some((b) => b.kind === 'frontGuard')).toBe(true);
    resolvePlayerAbility(w, p, 'a3', down);
    expect(p.maneuverStep).toBeUndefined();
  });
  it('autofire repeats defense without repeating footwork; releasing and pressing permits it', () => {
    const { w, p } = setup('step');
    w.step(0.01, input(w, down, { a2: true }, true));
    expect(p.glide).toBeTruthy();
    stepPlayerGlide(w, p, 1);
    p.maneuverRecovery = 0;
    p.cooldowns.a2 = 0;
    w.step(0.01, input(w, down, { a2: true }, true));
    expect(p.glide).toBeNull();
    expect(p.maneuverRecovery).toBe(0);
    w.step(0.01, input(w));
    p.cooldowns.a2 = 0;
    w.step(0.01, input(w, down, { a2: true }, true));
    expect(p.glide).toBeTruthy();
  });
  it('root keeps defense usable without spending movement recovery; silence prevents special cast', () => {
    const { w, p } = setup('step');
    applyBuff(p, makeBuff('root', 0, 3, 'test'));
    w.step(0.01, input(w, down, { a2: true }));
    expect(p.buffs.some((b) => b.kind === 'frontGuard')).toBe(true);
    expect(p.glide).toBeFalsy();
    expect(p.maneuverRecovery ?? 0).toBe(0);
    p.buffs = [makeBuff('silence', 0, 3, 'test')];
    p.cooldowns.a1 = 0;
    w.step(0.01, input(w, down, { a1: true }));
    expect(p.cooldowns.a1).toBe(0);
    expect(p.glide).toBeFalsy();
  });
  it('captures movement at button press through cast-time resolution', () => {
    const { w, p } = setup('step');
    p.abilities!.a2.castTime = 0.2;
    w.step(0.05, input(w, down, { a2: true }));
    expect(p.castTimer).toBeGreaterThan(0);
    for (let i = 0; i < 3; i++) w.step(0.1, input(w, { x: 0, y: -1 }));
    expect(p.glide?.dir).toEqual(down);
  });
});

describe('single-cast steering eligibility and lifecycle', () => {
  it('never requires a counter and does not consume its cast on an ineligible recipient', () => {
    const { w, p, b, ab } = setup();
    const cast = maneuverCast(p, ab, zero);
    b.maneuverRecovery = 2;
    onManeuverHit(w, p, b, 1, cast);
    expect(cast.spent).toBe(false);
    expect(w.toRenderState(p.id).players[0].maneuver?.phase).toBe('recovery');
    b.maneuverRecovery = 0;
    onManeuverHit(w, p, b, 1, cast);
    expect(b.maneuverMotion?.dir).toEqual({ x: 1, y: 0 });
    expect(cast.spent).toBe(true);
    const motion = b.maneuverMotion;
    onManeuverHit(w, p, b, 1, cast);
    expect(b.maneuverMotion).toBe(motion);
  });
  it.each(['zero', 'dead', 'root', 'steadfast', 'charm'] as const)(
    'does not spend request for %s target',
    (reason) => {
      const { w, p, b, ab } = setup();
      if (reason === 'dead') b.hp = 0;
      if (reason === 'root' || reason === 'steadfast') applyBuff(b, makeBuff(reason, 0, 2, 'test'));
      const target =
        reason === 'charm'
          ? { ...b, charm: { ownerId: p.id, ownerClass: p.classId, remaining: 2 } }
          : b;
      const cast = maneuverCast(p, ab, down);
      onManeuverHit(w, p, target, reason === 'zero' ? 0 : 1, cast);
      expect(cast.spent).toBe(false);
      expect(target.maneuverMotion).toBeUndefined();
    },
  );
  it.each(['scene', 'down', 'hp', 'class', 'epoch', 'noEffect', 'stepEffect'] as const)(
    'rejects stale/invalid %s hit',
    (reason) => {
      const { w, p, b, ab } = setup();
      const cast = maneuverCast(p, ab, down);
      if (reason === 'scene') w.scene = 'reward';
      if (reason === 'down') p.state = 'downed';
      if (reason === 'hp') p.hp = 0;
      if (reason === 'class') p.classId = 'mage';
      if (reason === 'epoch') p.maneuverEpoch = 1;
      if (reason === 'noEffect') cast.effect = undefined;
      if (reason === 'stepEffect') cast.effect = { mode: 'step', distance: 180 };
      onManeuverHit(w, p, b, 1, cast);
      expect(b.maneuverMotion).toBeUndefined();
    },
  );
  it('a real class swap invalidates delayed casts even after swapping back', () => {
    const { w, p, b, ab } = setup();
    const cast = maneuverCast(p, ab, down);
    w.requestClassSwap('a', 'mage');
    w.requestClassSwap('a', 'knight');
    onManeuverHit(w, p, b, 1, cast);
    expect(b.maneuverMotion).toBeUndefined();
  });
  it('actual basic cannot steer while a direct special needs only its first hit', () => {
    const { w, p, b } = setup();
    resolvePlayerAbility(w, p, 'basic', down);
    expect(b.maneuverMotion).toBeUndefined();
    resolvePlayerAbility(w, p, 'a3', down);
    expect(b.maneuverMotion?.dir).toEqual(down);
  });
  it('lethal special hit cannot move a corpse', () => {
    const { w, p, b } = setup();
    b.hp = 1;
    resolvePlayerAbility(w, p, 'a3', down);
    expect(b.hp).toBeLessThanOrEqual(0);
    expect(b.maneuverMotion).toBeUndefined();
  });
  it('same-cast interruption and knockback finish before steering starts', () => {
    const { w, p, b, ab } = setup();
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
    resolvePlayerAbility(w, p, 'a3', down, { ...ab, thoughtBreak: true, knockback: 100 });
    expect(b.action.kind).toBe('recover');
    expect(b.shove).toBeDefined();
    expect(b.maneuverMotion?.phase).toBe('queued');
    const from = { ...b.pos };
    w.step(0.05, new Map());
    expect(b.pos.y).toBe(from.y);
    for (let i = 0; i < 15; i++) w.step(0.05, new Map());
    expect(b.pos.y).toBeCloseTo(from.y + 80);
  });
});

describe('defensive movement safe launch and interruption', () => {
  it.each([
    'stationary',
    'repeat',
    'recovery',
    'root',
    'stun',
    'casting',
    'glide',
    'shove',
    'pending',
    'spent',
    'noEffect',
    'pushEffect',
  ] as const)('no movement request during %s', (reason) => {
    const s = setup('step'),
      { w, p, ab } = s;
    const cast = maneuverCast(p, ab, down);
    if (reason === 'stationary') cast.move = zero;
    if (reason === 'repeat') cast.fresh = false;
    if (reason === 'recovery') p.maneuverRecovery = 1;
    if (reason === 'root' || reason === 'stun') applyBuff(p, makeBuff(reason, 0, 2, 'test'));
    if (reason === 'casting') p.castTimer = 1;
    if (reason === 'glide') p.glide = { dir: down, remaining: 10, leap: false, ab };
    if (reason === 'shove') p.shove = { vx: 1, vy: 0, remaining: 1 };
    if (reason === 'pending') p.maneuverStep = { dir: down, distance: 1, ownerClass: p.classId };
    if (reason === 'spent') cast.spent = true;
    if (reason === 'noEffect') cast.effect = undefined;
    if (reason === 'pushEffect') cast.effect = { mode: 'push', distance: 80 };
    const existing = p.maneuverStep;
    onManeuverCast(w, p, cast);
    expect(p.maneuverStep).toBe(existing);
  });
  it.each(['down', 'hp', 'class', 'root', 'stun', 'glide', 'shove', 'casting'] as const)(
    'new %s between request and launch preserves recovery',
    (reason) => {
      const s = setup('step'),
        { w, p, ab } = s;
      start('step', s);
      if (reason === 'down') p.state = 'downed';
      if (reason === 'hp') p.hp = 0;
      if (reason === 'class') p.classId = 'mage';
      if (reason === 'root' || reason === 'stun') applyBuff(p, makeBuff(reason, 0, 2, 'test'));
      if (reason === 'glide') p.glide = { dir: down, remaining: 10, leap: false, ab };
      if (reason === 'shove') p.shove = { vx: 1, vy: 0, remaining: 1 };
      if (reason === 'casting') p.castTimer = 1;
      const old = p.glide;
      tickManeuvers(w, 0);
      expect(p.maneuverStep).toBeUndefined();
      expect(p.glide).toBe(old);
      expect(p.maneuverRecovery ?? 0).toBe(0);
    },
  );
  it.each(['root', 'stun', 'shove', 'lethal', 'swap'] as const)(
    'travel is interrupted by %s',
    (reason) => {
      const s = setup('step'),
        { w, p } = s;
      start('step', s);
      tickManeuvers(w, 0);
      if (reason === 'root' || reason === 'stun') applyBuff(p, makeBuff(reason, 0, 2, 'test'));
      if (reason === 'shove') p.shove = { vx: 100, vy: 0, remaining: 0.2 };
      if (reason === 'lethal') p.hp = 0;
      if (reason === 'swap') w.requestClassSwap('a', 'mage');
      const from = { ...p.pos };
      stepPlayerGlide(w, p, 0.05);
      expect(p.pos).toEqual(from);
      expect(p.glide).toBeNull();
    },
  );
  it.each(['push', 'step'] as const)('%s respects cover', (mode) => {
    const s = setup(mode),
      { w, p, b } = s;
    w.obstacles = [
      { id: 999, pos: { x: mode === 'push' ? 600 : 500, y: 460 }, radius: 10, kind: 'pillar' },
    ];
    start(mode, s);
    tickManeuvers(w, 0.2);
    if (mode === 'step') stepPlayerGlide(w, p, 1);
    expect((mode === 'push' ? b : p).pos.y).toBeLessThan(460);
  });
  it('footwork wraps through ordinary glide collision path', () => {
    const s = setup('step'),
      { w, p } = s;
    p.pos = { x: w.arena.w - 40, y: 400 };
    start('step', s, { x: 1, y: 0 });
    tickManeuvers(w, 0);
    stepPlayerGlide(w, p, 1);
    expect(p.pos.x).toBeCloseTo(140);
  });
});

describe('charged guard counters', () => {
  it('every Shield Wall charge readies a counter after spending the prior one', () => {
    const { w, p, b } = setup();
    resolvePlayerAbility(w, p, 'a2', zero);
    for (let i = 0; i < 2; i++) {
      const hp = p.hp;
      damagePlayer(w, p, 50, b.pos);
      expect(p.hp).toBe(hp);
      expect(p.buffs.find((b) => b.kind === 'counter')?.mult).toBe(1.3);
      resolvePlayerAbility(w, p, 'basic', zero);
      expect(p.buffs.some((b) => b.kind === 'counter')).toBe(false);
    }
    expect(p.buffs.some((b) => b.kind === 'frontGuard')).toBe(false);
  });
  it('late upgraded charged block keeps counter capability beyond four seconds', () => {
    const { w, p, b } = setup();
    grantFrontGuard(p, 3, 8, 1.3);
    const guard = p.buffs.find((b) => b.kind === 'frontGuard')!;
    guard.remaining = 2;
    damagePlayer(w, p, 10, b.pos);
    expect(p.buffs.find((b) => b.kind === 'counter')?.mult).toBe(1.3);
  });
  it('overlapping weaker pools preserve stronger charges and strongest counter', () => {
    const { p } = setup();
    grantFrontGuard(p, 4, 8);
    grantFrontGuard(p, 1, 4, 1.3);
    expect(p.buffs.find((b) => b.kind === 'frontGuard')).toMatchObject({
      mult: 4,
      remaining: 8,
      blockCounter: 1.3,
    });
    grantFrontGuard(p, 5, 8, 1.2);
    expect(p.buffs.find((b) => b.kind === 'frontGuard')?.blockCounter).toBe(1.3);
    p.buffs.push(makeBuff('counter', 1.8, 6, 'strong'), makeBuff('guard', 1.3, 4, 'guard'));
    onGuardedDamage(p);
    expect(p.buffs.filter((b) => b.kind === 'counter')).toHaveLength(1);
    expect(p.buffs.find((b) => b.kind === 'counter')).toMatchObject({ mult: 1.8, remaining: 6 });
  });
});

describe('same native and component activation contract', () => {
  it.each(['push', 'step'] as const)(
    '%s preserves price, cap, refresh and standalone copied behavior',
    (mode) => {
      const { ab } = setup(mode),
        comp = decompose(ab),
        copy = recompose(comp, ab);
      expect(copy.maneuver).toMatchObject({ mode });
      expect(describeAbility(copy)).not.toContain('mark');
      expect(componentValue(comp)).toBeGreaterThan(
        componentValue({ ...comp, effects: comp.effects.filter((e) => e.kind !== 'maneuver') }),
      );
      expect(refreshComponents(copy).effects.some((e) => e.kind === 'maneuver')).toBe(true);
      expect(
        refreshComponents({ ...ab, maneuver: { mode, distance: 999 } }).effects.find(
          (e) => e.kind === 'maneuver',
        ),
      ).toEqual({ kind: 'maneuver', mode, distance: mode === 'push' ? 80 : 180 });
      const { w, p, b } = setup(mode);
      p.classId = 'mage';
      p.subclassPassiveId = undefined;
      p.charUpgradeIds = [];
      p.abilities = structuredClone(getClass('mage').abilities);
      p.abilities.a1 = copy;
      resolvePlayerAbility(w, p, 'a1', down);
      tickManeuvers(w, 0);
      if (mode === 'push') expect(b.maneuverMotion).toBeDefined();
      else expect(p.glide).toBeDefined();
    },
  );
  it.each(['push', 'step'] as const)('actual synthesis retains standalone %s', (mode) => {
    const { ab } = setup(mode);
    let found: PlayerAbilityDef | undefined;
    for (let seed = 0; seed < 100 && !found; seed++) {
      const out = synthesizeAbility(seed, 'copy', 'a1', [
        { name: 'Receiver', classId: 'mage', className: 'Mage', slot: 'a1', def: ab },
        { name: 'Donor', classId: 'knight', className: 'Knight', slot: 'sub1', def: ab },
      ]).def;
      if (out.maneuver?.mode === mode) found = out;
    }
    expect(found).toBeDefined();
    if (!found) throw new Error('No synthesis');
    const { w, p, b } = setup(mode);
    p.classId = 'mage';
    p.subclassPassiveId = undefined;
    p.charUpgradeIds = [];
    p.abilities!.a1 = found;
    resolvePlayerAbility(w, p, 'a1', down);
    tickManeuvers(w, 0);
    if (mode === 'push') expect(b.maneuverMotion).toBeDefined();
    else expect(p.glide).toBeDefined();
  });
  it.each(skills)('ordinary/grand layers and both identities remain available for %s', (skill) => {
    for (const mode of ['push', 'step'] as const) {
      const id = mode === 'push' ? 'kn_battlemaster_g_a' : 'kn_battlemaster_g_b';
      const base = previewAbilityTable('knight', []),
        table = previewAbilityTable('knight', [id]);
      expect(table.basic.maneuver).toBeUndefined();
      expect(table.a1.absorption).toEqual(base.a1.absorption);
      for (const n of [0, 5]) {
        const ab = previewSubAbility(skill, [
          ...Array<string>(n).fill('subup_' + skill),
          skill + '_g',
          id,
        ])!;
        const expected =
          mode === 'push'
            ? ['kn_battle_trip', 'kn_battle_precision'].includes(skill)
            : ['kn_battle_menacing', 'kn_battle_rally'].includes(skill);
        expect(ab.maneuver?.mode).toBe(expected ? mode : undefined);
        expect(ab.cooldown).toBeGreaterThan(0);
      }
    }
  });
  it('actual Forge starting carriers exist for all first picks without attaching to basic', () => {
    for (const seed of [7, 47, 4242])
      for (const skill of skills)
        for (const mode of ['push', 'step'] as const) {
          setForgeSeed(seed);
          const { p } = setup(mode, skill);
          expect(p.abilities!.basic.maneuver).toBeUndefined();
          const carriers = Object.values(p.abilities!).filter((ab) => ab.maneuver?.mode === mode);
          expect(carriers.length).toBeGreaterThan(0);
          for (const ab of carriers) {
            expect(ab.components?.effects.some((e) => e.kind === 'maneuver')).toBe(true);
            expect(ab.cooldown).toBeGreaterThan(0);
          }
        }
  });
  it.each(['push', 'step'] as const)(
    '%s snapshot publishes readiness independent of counter state',
    (mode) => {
      const s = setup(mode),
        { w, p, b } = s;
      p.maneuverMove = down;
      expect(w.serialize().players[0].maneuver).toMatchObject({ mode, phase: 'ready' });
      if (mode === 'push') b.action.kind = 'windup';
      start(mode, s);
      if (mode === 'push') {
        expect(w.serialize().players[0].maneuver?.phase).toBe('queued');
        b.action.kind = 'recover';
      }
      tickManeuvers(w, 0.05);
      expect(w.serialize().players[0].maneuver?.phase).toBe(
        mode === 'push' ? 'travel' : 'recovery',
      );
      expect(JSON.stringify(w.serialize())).not.toContain('ownerEpoch');
      p.hp = 0;
      expect(w.serialize().players[0].maneuver).toBeUndefined();
    },
  );
  it('no equipped or historical payload means no misleading readiness', () => {
    const { w, p } = setup();
    p.abilities = undefined;
    p.subAbilities = { sub1: undefined };
    expect(w.serialize().players[0].maneuver).toBeUndefined();
  });
});
it.each(['windup', 'channel'] as const)(
  'keeps committed %s origin/aim/target unchanged then moves in recovery',
  (kind) => {
    const { w, p, b, ab } = setup();
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
    onManeuverHit(w, p, b, 10, maneuverCast(p, ab, { x: 0, y: 1 }));
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
  const { w, p, b, ab } = setup();
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
  onManeuverHit(w, p, b, 10, maneuverCast(p, ab, { x: 0, y: 1 }));
  w.step(0.1, new Map());
  expect(b.pos).toEqual({ x: 670, y: 400 });
  for (let i = 0; i < 4; i++) w.step(0.05, new Map());
  expect(b.pos).toEqual({ x: 670, y: 480 });
});

it('cancels deferred enemy motion if its owner is downed or the target rooted', () => {
  for (const cancel of ['down', 'root'] as const) {
    const { w, p, b, ab } = setup();
    b.action.kind = 'windup';
    onManeuverHit(w, p, b, 1, maneuverCast(p, ab, zero));
    if (cancel === 'down') p.state = 'downed';
    else applyBuff(b, makeBuff('root', 0, 3, 'test'));
    tickManeuvers(w, 0.1);
    expect(b.maneuverMotion).toBeUndefined();
    expect(b.pos).toEqual({ x: 600, y: 400 });
  }
});

it('shares target recovery across owners and waits for an existing shove', () => {
  const { w, p, b, ab } = setup();
  b.shove = { vx: 1, vy: 0, remaining: 0.2 };
  onManeuverHit(w, p, b, 1, maneuverCast(p, ab, zero));
  tickManeuvers(w, 0.1);
  expect(b.maneuverMotion?.phase).toBe('queued');
  b.shove = null;
  tickManeuvers(w, 0);
  expect(b.maneuverRecovery).toBe(6);
  const before = b.maneuverMotion;
  onManeuverHit(w, p, b, 1, maneuverCast(p, ab, { x: 0, y: -1 }));
  expect(b.maneuverMotion).toBe(before);
});

it('does not walk feared/lured adds during maneuver travel; conversion cancels it', () => {
  const { w, p, b, ab } = setup();
  b.pos = { x: 900, y: 800 };
  w.spawnAddWave({ x: 650, y: 400 }, 1, { minR: 0, maxR: 0 });
  const add = w.adds[0];
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
  onManeuverHit(w, p, add, 1, maneuverCast(p, ab, { x: 1, y: 0 }));
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
      const { w, p, b, ab } = setup();
      b.action.kind = phase === 'queued' ? 'windup' : 'idle';
      onManeuverHit(w, p, b, 1, maneuverCast(p, ab, zero));
      if (phase === 'travel') tickManeuvers(w, 0);
      if (reason === 'down') p.state = 'downed';
      if (reason === 'missing') w.players = [];
      if (reason === 'hp') p.hp = 0;
      if (reason === 'class') p.classId = 'mage';
      if (reason === 'epoch') p.maneuverEpoch = 1;
      if (reason === 'dead') b.hp = 0;
      if (reason === 'root' || reason === 'steadfast') applyBuff(b, makeBuff(reason, 0, 2, 'test'));
      tickManeuvers(w, 0.1);
      expect(b.maneuverMotion).toBeUndefined();
    }
  },
);

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

it('stationary overlapping centers use a deterministic away fallback instead of losing displacement', () => {
  const { w, p, b, ab } = setup();
  b.pos = { ...p.pos };
  onManeuverHit(w, p, b, 1, maneuverCast(p, ab, zero));
  tickManeuvers(w, 0.2);
  expect(b.pos.x).toBe(580);
});

it('two native owners cannot stack requests or reverse a foe during shared recovery', () => {
  const { w, p, b, ab } = setup();
  const other = structuredClone(p);
  other.id = 999;
  other.peerId = 'other';
  w.players.push(other);
  b.action.kind = 'windup';
  onManeuverHit(w, p, b, 1, maneuverCast(p, ab, { x: 0, y: 1 }));
  onManeuverHit(w, other, b, 1, maneuverCast(other, ab, { x: 0, y: -1 }));
  expect(b.maneuverMotion?.ownerId).toBe(p.id);
  b.action.kind = 'recover';
  tickManeuvers(w, 0.2);
  const pos = { ...b.pos };
  onManeuverHit(w, other, b, 1, maneuverCast(other, ab, { x: 0, y: -1 }));
  expect(b.pos).toEqual(pos);
  expect(b.maneuverMotion).toBeUndefined();
});

it('enemy maneuvers wrap across the seam and stop at the nearest copy of solid cover', () => {
  for (const obstacle of [false, true]) {
    const { w, p, b, ab } = setup();
    p.pos = { x: w.arena.w - 180, y: 400 };
    b.pos = { x: w.arena.w - 80, y: 400 };
    if (obstacle) w.obstacles = [{ id: 999, pos: { x: 20, y: 400 }, radius: 10, kind: 'pillar' }];
    onManeuverHit(w, p, b, 1, maneuverCast(p, ab, { x: 1, y: 0 }));
    tickManeuvers(w, 0.2);
    if (obstacle) {
      expect(b.pos.x).toBeGreaterThan(w.arena.w - 80);
      expect(b.pos.x).toBeLessThan(w.arena.w);
    } else expect(b.pos.x).toBeCloseTo(0);
  }
});

it.each(['idle', 'recover'] as const)(
  'reserves the next boss decision until existing forced movement finishes, from %s',
  (kind) => {
    const { w, p, b, ab } = setup();
    b.action.kind = kind;
    b.action.remaining = 0.01;
    b.decisionTimer = 0;
    b.shove = { vx: 10, vy: 0, remaining: 0.6 };
    onManeuverHit(w, p, b, 1, maneuverCast(p, ab, { x: 0, y: 1 }));
    w.step(0.1, new Map());
    expect(b.action.kind).toBe(kind);
    expect(b.maneuverMotion?.phase).toBe('queued');
    for (let i = 0; i < 8; i++) w.step(0.1, new Map());
    expect(b.pos.y).toBeCloseTo(480);
  },
);

it('a new shove pauses remaining enemy maneuver travel without applying two movement paths', () => {
  const { w, p, b, ab } = setup();
  onManeuverHit(w, p, b, 1, maneuverCast(p, ab, { x: 0, y: 1 }));
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
  const { w, p, b, ab } = setup();
  b.decisionTimer = 0;
  onManeuverHit(w, p, b, 1, maneuverCast(p, ab, { x: 0, y: 1 }));
  for (let i = 0; i < 11; i++) {
    b.shove = { vx: 1, vy: 0, remaining: 0.5 };
    w.step(0.1, new Map());
  }
  expect(b.maneuverMotion).toBeUndefined();
  expect(b.maneuverRecovery).toBeGreaterThan(5);
  expect(w.toRenderState(p.id).players[0].maneuver?.phase).toBe('recovery');
});

it('a Volley cast captures direction and can move only one foe across its blades', () => {
  const { w, b } = setup('push', 'kn_battle_precision');
  b.pos = { x: 800, y: 400 };
  w.step(0.01, input(w, down, { sub1: true }));
  expect(w.projectiles.length).toBeGreaterThan(0);
  expect(w.projectiles[0].maneuverCast?.move).toEqual(down);
  const cast = w.projectiles[0].maneuverCast!;
  for (const shot of w.projectiles) expect(shot.maneuverCast).toBe(cast);
  for (let i = 0; i < 40 && !b.maneuverMotion; i++) w.step(0.02, input(w, { x: 0, y: -1 }));
  expect(b.maneuverMotion?.dir).toEqual(down);
  expect(cast.spent).toBe(true);
});

it('copies use component-authoritative movement and never let a basic inherit steering', () => {
  const { w, p, b, ab } = setup();
  const comp = decompose(ab),
    copy = recompose(comp, ab);
  copy.maneuver = { mode: 'step', distance: 180 };
  const cast = maneuverCast(p, copy, down);
  expect(cast.effect?.mode).toBe('push');
  onManeuverHit(w, p, b, 1, cast);
  expect(b.maneuverMotion).toBeDefined();
  expect(maneuverCast(p, { ...copy, slot: 'basic' }, down).effect).toBeUndefined();
  delete copy.maneuver;
  expect(refreshComponents(copy).effects.some((e) => e.kind === 'maneuver')).toBe(true);
});

it('an unequipped old payload has no ready cue and class swaps clear an unlaunched step', () => {
  const s = setup('step'),
    { w, p } = s;
  start('step', s);
  p.abilities = undefined;
  p.subAbilities = undefined;
  expect(w.serialize().players[0].maneuver).toBeUndefined();
  w.requestClassSwap('a', 'mage');
  expect(p.maneuverStep).toBeUndefined();
});
