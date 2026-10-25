import { afterEach, describe, expect, it } from 'vitest';
import { World } from '../src/engine/world/world';
import { resolvePlayerAbility } from '../src/engine/combat/abilities';
import { damageBoss } from '../src/engine/combat/combat';
import { subclassDamageMultiplier } from '../src/engine/combat/subclassPassives';
import { setForgeSeed } from '../src/engine/content/forge';
import { effectiveRecharge } from '../src/engine/content/abilityLimits';
import { getSubclass, subclassOfSkill } from '../src/engine/content/subclasses';
import {
  CHAR_UPGRADES,
  GRAND_BY_CLASS,
  SKILL_GRANDS,
  SUBCLASS_GRANDS,
  PILOT_SUB_SKILL_GRANDS,
  PILOT_GRAND_ALIASES,
  canonicalGrandId,
  getCharUpgrade,
  offerableGrands,
  previewAbilityTable,
  previewSubAbility,
} from '../src/engine/content/charUpgrades';
import {
  grandEarnable,
  grandHistory,
  normalizeGrandLoadout,
  type GrandContext,
} from '../src/engine/content/grandSelections';
import type { ClassId } from '../src/engine/core/types';

const ZERO = { x: 0, y: 0 };
function hero(classId: ClassId, charUpgrades: string[], subSkills: string[] = []) {
  const w = new World({
    monsterId: 'lich',
    seed: 31,
    players: [{ peerId: 'a', name: 'A', classId, charUpgrades, subSkills }],
  });
  w.scene = null;
  w.obstacles = [];
  w.terrain = [];
  const p = w.players[0];
  p.pos = { x: 600, y: 400 };
  p.aim = { x: 1, y: 0 };
  return { w, p };
}
afterEach(() => setForgeSeed(null));

