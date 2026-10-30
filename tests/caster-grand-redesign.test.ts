import { afterEach, describe, expect, it } from 'vitest';
import { World } from '../src/engine/world/world';
import { resolvePlayerAbility } from '../src/engine/combat/abilities';
import { applyBuff, damageBoss, damagePlayer, makeBuff } from '../src/engine/combat/combat';
import { absorptionAmount } from '../src/engine/combat/absorption';
import { onSubclassSurge, tickSubclassPassives } from '../src/engine/combat/subclassPassives';
import {
  decompose,
  recompose,
  setForgeSeed,
  synthesizeAbility,
  forgeVariant,
} from '../src/engine/content/forge';
import { effectiveRecharge } from '../src/engine/content/abilityLimits';
import { getSubSkill, subclassesFor } from '../src/engine/content/subclasses';
import {
  applySubSkillUpgrades,
  applyCharUpgrades,
  CHAR_UPGRADES,
  getCharUpgrade,
  CHAR_UPGRADES_BY_CLASS,
  GRAND_BY_CLASS,
  SKILL_GRANDS,
  SUBCLASS_GRANDS,
  PILOT_SUB_SKILL_GRANDS,
  previewSubAbility,
} from '../src/engine/content/charUpgrades';
import {
  grandCategory,
  grandSlot,
  normalizeGrandLoadout,
} from '../src/engine/content/grandSelections';
import type { ClassId, GroundZone, ExtSlot, Vec2, Player } from '../src/engine/core/types';

const zero = { x: 0, y: 0 };
const classes = ['mage', 'sorcerer'] as const;
const nativeGrands = (classId: ClassId) => [
  ...(GRAND_BY_CLASS[classId] ?? []),
  ...SKILL_GRANDS.filter((d) => d.classId === classId),
];
afterEach(() => setForgeSeed(null));
function setup(classId: ClassId, history: string[] = [], subSkills: string[] = []) {
  const w = new World({
    monsterId: 'lich',
    seed: 31,
    players: [{ peerId: 'a', name: 'A', classId, charUpgrades: history, subSkills }],
  });
  w.scene = null;
  w.obstacles = [];
  w.terrain = [];
  const p = w.players[0];
  p.pos = { x: 600, y: 400 };
  p.aim = { x: 1, y: 0 };
  p.critChance = 0;
  w.boss!.pos = { x: 640, y: 400 };
  w.boss!.hp = w.boss!.maxHp = 10000;
  return { w, p };
}

