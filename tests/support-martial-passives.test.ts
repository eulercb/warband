import { describe, expect, it } from 'vitest';
import { World } from '../src/engine/world/world';
import { getSubclass } from '../src/engine/content/subclasses';
import { resolvePlayerAbility } from '../src/engine/combat/abilities';
import {
  damageBoss,
  damageAdd,
  damagePlayer,
  applyBuff,
  makeBuff,
  tickBuffs,
} from '../src/engine/combat/combat';
import { tickSubclassPassives, setSubclassPassive } from '../src/engine/combat/subclassPassives';
import { armPaladinAura, updatePaladinAuras } from '../src/engine/combat/paladinAuras';
import { absorptionAmount, grantAbsorption } from '../src/engine/combat/absorption';
import { grantFrontGuard } from '../src/engine/combat/defense';
import { decompose, recompose, setForgeSeed } from '../src/engine/content/forge';
import { setProceduralSeed } from '../src/engine/content/procgen';
import { buffBadges } from '../src/render/overlays/buffGlyphs';
import type { Add, ClassId, InputCommand } from '../src/engine/core/types';
const ZERO = { x: 0, y: 0 };
const cohort = [
  'kn_champion',
  'kn_battlemaster',
  'cl_light',
  'cl_life',
  'pa_devotion',
  'pa_vengeance',
];
function setup(sub: string, choice = 0, party = false) {
  const def = getSubclass(sub)!;
  const w = new World({
    monsterId: 'dragon',
    seed: 21,
    players: [
      { peerId: 'a', name: 'A', classId: def.classId, subSkills: [def.skills[choice].id] },
      ...(party ? [{ peerId: 'b', name: 'B', classId: 'knight' as ClassId }] : []),
    ],
  });
  w.obstacles = [];
  w.terrain = [];
  w.scene = null;
  const p = w.players[0];
  p.pos = { x: 600, y: 400 };
  p.aim = { x: 1, y: 0 };
  p.critChance = 0;
  for (const a of w.players.slice(1)) a.pos = { x: 650, y: 400 };
  const boss = w.boss!;
  boss.pos = { x: 640, y: 400 };
  boss.hp = boss.maxHp = 10000;
  boss.facing = Math.PI;
  return { w, p, boss, ally: w.players[1] };
}
function impact(w: World) {
  const shot = w.projectiles.at(-1)!;
  shot.pos = { ...w.boss!.pos };
  (
    w as unknown as { resolvePlayerProjectile: (p: typeof shot) => boolean }
  ).resolvePlayerProjectile(shot);
}
function aura(w: World, kind: 'renewal' | 'pursuit' | 'bulwark' = 'pursuit') {
  armPaladinAura(w, w.players[0], {
    ...w.players[0].abilities!.a3,
    paladinAura: { kind, radius: 220, duration: 5 },
  });
}
function add(w: World): Add {
  const a: Add = {
    id: w.allocId(),
    pos: { ...w.boss!.pos },
    hp: 1000,
    maxHp: 1000,
    moveSpeed: 0,
    radius: 12,
    buffs: [],
    targetId: null,
    attackCd: 0,
  };
  w.adds.push(a);
  return a;
}

