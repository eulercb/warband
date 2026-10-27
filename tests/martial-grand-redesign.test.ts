import { afterEach, describe, expect, it } from 'vitest';
import { World } from '../src/engine/world/world';
import { resolvePlayerAbility } from '../src/engine/combat/abilities';
import { applyBuff, makeBuff } from '../src/engine/combat/combat';
import { onHuntWalk } from '../src/engine/combat/martial';
import { absorptionAmount } from '../src/engine/combat/absorption';
import { decompose, recompose, synthesizeAbility, setForgeSeed } from '../src/engine/content/forge';
import { effectiveRecharge } from '../src/engine/content/abilityLimits';
import { getSubSkill, subclassesFor, SUBCLASSES } from '../src/engine/content/subclasses';
import {
  applySubSkillUpgrades,
  GRAND_BY_CLASS,
  SKILL_GRANDS,
  SUBCLASS_GRANDS,
  PILOT_SUB_SKILL_GRANDS,
} from '../src/engine/content/charUpgrades';
import { grandCategory, grandSlot } from '../src/engine/content/grandSelections';
import type { ClassId, Player, AbilitySlot } from '../src/engine/core/types';
import type { PlayerAbilityDef } from '../src/engine/content/classes';

const classes = ['knight', 'barbarian', 'monk'] as const;
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
function compose(p: Player) {
  for (const [slot, ab] of Object.entries(p.abilities!))
    p.abilities![slot as AbilitySlot] = recompose(decompose(ab), ab);
}

