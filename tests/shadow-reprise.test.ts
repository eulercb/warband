import { afterEach, describe, expect, it } from 'vitest';
import { World } from '../src/engine/world/world';
import { abilityForSlot, resolvePlayerAbility } from '../src/engine/combat/abilities';
import { applyBuff, damageBoss, damageEcho, makeBuff } from '../src/engine/combat/combat';
import {
  onShadowRepriseHit,
  recordShadowReprise,
  resolvedShadowReprise,
  shadowRepriseView,
  tickShadowReprise,
  tryShadowReturn,
} from '../src/engine/combat/shadowReprise';
import {
  componentValue,
  decompose,
  recompose,
  refreshComponents,
  synthesizeAbility,
  setForgeSeed,
} from '../src/engine/content/forge';
import { describeAbility, getClass } from '../src/engine/content/classes';
import type { ExtSlot, InputCommand, Player } from '../src/engine/core/types';
import { describeCharOffer, previewAbilityTable } from '../src/engine/content/charUpgrades';
import { drawShadowAnchor } from '../src/render/pipeline/shadowVisuals';
import type { Graphics } from 'pixi.js';

afterEach(() => setForgeSeed(null));
const zero = { x: 0, y: 0 };
function setup(skill = 'ro_assassin_strike', upgrades = ['ro_assassin_g_a']) {
  const w = new World({
    monsterId: 'lich',
    seed: 31,
    players: [
      { peerId: 'a', name: 'A', classId: 'rogue', charUpgrades: upgrades, subSkills: [skill] },
    ],
  });
  w.scene = null;
  w.obstacles = [];
  w.terrain = [];
  const p = w.players[0],
    boss = w.boss!;
  p.pos = { x: 500, y: 400 };
  p.aim = { x: 1, y: 0 };
  p.critChance = 0;
  boss.pos = { x: 800, y: 400 };
  boss.hp = boss.maxHp = 10000;
  boss.moveSpeed = 0;
  boss.decisionTimer = 100;
  return { w, p, boss };
}
function use(w: World, p: Player, slot: ExtSlot, fresh = true) {
  (
    w as unknown as { tryUseAbility(p: Player, s: ExtSlot, d: typeof zero, f: boolean): void }
  ).tryUseAbility(p, slot, zero, fresh);
}
function hit(w: World, p: Player, prepared = true, amount = 10, cast = { spent: false }) {
  return damageBoss(w, p, w.boss!, amount, { direct: true, prepared, pilot: { cast } });
}
function armed() {
  const s = setup();
  use(s.w, s.p, 'a2');
  hit(s.w, s.p);
  s.w.tick++;
  expect(s.p.shadowReprise?.armedTick).toBeDefined();
  return s;
}
function step(w: World, buttons: Partial<InputCommand['buttons']> = {}, autofire = false) {
  w.step(
    0.05,
    new Map([
      [
        'a',
        {
          seq: w.tick,
          move: zero,
          aim: { x: 1, y: 0 },
          autofire,
          buttons: { basic: false, a1: false, a2: false, a3: false, revive: false, ...buttons },
        },
      ],
    ]),
  );
}