describe('loadout feasibility: every choice has a base-kit route', () => {
  it.each(cohort)('%s unlocks from any choice and remains authored in Forge/variance', (sub) => {
    const def = getSubclass(sub)!;
    for (let choice = 0; choice < 4; choice++) {
      const { w, p, boss } = setup(sub, choice);
      expect(p.subclassPassiveId).toBe(def.passive!.id);
      switch (sub) {
        case 'kn_champion': {
          p.hp -= 40;
          const before = p.hp;
          resolvePlayerAbility(w, p, 'a1', ZERO);
          damagePlayer(w, p, 20, boss.pos);
          resolvePlayerAbility(w, p, 'basic', ZERO);
          expect(p.hp).toBeGreaterThan(before);
          break;
        }
        case 'kn_battlemaster':
          resolvePlayerAbility(w, p, 'a3', ZERO);
          resolvePlayerAbility(w, p, 'basic', ZERO);
          expect(p.buffs.some((b) => b.kind === 'counter')).toBe(true);
          break;
        case 'cl_light':
          p.hp -= 20;
          resolvePlayerAbility(w, p, 'a1', ZERO);
          expect(p.buffs.some((b) => b.kind === 'radiantCharge')).toBe(true);
          break;
        case 'cl_life':
          resolvePlayerAbility(w, p, 'a1', ZERO);
          expect(absorptionAmount(p.buffs)).toBe(25);
          break;
        case 'pa_devotion':
          resolvePlayerAbility(w, p, 'a3', ZERO);
          expect(p.buffs.some((b) => b.kind === 'steadfast')).toBe(true);
          break;
        case 'pa_vengeance':
          resolvePlayerAbility(w, p, 'a3', ZERO);
          resolvePlayerAbility(w, p, 'basic', ZERO);
          expect(p.paladinAura!.remaining).toBe(7);
          break;
      }
    }
    try {
      setProceduralSeed(23);
      setForgeSeed(34);
      expect(getSubclass(sub)!.passive).toEqual(def.passive);
    } finally {
      setForgeSeed(null);
      setProceduralSeed(null);
    }
  });
  it.each([false, true])('Wild works with real input cadence (autofire=%s)', (autofire) => {
    const { w, p, boss } = setup('so_wild');
    boss.decisionTimer = 100;
    boss.moveSpeed = 0;
    const step = (held: boolean) => {
      const cmd: InputCommand = {
        seq: 0,
        move: ZERO,
        aim: { x: 1, y: 0 },
        autofire,
        buttons: { basic: held, a1: false, a2: false, a3: false, revive: false },
      };
      w.step(0.05, new Map([['a', cmd]]));
    };
    p.cooldowns.a2 = 12;
    resolvePlayerAbility(w, p, 'a2', ZERO);
    if (autofire) for (let i = 0; i < 60; i++) step(true);
    else {
      for (let i = 0; i < 60; i++) step(true);
      expect(p.buffs.some((b) => b.kind === 'wildWeave')).toBe(false);
      for (let press = 0; press < 2; press++) {
        for (let i = 0; i < 20; i++) step(false);
        step(true);
      }
    }
    expect(p.buffs.filter((b) => b.kind === 'spellSurge')).toHaveLength(1);
    expect(p.subclassPassiveCooldowns!.wild_spell_weave).toBeGreaterThan(0);
  });
  it.each([0, 1, 2, 3])('Wild choice %i needs no special skill combination', (choice) => {
    const { w, p } = setup('so_wild', choice);
    p.cooldowns.a2 = 12;
    resolvePlayerAbility(w, p, 'a2', ZERO);
    damageBoss(w, p, w.boss!, 10, { direct: true });
    expect(p.cooldowns.a2).toBe(10);
    expect(p.buffs.filter((b) => b.kind === 'spellSurge')).toHaveLength(1);
  });
});

