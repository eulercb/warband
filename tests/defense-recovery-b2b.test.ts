import { describe, it, expect } from 'vitest';
import { Graphics } from 'pixi.js';
import { World } from '../src/engine/world/world';
import { resolvePlayerAbility } from '../src/engine/combat/abilities';
import {
  applyBuff,
  makeBuff,
  damagePlayer,
  tickBuffs,
  buffMult,
} from '../src/engine/combat/combat';
import { absorptionAmount, grantAbsorption } from '../src/engine/combat/absorption';
import { mirrorDamage } from '../src/engine/combat/defense';
import { getClass, describeAbility, type PlayerAbilityDef } from '../src/engine/content/classes';
import { getSubSkill, subclassOfSkill } from '../src/engine/content/subclasses';
import {
  decompose,
  recompose,
  refreshComponents,
  componentValue,
  synthesizeAbility,
} from '../src/engine/content/forge';
import { applyCharUpgrades, applySubSkillUpgrades } from '../src/engine/content/charUpgrades';
import { heroPowerRatio } from '../src/engine/content/balance';
import { buffView } from '../src/engine/core/buffView';
import { nthThreatTarget } from '../src/engine/combat/threat';
import { drawDefenseState, drawTauntState } from '../src/render/pipeline/defenseVisuals';
import { buffBadges } from '../src/render/overlays/buffGlyphs';
import type { Player, ClassId, GroundZone } from '../src/engine/core/types';
const ZERO = { x: 0, y: 0 };
function setup(classId: ClassId = 'rogue') {
  const w = new World({
    monsterId: 'dragon',
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
describe.each([false, true])('B2b roles, composed=%s', (composed) => {
  it('Smoke Bomb provides a centered, harmless hindering escape field and readies precision', () => {
    const { w, p, ally, far } = setup();
    far.pos.x = 1200;
    bind(p, 'ro_assassin_smoke', composed);
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    const z = w.groundZones[0];
    expect(z.pos).toEqual(p.pos);
    expect(z.damagePerTick).toBe(0);
    expect(z.kind).toBe('smoke');
    tick(w, z);
    expect(w.boss!.hp).toBe(10000);
    expect(buffMult(w.boss!, 'moveSpeed')).toBe(0.65);
    expect(buffMult(w.boss!, 'castSlow')).toBe(1.4);
    expect(buffMult(ally, 'moveSpeed')).toBe(1.25);
    expect(buffMult(far, 'moveSpeed')).toBe(1);
    expect(p.buffs.some((b) => b.kind === 'precision')).toBe(true);
    expect(buffMult(p, 'damageTaken')).toBe(1);
    tickBuffs(p, 4.1);
    expect(p.buffs.some((b) => b.kind === 'precision')).toBe(false);
  });
  it('Shield Spell offers a frontal parry plus precision, with no Knight counter or rear immunity', () => {
    const { w, p } = setup();
    bind(p, 'ro_trickster_shield', composed);
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(damagePlayer(w, p, 30, w.boss!.pos)).toBe(0);
    expect(p.buffs.some((b) => b.kind === 'frontGuard' || b.kind === 'counter')).toBe(false);
    expect(p.buffs.some((b) => b.kind === 'precision')).toBe(true);
    expect(damagePlayer(w, p, 10, w.boss!.pos)).toBe(10);
  });
  it('Bolster cleanses the caster; a prepared chorus extends cleanse and movement only to nearby living allies', () => {
    const { w, p, ally, far } = setup('bard');
    far.pos.x = 1200;
    bind(p, 'ba_valor_bolster', composed);
    p.buffs = [makeBuff('root', 0, 3, 'root')];
    ally.buffs = [makeBuff('moveSpeed', 0.5, 3, 'slow')];
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(p.buffs.some((b) => b.kind === 'root')).toBe(false);
    expect(p.buffs.some((b) => b.kind === 'steadfast')).toBe(true);
    expect(buffMult(ally, 'moveSpeed')).toBe(0.5);
    applyBuff(p, makeBuff('harmony', 0, 8, 'bardHarmony'));
    applyBuff(p, makeBuff('discord', 0, 8, 'bardDiscord'));
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(ally.buffs.some((b) => b.source === 'slow')).toBe(false);
    expect(buffMult(ally, 'moveSpeed')).toBeCloseTo(1.38);
    expect(far.buffs).toEqual([]);
    expect(p.buffs.some((b) => b.kind === 'harmony' || b.kind === 'discord')).toBe(false);
    expect(ally.buffs.some((b) => b.kind === 'steadfast')).toBe(false);
  });
  it('Nature’s Bond cleanses at full health, but healing/haste go only to its actual wounded recipient', () => {
    const { w, p, ally, far } = setup('ranger');
    ally.hp = 10;
    bind(p, 'rg_beast_bond', composed);
    applyBuff(ally, makeBuff('root', 0, 3, 'root'));
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(ally.hp).toBe(70);
    expect(buffMult(ally, 'moveSpeed')).toBe(1.25);
    expect(ally.buffs.some((b) => b.kind === 'root')).toBe(false);
    expect(buffMult(p, 'moveSpeed')).toBe(1);
    expect(buffMult(far, 'moveSpeed')).toBe(1);
    expect(
      w.events.some((e) => e.t === 'support' && e.kind === 'haste' && e.targetId === ally.id),
    ).toBe(true);
    w.players.forEach((p) => {
      p.hp = p.maxHp;
      p.buffs = [];
    });
    applyBuff(p, makeBuff('root', 0, 3, 'root'));
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(p.buffs).toEqual([]);
  });
  it('Life Transfer gives one chosen ally healing and a bounded preemptive ward, preserving stronger shields', () => {
    const { w, p, ally, far } = setup('mage');
    ally.hp = 10;
    bind(p, 'mg_abjurer_mend', composed);
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(ally.hp).toBe(65);
    expect(absorptionAmount(ally.buffs)).toBe(20);
    expect(absorptionAmount(p.buffs)).toBe(0);
    expect(absorptionAmount(far.buffs)).toBe(0);
    grantAbsorption(ally, 50, 8);
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(absorptionAmount(ally.buffs)).toBe(50);
    w.players.forEach((p) => {
      p.hp = p.maxHp;
      p.buffs = [];
    });
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(absorptionAmount(p.buffs)).toBe(20);
  });
  it('Wholeness heals the caster once and prepares Flow even at full HP; an actual marked special spends it', () => {
    const { w, p, ally } = setup('monk');
    p.hp = 20;
    ally.hp = 1;
    bind(p, 'mo_openhand_ki', composed);
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(p.hp).toBe(100);
    expect(ally.hp).toBe(1);
    expect(p.buffs.some((b) => b.kind === 'flow')).toBe(true);
    expect(describeAbility(p.subAbilities!.sub1!)).toContain('centering yourself');
    resolvePlayerAbility(w, p, 'a3', ZERO);
    expect(p.buffs.some((b) => b.kind === 'flow')).toBe(false);
    p.hp = p.maxHp;
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(p.buffs.some((b) => b.kind === 'flow')).toBe(true);
  });
  it('Mirror Image softens exactly three direct hits, preserves surge/speed, and lets ground damage through', () => {
    const { w, p } = setup('sorcerer');
    if (composed) {
      const ab = p.abilities!.a2;
      p.abilities!.a2 = recompose(decompose(ab), ab);
    }
    resolvePlayerAbility(w, p, 'a2', ZERO);
    expect(p.buffs.some((b) => b.kind === 'spellSurge')).toBe(true);
    expect(buffMult(p, 'moveSpeed')).toBe(1.15);
    expect(damagePlayer(w, p, 10)).toBe(10);
    expect(p.buffs.find((b) => b.kind === 'mirrorImages')?.mult).toBe(3);
    for (let i = 0; i < 3; i++) expect(damagePlayer(w, p, 10, w.boss!.pos)).toBe(4);
    expect(p.buffs.some((b) => b.kind === 'mirrorImages')).toBe(false);
    expect(damagePlayer(w, p, 10, w.boss!.pos)).toBe(10);
  });
});
it('images preserve charges during invulnerability/front blocks, reduce barrier expenditure, expire, and ignore zero damage', () => {
  const { w, p } = setup('sorcerer');
  resolvePlayerAbility(w, p, 'a2', ZERO);
  applyBuff(p, makeBuff('invuln', 0, 1, 'dash'));
  expect(damagePlayer(w, p, 10, w.boss!.pos)).toBe(0);
  tickBuffs(p, 1.1);
  applyBuff(p, makeBuff('frontGuard', 1, 1, 'frontGuard'));
  damagePlayer(w, p, 10, w.boss!.pos);
  expect(p.buffs.find((b) => b.kind === 'mirrorImages')?.mult).toBe(3);
  expect(mirrorDamage(p, w.boss!.pos, 0)).toBe(0);
  grantAbsorption(p, 20, 3);
  damagePlayer(w, p, 10, w.boss!.pos);
  expect(absorptionAmount(p.buffs)).toBe(16);
  tickBuffs(p, 5);
  expect(mirrorDamage(p, w.boss!.pos, 10)).toBe(10);
});
it('native Taunt raises threat and marks bosses only while the force target is alive; committed attacks remain locked', () => {
  const { w, p, ally } = setup('knight');
  ally.threat = 900;
  p.threat = 0;
  w.boss!.action = {
    ...w.boss!.action,
    kind: 'windup',
    targetId: ally.id,
    targetPos: { ...ally.pos },
  };
  resolvePlayerAbility(w, p, 'a1', ZERO);
  expect(p.threat).toBe(1000);
  expect(nthThreatTarget(w.players, 0, w.tauntTargetId, w.tauntTimer)).toBe(p);
  expect(nthThreatTarget(w.players, 1, w.tauntTargetId, w.tauntTimer)).toBe(p);
  expect(w.boss!.action.targetId).toBe(ally.id);
  expect(w.serialize().bosses[0].taunt).toEqual({ targetId: p.id, remaining: 4 });
  p.state = 'downed';
  expect(w.serialize().bosses[0].taunt).toBeUndefined();
  expect(nthThreatTarget(w.players, 0, w.tauntTargetId, w.tauntTimer)).toBe(ally);
  p.state = 'alive';
  p.hp = 0;
  expect(w.serialize().bosses[0].taunt).toBeUndefined();
  p.hp = p.maxHp;
  w.tauntTimer = 0;
  expect(w.serialize().bosses[0].taunt).toBeUndefined();
});
it('copied/composed Taunt switches ownership; dead bosses never display it; expiry restores threat targeting', () => {
  const { w, p, ally } = setup();
  const ab = { ...getClass('knight').abilities.a1, slot: 'sub1' as const };
  p.subAbilities = { sub1: recompose(decompose(ab), ab) };
  resolvePlayerAbility(w, p, 'sub1', ZERO);
  expect(w.serialize().bosses[0].taunt?.targetId).toBe(p.id);
  ally.subAbilities = { sub1: ab };
  resolvePlayerAbility(w, ally, 'sub1', ZERO);
  expect(w.serialize().bosses[0].taunt?.targetId).toBe(ally.id);
  w.boss!.hp = 0;
  expect(w.serialize().bosses[0].taunt).toBeUndefined();
});
it('Divine Shield exports only a public visual tag, while ordinary invulnerability keeps its own presentation', () => {
  const { w, p } = setup('paladin');
  resolvePlayerAbility(w, p, 'a3', ZERO);
  const view = w.serialize().players[0];
  expect(view.buffs.some((b) => b.visual === 'divineShield')).toBe(true);
  expect(JSON.stringify(view.buffs)).not.toContain('divineGuard');
  expect(buffView(makeBuff('invuln', 0, 1, 'dash')).visual).toBeUndefined();
  tickBuffs(p, 2);
  expect(w.serialize().players[0].buffs.some((b) => b.visual === 'divineShield')).toBe(false);
});
it('renders exactly one shield plate per charge, distinct immunity shell, finite mirror silhouettes and foreground taunt symbols', () => {
  const { w } = setup('paladin');
  const g = new Graphics();
  const view = w.serialize().players[0];
  const fills = (color: number) =>
    g.context.instructions.filter((i) => i.action === 'fill' && i.data.style.color === color)
      .length;
  for (let count = 1; count <= 4; count++) {
    g.clear();
    drawDefenseState(
      g,
      { ...view, buffs: [{ kind: 'frontGuard', mult: count, remaining: 1 }] },
      100,
      100,
      12,
    );
    expect(fills(0x18364a)).toBe(count);
  }
  g.clear();
  drawDefenseState(
    g,
    { ...view, buffs: [{ kind: 'frontGuard', mult: 1, remaining: 0 }] },
    100,
    100,
    12,
  );
  expect(g.context.instructions).toHaveLength(0);
  g.clear();
  drawDefenseState(
    g,
    { ...view, buffs: [{ kind: 'invuln', mult: 0, remaining: 1, visual: 'divineShield' }] },
    100,
    100,
    12,
  );
  expect(fills(0xffe6a3)).toBe(2);
  g.clear();
  drawDefenseState(
    g,
    { ...view, buffs: [{ kind: 'invuln', mult: 0, remaining: 1 }] },
    100,
    100,
    12,
  );
  expect(g.context.instructions).toHaveLength(0);
  for (let count = 1; count <= 5; count++) {
    g.clear();
    drawDefenseState(
      g,
      { ...view, buffs: [{ kind: 'mirrorImages', mult: count, remaining: 1 }] },
      100,
      100,
      12,
    );
    expect(fills(0xded3ff)).toBe(count);
  }
  for (const own of [false, true]) {
    g.clear();
    drawTauntState(g, { x: 0, y: 0 }, { x: 300, y: 200 }, 100, own, { x: 320, y: 568 });
    expect(g.context.instructions.length).toBeGreaterThan(4);
    expect(g.getLocalBounds().minX).toBeGreaterThanOrEqual(0);
  }
  expect(buffBadges([{ kind: 'mirrorImages', mult: 2, remaining: 1 }])[0].label).toContain(
    '2 left',
  );
  g.destroy();
});
it('Honed/grands and Forge retain the new effects, finite image caps, and unchanged utility power credit', () => {
  const { p } = setup('sorcerer');
  applyCharUpgrades(p, [
    ...Array.from({ length: 5 }, () => 'so_mirror'),
    'so_gk_a2_a',
    'so_gk_a2_b',
  ]);
  expect(p.abilities!.a2.mirrorImages).toEqual({ count: 5, duration: 9 });
  expect(p.abilities!.a2.buffDefMult).toBeUndefined();
  const base = { ...getClass('sorcerer').abilities.a2, mirrorImages: { count: 99, duration: 99 } };
  expect(recompose(refreshComponents(base), base).mirrorImages).toEqual({ count: 5, duration: 9 });
  expect(componentValue(decompose(getClass('sorcerer').abilities.a2))).toBeGreaterThan(50);
  for (const id of [
    'ro_assassin_smoke',
    'ro_trickster_shield',
    'ba_valor_bolster',
    'rg_beast_bond',
    'mg_abjurer_mend',
    'mo_openhand_ki',
  ]) {
    const { p } = setup(subclassOfSkill(id)!.classId);
    const ab = bind(p, id, true);
    const oldCd = ab.cooldown;
    const oldDescription = describeAbility(ab);
    applySubSkillUpgrades(p, [`subup_${id}`]);
    expect(p.subAbilities!.sub1!.cooldown).toBeLessThanOrEqual(oldCd);
    expect(describeAbility(p.subAbilities!.sub1!)).not.toBe(oldDescription);
    expect(p.subAbilities!.sub1!.components).toEqual(refreshComponents(p.subAbilities!.sub1!));
    for (let seed = 1; seed <= 8; seed++) {
      const d = synthesizeAbility(seed, id, 'a3', [
        { classId: p.classId, className: p.classId, name: ab.name, slot: 'a3', def: ab },
      ]).def;
      expect(Number.isFinite(d.cooldown)).toBe(true);
      expect(describeAbility(d)).toBeTruthy();
    }
  }
  const { p: q } = setup('mage');
  const ward = bind(q, 'mg_abjurer_mend', true);
  const before = heroPowerRatio(q);
  ward.absorption!.amount = 0;
  expect(heroPowerRatio(q)).toBeCloseTo(before, 10);
});

it.each([false, true])(
  'cleanse targeting breaks equal-HP ties toward actual control, composed=%s',
  (composed) => {
    for (const buff of [
      makeBuff('root', 0, 3, 'test'),
      makeBuff('stun', 0, 3, 'test'),
      makeBuff('silence', 0, 3, 'test'),
      makeBuff('moveSpeed', 0.5, 3, 'test'),
      makeBuff('castSlow', 1.4, 3, 'test'),
    ]) {
      const { w, p, ally } = setup('ranger');
      bind(p, 'rg_beast_bond', composed);
      ally.buffs = [buff];
      resolvePlayerAbility(w, p, 'sub1', ZERO);
      expect(ally.buffs).toEqual([]);
      expect(p.stats.healingDone).toBe(0);
    }
    for (const buff of [
      makeBuff('root', 0, 0, 'test'),
      makeBuff('moveSpeed', 1.2, 3, 'test'),
      makeBuff('castSlow', 0.8, 3, 'test'),
    ]) {
      const { w, p, ally } = setup('ranger');
      bind(p, 'rg_beast_bond', composed);
      ally.buffs = [buff];
      resolvePlayerAbility(w, p, 'sub1', ZERO);
      expect(ally.buffs).toEqual([buff]);
    }
  },
);
