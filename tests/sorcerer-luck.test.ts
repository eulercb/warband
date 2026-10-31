import { describe, expect, it } from 'vitest';
import { World } from '../src/engine/world/world';
import { getSubclass, getSubSkill } from '../src/engine/content/subclasses';
import { resolvePlayerAbility } from '../src/engine/combat/abilities';
import { applyBuff, buffMult, damageBoss, makeBuff, tickBuffs } from '../src/engine/combat/combat';
import { absorptionAmount } from '../src/engine/combat/absorption';
import { setSubclassPassive, tickSubclassPassives } from '../src/engine/combat/subclassPassives';
import { consumeSpellSurge, prepareSpellSurge } from '../src/engine/combat/spellCombos';
import {
  componentValue,
  decompose,
  recompose,
  synthesizeAbility,
} from '../src/engine/content/forge';
import { buffView } from '../src/engine/core/buffView';
import { enemyDebuffs } from '../src/render/pipeline/enemyDebuffs';
import type { ExtSlot, Player, Projectile } from '../src/engine/core/types';

const zero = { x: 0, y: 0 };
function setup(skill = 'so_wild_bend') {
  const w = new World({
    monsterId: 'lich',
    seed: 47,
    players: [{ peerId: 'a', name: 'A', classId: 'sorcerer', subSkills: [skill] }],
  });
  w.scene = null;
  w.obstacles = [];
  w.terrain = [];
  const p = w.players[0];
  p.pos = { x: 600, y: 400 };
  p.aim = { x: 1, y: 0 };
  p.critChance = 0;
  const boss = w.boss!;
  boss.pos = { x: 700, y: 400 };
  boss.hp = boss.maxHp = 10000;
  return { w, p, boss };
}
function use(w: World, p: Player, slot: ExtSlot) {
  (w as unknown as { tryUseAbility(p: Player, slot: ExtSlot, d: typeof zero): void }).tryUseAbility(
    p,
    slot,
    zero,
  );
}
function connect(w: World, shot: Projectile) {
  shot.pos = { ...w.boss!.pos };
  (w as unknown as { resolvePlayerProjectile(p: Projectile): void }).resolvePlayerProjectile(shot);
}

