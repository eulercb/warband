import { afterEach, describe, expect, it } from 'vitest';
import { World } from '../src/engine/world/world';
import { resolvePlayerAbility } from '../src/engine/combat/abilities';
import {
  applyBuff,
  buffMult,
  damageAdd,
  damageBoss,
  damagePlayer,
  makeBuff,
  tickBuffs,
} from '../src/engine/combat/combat';
import { absorptionAmount, grantAbsorption } from '../src/engine/combat/absorption';
import { setSubclassPassive, tickSubclassPassives } from '../src/engine/combat/subclassPassives';
import { getSubSkill, getSubclass } from '../src/engine/content/subclasses';
import { describeAbility } from '../src/engine/content/classes';
import { applySubSkillUpgrades } from '../src/engine/content/charUpgrades';
import {
  decompose,
  recompose,
  refreshComponents,
  componentValue,
  setForgeSeed,
  synthesizeAbility,
  describeComposed,
} from '../src/engine/content/forge';
import { setProceduralSeed } from '../src/engine/content/procgen';
import { heroPowerRatio } from '../src/engine/content/balance';
import { personallyCursed } from '../src/engine/core/curses';
import { buffView } from '../src/engine/core/buffView';
import { buffBadges } from '../src/render/overlays/buffGlyphs';
import type { Add, Boss, Player, Projectile } from '../src/engine/core/types';

const ZERO = { x: 0, y: 0 };
function setup(id = 'dr_moon_roar') {
  const sub = getSubclass(
    id.startsWith('dr_')
      ? 'dr_moon'
      : id.startsWith('mg_evoker')
        ? 'mg_evoker'
        : id.startsWith('mg_')
          ? 'mg_abjurer'
          : id.startsWith('wa_fiend')
            ? 'wa_fiend'
            : 'wa_great_old_one',
  )!;
  const w = new World({
    monsterId: 'lich',
    seed: 31,
    players: [
      { peerId: 'a', name: 'Owner', classId: sub.classId, subSkills: [id] },
      { peerId: 'b', name: 'Other', classId: 'knight' },
    ],
  });
  w.scene = null;
  w.obstacles = [];
  w.terrain = [];
  const [p, other] = w.players;
  p.pos = { x: 600, y: 400 };
  p.aim = { x: 1, y: 0 };
  p.critChance = 0;
  const boss = w.boss!;
  boss.pos = { x: 670, y: 400 };
  boss.hp = boss.maxHp = 10000;
  boss.buffs = [];
  boss.decisionTimer = 100;
  return { w, p, other, boss };
}
function add(w: World, x = 680): Add {
  const a: Add = {
    id: w.allocId(),
    pos: { x, y: 400 },
    hp: 1000,
    maxHp: 1000,
    radius: 12,
    moveSpeed: 0,
    buffs: [],
    attackCd: 0,
    targetId: null,
  };
  w.adds.push(a);
  return a;
}
function mark(p: Player, target: Boss | Add) {
  applyBuff(target, makeBuff('curse', 1.15, 6, `curse:${p.id}:hex`));
}
function shot(w: World, boss: Boss) {
  const proj = w.projectiles.at(-1)!;
  proj.pos = { ...boss.pos };
  (w as unknown as { resolvePlayerProjectile: (p: Projectile) => boolean }).resolvePlayerProjectile(
    proj,
  );
}
function arm(w: World, p: Player, composed = false) {
  if (composed)
    p.subAbilities!.sub1 = recompose(decompose(p.subAbilities!.sub1!), p.subAbilities!.sub1!);
  resolvePlayerAbility(w, p, 'sub1', ZERO);
}
afterEach(() => {
  setForgeSeed(null);
  setProceduralSeed(null);
});

