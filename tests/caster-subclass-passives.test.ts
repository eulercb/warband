import { describe, it, expect } from 'vitest';
import { World } from '../src/engine/world/world';
import { getSubclass } from '../src/engine/content/subclasses';
import { resolvePlayerAbility } from '../src/engine/combat/abilities';
import {
  applyBuff,
  damageBoss,
  damageAdd,
  damagePlayer,
  makeBuff,
  tickBuffs,
} from '../src/engine/combat/combat';
import {
  setSubclassPassive,
  tickSubclassPassives,
  onSubclassAbility,
} from '../src/engine/combat/subclassPassives';
import { consumeSpellSurge, prepareSpellSurge } from '../src/engine/combat/spellCombos';
import { healSupportAlly } from '../src/engine/combat/support';
import { absorptionAmount, grantAbsorption } from '../src/engine/combat/absorption';
import { buffBadges } from '../src/render/overlays/buffGlyphs';
import { decompose, recompose, setForgeSeed } from '../src/engine/content/forge';
import { setProceduralSeed } from '../src/engine/content/procgen';
import type { Add, ClassId, Player } from '../src/engine/core/types';

const ZERO = { x: 0, y: 0 };
const cohort = ['mg_evoker', 'mg_abjurer', 'so_draconic', 'so_wild', 'ba_valor', 'ba_whispers'];
function setup(sub: string, party = true) {
  const def = getSubclass(sub)!;
  const w = new World({
    monsterId: 'dragon',
    seed: 18,
    players: [
      { peerId: 'a', name: 'A', classId: def.classId, subSkills: [def.skills[0].id] },
      ...(party ? [{ peerId: 'b', name: 'B', classId: 'knight' as ClassId }] : []),
    ],
  });
  w.obstacles = [];
  w.terrain = [];
  const p = w.players[0];
  p.pos = { x: 600, y: 400 };
  p.aim = { x: 1, y: 0 };
  p.critChance = 0;
  for (const ally of w.players.slice(1)) ally.pos = { x: 650, y: 400 };
  w.boss!.pos = { x: 700, y: 400 };
  w.boss!.hp = w.boss!.maxHp = 10000;
  return { w, p, boss: w.boss!, ally: w.players[1] };
}
function controlled(boss: ReturnType<typeof setup>['boss']) {
  applyBuff(boss, makeBuff('root', 0, 4, 'test'));
}
function chorus(w: World, p: Player) {
  applyBuff(p, makeBuff('harmony', 0, 8, 'bardHarmony'));
  applyBuff(p, makeBuff('discord', 0, 8, 'bardDiscord'));
  resolvePlayerAbility(w, p, 'a1', ZERO);
}
function heal(w: World, p: Player, recipient: Player, amount = 50) {
  return healSupportAlly(w, p, recipient, amount, {
    slot: 'a2',
    name: 'Heal',
    kind: 'heal',
    cooldown: 5,
    damage: amount,
    bardSong: 'harmony',
  });
}

describe('caster passive ownership and authored identity', () => {
  it.each(cohort)('every %s choice unlocks the same passive and survives variance/Forge', (sub) => {
    const def = getSubclass(sub)!;
    for (const skill of def.skills) {
      const w = new World({
        monsterId: 'dragon',
        seed: 18,
        players: [{ peerId: 'a', name: 'A', classId: def.classId, subSkills: [skill.id] }],
      });
      expect(w.players[0].subclassPassiveId).toBe(def.passive!.id);
    }
    try {
      setProceduralSeed(23);
      setForgeSeed(34);
      expect(getSubclass(sub)!.passive).toEqual(def.passive);
    } finally {
      setProceduralSeed(null);
      setForgeSeed(null);
    }
  });
  it('retains proc gates but drops personal readiness on a class change', () => {
    const { w, p } = setup('ba_whispers');
    chorus(w, p);
    const id = p.subclassPassiveId!;
    setSubclassPassive(p, undefined);
    expect(p.buffs.some((b) => b.kind === 'refrainEcho')).toBe(false);
    expect(p.subclassPassiveCooldowns![id]).toBe(8);
    setSubclassPassive(p, id);
    chorus(w, p);
    expect(p.buffs.some((b) => b.kind === 'refrainEcho')).toBe(false);
    tickSubclassPassives(p, 8);
    chorus(w, p);
    expect(p.buffs.some((b) => b.kind === 'refrainEcho')).toBe(true);
  });
});

