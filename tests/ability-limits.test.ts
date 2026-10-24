import { afterEach, describe, expect, it } from 'vitest';
import { World } from '../src/engine/world/world';
import {
  boundedAbility,
  effectiveRecharge,
  persistentDuration,
  refundRecharge,
} from '../src/engine/content/abilityLimits';
import { CLASS_IDS, getClass, describeAbility } from '../src/engine/content/classes';
import {
  CHAR_UPGRADES,
  CHAR_UPGRADES_BY_CLASS,
  previewAbilityTable,
} from '../src/engine/content/charUpgrades';
import { subclassesFor } from '../src/engine/content/subclasses';
import { decompose, recompose, refreshComponents, setForgeSeed } from '../src/engine/content/forge';
import { setProceduralSeed } from '../src/engine/content/procgen';
import { resolvePlayerAbility, stepPlayerGlide } from '../src/engine/combat/abilities';
import { applyBuff, makeBuff } from '../src/engine/combat/combat';
import { ownedSkillRows } from '../src/ui/game/pauseSkills';
import type { ClassId, InputCommand } from '../src/engine/core/types';
function setup(
  classId: ClassId = 'rogue',
  charUpgrades: string[] = [],
  upgrades: 'haste'[] = [],
  subSkills: string[] = [],
) {
  const w = new World({
    monsterId: 'lich',
    seed: 31,
    players: [
      {
        peerId: 'a',
        name: 'A',
        classId,
        charUpgrades,
        upgrades,
        subSkills,
        extraClasses: ['mage'],
      },
    ],
  });
  w.scene = null;
  w.obstacles = [];
  w.terrain = [];
  const p = w.players[0];
  p.pos = { x: 600, y: 400 };
  p.aim = { x: 1, y: 0 };
  p.critChance = 0;
  w.boss!.pos = { x: 650, y: 400 };
  w.boss!.hp = w.boss!.maxHp = 100000;
  w.boss!.decisionTimer = 1000;
  return { w, p };
}
const command = (seq: number, slot: 'a1' | 'a2' | 'a3'): InputCommand => ({
  seq,
  aim: { x: 1, y: 0 },
  move: { x: 0, y: 0 },
  buttons: {
    basic: false,
    a1: slot === 'a1',
    a2: slot === 'a2',
    a3: slot === 'a3',
    sub1: false,
    sub2: false,
    revive: false,
  },
});
afterEach(() => {
  setForgeSeed(null);
  setProceduralSeed(null);
});
describe('shared final cadence', () => {
  it('includes Haste, Focus and protected durations without slowing basics', () => {
    const ab = getClass('rogue').abilities.a1;
    expect(effectiveRecharge(ab, 0.001)).toBe(4);
    expect(effectiveRecharge(getClass('rogue').abilities.basic, 0.001)).toBe(0.3);
    const zone = { ...ab, kind: 'groundZone' as const, zoneDuration: 10, castTime: 1 };
    expect(effectiveRecharge(zone, 0.001, 0.5)).toBe(13.2);
    expect(effectiveRecharge(zone, 0.001, 1)).toBe(13.7);
    expect(describeAbility(zone, { cooldownMult: 0.001, castMult: 0.5 })).toContain(
      '13.2s cooldown',
    );
  });
  it('consumable readiness, finite bubbles and target poison are intentional exceptions', () => {
    const ab = {
      ...getClass('rogue').abilities.a1,
      cooldown: 5,
      prepareCrit: 20,
      venomCoating: { damage: 10, duration: 20, window: 20 },
      absorption: { amount: 10, target: 'self' as const, duration: 20 },
    };
    expect(persistentDuration(ab)).toBe(0);
    expect(effectiveRecharge(ab, 0.1)).toBe(4);
    expect(persistentDuration({ ...ab, frontGuard: { charges: 2, duration: 8 } })).toBe(8);
    expect(
      persistentDuration({ ...ab, grantsFlight: 7, mirrorImages: { count: 2, duration: 9 } }),
    ).toBe(9);
  });
  it('protects actual use and refunds through class swaps, without spending a blocked refund', () => {
    const { w, p } = setup(
      'rogue',
      ['ro_assassin', 'ro_grand_shadow', 'ro_gk_a2_a', 'ro_gk_a2_b'],
      Array<'haste'>(5).fill('haste'),
    );
    w.step(0, new Map([[p.peerId, command(1, 'a2')]]));
    expect(p.cooldowns.a2).toBeGreaterThanOrEqual(4);
    const locked = p.cooldowns.a2;
    expect(refundRecharge(p, 'a2', 100)).toBe(0);
    expect(p.cooldowns.a2).toBe(locked);
    w.setActiveClass(p, 'mage');
    w.step(1, new Map());
    w.setActiveClass(p, 'rogue');
    expect(p.rechargeLocks!.rogue!.a2).toBeCloseTo(locked - 1);
    expect(refundRecharge(p, 'a2', 100)).toBe(0);
  });
  it('Rogue still gets positional value when the four-second floor protects Shadowstep', () => {
    const { w, p } = setup('rogue', ['ro_assassin'], Array<'haste'>(5).fill('haste'));
    w.step(0, new Map([[p.peerId, command(1, 'a2')]]));
    w.boss!.pos = { x: p.pos.x + 30, y: p.pos.y };
    const before = p.cooldowns.a2;
    resolvePlayerAbility(w, p, 'a1', { x: 0, y: 0 });
    expect(p.cooldowns.a2).toBe(before);
    expect(p.buffs.find((b) => b.source === 'assassinateFootwork')?.mult).toBe(1.15);
    expect(p.upgradeRefundRemaining).toBe(4);
  });
  it('Shadow Rhythm keeps a useful non-spam payoff when refunds are protected', () => {
    const { w, p } = setup('monk', [], Array<'haste'>(5).fill('haste'), ['mo_shadow_step']);
    w.step(0, new Map([[p.peerId, command(1, 'a2')]]));
    p.rechargeLocks!.monk = { a1: 1, sub1: 0, sub2: 1, a2: 4 };
    applyBuff(p, makeBuff('root', 0, 3, 'fixtureRoot'));
    applyBuff(p, makeBuff('moveSpeed', 0.5, 3, 'fixtureSlow'));
    applyBuff(p, makeBuff('moveSpeed', 1.2, 3, 'friendlySpeed'));
    resolvePlayerAbility(w, p, 'a3', { x: 0, y: 0 });
    expect(p.cooldowns.a2).toBe(4);
    expect(p.buffs.some((b) => b.kind === 'root' || (b.kind === 'moveSpeed' && b.mult < 1))).toBe(
      false,
    );
    expect(p.buffs.find((b) => b.source === 'friendlySpeed')).toBeTruthy();
    expect(p.buffs.find((b) => b.kind === 'steadfast')?.remaining).toBe(1);
  });
  it('handles missing refund slots without creating negative timers; buff defaults match delivery', () => {
    const { p } = setup();
    expect(refundRecharge(p, 'sub2', 10)).toBe(0);
    const ab = {
      ...getClass('sorcerer').abilities.a2,
      kind: 'selfBuff' as const,
      buffDamageMult: 1.2,
      buffDuration: undefined,
      mirrorImages: undefined,
    };
    expect(persistentDuration(ab)).toBe(4);
    expect(persistentDuration({ ...ab, kind: 'buffAlly' })).toBe(6);
  });
  it('long hard control keeps recovery, while a lingering soft curse can be maintained', () => {
    const ab = { ...getClass('mage').abilities.a2, cooldown: 1, freeze: 8 };
    expect(effectiveRecharge(ab, 0.01)).toBe(10);
    expect(effectiveRecharge({ ...ab, freeze: undefined, cursePayoff: 8 }, 0.01)).toBe(4);
    expect(boundedAbility({ ...getClass('mage').abilities.basic, maxRange: 9000 }).maxRange).toBe(
      900,
    );
  });
  it('a slowed persistent cast reserves recovery from actual delivery', () => {
    const { w, p } = setup('mage', [], Array<'haste'>(5).fill('haste'));
    p.abilities!.a1 = {
      ...p.abilities!.a1,
      kind: 'groundZone',
      zoneDuration: 8,
      castTime: 1,
      cooldown: 1,
      damage: 0,
      zoneTickDamage: 1,
    };
    applyBuff(p, makeBuff('castSlow', 2, 10, 'fixture'));
    w.step(0, new Map([[p.peerId, command(1, 'a1')]]));
    w.step(1.7, new Map());
    expect(p.castTimer).toBeGreaterThan(0);
    w.step(0.2, new Map());
    expect(p.castTimer).toBe(0);
    expect(p.cooldowns.a1).toBeGreaterThanOrEqual(10.7);
  });
});