describe('Moon growth and independent Primal Roar follow-through', () => {
  it.each([80, 140, 280, 560])(
    'mend follows %i maxHP without scaling from damage or target count',
    (maxHp) => {
      const { w, p, boss } = setup('dr_moon_maul');
      p.maxHp = maxHp;
      p.hp = 1;
      p.damageMult = 2;
      add(w);
      resolvePlayerAbility(w, p, 'a2', ZERO);
      p.hp = 1; // base heal is not the measured effect
      resolvePlayerAbility(w, p, 'basic', ZERO);
      expect(p.hp).toBeCloseTo(1 + Math.max(4, maxHp * 0.03));
      damageBoss(w, p, boss, 1, { direct: true });
      expect(p.hp).toBeCloseTo(1 + Math.max(4, maxHp * 0.03));
    },
  );
  it.each([false, true])(
    'native/composed roar releases one bounded slowing burst (composed=%s)',
    (composed) => {
      const { w, p, boss, other } = setup();
      const a = add(w);
      const far = add(w, 1000);
      arm(w, p, composed);
      expect(p.buffs.some((b) => b.kind === 'brambleReady')).toBe(true);
      expect(buffMult(p, 'moveSpeed')).toBe(1.2); // form speed, not duplicate Roar speed
      resolvePlayerAbility(w, p, 'basic', ZERO);
      expect(boss.hp).toBeCloseTo(10000 - (14 + 24) * 1.3);
      expect(a.hp).toBeCloseTo(1000 - (14 + 24) * 1.3);
      expect(far.hp).toBe(1000);
      expect(other.hp).toBe(other.maxHp);
      expect(
        boss.buffs.some((b) => b.source === 'brambleSlow' && b.mult === 0.65 && b.remaining === 2),
      ).toBe(true);
      expect(p.buffs.some((b) => b.kind === 'brambleReady')).toBe(false);
      expect(w.events.filter((e) => e.t === 'skillArea' && e.color === 0x89c96a)).toHaveLength(1);
      resolvePlayerAbility(w, p, 'basic', ZERO);
      expect(w.events.filter((e) => e.t === 'skillArea' && e.color === 0x89c96a)).toHaveLength(1);
    },
  );
  it('works as a copied skill without bear form; misses, immunity, zone damage and distant hits preserve it', () => {
    const { w, p, boss } = setup();
    setSubclassPassive(p, undefined);
    arm(w, p);
    const start = boss.hp;
    damageBoss(w, p, boss, 0, { direct: true });
    damageBoss(w, p, boss, 2);
    boss.pos.x = 1000;
    damageBoss(w, p, boss, 2, { direct: true });
    boss.pos.x = 670;
    applyBuff(boss, makeBuff('invuln', 0, 1, 'test'));
    damageBoss(w, p, boss, 2, { direct: true });
    expect(p.buffs.some((b) => b.kind === 'brambleReady')).toBe(true);
    boss.buffs = [];
    const before = boss.hp;
    damageBoss(w, p, boss, 2, { direct: true });
    expect(before - boss.hp).toBeCloseTo((2 + 24) * 1.3);
    expect(boss.hp).toBeLessThan(start);
    expect(p.buffs.some((b) => b.kind === 'moonForm')).toBe(false);
  });
  it('can release from a nearby summon and does not slow an immune neighbor', () => {
    const { w, p, boss } = setup();
    const a = add(w);
    setSubclassPassive(p, undefined);
    arm(w, p);
    applyBuff(boss, makeBuff('invuln', 0, 4, 'test'));
    damageAdd(w, p, a, 10, { direct: true });
    expect(a.hp).toBeCloseTo(1000 - 34 * 1.3);
    expect(boss.hp).toBe(10000);
    expect(boss.buffs.some((b) => b.source === 'brambleSlow')).toBe(false);
  });
  it.each(['downed', 'dead', 'zeroHp', 'swap', 'room', 'expire'] as const)(
    'cleans prepared brambles on %s',
    (reason) => {
      const { w, p } = setup();
      arm(w, p);
      if (reason === 'downed' || reason === 'dead') p.state = reason;
      if (reason === 'zeroHp') p.hp = 0;
      if (reason === 'swap') p.classId = 'knight';
      if (reason === 'room') w.scene = 'reward';
      if (reason === 'expire') tickBuffs(p, 6);
      w.step(0, new Map());
      expect(p.buffs.some((b) => b.kind === 'brambleReady')).toBe(false);
    },
  );
  it('rejects delayed hits after a swap before the next frame cleanup', () => {
    const { w, p, boss } = setup();
    arm(w, p);
    p.classId = 'knight';
    damageBoss(w, p, boss, 10, { direct: true });
    expect(p.buffs.some((b) => b.kind === 'brambleReady')).toBe(false);
    expect(boss.buffs.some((b) => b.source === 'brambleSlow')).toBe(false);
  });
  it('uses toroidal distance and replaces, never stacks, preparation', () => {
    const { w, p, boss } = setup();
    setSubclassPassive(p, undefined);
    p.pos.x = 5;
    boss.pos.x = w.arena.w - 30;
    arm(w, p);
    arm(w, p);
    expect(p.buffs.filter((b) => b.kind === 'brambleReady')).toHaveLength(1);
    damageBoss(w, p, boss, 10, { direct: true });
    expect(boss.buffs.some((b) => b.source === 'brambleSlow')).toBe(true);
  });
});

