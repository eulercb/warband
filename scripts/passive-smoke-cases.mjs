/** Stable smoke identities; player-facing labels come from the game registry. */
import assert from 'node:assert/strict';
import { createServer } from 'vite';

export const PASSIVE_COHORTS = {
  pilot: ['rogue', 'warlock'],
  casters: ['mage', 'sorcerer', 'bard'],
  support: ['knight', 'cleric', 'paladin'],
  final: ['barbarian', 'monk', 'ranger', 'druid'],
};
export const PASSIVE_SKILL_IDS = [
  'bb_berserker_chain',
  'bb_totem_bear',
  'mo_openhand_flurry',
  'mo_shadow_dart',
  'rg_hunter_hail',
  'rg_beast_bond',
  'dr_land_wall',
  'dr_moon_regen',
  'dr_moon_roar',
  'kn_champion_riposte',
  'kn_battle_trip',
  'cl_light_warding',
  'cl_life_preserve',
  'pa_devotion_sanctuary',
  'pa_vengeance_smite',
  'mg_evoker_lightning',
  'mg_abjurer_ward',
  'so_draconic_wing',
  'so_wild_surge',
  'so_wild_bend',
  'ba_valor_bolster',
  'ba_whispers_song',
  'ro_assassin_smoke',
  'ro_trickster_shield',
  'wa_fiend_resilience',
  'wa_fiend_rebuke',
  'wa_goo_blast',
  'cl_life_mend',
  'cl_light_flash',
  'mo_openhand_wind',
  'kn_battle_menacing',
  'bb_berserker_slam',
  'bb_totem_quake',
  'ro_assassin_poison',
  'dr_land_spike',
];

export function resolvePassiveSmokeCases(subclasses, { cohort, skillIds } = {}) {
  assert.ok(!cohort || Object.hasOwn(PASSIVE_COHORTS, cohort), `Unknown passive cohort: ${cohort}`);
  const cases = PASSIVE_SKILL_IDS.map((skillId) => {
    const matches = subclasses.filter((s) => s.skills.some((k) => k.id === skillId));
    assert.equal(matches.length, 1, `Missing or ambiguous smoke skill ID: ${skillId}`);
    const sub = matches[0],
      skill = sub.skills.find((k) => k.id === skillId);
    assert.ok(sub.passive?.id && sub.passive.name, `Missing passive for ${skillId}`);
    return {
      classId: sub.classId,
      subclassId: sub.id,
      skillId,
      skill: skill.name,
      passiveId: sub.passive.id,
      passive: sub.passive.name,
    };
  });
  for (const id of skillIds ?? [])
    assert.ok(
      cases.some((c) => c.skillId === id),
      `Unknown smoke skill ID: ${id}`,
    );
  const selected = cases.filter(
    (c) =>
      (!cohort || PASSIVE_COHORTS[cohort].includes(c.classId)) &&
      (!skillIds || skillIds.includes(c.skillId)),
  );
  assert.ok(selected.length, 'No passive cases selected');
  return selected;
}

export async function loadPassiveRegistry() {
  const server = await createServer({
    logLevel: 'silent',
    server: { middlewareMode: true, hmr: false },
  });
  try {
    const { ALL_SUBCLASSES } = await server.ssrLoadModule('/src/engine/content/subclasses.ts');
    const { CLASSES } = await server.ssrLoadModule('/src/engine/content/classes.ts');
    return {
      subclasses: ALL_SUBCLASSES,
      defaultHeroName: CLASSES.knight.name,
      cadenceSkillName: CLASSES.mage.abilities.a2.name,
      cadenceRefundNames: ['a1', 'a2', 'a3'].map((slot) => CLASSES.mage.abilities[slot].name),
    };
  } finally {
    await server.close();
  }
}
