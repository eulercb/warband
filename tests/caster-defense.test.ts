import { heroPowerRatio } from '../src/engine/content/balance';
import { describe, it, expect } from 'vitest';
import { World } from '../src/engine/world/world';
import { resolvePlayerAbility } from '../src/engine/combat/abilities';
import { applyBuff, makeBuff } from '../src/engine/combat/combat';
import { absorptionAmount } from '../src/engine/combat/absorption';
import { getSubSkill } from '../src/engine/content/subclasses';
import { describeAbility } from '../src/engine/content/classes';
import {
  decompose,
  recompose,
  refreshComponents,
  describeComposed,
  synthesizeAbility,
} from '../src/engine/content/forge';
import { applySubSkillUpgrades } from '../src/engine/content/charUpgrades';
import { classifyForBot } from '../src/engine/ai/bot';
import type { PlayerAbilityDef } from '../src/engine/content/classes';
const ids = [
  'mg_evoker_shield',
  'mg_abjurer_ward',
  'so_draconic_wing',
  'so_draconic_scales',
  'so_wild_font',
];
const ab = (id: string): PlayerAbilityDef => ({ ...getSubSkill(id)!.ability, slot: 'sub1' });
function setup(id: string, composed = false) {
  const w = new World({
    monsterId: 'dragon',
    seed: 5,
    players: [
      { peerId: 'a', name: 'A', classId: 'mage' },
      { peerId: 'b', name: 'B', classId: 'knight' },
    ],
  });
  const p = w.players[0];
  p.pos = { x: 600, y: 400 };
  p.aim = { x: 1, y: 0 };
  p.critChance = 0;
  w.players[1].pos = { x: 620, y: 420 };
  w.players[1].hp = 1;
  w.boss!.pos = { x: 700, y: 400 };
  w.boss!.hp = 10000;
  w.boss!.maxHp = 10000;
  w.boss!.facing = Math.PI;
  const ability = ab(id);
  p.subAbilities = { sub1: composed ? recompose(decompose(ability), ability) : ability };
  return { w, p, cast: () => resolvePlayerAbility(w, p, 'sub1', { x: 0, y: 0 }) };
}
describe.each([false, true])('caster defenses, composed=%s', (composed) => {
  it('Arcane Shield protects its caster even beside a critical ally, and peels only in front', () => {
    const { w, p, cast } = setup(ids[0], composed);
    cast();
    expect(absorptionAmount(p.buffs)).toBe(35);
    expect(absorptionAmount(w.players[1].buffs)).toBe(0);
    expect(10000 - w.boss!.hp).toBeCloseTo(28);
    expect(w.boss!.shove).toBeTruthy();
    w.boss!.pos = { x: 450, y: 400 };
    w.boss!.shove = undefined;
    const hp = w.boss!.hp;
    cast();
    expect(w.boss!.hp).toBe(hp);
    expect(w.boss!.shove).toBeUndefined();
  });
  it('Arcane Ward rewards existing control and supplies control for the following spell', () => {
    const { w, p, cast } = setup(ids[1], composed);
    applyBuff(w.boss!, makeBuff('root', 0, 3, 'test'));
    cast();
    expect(10000 - w.boss!.hp).toBeCloseTo(24 * 1.35);
    expect(absorptionAmount(p.buffs)).toBe(50);
    expect(w.boss!.buffs.some((b) => b.kind === 'moveSpeed' && b.mult === 0.5)).toBe(true);
  });
  it('Scales consumes surge for its close-range burst without multiplying the shield', () => {
    const { w, p, cast } = setup(ids[3], composed);
    applyBuff(p, makeBuff('spellSurge', 1.2, 8, 'spellSurge'));
    cast();
    expect(10000 - w.boss!.hp).toBeCloseTo(22 * 1.2);
    expect(absorptionAmount(p.buffs)).toBe(50); // Mage copy: 50% of 100 HP.
    expect(p.buffs.some((b) => b.kind === 'spellSurge')).toBe(false);
  });
  it('Wings replaces mitigation with a longer mobility window, retaining flight and surge', () => {
    const { p, cast } = setup(ids[2], composed);
    cast();
    expect(p.buffs.find((b) => b.kind === 'flight')?.remaining).toBe(7);
    expect(p.buffs.find((b) => b.kind === 'moveSpeed')?.mult).toBe(1.4);
    expect(p.buffs.find((b) => b.kind === 'moveSpeed')?.remaining).toBe(7);
    expect(p.buffs.some((b) => b.kind === 'damageTaken')).toBe(false);
    expect(p.buffs.find((b) => b.kind === 'spellSurge')?.remaining).toBe(8);
  });
  it('Wild Ward creates a centered recovery/slow zone and prepares rather than consumes surge', () => {
    const { w, p, cast } = setup(ids[4], composed);
    cast();
    const z = w.groundZones[0];
    expect(z.pos).toEqual(p.pos);
    expect(z.healPerTick).toBe(10);
    expect(z.slowMult).toBe(0.65);
    expect(z.radius).toBe(125);
    expect(z.damagePerTick).toBe(0);
    expect(p.buffs.find((b) => b.kind === 'spellSurge')?.remaining).toBe(8);
    p.hp = 50;
    (w as unknown as { applyZoneTick: (zone: typeof z) => void }).applyZoneTick(z);
    expect(p.hp).toBe(60);
    expect(w.boss!.buffs.some((b) => b.kind === 'moveSpeed' && b.mult === 0.65)).toBe(true);
  });
});
it.each(ids)(
  '%s remains compatible with Honed upgrades, copying, Forge budgets and descriptions',
  (id) => {
    const { p } = setup(id);
    const skill = ab(id);
    p.classId = id.startsWith('mg') ? 'mage' : 'sorcerer';
    p.subSkillIds = [id];
    p.subAbilities = { sub1: skill };
    const before = structuredClone(skill);
    applySubSkillUpgrades(p, [`subup_${id}`]);
    expect(skill.cooldown).toBeLessThan(before.cooldown);
    if (skill.absorption) {
      if (id === 'mg_abjurer_ward' || id === 'so_draconic_scales') {
        expect(skill.absorption.duration).toBeGreaterThan(before.absorption!.duration);
        expect(skill.absorption.amount).toBe(before.absorption!.amount);
      } else expect(skill.absorption.amount).toBeGreaterThan(before.absorption!.amount);
      expect(skill.absorption.target).toBe('self');
      expect(describeAbility(skill)).toContain('yourself');
    }
    if (id === 'mg_evoker_shield') {
      expect(skill.knockback).toBe(before.knockback! + 6);
      expect(skill.range).toBe(before.range);
    }
    const copy = recompose(refreshComponents(recompose(decompose(skill), skill)), skill);
    expect(copy.absorption).toEqual(skill.absorption);
    // Forge component durations are quantized to tenths of a second.
    expect(copy.prepareSurge).toBe(
      skill.prepareSurge == null ? undefined : Math.round(skill.prepareSurge * 10) / 10,
    );
    expect(copy.consumesSurge).toBe(skill.consumesSurge);
    expect(describeComposed(decompose(copy), copy.cooldown)).toBeTruthy();
    for (let seed = 0; seed < 20; seed++)
      expect(
        synthesizeAbility(seed, 'ward', 'a3', [
          { name: skill.name, classId: p.classId, className: p.classId, slot: 'a3', def: skill },
        ]).def.name,
      ).toBeTruthy();
    if (skill.absorption) expect(classifyForBot(copy).role).toBe('selfDefense');
  },
);

it.each(ids)(
  '%s adds no automatic party-power charge, including Honed and composed copies',
  (id) => {
    const { p } = setup(id);
    const source = ab(id);
    p.subAbilities = {};
    const baseline = heroPowerRatio(p);
    for (const composed of [false, true]) {
      const skill = composed ? recompose(decompose(source), source) : structuredClone(source);
      p.subAbilities = { sub1: skill };
      expect(heroPowerRatio(p)).toBeCloseTo(baseline, 10);
      for (let rank = 0; rank < 5; rank++) {
        // Exercise the actual upgrade against its owning class, keeping copied base stats fixed.
        const cls = p.classId;
        p.classId = id.startsWith('mg') ? 'mage' : 'sorcerer';
        p.subSkillIds = [id];
        applySubSkillUpgrades(p, [`subup_${id}`]);
        p.classId = cls;
        expect(heroPowerRatio(p)).toBeCloseTo(baseline, 10);
      }
    }
  },
);