describe('Fiend reserve and curse counterburst', () => {
  it.each([80, 130, 260, 520])(
    'grants a bounded reserve at full %i HP and caps healing',
    (maxHp) => {
      const { w, p, boss } = setup('wa_fiend_hurl');
      p.maxHp = p.hp = maxHp;
      mark(p, boss);
      damageBoss(w, p, boss, 10);
      expect(p.hp).toBe(maxHp);
      expect(p.stats.healingDone).toBe(0);
      const amount = Math.max(15, maxHp * 0.12);
      expect(absorptionAmount(p.buffs)).toBeCloseTo(amount);
      expect(p.buffs.find((b) => b.kind === 'absorption')!.remaining).toBe(6);
      damageBoss(w, p, boss, 10);
      expect(absorptionAmount(p.buffs)).toBeCloseTo(amount);
      damagePlayer(w, p, amount + 1);
      expect(p.hp).toBeCloseTo(maxHp - 1);
      tickSubclassPassives(p, 6);
      damageBoss(w, p, boss, 10);
      expect(p.hp).toBe(maxHp);
      expect(p.stats.healingDone).toBeCloseTo(1);
      expect(p.buffs.some((b) => b.kind === 'damageTaken')).toBe(false);
    },
  );
  it('preserves a full-health failed shield gate; a stronger pool does not prevent a useful heal', () => {
    const { w, p, boss } = setup('wa_fiend_hurl');
    mark(p, boss);
    grantAbsorption(p, 50, 8);
    damageBoss(w, p, boss, 10);
    expect(p.subclassPassiveCooldowns?.fiend_soul_ember).toBeUndefined();
    expect(p.buffs.find((b) => b.kind === 'absorption')!.remaining).toBe(8);
    p.hp -= 20;
    damageBoss(w, p, boss, 10);
    expect(p.hp).toBeCloseTo(p.maxHp - 13.5);
    expect(absorptionAmount(p.buffs)).toBe(50);
    expect(p.subclassPassiveCooldowns?.fiend_soul_ember).toBe(6);
  });
  it.each([false, true])(
    'Fiendish counterburst curses nearby combatants once (composed=%s)',
    (composed) => {
      const { w, p, boss, other } = setup('wa_fiend_rebuke');
      const a = add(w);
      const far = add(w, 1000);
      arm(w, p, composed);
      const before = boss.hp;
      damagePlayer(w, p, 1);
      expect(personallyCursed(p.id, boss)).toBe(true);
      expect(personallyCursed(p.id, a)).toBe(true);
      expect(personallyCursed(other.id, boss)).toBe(false);
      expect(personallyCursed(p.id, far)).toBe(false);
      expect(before - boss.hp).toBeCloseTo(36 * 0.4 * 1.15);
      expect(boss.buffs.find((b) => b.kind === 'curse')!.remaining).toBe(4);
      expect(p.buffs.some((b) => b.kind === 'rebuke')).toBe(false);
      expect(absorptionAmount(p.buffs)).toBeCloseTo(15.6);
      const once = boss.hp;
      damagePlayer(w, p, 1);
      expect(boss.hp).toBe(once);
    },
  );
  it('base Rebuke remains uncursed and the new copied counterburst needs no Fiend passive', () => {
    const { w, p, boss } = setup('wa_fiend_rebuke');
    setSubclassPassive(p, undefined);
    resolvePlayerAbility(w, p, 'a2', ZERO);
    damagePlayer(w, p, 1);
    expect(personallyCursed(p.id, boss)).toBe(false);
    arm(w, p);
    damagePlayer(w, p, 1);
    expect(personallyCursed(p.id, boss)).toBe(true);
    expect(absorptionAmount(p.buffs)).toBe(0);
  });
});

