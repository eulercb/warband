import { afterEach, expect, it } from 'vitest';
import { World } from '../src/engine/world/world';
import { describeAbility } from '../src/engine/content/classes';
import {
  decompose,
  recompose,
  componentValue,
  refreshComponents,
  synthesizeAbility,
  setForgeSeed,
} from '../src/engine/content/forge';
import { guidedBurst, guideRelay } from '../src/engine/content/guidanceRules';
import {
  burstControls,
  burstViews,
  originView,
  tryDetonateBurst,
} from '../src/engine/combat/guidance';
import { damageBoss, damageAdd, makeBuff } from '../src/engine/combat/combat';
import type { Add, DirectCastToken, ExtSlot, InputCommand, Vec2 } from '../src/engine/core/types';
const zero = { x: 0, y: 0 },
  right = { x: 1, y: 0 },
  up = { x: 0, y: 1 };
afterEach(() => setForgeSeed(null));
function setup(mods = ['so_wild_g_b'], pick: string | string[] = 'so_wild_tides') {
  const w = new World({
    seed: 31,
    monsterId: 'lich',
    players: [
      {
        peerId: 'a',
        name: 'Crossing',
        classId: 'sorcerer',
        subSkills: Array.isArray(pick) ? pick : [pick],
        charUpgrades: mods,
        extraClasses: ['mage'],
      },
      { peerId: 'b', name: 'Ally', classId: 'sorcerer' },
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
  b.pos = { x: 1300, y: 700 };
  b.moveSpeed = 0;
  b.decisionTimer = 1000;
  b.hp = b.maxHp = 10000;
  w.players[1].pos = { x: 300, y: 700 };
  return { w, p, b };
}
function step(w: World, slot?: ExtSlot, aim: Vec2 = right, dt = 0.01, autofire = false) {
  const buttons: InputCommand['buttons'] = {
    basic: false,
    a1: false,
    a2: false,
    a3: false,
    revive: false,
  };
  if (slot) buttons[slot] = true;
  w.step(dt, new Map([['a', { seq: w.tick, move: zero, aim, buttons, autofire }]]));
}
function cast(w: World, slot: ExtSlot) {
  step(w, slot);
  for (let i = 0; i < 200 && w.players[0].castTimer > 0; i++) step(w);
}
it('Tides steers a non-contact nucleus, passes cover and bursts once for its explicit premium', () => {
  const { w, p, b } = setup();
  b.pos = { x: 580, y: 440 };
  w.obstacles = [{ id: w.allocId(), pos: { x: 530, y: 400 }, radius: 15 }];
  const hp = b.hp;
  step(w, 'sub1');
  const c = p.guidance!,
    origin = { ...p.pos },
    payload = c.burst!.payload;
  expect(b.hp).toBe(hp);
  expect(payload.damage).toBeCloseTo(p.subAbilities!.sub1!.damage * 1.15);
  expect(describeAbility(p.subAbilities!.sub1!)).toContain('46 dmg');
  expect(w.projectiles).toHaveLength(0);
  step(w, undefined, up, 0.3);
  expect(c.burst!.pos.y).toBeGreaterThan(origin.y);
  expect(b.hp).toBe(hp);
  step(w, 'sub1', up);
  expect(w.guidedBursts).toHaveLength(0);
  expect(b.hp).toBeCloseTo(hp - payload.damage);
  const after = b.hp;
  for (let i = 0; i < 140; i++) step(w);
  expect(b.hp).toBe(after);
});
it('an early fresh detonation queues for the exact minimum age, while held/autofire does not', () => {
  const { w, p, b } = setup();
  b.pos = { x: 545, y: 400 };
  step(w, 'sub1');
  for (let i = 0; i < 3; i++) step(w, 'sub1', right, 0.01, true);
  expect(p.guidance!.burst!.requested).toBe(false);
  step(w);
  step(w, 'sub1');
  expect(burstControls(w, p)[0].queued).toBe(true);
  const c = p.guidance!;
  step(w, undefined, right, 0.5);
  expect(c.burst!.age).toBeCloseTo(0.2);
  expect(c.burst!.pos.x).toBeCloseTo(548);
  expect(w.guidedBursts).toHaveLength(0);
  expect(b.hp).toBeLessThan(b.maxHp);
});
it('automatic detonation preserves one burst, source control, Surge radius and Gravitic pull', () => {
  const { w, p, b } = setup([
    'so_wild_g_b',
    'so_wild_tides_g',
    ...Array<string>(5).fill('subup_so_wild_tides'),
  ]);
  cast(w, 'a2');
  cast(w, 'sub1');
  const c = p.guidance!,
    payload = c.burst!.payload;
  expect(payload.radius).toBeGreaterThan(170);
  expect(payload.pull).toBe(140);
  expect(payload.castSlow).toBe(1.3);
  b.pos = { x: 780, y: 410 };
  const hp = b.hp;
  for (let i = 0; i < 130; i++) step(w);
  expect(w.guidedBursts).toHaveLength(0);
  expect(b.hp).toBeLessThan(hp);
  expect(b.buffs.some((b) => b.kind === 'castSlow')).toBe(true);
});
it('a newer guided shot takes steering, leaving the old nucleus ballistic until its one burst', () => {
  const { w, p } = setup();
  step(w, 'sub1');
  const old = p.guidance!;
  p.abilities!.a1.castTime = 0;
  step(w, 'a1');
  expect(p.guidance).not.toBe(old);
  const angle = old.angle;
  step(w, undefined, up, 0.1);
  expect(old.angle).toBe(angle);
  expect(burstViews(w)[0].guided).toBe(false);
  expect(tryDetonateBurst(w, p, 'sub1', true)).toBe(true);
  step(w, undefined, up, 0.2);
  expect(w.guidedBursts).toHaveLength(0);
  expect(p.guidance?.burst).toBeUndefined();
});
it.each(['silence', 'stun'] as const)(
  'manual detonation respects %s; automatic expiry stays bounded',
  (kind) => {
    const { w, p } = setup();
    step(w, 'sub1');
    p.buffs.push(makeBuff(kind, 0, 3, 'test'));
    expect(burstControls(w, p)[0].blocked).toBeTruthy();
    expect(tryDetonateBurst(w, p, 'sub1', true)).toBe(true);
    expect(p.guidance!.burst!.requested).toBe(false);
    for (let i = 0; i < 130; i++) step(w);
    expect(w.guidedBursts).toHaveLength(0);
  },
);
it.each(['down', 'class', 'source', 'finish'] as const)(
  'pending nuclei cancel without a burst on %s',
  (reason) => {
    const { w, p, b } = setup();
    b.pos = { x: 600, y: 400 };
    step(w, 'sub1');
    const source = p.subAbilities!.sub1!,
      hp = b.hp;
    if (reason === 'down') {
      p.hp = 0;
      step(w);
    }
    if (reason === 'class') {
      w.setActiveClass(p, 'mage');
      w.setActiveClass(p, 'sorcerer');
      step(w);
    }
    if (reason === 'source') {
      p.subAbilities!.sub1 = { ...source };
      step(w);
    }
    if (reason === 'finish') {
      w.finished = true;
      step(w);
    }
    expect(w.guidedBursts).toHaveLength(0);
    expect(b.hp).toBe(hp);
  },
);
it('a relayed nucleus with exhausted travel hovers until its remaining lifetime ends', () => {
  const { w, p } = setup();
  step(w, 'sub1');
  const c = p.guidance!;
  c.burst!.travelLeft = 0;
  const pos = { ...c.burst!.pos };
  step(w, undefined, up, 0.2);
  expect(c.burst!.pos).toEqual(pos);
  expect(c.remaining).toBeGreaterThan(0);
});
it('copied burst/relay effects are fitted, priced, refreshed and described through actual synthesis', () => {
  const { w, p } = setup();
  const native = p.subAbilities!.sub1!,
    comp = decompose(native);
  const no = componentValue({
    ...comp,
    effects: comp.effects.filter((e) => e.kind !== 'guidedBurst'),
  });
  expect(componentValue(comp) - no).toBeCloseTo(32 + native.damage * 0.15);
  w.setActiveClass(p, 'mage');
  p.abilities!.a1 = recompose(comp, { ...native, slot: 'a1' });
  p.cooldowns.a1 = 0;
  p.abilities!.a1.components = refreshComponents(p.abilities!.a1);
  cast(w, 'a1');
  expect(p.guidance?.burst?.payload.damage).toBeCloseTo(native.damage * 1.15);
  const phase = { ...p.abilities!.a3, guideRelay: true };
  const pc = decompose(phase);
  expect(
    componentValue(pc) -
      componentValue({ ...pc, effects: pc.effects.filter((e) => e.kind !== 'guideRelay') }),
  ).toBe(32);
  let burst, relay;
  for (let seed = 0; seed < 32 && (!burst || !relay); seed++) {
    const donors = [
      {
        name: 'Controlled',
        classId: 'sorcerer' as const,
        className: 'Sorcerer',
        slot: 'a1',
        def: native,
      },
      {
        name: 'Other',
        classId: 'mage' as const,
        className: 'Mage',
        slot: 'a1',
        def: { ...native, guidedBurst: undefined },
      },
    ];
    const made = synthesizeAbility(seed, 'nucleus', 'a1', donors, new Set(['pbaoe'])).def;
    if (guidedBurst(made)) burst = made;
    const blink = synthesizeAbility(
      seed,
      'relay',
      'a3',
      [{ name: 'Relay', classId: 'mage', className: 'Mage', slot: 'a3', def: phase }],
      new Set(['blink']),
    ).def;
    if (guideRelay(blink)) relay = blink;
  }
  if (!burst || !relay) throw new Error('Synthesis did not retain the required controllers');
  expect(describeAbility(burst)).toContain('+15%');
  expect(describeAbility(relay)).toContain('departure origin');
  p.abilities!.a3 = relay;
  p.cooldowns.a3 = 0;
  step(w, 'a3', right);
  const anchor = originView(w, p);
  expect(anchor).toBeDefined();
  p.abilities!.a1 = burst;
  step(w); // Source replacement cancels the previous nucleus, not the Phase origin.
  p.cooldowns.a1 = 0;
  cast(w, 'a1');
  expect(p.guidance?.origin).toEqual(anchor?.pos);
  expect(p.phaseOrigin).toBeUndefined();
});
it.each(['projectile', 'groundZone', 'selfBuff'] as const)(
  'unsupported %s conversion loses nucleus behavior rather than executing hidden flat flags',
  (kind) => {
    const { p } = setup(),
      comp = decompose(p.subAbilities!.sub1!);
    comp.delivery.kind = kind;
    const copy = recompose(comp, { slot: 'a1', name: 'Changed', cooldown: 8 });
    expect(guidedBurst(copy)).toBe(false);
    expect(describeAbility(copy)).not.toContain('nucleus');
  },
);
it('conflicting origin controllers and returning copies never double-deliver a nucleus', () => {
  const { p } = setup(),
    comp = decompose(p.subAbilities!.sub1!);
  comp.effects.push({ kind: 'shadowCommit' });
  const made = recompose(comp, { slot: 'a1', name: 'Other origin', cooldown: 8 });
  expect(guidedBurst(made)).toBe(false);
});

it('Fortune claims one cast and affects every living direct recipient once, preserving newer readiness', () => {
  const { w, p, b } = setup([], 'so_wild_bend');
  cast(w, 'sub1');
  const other = { ...b, id: w.allocId(), buffs: [] as typeof b.buffs, hp: 10000, maxHp: 10000 };
  w.bosses.push(other);
  const token: DirectCastToken = { spent: false },
    mods = { direct: true, pilot: { cast: token } };
  damageBoss(w, p, b, 10, mods);
  expect(p.buffs.some((b) => b.kind === 'fortune')).toBe(false);
  const first = b.buffs.find((b) => b.source === 'fortuneDelay')!;
  first.remaining = 1;
  p.cooldowns.sub1 = 0;
  step(w);
  cast(w, 'sub1');
  const ready = p.buffs.find((b) => b.kind === 'fortune');
  damageBoss(w, p, other, 10, mods);
  damageBoss(w, p, b, 10, mods);
  expect(other.buffs.some((b) => b.source === 'fortuneDelay')).toBe(true);
  expect(first.remaining).toBeLessThan(1);
  expect(p.buffs).toContain(ready);
  const later: DirectCastToken = { spent: false };
  damageBoss(w, p, b, 10, { direct: true, pilot: { cast: later } });
  expect(p.buffs).not.toContain(ready);
});
it('a previously connected cast cannot adopt later Fortune, while misses, immunity and lethal-only contacts preserve readiness', () => {
  const { w, p, b } = setup([], 'so_wild_bend');
  const token: DirectCastToken = { spent: false },
    mods = { direct: true, pilot: { cast: token } };
  damageBoss(w, p, b, 10, mods);
  cast(w, 'sub1');
  damageBoss(w, p, b, 10, mods);
  expect(p.buffs.some((b) => b.kind === 'fortune')).toBe(true);
  const fresh: DirectCastToken = { spent: false };
  damageBoss(w, p, b, 0, { direct: true, pilot: { cast: fresh } });
  expect(fresh.fortune).toBeUndefined();
  const corpse = { ...b, id: w.allocId(), buffs: [] as typeof b.buffs, hp: 1, maxHp: 1 };
  damageBoss(w, p, corpse, 100, { direct: true, pilot: { cast: fresh } });
  expect(fresh.fortune).toBeUndefined();
  expect(p.buffs.some((b) => b.kind === 'fortune')).toBe(true);
  damageBoss(w, p, b, 10, { direct: true, pilot: { cast: fresh } });
  expect(fresh.fortune).toBeTruthy();
});
it('Loaded Fate marks every spending-cast recipient and cannot be consumed by another bolt of that cast', () => {
  const { w, p, b } = setup(['so_wild_bend_g'], 'so_wild_bend');
  cast(w, 'sub1');
  const other = { ...b, id: w.allocId(), buffs: [] as typeof b.buffs, hp: 10000, maxHp: 10000 };
  const token: DirectCastToken = { spent: false },
    mods = { direct: true, pilot: { cast: token } };
  damageBoss(w, p, b, 10, mods);
  damageBoss(w, p, other, 10, mods);
  const hp = b.hp;
  damageBoss(w, p, b, 10, mods);
  expect(hp - b.hp).toBeCloseTo(10);
  expect(b.buffs.some((b) => b.kind === 'luckExposure')).toBe(true);
  expect(other.buffs.some((b) => b.kind === 'luckExposure')).toBe(true);
  const before = b.hp;
  damageBoss(w, p, b, 10, { direct: true, pilot: { cast: { spent: false } } });
  expect(before - b.hp).toBeCloseTo(12);
});
it('actual Tides damage applies Fortune to all boss/add recipients using its shared direct cast', () => {
  const { w, p, b } = setup(['so_wild_g_b'], 'so_wild_tides');
  p.abilities!.a2.fortune = { duration: 6, castSlowMult: 1.4, damageMult: 0.85, debuffDuration: 3 };
  cast(w, 'a2');
  b.pos = { x: 560, y: 400 };
  const other = {
    ...b,
    id: w.allocId(),
    pos: { x: 570, y: 430 },
    buffs: [] as typeof b.buffs,
    hp: 10000,
    maxHp: 10000,
  };
  w.bosses.push(other);
  cast(w, 'sub1');
  step(w, undefined, right, 0.25);
  step(w, 'sub1');
  expect(b.buffs.some((b) => b.source === 'fortuneDelay')).toBe(true);
  expect(other.buffs.some((b) => b.source === 'fortuneDelay')).toBe(true);
  expect(JSON.stringify(w.serialize())).not.toContain('targets');
});
it('Fortune claims cannot reactivate across a class-away-and-back or source replacement', () => {
  const { w, p, b } = setup([], 'so_wild_bend');
  cast(w, 'sub1');
  const token: DirectCastToken = {
    spent: false,
    ownerId: p.id,
    ownerClass: p.classId,
    epoch: p.castEpoch ?? 0,
    source: p.abilities!.a1,
    slot: 'a1',
  };
  damageBoss(w, p, b, 10, { direct: true, pilot: { cast: token } });
  const other = { ...b, id: w.allocId(), buffs: [] as typeof b.buffs, hp: 10000, maxHp: 10000 };
  w.setActiveClass(p, 'mage');
  w.setActiveClass(p, 'sorcerer');
  damageBoss(w, p, other, 10, { direct: true, pilot: { cast: token } });
  expect(other.buffs).toHaveLength(0);
});

it.each(['basic', 'sub2'] as const)(
  'an actual %s volley applies the one Fortune claim to boss and summon recipients',
  (slot) => {
    const { w, p, b } = setup(['so_wild_bend_g'], ['so_wild_bend', 'so_wild_surge']);
    b.pos = { x: 700, y: 360 };
    b.radius = 28;
    const add: Add = {
      id: w.allocId(),
      pos: { x: 700, y: 440 },
      hp: 1000,
      maxHp: 1000,
      moveSpeed: 0,
      radius: 28,
      targetId: null,
      attackCd: 1000,
      buffs: [],
    };
    w.adds.push(add);
    cast(w, 'sub1');
    step(w);
    cast(w, slot);
    const token = w.projectiles[0].pilotCast!;
    for (
      let i = 0;
      i < 100 &&
      (!b.buffs.some((b) => b.source === 'fortuneDelay') ||
        !add.buffs.some((b) => b.source === 'fortuneDelay'));
      i++
    )
      step(w);
    expect(b.buffs.some((b) => b.source === 'fortuneDelay')).toBe(true);
    expect(add.buffs.some((b) => b.source === 'fortuneDelay')).toBe(true);
    expect(token.fortune && token.fortune.targets.size).toBe(2);
    expect(p.buffs.some((b) => b.kind === 'fortune')).toBe(false);
    expect(b.buffs.some((b) => b.kind === 'luckExposure')).toBe(true);
    expect(add.buffs.some((b) => b.kind === 'luckExposure')).toBe(true);
    // The same claimed cast may apply to another living add without spending a new preparation.
    const last: Add = { ...add, id: w.allocId(), buffs: [] };
    damageAdd(w, p, last, 10, { direct: true, pilot: { cast: token } });
    expect(last.buffs.some((b) => b.source === 'fortuneDelay')).toBe(true);
  },
);
it('disconnect cancels a pending nucleus instead of detonating an ownerless attack', () => {
  const { w, p, b } = setup();
  step(w, 'sub1');
  b.pos = { x: 600, y: 400 };
  const hp = b.hp;
  w.removePlayerByPeer(p.peerId);
  step(w);
  expect(w.guidedBursts).toHaveLength(0);
  expect(b.hp).toBe(hp);
});

it('blocks new detonation requests while casting or moving, without losing the nucleus', () => {
  const { w, p } = setup();
  step(w, 'sub1');
  const c = p.guidance!;
  p.castTimer = 0.1;
  expect(burstControls(w, p)[0].blocked).toBe('Casting');
  tryDetonateBurst(w, p, 'sub1', true);
  expect(c.burst!.requested).toBe(false);
  p.castTimer = 0;
  p.glide = { dir: right, remaining: 50, leap: false, ab: p.abilities!.a3 };
  expect(burstControls(w, p)[0].blocked).toBe('Moving');
  tryDetonateBurst(w, p, 'sub1', true);
  expect(c.burst!.requested).toBe(false);
  p.glide = null;
  expect(burstControls(w, p)[0].blocked).toBeNull();
});
it('hides invalid nuclei immediately and preserves heading when live aim is neutral', () => {
  const { w, p } = setup();
  step(w, 'sub1', up);
  const c = p.guidance!;
  step(w, undefined, zero, 0.1);
  expect(c.angle).toBeCloseTo(Math.PI / 2);
  p.subAbilities!.sub1 = { ...p.subAbilities!.sub1! };
  expect(burstViews(w)).toEqual([]);
  expect(burstControls(w, p)).toEqual([]);
  w.removePlayerByPeer(p.peerId);
  expect(burstViews(w)).toEqual([]);
});

it('Phase escapes first; the next guided cast launches and steers toward a live world reticle from departure', () => {
  const { w, p } = setup();
  const departure = { ...p.pos };
  step(w, 'a3', up);
  expect(originView(w, p)?.pos).toEqual(departure);
  expect(p.pos.y).toBeGreaterThan(departure.y);
  const target = { x: 900, y: 400 };
  p.aimPoint = target;
  // Drive the real host input with a world-space pointer, including wind-up.
  const press = (down: boolean, point = target) =>
    w.step(
      0.01,
      new Map([
        [
          'a',
          {
            seq: w.tick,
            move: zero,
            aim: right,
            aimPoint: point,
            buttons: { basic: false, a1: down, a2: false, a3: false, revive: false },
          },
        ],
      ]),
    );
  press(true);
  expect(w.serialize().players[0].meteorChargeAtOrigin).toBe(true);
  for (let i = 0; i < 100 && p.castTimer > 0; i++) press(false);
  expect(p.phaseOrigin).toBeUndefined();
  const c = p.guidance!,
    q = w.projectiles.find((q) => q.guidance === c)!;
  expect(c.origin).toEqual(departure);
  expect(
    w.projectiles.filter((shot) => shot.guidance === c).map((shot) => shot.pos.y - departure.y),
  ).toEqual([-11, 11]);
  expect(Math.atan2(q.vel.y, q.vel.x) - (q.spreadOffset ?? 0)).toBeCloseTo(0);
  press(false, { x: 900, y: 800 });
  expect(c.angle).toBeGreaterThan(0);
});
it('one origin can route Tides, while basics and utility do not consume it', () => {
  const { w, p } = setup();
  const from = { ...p.pos };
  step(w, 'a3', up);
  cast(w, 'basic');
  step(w);
  cast(w, 'a2');
  step(w);
  expect(p.phaseOrigin).toBeDefined();
  step(w, 'sub1', right);
  expect(p.guidance!.origin).toEqual(from);
  expect(Math.abs(p.guidance!.burst!.pos.y - from.y)).toBeLessThan(3);
  expect(p.phaseOrigin).toBeUndefined();
});
it('cooldown recast discards the origin; a ready Phase always escapes and replaces it', () => {
  const { w, p } = setup();
  step(w, 'a3');
  step(w);
  expect(originView(w, p)).toBeDefined();
  const pos = { ...p.pos },
    cd = p.cooldowns.a3;
  step(w, 'a3');
  expect(originView(w, p)).toBeUndefined();
  expect(p.pos).toEqual(pos);
  expect(p.cooldowns.a3).toBeCloseTo(cd - 0.01);
  step(w);
  p.cooldowns.a3 = 0;
  step(w, 'a3');
  step(w);
  const old = { ...p.pos };
  p.cooldowns.a3 = 0;
  step(w, 'a3', up);
  expect(p.pos.y).toBeGreaterThan(old.y);
  expect(originView(w, p)?.pos).toEqual(old);
});
it('held Phase clears old origins without arming another; expiry, tether and class changes fall back to normal casts', () => {
  for (const mode of ['held', 'expiry', 'tether', 'class']) {
    const { w, p } = setup();
    step(w, 'a3');
    if (mode === 'held') {
      p.cooldowns.a3 = 0;
      step(w, 'a3', up, 0.01, true);
    }
    if (mode === 'expiry') for (let i = 0; i < 410; i++) step(w);
    if (mode === 'tether') p.pos.x += 700;
    if (mode === 'class') {
      w.setActiveClass(p, 'mage');
      w.setActiveClass(p, 'sorcerer');
    }
    expect(originView(w, p)).toBeUndefined();
    step(w);
    cast(w, 'a1');
    expect(p.guidance?.origin).toBeUndefined();
  }
});

it('origin ownership ends on downing, source replacement, finish and disconnect', () => {
  for (const mode of ['down', 'source', 'finish', 'disconnect']) {
    const { w, p } = setup();
    step(w, 'a3');
    if (mode === 'down') p.hp = 0;
    if (mode === 'source') p.abilities!.a3 = { ...p.abilities!.a3 };
    if (mode === 'finish') w.finished = true;
    if (mode === 'disconnect') w.removePlayerByPeer(p.peerId);
    if (mode !== 'disconnect') expect(originView(w, p)).toBeUndefined();
    step(w);
    expect(w.serialize().players.some((p) => p.guidanceOrigin)).toBe(false);
  }
});
it('invalid network reticles use the projected fallback without introducing non-finite aim', () => {
  const { w, p } = setup();
  step(w, 'a3', up);
  step(w);
  w.step(
    0.01,
    new Map([
      [
        'a',
        {
          seq: w.tick,
          move: zero,
          aim: right,
          aimPoint: { x: NaN, y: Infinity },
          buttons: { basic: false, a1: false, a2: false, a3: false, revive: false },
        },
      ],
    ]),
  );
  expect(p.aimPoint).toBeUndefined();
  const view = originView(w, p)!;
  expect(view.target.x).toBeCloseTo(p.pos.x + 400);
  expect(view.target.y).toBe(p.pos.y);
});

it('a reticle exactly on departure keeps a finite heading at launch and during steering', () => {
  const { w, p } = setup();
  const departure = { ...p.pos };
  step(w, 'a3', up);
  step(w);
  const buttons = { basic: false, a1: false, a2: false, a3: false, revive: false, sub1: true };
  w.step(
    0.01,
    new Map([['a', { seq: w.tick, move: zero, aim: right, aimPoint: departure, buttons }]]),
  );
  const c = p.guidance!;
  expect(c.origin).toEqual(departure);
  expect(c.angle).toBe(0);
  buttons.sub1 = false;
  w.step(0.1, new Map([['a', { seq: w.tick, move: zero, aim: up, aimPoint: departure, buttons }]]));
  expect(c.angle).toBe(0);
  expect(Number.isFinite(c.burst!.pos.x)).toBe(true);
});
it('held Phase during cooldown leaves its origin available instead of discarding it', () => {
  const { w, p } = setup();
  step(w, 'a3');
  const origin = p.phaseOrigin;
  step(w, 'a3', right, 0.1, true);
  expect(p.phaseOrigin).toBe(origin);
  expect(originView(w, p)).toBeDefined();
});
