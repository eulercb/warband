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
  relayViews,
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
it('Phase relays existing fan shots once, preserving timers, damage, cast tokens and hit history', () => {
  const { w, p } = setup(['so_wild_g_b'], 'so_wild_surge');
  cast(w, 'a2');
  cast(w, 'sub1');
  const c = p.guidance!,
    shots = w.projectiles.filter((q) => q.guidance === c);
  const before = shots.map((q) => ({
    q,
    range: q.rangeLeft,
    life: q.lifetime,
    damage: q.damage,
    token: q.pilotCast,
  }));
  for (const q of shots) q.hitIds = [777];
  expect(relayViews(w, p).a3?.available).toBe(true);
  const remaining = c.remaining;
  step(w, 'a3', up);
  expect(c.relayed).toBe(true);
  expect(w.projectiles.filter((q) => q.guidance === c)).toHaveLength(shots.length);
  expect(c.remaining).toBeCloseTo(remaining - 0.01);
  for (const item of before) {
    expect(item.q.damage).toBe(item.damage);
    expect(item.q.pilotCast).toBe(item.token);
    expect(item.q.hitIds).toEqual([777]);
    expect(item.q.rangeLeft).toBeLessThan(item.range);
    expect(item.q.lifetime).toBeCloseTo(item.life - 0.01);
  }
  expect(relayViews(w, p).a3).toBeUndefined();
});
it('insufficient budget fails the whole relay while Phase still escapes; held activation also leaves it alone', () => {
  for (const held of [false, true]) {
    const { w, p } = setup(['so_wild_g_b'], 'so_wild_surge');
    cast(w, 'sub1');
    const c = p.guidance!,
      shots = w.projectiles.filter((q) => q.guidance === c);
    if (!held) shots[0].rangeLeft = 20;
    else p.prevButtons.a3 = true;
    expect(relayViews(w, p).a3?.available).toBe(held);
    const from = { ...p.pos };
    step(w, 'a3', up, 0.01, held);
    expect(p.pos.y).toBeGreaterThan(from.y);
    expect(c.relayed).toBeUndefined();
    expect(shots[1].pos.y).toBeLessThan(p.pos.y);
  }
});
it('Phase can relay a nucleus without resetting its age/minimum detonation or adding travel', () => {
  const { w, p } = setup();
  step(w, 'sub1');
  const c = p.guidance!,
    b = c.burst!;
  step(w, undefined, right, 0.1);
  const age = b.age,
    range = b.travelLeft;
  step(w, 'a3', right);
  expect(c.relayed).toBe(true);
  expect(b.age).toBeCloseTo(age + 0.01);
  expect(b.travelLeft).toBeLessThan(range);
  expect(b.pos.x).toBeGreaterThan(p.pos.x);
  step(w, 'sub1');
  step(w, undefined, right, 0.5);
  expect(w.guidedBursts).toHaveLength(0);
  expect(b.age).toBeCloseTo(0.2);
});
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
  ).toBe(24);
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
  expect(describeAbility(relay)).toContain('no time reset');
  // Execute the actually synthesized Blink controller on the copied nucleus.
  p.abilities!.a3 = relay;
  p.cooldowns.a3 = 0;
  const controlled = p.guidance!;
  step(w, 'a3', right);
  expect(controlled.relayed).toBe(true);
  expect(w.events.some((e) => e.t === 'spellRelay')).toBe(true);
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
it('does not offer relay when no eligible projectile remains', () => {
  const { w, p } = setup();
  cast(w, 'a1');
  expect(relayViews(w, p).a3).toBeDefined();
  for (const q of w.projectiles) q.rangeLeft = 0;
  expect(relayViews(w, p).a3).toBeUndefined();
});
