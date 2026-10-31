import { afterEach, describe, expect, it } from 'vitest';
import { World } from '../src/engine/world/world';
import { effectiveRecharge } from '../src/engine/content/abilityLimits';
import { setForgeSeed, decompose, recompose, forgeVariant } from '../src/engine/content/forge';
import { resolvePlayerAbility } from '../src/engine/combat/abilities';
import { applyBuff, makeBuff, damagePlayer, tickBuffs } from '../src/engine/combat/combat';
import { absorptionAmount } from '../src/engine/combat/absorption';
import { updateUpgradeZone } from '../src/engine/combat/skillRetouches';
import { getSubSkill, subclassesFor } from '../src/engine/content/subclasses';
import {
  grandCategory,
  grandSlot,
  normalizeGrandLoadout,
} from '../src/engine/content/grandSelections';
import {
  applySubSkillUpgrades,
  applyCharUpgrades,
  CHAR_UPGRADES_BY_CLASS,
  GRAND_BY_CLASS,
  SKILL_GRANDS,
  SUBCLASS_GRANDS,
  PILOT_SUB_SKILL_GRANDS,
  previewSubAbility,
  getCharUpgrade,
} from '../src/engine/content/charUpgrades';
import type { ClassId, GroundZone, AbilitySlot } from '../src/engine/core/types';