describe('Mage cadence and binding wards', () => {
  it.each(['root', 'stun', 'moveSpeed'] as const)(
    'Evoker rewards live %s control, once across a multihit',
    (kind) => {
      const { w, p, boss } = setup('mg_evoker');
      applyBuff(boss, makeBuff(kind, kind === 'moveSpeed' ? 0.5 : 0, 3, 'test'));
      p.cooldowns = { basic: 2, a1: 5, a2: 0.4, a3: 0, sub1: 8, sub2: 2 };
      damageBoss(w, p, boss, 10, { direct: true });
      damageBoss(w, p, boss, 10, { direct: true });
      expect(p.cooldowns).toEqual({ basic: 2, a1: 4, a2: 0, a3: 0, sub1: 7, sub2: 1 });
      tickSubclassPassives(p, 6);
      damageBoss(w, p, boss, 10, { direct: true });
      expect(p.cooldowns.a1).toBe(3);
      expect(w.events.some((e) => e.t === 'support' && e.kind === 'empower')).toBe(true);
    },
  );
  it('ignores ticks, expired/neutral control, immunity, zero damage, dead attackers and other passives', () => {
    const { w, p, boss } = setup('mg_evoker');
    p.cooldowns.a1 = 5;
    damageBoss(w, p, boss, 10, { direct: true });
    applyBuff(boss, makeBuff('moveSpeed', 1, 4, 'neutral'));
    damageBoss(w, p, boss, 10, { direct: true });
    applyBuff(boss, makeBuff('root', 0, 0, 'expired'));
    damageBoss(w, p, boss, 10, { direct: true });
    controlled(boss);
    damageBoss(w, p, boss, 10);
    damageBoss(w, p, boss, 0, { direct: true });
    applyBuff(boss, makeBuff('invuln', 0, 2, 'test'));
    damageBoss(w, p, boss, 10, { direct: true });
    boss.buffs = boss.buffs.filter((b) => b.kind !== 'invuln');
    p.state = 'downed';
    damageBoss(w, p, boss, 10, { direct: true });
    p.state = 'alive';
    p.hp = 0;
    damageBoss(w, p, boss, 10, { direct: true });
    p.hp = 10;
    p.subclassPassiveId = undefined;
    damageBoss(w, p, boss, 10, { direct: true });
    expect(p.cooldowns.a1).toBe(5);
  });
  it('Abjurer builds a real barrier, preserves stronger pools and does not spend a failed grant', () => {
    const { w, p, boss } = setup('mg_abjurer');
    controlled(boss);
    grantAbsorption(p, 30, 8);
    damageBoss(w, p, boss, 10, { direct: true });
    expect(p.subclassPassiveCooldowns?.abjurer_binding_ward).toBeUndefined();
    expect(absorptionAmount(p.buffs)).toBe(30);
    p.buffs = [];
    damageBoss(w, p, boss, 10, { direct: true });
    expect(absorptionAmount(p.buffs)).toBe(20);
    expect(p.buffs.find((b) => b.kind === 'absorption')!.remaining).toBe(5);
    damagePlayer(w, p, 25);
    expect(absorptionAmount(p.buffs)).toBe(0);
    damageBoss(w, p, boss, 10, { direct: true });
    expect(absorptionAmount(p.buffs)).toBe(0);
    tickSubclassPassives(p, 6);
    damageBoss(w, p, boss, 10, { direct: true });
    expect(absorptionAmount(p.buffs)).toBe(20);
    expect(w.events.some((e) => e.t === 'support' && e.kind === 'absorb')).toBe(true);
  });
  it('Evoker preserves its trigger when every special is ready', () => {
    const { w, p, boss } = setup('mg_evoker');
    controlled(boss);
    damageBoss(w, p, boss, 10, { direct: true });
    expect(p.subclassPassiveCooldowns?.evoker_arcane_cadence).toBeUndefined();
    p.cooldowns.a1 = 2;
    damageBoss(w, p, boss, 10, { direct: true });
    expect(p.cooldowns.a1).toBe(1);
  });
  it('handles controlled summons and actual projectile impact, not only boss hooks', () => {
    const { w, p, boss } = setup('mg_evoker');
    const add: Add = {
      id: w.allocId(),
      pos: { ...boss.pos },
      hp: 100,
      maxHp: 100,
      radius: 12,
      moveSpeed: 0,
      attackCd: 0,
      targetId: null,
      buffs: [makeBuff('root', 0, 3, 'test')],
    };
    w.adds.push(add);
    p.cooldowns.a2 = 5;
    damageAdd(w, p, add, 10, { direct: true });
    expect(p.cooldowns.a2).toBe(4);
    tickSubclassPassives(p, 6);
    controlled(boss);
    resolvePlayerAbility(w, p, 'basic', ZERO);
    const proj = w.projectiles.at(-1)!;
    proj.pos = { ...boss.pos };
    (
      w as unknown as { resolvePlayerProjectile: (shot: typeof proj) => void }
    ).resolvePlayerProjectile(proj);
    expect(p.cooldowns.a2).toBe(3);
  });
});