describe('Rogue and Warlock authored grands', () => {
  it.each(['rogue', 'warlock'] as const)(
    '%s has exactly four base, four identity and eight individual choices',
    (classId) => {
      const base = [
        ...GRAND_BY_CLASS[classId],
        ...SKILL_GRANDS.filter((d) => d.classId === classId),
      ];
      const identity = SUBCLASS_GRANDS.filter((d) => d.classId === classId);
      const skills = PILOT_SUB_SKILL_GRANDS.filter((d) => d.classId === classId);
      expect(base).toHaveLength(4);
      expect(identity).toHaveLength(4);
      expect(skills).toHaveLength(8);
      expect(
        new Set(base.map((d) => d.skillSlot ?? (d.id === 'wa_grand_pact' ? 'basic' : 'a3'))).size,
      ).toBe(4);
      for (const d of skills) {
        expect(subclassOfSkill(d.subSkillId!)?.classId).toBe(classId);
        const before = previewSubAbility(d.subSkillId!, [])!;
        const after = previewSubAbility(d.subSkillId!, [d.id])!;
        expect(after, d.id).not.toEqual(before);
        const sibling = getSubclass(subclassOfSkill(d.subSkillId!)!.id)!.skills.find(
          (s) => s.id !== d.subSkillId,
        )!;
        expect(previewSubAbility(sibling.id, [d.id])).toEqual(previewSubAbility(sibling.id, []));
      }
    },
  );

  it('canonicalizes old banks and histories once, without duplicate effects or new alias offers', () => {
    for (const [alias, canonical] of Object.entries(PILOT_GRAND_ALIASES)) {
      const classId = CHAR_UPGRADES[canonical].classId as ClassId;
      const ctx: GrandContext = { classes: [classId], history: [alias, canonical], subSkills: [] };
      const state = normalizeGrandLoadout(undefined, ctx);
      expect(state.classes[classId]!.bank).toEqual([canonical]);
      expect(normalizeGrandLoadout(state, ctx)).toEqual(state);
      expect(grandHistory(classId, ctx.history, state)).toEqual([canonical]);
      expect(grandHistory(classId, ctx.history, undefined)).toEqual([canonical]);
      expect(grandEarnable(alias, classId, ctx)).toBe(false);
      expect(canonicalGrandId(alias)).toBe(canonical);
      expect(previewAbilityTable(classId, [alias, canonical])).toEqual(
        previewAbilityTable(classId, [canonical]),
      );
    }
    expect(canonicalGrandId('__proto__')).toBe('__proto__');
    expect(
      offerableGrands('rogue', [], ['ro_assassin_strike']).every(
        (d) => canonicalGrandId(d.id) === d.id,
      ),
    ).toBe(true);
  });

  it('uses whole-kit identities with the first subclass skill and keeps the other identity distinct', () => {
    for (const classId of ['rogue', 'warlock'] as const) {
      for (const sub of classId === 'rogue'
        ? ['ro_assassin', 'ro_trickster']
        : ['wa_fiend', 'wa_great_old_one']) {
        const [a, b] = SUBCLASS_GRANDS.filter((d) => d.subclassId === sub);
        for (const first of getSubclass(sub)!.skills.map((s) => s.id)) {
          const baseline = hero(classId, [], [first]).p;
          for (const identity of [a, b]) {
            const changed = hero(classId, [identity.id], [first]).p;
            expect(changed.abilities, `${identity.id}/${first}`).not.toEqual(baseline.abilities);
            expect(changed.subAbilities!.sub1, `${identity.id}/${first}`).not.toEqual(
              baseline.subAbilities!.sub1,
            );
          }
        }
      }
    }
  });

  it('resolves a legal four-slot kit across ordinary ranks and Haste without bypassing recovery floors', () => {
    for (const classId of ['rogue', 'warlock'] as const) {
      const base =
        classId === 'rogue' ? ['ro_gk_basic_b', 'ro_gk_a1_a'] : ['wa_grand_pact', 'wa_gk_a1_a'];
      const ordinaryId = classId === 'rogue' ? 'ro_assassin' : 'wa_hex';
      for (const sub of classId === 'rogue'
        ? ['ro_assassin', 'ro_trickster']
        : ['wa_fiend', 'wa_great_old_one']) {
        const [identityA, identityB] = SUBCLASS_GRANDS.filter((d) => d.subclassId === sub);
        for (const first of getSubclass(sub)!.skills.map((s) => s.id)) {
          for (const identity of [identityA, identityB]) {
            for (const rank of [0, 1, 3, 5]) {
              const history = Array(rank).fill(ordinaryId);
              const selected = [...base, identity.id, `${first}_g`];
              const loadout = {
                version: 1 as const,
                classes: {
                  [classId]: { bank: selected, equipped: selected },
                },
              };
              const w = new World({
                monsterId: 'lich',
                seed: 31,
                players: [
                  {
                    peerId: 'a',
                    name: 'A',
                    classId,
                    charUpgrades: history,
                    subSkills: [first],
                    upgrades: Array(5).fill('haste'),
                    grandLoadout: loadout,
                  },
                ],
              });
              const p = w.players[0];
              expect(p.charUpgradeIds?.filter((id) => CHAR_UPGRADES[id]?.grand)).toEqual(selected);
              expect(p.subAbilities?.sub1).toBeDefined();
              for (const ab of [
                p.abilities!.a1,
                p.abilities!.a2,
                p.abilities!.a3,
                p.subAbilities!.sub1!,
              ]) {
                expect(
                  Number.isFinite(effectiveRecharge(ab, p.cooldownMult, p.castMult, ab.slot)),
                ).toBe(true);
                expect(
                  effectiveRecharge(ab, p.cooldownMult, p.castMult, ab.slot),
                ).toBeGreaterThanOrEqual(4);
              }
            }
          }
        }
      }
    }
  });

  it('fires the new coating, escape web, pit ward, and prophetic guard in combat', () => {
    const coated = hero('rogue', ['ro_assassin_poison_g'], ['ro_assassin_poison']);
    resolvePlayerAbility(coated.w, coated.p, 'sub1', ZERO);
    expect(coated.p.buffs.some((b) => b.kind === 'precision')).toBe(true);
    expect(coated.p.buffs.some((b) => b.kind === 'venomReady')).toBe(true);

    const web = hero('rogue', ['ro_trickster_snare_g'], ['ro_trickster_snare']);
    resolvePlayerAbility(web.w, web.p, 'sub1', ZERO);
    expect(web.w.groundZones.at(-1)!.pos).toEqual(web.p.pos);
    expect(web.w.groundZones.at(-1)!.allyBuff?.moveMult).toBe(1.2);

    const pit = hero('warlock', ['wa_fiend_pit_g'], ['wa_fiend_pit']);
    resolvePlayerAbility(pit.w, pit.p, 'sub1', ZERO);
    expect(pit.w.groundZones.at(-1)!.allyBuff?.defMult).toBe(0.8);
    expect(pit.w.groundZones.at(-1)!.curseBonus).toBe(0.2);

    const ward = hero('warlock', ['wa_goo_flee_g'], ['wa_goo_flee']);
    resolvePlayerAbility(ward.w, ward.p, 'sub1', ZERO);
    expect(ward.p.buffs.find((b) => b.kind === 'frontGuard')?.mult).toBe(1);
  });

  it('lets Cunning spend Spellblade on a direct spell hit, while Sleight rewards a melee hit', () => {
    const cunning = hero('rogue', ['ro_trickster_g_a'], ['ro_trickster_bolt']);
    cunning.p.buffs.push({ kind: 'spellblade', mult: 1.2, remaining: 5, source: 'test' });
    const target = cunning.w.boss!;
    expect(subclassDamageMultiplier(cunning.p, target, { direct: true, melee: false })).toBe(1.2);
    expect(target.buffs.some((b) => b.kind === 'castSlow')).toBe(true);
    const sleight = hero('rogue', ['ro_trickster_g_b'], ['ro_trickster_bolt']);
    sleight.p.buffs.push({ kind: 'spellblade', mult: 1.2, remaining: 5, source: 'test' });
    sleight.p.cooldowns.a2 = 5;
    expect(
      subclassDamageMultiplier(sleight.p, sleight.w.boss!, { direct: true, melee: true }),
    ).toBe(1.2);
    expect(sleight.p.buffs.some((b) => b.kind === 'frontGuard')).toBe(true);
    expect(sleight.p.cooldowns.a2).toBe(4);
    sleight.p.buffs.push({ kind: 'spellblade', mult: 1.2, remaining: 5, source: 'test' });
    sleight.p.rechargeLocks = { rogue: { a2: 5 } };
    sleight.p.cooldowns.a2 = 5;
    expect(
      subclassDamageMultiplier(sleight.p, sleight.w.boss!, { direct: false, melee: false }),
    ).toBe(1);
    expect(sleight.p.buffs.some((b) => b.kind === 'spellblade')).toBe(true);
    expect(
      subclassDamageMultiplier(sleight.p, sleight.w.boss!, { direct: true, melee: true }),
    ).toBe(1.2);
    expect(sleight.p.cooldowns.a2).toBe(5); // protected recovery cannot be refunded

    const state = {
      version: 1 as const,
      classes: {
        rogue: {
          bank: ['ro_trickster_g_a', 'ro_trickster_g_b'],
          equipped: ['ro_trickster_g_b'],
        },
      },
    };
    const isolated = new World({
      monsterId: 'lich',
      seed: 31,
      players: [
        {
          peerId: 'a',
          name: 'A',
          classId: 'rogue',
          grandLoadout: state,
          subSkills: ['ro_trickster_bolt'],
        },
      ],
    });
    isolated.scene = null;
    const active = isolated.players[0];
    active.buffs.push({ kind: 'spellblade', mult: 1.2, remaining: 5, source: 'test' });
    expect(subclassDamageMultiplier(active, isolated.boss!, { direct: true, melee: false })).toBe(
      1,
    );
    expect(isolated.boss!.buffs.some((b) => b.source === 'cunningSpellblade')).toBe(false);
  });

  it.each([0, undefined])(
    'keeps Sleight useful when movement recharge is already ready (%s)',
    (remaining) => {
      const { w, p } = hero('rogue', ['ro_trickster_g_b'], ['ro_trickster_bolt']);
      p.buffs.push({
        kind: 'spellblade',
        mult: 1.2,
        remaining: 5,
        source: 'subclass:trickster_spellblade',
      });
      Object.assign(p.cooldowns, { a2: remaining });
      damageBoss(w, p, w.boss!, 10, { direct: true, melee: true });
      expect(p.buffs.some((b) => b.kind === 'spellblade')).toBe(false);
      expect(p.buffs.find((b) => b.kind === 'frontGuard')?.mult).toBe(1);
      expect(p.cooldowns.a2).toBe(remaining); // no fabricated or negative recharge
    },
  );

  it('keeps individual skill grand wording and payload in Forge', () => {
    setForgeSeed(4242);
    const id = 'ro_assassin_poison_g';
    const offer = getCharUpgrade(id)!;
    expect(offer.desc).toContain('prepares precision');
    expect(offer.desc).not.toContain('stacks to 5');
    const before = previewSubAbility('ro_assassin_poison', [])!;
    const after = previewSubAbility('ro_assassin_poison', [id])!;
    expect(after.components).toBeDefined();
    expect(after.prepareCrit).toBeGreaterThan(before.prepareCrit ?? 0);
  });

  it('keeps every individual grand useful when Forge changes the skill delivery', () => {
    for (const seed of [7, 31, 4242]) {
      setForgeSeed(seed);
      for (const grand of PILOT_SUB_SKILL_GRANDS) {
        const skill = grand.subSkillId!;
        const before = previewSubAbility(skill, [])!;
        const after = previewSubAbility(skill, [grand.id])!;
        expect(after, `${grand.id}@${seed}`).not.toEqual(before);
        expect(Number.isFinite(after.cooldown)).toBe(true);
        expect(after.components, `${grand.id}@${seed}`).toBeDefined();
      }
    }
  });

  it('Soul Bastion still grants a real defense when Forge replaces its barrier payload', () => {
    setForgeSeed(7);
    const before = previewSubAbility('wa_fiend_resilience', [])!;
    expect(before.absorption).toBeUndefined();
    const { w, p } = hero('warlock', ['wa_fiend_resilience_g'], ['wa_fiend_resilience']);
    expect(p.subAbilities!.sub1!.frontGuard?.charges).toBe(1);
    resolvePlayerAbility(w, p, 'sub1', ZERO);
    expect(p.buffs.find((b) => b.kind === 'frontGuard')?.mult).toBe(1);
  });
});