const classes = ['cleric', 'paladin', 'bard'] as const;
const nativeGrands = (id: ClassId) => [
  ...(GRAND_BY_CLASS[id] ?? []),
  ...SKILL_GRANDS.filter((d) => d.classId === id),
];
afterEach(() => setForgeSeed(null));
function supportSetup(classId: ClassId, history: string[] = [], subSkills: string[] = []) {
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
  w.boss!.pos = { x: 650, y: 400 };
  w.boss!.hp = w.boss!.maxHp = 10000;
  w.boss!.facing = Math.PI;
  return { w, p };
}
describe('authored support builds', () => {
  it.each(classes)(
    '%s offers every grand category with a useful base route for every first pick',
    (classId) => {
      const native = nativeGrands(classId),
        identities = SUBCLASS_GRANDS.filter((d) => d.classId === classId),
        skills = PILOT_SUB_SKILL_GRANDS.filter((d) => d.classId === classId);
      expect(native).toHaveLength(4);
      expect(new Set(native.map((d) => grandSlot(d.id))).size).toBe(4);
      expect(identities).toHaveLength(4);
      expect(skills).toHaveLength(8);
      for (const sub of subclassesFor(classId))
        for (const first of sub.skills) {
          const baseline = supportSetup(classId, [], [first.id]).p;
          for (const identity of identities.filter((d) => d.subclassId === sub.id)) {
            const p = supportSetup(classId, [identity.id], [first.id]).p;
            expect(p.abilities, `${identity.id}/${first.id}`).not.toEqual(baseline.abilities);
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
  it('keeps 144 legal native and actual Forge builds within recovery and geometry limits', () => {
    let checked = 0;
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
              expect(p.grandLoadout!.classes[classId]!.equipped).toHaveLength(4);
              if (seed !== null)
                expect(getCharUpgrade(`${first.id}_g`)!.desc).toContain(
                  getSubSkill(first.id)!.name,
                );
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
              checked++;
            }
      }
    }
    expect(checked).toBe(144);
  }, 60000);
  it('keeps all 24 Honed profiles useful across five native and Forge ranks', () => {
    for (const seed of [null, 7, 29]) {
      setForgeSeed(seed);
      for (const classId of classes)
        for (const sub of subclassesFor(classId))
          for (const skill of sub.skills) {
            const { p } = supportSetup(classId, [], [skill.id]);
            const before = structuredClone(p.subAbilities!.sub1!);
            applySubSkillUpgrades(p, Array<string>(5).fill(`subup_${skill.id}`));
            const after = p.subAbilities!.sub1!;
            expect(after, `${seed}/${skill.id}`).not.toEqual(before);
            expect(effectiveRecharge(after, 0.9 ** 5, 0.7 ** 5)).toBeGreaterThanOrEqual(4);
            expect(JSON.stringify(after)).not.toContain('null');
          }
    }
  }, 30000);
});

const zero = { x: 0, y: 0 };
const tickZone = (w: World, z: GroundZone) =>
  (w as unknown as { applyZoneTick: (z: GroundZone) => void }).applyZoneTick(z);
const impact = (w: World) => {
  const shot = w.projectiles.at(-1)!;
  shot.pos = { ...w.boss!.pos };
  (w as unknown as { resolvePlayerProjectile: (s: typeof shot) => void }).resolvePlayerProjectile(
    shot,
  );
};
function compose(p: ReturnType<typeof supportSetup>['p'], slots: AbilitySlot[]) {
  for (const slot of slots)
    p.abilities![slot] = recompose(decompose(p.abilities![slot]), p.abilities![slot]);
}
function party(classId: ClassId, history: string[] = [], subSkills: string[] = []) {
  const w = new World({
    monsterId: 'lich',
    seed: 31,
    players: [
      { peerId: 'a', name: 'Support', classId, charUpgrades: history, subSkills },
      { peerId: 'b', name: 'Ally', classId: 'knight' },
    ],
  });
  w.scene = null;
  w.obstacles = [];
  w.terrain = [];
  const [p, ally] = w.players;
  p.pos = { x: 600, y: 400 };
  ally.pos = { x: 650, y: 400 };
  p.aim = { x: 1, y: 0 };
  p.critChance = 0;
  w.boss!.pos = { x: 650, y: 400 };
  w.boss!.hp = w.boss!.maxHp = 10000;
  w.boss!.facing = Math.PI;
  return { w, p, ally };
}
it.each([false, true])(
  'Cleric grands cleanse the selected ally and turn Sanctuary into defended territory, composed=%s',
  (composed) => {
    const { w, p, ally } = party('cleric', ['cl_gk_a1_a', 'cl_gk_a2_b']);
    if (composed) compose(p, ['a1', 'a2']);
    ally.hp -= 60;
    applyBuff(ally, makeBuff('root', 0, 3, 'test'));
    resolvePlayerAbility(w, p, 'a1', zero);
    expect(ally.hp).toBe(ally.maxHp);
    expect(ally.buffs.some((b) => b.kind === 'root')).toBe(false);
    resolvePlayerAbility(w, p, 'a2', zero);
    const z = w.groundZones.at(-1)!;
    const hp = w.boss!.hp;
    tickZone(w, z);
    expect(w.boss!.hp).toBeLessThan(hp);
    expect(w.boss!.buffs.some((b) => b.kind === 'moveSpeed' && b.mult === 0.65)).toBe(true);
    expect(absorptionAmount(p.buffs)).toBeGreaterThan(0);
  },
);
it.each([false, true])(
  'Blessing flight follows native target or composed rally, while Inspiration shields only its selected recipient, composed=%s',
  (composed) => {
    for (const classId of ['cleric', 'bard'] as const) {
      const slot = classId === 'cleric' ? 'a3' : 'a1';
      const { w, p, ally } = party(classId, [classId === 'cleric' ? 'cl_gk_a3_b' : 'ba_gk_a1_b']);
      ally.hp -= 10;
      if (composed) compose(p, [slot]);
      resolvePlayerAbility(w, p, slot, zero);
      if (classId === 'cleric') {
        expect(ally.buffs.some((b) => b.kind === 'flight')).toBe(true);
        expect(p.buffs.some((b) => b.kind === 'flight')).toBe(composed);
      } else {
        expect(absorptionAmount(ally.buffs)).toBe(45);
        expect(absorptionAmount(p.buffs)).toBe(0);
      }
    }
  },
);
it.each([false, true])(
  'Divine Shield identity counter works through the grand’s blocks after immunity, composed=%s',
  (composed) => {
    const { w, p } = supportSetup(
      'paladin',
      ['pa_gk_a3_a', 'pa_devotion_g_a'],
      ['pa_devotion_smite'],
    );
    if (composed) compose(p, ['a3']);
    resolvePlayerAbility(w, p, 'a3', zero);
    expect(p.buffs.find((b) => b.kind === 'frontGuard')).toMatchObject({
      mult: 2,
      blockCounter: 1.3,
    });
    const hp = p.hp;
    damagePlayer(w, p, 20, w.boss!.pos);
    expect(p.hp).toBe(hp);
    expect(p.buffs.find((b) => b.kind === 'frontGuard')!.mult).toBe(2);
    tickBuffs(p, 1.3);
    damagePlayer(w, p, 20, w.boss!.pos);
    expect(p.hp).toBe(hp);
    expect(p.buffs.find((b) => b.kind === 'frontGuard')!.mult).toBe(1);
    expect(p.buffs.find((b) => b.kind === 'counter')!.mult).toBe(1.3);
    const before = w.boss!.hp;
    resolvePlayerAbility(w, p, 'basic', zero);
    expect(before - w.boss!.hp).toBeCloseTo(23 * 1.3);
  },
);
it.each([false, true])(
  'Bolster’s follow-through pays once on a nearby attack, not a missed or distant attack, composed=%s',
  (composed) => {
    const { w, p } = supportSetup('bard', ['ba_valor_bolster_g'], ['ba_valor_bolster']);
    if (composed)
      p.subAbilities!.sub1 = recompose(decompose(p.subAbilities!.sub1!), p.subAbilities!.sub1!);
    resolvePlayerAbility(w, p, 'sub1', zero);
    expect(p.buffs.some((b) => b.kind === 'brambleReady')).toBe(true);
    w.boss!.pos.x = 900;
    resolvePlayerAbility(w, p, 'basic', zero);
    impact(w);
    expect(p.buffs.some((b) => b.kind === 'brambleReady')).toBe(true);
    w.boss!.pos.x = 650;
    const before = w.boss!.hp;
    resolvePlayerAbility(w, p, 'basic', zero);
    impact(w);
    expect(before - w.boss!.hp).toBe(15 + 24);
    expect(p.buffs.some((b) => b.kind === 'brambleReady')).toBe(false);
    const next = w.boss!.hp;
    resolvePlayerAbility(w, p, 'basic', zero);
    impact(w);
    expect(next - w.boss!.hp).toBe(15);
  },
);
it.each([false, true])(
  'Blessed Bloom grand can acquire a following target itself while healing and respecting ground targeting, composed=%s',
  (composed) => {
    const { w, p } = supportSetup('cleric', ['cl_life_bloom_g'], ['cl_life_bloom']);
    if (composed)
      p.subAbilities!.sub1 = recompose(decompose(p.subAbilities!.sub1!), p.subAbilities!.sub1!);
    p.hp -= 40;
    resolvePlayerAbility(w, p, 'sub1', zero);
    const z = w.groundZones.at(-1)!;
    const hp = w.boss!.hp;
    tickZone(w, z);
    expect(w.boss!.hp).toBe(hp - 6);
    expect(p.hp).toBeGreaterThan(p.maxHp - 40);
    expect(z.followId).toBe(w.boss!.id);
    w.boss!.pos.x = 720;
    updateUpgradeZone(w, z, 0.1);
    expect(z.pos).toEqual(w.boss!.pos);
    applyBuff(w.boss!, makeBuff('flight', 0, 3, 'test'));
    updateUpgradeZone(w, z, 0.1);
    expect(z.zoneFollow).toBe(0);
  },
);
it.each([false, true])(
  'Bless grand rewards effective healing with a damage window alongside Renewal, composed=%s',
  (composed) => {
    const { w, p, ally } = party('paladin', ['pa_devotion_bless_g'], ['pa_devotion_bless']);
    if (composed)
      p.subAbilities!.sub1 = recompose(decompose(p.subAbilities!.sub1!), p.subAbilities!.sub1!);
    ally.hp -= 100;
    resolvePlayerAbility(w, p, 'sub1', zero);
    expect(ally.buffs.find((b) => b.kind === 'damageDealt')).toMatchObject({
      mult: 1.25,
      remaining: 4,
    });
    expect(p.paladinAura!.kind).toBe('renewal');
    expect(w.groundZones).toHaveLength(0);
    expect(p.buffs.some((b) => b.kind === 'damageDealt')).toBe(false);
  },
);
it('Flare gains useful Honed duration and a separate finite grand block at full health', () => {
  const { w, p } = supportSetup(
    'cleric',
    ['cl_light_warding_g', ...Array<string>(5).fill('subup_cl_light_warding')],
    ['cl_light_warding'],
  );
  resolvePlayerAbility(w, p, 'sub1', zero);
  expect(absorptionAmount(p.buffs)).toBe(70);
  expect(p.buffs.find((b) => b.kind === 'absorption')!.remaining).toBeCloseTo(7.75);
  expect(p.buffs.find((b) => b.kind === 'frontGuard')!.mult).toBe(1);
});
it('a same-kind Forge ward missing its barrier gets honest generic growth rather than a phantom recipe', () => {
  const entry = structuredClone(getSubSkill('cl_light_warding')!);
  delete entry.ability.absorption;
  entry.ability.buffMoveMult = 1.2;
  entry.ability.buffDuration = 4;
  setForgeSeed(71);
  forgeVariant('subSkill', 'cl_light_warding', () => entry);
  const { p } = supportSetup('cleric', [], ['cl_light_warding']);
  const ab = p.subAbilities!.sub1!;
  const offer = getCharUpgrade('cl_light_warding_g')!;
  expect(offer.desc).toContain('Reforged capstone');
  offer.apply({ player: p, abilities: p.abilities!, subAbilities: p.subAbilities });
  expect(ab.absorption).toBeUndefined();
  expect(ab.frontGuard).toBeUndefined();
  expect(ab.buffMoveMult).toBeGreaterThan(1.2);
  applySubSkillUpgrades(p, ['subup_cl_light_warding']);
  expect(ab.absorption).toBeUndefined();
});

it.each([
  'cl_light_g_a',
  'cl_light_g_b',
  'pa_vengeance_g_a',
  'pa_vengeance_g_b',
  'ba_valor_g_a',
  'ba_whispers_g_a',
  'ba_whispers_g_b',
])(
  '%s gives a real healing-projectile Forge basic useful growth instead of phantom attack riders',
  (id) => {
    const identity = getCharUpgrade(id)!;
    const classId = identity.classId as ClassId;
    const first = subclassesFor(classId).find((s) => s.id === identity.subclassId)!.skills[0].id;
    const { p } = supportSetup(classId, [], [first]);
    const parts = decompose({
      name: 'Recovery shot',
      kind: 'groundZone',
      cooldown: 8,
      damage: 0,
      radius: 100,
      zoneDuration: 3,
      zoneTickHeal: 10,
      zoneKind: 'sanctuary',
    });
    parts.delivery = { kind: 'projectile', projCount: 1, projSpeed: 600 };
    p.abilities!.basic = recompose(parts, { name: 'Recovery shot', slot: 'basic', cooldown: 0.6 });
    applyCharUpgrades(p, [id]);
    const ab = p.abilities!.basic;
    expect(ab.damage).toBe(0);
    expect(ab.zoneTickHeal).toBeGreaterThan(10);
    expect(ab.components!.effects.find((e) => e.kind === 'zone')!.zone.tickHeal).toBeGreaterThan(
      10,
    );
    expect(ab.controlDamageBonus).toBeUndefined();
    expect(ab.lifestealFrac).toBeUndefined();
  },
);