describe('Knight recovery, tactics and solo Taunt', () => {
  it.each([false, true])(
    'Taunt protects solo and preserves stronger blocks (composed=%s)',
    (composed) => {
      const { w, p, boss } = setup('kn_champion');
      if (composed)
        p.abilities!.a1 = recompose(decompose(p.abilities!.a1), {
          slot: 'a1',
          name: 'Taunt',
          cooldown: 12,
        });
      resolvePlayerAbility(w, p, 'a1', ZERO);
      expect(w.tauntTargetId).toBe(p.id);
      expect(w.tauntTimer).toBe(4);
      const hp = p.hp;
      damagePlayer(w, p, 40, boss.pos);
      expect(p.hp).toBe(hp);
      expect(p.buffs.some((b) => b.kind === 'counter')).toBe(true);
      resolvePlayerAbility(w, p, 'a2', ZERO);
      resolvePlayerAbility(w, p, 'a1', ZERO);
      expect(p.buffs.filter((b) => b.kind === 'frontGuard')).toHaveLength(1);
      expect(p.buffs.find((b) => b.kind === 'frontGuard')!.mult).toBe(2);
    },
  );
  it('front guard never stacks sources, preserves equal guards, and expires', () => {
    const { w, p, boss } = setup('kn_champion');
    grantFrontGuard(p, 1, 4);
    grantFrontGuard(p, 1, 3);
    expect(p.buffs.find((b) => b.kind === 'frontGuard')!.remaining).toBe(4);
    grantFrontGuard(p, 1, 5);
    expect(p.buffs.filter((b) => b.kind === 'frontGuard')).toHaveLength(1);
    tickBuffs(p, 5);
    const hp = p.hp;
    damagePlayer(w, p, 10, boss.pos);
    expect(p.hp).toBeLessThan(hp);
  });
  it('Champion only heals a real counter, keeps its gate at full HP and respects immunity and cooldown', () => {
    const { w, p, boss } = setup('kn_champion');
    applyBuff(p, makeBuff('counter', 1.3, 4, 'test'));
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(p.subclassPassiveCooldowns?.champion_reprise).toBeUndefined();
    p.hp -= 60;
    const hp = p.hp;
    applyBuff(p, makeBuff('counter', 1.3, 4, 'test'));
    applyBuff(boss, makeBuff('invuln', 0, 2, 'test'));
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(p.hp).toBe(hp);
    expect(p.buffs.some((b) => b.kind === 'counter')).toBe(true);
    boss.buffs = [];
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(p.hp - hp).toBeCloseTo(Math.min(20, p.maxHp * 0.08));
    applyBuff(p, makeBuff('counter', 1.3, 4, 'test'));
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(p.hp - hp).toBeCloseTo(Math.min(20, p.maxHp * 0.08));
    tickSubclassPassives(p, 6);
    applyBuff(p, makeBuff('counter', 1.3, 4, 'test'));
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(p.hp - hp).toBeCloseTo(2 * Math.min(20, p.maxHp * 0.08));
  });
  it('Battlemaster and guarded counters share one readiness instead of hidden stacked hits', () => {
    const { w, p, boss } = setup('kn_battlemaster');
    applyBuff(boss, makeBuff('root', 0, 3, 'root'));
    damageBoss(w, p, boss, 10, { direct: true });
    resolvePlayerAbility(w, p, 'a2', ZERO);
    damagePlayer(w, p, 20, boss.pos);
    expect(p.buffs.filter((b) => b.kind === 'counter')).toHaveLength(1);
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(p.buffs.some((b) => b.kind === 'counter')).toBe(false);
  });
  it('Battlemaster excludes ticks and expired control, preserves a counter, and shares one gate across foes', () => {
    const { w, p, boss } = setup('kn_battlemaster');
    applyBuff(boss, makeBuff('root', 0, 0, 'expired'));
    damageBoss(w, p, boss, 10, { direct: true });
    expect(p.buffs.some((b) => b.kind === 'counter')).toBe(false);
    applyBuff(boss, makeBuff('root', 0, 3, 'root'));
    damageBoss(w, p, boss, 10);
    expect(p.buffs.some((b) => b.kind === 'counter')).toBe(false);
    applyBuff(p, makeBuff('counter', 1.5, 4, 'other'));
    damageBoss(w, p, boss, 10, { direct: true });
    expect(p.subclassPassiveCooldowns?.battle_opening).toBeUndefined();
    p.buffs = [];
    const a = add(w);
    a.buffs = [makeBuff('moveSpeed', 0.5, 3, 'slow')];
    damageAdd(w, p, a, 10, { direct: true });
    expect(p.buffs.find((b) => b.kind === 'counter')!.mult).toBe(1.3);
    expect(a.buffs.some((b) => b.kind === 'castSlow')).toBe(true);
    p.buffs = [];
    damageBoss(w, p, boss, 10, { direct: true });
    expect(p.buffs).toHaveLength(0);
    tickSubclassPassives(p, 6);
    damageBoss(w, p, boss, 10, { direct: true });
    expect(p.buffs.some((b) => b.kind === 'counter')).toBe(true);
  });
});