describe('Mage/Sorcerer authored builds', () => {
  it('concentration does not widen a copied volley whose missing fan already means a straight lane', () => {
    const { p } = setup('sorcerer', [], ['so_wild_surge']);
    const ab = p.subAbilities!.sub1!;
    delete ab.spreadDeg;
    CHAR_UPGRADES.so_wild_surge_g.apply({
      player: p,
      abilities: p.abilities!,
      subAbilities: p.subAbilities,
    });
    expect(ab.spreadDeg).toBe(0);
    expect(ab.projCount).toBe(6);
  });

  it('control identities give actual healing-projectile fusions useful growth instead of phantom hit riders', () => {
    for (const [classId, identity] of [
      ['mage', 'mg_evoker_g_b'],
      ['mage', 'mg_abjurer_g_b'],
      ['sorcerer', 'so_draconic_g_b'],
    ] as const) {
      const { p } = setup(classId);
      const zone = {
        name: 'Recovery Shot',
        kind: 'groundZone' as const,
        cooldown: 10,
        damage: 0,
        radius: 100,
        zoneDuration: 3,
        zoneTickHeal: 10,
        zoneKind: 'sanctuary' as const,
      };
      const parts = decompose(zone);
      parts.delivery = { kind: 'projectile', projSpeed: 640, projCount: 1 };
      p.abilities!.basic = recompose(parts, { ...zone, slot: 'basic' });
      applyCharUpgrades(p, [identity]);
      const ab = p.abilities!.basic;
      expect(ab.damage).toBe(0);
      expect(ab.zoneTickHeal).toBeGreaterThan(10);
      expect(ab.controlDamageBonus).toBeUndefined();
      expect(ab.slowMult).toBeUndefined();
      expect(ab.components!.effects.find((e) => e.kind === 'zone')!.zone.tickHeal).toBeGreaterThan(
        10,
      );
    }
  });

  it('uses the same safe fallback in the offer and executor when a legacy Forge payload explicitly disables Surge', () => {
    const skill = 'so_draconic_breath';
    const entry = structuredClone(getSubSkill(skill)!);
    entry.ability.consumesSurge = false;
    setForgeSeed(71);
    forgeVariant('subSkill', skill, () => entry);
    const { p } = setup('sorcerer', [], [skill]);
    const offer = getCharUpgrade(`${skill}_g`)!;
    expect(offer.desc).toContain('Reforged capstone');
    const before = p.subAbilities!.sub1!.damage;
    offer.apply({ player: p, abilities: p.abilities!, subAbilities: p.subAbilities });
    expect(p.subAbilities!.sub1!.damage).toBeGreaterThan(before);
    expect(p.subAbilities!.sub1!.knockback).toBeUndefined();
    expect(p.subAbilities!.sub1!.consumesSurge).toBe(false);
  });

  it('Honed barriers keep optional metadata absent and respect a reversed peel', () => {
    for (const skill of ['mg_evoker_shield', 'mg_abjurer_mend']) {
      const { p } = setup('mage', [], [skill]);
      const ab = p.subAbilities!.sub1!;
      delete ab.absorption!.balanceAmount;
      if (skill === 'mg_evoker_shield') {
        delete ab.knockback;
        ab.pull = 100;
      }
      applySubSkillUpgrades(p, [`subup_${skill}`]);
      expect(ab.absorption!.balanceAmount).toBeUndefined();
      if (skill === 'mg_evoker_shield') {
        expect(ab.pull).toBe(106);
        expect(ab.knockback).toBeUndefined();
      }
    }
  });

  it('preserves stronger existing guard and shared-ward values on compatible copied payloads', () => {
    const { w, p } = setup('sorcerer');
    p.abilities!.a2.allyWard = { range: 260, mult: 0.6, duration: 6 };
    p.abilities!.a3.frontGuard = { charges: 4, duration: 5, counter: 1.5 };
    CHAR_UPGRADES.so_gk_a2_a.apply({ player: p, abilities: p.abilities! });
    CHAR_UPGRADES.so_gk_a3_b.apply({ player: p, abilities: p.abilities! });
    expect(p.abilities!.a2.allyWard).toEqual({ range: 260, mult: 0.6, duration: 6 });
    expect(p.abilities!.a3.frontGuard).toEqual({ charges: 4, duration: 5, counter: 1.5 });
    resolvePlayerAbility(w, p, 'a3', zero);
    expect(p.buffs.find((b) => b.kind === 'frontGuard')!.mult).toBe(4);
  });

  it.each([false, true])(
    'Mirror and Wings grands protect other allies while retaining distinct solo benefits, composed=%s',
    (composed) => {
      for (const wings of [false, true]) {
        const w = new World({
          monsterId: 'lich',
          seed: 31,
          players: [
            {
              peerId: 'a',
              name: 'Caster',
              classId: 'sorcerer',
              charUpgrades: wings
                ? ['so_draconic_wing_g']
                : ['so_gk_a2_a', 'so_mirror', 'so_mirror'],
              subSkills: wings ? ['so_draconic_wing'] : [],
            },
            { peerId: 'b', name: 'Ally', classId: 'knight' },
          ],
        });
        w.scene = null;
        const [p, ally] = w.players;
        p.pos = { x: 600, y: 400 };
        ally.pos = { x: 620, y: 400 };
        const slot = wings ? 'sub1' : 'a2';
        if (composed) {
          const ability = wings ? p.subAbilities!.sub1! : p.abilities!.a2;
          if (wings) p.subAbilities!.sub1 = recompose(decompose(ability), ability);
          else p.abilities!.a2 = recompose(decompose(ability), ability);
        }
        resolvePlayerAbility(w, p, slot, zero);
        expect(p.buffs.some((b) => b.kind === 'damageTaken')).toBe(false);
        expect(ally.buffs.some((b) => b.kind === 'damageTaken' && b.mult === 0.8)).toBe(true);
        if (wings) {
          expect(p.buffs.find((b) => b.kind === 'flight')!.remaining).toBe(7);
          expect(ally.buffs.some((b) => b.kind === 'flight')).toBe(false);
          expect(p.buffs.find((b) => b.kind === 'moveSpeed')!.mult).toBeCloseTo(1.5);
        } else {
          expect(p.buffs.find((b) => b.kind === 'mirrorImages')!.mult).toBe(5);
          expect(p.buffs.some((b) => b.kind === 'steadfast')).toBe(true);
        }
      }
    },
  );

  it('falls back safely for a real same-kind forged Wings without native flight or Surge hooks', () => {
    const { p } = setup('sorcerer', [], ['so_draconic_wing']);
    const fused = synthesizeAbility(7, 'caster-stance', 'a2', [
      {
        classId: 'knight',
        className: 'Knight',
        name: 'Stance',
        slot: 'a2',
        def: {
          name: 'Stance',
          kind: 'selfBuff',
          cooldown: 10,
          damage: 0,
          buffDamageMult: 1.2,
          buffDuration: 3,
        },
      },
    ]).def;
    expect(fused.kind).toBe('selfBuff');
    const before = fused.buffDamageMult!;
    p.subAbilities!.sub1 = { ...fused, slot: 'sub1' };
    applySubSkillUpgrades(p, ['subup_so_draconic_wing']);
    expect(p.subAbilities!.sub1.buffDamageMult).toBeGreaterThan(before);
    expect(p.subAbilities!.sub1.grantsFlight).toBeUndefined();
    expect(p.subAbilities!.sub1.prepareSurge).toBeUndefined();
    expect(p.subAbilities!.sub1.buffMoveMult).toBeUndefined();
  });

  it.each([false, true])(
    'Arch-Evoker preserves basic setup and a real held Fireball payoff, composed=%s',
    (composed) => {
      const { w, p } = setup('mage', ['mg_evoker_g_a'], ['mg_evoker_shield']);
      if (composed)
        for (const slot of ['basic', 'a1', 'a2'] as const)
          p.abilities![slot] = recompose(decompose(p.abilities![slot]), p.abilities![slot]);
      resolvePlayerAbility(w, p, 'a2', zero);
      expect(p.buffs.some((b) => b.kind === 'evocation')).toBe(true);
      const impact = () => {
        const shot = w.projectiles.at(-1)!;
        shot.pos = { ...w.boss!.pos };
        (
          w as unknown as { resolvePlayerProjectile: (projectile: typeof shot) => boolean }
        ).resolvePlayerProjectile(shot);
      };
      let hp = w.boss!.hp;
      resolvePlayerAbility(w, p, 'basic', zero);
      impact();
      expect(hp - w.boss!.hp).toBe(20);
      expect(p.buffs.some((b) => b.kind === 'evocation')).toBe(true);
      hp = w.boss!.hp;
      resolvePlayerAbility(w, p, 'a1', zero);
      impact();
      expect(hp - w.boss!.hp).toBe(150);
      expect(p.buffs.some((b) => b.kind === 'evocation')).toBe(false);
    },
  );

  it.each([false, true])(
    'Unbound Chaos offers a real basic Surge spend with a shared total projectile budget, composed=%s',
    (composed) => {
      for (const first of subclassesFor('sorcerer').find((s) => s.id === 'so_wild')!.skills) {
        const { w, p } = setup('sorcerer', ['so_wild_g_a'], [first.id]);
        if (composed)
          for (const slot of ['basic', 'a2'] as const)
            p.abilities![slot] = recompose(decompose(p.abilities![slot]), p.abilities![slot]);
        resolvePlayerAbility(w, p, 'a2', zero);
        resolvePlayerAbility(w, p, 'basic', zero);
        expect(w.projectiles).toHaveLength(3);
        expect(w.projectiles.reduce((n, shot) => n + shot.damage, 0)).toBeCloseTo(28.8);
        expect(p.buffs.some((b) => b.kind === 'spellSurge')).toBe(false);
        resolvePlayerAbility(w, p, 'basic', zero);
        expect(w.projectiles).toHaveLength(5);
        expect(w.projectiles.slice(-2).reduce((n, shot) => n + shot.damage, 0)).toBe(24);
      }
    },
  );

  it.each([false, true])(
    'caster retort grands arm after their burst and release once on incoming or direct damage, composed=%s',
    (composed) => {
      for (const [classId, skill] of [
        ['mage', 'mg_evoker_sculpt'],
        ['sorcerer', 'so_draconic_scales'],
      ] as const)
        for (const incoming of [false, true]) {
          const { w, p } = setup(classId, [`${skill}_g`], [skill]);
          if (composed)
            p.subAbilities!.sub1 = recompose(
              decompose(p.subAbilities!.sub1!),
              p.subAbilities!.sub1!,
            );
          resolvePlayerAbility(w, p, 'sub1', zero);
          const ready = p.buffs.find((b) => b.kind === 'rebuke')!;
          expect(ready).toBeTruthy();
          const before = w.boss!.hp;
          if (incoming) damagePlayer(w, p, 1);
          else damageBoss(w, p, w.boss!, 10, { direct: true });
          expect(before - w.boss!.hp).toBeCloseTo(ready.mult + (incoming ? 0 : 10));
          expect(p.buffs.some((b) => b.kind === 'rebuke')).toBe(false);
          const next = w.boss!.hp;
          damageBoss(w, p, w.boss!, 10, { direct: true });
          expect(next - w.boss!.hp).toBe(10);
        }
    },
  );

  it.each([false, true])(
    'Sanctum Prison protects full-health allies while retaining aerial roots and suppression, composed=%s',
    (composed) => {
      const { w, p } = setup('mage', ['mg_abjurer_bind_g', 'mg_abjurer_g_b'], ['mg_abjurer_bind']);
      if (composed)
        p.subAbilities!.sub1 = recompose(decompose(p.subAbilities!.sub1!), p.subAbilities!.sub1!);
      resolvePlayerAbility(w, p, 'sub1', zero);
      const zone = w.groundZones.at(-1)!;
      p.pos = { ...zone.pos };
      w.boss!.pos = { ...zone.pos };
      applyBuff(w.boss!, makeBuff('flight', 0, 4, 'test'));
      (w as unknown as { applyZoneTick: (z: GroundZone) => void }).applyZoneTick(zone);
      expect(p.hp).toBe(p.maxHp);
      expect(p.buffs.some((b) => b.kind === 'damageTaken' && b.mult === 0.8)).toBe(true);
      expect(w.boss!.buffs.some((b) => b.kind === 'root')).toBe(true);
      expect(w.boss!.buffs.some((b) => b.kind === 'castSlow' && b.mult === 1.4)).toBe(true);
    },
  );

  it.each([false, true])(
    'Blink guard respects roots unless the control-resistant grand explicitly breaks them, composed=%s',
    (composed) => {
      const { w, p } = setup('mage', ['mg_abjurer_g_a'], ['mg_abjurer_ward']);
      if (composed) p.abilities!.a3 = recompose(decompose(p.abilities!.a3), p.abilities!.a3);
      p.hp = 50;
      applyBuff(p, makeBuff('root', 0, 4, 'test'));
      const start = { ...p.pos };
      const use = () =>
        (
          w as unknown as { tryUseAbility: (player: Player, slot: ExtSlot, move: Vec2) => void }
        ).tryUseAbility(p, 'a3', zero);
      use();
      expect(p.pos).toEqual(start);
      expect(p.hp).toBe(50);
      expect(p.cooldowns.a3).toBe(0);
      expect(p.buffs.some((b) => b.kind === 'frontGuard')).toBe(false);
      p.buffs = [];
      use();
      expect(p.pos).not.toEqual(start);
      expect(p.hp).toBe(50);
      expect(p.buffs.find((b) => b.kind === 'frontGuard')!.mult).toBe(1);
      const escape = setup('mage', ['mg_gk_a3_b', 'mg_abjurer_g_a'], ['mg_abjurer_ward']);
      if (composed)
        escape.p.abilities!.a3 = recompose(
          decompose(escape.p.abilities!.a3),
          escape.p.abilities!.a3,
        );
      escape.p.hp = 50;
      applyBuff(escape.p, makeBuff('root', 0, 4, 'test'));
      resolvePlayerAbility(escape.w, escape.p, 'a3', zero);
      expect(escape.p.pos).not.toEqual(start);
      expect(escape.p.hp).toBe(95);
      expect(escape.p.buffs.some((b) => b.kind === 'root')).toBe(false);
      expect(escape.p.buffs.some((b) => b.kind === 'steadfast')).toBe(true);
    },
  );

  it('capped Ward protection still gains useful identity and five-rank duration', () => {
    const { w, p } = setup(
      'mage',
      ['mg_abjurer_g_a', ...Array<string>(5).fill('subup_mg_abjurer_ward')],
      ['mg_abjurer_ward'],
    );
    resolvePlayerAbility(w, p, 'sub1', zero);
    expect(absorptionAmount(p.buffs)).toBe(50);
    expect(p.buffs.find((b) => b.kind === 'absorption')!.remaining).toBeCloseTo(8);
  });

  it.each(classes)(
    '%s has complete distinct categories and useful starting loops with every first pick',
    (classId) => {
      const native = nativeGrands(classId);
      const identities = SUBCLASS_GRANDS.filter((d) => d.classId === classId);
      const skills = PILOT_SUB_SKILL_GRANDS.filter((d) => d.classId === classId);
      expect(native).toHaveLength(4);
      expect(new Set(native.map((d) => grandSlot(d.id))).size).toBe(4);
      expect(identities).toHaveLength(4);
      expect(skills).toHaveLength(8);
      for (const sub of subclassesFor(classId))
        for (const first of sub.skills) {
          const baseline = setup(classId, [], [first.id]).p;
          for (const identity of identities.filter((d) => d.subclassId === sub.id)) {
            const changed = setup(classId, [identity.id], [first.id]).p;
            expect(changed.abilities, `${identity.id}/${first.id}`).not.toEqual(baseline.abilities);
          }
        }
      for (const grand of skills) {
        expect(grandCategory(grand.id)).toBe('skill');
        expect(previewSubAbility(grand.subSkillId!, [grand.id]), grand.id).not.toEqual(
          previewSubAbility(grand.subSkillId!, []),
        );
      }
    },
  );

  it('keeps 96 legal native/actual Forge builds valid through ordinary and Haste caps', () => {
    for (const seed of [null, 7, 29]) {
      setForgeSeed(seed);
      for (const classId of classes) {
        const native = nativeGrands(classId);
        for (const sub of subclassesFor(classId))
          for (const [index, first] of sub.skills.entries())
            for (const identity of SUBCLASS_GRANDS.filter((d) => d.subclassId === sub.id)) {
              const selected = [
                native[index % 4].id,
                native[(index + 1) % 4].id,
                `${first.id}_g`,
                identity.id,
              ];
              const context = { classes: [classId], history: selected, subSkills: [first.id] };
              const loadout = normalizeGrandLoadout(
                { version: 1, classes: { [classId]: { bank: selected, equipped: selected } } },
                context,
              );
              const w = new World({
                monsterId: 'lich',
                seed: 31,
                players: [
                  {
                    peerId: 'a',
                    name: 'Build',
                    classId,
                    subSkills: [first.id],
                    grandLoadout: loadout,
                    charUpgrades: [
                      ...selected,
                      ...CHAR_UPGRADES_BY_CLASS[classId].flatMap((d) =>
                        Array<string>(5).fill(d.id),
                      ),
                      ...Array<string>(5).fill(`subup_${first.id}`),
                    ],
                    upgrades: Array<'haste'>(5).fill('haste'),
                  },
                ],
              });
              const p = w.players[0];
              if (seed != null)
                expect(getCharUpgrade(`${first.id}_g`)!.desc).toContain(
                  getSubSkill(first.id)!.name,
                );
              expect(p.grandLoadout!.classes[classId]!.equipped).toHaveLength(4);
              for (const ab of [...Object.values(p.abilities!), p.subAbilities!.sub1!]) {
                expect(JSON.stringify(ab), `${seed}/${first.id}/${identity.id}`).not.toContain(
                  'null',
                );
                if (ab.slot !== 'basic')
                  expect(effectiveRecharge(ab, p.cooldownMult, p.castMult)).toBeGreaterThanOrEqual(
                    4,
                  );
                if (ab.kind === 'dash' || ab.kind === 'blink')
                  expect(ab.range).toBeLessThanOrEqual(420);
              }
            }
      }
    }
  });

  it('keeps all sixteen Honed profiles useful through five native/Forge ranks', () => {
    for (const seed of [null, 7, 29]) {
      setForgeSeed(seed);
      for (const classId of classes)
        for (const sub of subclassesFor(classId))
          for (const skill of sub.skills) {
            const { p } = setup(classId, [], [skill.id]);
            const before = structuredClone(p.subAbilities!.sub1!);
            applySubSkillUpgrades(p, Array<string>(5).fill(`subup_${skill.id}`));
            const after = p.subAbilities!.sub1!;
            expect(after, `${seed}/${skill.id}`).not.toEqual(before);
            expect(effectiveRecharge(after, 0.9 ** 5, 0.7 ** 5)).toBeGreaterThanOrEqual(4);
            expect(JSON.stringify(after)).not.toContain('null');
            expect(getSubSkill(skill.id)).toBeTruthy();
          }
    }
  });

  it.each([false, true])(
    'True Dragon works through base preparation and Meteor without a special first pick, composed=%s',
    (composed) => {
      for (const first of subclassesFor('sorcerer').find((s) => s.id === 'so_draconic')!.skills) {
        const { w, p } = setup('sorcerer', ['so_draconic_g_a'], [first.id]);
        if (composed)
          for (const slot of ['a2', 'a1'] as const)
            p.abilities![slot] = recompose(decompose(p.abilities![slot]), p.abilities![slot]);
        resolvePlayerAbility(w, p, 'a2', zero);
        expect(p.buffs.some((b) => b.kind === 'spellSurge')).toBe(true);
        resolvePlayerAbility(w, p, 'a1', zero);
        expect(p.buffs.find((b) => b.kind === 'flight')!.remaining).toBe(4);
        expect(p.buffs.some((b) => b.kind === 'spellSurge')).toBe(false);
        expect(p.subclassPassiveCooldowns!.draconic_surge_ascent).toBe(6);
        onSubclassSurge(p);
        expect(p.buffs.find((b) => b.kind === 'flight')!.remaining).toBe(4);
        tickSubclassPassives(p, 6);
        p.buffs = p.buffs.filter((b) => b.kind !== 'flight');
        applyBuff(p, makeBuff('flight', 0, 8, 'test'));
        onSubclassSurge(p);
        expect(p.buffs.find((b) => b.kind === 'flight')!.remaining).toBe(9);
        tickSubclassPassives(p, 6);
        onSubclassSurge(p);
        expect(p.buffs.find((b) => b.kind === 'flight')!.remaining).toBe(9);
      }
    },
  );
});
