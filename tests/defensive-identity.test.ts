import { describe, it, expect } from 'vitest';
import { Graphics } from 'pixi.js';
import { World } from '../src/engine/world/world';
import {
  resolvePlayerAbility,
  resolveBossAbility,
  spawnZone,
  applyImpulse,
  stepShove,
} from '../src/engine/combat/abilities';
import {
  applyBuff,
  makeBuff,
  damagePlayer,
  tickBuffs,
  buffMult,
} from '../src/engine/combat/combat';
import { blockFromFront, cleanseMovement, isSteadfast } from '../src/engine/combat/defense';
import { updatePaladinAuras } from '../src/engine/combat/paladinAuras';
import { absorptionAmount, grantAbsorption } from '../src/engine/combat/absorption';
import { healSupportAlly } from '../src/engine/combat/support';
import { getClass, describeAbility, type PlayerAbilityDef } from '../src/engine/content/classes';
import { getSubSkill, subclassOfSkill } from '../src/engine/content/subclasses';
import { getMonster } from '../src/engine/content/monsters';
import {
  decompose,
  recompose,
  refreshComponents,
  componentValue,
  synthesizeAbility,
  type AbilityComponents,
} from '../src/engine/content/forge';
import { applyCharUpgrades, applySubSkillUpgrades } from '../src/engine/content/charUpgrades';
import { heroPowerRatio } from '../src/engine/content/balance';
import { ARENA_W } from '../src/engine/core/constants';
import { drawZone } from '../src/render/pipeline/entityView';
import { drawDefenseState } from '../src/render/pipeline/defenseVisuals';
import { buffBadges } from '../src/render/overlays/buffGlyphs';
import type { GroundZone, Player, ClassId } from '../src/engine/core/types';
const ZERO = { x: 0, y: 0 };
function setup(classId: ClassId = 'knight') {
  const w = new World({
    monsterId: 'lich',
    seed: 42,
    players: [
      { peerId: 'a', name: 'A', classId },
      { peerId: 'b', name: 'B', classId: 'cleric' },
      { peerId: 'c', name: 'C', classId: 'ranger' },
    ],
  });
  w.players.forEach((p, i) => {
    p.pos = { x: 600 + i * 30, y: 400 };
    p.aim = { x: 1, y: 0 };
    p.critChance = 0;
  });
  w.boss!.pos = { x: 700, y: 400 };
  w.boss!.hp = w.boss!.maxHp = 10000;
  w.obstacles = [];
  return { w, p: w.players[0], ally: w.players[1], far: w.players[2] };
}
function bind(p: Player, id: string, composed: boolean) {
  const ab: PlayerAbilityDef = { ...structuredClone(getSubSkill(id)!.ability), slot: 'sub1' };
  p.subSkillIds = [id];
  p.subAbilities = { sub1: composed ? recompose(decompose(ab), ab) : ab };
  return p.subAbilities.sub1!;
}
function tick(w: World, z: GroundZone) {
  (w as unknown as { applyZoneTick(z: GroundZone): void }).applyZoneTick(z);
}
function composeBase(p: Player, slot: 'a2' | 'a3', composed: boolean) {
  if (composed) {
    const ab = p.abilities![slot];
    p.abilities![slot] = recompose(decompose(ab), ab);
  }
}
describe.each([false, true])('defensive identities, composed=%s', (composed) => {
  it('Shield Wall blocks damage from the front, preserves counter, lets rear and hazard damage through', () => {
    const { w, p } = setup();
    composeBase(p, 'a2', composed);
    resolvePlayerAbility(w, p, 'a2', ZERO);
    const hp = p.hp;
    expect(damagePlayer(w, p, 40, w.boss!.pos)).toBe(0);
    expect(p.hp).toBe(hp);
    expect(p.buffs.find((b) => b.kind === 'frontGuard')?.mult).toBe(1);
    expect(p.buffs.some((b) => b.kind === 'counter')).toBe(true);
    expect(damagePlayer(w, p, 10, { x: 500, y: 400 })).toBe(10);
    expect(damagePlayer(w, p, 10)).toBe(10);
    expect(damagePlayer(w, p, 40, w.boss!.pos)).toBe(0);
    expect(p.buffs.some((b) => b.kind === 'frontGuard')).toBe(false);
    expect(damagePlayer(w, p, 10, w.boss!.pos)).toBe(10);
    expect(w.events.some((e) => e.t === 'support' && e.kind === 'protect')).toBe(true);
  });
  it('Shield Wall uses actual boss attack origin; control remains a separate threat', () => {
    const { w, p } = setup();
    composeBase(p, 'a2', composed);
    resolvePlayerAbility(w, p, 'a2', ZERO);
    const ab = {
      id: 'test',
      name: 'Test',
      shape: 'cone' as const,
      damage: 30,
      cooldown: 1,
      windup: 0,
      range: 200,
      halfAngleDeg: 80,
      stun: 1,
    };
    resolveBossAbility(w, w.boss!, ab, {
      ...w.boss!.action,
      abilityId: 'test',
      aimAngle: Math.PI,
      targetPos: p.pos,
      targetId: p.id,
    });
    expect(p.hp).toBe(p.maxHp);
    expect(p.buffs.some((b) => b.kind === 'stun')).toBe(true);
  });
  it('Second Wind is a reliable self heal plus sprint, never a double heal or an ally heal', () => {
    const { w, p, ally } = setup();
    p.hp = 20;
    ally.hp = 1;
    bind(p, 'kn_champion_rally', composed);
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(p.hp).toBe(110);
    expect(ally.hp).toBe(1);
    expect(buffMult(p, 'moveSpeed')).toBe(1.3);
    expect(p.stats.healingDone).toBe(90);
    expect(describeAbility(p.subAbilities!.sub1!)).toContain('self');
  });
  it('Rally heals the lowest ally, plants one recovery field, and arms the existing counter even at full health', () => {
    const { w, p, ally } = setup();
    ally.hp = 10;
    bind(p, 'kn_battle_rally', composed);
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(ally.hp).toBe(55);
    expect(p.hp).toBe(p.maxHp);
    expect(w.groundZones).toHaveLength(1);
    const z = w.groundZones[0];
    expect(z.pos).toEqual(ally.pos);
    tick(w, z);
    expect(ally.hp).toBe(61);
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(w.groundZones.filter((z) => z.recovery)).toHaveLength(1);
    w.groundZones = [];
    w.players.forEach((p) => (p.hp = p.maxHp));
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(w.groundZones).toHaveLength(0);
    expect(p.buffs.some((b) => b.kind === 'guard')).toBe(true);
  });
  it('Stand as One is a centered slowing cover field with allied movement, including airborne enemies', () => {
    const { w, p, ally, far } = setup('ranger');
    far.pos = { x: 1000, y: 400 };
    bind(p, 'rg_hunter_stand', composed);
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    const z = w.groundZones[0];
    expect(z.pos).toEqual(p.pos);
    expect(z.airborne).toBe(true);
    applyBuff(w.boss!, makeBuff('flight', 0, 5, 'flight'));
    tick(w, z);
    expect(buffMult(ally, 'moveSpeed')).toBe(1.2);
    expect(buffMult(far, 'moveSpeed')).toBe(1);
    expect(buffMult(w.boss!, 'moveSpeed')).toBe(0.6);
    expect(w.boss!.hp).toBeLessThan(10000);
  });
  it('Bear Spirit releases roots and ongoing shoves, resists new hard control but keeps slow and damage counterplay', () => {
    const { w, p } = setup('barbarian');
    bind(p, 'bb_totem_bear', composed);
    applyBuff(p, makeBuff('root', 0, 3, 'root'));
    applyImpulse(w, p, { x: 1, y: 0 }, 100);
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(p.shove).toBeNull();
    expect(p.buffs.some((b) => b.kind === 'root')).toBe(false);
    applyBuff(p, makeBuff('root', 0, 3, 'root'));
    applyBuff(p, makeBuff('stun', 0, 3, 'stun'));
    applyBuff(p, makeBuff('moveSpeed', 0.5, 3, 'slow'));
    expect(p.buffs.some((b) => b.kind === 'root' || b.kind === 'stun')).toBe(false);
    expect(buffMult(p, 'moveSpeed')).toBe(0.5);
    applyImpulse(w, p, { x: -1, y: 0 }, 100);
    expect(p.shove).toBeNull();
    expect(damagePlayer(w, p, 10)).toBeCloseTo(8);
    tickBuffs(p, 6.1);
    applyBuff(p, makeBuff('root', 0, 3, 'root'));
    expect(p.buffs.some((b) => b.kind === 'root')).toBe(true);
  });
  it('Spirit Mend cleanses on full health, otherwise heals once, and protects briefly from forced movement', () => {
    const { w, p, ally } = setup('barbarian');
    bind(p, 'bb_totem_mend', composed);
    p.hp = 20;
    ally.hp = 1;
    p.buffs = [
      makeBuff('root', 0, 2, 'root'),
      makeBuff('moveSpeed', 0.5, 2, 'slow'),
      makeBuff('castSlow', 1.5, 2, 'slowcast'),
      makeBuff('damageDealt', 1.2, 3, 'power'),
    ];
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(p.hp).toBe(100);
    expect(ally.hp).toBe(1);
    expect(p.buffs.map((b) => b.kind).sort()).toEqual(['damageDealt', 'steadfast']);
    applyImpulse(w, p, { x: 1, y: 0 }, 100);
    expect(p.shove).toBeNull();
    tickBuffs(p, 2.1);
    applyImpulse(w, p, { x: 1, y: 0 }, 100);
    expect(p.shove).toBeTruthy();
    stepShove(w, p, 1);
    p.hp = p.maxHp;
    applyBuff(p, makeBuff('moveSpeed', 0.4, 2, 'slow'));
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(buffMult(p, 'moveSpeed')).toBe(1);
  });
  it('Divine Shield is a brief damage immunity and preserves its longer following Bulwark aura', () => {
    const { w, p, ally } = setup('paladin');
    composeBase(p, 'a3', composed);
    resolvePlayerAbility(w, p, 'a3', ZERO);
    expect(damagePlayer(w, p, 100)).toBe(0);
    expect(buffMult(ally, 'auraBulwark')).toBe(0.85);
    tickBuffs(p, 1.3);
    updatePaladinAuras(w, 0, 0);
    expect(damagePlayer(w, p, 10)).toBeCloseTo(8.5);
    expect(p.buffs.some((b) => b.kind === 'invuln')).toBe(false);
    expect(describeAbility(p.abilities!.a3)).toContain('damage immunity');
  });
  it('Aura of Protection gives barriers to living nearby allies, keeps aura and respects stronger shields/caps', () => {
    const { w, p, ally, far } = setup('paladin');
    far.pos.x = 1000;
    bind(p, 'pa_devotion_aura', composed);
    grantAbsorption(ally, 50, 8);
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(absorptionAmount(p.buffs)).toBe(40);
    expect(absorptionAmount(ally.buffs)).toBe(50);
    expect(absorptionAmount(far.buffs)).toBe(0);
    expect(buffMult(ally, 'auraBulwark')).toBe(0.85);
    ally.state = 'downed';
    ally.buffs = [];
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(ally.buffs).toEqual([]);
  });
});
it('directional guard handles expiry, zero damage/aim, angle edges and toroidal origin', () => {
  const { p } = setup();
  p.buffs = [makeBuff('frontGuard', 3, 4, 'guard')];
  expect(blockFromFront(p, p.pos, 10)).toBe(false);
  expect(blockFromFront(p, { x: 600, y: 500 }, 10)).toBe(false);
  expect(blockFromFront(p, { x: 700, y: 400 }, 0)).toBe(false);
  p.aim = ZERO;
  expect(blockFromFront(p, { x: 700, y: 400 }, 10)).toBe(false);
  p.aim = { x: 1, y: 0 };
  p.pos.x = ARENA_W - 10;
  expect(blockFromFront(p, { x: 10, y: 400 }, 10)).toBe(true);
  tickBuffs(p, 4.1);
  expect(blockFromFront(p, { x: 10, y: 400 }, 10)).toBe(false);
  expect(isSteadfast({})).toBe(false);
});
it('cleanse removes only detrimental movement/control; copied heal cleansing works without missing HP', () => {
  const { w, p, ally } = setup();
  ally.buffs = [
    makeBuff('stun', 0, 2, 'stun'),
    makeBuff('silence', 0, 2, 'silence'),
    makeBuff('moveSpeed', 1.2, 3, 'speed'),
    makeBuff('castSlow', 0.8, 3, 'fastcast'),
    makeBuff('damageTaken', 0.8, 3, 'ward'),
  ];
  healSupportAlly(w, p, ally, 10, { ...getClass('cleric').abilities.a1, cleanseOnHeal: true });
  expect(ally.buffs.map((b) => b.kind)).toEqual(['moveSpeed', 'castSlow', 'damageTaken']);
  cleanseMovement({ buffs: [] });
});
it('upgrades preserve new identities, cap repeated immunity/charges, and retain Forge payloads', () => {
  const { p } = setup();
  applyCharUpgrades(p, Array(5).fill('kn_bulwark'));
  expect(p.abilities!.a2.frontGuard).toEqual({ charges: 4, duration: 8 });
  const pa = setup('paladin').p;
  applyCharUpgrades(pa, [...Array.from({ length: 5 }, () => 'pa_aegis'), 'pa_grand_aegis']);
  expect(pa.abilities!.a3.iframes).toBe(2);
  expect(pa.abilities!.a3.buffDefMult).toBeUndefined();
  for (const id of [
    'kn_champion_rally',
    'kn_battle_rally',
    'rg_hunter_stand',
    'bb_totem_bear',
    'bb_totem_mend',
    'pa_devotion_aura',
  ]) {
    const p = setup(subclassOfSkill(id)!.classId).p;
    bind(p, id, true);
    const before = structuredClone(p.subAbilities!.sub1!);
    applySubSkillUpgrades(p, [`subup_${id}`]);
    const after = p.subAbilities!.sub1!;
    expect(after.cooldown).toBeLessThan(before.cooldown);
    expect(after.components).toEqual(refreshComponents(after));
  }
  const def = {
    ...getClass('knight').abilities.a2,
    frontGuard: { charges: 99, duration: 99 },
    steadfastDuration: 99,
    cleanseOnHeal: true,
    iframes: 99,
  };
  const capped = recompose(refreshComponents(def), def);
  expect(capped.frontGuard).toEqual({ charges: 4, duration: 8 });
  expect(capped.steadfastDuration).toBe(8);
  expect(capped.iframes).toBe(2);
  expect(capped.cleanseOnHeal).toBe(true);
  const comp: AbilityComponents = {
    delivery: { kind: 'selfBuff', iframes: 1 },
    effects: [
      { kind: 'frontGuard', charges: 2, duration: 4 },
      { kind: 'steadfast', duration: 4 },
      { kind: 'cleanse' },
    ],
  };
  expect(componentValue(comp)).toBe(120);
  for (let seed = 1; seed <= 24; seed++) {
    const def = synthesizeAbility(seed, 'guard', 'a2', [
      {
        name: 'Guard',
        classId: 'knight',
        className: 'Knight',
        slot: 'a2',
        def: getClass('knight').abilities.a2,
      },
    ]).def;
    expect(Number.isFinite(def.cooldown)).toBe(true);
    expect(def.cooldown).toBeGreaterThan(0);
  }
});
it('new utility does not increase automatic party power credit; Forge retains the exclusions', () => {
  for (const id of ['kn_battle_rally', 'rg_hunter_stand', 'pa_devotion_aura']) {
    const p = setup().p;
    const ab = bind(p, id, true);
    const before = heroPowerRatio(p);
    const copy = structuredClone(ab);
    if (copy.kind === 'heal') {
      copy.damage = 0;
      copy.recoveryZone = undefined;
    }
    if (copy.zoneTickDamage) copy.zoneTickDamage = 0;
    if (copy.absorption) copy.absorption.amount = 0;
    p.subAbilities!.sub1 = copy;
    expect(heroPowerRatio(p)).toBeCloseTo(before, 10);
    expect(recompose(decompose(ab), ab).balanceZoneDamageScale).toBe(ab.balanceZoneDamageScale);
  }
});
it('actual Lich ground hazards cannot receive curses; creature marks survive overlapping pools', () => {
  const { w, p } = setup('warlock');
  const ab = getMonster('lich').abilities.find((a) => a.id === 'voidZone')!;
  resolveBossAbility(w, w.boss!, ab, {
    ...w.boss!.action,
    abilityId: ab.id,
    aimAngle: 0,
    targetPos: p.pos,
    targetId: p.id,
  });
  expect(w.groundZones.length).toBeGreaterThan(0);
  resolvePlayerAbility(w, p, 'a1', ZERO);
  const hex = w.groundZones.at(-1)!;
  hex.pos = { ...w.boss!.pos };
  tick(w, hex);
  expect(w.boss!.buffs.some((b) => b.kind === 'curse')).toBe(true);
  const hazards = w.groundZones.filter((z) => z.side === 'boss');
  for (const z of hazards) {
    expect(z.curseBonus).toBeUndefined();
    expect(z.curseStyle).toBeUndefined();
    expect('buffs' in z).toBe(false);
    expect('hp' in z).toBe(false);
  }
  expect(w.terrain.every((t) => !('buffs' in t))).toBe(true);
  spawnZone(w, {
    kind: 'voidZone',
    pos: p.pos,
    radius: 90,
    side: 'boss',
    ownerId: w.boss!.id,
    damagePerTick: 12,
    healPerTick: 0,
    duration: 8,
    curseBonus: 0.15,
    curseStyle: 'dread',
  });
  const bad = w.groundZones.at(-1)!;
  expect(bad.curseBonus).toBeUndefined();
  expect(bad.curseStyle).toBeUndefined();
  const snap = w.serialize();
  expect(
    snap.groundZones.filter((z) => z.side === 'boss').every((z) => z.curseStyle === undefined),
  ).toBe(true);
  expect(snap.groundZones.find((z) => z.id === hex.id)?.curseStyle).toBe('hex');
});
it('field watermark is distinct from enemy badges, hostile circles suppress stray curse art; defense cues render', () => {
  const base = {
    id: 1,
    kind: 'voidZone' as const,
    pos: ZERO,
    radius: 90,
    remaining: 3,
    duration: 8,
  };
  const g = new Graphics();
  drawZone(g, { ...base, side: 'boss', curseStyle: 'dread' }, ZERO, 1);
  const instructions = () =>
    g.context.instructions.flatMap((i) => {
      if (i.action !== 'fill' && i.action !== 'stroke') return [];
      return [{ action: i.action, color: i.data.style.color, path: i.data.path.instructions }];
    });
  const hostile = structuredClone(instructions());
  g.clear();
  drawZone(g, { ...base, side: 'boss' }, ZERO, 1);
  expect(instructions()).toEqual(hostile);
  g.clear();
  drawZone(g, { ...base, side: 'player', curseStyle: 'hex' }, ZERO, 1);
  expect(instructions()).not.toEqual(hostile);
  expect(g.context.instructions.filter((i) => i.action === 'fill')).toHaveLength(1);
  g.clear();
  drawZone(g, base, ZERO, 1);
  expect(g.context.instructions.length).toBeGreaterThan(0);
  const { w, p } = setup();
  resolvePlayerAbility(w, p, 'a2', ZERO);
  applyBuff(p, makeBuff('steadfast', 0, 3, 'steady'));
  const view = w.serialize().players[0];
  g.clear();
  drawDefenseState(g, view, 100, 100, 12);
  expect(g.context.instructions.length).toBeGreaterThan(3);
  for (const b of view.buffs.filter((b) => b.kind === 'frontGuard' || b.kind === 'steadfast'))
    expect(buffBadges([b])[0].label).toMatch(/Frontal guard|Steadfast/);
  g.clear();
  drawDefenseState(g, { ...view, buffs: [] }, 100, 100, 12);
  expect(g.context.instructions).toHaveLength(0);
  g.destroy();
});