describe('Cleric active follow-through and preemptive healing', () => {
  it.each([false, true])(
    'Light readies from effective healing and spends only on a connecting direct hit (composed=%s)',
    (composed) => {
      const { w, p, boss } = setup('cl_light');
      if (composed)
        p.abilities!.a1 = recompose(decompose(p.abilities!.a1), {
          slot: 'a1',
          name: 'Heal',
          cooldown: 3,
        });
      resolvePlayerAbility(w, p, 'a1', ZERO);
      expect(p.buffs.some((b) => b.kind === 'radiantCharge')).toBe(false);
      p.hp -= 20;
      resolvePlayerAbility(w, p, 'a1', ZERO);
      expect(buffBadges(p.buffs, 20).some((b) => b.label.includes('Refulgence'))).toBe(true);
      damageBoss(w, p, boss, 10);
      expect(p.buffs.some((b) => b.kind === 'radiantCharge')).toBe(true);
      const before = boss.hp;
      damageBoss(w, p, boss, 20, { direct: true });
      expect(before - boss.hp).toBe(25);
      expect(boss.buffs.some((b) => b.kind === 'castSlow' && b.mult === 1.3)).toBe(true);
      expect(p.buffs.some((b) => b.kind === 'radiantCharge')).toBe(false);
      p.hp -= 10;
      resolvePlayerAbility(w, p, 'a1', ZERO);
      expect(p.buffs.some((b) => b.kind === 'radiantCharge')).toBe(false);
      tickSubclassPassives(p, 6);
      p.hp -= 10;
      resolvePlayerAbility(w, p, 'a1', ZERO);
      resolvePlayerAbility(w, p, 'basic', ZERO);
      impact(w);
      expect(p.buffs.some((b) => b.kind === 'radiantCharge')).toBe(false);
    },
  );
  it('Light protection works at full HP, but an unsuccessful weaker barrier does not spend its gate', () => {
    const { w, p } = setup('cl_light', 3);
    grantAbsorption(p, p.maxHp * 0.5, 9);
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(p.buffs.some((b) => b.kind === 'radiantCharge')).toBe(false);
    p.buffs = [];
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(p.buffs.some((b) => b.kind === 'radiantCharge')).toBe(true);
    tickSubclassPassives(p, 6);
    p.hp -= 5;
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(p.buffs.filter((b) => b.kind === 'radiantCharge')).toHaveLength(1);
    tickBuffs(p, 6);
    expect(p.buffs.some((b) => b.kind === 'radiantCharge')).toBe(false);
  });
  it.each([false, true])(
    'Life converts full-health overheal to capped protection without fake healing or recursion (composed=%s)',
    (composed) => {
      const { w, p } = setup('cl_life');
      if (composed)
        p.abilities!.a1 = recompose(decompose(p.abilities!.a1), {
          slot: 'a1',
          name: 'Heal',
          cooldown: 3,
        });
      resolvePlayerAbility(w, p, 'a1', ZERO);
      expect(absorptionAmount(p.buffs)).toBe(25);
      expect(p.stats.healingDone).toBe(0);
      expect(p.buffs.find((b) => b.kind === 'absorption')!.remaining).toBe(6);
      resolvePlayerAbility(w, p, 'a1', ZERO);
      expect(absorptionAmount(p.buffs)).toBe(25);
      tickSubclassPassives(p, 6);
      grantAbsorption(p, p.maxHp * 0.5, 9);
      resolvePlayerAbility(w, p, 'a1', ZERO);
      expect(absorptionAmount(p.buffs)).toBe(p.maxHp * 0.5);
      expect(p.subclassPassiveCooldowns!.life_abundance).toBe(0);
    },
  );
  it('Life ignores pure healing without overheal and downed recipients; swapping does not reset the proc gate', () => {
    const { w, p } = setup('cl_life');
    p.hp = 20;
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(p.subclassPassiveCooldowns?.life_abundance).toBeUndefined();
    p.hp = p.maxHp;
    resolvePlayerAbility(w, p, 'a1', ZERO);
    const id = p.subclassPassiveId;
    setSubclassPassive(p, undefined);
    setSubclassPassive(p, id);
    expect(p.subclassPassiveCooldowns!.life_abundance).toBe(6);
    tickSubclassPassives(p, 6);
    p.state = 'downed';
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(p.subclassPassiveCooldowns!.life_abundance).toBe(0);
  });
});

