import { CLASS_IDS } from '../src/engine/content/classes';
import { subclassesFor } from '../src/engine/content/subclasses';
import { heroPowerRatio } from '../src/engine/content/balance';
import { previewGrandStats } from '../src/engine/content/grandStats';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CHAR_UPGRADES,
  previewSubAbility,
  canonicalGrandId,
} from '../src/engine/content/charUpgrades';
import {
  emptyGrandLoadout,
  normalizeGrandLoadout,
  changeGrand,
  grandHistory,
  grandCategory,
  grandEligible,
  grandSlot,
  type GrandContext,
} from '../src/engine/content/grandSelections';
import { World } from '../src/engine/world/world';
import { activateGrandStats } from '../src/engine/content/grandStats';
const context: GrandContext = {
  classes: ['knight', 'mage'],
  history: ['kn_bulwark'],
  subSkills: ['kn_champion_slam'],
};
const base = ['kn_gk_basic_a', 'kn_gk_a1_a'];
function earned(ids = base, ctx = context) {
  let state = emptyGrandLoadout();
  for (const id of ids)
    state = changeGrand(state, ctx, { classId: 'knight', id, action: 'earn' }, true)!;
  return state;
}
afterEach(() => {
  delete CHAR_UPGRADES.testGrand;
});
describe('versioned grand selection and ownership', () => {
  it('banks new alternatives but never silently evicts an equipped choice', () => {
    const before = earned();
    const state = changeGrand(
      before,
      context,
      { classId: 'knight', id: 'kn_gk_a2_a', action: 'earn' },
      true,
    )!;
    expect(before.classes.knight!.bank).toEqual(base);
    expect(state.classes.knight!.bank).toHaveLength(3);
    expect(state.classes.knight!.equipped).toEqual(base);
    expect(
      changeGrand(state, context, { classId: 'knight', id: 'kn_gk_a2_a', action: 'equip' }),
    ).toBeNull();
    const replaced = changeGrand(state, context, {
      classId: 'knight',
      id: 'kn_gk_a2_a',
      action: 'equip',
      replace: base[1],
    })!;
    expect(replaced.classes.knight!.equipped).toEqual([base[0], 'kn_gk_a2_a']);
    expect(replaced.classes.knight!.bank).toHaveLength(3);
    expect(
      changeGrand(replaced, context, { classId: 'knight', id: base[0], action: 'unequip' })!.classes
        .knight!.equipped,
    ).toEqual(['kn_gk_a2_a']);
  });
  it('counts basic attacks, grafts and competing variants in the two starting-skill slots', () => {
    const ctx = { ...context, history: ['hy_pyromancer'] };
    const graftGrand = Object.values(CHAR_UPGRADES).find((d) => d.graftId === 'hy_pyromancer')!;
    expect(grandSlot(graftGrand.id)).toBe('a2');
    expect(grandEligible('kn_gk_a2_a', 'knight', ctx)).toBe(false);
    const state = earned([base[0], graftGrand.id], ctx);
    expect(state.classes.knight!.equipped).toHaveLength(2);
    expect(grandHistory('mage', ctx.history, state)).not.toContain(graftGrand.id);
    const reclaimed = { ...ctx, history: [...ctx.history, 'restore:a2'] };
    expect(grandEligible(graftGrand.id, 'knight', reclaimed)).toBe(false);
    expect(normalizeGrandLoadout(state, reclaimed).classes.knight!.bank).toContain(graftGrand.id);
    const restored = { ...reclaimed, history: [...reclaimed.history, 'hy_pyromancer'] };
    expect(grandEligible(graftGrand.id, 'knight', restored)).toBe(true);
    const variants = Object.values(CHAR_UPGRADES).filter((d) => d.graftId === 'hy_pyromancer');
    const variantContext = { ...ctx, history: ['hy_pyromancer', ...variants.map((d) => d.id)] };
    const twoVariants = normalizeGrandLoadout(undefined, variantContext);
    expect(twoVariants.classes.knight!.equipped).toEqual([variants[0].id]);
    expect(
      changeGrand(twoVariants, variantContext, {
        classId: 'knight',
        id: variants[1].id,
        action: 'unequip',
      }),
    ).toBeNull();
    expect(
      changeGrand(twoVariants, variantContext, {
        classId: 'knight',
        id: variants[1].id,
        action: 'equip',
        replace: variants[0].id,
      })!.classes.knight!.equipped,
    ).toEqual([variants[1].id]);
  });
  it('reserves independent individual-skill and identity buckets, with the correct bound recipient', () => {
    const identity = CHAR_UPGRADES.kn_champion_g_a;
    CHAR_UPGRADES.testGrand = { ...identity, id: 'testGrand', subSkillId: 'kn_champion_slam' };
    expect(grandCategory('testGrand')).toBe('skill');
    const state = earned([...base, 'kn_champion_g_a', 'testGrand']);
    expect(state.classes.knight!.equipped).toHaveLength(4);
    const w = new World({
      seed: 31,
      monsterId: 'lich',
      players: [
        {
          peerId: 'a',
          name: 'A',
          classId: 'knight',
          subSkills: ['kn_champion_slam', 'kn_champion_charge'],
          grandLoadout: state,
        },
      ],
    });
    expect(w.players[0].subAbilities!.sub1!.damage).toBe(
      previewSubAbility('kn_champion_slam', ['kn_champion_g_a', 'testGrand'])!.damage,
    );
    expect(w.players[0].subAbilities!.sub2!.damage).toBe(
      previewSubAbility('kn_champion_charge', ['kn_champion_g_a'])!.damage,
    );

    const alternative = changeGrand(
      state,
      context,
      { classId: 'knight', id: 'kn_champion_g_b', action: 'earn' },
      true,
    )!;
    expect(alternative.classes.knight!.equipped).toHaveLength(4);
    expect(
      changeGrand(alternative, context, {
        classId: 'knight',
        id: 'kn_champion_g_b',
        action: 'equip',
        replace: 'testGrand',
      }),
    ).toBeNull();
    expect(grandEligible('testGrand', 'knight', { ...context, subSkills: [] })).toBe(false);
    expect(
      grandEligible('testGrand', 'knight', { ...context, subSkills: ['kn_champion_charge'] }),
    ).toBe(false);
    expect(grandEligible('kn_battlemaster_g_a', 'knight', context)).toBe(false);
    expect(grandEligible('kn_champion_g_a', 'mage', context)).toBe(false);
  });
  it('migrates accumulated legacy power into bounded selections without deleting earned options', () => {
    const ctx = {
      ...context,
      subSkills: ['mg_evoker_lightning'],
      history: [
        'mg_grand_archmage',
        'mg_grand_cataclysm',
        'mg_gk_basic_a',
        'mg_gk_a1_a',
        'mg_gk_a2_a',
        'mg_evoker_g_a',
        'mg_freeze',
        'ghost',
      ],
    };
    const state = normalizeGrandLoadout(undefined, ctx);
    expect(state.classes.mage!.equipped).toHaveLength(3);
    expect(state.classes.mage!.bank).toHaveLength(4);
    expect(state.classes.mage!.equipped).toContain('mg_gk_basic_a');
    expect(
      changeGrand(state, ctx, {
        classId: 'mage',
        id: 'mg_gk_a2_b',
        action: 'equip',
        replace: 'mg_gk_a1_a',
      }),
    ).not.toBeNull();
    expect(normalizeGrandLoadout(state, ctx)).toEqual(state);
    expect(grandHistory('mage', ctx.history, state, ctx.subSkills)).toContain('mg_freeze');
    expect(grandHistory('knight', ctx.history, state, ctx.subSkills)).not.toContain(
      'mg_grand_archmage',
    );
    expect(grandHistory('mage', ctx.history, undefined)).toEqual([
      ...new Set(ctx.history.map(canonicalGrandId)),
    ]);
  });
  it('rejects duplicates, unearned swaps, forged classes and malformed requests atomically', () => {
    const state = earned();
    for (const req of [
      { classId: 'knight', id: base[0], action: 'earn' },
      { classId: 'knight', id: 'kn_bulwark', action: 'earn' },
      { classId: '__proto__', id: base[0], action: 'equip' },
      { classId: 'ranger', id: base[0], action: 'equip' },
      { classId: 'knight', id: 'kn_gk_a2_a', action: 'equip' },
      { classId: 'knight', id: base[0], action: 'equip' },
      { classId: 'knight', id: base[0], action: 'explode' },
      { classId: 'knight', id: 'kn_gk_a2_a', action: 'unequip' },
    ])
      expect(
        changeGrand(state, context, req as Parameters<typeof changeGrand>[2], true),
      ).toBeNull();
    expect(
      changeGrand(emptyGrandLoadout(), context, { classId: 'knight', id: base[0], action: 'earn' }),
    ).toBeNull();
    expect(
      changeGrand(
        state,
        { ...context, subSkills: [] },
        { classId: 'knight', id: 'kn_champion_g_a', action: 'earn' },
        true,
      ),
    ).toBeNull();
    expect(grandCategory('ghost')).toBeNull();
    expect(grandSlot('ghost')).toBeUndefined();
    expect(
      normalizeGrandLoadout(
        {
          version: 1,
          classes: { knight: { bank: ['ghost', ...base], equipped: [...base, ...base] } },
        },
        context,
      ).classes.knight!.equipped,
    ).toEqual(base);
    expect(grandHistory('ranger', [], state)).toEqual([]);
  });
});
describe('production active-class effects', () => {
  it('keeps banked alternatives out of the live kit and the difficulty input', () => {
    const state = earned([...base, 'kn_gk_a2_a']);
    const w = new World({
      seed: 31,
      monsterId: 'lich',
      players: [
        {
          peerId: 'a',
          name: 'A',
          classId: 'knight',
          charUpgrades: [...base, 'kn_gk_a2_a'],
          grandLoadout: state,
        },
      ],
    });
    const p = w.players[0];
    expect(p.charUpgradeIds).toEqual(base);
    expect(p.abilities!.a2.frontGuard?.charges).toBe(2);
    expect(p.grandLoadout!.classes.knight!.bank).toContain('kn_gk_a2_a');
  });
  it('folds legacy grand stats into active skills and preserves health through closed swap cycles', () => {
    const ctx: GrandContext = {
      classes: ['paladin', 'mage'],
      history: ['pa_grand_aegis', 'mg_grand_archmage'],
      subSkills: [],
    };
    const state = normalizeGrandLoadout(undefined, ctx);
    const w = new World({
      seed: 31,
      monsterId: 'lich',
      players: [
        {
          peerId: 'a',
          name: 'A',
          classId: 'paladin',
          extraClasses: ['mage'],
          charUpgrades: [...ctx.history],
          grandLoadout: state,
          upgrades: ['haste'],
        },
      ],
    });
    const p = w.players[0];
    p.hp = p.maxHp * 0.4;
    const initial = { hp: p.hp, maxHp: p.maxHp, damage: p.damageMult, cast: p.castMult };
    expect(p.damageTakenMult).toBe(1);
    for (let i = 0; i < 10; i++) {
      w.setActiveClass(p, 'mage');
      expect(p.damageTakenMult).toBe(1);
      expect(p.damageMult).toBe(1);
      expect(p.castMult).toBe(1);
      expect(p.hp / p.maxHp).toBeCloseTo(0.4);
      expect(p.charUpgradeIds).not.toContain('pa_grand_aegis');
      w.setActiveClass(p, 'paladin');
    }
    expect(p.hp).toBeCloseTo(initial.hp);
    expect(p.maxHp).toBe(initial.maxHp);
    expect(p.damageMult).toBe(initial.damage);
    expect(p.castMult).toBe(initial.cast);
    activateGrandStats(p, undefined);
    expect(p.hp).toBeCloseTo(initial.hp);
  });
});

