import { describe, expect, it } from 'vitest';
import { buffBadges } from '../src/render/overlays/buffGlyphs';
import { buffGlow } from '../src/render/pipeline/entityView';
import { World } from '../src/engine/world/world';
import { applyBuff, damageBoss, damageEcho, makeBuff } from '../src/engine/combat/combat';
import { findInfernalClaimTarget, resolvePlayerAbility } from '../src/engine/combat/abilities';
import { grandDirectMultiplier, onGrandDirectHit } from '../src/engine/combat/grandCoherence';
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
