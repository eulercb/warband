/** Stable identities; descriptions and short-lived effect expectations remain explicit. */
import assert from 'node:assert/strict';
import { loadPassiveRegistry } from './passive-smoke-cases.mjs';
export const DEFENSE_CASES = {
  first: [
    {
      classId: 'knight',
      slot: 'a2',
      key: 'KeyE',
      text: /block 2 frontal damage hits/,
      badge: /Frontal guard:/,
    },
    {
      classId: 'knight',
      skillId: 'kn_champion_rally',
      text: /heal \d+ self/,
      badge: /Haste|Hastened|Swift/,
      hurt: true,
    },
    {
      classId: 'knight',
      skillId: 'kn_battle_rally',
      text: /recovery grove/,
      // A real incoming hit can consume Guard before Playwright reads it, readying a Counter.
      badge: /Guard:|Counter ready:/,
      hurt: true,
    },
    {
      classId: 'ranger',
      skillId: 'rg_hunter_stand',
      text: /allies in the field gain 20% speed/,
      zone: true,
    },
    { classId: 'barbarian', skillId: 'bb_totem_bear', text: /steadfast 6s/, badge: /Steadfast:/ },
    {
      classId: 'barbarian',
      skillId: 'bb_totem_mend',
      text: /heal \d+ self/,
      badge: /Steadfast:/,
      hurt: true,
    },
    {
      classId: 'paladin',
      slot: 'a3',
      key: 'KeyR',
      text: /[\d.]+s damage immunity/,
      badge: /Invulnerable/,
    },
    { classId: 'paladin', skillId: 'pa_devotion_aura', text: /40 absorption/, bubble: true },
  ],
  remaining: [
    { classId: 'mage', skillId: 'mg_abjurer_teleport', text: /arrival foes return to departure/ },
    {
      classId: 'rogue',
      skillId: 'ro_assassin_smoke',
      text: /prepare next precision crit/,
      badge: /Prepared critical/,
    },
    {
      classId: 'rogue',
      skillId: 'ro_trickster_shield',
      text: /block 1 frontal damage hit/,
      badge: /Frontal guard:/,
    },
    {
      classId: 'bard',
      skillId: 'ba_valor_bolster',
      text: /cleanse movement\/control/,
      badge: /Steadfast:/,
    },
    {
      classId: 'ranger',
      skillId: 'rg_beast_bond',
      text: /effectively healed recipient/,
      badge: /Hastened/,
      hurt: true,
    },
    { classId: 'mage', skillId: 'mg_abjurer_mend', text: /20 absorption/, bubble: true },
    {
      classId: 'monk',
      skillId: 'mo_openhand_ki',
      text: /centering yourself/,
      badge: /Flow prepared/,
      hurt: true,
    },
    {
      classId: 'sorcerer',
      slot: 'a2',
      key: 'KeyE',
      text: /3 mirror images/,
      badge: /Mirror images:/,
    },
  ],
};
export function resolveDefenseSmokeCases({ classes, subclasses, defaultHeroName }, cohort, filter) {
  assert.ok(Object.hasOwn(DEFENSE_CASES, cohort), `Unknown defense cohort: ${cohort}`);
  const tests = DEFENSE_CASES[cohort]
    .map((spec) => {
      const skill = spec.skillId
        ? subclasses
            .filter((s) => s.classId === spec.classId)
            .flatMap((s) => s.skills)
            .find((s) => s.id === spec.skillId)
        : null;
      const ability = spec.slot ? classes[spec.classId]?.abilities[spec.slot] : skill?.ability;
      assert.ok(
        ability,
        `Missing defense smoke receiver: ${spec.skillId ?? `${spec.classId}.${spec.slot}`}`,
      );
      return {
        ...spec,
        name: skill?.name ?? ability.name,
        label: skill ? `${skill.icon} ${skill.name}` : ability.name,
      };
    })
    .filter(
      (c) =>
        !filter || c.name === filter || c.skillId === filter || `${c.classId}.${c.slot}` === filter,
    );
  assert.ok(tests.length, `Unknown defense smoke filter: ${filter}`);
  return { tests, defaultHeroName };
}
export async function loadDefenseSmokeCases(cohort, filter) {
  return resolveDefenseSmokeCases(await loadPassiveRegistry(), cohort, filter);
}

/** Local diagnosis can split viewports; CI defaults to exercising both. */
export function defenseViewports(value = process.env.SMOKE_DEFENSE_VIEWPORT) {
  assert.ok(
    !value || value === 'desktop' || value === 'touch',
    `Unknown defense viewport: ${value}`,
  );
  return value === 'desktop' ? [false] : value === 'touch' ? [true] : [false, true];
}
