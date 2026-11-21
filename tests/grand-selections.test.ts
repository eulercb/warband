import { setForgeSeed } from '../src/engine/content/forge';
import { CLASS_IDS } from '../src/engine/content/classes';
import { subclassesFor } from '../src/engine/content/subclasses';
import { heroPowerRatio } from '../src/engine/content/balance';
import { previewGrandStats } from '../src/engine/content/grandStats';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CHAR_UPGRADES,
  GRAFT_GRANDS,
  previewAbilityTable,
  describeCharOffer,
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
  setForgeSeed(null);
  delete CHAR_UPGRADES.testGrand;
});
describe('versioned grand selection and ownership', () => {
  it.each(['hy_shadowpact', 'hy_windstep'])(
    'keeps Aperture banked while %s replaces Blessing',
    (graft) => {
      const ctx: GrandContext = {
        classes: ['warlock'],
        history: [],
        subSkills: ['wa_fiend_hurl'],
      };
      const request = { classId: 'warlock', id: 'wa_fiend_g_a', action: 'earn' } as const;
      const earned = changeGrand(emptyGrandLoadout(), ctx, request, true)!;
      const replaced = { ...ctx, history: [graft] };
      expect(changeGrand(emptyGrandLoadout(), replaced, request, true)).toBeNull();
      const banked = normalizeGrandLoadout(earned, replaced);
      expect(banked.classes.warlock).toEqual({ bank: [request.id], equipped: [] });
      const reclaimed = { ...ctx, history: [graft, 'restore:a3'] };
      expect(
        changeGrand(banked, reclaimed, { ...request, action: 'equip' })?.classes.warlock,
      ).toEqual({ bank: [request.id], equipped: [request.id] });
    },
  );
  it('allows all native graft grands while their receivers occupy the slot', () => {
    for (const grand of GRAFT_GRANDS) {
      const graft = CHAR_UPGRADES[grand.graftId!];
      const ctx: GrandContext = { classes: ['knight'], history: [graft.id], subSkills: [] };
      expect(grandEligible(grand.id, 'knight', ctx), grand.id).toBe(true);
      const slot = graft.replaces!;
      expect(previewAbilityTable('knight', [graft.id, grand.id])[slot]).not.toEqual(
        previewAbilityTable('knight', [graft.id])[slot],
      );
    }
  });
  it.each([
    ['hy_fieldmedic', 'hy_fieldmedic_g_a', 'groundZone'],
    ['hy_hexbrand', 'hy_hexbrand_g_a', 'buffAlly'],
  ])('rejects %s grands on an incompatible Forge delivery', (graft, id, kind) => {
    const ctx: GrandContext = { classes: ['knight'], history: [graft], subSkills: [] };
    const request = { classId: 'knight', id, action: 'earn' } as const;
    const earned = changeGrand(emptyGrandLoadout(), ctx, request, true)!;
    setForgeSeed(1);
    const slot = CHAR_UPGRADES[graft].replaces!;
    const before = previewAbilityTable('knight', [graft])[slot];
    expect(before.kind).toBe(kind);
    expect(previewAbilityTable('knight', [graft, id])[slot]).toEqual(before);
    expect(changeGrand(emptyGrandLoadout(), ctx, request, true)).toBeNull();
    const banked = normalizeGrandLoadout(earned, ctx);
    expect(banked.classes.knight).toEqual({ bank: [id], equipped: [] });
    setForgeSeed(null);
    expect(changeGrand(banked, ctx, { ...request, action: 'equip' })).not.toBeNull();
  });
  it.each([
    ['hy_fieldmedic', 'hy_fieldmedic_g_a', 5, 'damage'],
    ['hy_hexbrand', 'hy_hexbrand_g_a', 3, 'zoneTickDamage'],
    ['hy_hexbrand', 'hy_hexbrand_g_a', 4, 'zoneTickDamage'],
    ['hy_fieldmedic', 'hy_fieldmedic_g_a', 27, 'damage'],
    ['hy_shadowpact', 'hy_shadowpact_g_a', 7, 'iframes'],
    ['hy_windstep', 'hy_windstep_g_b', 19, 'healOnUse'],
    ['hy_warhowl', 'hy_warhowl_g_a', 11, 'buffDuration'],
  ] as const)(
    'keeps %s eligible when Forge seed %s retains the payload',
    (graft, id, seed, field) => {
      setForgeSeed(seed);
      const ctx: GrandContext = { classes: ['knight'], history: [graft], subSkills: [] };
      const slot = CHAR_UPGRADES[graft].replaces!;
      expect(grandEligible(id, 'knight', ctx)).toBe(true);
      const before = previewAbilityTable('knight', [graft])[slot];
      const after = previewAbilityTable('knight', [graft, id])[slot];
      expect(after[field] ?? 0).toBeGreaterThan(before[field] ?? 0);
    },
  );

  it('shows the extra immunity on a compatible Forge movement grand', () => {
    setForgeSeed(7);
    const { desc } = describeCharOffer('knight', ['hy_shadowpact'], 'hy_shadowpact_g_a')!;
    expect(desc).toContain('Now →');
    expect(desc).toContain('damage immunity');
    expect(desc).not.toContain('65%');
  });

  it('finds both compatible and incompatible real Forge receivers for all graft grands', () => {
    const eligible = new Set<string>();
    const blocked = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      setForgeSeed(seed);
      for (const { id, graftId } of GRAFT_GRANDS) {
        const ctx: GrandContext = { classes: ['knight'], history: [graftId!], subSkills: [] };
        const slot = CHAR_UPGRADES[graftId!].replaces!;
        const before = previewAbilityTable('knight', [graftId!])[slot];
        const after = previewAbilityTable('knight', [graftId!, id])[slot];
        if (grandEligible(id, 'knight', ctx)) {
          eligible.add(id);
          expect(after, `Forge seed ${seed}, ${id}`).not.toEqual(before);
        } else {
          blocked.add(id);
          expect(after, `Forge seed ${seed}, ${id}`).toEqual(before);
        }
      }
    }
    expect(eligible.size).toBe(GRAFT_GRANDS.length);
    expect(blocked.size).toBe(GRAFT_GRANDS.length);
  });
  it('does not offer the field-only Relay route without a Momentum preparer', () => {
    const ctx: GrandContext = {
      classes: ['barbarian'],
      history: ['hy_shadowpact', 'hy_inspire'],
      subSkills: ['bb_totem_quake'],
    };
    expect(grandEligible('bb_totem_g_b', 'barbarian', ctx)).toBe(false);
  });

  it('requires the matching ally buff axis for each Anthem grand', () => {
    setForgeSeed(1);
    const ctx: GrandContext = { classes: ['knight'], history: ['hy_inspire'], subSkills: [] };
    expect(grandEligible('hy_inspire_g_a', 'knight', ctx)).toBe(false);
    expect(grandEligible('hy_inspire_g_b', 'knight', ctx)).toBe(true);
  });
  it.each([
    ['barbarian', 'bb_totem_g_b', 'bb_totem_bear', 'bb_totem_quake'],
    ['knight', 'kn_battlemaster_g_a', 'kn_battle_rally', 'kn_battle_precision'],
  ] as const)(
    'guards the %s identity without a receiver and accepts a compatible first pick',
    (classId, id, missing, compatible) => {
      const replaced: GrandContext = {
        classes: [classId],
        history: ['hy_shadowpact'],
        subSkills: [missing],
      };
      expect(grandEligible(id, classId, replaced)).toBe(false);
      expect(grandEligible(id, classId, { ...replaced, subSkills: [compatible] })).toBe(true);
      expect(
        grandEligible(id, classId, { ...replaced, history: [...replaced.history, 'restore:a3'] }),
      ).toBe(true);
    },
  );
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
