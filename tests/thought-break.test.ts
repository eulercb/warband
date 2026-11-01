import { emptyGrandLoadout, changeGrand } from '../src/engine/content/grandSelections';
import { afterEach, describe, expect, it } from 'vitest';
import { World } from '../src/engine/world/world';
import { resolvePlayerAbility } from '../src/engine/combat/abilities';
import {
  applyBuff,
  damageBoss,
  damageAdd,
  damageEcho,
  makeBuff,
  tickBuffs,
} from '../src/engine/combat/combat';
import { consumeSpellSurge } from '../src/engine/combat/spellCombos';
import { getClass, describeAbility, resolvedThoughtBreak } from '../src/engine/content/classes';
import {
  componentValue,
  decompose,
  recompose,
  refreshComponents,
  setForgeSeed,
  synthesizeAbility,
} from '../src/engine/content/forge';
import {
  previewAbilityTable,
  previewSubAbility,
  describeCharOffer,
} from '../src/engine/content/charUpgrades';
import { BOSS_RECOVER_TIME } from '../src/engine/core/constants';
import { buffView } from '../src/engine/core/buffView';
import { buffBadges } from '../src/render/overlays/buffGlyphs';
import { enemyDebuffs, drawEnemyDebuffSymbol } from '../src/render/pipeline/enemyDebuffs';
import type { Add, ExtSlot, Player, ThoughtBreakCast, MonsterId } from '../src/engine/core/types';
import type { Graphics } from 'pixi.js';
const zero = { x: 0, y: 0 };
afterEach(() => setForgeSeed(null));
function setup(
  skill = 'wa_goo_blast',
  grands = ['wa_great_old_one_g_b'],
  monsterId: MonsterId = 'lich',
) {
  const w = new World({
    seed: 31,
    monsterId,
    players: [
      { peerId: 'a', name: 'A', classId: 'warlock', charUpgrades: grands, subSkills: [skill] },
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
  return { w, p, b };
}
function use(w: World, p: Player, slot: ExtSlot) {
  (w as unknown as { tryUseAbility(p: Player, s: ExtSlot, d: typeof zero): void }).tryUseAbility(
    p,
    slot,
    zero,
  );
}
function windup(w: World, channel = false) {
  const b = w.boss!,
    ab = w.monsterDef.abilities[0];
  b.action = {
    ...b.action,
    kind: channel ? 'channel' : 'windup',
    abilityId: ab.id,
    remaining: 3,
    total: 3,
    targetId: w.players[0].id,
    targetPos: { ...w.players[0].pos },
  };
  return ab;
}
function impact(w: World) {
  for (const s of w.projectiles) s.pos = { ...w.boss!.pos };
  (w as unknown as { updateProjectiles(dt: number): void }).updateProjectiles(0);
}
const token = (): ThoughtBreakCast => ({ spent: false, ownerClass: 'warlock' });
function hit(w: World, p: Player, t = token(), amount = 10) {
  damageBoss(w, p, w.boss!, amount, { direct: true, thoughtBreak: t });
  return t;
}

describe('Native Whispered Doom committed-action break', () => {
  it.each(['wa_goo_blast', 'wa_goo_tentacle', 'wa_goo_whispers', 'wa_goo_flee'])(
    'has a real solo-boss route with first pick %s',
    (skill) => {
      const { w, p, b } = setup(skill);
      const ab = windup(w);
      if (skill === 'wa_goo_blast' || skill === 'wa_goo_tentacle') use(w, p, 'a3');
      else use(w, p, 'sub1');
      expect(p.buffs.some((x) => x.kind === 'spellSurge')).toBe(true);
      use(w, p, skill === 'wa_goo_blast' || skill === 'wa_goo_tentacle' ? 'sub1' : 'a2');
      impact(w);
      expect(b.action.kind).toBe('recover');
      expect(b.action.abilityId).toBeNull();
      expect(b.action.remaining).toBe(BOSS_RECOVER_TIME);
      expect(b.cooldowns[ab.id]).toBeGreaterThan(0);
      expect(b.buffs.some((x) => x.kind === 'thoughtBreakRecovery')).toBe(true);
      expect(w.serialize().bosses[0].telegraph).toBeNull();
      expect(w.events.some((e) => e.t === 'cast' && e.ability === 'Thought broken')).toBe(true);
    },
  );
  it('basics preserve preparation, unsurgered hits do not cancel, and the prepared instant Rebuke retains +20% damage', () => {
    const { w, p, b } = setup('wa_goo_flee');
    windup(w);
    use(w, p, 'a2');
    expect(b.action.kind).toBe('windup');
    p.cooldowns.a2 = 0;
    use(w, p, 'a3');
    use(w, p, 'basic');
    impact(w);
    expect(p.buffs.some((x) => x.kind === 'spellSurge')).toBe(true);
    expect(b.action.kind).toBe('windup');
    const before = b.hp;
    use(w, p, 'a2');
    expect(before - b.hp).toBeCloseTo(30 * 1.3 * 1.2);
    expect(b.action.kind).toBe('recover');
    expect(p.buffs.some((x) => x.kind === 'spellSurge')).toBe(false);
  });
  it('an expired preparation cannot interrupt, while a normal stun preserves the same queued attack', () => {
    const { w, p, b } = setup();
    windup(w);
    use(w, p, 'a3');
    tickBuffs(p, 8.1);
    use(w, p, 'a2');
    expect(b.action.kind).toBe('windup');
    applyBuff(b, makeBuff('stun', 0, 1, 'test'));
    const remaining = b.action.remaining;
    w.step(0.1, new Map());
    expect(b.action.kind).toBe('windup');
    expect(b.action.remaining).toBe(remaining);
  });
  it('missing spends readiness without cancelling an attack', () => {
    const { w, p, b } = setup();
    windup(w);
    use(w, p, 'a3');
    b.pos.y += 300;
    use(w, p, 'sub1');
    expect(p.buffs.some((x) => x.kind === 'spellSurge')).toBe(false);
    expect(b.action.kind).toBe('windup');
    expect(w.projectiles[0].thoughtBreakCast).toBeDefined();
  });
  it.each(['idle', 'recover'] as const)('does not interrupt a boss in %s', (kind) => {
    const { w, p, b } = setup();
    b.action.kind = kind;
    const t = hit(w, p);
    expect(t.spent).toBe(false);
    expect(b.buffs.some((x) => x.kind === 'thoughtBreakRecovery')).toBe(false);
  });
  it('breaks an actual channel and cannot cause another old channel tick', () => {
    const { w, p, b } = setup('wa_goo_blast', ['wa_great_old_one_g_b'], 'beholder');
    const beam = w.monsterDef.abilities.find((a) => a.shape === 'beam')!;
    windup(w, true);
    b.action.abilityId = beam.id;
    b.action.channelAccum = 0.49;
    const hp = p.hp;
    hit(w, p);
    w.step(0.1, new Map());
    expect(b.action.kind).toBe('recover');
    expect(p.hp).toBe(hp);
    expect(b.cooldowns[beam.id]).toBeGreaterThan(0);
  });
  it('sets the cancelled ability’s ordinary cooldown and keeps unrelated cooldowns', () => {
    const { w, p, b } = setup();
    const ab = windup(w);
    b.cooldowns.other = 7;
    const normal = (
      w as unknown as { bossCooldown(target: typeof b, d: typeof w.monsterDef, n: number): number }
    ).bossCooldown(b, w.monsterDef, ab.cooldown);
    hit(w, p);
    expect(b.cooldowns[ab.id]).toBe(normal);
    expect(b.cooldowns.other).toBe(7);
  });
  it('keeps already emitted projectiles, zones and independent pending hazards', () => {
    const { w, p, b } = setup();
    windup(w);
    resolvePlayerAbility(w, p, 'a1', zero);
    resolvePlayerAbility(w, p, 'basic', zero);
    w.addPendingStrike({ pos: { x: 1000, y: 800 }, radius: 40, fuse: 2, damage: 10 });
    const shots = [...w.projectiles],
      zones = [...w.groundZones],
      pending = [...w.pendingStrikes];
    hit(w, p);
    expect(w.projectiles).toEqual(shots);
    expect(w.groundZones).toEqual(zones);
    expect(w.pendingStrikes).toEqual(pending);
    expect(b.action.kind).toBe('recover');
  });
  it('uses target-global eight-second recovery across owners and preserves normal control behavior', () => {
    const { w, p, b } = setup();
    windup(w);
    const t = hit(w, p);
    expect(t.spent).toBe(true);
    windup(w);
    const other = token();
    hit(w, p, other);
    expect(other.spent).toBe(false);
    expect(b.action.kind).toBe('windup');
    tickBuffs(b, 8.01);
    hit(w, p, other);
    expect(other.spent).toBe(true);
    expect(b.action.kind).toBe('recover');
  });
  it('a real two-boss burst shares one cancellation token', () => {
    const { w, p, b } = setup();
    windup(w);
    const second = structuredClone(b);
    second.id = w.allocId();
    second.pos = { x: 650, y: 400 };
    w.bosses.push(second);
    use(w, p, 'a3');
    use(w, p, 'a2');
    expect(b.action.kind).toBe('recover');
    expect(second.action.kind).toBe('windup');
    expect(w.events.filter((e) => e.t === 'cast' && e.ability === 'Thought broken')).toHaveLength(
      1,
    );
  });
  it('a second native owner cannot chain a cancellation through shared boss recovery', () => {
    const { w, p, b } = setup();
    const ally = setup().p;
    ally.id = w.allocId();
    ally.peerId = 'b';
    ally.pos = { x: 500, y: 450 };
    w.players.push(ally);
    windup(w);
    use(w, p, 'a3');
    use(w, p, 'a2');
    windup(w);
    b.action.abilityId = w.monsterDef.abilities[1].id;
    use(w, ally, 'a3');
    use(w, ally, 'a2');
    expect(b.action.kind).toBe('windup');
    expect(w.events.filter((e) => e.t === 'cast' && e.ability === 'Thought broken')).toHaveLength(
      1,
    );
  });
  it.each([0, 5])(
    'Haste and %s Honed ranks preserve spell recovery and the interruption contract',
    (rank) => {
      const { w, p, b } = setup('wa_goo_blast', [
        'wa_great_old_one_g_b',
        ...Array<string>(rank).fill('subup_wa_goo_blast'),
      ]);
      p.cooldownMult = 0.1;
      windup(w);
      use(w, p, 'a3');
      use(w, p, 'sub1');
      impact(w);
      expect(b.action.kind).toBe('recover');
      expect(p.cooldowns.sub1).toBeGreaterThanOrEqual(4);
      expect(p.cooldowns.a3).toBeGreaterThanOrEqual(8);
    },
  );
  it('a merely banked identity never installs Thought Break until selected', () => {
    const a = 'wa_great_old_one_g_a',
      b = 'wa_great_old_one_g_b',
      context = { classes: ['warlock' as const], history: [], subSkills: ['wa_goo_blast'] };
    let state = changeGrand(
      emptyGrandLoadout(),
      context,
      { classId: 'warlock', id: a, action: 'earn' },
      true,
    )!;
    state = changeGrand(state, context, { classId: 'warlock', id: b, action: 'earn' }, true)!;
    const make = (grandLoadout: typeof state) =>
      new World({
        seed: 31,
        monsterId: 'lich',
        players: [
          {
            peerId: 'a',
            name: 'A',
            classId: 'warlock',
            charUpgrades: [a, b],
            subSkills: ['wa_goo_blast'],
            grandLoadout,
          },
        ],
      }).players[0];
    expect(make(state).abilities!.a2.surgeRider?.interrupt).toBeUndefined();
    state = changeGrand(state, context, {
      classId: 'warlock',
      id: b,
      action: 'equip',
      replace: a,
    })!;
    expect(make(state).abilities!.a2.surgeRider?.interrupt).toBe(true);
  });
  it('one resolved cast can cancel only one boss across all recipients', () => {
    const { w, p, b } = setup();
    windup(w);
    const t = hit(w, p);
    expect(t.spent).toBe(true);
    windup(w);
    b.buffs = [];
    hit(w, p, t);
    expect(b.action.kind).toBe('windup');
  });
  it.each(['zero', 'immune', 'lethal', 'down', 'hp', 'class', 'room', 'unknown'] as const)(
    'fails safely for %s',
    (reason) => {
      const { w, p, b } = setup();
      windup(w);
      const t = token();
      if (reason === 'immune') applyBuff(b, makeBuff('invuln', 0, 2, 'test'));
      if (reason === 'lethal') b.hp = 1;
      if (reason === 'down') p.state = 'downed';
      if (reason === 'hp') p.hp = 0;
      if (reason === 'class') p.classId = 'mage';
      if (reason === 'room') w.scene = 'reward';
      if (reason === 'unknown') b.action.abilityId = 'missing';
      hit(w, p, t, reason === 'zero' ? 0 : 10);
      expect(t.spent).toBe(false);
      expect(b.action.kind).toBe('windup');
    },
  );
  it('supplemental and add hits never manufacture boss cancellation', () => {
    const { w, p, b } = setup();
    windup(w);
    damageEcho(w, p, b, 10);
    damageBoss(w, p, b, 10);
    expect(b.action.kind).toBe('windup');
    const a = {
      ...b,
      id: w.allocId(),
      pos: { ...b.pos },
      hp: 1000,
      maxHp: 1000,
      buffs: [],
      targetId: p.id,
      attackCd: 0,
      moveSpeed: 0,
    } as unknown as Add;
    w.adds.push(a);
    const t = token();
    damageAdd(w, p, a, 10, { direct: true, thoughtBreak: t });
    expect(t.spent).toBe(false);
    expect(a.buffs.some((x) => x.kind === 'thoughtBreakRecovery')).toBe(false);
  });
  it('keeps the prepared payload’s shared token through native fan and piercing impacts', () => {
    const { w, p, b } = setup();
    windup(w);
    p.subAbilities!.sub1 = { ...p.subAbilities!.sub1!, projCount: 3, spreadDeg: 12, pierce: 1 };
    use(w, p, 'a3');
    use(w, p, 'sub1');
    const fan = [...w.projectiles],
      t = fan[0].thoughtBreakCast!;
    expect(fan).toHaveLength(3);
    expect(fan.every((x) => x.thoughtBreakCast === t)).toBe(true);
    impact(w);
    expect(t.spent).toBe(true);
    expect(b.action.kind).toBe('recover');
    expect(w.events.filter((e) => e.t === 'cast' && e.ability === 'Thought broken')).toHaveLength(
      1,
    );
  });
  it('Mind Blast grand adds coverage after every Honed rank without repeating duration', () => {
    for (const n of [0, 1, 5]) {
      const ids = Array<string>(n).fill('subup_wa_goo_blast');
      const normal = previewSubAbility('wa_goo_blast', ids)!,
        grand = previewSubAbility('wa_goo_blast', [...ids, 'wa_goo_blast_g'])!;
      expect(grand.cursePayoff).toBe(normal.cursePayoff);
      expect(grand.pierce).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('Thought Break copy, Forge and public feedback', () => {
  it('values and describes the conditional rider, and upgrade refresh keeps its native condition before copying', () => {
    const native = previewAbilityTable('warlock', ['wa_great_old_one_g_b']).a2,
      c = decompose(native);
    const without = {
      ...c,
      effects: c.effects.map((e) =>
        e.kind === 'surgeStrike' ? { ...e, rider: { ...e.rider, interrupt: undefined } } : e,
      ),
    };
    expect(componentValue(c)).toBeGreaterThan(componentValue(without));
    expect(describeAbility({ ...native, components: c })).toContain('boss hit can break');
    const refreshed = refreshComponents({ ...native, components: c });
    const rider = refreshed.effects.find((e) => e.kind === 'surgeStrike');
    expect(rider?.kind === 'surgeStrike' && rider.rider?.interrupt).toBe(true);
  });
  it('copies the conditional native payload into a priced self-contained component, without a Surge bonus', () => {
    const native = previewAbilityTable('warlock', ['wa_great_old_one_g_b']).a2;
    expect(native.surgeRider?.interrupt).toBe(true);
    expect(describeAbility(native)).toContain('wind-up or channel');
    const copied = recompose(decompose(native), native);
    expect(copied.consumesSurge).toBeUndefined();
    expect(resolvedThoughtBreak(copied)).toBe(true);
    const c = decompose(copied);
    expect(componentValue(c)).toBeGreaterThan(
      componentValue({ ...c, effects: c.effects.filter((e) => e.kind !== 'thoughtBreak') }),
    );
    expect(describeAbility(copied)).toContain('no Surge required');
    const { w, p, b } = setup('wa_goo_flee', []);
    p.subclassPassiveId = undefined;
    p.abilities!.a2 = copied;
    windup(w);
    use(w, p, 'a2');
    expect(b.action.kind).toBe('recover');
    expect(p.buffs.some((x) => x.kind === 'spellSurge')).toBe(false);
    copied.components = refreshComponents(copied);
    expect(resolvedThoughtBreak(copied)).toBe(true);
    expect(decompose(recompose(c, copied))).toEqual(c);
    copied.components.effects = copied.components.effects.filter((e) => e.kind !== 'thoughtBreak');
    expect(resolvedThoughtBreak(copied)).toBe(false);
  });
  it('merging native and standalone donor routes prices one actual interruption contract', () => {
    const native = previewAbilityTable('warlock', ['wa_great_old_one_g_b']).a2,
      c = decompose(native);
    c.effects.push({ kind: 'thoughtBreak' });
    const copy = recompose(c, native),
      simple = recompose(decompose(native), native);
    expect(copy.components!.effects.filter((e) => e.kind === 'thoughtBreak')).toHaveLength(1);
    expect(componentValue(decompose(copy))).toBe(componentValue(decompose(simple)));
    for (let seed = 0; seed < 30; seed++) {
      const out = synthesizeAbility(seed, 'mixed-thought', 'a2', [
        {
          name: 'Anchor',
          classId: 'warlock',
          className: 'Warlock',
          slot: 'a2',
          def: { ...getClass('warlock').abilities.a2, rebukeDuration: undefined },
        },
        { name: 'Native', classId: 'warlock', className: 'Warlock', slot: 'sub1', def: native },
        { name: 'Copy', classId: 'warlock', className: 'Warlock', slot: 'sub2', def: simple },
      ]).def;
      expect(
        out.components!.effects.filter((e) => e.kind === 'thoughtBreak').length,
      ).toBeLessThanOrEqual(1);
    }
  });
  it('actual synthesis keeps a standalone effect and excludes it from random basics', () => {
    const native = previewAbilityTable('warlock', ['wa_great_old_one_g_b']).a2;
    let found;
    for (let seed = 0; seed < 100; seed++) {
      const s = synthesizeAbility(seed, 'thought', 'a2', [
        {
          name: 'Strike',
          classId: 'warlock',
          className: 'Warlock',
          slot: 'a2',
          def: { ...getClass('warlock').abilities.a2, rebukeDuration: undefined },
        },
        { name: 'Doom', classId: 'warlock', className: 'Warlock', slot: 'sub1', def: native },
      ]).def;
      if (resolvedThoughtBreak(s)) {
        found = s;
        break;
      }
    }
    expect(found).toBeDefined();
    if (!found) throw new Error('No Thought Break output');
    expect(describeAbility(found)).toContain('no Surge required');
    const { w, p, b } = setup('wa_goo_flee', []);
    p.abilities!.a2 = found;
    windup(w);
    use(w, p, 'a2');
    expect(b.action.kind).toBe('recover');
    const basic = synthesizeAbility(5, 'basic', 'basic', [
      { name: 'Doom', classId: 'warlock', className: 'Warlock', slot: 'basic', def: { ...found } },
    ]).def;
    expect(resolvedThoughtBreak(basic)).toBe(false);
  });
  it('actual Forge has a carrier with every first pick, including a basic fallback for utility starting specials', () => {
    let fallback = false;
    for (const skill of ['wa_goo_blast', 'wa_goo_tentacle', 'wa_goo_whispers', 'wa_goo_flee']) {
      for (const seed of [7, 47, 4242]) {
        setForgeSeed(seed);
        const { w, p, b } = setup(skill);
        const carrier = resolvedThoughtBreak(p.abilities!.a2) ? 'a2' : 'basic';
        expect(resolvedThoughtBreak(p.abilities![carrier])).toBe(true);
        fallback ||= carrier === 'basic';
        expect(describeCharOffer('warlock', [], 'wa_great_old_one_g_b')?.desc).toContain(
          'without Surge preparation',
        );
        windup(w);
        resolvePlayerAbility(w, p, carrier, zero);
        impact(w);
        if (
          p.abilities![carrier].kind === 'pbaoe' ||
          p.abilities![carrier].kind === 'meleeCone' ||
          p.abilities![carrier].kind === 'projectile'
        )
          expect(b.action.kind).toBe('recover');
      }
    }
    expect(fallback).toBe(true);
  });
  it('native utility prep and unrelated Surge users retain the shared damage/cast-time contract', () => {
    const { p } = setup();
    applyBuff(p, makeBuff('spellSurge', 1.2, 8, 'test'));
    const ab = { ...getClass('warlock').abilities.a2, consumesSurge: true, castTime: 1 };
    const consumed = consumeSpellSurge(p, ab);
    expect(consumed.damage).toBe(ab.damage * 1.2);
    expect(consumed.castTime).toBe(0.5);
    expect(consumed.thoughtBreakCast).toBeUndefined();
  });
  it('a graft does not receive native Rebuke’s rider; reclaim restores it', () => {
    for (const history of [
      ['wa_great_old_one_g_b', 'hy_pyromancer'],
      ['hy_pyromancer', 'wa_great_old_one_g_b'],
    ]) {
      expect(previewAbilityTable('warlock', history).a2.surgeRider?.interrupt).toBeUndefined();
      expect(
        previewAbilityTable('warlock', [...history, 'restore:a2']).a2.surgeRider?.interrupt,
      ).toBe(true);
    }
  });
  it('public resistance is visible without leaking cast tokens', () => {
    const { w, p, b } = setup();
    windup(w);
    hit(w, p);
    const view = w.serialize().bosses[0].buffs.find((x) => x.kind === 'thoughtBreakRecovery')!;
    expect(view).toEqual(buffView(b.buffs.find((x) => x.kind === 'thoughtBreakRecovery')!));
    expect(JSON.stringify(view)).not.toContain('ownerClass');
    expect(buffBadges([view])[0].label).toContain('Thought Break recovery');
    expect(enemyDebuffs([view], p.id)[0].kind).toBe('thoughtBreakRecovery');
    const g = {
      circle: () => g,
      moveTo: () => g,
      lineTo: () => g,
      stroke: () => g,
    } as unknown as Graphics;
    drawEnemyDebuffSymbol(g, 'thoughtBreakRecovery', 0, 0, 5, 0xffffff);
  });
});