describe('catalogue invariants and ownership', () => {
  it.each([0, 1, 3, 5])(
    'all canonical skills stay bounded at rank %i, with Haste and current grands',
    (rank) => {
      for (const classId of CLASS_IDS)
        for (const sub of subclassesFor(classId))
          for (const skill of sub.skills) {
            const ids = CHAR_UPGRADES_BY_CLASS[classId].flatMap((d) =>
              Array<string>(rank).fill(d.id),
            );
            ids.push(...Array<string>(rank).fill(`subup_${skill.id}`));
            ids.push(
              ...Object.values(CHAR_UPGRADES)
                .filter(
                  (d) =>
                    d.grand && d.classId === classId && (!d.subclassId || d.subclassId === sub.id),
                )
                .map((d) => d.id),
            );
            const { p } = setup(classId, ids, Array<'haste'>(5).fill('haste'), [skill.id]);
            const preview = previewAbilityTable(classId, ids);
            for (const slot of ['a1', 'a2', 'a3', 'sub1'] as const) {
              const ab = slot === 'sub1' ? p.subAbilities!.sub1! : p.abilities![slot];
              expect(effectiveRecharge(ab, p.cooldownMult, p.castMult)).toBeGreaterThanOrEqual(4);
              if (persistentDuration(ab))
                expect(effectiveRecharge(ab, p.cooldownMult, p.castMult)).toBeGreaterThan(
                  persistentDuration(ab),
                );
              expect(ab.radius ?? 0).toBeLessThanOrEqual(320);
              if (ab.kind === 'dash' || ab.kind === 'blink')
                expect(ab.range ?? 0).toBeLessThanOrEqual(420);
              if (ab.kind === 'groundZone') expect(ab.range ?? 0).toBeLessThanOrEqual(400);
              if (slot !== 'sub1') expect(ab).toEqual(preview[slot]);
            }
          }
    },
  );
  it('ordinary/grand ordering and graft reclaim do not reset the ordinary budget', () => {
    const common = Array<string>(5).fill('ro_vanish');
    const a = previewAbilityTable('rogue', [...common, 'ro_grand_shadow']);
    const b = previewAbilityTable('rogue', ['ro_grand_shadow', ...common]);
    expect(a.a2.cooldown).toBeCloseTo(b.a2.cooldown);
    const ids = ['hy_shadowpact', ...Array<string>(5).fill('graftup:a3:ro_vanish')];
    const live = previewAbilityTable('knight', ids);
    const reseated = previewAbilityTable('knight', [...ids, 'restore:a3', 'hy_shadowpact']);
    expect(reseated.a3).toEqual(live.a3);
    expect(live.a3.cooldown).toBe(6);
  });
  it.each([1, 31])('seeded Forge/procedural previews preserve policy and originals: %i', (seed) => {
    setForgeSeed(seed);
    setProceduralSeed(seed);
    for (const classId of CLASS_IDS) {
      const original = structuredClone(getClass(classId));
      const ids = CHAR_UPGRADES_BY_CLASS[classId].flatMap((d) => Array<string>(5).fill(d.id));
      const { p } = setup(classId, ids, Array<'haste'>(5).fill('haste'));
      for (const a of Object.values(p.abilities!)) {
        expect(Number.isFinite(effectiveRecharge(a, p.cooldownMult, p.castMult))).toBe(true);
        if (a.slot !== 'basic')
          expect(effectiveRecharge(a, p.cooldownMult, p.castMult)).toBeGreaterThanOrEqual(4);
        expect(describeAbility(a)).not.toMatch(/NaN|Infinity/);
      }
      expect(getClass(classId)).toEqual(original);
    }
  });
});

