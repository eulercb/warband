import { describe, expect, it } from 'vitest';
import { buffBadges } from '../src/render/overlays/buffGlyphs';
import { buffGlow } from '../src/render/pipeline/entityView';
import { decompose, recompose } from '../src/engine/content/forge';
import { CLASSES } from '../src/engine/content/classes';
import { World } from '../src/engine/world/world';
import {
  applyBuff,
  damageAdd,
  damageBoss,
  damageEcho,
  makeBuff,
} from '../src/engine/combat/combat';
import { findInfernalClaimTarget, resolvePlayerAbility } from '../src/engine/combat/abilities';
import { grandDirectMultiplier, onGrandDirectHit } from '../src/engine/combat/grandCoherence';
import { setSubclassPassive, tickSubclassPassives } from '../src/engine/combat/subclassPassives';
import type { ClassId } from '../src/engine/core/types';

function setup(classId: ClassId, grand: string, skill: string) {
  const w = new World({
    monsterId: 'lich',
    seed: 31,
    players: [
      { peerId: 'a', name: 'A', classId, charUpgrades: [grand], subSkills: [skill] },
      { peerId: 'b', name: 'B', classId, charUpgrades: [grand], subSkills: [skill] },
    ],
  });
  w.scene = null;
  w.obstacles = [];
  w.terrain = [];
  const [p, ally] = w.players,
    boss = w.boss!;
  p.pos = { x: 600, y: 400 };
  p.aim = { x: 1, y: 0 };
  boss.pos = { x: 645, y: 400 };
  boss.hp = boss.maxHp = 10000;
  return { w, p, ally, boss };
}