describe('Shadow Reprise combat contract', () => {
  it('earns a voluntary return from a later lethal prepared hit without recasting or refunding', () => {
    const { w, p, boss } = setup();
    const anchor = { ...p.pos };
    use(w, p, 'a2');
    expect(p.pos).not.toEqual(anchor);
    expect(shadowRepriseView(w, p)).toMatchObject({ armed: false, anchor });
    const cd = p.cooldowns.a2,
      locks = structuredClone(p.rechargeLocks),
      buffs = structuredClone(p.buffs);
    boss.hp = 1;
    hit(w, p);
    expect(boss.hp).toBeLessThanOrEqual(0);
    expect(shadowRepriseView(w, p)).toMatchObject({ armed: true, returnRemaining: 2 });
    use(w, p, 'a2');
    expect(p.pos).not.toEqual(anchor); // same-tick chord cannot return
    w.tick++;
    use(w, p, 'a2');
    expect(p.pos).toEqual(anchor);
    expect(p.shadowReprise).toBeUndefined();
    expect(p.cooldowns.a2).toBe(cd);
    expect(p.rechargeLocks).toEqual(locks);
    expect(p.buffs).toEqual(buffs);
    expect(w.events.filter((e) => e.t === 'cast')).toHaveLength(1);
    expect(w.events.filter((e) => e.t === 'blink')).toHaveLength(2);
  });
  it('rejects unprepared, same-cast, zero, immune, and supplemental damage', () => {
    const { w, p, boss } = setup();
    use(w, p, 'a2');
    const r = p.shadowReprise!;
    hit(w, p, false);
    hit(w, p, true, 10, r.cast);
    onShadowRepriseHit(w, p, 0, true, { cast: { spent: false } });
    onShadowRepriseHit(w, p, 5, true);
    applyBuff(boss, makeBuff('invuln', 0, 2, 'test'));
    hit(w, p);
    damageEcho(w, p, boss, 10);
    expect(r.armedTick).toBeUndefined();
    boss.buffs = [];
    hit(w, p);
    expect(r.armedTick).toBeDefined();
    const remaining = r.returnRemaining;
    hit(w, p);
    expect(r.returnRemaining).toBe(remaining);
  });
  it.each([false, true])(
    'requires release and a fresh edge after earning readiness, autofire=%s',
    (autofire) => {
      const { w, p } = setup();
      const anchor = { ...p.pos };
      step(w, { a2: true }, autofire);
      expect(p.shadowReprise).toBeDefined();
      hit(w, p);
      const away = { ...p.pos };
      step(w, { a2: true }, autofire);
      expect(p.pos).toEqual(away);
      step(w, {}, autofire);
      step(w, { a2: true }, autofire);
      expect(p.pos).toEqual(anchor);
      expect(p.cooldowns.a2).toBeGreaterThan(0);
    },
  );
  it('a press before the hit cannot be buffered into a later return', () => {
    const { w, p } = setup();
    step(w, { a2: true });
    step(w, {});
    step(w, { a2: true });
    hit(w, p);
    const away = { ...p.pos };
    step(w, { a2: true }, true);
    expect(p.pos).toEqual(away);
    step(w, {});
    step(w, { a2: true });
    expect(p.pos).toEqual({ x: 500, y: 400 });
  });
  it.each(['root', 'silence', 'stun'] as const)(
    'shows %s and preserves readiness on a blocked press',
    (kind) => {
      const { w, p } = armed();
      applyBuff(p, makeBuff(kind, 0, 1, 'test'));
      expect(shadowRepriseView(w, p)?.blocked?.toLowerCase()).toBe(
        kind === 'root' ? 'rooted' : kind === 'stun' ? 'stunned' : 'silenced',
      );
      const away = { ...p.pos };
      use(w, p, 'a2');
      expect(p.pos).toEqual(away);
      expect(p.shadowReprise).toBeDefined();
      p.buffs = [];
      use(w, p, 'a2');
      expect(p.pos).toEqual({ x: 500, y: 400 });
    },
  );
  it('blocks casting, forced movement and excessive distance without spending the anchor', () => {
    const { w, p } = armed();
    p.castTimer = 1;
    expect(shadowRepriseView(w, p)?.blocked).toBe('Casting');
    use(w, p, 'a2');
    expect(p.shadowReprise).toBeDefined();
    p.castTimer = 0;
    p.shove = { vx: 1, vy: 0, remaining: 1 };
    expect(shadowRepriseView(w, p)?.blocked).toBe('Moving');
    use(w, p, 'a2');
    expect(p.shadowReprise).toBeDefined();
    p.shove = null;
    p.pos.x = 900;
    expect(shadowRepriseView(w, p)?.blocked).toBe('Out of range');
    use(w, p, 'a2');
    expect(p.shadowReprise).toBeDefined();
    p.pos.x = 700;
    use(w, p, 'a2');
    expect(p.pos.x).toBe(500);
  });
  it('bounds the armed window by anchor lifetime, expires once, and cannot rearm', () => {
    const { w, p } = setup();
    use(w, p, 'a2');
    tickShadowReprise(w, 5.5);
    hit(w, p);
    expect(p.shadowReprise?.returnRemaining).toBe(0.5);
    tickShadowReprise(w, 0.51);
    expect(p.shadowReprise).toBeUndefined();
    hit(w, p);
    expect(p.shadowReprise).toBeUndefined();
    const s = armed();
    tickShadowReprise(s.w, 2.01);
    expect(s.p.shadowReprise).toBeUndefined();
  });
  it.each(['down', 'dead', 'class', 'skill', 'contract', 'room', 'cooldown', 'hp'] as const)(
    'clears on %s and cannot resurrect after restoration',
    (reason) => {
      const { w, p } = armed();
      const source = abilityForSlot(p, 'a2')!;
      if (reason === 'down') p.state = 'downed';
      if (reason === 'dead') p.state = 'dead';
      if (reason === 'class') p.classId = 'bard';
      if (reason === 'skill') p.abilities!.a2 = { ...source };
      if (reason === 'contract') delete source.shadowReprise;
      if (reason === 'room') w.scene = 'reward';
      if (reason === 'cooldown') p.cooldowns.a2 = 0;
      if (reason === 'hp') p.hp = 0;
      expect(shadowRepriseView(w, p)).toBeUndefined();
      tickShadowReprise(w, 0);
      expect(p.shadowReprise).toBeUndefined();
      p.state = 'alive';
      p.classId = 'rogue';
      p.hp = 100;
      w.scene = null;
      p.cooldowns.a2 = 10;
      hit(w, p);
      expect(p.shadowReprise).toBeUndefined();
    },
  );
  it('lets an ordinary recast resume when cooldown finishes; invalid state never hijacks another slot', () => {
    const { w, p } = armed();
    expect(tryShadowReturn(w, p, 'a1', true)).toBe(false);
    p.cooldowns.a2 = 0;
    use(w, p, 'a2');
    expect(p.pos.x).toBeGreaterThan(750);
    expect(p.shadowReprise?.armedTick).toBeUndefined();
  });
  it.each(['ro_assassin_strike', 'ro_assassin_throw', 'ro_assassin_poison', 'ro_assassin_smoke'])(
    'has a lone-boss route with first pick %s',
    (skill) => {
      const { w, p, boss } = setup(skill);
      if (skill.endsWith('poison') || skill.endsWith('smoke')) use(w, p, 'sub1');
      use(w, p, 'a2');
      boss.pos = { x: p.pos.x + 35, y: p.pos.y };
      if (skill.endsWith('strike')) use(w, p, 'sub1');
      else if (skill.endsWith('throw')) {
        use(w, p, 'sub1');
        for (const shot of w.projectiles) shot.pos = { ...boss.pos };
        (w as unknown as { updateProjectiles(dt: number): void }).updateProjectiles(0);
      } else use(w, p, 'a1');
      expect(p.shadowReprise?.armedTick).toBeDefined();
    },
  );
  it('does not give One with Shadow or an unrelated hero a free return', () => {
    const { w, p } = setup('ro_assassin_poison', ['ro_assassin_g_b']);
    use(w, p, 'a2');
    expect(p.buffs.some((b) => b.kind === 'venomReady')).toBe(true);
    hit(w, p);
    expect(p.shadowReprise).toBeUndefined();
  });
  it('treats a missing owning cooldown as expired and uses contract reach when a copied blink omits range', () => {
    const { w, p } = setup();
    delete p.abilities!.a2.range;
    use(w, p, 'a2');
    expect(p.shadowReprise?.range).toBe(p.abilities!.a2.shadowReprise!.range);
    delete (p.cooldowns as Partial<typeof p.cooldowns>).a2;
    hit(w, p);
    expect(p.shadowReprise?.armedTick).toBeUndefined();
    tickShadowReprise(w, 0);
    expect(p.shadowReprise).toBeUndefined();
  });
  it('keeps two owners independent when allies hit the same boss', () => {
    const w = new World({
      monsterId: 'lich',
      seed: 31,
      players: ['a', 'b'].map((peerId) => ({
        peerId,
        name: peerId,
        classId: 'rogue' as const,
        charUpgrades: ['ro_assassin_g_a'],
        subSkills: ['ro_assassin_strike'],
      })),
    });
    w.scene = null;
    w.obstacles = [];
    w.terrain = [];
    w.boss!.hp = w.boss!.maxHp = 10000;
    for (const p of w.players) {
      p.pos = { x: 500, y: 400 };
      p.aim = { x: 1, y: 0 };
      use(w, p, 'a2');
    }
    const [a, b] = w.players;
    hit(w, b);
    expect(b.shadowReprise?.armedTick).toBeDefined();
    expect(a.shadowReprise?.armedTick).toBeUndefined();
    hit(w, a);
    w.tick++;
    use(w, b, 'a2');
    expect(b.shadowReprise).toBeUndefined();
    expect(a.shadowReprise?.armedTick).toBeDefined();
  });
  it('serializes only public readiness and a copied departure point', () => {
    const { w, p } = armed();
    const view = w.serialize().players[0].shadowReprise!;
    expect(view).toMatchObject({ slot: 'a2', armed: true, prepared: true });
    expect(Object.keys(view).sort()).toEqual([
      'anchor',
      'armed',
      'blocked',
      'prepared',
      'remaining',
      'returnRemaining',
      'slot',
    ]);
    view.anchor.x = 0;
    expect(p.shadowReprise!.anchor.x).toBe(500);
  });
});