describe('Sorcerer deterministic luck and weaving', () => {
  it.each(getSubclass('so_wild')!.skills.map((s) => s.id))(
    'the actual starting kit weaves with first pick %s against one boss',
    (skill) => {
      const { w, p } = setup(skill);
      use(w, p, 'a2');
      const before = p.cooldowns.a2;
      use(w, p, 'basic');
      for (const shot of w.projectiles) connect(w, shot);
      expect(p.cooldowns.a2).toBe(before - 2);
      expect(p.buffs.some((b) => b.kind === 'wildWeave')).toBe(false);
      expect(p.buffs.some((b) => b.kind === 'spellSurge')).toBe(true);
      expect(p.subclassPassiveCooldowns!.wild_spell_weave).toBe(6);
      expect(w.bosses.filter((b) => b.hp > 0)).toHaveLength(1);
      expect(w.adds).toHaveLength(0);
    },
  );
  it.each([false, true])(
    'Bend Luck stays in place, tolerates roots, and only a real hit spends Fortune (composed=%s)',
    (composed) => {
      const { w, p, boss } = setup();
      if (composed)
        p.subAbilities!.sub1 = recompose(decompose(p.subAbilities!.sub1!), {
          slot: 'sub1',
          name: 'Forged Fortune',
          cooldown: 10,
        });
      const origin = { ...p.pos };
      applyBuff(p, makeBuff('root', 0, 2, 'test'));
      use(w, p, 'sub1');
      expect(p.pos).toEqual(origin);
      expect(p.buffs.some((b) => b.kind === 'invuln')).toBe(false);
      expect(p.buffs.some((b) => b.kind === 'fortune')).toBe(true);
      expect(p.buffs.some((b) => b.kind === 'spellSurge')).toBe(true);
      damageBoss(w, p, boss, 10); // supplementary damage cannot use luck
      damageBoss(w, p, boss, 0, { direct: true });
      applyBuff(boss, makeBuff('invuln', 0, 1, 'test'));
      damageBoss(w, p, boss, 10, { direct: true });
      expect(p.buffs.some((b) => b.kind === 'fortune')).toBe(true);
      boss.buffs = [];
      use(w, p, 'basic');
      connect(w, w.projectiles[0]);
      expect(p.buffs.some((b) => b.kind === 'fortune')).toBe(false);
      expect(boss.buffs.find((b) => b.kind === 'castSlow')).toMatchObject({
        mult: 1.4,
        remaining: 3,
      });
      expect(buffMult(boss, 'damageDealt')).toBe(0.85);
      expect(w.events.filter((e) => e.t === 'support' && e.kind === 'empower')).toHaveLength(2);
      expect(enemyDebuffs(boss.buffs.map(buffView), p.id).map((b) => b.kind)).toEqual([
        'castSlow',
        'weak',
      ]);
    },
  );
  it('Fortune refresh updates payload; Loaded Fate excludes its entire fan, ticks and other owners', () => {
    const { w, p, boss } = setup('so_wild_surge');
    p.abilities!.a2.fortune = {
      duration: 6,
      castSlowMult: 1.4,
      damageMult: 0.85,
      debuffDuration: 3,
    };
    resolvePlayerAbility(w, p, 'a2', zero);
    p.abilities!.a2.fortune.markBonus = 0.2;
    resolvePlayerAbility(w, p, 'a2', zero);
    resolvePlayerAbility(w, p, 'sub1', zero);
    const fan = [...w.projectiles];
    for (const shot of fan) connect(w, shot);
    const mark = boss.buffs.find((b) => b.kind === 'luckExposure')!;
    expect(mark.mult).toBe(1.2);
    const publicMark = buffView(mark);
    expect(publicMark.ownerId).toBe(p.id);
    expect(enemyDebuffs([publicMark], p.id)).toEqual([
      { kind: 'vulnerable', remaining: 5, own: true },
    ]);
    expect(enemyDebuffs([{ ...publicMark, mult: 1 }], p.id)).toEqual([]);
    expect(enemyDebuffs([publicMark], p.id + 1)[0].own).toBe(false);
    const other = { ...p, id: p.id + 1 };
    const hp = boss.hp;
    damageBoss(w, other, boss, 10, { direct: true, pilot: { cast: { spent: false } } });
    damageBoss(w, p, boss, 10); // ticks preserve mark
    expect(boss.hp).toBeCloseTo(hp - 20);
    expect(boss.buffs).toContain(mark);
    resolvePlayerAbility(w, p, 'basic', zero);
    const next = w.projectiles.at(-1)!;
    const before = boss.hp;
    connect(w, next);
    expect(boss.hp).toBeCloseTo(before - next.damage * 1.2);
    expect(boss.buffs.some((b) => b.kind === 'luckExposure')).toBe(false);
  });
  it('Weave and Fortune expire, class swaps clear readiness without resetting the gate, and dead casters cannot spend them', () => {
    const { w, p, boss } = setup();
    use(w, p, 'sub1');
    p.state = 'downed';
    damageBoss(w, p, boss, 10, { direct: true });
    expect(p.buffs.some((b) => b.kind === 'fortune')).toBe(true);
    p.state = 'alive';
    p.cooldowns.sub1 = 8;
    damageBoss(w, p, boss, 10, { direct: true });
    expect(p.subclassPassiveCooldowns!.wild_spell_weave).toBe(6);
    p.cooldowns.sub1 = 0;
    use(w, p, 'sub1');
    setSubclassPassive(p, undefined);
    expect(p.buffs.some((b) => b.kind === 'fortune' || b.kind === 'wildWeave')).toBe(false);
    setSubclassPassive(p, 'wild_spell_weave');
    resolvePlayerAbility(w, p, 'sub1', zero);
    expect(p.buffs.some((b) => b.kind === 'wildWeave')).toBe(false);
    tickSubclassPassives(p, 6);
    resolvePlayerAbility(w, p, 'sub1', zero);
    tickBuffs(p, 8);
    expect(p.buffs.some((b) => b.kind === 'fortune' || b.kind === 'wildWeave')).toBe(false);
  });
  it('actual synthesis prices, fits and executes Fortune without importing Wild passive ownership', () => {
    const native = getSubSkill('so_wild_bend')!.ability;
    const donor = {
      name: 'Bend Luck',
      classId: 'sorcerer' as const,
      className: 'Sorcerer',
      slot: 'a2',
      def: native,
    };
    let forged: ReturnType<typeof synthesizeAbility> | undefined;
    for (let seed = 1; seed <= 100; seed++) {
      const candidate = synthesizeAbility(seed, 'fortune-test', 'a2', [donor]);
      if (candidate.def.fortune) {
        forged = candidate;
        break;
      }
    }
    expect(forged).toBeDefined();
    expect(forged!.def.components!.effects.some((e) => e.kind === 'fortune')).toBe(true);
    expect(forged!.def.fortune!.duration).toBeLessThanOrEqual(8);
    const parts = forged!.def.components!;
    expect(componentValue(parts)).toBeGreaterThan(
      componentValue({ ...parts, effects: parts.effects.filter((e) => e.kind !== 'fortune') }),
    );
    const { w, p, boss } = setup();
    setSubclassPassive(p, undefined);
    p.abilities!.a2 = forged!.def;
    resolvePlayerAbility(w, p, 'a2', zero);
    expect(p.buffs.some((b) => b.kind === 'wildWeave')).toBe(false);
    damageBoss(w, p, boss, 10, { direct: true });
    expect(boss.buffs.some((b) => b.kind === 'castSlow')).toBe(true);
  });
});

