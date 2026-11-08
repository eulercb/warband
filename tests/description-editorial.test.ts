import { afterEach, expect, it } from 'vitest';
import { CLASSES, describeAbility } from '../src/engine/content/classes';
import { ALL_SUBCLASSES, getSubSkill } from '../src/engine/content/subclasses';
import { SUBCLASS_PASSIVES } from '../src/engine/content/subclassPassives';
import {
  CHAR_UPGRADES,
  getCharUpgrade,
  describeCharOffer,
} from '../src/engine/content/charUpgrades';
import { UPGRADES } from '../src/engine/content/upgrades';
import { setForgeSeed } from '../src/engine/content/forge';

// Check the text players actually receive, including generated Forge readouts.
// This deliberately flags narrow editorial regressions, not every use of
// “still” or “preserve”: precision/coating rules and ground targeting matter.
const redundant =
  /percentage points?|(?:bonus|growth) remains|ordinary fan growth|still (?:reaches flyers|shares its twin damage budget)|(?:preserve|preserves) the chosen fan width|utilities gain power and footprint|(?:within|under) (?:the )?shared (?:recharge )?budget|stronger (?:existing guards|zone effects) (?:are )?preserved|stronger guards preserved|base-kit route|works? with every subclass choice|it remains a (?:physical )?ground effect/i;
afterEach(() => setForgeSeed(null));
it.each([null, 31])('catalogue copy avoids redundant preservation prose (Forge %s)', (seed) => {
  setForgeSeed(seed);
  const lines: [string, string][] = [];
  for (const cls of Object.values(CLASSES))
    for (const ab of Object.values(cls.abilities))
      lines.push([`${cls.id}/${ab.name}`, describeAbility(ab)]);
  for (const sub of ALL_SUBCLASSES)
    for (const skill of sub.skills) {
      const resolved = getSubSkill(skill.id)!;
      lines.push(
        [skill.id, resolved.desc],
        [`${skill.id}/details`, describeAbility(resolved.ability)],
      );
    }
  for (const [id, def] of Object.entries(CHAR_UPGRADES)) {
    lines.push([id, def.desc], [`${id}/resolved`, getCharUpgrade(id)!.desc]);
    const picks = def.subSkillId ? [def.subSkillId] : [];
    const offer = describeCharOffer(def.classId === 'any' ? 'bard' : def.classId, [], id, picks);
    if (offer) lines.push([`${id}/offer`, offer.desc]);
  }
  for (const [id, def] of Object.entries(UPGRADES)) lines.push([id, def.desc]);
  for (const [id, def] of Object.entries(SUBCLASS_PASSIVES)) lines.push([id, def.desc]);
  expect(lines.length).toBeGreaterThan(800);
  const violations = lines.filter(([, text]) => redundant.test(text));
  expect(violations).toEqual([]);
});

it('resource clauses describe only the receiving skill geometry, native and composed', async () => {
  const { decompose, recompose } = await import('../src/engine/content/forge');
  const { getClass } = await import('../src/engine/content/classes');
  const { previewSubAbility } = await import('../src/engine/content/charUpgrades');
  const entries = [
    { ab: getSubSkill('bb_totem_quake')!.ability, yes: 'field radius', no: /cone|burst radius/ },
    { ab: getClass('barbarian').abilities.a3, yes: 'burst radius', no: /cone|field radius/ },
    {
      ab: { ...getClass('monk').abilities.a1, spendsMomentum: true },
      yes: '+8u reach',
      no: /radius/,
    },
    {
      ab: previewSubAbility('bb_totem_quake', ['bb_totem_g_b', 'subup_bb_totem_quake'])!,
      yes: 'field radius',
      no: /cone|burst radius/,
    },
  ];
  for (const { ab, yes, no } of entries)
    for (const composed of [false, true]) {
      const input = composed
        ? recompose(decompose(ab), { slot: 'sub1', name: 'Receiver', cooldown: 9 })
        : ab;
      const clause = describeAbility(input)
        .split(' · ')
        .find((p) => p.startsWith('spend Momentum'))!;
      expect(clause).toContain(yes);
      expect(clause).not.toMatch(no);
    }
  const dart = describeAbility(getSubSkill('mo_shadow_dart')!.ability);
  expect(dart).toContain('at least 0.6s stun on hit');
  expect(dart).not.toMatch(/cone reach|burst radius/);
  const field = describeAbility(getSubSkill('mo_shadow_cloud')!.ability);
  expect(field).toContain('+35u radius');
  expect(field).not.toContain('cone reach');
});
it('preparation utilities do not promise receiver geometry and direct arrows omit blast caveats', () => {
  for (const id of ['mo_openhand_wind', 'mo_openhand_ki', 'mo_shadow_step']) {
    const text = describeAbility(getSubSkill(id)!.ability);
    expect(text).toContain('next marked special gains its listed Flow effect');
    expect(text).not.toContain('instant with more reach');
  }
  const arrow = describeAbility({ ...CLASSES.ranger.abilities.basic, pierce: 2 });
  expect(arrow).toContain('pierce 2 additional enemies');
  expect(arrow).not.toMatch(/blasts|zones/);
  const blast = describeAbility({ ...CLASSES.mage.abilities.a1, pierce: 2 });
  expect(blast).toContain('blast ends at its first impact');
  expect(blast).not.toContain('additional enemies');
});

it('walking replacement does not simultaneously advertise melee Momentum generation', async () => {
  const { previewAbilityTable } = await import('../src/engine/content/charUpgrades');
  const { decompose, recompose } = await import('../src/engine/content/forge');
  const rage = previewAbilityTable('barbarian', ['bb_berserker_g_b']).a1;
  for (const ab of [rage, recompose(decompose(rage), { slot: 'a1', name: 'Hunt', cooldown: 14 })]) {
    const text = describeAbility(ab);
    expect(text).toContain('instead of melee hits');
    expect(text).not.toContain('melee hits build up');
  }
  const longer = { ...rage, momentumWindow: 8, wolfHunt: 6 };
  expect(describeAbility(longer)).toContain(
    'after the 6s hunt, melee hits build Momentum for the final 2s',
  );
});