it('real projectile and add attack paths supply direction while ground pools bypass charges', () => {
  const { w, p, ally, far } = setup();
  ally.pos = { x: 1200, y: 700 };
  far.pos = { x: 1300, y: 700 };
  resolvePlayerAbility(w, p, 'a2', ZERO);
  const shot = {
    id: w.allocId(),
    kind: 'shadowBolt' as const,
    pos: { ...p.pos },
    vel: { x: -10000, y: 0 },
    ownerId: w.boss!.id,
    side: 'boss' as const,
    damage: 30,
    impactRadius: 0,
    hitRadius: 12,
    lifetime: 1,
    rangeLeft: 200,
  };
  const contact = w as unknown as {
    resolveBossProjectile(p: typeof shot): boolean;
    updateAdds(dt: number): void;
  };
  expect(contact.resolveBossProjectile(shot)).toBe(true);
  expect(p.hp).toBe(p.maxHp);
  expect(p.buffs.find((b) => b.kind === 'frontGuard')?.mult).toBe(1);
  w.adds.push({
    id: w.allocId(),
    pos: { x: p.pos.x + 20, y: p.pos.y },
    hp: 100,
    maxHp: 100,
    radius: 12,
    moveSpeed: 0,
    targetId: p.id,
    attackCd: 0,
    buffs: [],
  });
  contact.updateAdds(0.01);
  expect(p.hp).toBe(p.maxHp);
  expect(p.buffs.some((b) => b.kind === 'frontGuard')).toBe(false);
  resolvePlayerAbility(w, p, 'a2', ZERO);
  spawnZone(w, {
    kind: 'voidZone',
    pos: { ...p.pos },
    radius: 90,
    side: 'boss',
    ownerId: w.boss!.id,
    damagePerTick: 12,
    healPerTick: 0,
    duration: 8,
  });
  tick(w, w.groundZones.at(-1)!);
  expect(p.hp).toBe(p.maxHp - 12);
  expect(p.buffs.find((b) => b.kind === 'frontGuard')?.mult).toBe(2);
});