describe('toroidal geometry is bounded consistently', () => {
  it('handles plain and composed geometry without mutating authored values', () => {
    const raw = { ...getClass('mage').abilities.a3, range: 5000, radius: 1000, impactRadius: 1000 };
    const ab = boundedAbility(raw);
    expect(raw.range).toBe(5000);
    expect(ab.range).toBe(420);
    expect(ab.radius).toBe(240);
    expect(boundedAbility(ab)).toEqual(ab);
    const z = { ...raw, kind: 'groundZone' as const, zoneDuration: 3, zoneTickDamage: 5 };
    const composed = boundedAbility(recompose(decompose(z), z));
    expect(composed.range).toBe(400);
    expect(
      composed.components!.effects.find((e) => e.kind === 'zone' && e.zone.radius <= 240),
    ).toBeTruthy();
    expect(boundedAbility({ ...z, zoneTickHeal: 5 }).radius).toBe(320);
  });
  it('composed cadence follows actual capped zones, not stale uncapped flat durations', () => {
    const raw = { ...getClass('warlock').abilities.a1, zoneDuration: 80 };
    const composed = recompose(decompose(raw), raw);
    composed.components = refreshComponents(composed);
    const zone = composed.components.effects.find((e) => e.kind === 'zone');
    if (zone?.kind !== 'zone') throw new Error('Zone missing');
    expect(zone.zone.duration).toBe(8);
    expect(persistentDuration(composed)).toBe(8);
    expect(effectiveRecharge(composed, 0.01)).toBe(10.7);
  });
  it('a rolled dash cannot lap the arena or land behind the intended direction', () => {
    const { w, p } = setup('ranger');
    p.pos = { x: 1550, y: 500 };
    p.abilities!.a3 = { ...p.abilities!.a3, range: 10000 };
    resolvePlayerAbility(w, p, 'a3', { x: 1, y: 0 });
    expect(p.glide!.remaining).toBe(420);
    stepPlayerGlide(w, p, 1);
    expect(p.pos.x).toBeCloseTo(370);
    expect(p.pos.y).toBe(500);
  });
  it('pause text uses the same effective Haste floor and bounded travel as the host', () => {
    const ids = Array<string>(5).fill('ro_vanish'),
      upgrades = Array<'haste'>(5).fill('haste');
    const { p } = setup('rogue', ids, upgrades);
    const row = ownedSkillRows('rogue', 'rogue', upgrades, ids, []).find((r) => r.slot === 'a2')!;
    expect(row.line).toContain(
      `${effectiveRecharge(p.abilities!.a2, p.cooldownMult, p.castMult)}s cooldown`,
    );
  });
});