describe('Sorcerer identity', () => {
  it('Draconic spending, not preparation, grants brief flight without shortening Wings', () => {
    const { p } = setup('so_draconic');
    const heavy = p.abilities!.a1;
    prepareSpellSurge(p, { ...heavy, prepareSurge: 8 });
    expect(p.buffs.some((b) => b.kind === 'flight')).toBe(false);
    const powered = consumeSpellSurge(p, heavy);
    expect(powered.damage * (powered.projCount ?? 1)).toBeCloseTo(
      heavy.damage * (heavy.projCount ?? 1) * 1.2,
    );
    expect(p.buffs.find((b) => b.kind === 'flight')!.remaining).toBe(2);
    tickBuffs(p, 2);
    prepareSpellSurge(p, { ...heavy, prepareSurge: 8 });
    consumeSpellSurge(p, heavy);
    expect(p.buffs.some((b) => b.kind === 'flight')).toBe(false);
    tickSubclassPassives(p, 6);
    applyBuff(p, makeBuff('flight', 0, 7, 'wings'));
    prepareSpellSurge(p, { ...heavy, prepareSurge: 8 });
    consumeSpellSurge(p, heavy);
    expect(Math.max(...p.buffs.filter((b) => b.kind === 'flight').map((b) => b.remaining))).toBe(8);
    expect(buffBadges(p.buffs, 20).filter((b) => b.glyph === '🕊️')).toHaveLength(1);
  });
  it('Draconic respects the flight ceiling and reserves its proc only once at cast start', () => {
    const { w, p } = setup('so_draconic');
    prepareSpellSurge(p, { ...p.abilities!.a1, prepareSurge: 8 });
    (
      w as unknown as {
        tryUseAbility: (player: Player, slot: 'a1', direction: typeof ZERO) => void;
      }
    ).tryUseAbility(p, 'a1', ZERO);
    expect(p.castTimer).toBeGreaterThan(0);
    expect(p.buffs.find((b) => b.kind === 'flight')!.remaining).toBe(2);
    resolvePlayerAbility(w, p, 'a1', ZERO, p.castAbility);
    expect(p.buffs.find((b) => b.kind === 'flight')!.remaining).toBe(2);
    p.buffs = [makeBuff('flight', 0, 8.5, 'wings')];
    tickSubclassPassives(p, 6);
    prepareSpellSurge(p, { ...p.abilities!.a1, prepareSurge: 8 });
    consumeSpellSurge(p, p.abilities!.a1);
    expect(p.buffs.find((b) => b.kind === 'flight')!.remaining).toBe(9);
    p.buffs = [makeBuff('flight', 0, 12, 'long-wings')];
    tickSubclassPassives(p, 6);
    prepareSpellSurge(p, { ...p.abilities!.a1, prepareSurge: 8 });
    consumeSpellSurge(p, p.abilities!.a1);
    expect(p.buffs.find((b) => b.kind === 'flight')!.remaining).toBe(12);
  });
  it('Wild requires different specials and saves its trigger when native preparation already supplies Surge', () => {
    const { w, p } = setup('so_wild');
    resolvePlayerAbility(w, p, 'basic', ZERO);
    expect(p.buffs.some((b) => b.kind === 'wildWeave')).toBe(false);
    resolvePlayerAbility(w, p, 'a1', ZERO);
    resolvePlayerAbility(w, p, 'a1', ZERO);
    expect(p.buffs.some((b) => b.kind === 'spellSurge')).toBe(false);
    resolvePlayerAbility(w, p, 'a2', ZERO);
    expect(p.buffs.filter((b) => b.kind === 'spellSurge')).toHaveLength(1);
    expect(p.subclassPassiveCooldowns?.wild_spell_weave).toBeUndefined();
    expect(
      buffBadges(p.buffs, 20).some((b) => b.label.includes('previous special was self buff')),
    ).toBe(true);
    resolvePlayerAbility(w, p, 'a1', ZERO); // consumes native Surge and prepares the next
    expect(p.buffs.filter((b) => b.kind === 'spellSurge')).toHaveLength(1);
    expect(p.subclassPassiveCooldowns!.wild_spell_weave).toBe(8);
    consumeSpellSurge(p, p.abilities!.a1);
    onSubclassAbility(p, { ...p.abilities!.a1, kind: 'pbaoe' });
    expect(p.buffs.some((b) => b.kind === 'spellSurge')).toBe(false);
    tickSubclassPassives(p, 8);
    onSubclassAbility(p, { ...p.abilities!.a1, kind: 'heal' });
    const ready = p.buffs.find((b) => b.kind === 'spellSurge')!;
    expect(ready).toBeTruthy();
    onSubclassAbility(p, { ...p.abilities!.a1, kind: 'projectile' });
    expect(p.buffs.find((b) => b.kind === 'spellSurge')).toBe(ready);
    prepareSpellSurge(p, { ...p.abilities!.a1, prepareSurge: 10 });
    expect(p.buffs.filter((b) => b.kind === 'spellSurge')).toHaveLength(1);
    expect(p.buffs.find((b) => b.kind === 'spellSurge')!.remaining).toBe(10);
  });
  it('Wild counts Forge delivery, does not empower the generating spell, and rooted movement does not count', () => {
    const { w, p } = setup('so_wild');
    p.abilities!.a1 = recompose(decompose(p.abilities!.a1), {
      slot: 'a1',
      name: 'Forged',
      cooldown: 5,
    });
    resolvePlayerAbility(w, p, 'a1', ZERO);
    applyBuff(p, makeBuff('root', 0, 4, 'test'));
    resolvePlayerAbility(w, p, 'a3', ZERO);
    expect(p.buffs.find((b) => b.kind === 'wildWeave')!.mult).toBe(1); // projectile
    p.buffs = p.buffs.filter((b) => b.kind !== 'root');
    p.abilities!.a3 = {
      ...p.abilities!.a1,
      slot: 'a3',
      kind: 'pbaoe',
      components: undefined,
      consumesSurge: true,
      radius: 200,
      damage: 10,
    };
    const before = w.boss!.hp;
    resolvePlayerAbility(w, p, 'a3', ZERO);
    expect(before - w.boss!.hp).toBe(10);
    expect(p.buffs.filter((b) => b.kind === 'spellSurge')).toHaveLength(1);
    tickBuffs(p, 9);
    tickSubclassPassives(p, 9);
    onSubclassAbility(p, { ...p.abilities!.a1, kind: 'heal' });
    expect(p.buffs.some((b) => b.kind === 'spellSurge')).toBe(false);
  });
});