describe('martial authored builds', () => {
  it.each([false, true])(
    'aimed shockwaves hit ahead and grand pulls reverse their push, composed=%s',
    (composed) => {
      for (const [classId, skill] of [
        ['knight', 'kn_champion_slam'],
        ['monk', 'mo_openhand_wave'],
      ] as const)
        for (const grand of [false, true]) {
          const { w, p } = setup(classId, grand ? [`${skill}_g`] : [], [skill]);
          const ab = p.subAbilities!.sub1!;
          expect(ab.kind).toBe('meleeCone');
          if (composed) p.subAbilities!.sub1 = recompose(decompose(ab), ab);
          w.spawnAddWave({ x: 540, y: 400 }, 1, { minR: 0, maxR: 0 });
          const rear = w.adds.at(-1)!;
          const hp = rear.hp;
          resolvePlayerAbility(w, p, 'sub1', zero);
          expect(w.boss!.hp).toBeLessThan(10000);
          expect(rear.hp).toBe(hp);
          if (grand) expect(w.boss!.shove!.vx).toBeLessThan(0);
          else expect(w.boss!.shove!.vx).toBeGreaterThan(0);
        }
    },
  );

  it.each([false, true])(
    'Taunt grand and maneuver identity add real protection and suppression, composed=%s',
    (composed) => {
      const { w, p } = setup('knight', ['kn_gk_a1_a', 'kn_battlemaster_g_b'], ['kn_battle_trip']);
      if (composed) compose(p);
      resolvePlayerAbility(w, p, 'a1', zero);
      expect(absorptionAmount(p.buffs)).toBe(60);
      resolvePlayerAbility(w, p, 'a3', zero);
      expect(w.boss!.buffs.some((b) => b.kind === 'castSlow' && b.mult >= 1.3)).toBe(true);
    },
  );

  it.each([false, true])(
    'movement-driven Rage has an achievable base-kit Momentum/control loop, composed=%s',
    (composed) => {
      const { w, p } = setup('barbarian', ['bb_berserker_g_b'], ['bb_berserker_reckless']);
      if (composed) compose(p);
      resolvePlayerAbility(w, p, 'a1', zero);
      expect(p.buffs.some((b) => b.kind === 'wolfHunt')).toBe(true);
      onHuntWalk(p, 120);
      expect(p.buffs.find((b) => b.kind === 'momentum')?.mult).toBe(1);
      resolvePlayerAbility(w, p, 'a3', zero);
      expect(p.buffs.some((b) => b.kind === 'rampage')).toBe(true);
      expect(w.boss!.buffs.some((b) => b.kind === 'moveSpeed' && b.mult <= 0.75)).toBe(true);
    },
  );

  it.each([false, true])(
    'Shadow identity can set up and spend precision with its base kit, composed=%s',
    (composed) => {
      const { w, p } = setup('monk', ['mo_shadow_g_a'], ['mo_shadow_cloud']);
      if (composed) compose(p);
      resolvePlayerAbility(w, p, 'a2', zero);
      expect(p.buffs.some((b) => b.kind === 'precision')).toBe(true);
      resolvePlayerAbility(w, p, 'a1', zero);
      expect(p.buffs.some((b) => b.kind === 'precision')).toBe(false);
      expect(10000 - w.boss!.hp).toBeGreaterThan(p.abilities!.a1.damage);
    },
  );

  it('all martial Honed profiles stay usable through five ranks on native and actual Forge kits', () => {
    for (const seed of [null, 7, 29]) {
      setForgeSeed(seed);
      for (const classId of classes)
        for (const sub of SUBCLASSES[classId])
          for (const skill of sub.skills) {
            const { p } = setup(classId, [], [skill.id]);
            const before = structuredClone(p.subAbilities!.sub1!);
            applySubSkillUpgrades(p, Array(5).fill(`subup_${skill.id}`));
            const after = p.subAbilities!.sub1!;
            expect(after, `${seed}/${skill.id}`).not.toEqual(before);
            expect(
              Object.values(after)
                .filter((v) => typeof v === 'number')
                .every(Number.isFinite),
            ).toBe(true);
            if (after.buffMoveMult != null) expect(after.buffMoveMult).toBeGreaterThanOrEqual(1);
            if (after.buffDamageMult != null)
              expect(after.buffDamageMult).toBeGreaterThanOrEqual(1);
            expect(effectiveRecharge(after, 0.01, p.castMult, 'sub1')).toBeGreaterThanOrEqual(4);
          }
    }
  });

  it('same-delivery Forge utilities missing native hooks gain useful tuning without phantom effects', () => {
    for (const [classId, skill] of [
      ['knight', 'kn_champion_rally'],
      ['barbarian', 'bb_totem_bear'],
      ['monk', 'mo_openhand_ki'],
    ] as const) {
      const { p } = setup(classId, [], [skill]);
      const fused = synthesizeAbility(31, 'different-self-utility', 'a3', [
        {
          classId,
          className: classId,
          name: 'Pressure stance',
          slot: 'a3',
          def: {
            name: 'Pressure stance',
            kind: 'selfBuff',
            damage: 0,
            cooldown: 10,
            buffDamageMult: 1.2,
            buffDuration: 3,
          },
        },
      ]).def;
      expect(fused.kind).toBe('selfBuff');
      p.subAbilities!.sub1 = { ...fused, slot: 'sub1' };
      const before = p.subAbilities!.sub1.buffDamageMult!;
      applySubSkillUpgrades(p, [`subup_${skill}`]);
      const after = p.subAbilities!.sub1;
      expect(after.buffDamageMult).toBeGreaterThan(before);
      expect(after.buffMoveMult).toBeUndefined();
      expect(after.frontGuard).toBeUndefined();
      expect(after.prepareFlow).toBeUndefined();
    }
  });

  it('uses the authored provenance for a changed Forge delivery Honed fallback', () => {
    const skill = 'kn_champion_riposte';
    const nativeKind = getSubSkill(skill)!.ability.kind;
    let chosen = 0;
    for (let seed = 1; seed <= 30; seed++) {
      setForgeSeed(seed);
      if (getSubSkill(skill)!.ability.kind !== nativeKind) {
        chosen = seed;
        break;
      }
    }
    expect(chosen).toBeGreaterThan(0);
    const { p } = setup('knight', [], [skill]);
    const before = structuredClone(p.subAbilities!.sub1!);
    expect(before.kind).not.toBe(nativeKind);
    applySubSkillUpgrades(p, [`subup_${skill}`]);
    const after = p.subAbilities!.sub1!;
    const axes = [
      'damage',
      'zoneTickDamage',
      'zoneTickHeal',
      'healOnUse',
      'buffDamageMult',
      'buffDefMult',
      'buffMoveMult',
    ] as const;
    expect(axes.some((axis) => after[axis] !== before[axis])).toBe(true);
    expect(after.parryOnHit).toBe(before.parryOnHit);
  });

  it.each(classes)(
    '%s offers four native, eight bound-skill and four identity grands',
    (classId) => {
      const base = [
        ...(GRAND_BY_CLASS[classId] ?? []),
        ...SKILL_GRANDS.filter((g) => g.classId === classId),
      ];
      expect(base).toHaveLength(4);
      expect(new Set(base.map((g) => grandSlot(g.id)))).toEqual(
        new Set(['basic', 'a1', 'a2', 'a3']),
      );
      expect(SUBCLASS_GRANDS.filter((g) => g.classId === classId)).toHaveLength(4);
      expect(PILOT_SUB_SKILL_GRANDS.filter((g) => g.classId === classId)).toHaveLength(8);
      for (const sub of subclassesFor(classId))
        for (const first of sub.skills) {
          const baseline = setup(classId, [], [first.id]).p;
          for (const identity of SUBCLASS_GRANDS.filter((g) => g.subclassId === sub.id)) {
            const ids = [base[0].id, base[1].id, `${first.id}_g`, identity.id];
            const selected = setup(classId, ids, [first.id]).p;
            expect(ids.map(grandCategory).sort()).toEqual(['base', 'base', 'identity', 'skill']);
            expect(selected.charUpgradeIds).toEqual(expect.arrayContaining(ids));
            expect(selected.abilities, `${identity.id}/${first.id}`).not.toEqual(
              baseline.abilities,
            );
            const ab = selected.subAbilities!.sub1!;
            expect(ab, `${first.id}_g`).not.toEqual(baseline.subAbilities!.sub1);
            expect(effectiveRecharge(ab, 0.01, selected.castMult, 'sub1')).toBeGreaterThanOrEqual(
              4,
            );
          }
        }
    },
  );

  it.each([false, true])('mobility speed and precision execute once, composed=%s', (composed) => {
    const { w, p } = setup('monk');
    Object.assign(p.abilities!.a2, { buffMoveMult: 1.35, buffDuration: 3, prepareCrit: 4 });
    if (composed) compose(p);
    resolvePlayerAbility(w, p, 'a2', zero);
    expect(p.glide?.remaining).toBeGreaterThan(0);
    expect(p.buffs.filter((b) => b.kind === 'moveSpeed' && b.mult === 1.35)).toHaveLength(1);
    expect(p.buffs.filter((b) => b.kind === 'precision')).toHaveLength(1);
    expect(w.events.some((e) => e.t === 'support' && e.kind === 'haste')).toBe(true);
  });

  it.each([false, true])(
    'root-blocked movement cannot grant speed or precision, composed=%s',
    (composed) => {
      const { w, p } = setup('monk');
      Object.assign(p.abilities!.a2, { buffMoveMult: 1.35, buffDuration: 3, prepareCrit: 4 });
      if (composed) compose(p);
      applyBuff(p, makeBuff('root', 1, 4, 'test'));
      resolvePlayerAbility(w, p, 'a2', zero);
      expect(p.glide).toBeFalsy();
      expect(p.buffs.some((b) => b.kind === 'moveSpeed' || b.kind === 'precision')).toBe(false);
    },
  );

  it.each([false, true])('blink speed has native/composed parity, composed=%s', (composed) => {
    const { w, p } = setup('rogue');
    Object.assign(p.abilities!.a2, { buffMoveMult: 1.35, buffDuration: 3 });
    if (composed) compose(p);
    resolvePlayerAbility(w, p, 'a2', zero);
    expect(p.pos.x).toBeGreaterThan(600);
    expect(p.buffs.filter((b) => b.kind === 'moveSpeed' && b.mult === 1.35)).toHaveLength(1);
  });

  it.each(['absorption', 'frontGuard', 'steadfast', 'prepareCrit', 'warCry'] as const)(
    'actual synthesis can price and execute the supported %s utility',
    (kind) => {
      const { w, p } = setup('knight');
      const source: PlayerAbilityDef = {
        name: 'Utility donor',
        slot: 'a2',
        kind: kind === 'warCry' ? 'taunt' : 'dash',
        damage: 0,
        cooldown: 10,
        range: 120,
        healOnUse: 10,
        buffDefMult: 0.9,
        buffDuration: 3,
        ...(kind === 'absorption'
          ? { absorption: { amount: 20, balanceAmount: 0, duration: 4, target: 'self' as const } }
          : {}),
        ...(kind === 'frontGuard' ? { frontGuard: { charges: 1, duration: 3, counter: 1.3 } } : {}),
        ...(kind === 'steadfast' ? { steadfastDuration: 2 } : {}),
        ...(kind === 'prepareCrit' ? { prepareCrit: 4 } : {}),
        ...(kind === 'warCry' ? { warCry: { radius: 180, duration: 4 } } : {}),
      };
      let forged: PlayerAbilityDef | undefined;
      for (let seed = 1; seed <= 80; seed++) {
        const candidate = synthesizeAbility(seed, 'martial-support', 'a2', [
          {
            name: 'Movement primary',
            classId: 'knight',
            className: 'Knight',
            slot: 'a2',
            def: {
              ...source,
              absorption: undefined,
              frontGuard: undefined,
              steadfastDuration: undefined,
              prepareCrit: undefined,
              warCry: undefined,
            },
          },
          {
            name: 'Support donor',
            classId: 'knight',
            className: 'Knight',
            slot: 'a1',
            def: source,
          },
        ]).def;
        if (candidate.components!.effects.some((e) => e.kind === kind)) {
          forged = { ...candidate, slot: 'a2' };
          break;
        }
      }
      expect(forged, `priced ${kind} must survive actual donor selection`).toBeDefined();
      p.abilities!.a2 = forged!;
      resolvePlayerAbility(w, p, 'a2', zero);
      if (kind === 'absorption') expect(absorptionAmount(p.buffs)).toBeGreaterThan(0);
      if (kind === 'frontGuard') expect(p.buffs.some((b) => b.kind === 'frontGuard')).toBe(true);
      if (kind === 'steadfast') expect(p.buffs.some((b) => b.kind === 'steadfast')).toBe(true);
      if (kind === 'prepareCrit') expect(p.buffs.some((b) => b.kind === 'precision')).toBe(true);
      if (kind === 'warCry') expect(p.buffs.some((b) => b.kind === 'challengeReady')).toBe(true);
    },
  );
});