describe('Paladin aura identity', () => {
  it('Devotion cleanses nearby allies once on activation, grants control resistance and never pulses a refresh', () => {
    const { w, p, ally } = setup('pa_devotion', 0, true);
    for (const target of [p, ally]) {
      target.buffs = [
        makeBuff('root', 0, 4, 'root'),
        makeBuff('stun', 0, 4, 'stun'),
        makeBuff('silence', 0, 4, 'silence'),
        makeBuff('moveSpeed', 0.5, 4, 'slow'),
      ];
      target.shove = { vx: 300, vy: 0, remaining: 1 };
    }
    aura(w);
    for (const target of [p, ally]) {
      expect(target.buffs.some((b) => b.kind === 'steadfast')).toBe(true);
      expect(
        target.buffs.some((b) => b.kind === 'root' || b.kind === 'stun' || b.kind === 'silence'),
      ).toBe(false);
      expect(target.shove).toBeNull();
    }
    tickBuffs(p, 2);
    updatePaladinAuras(w, 0, 0);
    expect(p.buffs.some((b) => b.kind === 'steadfast')).toBe(false);
    aura(w);
    expect(p.buffs.some((b) => b.kind === 'steadfast')).toBe(false);
    tickSubclassPassives(p, 8);
    aura(w);
    expect(p.buffs.some((b) => b.kind === 'steadfast')).toBe(true);
  });
  it('Devotion excludes distant/downed allies without stripping longer Steadfast', () => {
    const { w, p, ally } = setup('pa_devotion', 0, true);
    ally.pos.x += 1000;
    applyBuff(p, makeBuff('steadfast', 0, 7, 'bear'));
    aura(w);
    expect(ally.buffs.some((b) => b.kind === 'steadfast')).toBe(false);
    expect(Math.max(...p.buffs.filter((b) => b.kind === 'steadfast').map((b) => b.remaining))).toBe(
      7,
    );
    tickSubclassPassives(p, 8);
    ally.pos = { ...p.pos };
    ally.state = 'downed';
    aura(w);
    expect(ally.buffs.some((b) => b.kind === 'steadfast')).toBe(false);
  });
  it.each(['bulwark', 'pursuit', 'renewal'] as const)(
    'Vengeance extends %s once, never resets shared strikes, and helps chase foes',
    (kind) => {
      const { w, p, boss } = setup('pa_vengeance');
      aura(w, kind);
      const spent = [...p.paladinAura!.spent];
      damageBoss(w, p, boss, 10);
      expect(p.paladinAura!.remaining).toBe(5);
      damageBoss(w, p, boss, 10, { direct: true });
      expect(p.paladinAura!.remaining).toBe(5);
      resolvePlayerAbility(w, p, 'basic', ZERO);
      expect(p.paladinAura!.remaining).toBe(7);
      expect(p.paladinAura!.spent).toEqual(spent);
      expect(boss.buffs.some((b) => b.kind === 'moveSpeed' && b.mult === 0.75)).toBe(true);
      resolvePlayerAbility(w, p, 'basic', ZERO);
      expect(p.paladinAura!.remaining).toBe(7);
      aura(w, kind);
      resolvePlayerAbility(w, p, 'basic', ZERO);
      expect(p.paladinAura!.remaining).toBe(7);
    },
  );
  it('Vengeance requires a live matching aura and an effective hit', () => {
    const { w, p, boss } = setup('pa_vengeance');
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(p.paladinAura).toBeUndefined();
    aura(w);
    p.paladinAura!.remaining = 0;
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(p.paladinAura!.remaining).toBe(0);
    p.paladinAura!.remaining = 5;
    p.paladinAura!.classId = 'mage';
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(p.paladinAura!.remaining).toBe(5);
    p.paladinAura!.classId = 'paladin';
    applyBuff(boss, makeBuff('invuln', 0, 2, 'test'));
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(p.paladinAura!.remaining).toBe(5);
  });
  it('Vengeance composes through a real base aura and melee skill with host-only activation state', () => {
    const { w, p } = setup('pa_vengeance');
    p.abilities!.a3 = recompose(decompose(p.abilities!.a3), {
      slot: 'a3',
      name: 'Shield',
      cooldown: 16,
    });
    p.abilities!.basic = recompose(decompose(p.abilities!.basic), {
      slot: 'basic',
      name: 'Strike',
      cooldown: 0.7,
    });
    resolvePlayerAbility(w, p, 'a3', ZERO);
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(p.paladinAura!.remaining).toBe(7);
    expect(w.serialize().players[0].paladinAura).not.toHaveProperty('passiveExtended');
  });
});
