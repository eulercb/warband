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