describe('Mind Blast curse ownership and Mage cadence', () => {
  it.each([false, true])(
    'native/composed Mind Blast weakens its own cursed foe on actual impact (composed=%s)',
    (composed) => {
      const { w, p, other, boss } = setup('wa_goo_blast');
      mark(p, boss);
      arm(w, p, composed);
      expect(boss.buffs.some((b) => b.source === 'mindBlastWindup')).toBe(false);
      shot(w, boss);
      expect(buffMult(boss, 'damageDealt')).toBe(0.85);
      expect(boss.buffs.find((b) => b.source === 'mindBlastWindup')?.remaining).toBe(3);
      expect(boss.buffs.find((b) => b.source === 'mindBlastWindup')?.mult).toBe(1.4);
      applyBuff(boss, makeBuff('damageDealt', 0.8, 4, `curseWeakness:${other.id}:dread`));
      expect(buffMult(boss, 'damageDealt')).toBe(0.8); // strongest equivalent weakness, not multiplied
      tickBuffs(boss, 4);
      expect(buffMult(boss, 'damageDealt')).toBe(1);
    },
  );
  it.each(['none', 'other', 'expired', 'immune', 'zero', 'dead'] as const)(
    'does not exploit %s targets',
    (reason) => {
      const { w, p, other, boss } = setup('wa_goo_blast');
      if (reason !== 'none') mark(reason === 'other' ? other : p, boss);
      if (reason === 'expired') tickBuffs(boss, 6);
      if (reason === 'immune') applyBuff(boss, makeBuff('invuln', 0, 3, 'test'));
      if (reason === 'dead') boss.hp = 0;
      damageBoss(w, p, boss, reason === 'zero' ? 0 : 10, { direct: true, cursePayoff: 3 });
      expect(boss.buffs.some((b) => b.source === 'mindBlastWindup')).toBe(false);
    },
  );
  it('works on cursed summons and cannot exploit a zone tick', () => {
    const { w, p } = setup('wa_goo_blast');
    const a = add(w);
    mark(p, a);
    damageAdd(w, p, a, 10, { cursePayoff: 3 });
    expect(buffMult(a, 'damageDealt')).toBe(1);
    damageAdd(w, p, a, 10, { direct: true, cursePayoff: 3 });
    expect(buffMult(a, 'damageDealt')).toBe(0.85);
  });
  it.each([100, 200, 400])(
    'Abjurer barrier scales at %i HP without stacking or extra power credit',
    (maxHp) => {
      const { w, p, boss } = setup('mg_abjurer_ward');
      p.maxHp = p.hp = maxHp;
      applyBuff(boss, makeBuff('root', 0, 4, 'test'));
      const power = heroPowerRatio(p);
      damageBoss(w, p, boss, 10, { direct: true });
      expect(absorptionAmount(p.buffs)).toBe(Math.max(20, maxHp * 0.1));
      expect(heroPowerRatio(p)).toBe(power);
    },
  );
  it.each([1, 0.5, 0.1])(
    'Evoker refunds actual running control/burst cooldowns at haste %s, never below zero',
    (haste) => {
      const { w, p, boss } = setup('mg_evoker_lightning');
      expect(p.abilities!.a1.cooldown).toBe(14);
      expect(p.abilities!.a2.cooldown).toBe(20);
      p.cooldowns.a1 = 14 * haste;
      p.cooldowns.a2 = 20 * haste;
      p.cooldowns.basic = 1;
      applyBuff(boss, makeBuff('moveSpeed', 0.6, 3, 'test'));
      damageBoss(w, p, boss, 10, { direct: true });
      expect(p.cooldowns.a1).toBe(Math.max(0, 14 * haste - 4));
      expect(p.cooldowns.a2).toBe(Math.max(0, 20 * haste - 4));
      expect(p.cooldowns.basic).toBe(1);
      const snapshot = { ...p.cooldowns };
      damageBoss(w, p, boss, 10, { direct: true });
      expect(p.cooldowns).toEqual(snapshot);
    },
  );
});