describe('Reprise component and portability', () => {
  it('installs a real portable effect when the identity is applied to an active Forge kit', () => {
    setForgeSeed(47);
    const { w, p } = setup();
    const ab = p.abilities!.a2;
    expect(ab.components).toBeDefined();
    expect(resolvedShadowReprise(ab)?.prepared).toBe(false);
    expect(describeAbility(ab)).toContain('later direct hit');
    expect(describeCharOffer('rogue', [], 'ro_assassin_g_a')?.desc).toContain(
      'A later direct hit unlocks',
    );
    p.cooldowns.a2 = 8;
    resolvePlayerAbility(w, p, 'a2', zero);
    expect(p.shadowReprise).toBeDefined();
    p.pos = { ...p.shadowReprise!.anchor, x: p.shadowReprise!.anchor.x + 50 };
    hit(w, p, false);
    w.tick++;
    use(w, p, 'a2');
    expect(p.shadowReprise).toBeUndefined();
  });
  it.each([
    ['ro_assassin_g_a', 'hy_pyromancer'],
    ['hy_pyromancer', 'ro_assassin_g_a'],
  ])('native identity never leaks onto a live graft: %j', (...history) => {
    const { w, p } = setup('ro_assassin_strike', history);
    expect(p.abilities!.a2.name).toBe('Fireball');
    expect(resolvedShadowReprise(p.abilities!.a2)).toBeUndefined();
    use(w, p, 'a2');
    expect(p.shadowReprise).toBeUndefined();
    const restored = setup('ro_assassin_strike', [...history, 'restore:a2']);
    expect(resolvedShadowReprise(restored.p.abilities!.a2)?.prepared).toBe(true);
    use(restored.w, restored.p, 'a2');
    expect(restored.p.shadowReprise).toBeDefined();
  });
  it('roundtrips, prices, refreshes, and describes the real contract', () => {
    const native = previewAbilityTable('rogue', ['ro_assassin_g_a']).a2;
    const c = decompose(native),
      effect = c.effects.find((e) => e.kind === 'shadowReprise')!;
    expect(effect.kind).toBe('shadowReprise');
    expect(componentValue(c)).toBeGreaterThan(
      componentValue({ ...c, effects: c.effects.filter((e) => e !== effect) }),
    );
    const copied = recompose(c, native);
    expect(copied.shadowReprise).toEqual(native.shadowReprise);
    expect(decompose(copied)).toEqual(c);
    expect(describeAbility(native)).toContain('later prepared direct hit');
    expect(describeAbility(copied)).toContain('later prepared direct hit');
    copied.shadowReprise!.lifetime = 5;
    copied.components = refreshComponents(copied);
    expect(resolvedShadowReprise(copied)?.lifetime).toBe(5);
    copied.components.effects = copied.components.effects.filter((e) => e.kind !== 'shadowReprise');
    expect(resolvedShadowReprise(copied)).toBeUndefined(); // no phantom flat field
  });
  it('actual synthesis makes an honest, capped portable component that works without donor precision', () => {
    const native = previewAbilityTable('rogue', ['ro_assassin_g_a']).a2;
    const nonblink = { ...getClass('rogue').abilities.a3, shadowReprise: native.shadowReprise };
    let fused: ReturnType<typeof synthesizeAbility> | undefined;
    for (let seed = 0; seed < 100; seed++) {
      const candidate = synthesizeAbility(seed, 'reprise', 'a2', [
        {
          name: 'Smoke',
          classId: 'rogue',
          className: 'Rogue',
          slot: 'a2',
          def: { ...nonblink, shadowReprise: undefined },
        },
        {
          name: 'Anchor',
          classId: 'rogue',
          className: 'Rogue',
          slot: 'a3',
          def: {
            name: 'Anchor',
            damage: 0,
            kind: 'selfBuff',
            cooldown: 8,
            shadowReprise: native.shadowReprise,
          },
        },
      ]);
      if (resolvedShadowReprise(candidate.def)) {
        fused = candidate;
        break;
      }
    }
    expect(fused).toBeDefined();
    const ab = fused!.def,
      r = resolvedShadowReprise(ab)!;
    expect(r.prepared).toBe(false);
    expect(r.lifetime).toBeLessThanOrEqual(6);
    expect(r.returnWindow).toBeLessThanOrEqual(2);
    expect(describeAbility(ab)).toContain('later direct hit');
    const { w, p } = setup('ro_assassin_strike', []);
    p.abilities!.a2 = ab;
    use(w, p, 'a2');
    expect(p.shadowReprise?.anchor).toEqual({ x: 500, y: 400 });
    p.pos.x += 100;
    hit(w, p, false, 10, p.shadowReprise!.cast);
    expect(p.shadowReprise!.armedTick).toBeUndefined();
    hit(w, p, false);
    w.tick++;
    use(w, p, 'a2');
    expect(p.pos.x).toBe(500);
    expect(p.buffs.some((b) => b.kind === 'precision')).toBe(false);
    const copy = recompose(decompose(ab), ab);
    expect(resolvedShadowReprise(copy)).toEqual(r);
    const basic = synthesizeAbility(7, 'basic', 'basic', [
      { name: 'Reprise', classId: 'rogue', className: 'Rogue', slot: 'basic', def: nonblink },
    ]);
    expect(resolvedShadowReprise(basic.def)).toBeUndefined();
  });
  it('a retained prepared component on a copied blink excludes its own cast and uses actual reach', () => {
    const { w, p } = setup('ro_assassin_strike', []);
    p.abilities!.a2 = recompose(
      decompose(previewAbilityTable('rogue', ['ro_assassin_g_a']).a2),
      getClass('rogue').abilities.a2,
    );
    use(w, p, 'a2');
    expect(p.shadowReprise?.range).toBe(p.abilities!.a2.range);
    hit(w, p, true, 10, p.shadowReprise!.cast);
    expect(p.shadowReprise?.armedTick).toBeUndefined();
    hit(w, p);
    w.tick++;
    use(w, p, 'a2');
    expect(p.pos.x).toBe(500);
  });
  it('does not record failed/irrelevant resolutions', () => {
    const { w, p } = setup();
    const ab = { ...p.abilities!.a2, pilotCast: { spent: false } };
    recordShadowReprise(w, p, ab, 'a2', p.pos);
    expect(p.shadowReprise).toBeUndefined();
    recordShadowReprise(w, p, ab, 'basic', zero);
    expect(p.shadowReprise).toBeUndefined();
    w.scene = 'reward';
    recordShadowReprise(w, p, ab, 'a2', zero);
    expect(p.shadowReprise).toBeUndefined();
    w.scene = null;
    p.hp = 0;
    recordShadowReprise(w, p, ab, 'a2', zero);
    expect(p.shadowReprise).toBeUndefined();
    p.hp = 100;
    resolvePlayerAbility(w, p, 'basic', zero);
    expect(p.shadowReprise).toBeUndefined();
  });
  it('draws waiting, available and blocked public markers with no host token', () => {
    const g = {
      moveTo: () => g,
      lineTo: () => g,
      closePath: () => g,
      stroke: () => g,
    } as unknown as Graphics;
    const { w, p } = armed();
    const view = shadowRepriseView(w, p)!;
    drawShadowAnchor(g, view, zero, 1, true, { x: 100, y: 0 });
    drawShadowAnchor(g, view, zero, 1, true, zero);
    drawShadowAnchor(g, { ...view, armed: false, remaining: 0.5 }, zero, 0.5, false);
    drawShadowAnchor(g, { ...view, blocked: 'Rooted' }, zero, 1, true);
  });
});