describe('Sorcerer surged delivery and ascent', () => {
  it.each([false, true])(
    'Breath sweeps beyond its normal angle and Tides covers a larger disruption circle (composed=%s)',
    (composed) => {
      for (const id of ['so_draconic_breath', 'so_wild_tides']) {
        const { w, p, boss } = setup(id);
        const native = p.subAbilities!.sub1!;
        if (composed)
          p.subAbilities!.sub1 = recompose(decompose(native), {
            slot: 'sub1',
            name: native.name,
            cooldown: native.cooldown,
          });
        const ab = p.subAbilities!.sub1!;
        boss.radius = 1;
        if (id === 'so_draconic_breath') {
          const angle = (50 * Math.PI) / 180;
          boss.pos = { x: p.pos.x + 150 * Math.cos(angle), y: p.pos.y + 150 * Math.sin(angle) };
        } else boss.pos.x = p.pos.x + ab.radius! + 25;
        resolvePlayerAbility(w, p, 'sub1', zero);
        expect(boss.hp).toBe(10000);
        prepareSpellSurge(p, { ...ab, prepareSurge: 8 });
        resolvePlayerAbility(w, p, 'sub1', zero);
        expect(boss.hp).toBeLessThan(10000);
        expect(boss.buffs.some((b) => b.kind === 'castSlow' && b.mult === 1.3)).toBe(true);
        expect(p.buffs.some((b) => b.kind === 'spellSurge')).toBe(false);
      }
    },
  );
  it('Chaos keeps six-shot damage budget while surge focuses and pierces; impact/zone copies cannot repeat payloads', () => {
    const { p } = setup('so_wild_surge');
    const ab = p.subAbilities!.sub1!;
    prepareSpellSurge(p, { ...ab, prepareSurge: 8 });
    const powered = consumeSpellSurge(p, ab);
    expect(powered.projCount).toBe(6);
    expect(powered.spreadDeg).toBe(28);
    expect(powered.pierce).toBe(1);
    const parts = decompose(ab);
    expect(componentValue(parts)).toBeGreaterThan(
      componentValue({
        ...parts,
        effects: parts.effects.map((e) =>
          e.kind === 'surgeStrike' ? { kind: 'surgeStrike' as const } : e,
        ),
      }),
    );
    expect(powered.damage * powered.projCount!).toBeCloseTo(ab.damage * 6 * 1.2);
    prepareSpellSurge(p, { ...ab, prepareSurge: 8 });
    const alreadyPiercing = consumeSpellSurge(p, { ...ab, pierce: 2 });
    expect(alreadyPiercing.pierce).toBe(3);
    prepareSpellSurge(p, { ...ab, prepareSurge: 8 });
    const explosion = consumeSpellSurge(p, { ...ab, impactRadius: 50 });
    expect(explosion.pierce).toBeUndefined();
    const breath = {
      ...getSubSkill('so_draconic_breath')!.ability,
      slot: 'sub1' as const,
      halfAngleDeg: 95,
    };
    prepareSpellSurge(p, { ...breath, prepareSurge: 8 });
    expect(consumeSpellSurge(p, breath).halfAngleDeg).toBe(95);
  });
  it('Ascent adds a real scaled bubble and movement on its gate, including non-flight boss attacks and true-dragon growth', () => {
    const { w, p } = setup('so_draconic_breath');
    p.maxHp = 400;
    prepareSpellSurge(p, { ...p.abilities!.a1, prepareSurge: 8 });
    use(w, p, 'a1');
    expect(absorptionAmount(p.buffs)).toBe(40);
    expect(p.buffs.find((b) => b.source === 'subclass:ascentSpeed')).toMatchObject({
      mult: 1.2,
      remaining: 3,
    });
    expect(w.events.some((e) => e.t === 'support' && e.kind === 'absorb')).toBe(true);
    expect(w.events.some((e) => e.t === 'support' && e.kind === 'haste')).toBe(true);
    resolvePlayerAbility(w, p, 'a1', zero, p.castAbility);
    expect(absorptionAmount(p.buffs)).toBe(40);
    tickSubclassPassives(p, 6);
    p.buffs = [];
    p.charUpgradeIds = ['so_draconic_g_a'];
    prepareSpellSurge(p, { ...p.abilities!.a1, prepareSurge: 8 });
    consumeSpellSurge(p, p.abilities!.a1, w);
    expect(absorptionAmount(p.buffs)).toBe(60);
    expect(p.buffs.find((b) => b.kind === 'absorption')!.remaining).toBe(4);
  });
});