describe('new payload compatibility, visibility and difficulty credit', () => {
  it.each(['dr_moon_roar', 'wa_fiend_rebuke', 'wa_goo_blast'])(
    '%s survives Honed replay and component refresh without modifying shared data',
    (id) => {
      const { p } = setup(id);
      const original = structuredClone(getSubSkill(id)!.ability);
      const before = heroPowerRatio(p);
      const ab = p.subAbilities!.sub1!;
      const plain = { ...ab };
      delete plain.closeBurst;
      delete plain.rebukeCurseBonus;
      delete plain.cursePayoff;
      p.subAbilities!.sub1 = plain;
      expect(heroPowerRatio(p)).toBe(before);
      p.subAbilities!.sub1 = ab;
      const parts = decompose(ab);
      expect(componentValue(parts)).toBeGreaterThan(0);
      applySubSkillUpgrades(p, [`subup_${id}`]);
      const copied = recompose(refreshComponents(p.subAbilities!.sub1), p.subAbilities!.sub1);
      if (id === 'dr_moon_roar') {
        expect(copied.closeBurst!.damage).toBe(27);
        expect(copied.closeBurst!.radius).toBe(135);
      }
      if (id === 'wa_fiend_rebuke') expect(copied.rebukeCurseBonus).toBe(0.15);
      if (id === 'wa_goo_blast') expect(copied.cursePayoff).toBe(3);
      expect(getSubSkill(id)!.ability).toEqual(original);
      expect(describeAbility(copied)).toMatch(/burst|cursed foe/);
      expect(describeComposed(decompose(copied), copied.cooldown)).toMatch(/burst|cursed foe/);
    },
  );
  it('new Forge components can be selected, scaled and capped across seeds', () => {
    const ids = ['dr_moon_roar', 'wa_fiend_rebuke', 'wa_goo_blast'];
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++)
      for (const id of ids) {
        const ab = { ...getSubSkill(id)!.ability, slot: 'sub1' as const };
        const generated = synthesizeAbility(seed, 'batch-a', 'a1', [
          { name: ab.name, classId: 'druid', className: 'Druid', slot: 'a1', def: ab },
          {
            name: `${ab.name} echo`,
            classId: 'druid',
            className: 'Druid',
            slot: 'a1',
            def: ab,
          },
        ]).def;
        for (const e of generated.components!.effects)
          if (
            e.kind === 'closeBurst' ||
            e.kind === 'cursePayoff' ||
            (e.kind === 'rebuke' && e.curseBonus)
          )
            seen.add(e.kind);
        expect(Number.isFinite(generated.cooldown)).toBe(true);
      }
    expect(seen).toEqual(new Set(['closeBurst', 'cursePayoff', 'rebuke']));
  });
  it('replicates the bramble badge without its host payload', () => {
    const { w, p } = setup();
    arm(w, p);
    const charge = p.buffs.find((b) => b.kind === 'brambleReady')!;
    expect(buffBadges([buffView(charge)]).some((b) => b.label.startsWith('Bramble ready:'))).toBe(
      true,
    );
    expect(buffView(charge)).not.toHaveProperty('closeBurst');
    const snapshot = w.serialize();
    expect(snapshot.players[0].buffs.find((b) => b.kind === 'brambleReady')).not.toHaveProperty(
      'closeBurst',
    );
  });
});