it.each(['kn_gk_a2_a', 'kn_gk_a2_b', 'pa_gk_a3_a', 'pa_gk_a3_b'])(
  'skill grand %s retains native protection and adds its authored defense',
  (id) => {
    const { p } = setup(id.startsWith('kn') ? 'knight' : 'paladin');
    applyCharUpgrades(p, [id]);
    const ab = p.abilities![id.startsWith('kn') ? 'a2' : 'a3'];
    if (id.startsWith('kn')) {
      expect(ab.frontGuard!.charges).toBe(2);
      expect(ab.frontGuard!.duration).toBe(4);
      expect(ab.allyWard).toEqual({ range: 180, mult: 0.8, duration: 4 });
      expect(ab.buffDefMult).toBe(0.8);
    } else {
      expect(ab.buffDefMult).toBeUndefined();
      expect(ab.iframes).toBeGreaterThan(1.25);
      expect(ab.iframes).toBeLessThanOrEqual(2);
      expect(ab.paladinAura!.duration).toBeGreaterThan(5);
    }
  },
);
it.each([1, 0.2])(
  'keeps the curse watermark inside its own translated field at scale %s',
  (scale) => {
    const g = new Graphics();
    drawZone(
      g,
      {
        id: 1,
        kind: 'voidZone',
        pos: ZERO,
        radius: 90,
        remaining: 3,
        duration: 5,
        side: 'player',
        curseStyle: 'hex',
      },
      { x: 200, y: 200 },
      scale,
    );
    const bounds = g.getLocalBounds();
    expect(bounds.maxX).toBeLessThan(202 + 90 * scale);
    expect(bounds.maxY).toBeLessThan(202 + 90 * scale);
    g.destroy();
  },
);