describe('Bard chorus payoffs', () => {
  it('Valor requires two verses and gives living nearby allies one directional block', () => {
    const { w, p, ally } = setup('ba_valor');
    resolvePlayerAbility(w, p, 'a3', ZERO);
    expect(p.buffs.some((b) => b.kind === 'frontGuard')).toBe(false);
    chorus(w, p);
    for (const target of [p, ally])
      expect(target.buffs.find((b) => b.kind === 'frontGuard')?.mult).toBe(1);
    p.aim = { x: 1, y: 0 };
    const hp = p.hp;
    damagePlayer(w, p, 10, { x: p.pos.x + 50, y: p.pos.y });
    expect(p.hp).toBe(hp);
    damagePlayer(w, p, 10, { x: p.pos.x + 50, y: p.pos.y });
    expect(p.hp).toBeLessThan(hp);
    chorus(w, p);
    expect(p.buffs.some((b) => b.kind === 'frontGuard')).toBe(false);
    tickSubclassPassives(p, 8);
    chorus(w, p);
    expect(p.buffs.some((b) => b.kind === 'frontGuard')).toBe(true);
  });
  it('Valor preserves stronger guards and excludes distant/downed/dead allies', () => {
    const { w, p, ally } = setup('ba_valor');
    applyBuff(p, makeBuff('frontGuard', 2, 4, 'wall'));
    ally.pos.x += 1000;
    chorus(w, p);
    expect(p.buffs.find((b) => b.kind === 'frontGuard')!.mult).toBe(2);
    expect(ally.buffs.some((b) => b.kind === 'frontGuard')).toBe(false);
    tickSubclassPassives(p, 8);
    ally.pos = { ...p.pos };
    ally.state = 'downed';
    chorus(w, p);
    expect(ally.buffs.some((b) => b.kind === 'frontGuard')).toBe(false);
    tickSubclassPassives(p, 8);
    ally.state = 'alive';
    ally.hp = 0;
    chorus(w, p);
    expect(ally.buffs.some((b) => b.kind === 'frontGuard')).toBe(false);
  });
  it('Whispers echoes effective healing once to another injured ally, capped and attributed', () => {
    const { w, p, ally } = setup('ba_whispers');
    p.hp = p.maxHp - 100;
    ally.hp = ally.maxHp - 80;
    chorus(w, p);
    expect(buffBadges(p.buffs, 20).some((b) => b.label.includes('Echoed Refrain'))).toBe(true);
    const before = ally.hp;
    heal(w, p, p, 100);
    expect(ally.hp - before).toBe(35);
    expect(p.stats.healingDone).toBe(135);
    expect(p.buffs.some((b) => b.kind === 'refrainEcho')).toBe(false);
    heal(w, p, ally);
    expect(p.stats.healingDone).toBe(180);
  });
  it('Whispers falls back to solo recipient, uses effective rather than nominal healing, and expires', () => {
    const { w, p } = setup('ba_whispers', false);
    p.hp = p.maxHp - 80;
    chorus(w, p);
    const hp = p.hp;
    heal(w, p, p, 40);
    expect(p.hp - hp).toBe(60);
    tickSubclassPassives(p, 8);
    chorus(w, p);
    tickBuffs(p, 9);
    const before = p.hp;
    heal(w, p, p, 10);
    expect(p.hp - before).toBe(10);
  });
  it('Whispers preserves readiness on overheal and excludes distant/dead targets', () => {
    const { w, p, ally } = setup('ba_whispers');
    chorus(w, p);
    heal(w, p, p);
    expect(p.buffs.some((b) => b.kind === 'refrainEcho')).toBe(true);
    p.hp -= 5;
    ally.hp -= 50;
    ally.pos.x += 1000;
    heal(w, p, p); // capped recipient: cannot receive an echo; keep readiness
    expect(p.buffs.some((b) => b.kind === 'refrainEcho')).toBe(true);
    ally.pos = { ...p.pos };
    ally.state = 'dead';
    p.hp -= 30;
    const before = p.hp;
    heal(w, p, p, 10);
    expect(p.hp - before).toBeCloseTo(15);
  });
  it('Whispers selects one lowest-health-ratio ally instead of duplicating an echo across a party', () => {
    const { w, p, ally } = setup('ba_whispers');
    const other = structuredClone(ally);
    other.id = w.allocId();
    other.pos = { ...p.pos };
    w.players.push(other);
    p.hp -= 60;
    ally.hp = ally.maxHp * 0.6;
    other.hp = other.maxHp * 0.2;
    chorus(w, p);
    const before = other.hp;
    const allyBefore = ally.hp;
    heal(w, p, p, 40);
    expect(other.hp - before).toBe(20);
    expect(ally.hp).toBe(allyBefore);
    expect(p.buffs.some((b) => b.kind === 'refrainEcho')).toBe(false);
  });
  it('works with a composed chorus and composed dedicated healing, without recursive rescue/verses', () => {
    const { w, p, ally } = setup('ba_whispers');
    p.abilities!.a1 = recompose(decompose(p.abilities!.a1), {
      slot: 'a1',
      name: 'Chorus',
      cooldown: 5,
    });
    p.abilities!.a2 = recompose(decompose(p.abilities!.a2), {
      slot: 'a2',
      name: 'Mend',
      cooldown: 5,
    });
    p.hp -= 60;
    ally.hp -= 60;
    chorus(w, p);
    resolvePlayerAbility(w, p, 'a2', ZERO);
    expect(p.buffs.some((b) => b.kind === 'refrainEcho')).toBe(false);
    expect(p.buffs.filter((b) => b.kind === 'harmony')).toHaveLength(1);
    expect(w.events.filter((e) => e.t === 'support' && e.kind === 'heal')).toHaveLength(2);
  });
});
