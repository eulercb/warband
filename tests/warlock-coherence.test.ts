import { describe, it, expect } from 'vitest';
import { Graphics } from 'pixi.js';
import { World } from '../src/engine/world/world';
import { resolvePlayerAbility, resolveBossAbility } from '../src/engine/combat/abilities';
import {
  applyBuff,
  makeBuff,
  buffMult,
  damageBoss,
  damagePlayer,
  tickBuffs,
} from '../src/engine/combat/combat';
import {
  absorptionAmount,
  absorptionMaximum,
  absorptionDescription,
  scaleAbsorption,
} from '../src/engine/combat/absorption';
import { tickSubclassPassives } from '../src/engine/combat/subclassPassives';
import { controlledSpellMultiplier } from '../src/engine/combat/spellCombos';
import { getClass, describeAbility, type PlayerAbilityDef } from '../src/engine/content/classes';
import { getSubSkill } from '../src/engine/content/subclasses';
import { getMonster } from '../src/engine/content/monsters';
import {
  decompose,
  recompose,
  refreshComponents,
  componentValue,
  synthesizeAbility,
} from '../src/engine/content/forge';
import { applySubSkillUpgrades, applySubclassGrands } from '../src/engine/content/charUpgrades';
import { heroPowerRatio } from '../src/engine/content/balance';
import { curseOwner, curseDuration, personallyCursed } from '../src/engine/core/curses';
import { buffView } from '../src/engine/core/buffView';
import { ADD_DAMAGE } from '../src/engine/core/constants';
import { drawCurseSigil } from '../src/render/pipeline/curseVisuals';
import { enemyDebuffs } from '../src/render/pipeline/enemyDebuffs';
import type { Add, GroundZone, Player } from '../src/engine/core/types';
const ZERO = { x: 0, y: 0 };
const ids = ['wa_fiend_pit', 'wa_fiend_resilience', 'wa_goo_whispers'];
function setup() {
  const w = new World({
    monsterId: 'dragon',
    seed: 42,
    players: [
      { peerId: 'a', name: 'A', classId: 'warlock' },
      { peerId: 'b', name: 'B', classId: 'warlock' },
    ],
  });
  const p = w.players[0];
  p.pos = { x: 600, y: 400 };
  p.aim = { x: 1, y: 0 };
  p.critChance = 0;
  w.players[1].pos = { x: 1200, y: 800 };
  w.boss!.pos = { x: 700, y: 400 };
  w.boss!.hp = w.boss!.maxHp = 10000;
  return { w, p };
}
function bind(p: Player, id: string, composed: boolean) {
  const ab: PlayerAbilityDef = { ...structuredClone(getSubSkill(id)!.ability), slot: 'sub1' };
  p.subSkillIds = [id];
  p.subAbilities = { sub1: composed ? recompose(decompose(ab), ab) : ab };
  return p.subAbilities.sub1!;
}
function castZone(w: World, p: Player, id: string, composed: boolean) {
  bind(p, id, composed);
  resolvePlayerAbility(w, p, 'sub1', ZERO);
  const z = w.groundZones.at(-1)!;
  z.pos = { ...w.boss!.pos };
  return z;
}
function tick(w: World, z: GroundZone) {
  (w as unknown as { applyZoneTick(z: GroundZone): void }).applyZoneTick(z);
}
function add(w: World, pos = w.boss!.pos): Add {
  const a: Add = {
    id: w.allocId(),
    pos: { ...pos },
    hp: 1000,
    maxHp: 1000,
    radius: 12,
    moveSpeed: 0,
    targetId: null,
    attackCd: 0,
    buffs: [],
  };
  w.adds.push(a);
  return a;
}
function mark(
  p: Player,
  target: { buffs: Add['buffs'] },
  style = 'searing',
  mult = 1.15,
  duration = 4,
) {
  applyBuff(target, makeBuff('curse', mult, duration, `curse:${p.id}:${style}`));
}

