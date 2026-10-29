import { afterEach, describe, expect, it } from 'vitest';
import { World } from '../src/engine/world/world';
import { resolvePlayerAbility } from '../src/engine/combat/abilities';
import { applyBuff, makeBuff } from '../src/engine/combat/combat';
import { absorptionAmount } from '../src/engine/combat/absorption';
import { commandCompanion, updateCompanions } from '../src/engine/combat/companions';
import { decompose, recompose, setForgeSeed, synthesizeAbility } from '../src/engine/content/forge';
import { effectiveRecharge } from '../src/engine/content/abilityLimits';
import { getSubSkill, subclassesFor } from '../src/engine/content/subclasses';
import {
  applySubSkillUpgrades,
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
import type { ClassId, AbilitySlot } from '../src/engine/core/types';

const zero = { x: 0, y: 0 };
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

describe('Ranger/Druid authored builds', () => {
  it('resolves legal four-grand builds through actual Forge deliveries, all first picks and ordinary/Haste caps', () => {
    for (const seed of [7, 29]) {
      setForgeSeed(seed);
      for (const classId of ['ranger', 'druid'] as const) {
        const native = SKILL_GRANDS.filter((d) => d.classId === classId);
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
                    name: 'Forged',
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

  it('keeps Pack Tactics leech additive through five Honed ranks and never lowers stronger existing leech', () => {
    for (const identity of [false, true]) {
      const { p } = setup(
        'ranger',
        [
          ...(identity ? ['rg_beastmaster_g_b'] : []),
          ...Array<string>(5).fill('subup_rg_beast_bite'),
        ],
        ['rg_beast_bite'],
      );
      expect(p.subAbilities!.sub1!.lifestealFrac).toBeCloseTo(identity ? 0.4 : 0.3);
    }
    for (const [classId, skill] of [
      ['ranger', 'rg_beast_bite'],
      ['monk', 'mo_shadow_strike'],
    ] as const) {
      const { p } = setup(classId, [], [skill]);
      p.subAbilities!.sub1!.lifestealFrac = 0.7;
      applySubSkillUpgrades(p, [`subup_${skill}`]);
      expect(p.subAbilities!.sub1!.lifestealFrac).toBe(0.7);
    }
  });

  it('uses the generic Honed fallback for a real synthesized same-kind healing field without native hooks', () => {
    const skill = 'rg_hunter_stand';
    const { p } = setup('ranger', [], [skill]);
    const fused = synthesizeAbility(7, 'nature-recovery', 'a2', [
      {
        classId: 'druid',
        className: 'Druid',
        name: 'Recovery Field',
        slot: 'a2',
        def: {
          name: 'Recovery Field',
          kind: 'groundZone',
          damage: 0,
          cooldown: 12,
          range: 200,
          radius: 100,
          zoneDuration: 3,
          zoneTickHeal: 10,
          zoneKind: 'sanctuary',
        },
      },
    ]).def;
    expect(fused.kind).toBe('groundZone');
    expect(fused.zoneTickDamage).toBeFalsy();
    const before = fused.zoneTickHeal!;
    p.subAbilities!.sub1 = { ...fused, slot: 'sub1' };
    applySubSkillUpgrades(p, [`subup_${skill}`]);
    expect(p.subAbilities!.sub1.zoneTickHeal).toBeGreaterThan(before);
    expect(p.subAbilities!.sub1.zoneAllyMoveMult).toBeUndefined();
    expect(p.subAbilities!.sub1.zoneTickDamage).toBeFalsy();
  });

  it.each([false, true])(
    'Wild Bloom protects at full HP and Gust has a real aimed front, composed=%s',
    (composed) => {
      const { w, p } = setup('druid', ['dr_gk_a2_a', 'dr_land_wind_g'], ['dr_land_wind']);
      for (const slot of ['a2'] as const)
        if (composed)
          p.abilities![slot] = recompose(decompose(p.abilities![slot]), p.abilities![slot]);
      if (composed)
        p.subAbilities!.sub1 = recompose(decompose(p.subAbilities!.sub1!), p.subAbilities!.sub1!);
      resolvePlayerAbility(w, p, 'a2', zero);
      expect(p.hp).toBe(p.maxHp);
      expect(absorptionAmount(p.buffs)).toBe(35);
      w.spawnAddWave({ x: 540, y: 400 }, 1, { minR: 0, maxR: 0 });
      const rear = w.adds.at(-1)!;
      const hp = rear.hp;
      resolvePlayerAbility(w, p, 'sub1', zero);
      expect(w.boss!.hp).toBeLessThan(10000);
      expect(w.boss!.buffs.some((b) => b.kind === 'stun' && b.source === 'freeze')).toBe(true);
      expect(w.boss!.shove!.vx).toBeGreaterThan(0);
      expect(rear.hp).toBe(hp);
    },
  );

  it.each(['ranger', 'druid'] as const)(
    '%s has four native, eight bound-skill and four identity choices with useful first picks',
    (classId) => {
      const native = [
        ...(GRAND_BY_CLASS[classId] ?? []),
        ...SKILL_GRANDS.filter((d) => d.classId === classId),
      ];
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
        const skill = grand.subSkillId!;
        expect(previewSubAbility(skill, [grand.id]), grand.id).not.toEqual(
          previewSubAbility(skill, []),
        );
      }
    },
  );

  it.each([false, true])(
    'wolf identity changes commands and controlled bites without extra orders, composed=%s',
    (composed) => {
      for (const grand of [false, true]) {
        const first = subclassesFor('ranger').find((s) => s.id === 'rg_beastmaster')!.skills[0].id;
        const { w, p } = setup('ranger', grand ? ['rg_beastmaster_g_a'] : [], [first]);
        expect(p.subclassPassiveId).toBe('beast_pack_bond');
        if (composed)
          p.abilities!.basic = recompose(decompose(p.abilities!.basic), p.abilities!.basic);
        applyBuff(w.boss!, makeBuff('root', 0, 3, 'test'));
        resolvePlayerAbility(w, p, 'basic', zero);
        const shot = w.projectiles.at(-1)!;
        shot.pos = { ...w.boss!.pos };
        (
          w as unknown as { resolvePlayerProjectile: (projectile: typeof shot) => boolean }
        ).resolvePlayerProjectile(shot);
        const before = w.boss!.hp;
        expect(p.spiritCompanion!.order!.windup).toBe(grand ? 0.15 : 0.3);
        for (let i = 0; i < 30; i++) updateCompanions(w, 1 / 60);
        expect(before - w.boss!.hp).toBe(grand ? 24 : 20);
        expect(p.spiritCompanion!.order).toBeUndefined();
        expect(p.subclassPassiveCooldowns!.beast_pack_bond).toBe(2.5);
        commandCompanion(p, w.boss!, 'boss', 1, true);
        expect(p.spiritCompanion!.order).toBeUndefined();
      }
    },
  );

  it.each([false, true])(
    'Moon identities change form window versus real aimed claw reach, composed=%s',
    (composed) => {
      const first = subclassesFor('druid').find((s) => s.id === 'dr_moon')!.skills[0].id;
      for (const identity of [undefined, 'dr_moon_g_a', 'dr_moon_g_b']) {
        const { w, p } = setup('druid', identity ? [identity] : [], [first]);
        if (composed)
          for (const slot of ['basic', 'a2'] as AbilitySlot[])
            p.abilities![slot] = recompose(decompose(p.abilities![slot]), p.abilities![slot]);
        resolvePlayerAbility(w, p, 'a2', zero);
        expect(p.buffs.find((b) => b.kind === 'moonForm')!.remaining).toBe(
          identity === 'dr_moon_g_a' ? 8 : 6,
        );
        expect(p.buffs.find((b) => b.source === 'subclass:moon:stride')!.remaining).toBe(
          identity === 'dr_moon_g_a' ? 8 : 6,
        );
        expect(p.subclassPassiveCooldowns!.moon_aspect).toBe(12);
        w.boss!.pos = { x: 1100, y: 700 };
        w.spawnAddWave({ x: 715, y: 400 }, 1, { minR: 0, maxR: 0 });
        const target = w.adds.at(-1)!;
        target.radius = 5;
        const before = target.hp;
        w.events = [];
        resolvePlayerAbility(w, p, 'basic', zero);
        expect(before - target.hp).toBe(identity === 'dr_moon_g_b' ? 14 : 0);
        const cue = w.events.find((e) => e.t === 'skillArea');
        expect(cue && cue.t === 'skillArea' && cue.area.range).toBe(
          identity === 'dr_moon_g_b' ? 125 : 95,
        );
      }
    },
  );

  it('all authored Honed profiles remain useful at five ranks on native and actual Forge kits', () => {
    for (const seed of [null, 7, 29]) {
      setForgeSeed(seed);
      for (const classId of ['ranger', 'druid'] as const)
        for (const sub of subclassesFor(classId))
          for (const skill of sub.skills) {
            const { p } = setup(classId, [], [skill.id]);
            const before = structuredClone(p.subAbilities!.sub1!);
            applySubSkillUpgrades(p, Array(5).fill(`subup_${skill.id}`));
            const after = p.subAbilities!.sub1!;
            expect(after, `${seed}/${skill.id}`).not.toEqual(before);
            expect(effectiveRecharge(after, 0.9 ** 5, 0.7 ** 5)).toBeGreaterThanOrEqual(4);
            expect(JSON.stringify(after)).not.toContain('null');
            expect(getSubSkill(skill.id)).toBeTruthy();
          }
    }
  });
});