describe('independent owner-scoped grand payoffs', () => {
  it('bounds a synthesized remote Claim even when its donor supplied no range', () => {
    const { w, p, boss } = setup('warlock', 'wa_fiend_rebuke_g', 'wa_fiend_rebuke');
    const ab = p.subAbilities!.sub1!;
    delete ab.range;
    applyBuff(boss, makeBuff('curse', 1.15, 30, `curse:${p.id}:hex`));
    boss.pos = { x: p.pos.x + 420, y: p.pos.y };
    expect(findInfernalClaimTarget(w, p, ab)).toBeNull();
    boss.pos.x = p.pos.x + 390;
    expect(findInfernalClaimTarget(w, p, ab)).toBe(boss);
  });

  it('labels owner-only exposure and visible cadence progress consistently', () => {
    const [mark, cadence] = buffBadges([
      { kind: 'grandOpening', mult: 1.25, remaining: 4 },
      { kind: 'grandCadence', mult: 2, remaining: 8 },
    ]);
    expect(mark.label).toContain('marking Rogue');
    expect(mark.good).toBe(false);
    expect(cadence.label).toContain('2/3');
    expect(buffGlow('grandOpening', 1.25)?.good).toBe(false);
    expect(buffGlow('grandCadence', 2)?.good).toBe(true);
  });

  it('marks with an actual prepared Death Strike and improves only the owner’s later direct hit', () => {
    const { w, p, ally, boss } = setup('rogue', 'ro_assassin_strike_g', 'ro_assassin_strike');
    applyBuff(p, makeBuff('precision', 1, 4, 'precision'));
    resolvePlayerAbility(w, p, 'sub1', { x: 0, y: 0 });
    const mark = boss.buffs.find((b) => b.kind === 'grandOpening')!;
    expect(mark?.remaining).toBe(4);
    expect(
      grandDirectMultiplier(p, boss, {
        direct: true,
        mark: { bonus: 0.25, cast: mark.openingCast! },
      }),
    ).toBe(1);
    damageBoss(w, ally, boss, 10, { direct: true });
    expect(boss.buffs).toContain(mark);
    damageBoss(w, p, boss, 10); // poison/other supplemental damage cannot spend it
    expect(boss.buffs).toContain(mark);
    applyBuff(boss, makeBuff('invuln', 1, 1, 'test'));
    expect(damageBoss(w, p, boss, 10, { direct: true })).toBe(0);
    expect(boss.buffs).toContain(mark);
    boss.buffs = boss.buffs.filter((b) => b.kind !== 'invuln');
    damageBoss(w, p, boss, 0, { direct: true });
    expect(boss.buffs).toContain(mark);
    expect(damageBoss(w, p, boss, 10, { direct: true })).toBeCloseTo(12.5);
    expect(boss.buffs).not.toContain(mark);
    expect(damageBoss(w, p, boss, 10, { direct: true })).toBeCloseTo(10);
  });

  it('preserves the mark through inactive classes and ignores expired exposure', () => {
    const { w, p, boss } = setup('rogue', 'ro_assassin_strike_g', 'ro_assassin_strike');
    const cast = { spent: false };
    onGrandDirectHit(w, p, boss, 10, true, { bonus: 0.25, cast });
    expect(cast.spent).toBe(true);
    p.classId = 'mage';
    expect(grandDirectMultiplier(p, boss, { direct: true })).toBe(1);
    p.classId = 'rogue';
    boss.buffs[0].remaining = 0;
    expect(grandDirectMultiplier(p, boss, { direct: true })).toBe(1);
    expect(grandDirectMultiplier(p, boss)).toBe(1);
    p.hp = 0;
    expect(grandDirectMultiplier(p, boss, { direct: true })).toBe(1);
  });

  it('counts only personally cursed direct hits, never ticks or another player, and gates before its burst', () => {
    const { w, p, ally, boss } = setup('warlock', 'wa_fiend_g_a', 'wa_fiend_hurl');
    const progress = () => p.buffs.find((b) => b.kind === 'grandCadence')?.mult;
    damageBoss(w, p, boss, 1, { direct: true });
    expect(progress()).toBeUndefined();
    applyBuff(boss, makeBuff('curse', 1.15, 30, `curse:${p.id}:hex`));
    damageBoss(w, p, boss, 1);
    expect(progress()).toBeUndefined();
    damageBoss(w, p, boss, 1, { direct: true });
    expect(progress()).toBe(1);
    damageBoss(w, ally, boss, 1, { direct: true });
    expect(progress()).toBe(1);
    applyBuff(boss, makeBuff('invuln', 1, 1, 'test'));
    damageBoss(w, p, boss, 1, { direct: true });
    expect(progress()).toBe(1);
    boss.buffs = boss.buffs.filter((b) => b.kind !== 'invuln');
    damageBoss(w, p, boss, 1, { direct: true });
    expect(progress()).toBe(2);
    const before = boss.hp;
    damageBoss(w, p, boss, 1, { direct: true });
    expect(before - boss.hp).toBeCloseTo(26 * 1.15);
    expect(progress()).toBeUndefined();
    expect(p.subclassPassiveCooldowns?.['grand:wa_fiend_g_a']).toBe(4);
    damageBoss(w, p, boss, 1, { direct: true });
    expect(progress()).toBeUndefined();
    tickSubclassPassives(p, 4);
    damageBoss(w, p, boss, 1, { direct: true });
    expect(progress()).toBe(1);
    setSubclassPassive(p, undefined);
    expect(progress()).toBeUndefined();
    expect(p.subclassPassiveCooldowns?.['grand:wa_fiend_g_a']).toBe(0);
  });

  it('handles add recipients, expired progress, and no selected identity without cross-target recursion', () => {
    const { w, p, boss } = setup('warlock', 'wa_fiend_g_a', 'wa_fiend_hurl');
    const add = {
      ...boss,
      id: boss.id + 100,
      hp: 1000,
      maxHp: 1000,
      buffs: [],
      targetId: p.id,
      attackCd: 0,
      moveSpeed: 0,
    };
    w.adds.push(add);
    applyBuff(add, makeBuff('curse', 1.15, 30, `curse:${p.id}:searing`));
    damageAdd(w, p, add, 1, { direct: true });
    const progress = p.buffs.find((b) => b.kind === 'grandCadence')!;
    progress.remaining = 0;
    damageAdd(w, p, add, 1, { direct: true });
    expect(p.buffs.find((b) => b.kind === 'grandCadence')?.mult).toBe(1);
    damageAdd(w, p, add, 1, { direct: true });
    const before = add.hp;
    damageAdd(w, p, add, 1, { direct: true });
    expect(before - add.hp).toBeCloseTo(26 * 1.15);
    expect(p.buffs.some((b) => b.kind === 'grandCadence')).toBe(false);
    p.charUpgradeIds = [];
    tickSubclassPassives(p, 4);
    damageAdd(w, p, add, 1, { direct: true });
    expect(p.buffs.some((b) => b.kind === 'grandCadence')).toBe(false);
  });

  it('detects actual curse producers instead of stale flat metadata on a forged delivery', () => {
    const { w, p, boss } = setup('warlock', 'wa_fiend_g_a', 'wa_fiend_hurl');
    const plain = p.abilities!.basic;
    for (const slot of ['basic', 'a1', 'a2', 'a3'] as const)
      p.abilities![slot] = { ...plain, slot, components: decompose(plain), rebukeCurseBonus: 0.15 };
    p.subAbilities = {};
    damageBoss(w, p, boss, 1, { direct: true });
    expect(boss.buffs.find((b) => b.kind === 'curse')?.mult).toBe(1);
    boss.buffs = [];
    const retort = { ...CLASSES.warlock.abilities.a2, rebukeCurseBonus: 0.15 };
    p.abilities!.a2 = recompose(decompose(retort), retort);
    damageBoss(w, p, boss, 1, { direct: true });
    expect(boss.buffs.some((b) => b.kind === 'curse')).toBe(false);
  });

  it.each([false, true])(
    'shares a prepared projectile cast across pellets without spending its own opening (composed=%s)',
    (composed) => {
      const { w, p, boss } = setup('rogue', 'ro_assassin_strike_g', 'ro_assassin_strike');
      const native = p.subAbilities!.sub1!;
      const shot = {
        ...native,
        kind: 'projectile' as const,
        damage: 10,
        projCount: 2,
        spreadDeg: 0,
        projSpeed: 600,
        markOnPreparedHit: 0.25,
        critChanceBonus: 0,
      };
      p.subAbilities!.sub1 = composed ? recompose(decompose(shot), shot) : shot;
      p.critChance = 0;
      applyBuff(p, makeBuff('precision', 1, 4, 'fixture'));
      resolvePlayerAbility(w, p, 'sub1', { x: 0, y: 0 });
      expect(w.projectiles).toHaveLength(2);
      for (const proj of w.projectiles) proj.pos = { ...boss.pos };
      (w as unknown as { updateProjectiles(dt: number): void }).updateProjectiles(0);
      expect(boss.buffs.filter((b) => b.kind === 'grandOpening')).toHaveLength(1);
      expect(damageBoss(w, p, boss, 10, { direct: true })).toBeCloseTo(12.5);
      expect(boss.buffs.some((b) => b.kind === 'grandOpening')).toBe(false);
    },
  );

  it('selects remote Claim targets by aim, then distance, then stable id', () => {
    const { w, p, boss } = setup('warlock', 'wa_fiend_rebuke_g', 'wa_fiend_rebuke');
    const ab = p.subAbilities!.sub1!;
    applyBuff(boss, makeBuff('curse', 1.15, 20, `curse:${p.id}:hex`));
    boss.pos = { x: p.pos.x + 100, y: p.pos.y + 10 };
    const other = {
      ...boss,
      id: boss.id + 1,
      pos: { x: p.pos.x + 200, y: p.pos.y },
      buffs: [...boss.buffs],
    };
    w.bosses.push(other);
    expect(findInfernalClaimTarget(w, p, ab)).toBe(other); // the aimed line wins
    boss.pos.y = p.pos.y;
    expect(findInfernalClaimTarget(w, p, ab)).toBe(boss); // same line, closer
    other.pos = { ...boss.pos };
    w.bosses.reverse();
    expect(findInfernalClaimTarget(w, p, ab)).toBe(boss); // tie independent of list order
    p.aim = { x: 0, y: 0 };
    expect(findInfernalClaimTarget(w, p, ab)).toBeNull();
  });

  it('does not invent a curse source in incomplete legacy loadouts, and tolerates sparse bound slots', () => {
    const { w, p, boss } = setup('warlock', 'wa_fiend_g_a', 'wa_fiend_hurl');
    p.abilities = undefined;
    onGrandDirectHit(w, p, boss, 1);
    expect(boss.buffs.some((b) => b.kind === 'curse')).toBe(false);
    const plain = CLASSES.warlock.abilities.basic;
    p.abilities = {
      basic: { ...plain, components: decompose(plain) },
      a1: { ...plain, slot: 'a1' },
      a2: { ...plain, slot: 'a2' },
      a3: { ...plain, slot: 'a3' },
    };
    p.subAbilities = undefined;
    onGrandDirectHit(w, p, boss, 1);
    expect(boss.buffs.some((b) => b.kind === 'curse')).toBe(true);
    boss.buffs = [];
    p.subAbilities = { sub1: undefined };
    onGrandDirectHit(w, p, boss, 1);
    expect(boss.buffs.some((b) => b.kind === 'curse')).toBe(true);
    boss.buffs = [];
    p.abilities.a1 = { ...CLASSES.warlock.abilities.a1, curseBonus: undefined };
    onGrandDirectHit(w, p, boss, 1);
    expect(boss.buffs.some((b) => b.kind === 'curse')).toBe(true);
    boss.buffs = [];
    p.abilities.a1 = { ...CLASSES.warlock.abilities.a1 };
    onGrandDirectHit(w, p, boss, 1);
    expect(boss.buffs.some((b) => b.kind === 'curse')).toBe(false);
    p.abilities.a1 = { ...plain, slot: 'a1' };
    p.abilities.a2 = { ...CLASSES.warlock.abilities.a2 };
    onGrandDirectHit(w, p, boss, 1); // an uncursing retort is not a curse producer
    expect(boss.buffs.find((b) => b.kind === 'curse')?.mult).toBe(1);
    boss.buffs = [];
    p.abilities.a2 = { ...CLASSES.warlock.abilities.a2, rebukeDuration: undefined };
    onGrandDirectHit(w, p, boss, 1);
    expect(boss.buffs.find((b) => b.kind === 'curse')?.mult).toBe(1);
    boss.buffs = [];
    const claim = {
      ...CLASSES.warlock.abilities.a2,
      infernalClaim: true,
      forgeClaimFallback: false,
    };
    p.abilities.a2 = { ...claim, components: decompose(claim) };
    onGrandDirectHit(w, p, boss, 1); // a curse-dependent Claim cannot supply its own setup
    expect(boss.buffs.find((b) => b.kind === 'curse')?.mult).toBe(1);
    boss.buffs = [];
    const selfBrand = { ...claim, forgeClaimFallback: true };
    p.abilities.a2 = { ...selfBrand, components: decompose(selfBrand) };
    onGrandDirectHit(w, p, boss, 1); // this composed Claim already has setup
    expect(boss.buffs.some((b) => b.kind === 'curse')).toBe(false);
  });

  it('echoes exactly effective damage, respecting immunity and overkill without spawning direct-hit resources', () => {
    const { w, p, boss } = setup('rogue', 'ro_trickster_step_g', 'ro_trickster_step');
    const before = p.stats.damageDealt;
    expect(damageEcho(w, p, boss, 0)).toBe(0);
    boss.hp = 0;
    expect(damageEcho(w, p, boss, 10)).toBe(0);
    boss.hp = 100;
    applyBuff(boss, makeBuff('invuln', 1, 1, 'fixture'));
    expect(damageEcho(w, p, boss, 10)).toBe(0);
    expect(p.stats.damageDealt).toBe(before);
    boss.buffs = [];
    boss.recentDamageTaken = undefined;
    expect(damageEcho(w, p, boss, 5)).toBe(5);
    expect(boss.recentDamageTaken).toBe(5);
    const afterBoss = p.stats.damageDealt;
    const add = {
      ...boss,
      id: boss.id + 100,
      hp: 7,
      maxHp: 100,
      buffs: [],
      targetId: p.id,
      attackCd: 0,
      moveSpeed: 0,
    };
    delete add.recentDamageTaken;
    w.adds.push(add);
    p.damageMult = 5;
    expect(damageEcho(w, p, add, 10)).toBe(7);
    expect(add.hp).toBe(0);
    expect(p.stats.damageDealt - afterBoss).toBe(7);
    expect(p.buffs.some((b) => b.kind === 'precision' || b.kind === 'grandCadence')).toBe(false);
  });

  it('does not generate new readiness in rooms, on zero damage, dead targets or downed owners', () => {
    const { w, p, boss } = setup('rogue', 'ro_assassin_strike_g', 'ro_assassin_strike');
    const mark = { bonus: 0.25, cast: { spent: false } };
    onGrandDirectHit(w, p, boss, 0, true, mark);
    expect(mark.cast.spent).toBe(false);
    p.hp = 0;
    onGrandDirectHit(w, p, boss, 10, true, mark);
    expect(mark.cast.spent).toBe(false);
    p.hp = p.maxHp;
    boss.hp = 0;
    onGrandDirectHit(w, p, boss, 10, true, mark);
    expect(mark.cast.spent).toBe(false);
    boss.hp = 100;
    w.scene = 'reward';
    onGrandDirectHit(w, p, boss, 10, true, mark);
    expect(mark.cast.spent).toBe(false);
  });
});