describe.each([false, true])('Warlock contracts, composed=%s', (composed) => {
  it('keeps curse families and owners independent, using only the strongest personal multiplier', () => {
    const { w, p } = setup();
    p.abilities!.a1.curseBonus = 0.18;
    resolvePlayerAbility(w, p, 'a1', ZERO);
    const hex = w.groundZones.at(-1)!;
    hex.pos = { ...w.boss!.pos };
    tick(w, hex);
    const pit = castZone(w, p, 'wa_fiend_pit', composed);
    tick(w, pit);
    const dread = castZone(w, p, 'wa_goo_whispers', composed);
    tick(w, dread);
    mark(w.players[1], w.boss!, 'dread', 1.2);
    expect(w.boss!.buffs.filter((b) => b.kind === 'curse')).toHaveLength(4);
    expect(damageBoss(w, p, w.boss!, 100)).toBeCloseTo(118);
    expect(damageBoss(w, w.players[1], w.boss!, 100)).toBeCloseTo(120);
    tickBuffs(w.boss!, 1.6);
    expect(damageBoss(w, p, w.boss!, 100)).toBeCloseTo(115);
    tickBuffs(w.boss!, 0.5);
    expect(personallyCursed(p.id, w.boss!)).toBe(true); // searing survives dread/Hex
    expect(buffMult(w.boss!, 'damageDealt')).toBe(1);
    tickBuffs(w.boss!, 2);
    expect(damageBoss(w, p, w.boss!, 100)).toBe(100);
  });
  it('keeps differently upgraded overlapping casts of the same curse independent', () => {
    const { w, p } = setup();
    const strong = castZone(w, p, 'wa_goo_whispers', composed);
    strong.curseBonus = 0.2;
    tick(w, strong);
    const weak = castZone(w, p, 'wa_goo_whispers', composed);
    tick(w, weak);
    expect(w.boss!.buffs.filter((b) => b.kind === 'curse')).toHaveLength(2);
    expect(damageBoss(w, p, w.boss!, 100)).toBeCloseTo(120);
    // The weaker cast cannot erase the stronger one or extend its lifetime.
    w.boss!.buffs.find((b) => b.kind === 'curse' && b.mult === 1.2)!.remaining = 0;
    expect(damageBoss(w, p, w.boss!, 100)).toBeCloseTo(115);
    expect(buffMult(w.boss!, 'damageDealt')).toBe(0.8);
  });
  it('Whispers weakens boss attacks, supports its own passive and does not pretend to be Fireball control', () => {
    const { w, p } = setup();
    const boss = w.boss!;
    const attack = getMonster('dragon').abilities.find((a) => a.id === 'tailSweep')!;
    resolveBossAbility(w, boss, attack, boss.action);
    const baseline = p.maxHp - p.hp;
    expect(baseline).toBeGreaterThan(0);
    p.hp = p.maxHp;
    const z = castZone(w, p, 'wa_goo_whispers', composed);
    tick(w, z);
    expect(z.slowMult).toBe(1);
    expect(enemyDebuffs(boss.buffs.map(buffView), p.id).map((s) => s.kind)).toEqual([
      'curse',
      'weak',
    ]);
    expect(controlledSpellMultiplier(boss, 0.35)).toBe(1);
    resolveBossAbility(w, boss, attack, boss.action);
    expect(p.maxHp - p.hp).toBeCloseTo(baseline * 0.8);
    p.subclassPassiveId = 'old_one_dread_insight';
    expect(damageBoss(w, p, boss, 100)).toBeCloseTo(124.2);
    tickBuffs(boss, 2.1);
    expect(damageBoss(w, p, boss, 100)).toBe(100);
  });
  it('weakens real add attacks too and keeps equivalent caster debuffs nonmultiplying', () => {
    const { w, p } = setup();
    const a = add(w, p.pos);
    const z = castZone(w, p, 'wa_goo_whispers', composed);
    z.pos = { ...p.pos };
    tick(w, z);
    z.ownerId = w.players[1].id;
    tick(w, z);
    applyBuff(a, makeBuff('damageDealt', 1.5, 5, 'empower'));
    const hp = p.hp;
    (w as unknown as { updateAdds(dt: number): void }).updateAdds(0);
    expect(hp - p.hp).toBeCloseTo(ADD_DAMAGE * 1.5 * 0.8);
    a.buffs.filter((b) => b.source.startsWith('curseWeakness:')).forEach((b) => (b.remaining = 0));
    expect(buffMult(a, 'damageDealt')).toBe(1.5);
  });
  it('respects flight and arming; Fire Pit leaves a longer mobile pressure window', () => {
    const { w, p } = setup();
    const z = castZone(w, p, 'wa_fiend_pit', composed);
    expect(z.armRemaining).toBeGreaterThan(0);
    expect(personallyCursed(p.id, w.boss!)).toBe(false);
    applyBuff(w.boss!, makeBuff('flight', 0, 5, 'test'));
    tick(w, z);
    expect(personallyCursed(p.id, w.boss!)).toBe(false);
    z.airborne = true;
    tick(w, z);
    expect(w.boss!.buffs.find((b) => b.kind === 'curse')!.remaining).toBe(4);
    expect(w.serialize().groundZones[0].curseStyle).toBe('searing');
  });
  it('siphons distinct nearby personal marks, preserves them, and caps both targets and protection', () => {
    const { w, p } = setup();
    bind(p, 'wa_fiend_resilience', composed);
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(absorptionAmount(p.buffs)).toBe(30);
    mark(p, w.boss!);
    mark(p, w.boss!, 'dread'); // two marks, one body
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(absorptionAmount(p.buffs)).toBe(50);
    const a = add(w);
    mark(p, a);
    mark(p, add(w));
    const dead = add(w);
    dead.hp = 0;
    mark(p, dead);
    const far = add(w, { x: 1100, y: 400 });
    mark(p, far);
    w.events = [];
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(absorptionAmount(p.buffs)).toBe(65); // 70 authored, shared 50%-HP ceiling
    expect(w.events.filter((e) => e.t === 'support' && e.sourceId !== p.id)).toHaveLength(2);
    expect(w.boss!.buffs.filter((b) => b.kind === 'curse')).toHaveLength(2);
    expect(a.buffs[0].remaining).toBe(4);
    expect(absorptionAmount(w.players[1].buffs)).toBe(0);
    damagePlayer(w, p, 50);
    expect(p.hp).toBe(p.maxHp);
    expect(absorptionAmount(p.buffs)).toBe(15);
    damagePlayer(w, p, 20);
    expect(p.hp).toBe(p.maxHp - 5);
    expect(absorptionAmount(p.buffs)).toBe(0);
  });
  it('earns siphon protection through real damage, not invulnerable targets, and does not recur', () => {
    const { w, p } = setup();
    bind(p, 'wa_fiend_resilience', composed);
    mark(p, w.boss!);
    applyBuff(w.boss!, makeBuff('invuln', 0, 3, 'test'));
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(absorptionAmount(p.buffs)).toBe(30);
    expect(p.stats.damageDealt).toBe(0);
    w.boss!.buffs = w.boss!.buffs.filter((b) => b.kind !== 'invuln');
    p.subclassPassiveId = 'fiend_soul_ember';
    p.hp = 80;
    const hp = w.boss!.hp;
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(hp - w.boss!.hp).toBeCloseTo(23); // 20 base, personal curse +15%
    expect(p.hp).toBe(86.5); // one normal gated Soul Ember, not a second drain
    expect(absorptionAmount(p.buffs)).toBe(50);
    expect(w.boss!.buffs.filter((b) => b.kind === 'curse')).toHaveLength(1);
  });
  it('preserves the base Rebuke counterburst on shield-absorbed contact', () => {
    const { w, p } = setup();
    bind(p, 'wa_fiend_resilience', composed);
    mark(p, w.boss!);
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    resolvePlayerAbility(w, p, 'a2', ZERO);
    const hp = w.boss!.hp;
    damagePlayer(w, p, 10);
    expect(p.hp).toBe(p.maxHp);
    expect(absorptionAmount(p.buffs)).toBe(40);
    expect(hp - w.boss!.hp).toBeCloseTo(13.8); // 40% of 30, with personal curse
    damagePlayer(w, p, 10);
    expect(hp - w.boss!.hp).toBeCloseTo(13.8); // only one armed counterburst
  });
  it('cannot use allied, expired, dead or out-of-range marks as siphon fuel', () => {
    const { w, p } = setup();
    bind(p, 'wa_fiend_resilience', composed);
    mark(w.players[1], w.boss!);
    mark(p, add(w), 'searing', 1.15, 0);
    const dead = add(w);
    dead.hp = 0;
    mark(p, dead);
    mark(p, add(w, { x: 1100, y: 400 }));
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(absorptionAmount(p.buffs)).toBe(30);
    p.buffs[0].mult = 60;
    p.buffs[0].remaining = 1;
    w.events = [];
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(p.buffs[0].remaining).toBe(1); // weaker casts cannot prolong another shield
    expect(w.events.filter((e) => e.t === 'support')).toHaveLength(0);
  });
});

