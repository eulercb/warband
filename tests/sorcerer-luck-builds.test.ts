import { afterEach, expect, it } from 'vitest';
import { World } from '../src/engine/world/world';
import { resolvePlayerAbility } from '../src/engine/combat/abilities';
import { damageBoss } from '../src/engine/combat/combat';
import {
  applySubSkillUpgrades,
  getCharUpgrade,
  CHAR_UPGRADES,
} from '../src/engine/content/charUpgrades';
import { getSubSkill } from '../src/engine/content/subclasses';
import { decompose, recompose, setForgeSeed, forgeVariant } from '../src/engine/content/forge';
import { describeAbility } from '../src/engine/content/classes';
afterEach(() => setForgeSeed(null));
const zero = { x: 0, y: 0 };
function setup(history: string[] = []) {
  const w = new World({
    monsterId: 'lich',
    seed: 31,
    players: [
      {
        peerId: 'a',
        name: 'A',
        classId: 'sorcerer',
        subSkills: ['so_wild_bend'],
        charUpgrades: history,
      },
    ],
  });
  w.scene = null;
  w.obstacles = [];
  w.terrain = [];
  const p = w.players[0];
  p.critChance = 0;
  p.pos = { x: 600, y: 400 };
  p.aim = { x: 1, y: 0 };
  w.boss!.hp = w.boss!.maxHp = 10000;
  w.boss!.pos = { x: 650, y: 400 };
  return { w, p };
}
it.each([false, true])(
  'Bend Luck’s Honed and Loaded Fate remain useful together, composed=%s',
  (composed) => {
    const { w, p } = setup(['so_wild_bend_g']);
    applySubSkillUpgrades(p, Array(5).fill('subup_so_wild_bend'));
    let ab = p.subAbilities!.sub1!;
    expect(ab.kind).toBe('selfBuff');
    expect(ab.range).toBeUndefined();
    expect(ab.fortune!.duration).toBe(7.25);
    expect(ab.fortune!.debuffDuration).toBeCloseTo(3.75);
    expect(ab.fortune!.markBonus).toBe(0.2);
    expect(ab.prepareSurge).toBe(9);
    if (composed) {
      ab = recompose(decompose(ab), ab);
      p.subAbilities!.sub1 = ab;
    }
    const pos = { ...p.pos };
    resolvePlayerAbility(w, p, 'sub1', zero);
    expect(p.pos).toEqual(pos);
    expect(p.buffs.some((b) => b.kind === 'fortune')).toBe(true);
    expect(p.buffs.some((b) => b.kind === 'spellSurge')).toBe(true);
    const cast = { spent: false };
    const mods = { direct: true, pilot: { cast } };
    damageBoss(w, p, w.boss!, 10, mods);
    expect(w.boss!.buffs.some((b) => b.kind === 'luckExposure')).toBe(true);
    expect(w.boss!.buffs.find((b) => b.kind === 'damageDealt')!.mult).toBe(0.85);
    // Other projectiles from the opening cast do not consume its mark.
    damageBoss(w, p, w.boss!, 10, mods);
    expect(w.boss!.buffs.some((b) => b.kind === 'luckExposure')).toBe(true);
    const before = w.boss!.hp;
    damageBoss(w, p, w.boss!, 10, { direct: true, pilot: { cast: { spent: false } } });
    expect(before - w.boss!.hp).toBeCloseTo(12);
    expect(w.boss!.buffs.some((b) => b.kind === 'luckExposure')).toBe(false);
  },
);
it.each(['so_wild_g_a', 'so_wild_g_b'])('Bend Luck has a distinct payoff from %s', (identity) => {
  const { w, p } = setup([identity]);
  p.hp -= 40;
  resolvePlayerAbility(w, p, 'sub1', zero);
  if (identity === 'so_wild_g_a') {
    damageBoss(w, p, w.boss!, 10, { direct: true, pilot: { cast: { spent: false } } });
    expect(w.boss!.buffs.find((b) => b.kind === 'damageDealt')!.mult).toBe(0.75);
  } else expect(p.hp).toBe(p.maxHp - 15);
});
it('missing Fortune in a same-kind forged Bend receives the honest generic fallback', () => {
  const entry = structuredClone(getSubSkill('so_wild_bend')!);
  delete entry.ability.fortune;
  entry.ability.buffMoveMult = 1.2;
  entry.ability.buffDuration = 3;
  setForgeSeed(71);
  forgeVariant('subSkill', 'so_wild_bend', () => entry);
  const { p } = setup();
  const ab = p.subAbilities!.sub1!;
  const offer = getCharUpgrade('so_wild_bend_g')!;
  expect(offer.desc).toContain('Reforged capstone');
  offer.apply({ player: p, abilities: p.abilities!, subAbilities: p.subAbilities });
  expect(ab.fortune).toBeUndefined();
  expect(ab.buffMoveMult).toBeGreaterThan(1.2);
  applySubSkillUpgrades(p, ['subup_so_wild_bend']);
  expect(ab.fortune).toBeUndefined();
});
it('stronger copied Fortune durations and mark survive ordinary and grand tuning', () => {
  const { p } = setup();
  const ab = p.subAbilities!.sub1!;
  ab.fortune = {
    duration: 10,
    castSlowMult: 1.6,
    damageMult: 0.65,
    debuffDuration: 6,
    markBonus: 0.4,
  };
  CHAR_UPGRADES.so_wild_bend_g.apply({
    player: p,
    abilities: p.abilities!,
    subAbilities: p.subAbilities,
  });
  applySubSkillUpgrades(p, ['subup_so_wild_bend']);
  expect(ab.fortune).toEqual({
    duration: 10,
    castSlowMult: 1.6,
    damageMult: 0.65,
    debuffDuration: 6,
    markBonus: 0.4,
  });
});
it('instant Surge descriptions omit wind-up; charged Meteor still describes it', () => {
  for (const id of ['so_draconic_breath', 'so_wild_surge', 'so_wild_tides']) {
    const text = describeAbility(getSubSkill(id)!.ability);
    expect(text).not.toContain('half wind-up');
    expect(text).toContain('surge');
  }
  const { p } = setup();
  expect(describeAbility(p.abilities!.a1)).toContain('half wind-up');
});
it('Honed Breath widens copied cones with missing or already-wide arcs without shortening them', () => {
  for (const arc of [undefined, 90]) {
    const w = new World({
      monsterId: 'lich',
      seed: 31,
      players: [{ peerId: 'a', name: 'A', classId: 'sorcerer', subSkills: ['so_draconic_breath'] }],
    });
    const p = w.players[0],
      ab = p.subAbilities!.sub1!;
    ab.halfAngleDeg = arc;
    applySubSkillUpgrades(p, ['subup_so_draconic_breath']);
    expect(ab.halfAngleDeg).toBe(arc === undefined ? 44 : 90);
  }
});
it('a capped copied Fortune still has an honest Honed recharge preview', () => {
  const entry = structuredClone(getSubSkill('so_wild_bend')!);
  entry.ability.fortune!.duration = 8;
  entry.ability.fortune!.debuffDuration = 4;
  entry.ability.prepareSurge = 9;
  setForgeSeed(123);
  forgeVariant('subSkill', 'so_wild_bend', () => entry);
  const text = getCharUpgrade('subup_so_wild_bend')!.desc;
  expect(text).toContain('recharge');
  expect(text).toContain('→');
  expect(text).not.toContain('Fortune readiness');
  const { p } = setup();
  applySubSkillUpgrades(p, ['subup_so_wild_bend']);
  expect(p.subAbilities!.sub1!.fortune).toMatchObject({ duration: 8, debuffDuration: 4 });
});