it.each(CLASS_IDS)(
  'keeps ordinary %s kits and power identical when the new bank is empty',
  (classId) => {
    const subs = subclassesFor(classId)[0]
      .skills.slice(0, 2)
      .map((s) => s.id);
    const history = Object.values(CHAR_UPGRADES)
      .filter((d) => d.classId === classId && !d.grand)
      .map((d) => d.id);
    const init = { peerId: 'a', name: 'A', classId, charUpgrades: history, subSkills: subs };
    const legacy = new World({ seed: 31, monsterId: 'lich', players: [init] }).players[0];
    const current = new World({
      seed: 31,
      monsterId: 'lich',
      players: [
        {
          ...init,
          grandLoadout: normalizeGrandLoadout(undefined, {
            classes: [classId],
            history,
            subSkills: subs,
          }),
        },
      ],
    }).players[0];
    expect(current.abilities).toEqual(legacy.abilities);
    expect(current.subAbilities).toEqual(legacy.subAbilities);
    expect(heroPowerRatio(current)).toBe(heroPowerRatio(legacy));
  },
);

it('uses the identity health for HP-based grand regeneration when another class is activated', () => {
  // No authored martial identity grants passive regeneration now; retain this
  // stat-overlay contract with an explicit HP-based grand effect.
  CHAR_UPGRADES.testGrand = {
    ...CHAR_UPGRADES.pa_grand_aegis,
    classId: 'knight',
    id: 'testGrand',
    apply: ({ player }) => {
      player.regenPerSec += player.maxHp * 0.02;
    },
  };
  const history = ['testGrand'];
  const state = normalizeGrandLoadout(undefined, {
    classes: ['mage', 'knight'],
    history,
    subSkills: [],
  });
  const w = new World({
    seed: 31,
    monsterId: 'lich',
    players: [
      {
        peerId: 'a',
        name: 'A',
        classId: 'mage',
        extraClasses: ['knight'],
        charUpgrades: history,
        grandLoadout: state,
      },
    ],
  });
  const p = w.players[0];
  p.hp *= 0.5;
  w.setActiveClass(p, 'knight');
  expect(p.regenPerSec).toBeCloseTo(p.maxHp * 0.02);
  expect(previewGrandStats('mage', 'knight', [], history, state, []).regenPerSec).toBeCloseTo(
    p.regenPerSec,
  );
});

it('sanitizes persisted bank entries without dropping valid earned choices', () => {
  const value = {
    version: 1,
    classes: {
      knight: {
        bank: [null, 42, 'ghost', 'kn_gk_basic_a'],
        equipped: ['kn_gk_basic_a', '__proto__'],
      },
    },
  };
  const state = normalizeGrandLoadout(
    value as unknown as Parameters<typeof normalizeGrandLoadout>[0],
    context,
  );
  expect(state.classes.knight!.bank).toEqual(['kn_gk_basic_a']);
  expect(state.classes.knight!.equipped).toEqual(['kn_gk_basic_a']);
});