it('builds Soul Ember at full health, preserves failed grants, and heals on its next eligible proc', () => {
  const { w, p } = setup();
  p.subclassPassiveId = 'fiend_soul_ember';
  mark(p, w.boss!);
  damageBoss(w, p, w.boss!, 10);
  expect(p.subclassPassiveCooldowns?.fiend_soul_ember).toBe(6);
  expect(absorptionAmount(p.buffs)).toBeCloseTo(15.6);
  tickSubclassPassives(p, 6);
  damageBoss(w, p, w.boss!, 10);
  expect(p.subclassPassiveCooldowns?.fiend_soul_ember).toBe(0);
  p.hp = 80;
  damageBoss(w, p, w.boss!, 10);
  expect(p.hp).toBe(86.5);
  expect(p.subclassPassiveCooldowns?.fiend_soul_ember).toBe(6);
});

it.each(ids)(
  '%s preserves Honed/grand and copied/Forge contracts without raising difficulty credit',
  (id) => {
    const { w, p } = setup();
    const ab = bind(p, id, true);
    const before = structuredClone(ab);
    const powerBefore = heroPowerRatio(p);
    applySubSkillUpgrades(p, [`subup_${id}`]);
    applySubclassGrands(p, [id.includes('fiend') ? 'wa_fiend_g_a' : 'wa_great_old_one_g_a']);
    const copy = recompose(refreshComponents(ab), ab);
    expect(copy.curseStyle).toBe(before.curseStyle);
    if (copy.absorption) {
      expect(copy.absorption.curseSiphon!.amount).toBeGreaterThan(
        before.absorption!.curseSiphon!.amount,
      );
      expect(copy.absorption.curseSiphon!.range).toBeGreaterThan(
        before.absorption!.curseSiphon!.range,
      );
      expect(copy.absorption.curseSiphon!.maxTargets).toBe(2);
      expect(copy.absorption.balanceAmount).toBe(0);
      expect(describeAbility(copy)).toContain('personally cursed enemies');
      expect(heroPowerRatio(p)).toBeCloseTo(powerBefore, 10);
      const baseline = { ...getSubSkill(id)!.ability, slot: 'sub1' as const };
      expect(baseline.absorption!.amount).toBe(30); // upgrades never mutate canonical donors
      expect(baseline.absorption!.curseSiphon!.amount).toBe(20);
    } else {
      expect(describeAbility(copy)).toContain(`${copy.curseStyle} curse`);
      expect(copy.curseBonus).toBe(0.15);
    }
    for (let seed = 0; seed < 12; seed++) {
      const fused = synthesizeAbility(seed, 'curse', 'a3', [
        { name: ab.name, classId: 'warlock', className: 'Warlock', slot: 'a3', def: ab },
      ]).def;
      expect(describeAbility(fused)).toBeTruthy();
    }
    // The same copied abilities resolve on a different active class.
    p.classId = 'mage';
    p.subAbilities = { sub1: copy };
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(copy.absorption ? absorptionAmount(p.buffs) > 0 : w.groundZones.length > 0).toBe(true);
  },
);

