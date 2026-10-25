import { expect, it } from 'vitest';
import { describeGrandTransition } from '../src/ui/game/grandPreview';
import {
  changeGrand,
  normalizeGrandLoadout,
  type GrandContext,
} from '../src/engine/content/grandSelections';
import { CHAR_UPGRADES } from '../src/engine/content/charUpgrades';
import { describeAbility } from '../src/engine/content/classes';
import { subclassesFor } from '../src/engine/content/subclasses';
import { World } from '../src/engine/world/world';
import type { UpgradeId } from '../src/engine/content/upgrades';
it('compares legal replacement snapshots using actual host stats, Haste and both bound subclass skills', () => {
  const sub = subclassesFor('mage')[0];
  const ctx: GrandContext = {
    classes: ['knight', 'mage'],
    history: ['kn_grand_immovable', 'mg_grand_archmage'],
    subSkills: sub.skills.slice(0, 2).map((s) => s.id),
  };
  const from = normalizeGrandLoadout(undefined, ctx);
  const candidate = Object.values(CHAR_UPGRADES).find((d) => d.grand && d.subclassId === sub.id)!;
  const banked = changeGrand(
    from,
    ctx,
    { classId: 'mage', id: candidate.id, action: 'earn' },
    true,
  )!;
  const to = changeGrand(banked, ctx, {
    classId: 'mage',
    id: candidate.id,
    action: 'equip',
    replace: 'mg_grand_archmage',
  })!;
  const upgrades: UpgradeId[] = Array<UpgradeId>(5).fill('haste');
  const players = [from, to].map((grandLoadout) => {
    const w = new World({
      seed: 31,
      monsterId: 'lich',
      players: [
        {
          peerId: 'a',
          name: 'A',
          classId: 'knight',
          extraClasses: ['mage'],
          charUpgrades: [...ctx.history],
          subSkills: [...ctx.subSkills],
          upgrades,
          grandLoadout,
        },
      ],
    });
    const p = w.players[0];
    w.setActiveClass(p, 'mage');
    return p;
  });
  const text = describeGrandTransition('mage', ctx, from, to, upgrades);
  for (const p of players) {
    expect(text).toContain(describeAbility(p.abilities!.a1, p));
    expect(text).toContain(String(p.maxHp));
    expect(text).toContain(describeAbility(p.subAbilities!.sub1!, p));
    expect(text).toContain(describeAbility(p.subAbilities!.sub2!, p));
  }
  expect(text).toContain('Now →');
  expect(to.classes.mage!.equipped).not.toContain('mg_grand_archmage');
});
it('does not invent a numerical gain for an unchanged build', () => {
  const ctx: GrandContext = { classes: ['knight'], history: [], subSkills: ['ghost'] };
  const state = normalizeGrandLoadout(undefined, ctx);
  expect(describeGrandTransition('knight', ctx, state, state, [])).toBe(
    'Core numbers unchanged; see the grand effect above.',
  );
});