it('carries curse riders on a composed projectile impact, including airborne reach', () => {
  const { w, p } = setup();
  const source = { ...getSubSkill('wa_goo_whispers')!.ability, slot: 'sub1' as const };
  const comp = decompose(source);
  comp.delivery = { kind: 'projectile', projSpeed: 600, projCount: 1, spreadDeg: 0 };
  const copy = recompose(comp, source);
  p.subAbilities = { sub1: copy };
  resolvePlayerAbility(w, p, 'sub1', ZERO);
  const shot = w.projectiles[0];
  expect(shot.onImpact?.curseStyle).toBe('dread');
  shot.pos = { ...w.boss!.pos };
  shot.onImpact!.airborne = true;
  (w as unknown as { spawnImpactZone(p: typeof shot): void }).spawnImpactZone(shot);
  applyBuff(w.boss!, makeBuff('flight', 0, 5, 'test'));
  tick(w, w.groundZones[0]);
  expect(buffMult(w.boss!, 'damageDealt')).toBe(0.8);
});

it('prices the maximum siphon and dread payload; bounds malformed Forge bonuses', () => {
  const source = { ...getSubSkill('wa_fiend_resilience')!.ability, slot: 'sub1' as const };
  const g = source.absorption!;
  expect(absorptionMaximum(g)).toBe(70);
  expect(componentValue(decompose(source))).toBeGreaterThan(
    componentValue(decompose({ ...source, absorption: { ...g, curseSiphon: undefined } })),
  );
  expect(scaleAbsorption(g, 0.5).curseSiphon!.amount).toBe(10);
  expect(absorptionDescription({ ...g, target: 'nearby' })).not.toContain('siphon hits');
  const comp = decompose(source);
  if (comp.effects[0].kind === 'absorption')
    comp.effects[0].grant.curseSiphon = { range: 9999, amount: 9999, maxTargets: 9999 };
  const copy = recompose(refreshComponents(recompose(comp, source)), source);
  expect(copy.absorption!.curseSiphon).toEqual({ range: 500, amount: 50, maxTargets: 2 });
  const dread = { ...getSubSkill('wa_goo_whispers')!.ability, slot: 'sub1' as const };
  expect(componentValue(decompose(dread))).toBeGreaterThan(
    componentValue(decompose({ ...dread, curseStyle: 'hex' })),
  );
});

it('replicates ownership safely, keeps legacy marks and distinct color-independent zone seals', () => {
  for (const source of [
    'curse:9',
    'curse:9:searing',
    'curse:9:dread',
    'curse:9:hex:22',
    'curse:9:dread:23',
  ]) {
    expect(curseOwner(source)).toBe(9);
    expect(buffView(makeBuff('curse', 1.15, 3, source)).ownerId).toBe(9);
    expect(buffView(makeBuff('curse', 1.15, 3, source))).not.toHaveProperty('source');
  }
  expect(curseOwner('curse:9:unknown')).toBeUndefined();
  expect(curseOwner('curse:99:searing')).not.toBe(9);
  expect(curseDuration('hex', 7)).toBe(7);
  const paths = ['hex', 'searing', 'dread'].map((style) => {
    const g = new Graphics();
    drawCurseSigil(g, style as 'hex' | 'searing' | 'dread', 100, 100, 1);
    return JSON.stringify(
      g.context.instructions.map((i) => ('path' in i.data ? i.data.path.instructions : [])),
    );
  });
  expect(new Set(paths).size).toBe(3);
  expect(describeAbility(getClass('warlock').abilities.a1)).toContain(
    'strongest personal mark only',
  );
});
