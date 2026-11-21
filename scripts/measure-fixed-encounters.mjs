/** Run from the repository root: node scripts/measure-fixed-encounters.mjs */
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const duration = 90;
const seeds = [31, 79, 137, 211, 307, 401];
const supportBosses = ['troll', 'beholder'];
const builds = [
  {
    label: 'Valor',
    classId: 'bard',
    pick: 'ba_valor_bolster',
    bosses: supportBosses,
    ordinary: ['subup_ba_valor_bolster'],
    identities: ['ba_valor_g_a', 'ba_valor_g_b'],
  },
  {
    label: 'Valor',
    classId: 'bard',
    pick: 'ba_valor_blade',
    bosses: supportBosses,
    identities: ['ba_valor_g_a', 'ba_valor_g_b'],
  },
  {
    label: 'Devotion',
    classId: 'paladin',
    pick: 'pa_devotion_aura',
    bosses: supportBosses,
    ordinary: ['subup_pa_devotion_aura'],
    identities: ['pa_devotion_g_a', 'pa_devotion_g_b'],
  },
  {
    label: 'Vengeance',
    classId: 'paladin',
    pick: 'pa_vengeance_hunt',
    bosses: ['troll', 'dragon'],
    ordinary: ['pa_radiant', 'subup_pa_vengeance_hunt'],
    identities: ['pa_vengeance_g_a', 'pa_vengeance_g_b'],
  },
  {
    label: 'Hunter',
    classId: 'ranger',
    pick: 'rg_hunter_mark',
    bosses: ['troll', 'dragon', 'lich'],
    ordinary: ['rg_volley'],
    identities: ['rg_hunter_g_a', 'rg_hunter_g_b'],
  },
  {
    label: 'Beast Master',
    classId: 'ranger',
    pick: 'rg_beast_snare',
    bosses: ['troll', 'dragon', 'lich'],
    identities: ['rg_beastmaster_g_a', 'rg_beastmaster_g_b'],
  },
  {
    label: 'Whispers',
    classId: 'bard',
    pick: 'ba_whispers_wound',
    bosses: ['troll', 'lich'],
    identities: ['ba_whispers_g_a', 'ba_whispers_g_b'],
  },
  {
    label: 'Light',
    classId: 'cleric',
    pick: 'cl_light_beam',
    bosses: ['troll', 'lich'],
    identities: ['cl_light_g_a', 'cl_light_g_b'],
  },
  {
    label: 'Life',
    classId: 'cleric',
    pick: 'cl_life_bloom',
    bosses: ['troll', 'lich'],
    identities: ['cl_life_g_a', 'cl_life_g_b'],
  },
  {
    label: 'Moon',
    classId: 'druid',
    pick: 'dr_moon_maul',
    bosses: ['troll', 'dragon'],
    identities: ['dr_moon_g_a', 'dr_moon_g_b'],
  },
  {
    label: 'Land',
    classId: 'druid',
    pick: 'dr_land_spring',
    bosses: ['troll', 'dragon'],
    identities: ['dr_land_g_a', 'dr_land_g_b'],
  },
  {
    label: 'Land',
    classId: 'druid',
    pick: 'dr_land_wall',
    bosses: ['troll', 'dragon'],
    identities: ['dr_land_g_a', 'dr_land_g_b'],
  },
  {
    label: 'Champion',
    classId: 'knight',
    pick: 'kn_champion_rally',
    ordinaryIdentity: 0,
    ordinary: ['kn_bulwark'],
    bosses: ['dragon', 'lich'],
    identities: ['kn_champion_g_a', 'kn_champion_g_b'],
  },
  {
    label: 'Battlemaster',
    classId: 'knight',
    pick: 'kn_battle_precision',
    ordinaryIdentity: 0,
    ordinary: ['kn_concuss'],
    bosses: ['dragon', 'lich'],
    identities: ['kn_battlemaster_g_a', 'kn_battlemaster_g_b'],
  },
  {
    label: 'Battlemaster',
    classId: 'knight',
    pick: 'kn_battle_rally',
    bosses: ['dragon', 'lich'],
    identities: ['kn_battlemaster_g_a', 'kn_battlemaster_g_b'],
  },
  {
    label: 'Berserker',
    classId: 'barbarian',
    pick: 'bb_berserker_frenzy',
    bosses: ['troll', 'dragon'],
    ordinary: ['bb_bloodthirst'],
    identities: ['bb_berserker_g_a', 'bb_berserker_g_b'],
  },
  {
    label: 'Berserker',
    classId: 'barbarian',
    pick: 'bb_berserker_chain',
    bosses: ['dragon', 'lich'],
    identities: ['bb_berserker_g_a', 'bb_berserker_g_b'],
  },
  {
    label: 'Totem',
    classId: 'barbarian',
    pick: 'bb_totem_wolf',
    bosses: ['troll', 'dragon'],
    identities: ['bb_totem_g_a', 'bb_totem_g_b'],
  },
  {
    label: 'Totem',
    classId: 'barbarian',
    pick: 'bb_totem_quake',
    bosses: ['dragon', 'lich'],
    ordinary: ['subup_bb_totem_quake'],
    identities: ['bb_totem_g_a', 'bb_totem_g_b'],
  },
  {
    label: 'Open Hand',
    classId: 'monk',
    pick: 'mo_openhand_wave',
    bosses: ['troll', 'dragon'],
    ordinary: ['subup_mo_openhand_wave'],
    identities: ['mo_openhand_g_a', 'mo_openhand_g_b'],
  },
  {
    label: 'Open Hand',
    classId: 'monk',
    pick: 'mo_openhand_wind',
    bosses: ['dragon', 'lich'],
    identities: ['mo_openhand_g_a', 'mo_openhand_g_b'],
  },
  {
    label: 'Shadow',
    classId: 'monk',
    pick: 'mo_shadow_dart',
    bosses: ['troll', 'dragon'],
    ordinary: ['subup_mo_shadow_dart'],
    identities: ['mo_shadow_g_a', 'mo_shadow_g_b'],
  },
  {
    label: 'Shadow',
    classId: 'monk',
    pick: 'mo_shadow_strike',
    bosses: ['dragon', 'lich'],
    identities: ['mo_shadow_g_a', 'mo_shadow_g_b'],
  },
  {
    label: 'Evoker',
    classId: 'mage',
    pick: 'mg_evoker_lightning',
    bosses: ['troll', 'dragon'],
    ordinary: ['subup_mg_evoker_lightning'],
    identities: ['mg_evoker_g_a', 'mg_evoker_g_b'],
  },
  {
    label: 'Evoker',
    classId: 'mage',
    pick: 'mg_evoker_sculpt',
    bosses: ['dragon', 'lich'],
    identities: ['mg_evoker_g_a', 'mg_evoker_g_b'],
  },
  {
    label: 'Abjurer',
    classId: 'mage',
    pick: 'mg_abjurer_bind',
    bosses: ['dragon', 'beholder'],
    ordinary: ['subup_mg_abjurer_bind'],
    ordinaryIdentity: 0,
    identities: ['mg_abjurer_g_a', 'mg_abjurer_g_b'],
  },
  {
    label: 'Abjurer',
    classId: 'mage',
    pick: 'mg_abjurer_mend',
    bosses: ['beholder', 'lich'],
    identities: ['mg_abjurer_g_a', 'mg_abjurer_g_b'],
  },
  {
    label: 'Draconic Bloodline',
    classId: 'sorcerer',
    pick: 'so_draconic_breath',
    bosses: ['troll', 'dragon'],
    ordinary: ['subup_so_draconic_breath'],
    ordinaryIdentity: 0,
    identities: ['so_draconic_g_a', 'so_draconic_g_b'],
  },
  {
    label: 'Draconic Bloodline',
    classId: 'sorcerer',
    pick: 'so_draconic_wing',
    bosses: ['dragon', 'lich'],
    identities: ['so_draconic_g_a', 'so_draconic_g_b'],
  },
  {
    label: 'Wild Magic',
    classId: 'sorcerer',
    pick: 'so_wild_surge',
    bosses: ['troll', 'lich'],
    ordinary: ['subup_so_wild_surge'],
    ordinaryIdentity: 1,
    identities: ['so_wild_g_a', 'so_wild_g_b'],
  },
  {
    label: 'Wild Magic',
    classId: 'sorcerer',
    pick: 'so_wild_tides',
    bosses: ['dragon', 'beholder'],
    identities: ['so_wild_g_a', 'so_wild_g_b'],
  },
  {
    label: 'Assassin',
    classId: 'rogue',
    pick: 'ro_assassin_strike',
    bosses: ['troll', 'dragon'],
    ordinary: ['subup_ro_assassin_strike'],
    ordinaryIdentity: 0,
    identities: ['ro_assassin_g_a', 'ro_assassin_g_b'],
  },
  {
    label: 'Assassin',
    classId: 'rogue',
    pick: 'ro_assassin_poison',
    bosses: ['dragon', 'lich'],
    identities: ['ro_assassin_g_a', 'ro_assassin_g_b'],
  },
  {
    label: 'Arcane Trickster',
    classId: 'rogue',
    pick: 'ro_trickster_bolt',
    bosses: ['dragon', 'beholder'],
    ordinary: ['subup_ro_trickster_bolt'],
    ordinaryIdentity: 0,
    identities: ['ro_trickster_g_a', 'ro_trickster_g_b'],
  },
  {
    label: 'Arcane Trickster',
    classId: 'rogue',
    pick: 'ro_trickster_snare',
    bosses: ['troll', 'lich'],
    identities: ['ro_trickster_g_a', 'ro_trickster_g_b'],
  },
  {
    label: 'Fiend',
    classId: 'warlock',
    pick: 'wa_fiend_hurl',
    bosses: ['dragon', 'beholder'],
    ordinary: ['wa_hex'],
    ordinaryIdentity: 0,
    identities: ['wa_fiend_g_a', 'wa_fiend_g_b'],
  },
  {
    label: 'Fiend',
    classId: 'warlock',
    pick: 'wa_fiend_rebuke',
    bosses: ['troll', 'lich'],
    identities: ['wa_fiend_g_a', 'wa_fiend_g_b'],
  },
  {
    label: 'Great Old One',
    classId: 'warlock',
    pick: 'wa_goo_blast',
    bosses: ['dragon', 'lich'],
    ordinary: ['subup_wa_goo_blast'],
    ordinaryIdentity: 1,
    identities: ['wa_great_old_one_g_a', 'wa_great_old_one_g_b'],
  },
  {
    label: 'Great Old One',
    classId: 'warlock',
    pick: 'wa_goo_tentacle',
    bosses: ['troll', 'beholder'],
    identities: ['wa_great_old_one_g_a', 'wa_great_old_one_g_b'],
  },
];

const thirdSlots = [
  { name: 'Hunter damage', classId: 'ranger', skills: ['rg_hunter_mark'] },
  {
    name: 'Whispers utility',
    classId: 'bard',
    skills: ['ba_whispers_wound'],
    identity: 'ba_whispers_g_b',
  },
  { name: 'Light offense', classId: 'cleric', skills: ['cl_light_beam'], identity: 'cl_light_g_a' },
  {
    name: 'Life protection',
    classId: 'cleric',
    skills: ['cl_life_preserve'],
    identity: 'cl_life_g_b',
  },
  {
    name: 'Life triage',
    classId: 'cleric',
    skills: ['cl_life_bloom', 'cl_life_mend'],
    identity: 'cl_life_g_a',
    triage: true,
  },
  {
    name: 'Life same kit, conservative',
    classId: 'cleric',
    skills: ['cl_life_bloom', 'cl_life_mend'],
    identity: 'cl_life_g_a',
  },
  { name: 'Druid recovery', classId: 'druid', skills: ['dr_land_spring'], triage: true },
];

const rosterMode = process.argv.includes('--roster-power');
const rangerMode = process.argv.includes('--ranger-spacing');
const lichMode = process.argv.includes('--lich-attribution');
const roleTuning = process.argv.includes('--role-tuning');
const choiceMode = roleTuning || process.argv.includes('--reward-choice');
assert.ok(
  [rosterMode, rangerMode, lichMode, choiceMode].filter(Boolean).length <= 1,
  'Choose one supplemental comparison',
);
const rosterProfiles = [
  ['support', 'ba_valor_bolster', 1, 'ba_anthem'],
  ['support', 'pa_devotion_aura', 1, 'pa_mercy'],
  ['support', 'cl_life_bloom', 0, 'subup_cl_life_bloom'],
  ['support', 'dr_land_spring', 1, 'subup_dr_land_spring'],
  ['frontline', 'kn_champion_rally', 0, 'kn_bulwark'],
  ['frontline', 'bb_berserker_frenzy', 1, 'bb_bloodthirst'],
  ['frontline', 'mo_openhand_wave', 1, 'subup_mo_openhand_wave'],
  ['frontline', 'ro_assassin_strike', 0, 'subup_ro_assassin_strike'],
  ['ranged', 'rg_hunter_mark', 0, 'rg_volley'],
  ['ranged', 'mg_evoker_lightning', 1, 'subup_mg_evoker_lightning'],
  ['ranged', 'so_wild_surge', 1, 'subup_so_wild_surge'],
  ['ranged', 'wa_fiend_hurl', 0, 'wa_hex'],
];
const choiceProfiles = [
  ['kn_champion_rally', 'kn_bulwark', 'hy_fieldmedic', ['dragon', 'lich']],
  ['dr_land_wall', 'dr_grasp', 'hy_inspire', ['troll', 'lich']],
  ['rg_hunter_mark', 'rg_volley', 'rg_barbed', ['dragon', 'lich']],
  ['wa_fiend_hurl', 'wa_hex', 'wa_rebuke', ['dragon', 'lich']],
];
const classFilter = process.argv.find((arg) => arg.startsWith('--class='))?.slice(8);
const selectedBuilds = classFilter
  ? builds.filter((build) => build.classId === classFilter)
  : builds;
if (!selectedBuilds.length) throw new Error(`No encounter profiles for ${classFilter}`);

const server = await createServer({
  logLevel: 'silent',
  server: { middlewareMode: true, hmr: false },
});
try {
  const { World } = await server.ssrLoadModule('/src/engine/world/world.ts');
  const { SIM_DT: dt, REVIVE_RANGE } = await server.ssrLoadModule('/src/engine/core/constants.ts');
  const { normalize } = await server.ssrLoadModule('/src/engine/core/math.ts');
  const { grandEarnable } = await server.ssrLoadModule('/src/engine/content/grandSelections.ts');
  const { sub, dist } = await server.ssrLoadModule('/src/engine/core/torus.ts');
  const { zoneReachesAir, isFlying } = await server.ssrLoadModule('/src/engine/combat/combat.ts');
  const { vengeancePursuit } = await server.ssrLoadModule('/src/engine/combat/abilities.ts');
  const { fieldTransplantViews } = await server.ssrLoadModule(
    '/src/engine/combat/fieldTransplant.ts',
  );
  const { boundedAbility } = await server.ssrLoadModule('/src/engine/content/abilityLimits.ts');
  const { inMoonForm } = await server.ssrLoadModule('/src/engine/combat/moonForm.ts');
  const { ancestralRelayView } = await server.ssrLoadModule('/src/engine/combat/ancestralRelay.ts');
  const { FLOW_AREA, flowConeEffects } = await server.ssrLoadModule(
    '/src/engine/content/martialRules.ts',
  );
  const { getCharUpgrade, rollCharChoices } = await server.ssrLoadModule(
    '/src/engine/content/charUpgrades.ts',
  );
  const { RUN_LENGTH, MAX_PLAYERS } = await server.ssrLoadModule('/src/engine/core/constants.ts');
  const { Rng, mixSeed } = await server.ssrLoadModule('/src/engine/core/math.ts');
  const { CLASS_IDS } = await server.ssrLoadModule('/src/engine/content/classes.ts');
  const { rollUpgradeChoices } = await server.ssrLoadModule('/src/engine/content/upgrades.ts');

  function rewardOffers(build, seed, cycle, stop, generic, history) {
    const rewardSeed = mixSeed(seed, cycle, stop, 0x2ec0);
    const rng = new Rng(mixSeed(rewardSeed, CLASS_IDS.indexOf(build.classId) + 1));
    const random = () => rng.next();
    const [stat] = rollUpgradeChoices(3, random, generic);
    const boons = rollCharChoices(build.classId, 4, random, history, [], [build.pick]);
    return { stat, boons };
  }

  function firstContestedOffer(build, seed, native, alternative) {
    const generic = [];
    const history = [];
    for (let stop = 0; stop < RUN_LENGTH - 1; stop++) {
      const { stat, boons } = rewardOffers(build, seed, 0, stop, generic, history);
      if (stat) generic.push(stat);
      if (boons.includes(native) && boons.includes(alternative)) {
        return { seed, stop: stop + 1, generic, history, boons };
      }
      const priorPick =
        boons.find((id) => id === native) ??
        boons.find((id) => id !== alternative && !getCharUpgrade(id)?.replaces);
      if (priorPick) history.push(priorPick);
    }
  }

  function drawRosterRewards(build, seed, target, stops) {
    const generic = [];
    const history = [];
    for (let stop = 0; stop < stops; stop++) {
      const { stat, boons: offers } = rewardOffers(build, seed, 2, stop, generic, history);
      if (stat) generic.push(stat);
      const boon =
        offers.find((id) => id === target) ?? offers.find((id) => !getCharUpgrade(id)?.replaces);
      if (boon) history.push(boon);
    }
    return { stops, generic, history, target };
  }

  const { blinkArrival, carriesDispel, wardingTarget } = await server.ssrLoadModule(
    '/src/engine/combat/warding.ts',
  );
  const { isBurstControl } = await server.ssrLoadModule('/src/engine/core/control.ts');

  const { GUIDED_BURST_RANGE } = await server.ssrLoadModule('/src/engine/content/guidanceRules.ts');
  const { originView } = await server.ssrLoadModule('/src/engine/combat/guidance.ts');

  const { shadowRepriseView } = await server.ssrLoadModule('/src/engine/combat/shadowReprise.ts');

  const { findInfernalClaimTarget } = await server.ssrLoadModule('/src/engine/combat/abilities.ts');

  const { castTimeFactor } = await server.ssrLoadModule('/src/engine/combat/combat.ts');
  const { forethoughtView } = await server.ssrLoadModule('/src/engine/combat/forethought.ts');

  function command(
    world,
    player,
    seekRally,
    holdLane,
    triage,
    withdraw,
    useForecast,
    rangerPolicy,
    clearAdds,
    retreatDrain,
    rebukePass,
  ) {
    const boss = world.boss;
    const aim = normalize(sub(boss.pos, player.pos));
    const distance = dist(boss.pos, player.pos);
    const tangent = { x: -aim.y, y: aim.x };
    const ranged = player.classId === 'bard';
    const mage = player.classId === 'mage';
    const warlock = player.classId === 'warlock';
    const rogue = player.classId === 'rogue';
    const sorcerer = player.classId === 'sorcerer';
    const whisperReach = (player.abilities.a3.radius ?? 150) + boss.radius;
    const subSkill = player.subAbilities?.sub1;
    const meleeValor = ranged && subSkill?.kind === 'meleeCone';
    const archer = player.classId === 'ranger';
    const barbarian = player.classId === 'barbarian';
    const monk = player.classId === 'monk';
    const flow = monk && player.buffs.some((b) => b.kind === 'flow');
    const flowWind = monk && subSkill?.kind === 'dash' && subSkill.prepareFlow;
    function monkReach(ab) {
      const resolved = !flow
        ? ab
        : ab.kind === 'meleeCone'
          ? { ...ab, ...flowConeEffects(ab) }
          : { ...ab, radius: (ab.radius ?? 130) + FLOW_AREA };
      const bounded = boundedAbility(resolved, world.arena);
      return (
        (bounded.kind === 'pbaoe' ? (bounded.radius ?? 130) : (bounded.range ?? 70)) + boss.radius
      );
    }
    const momentum = player.buffs.find((b) => b.kind === 'momentum')?.mult ?? 0;
    const rhythm = player.buffs.some((b) => b.kind === 'rageRhythm');
    const earth =
      barbarian && subSkill?.kind === 'groundZone' ? boundedAbility(subSkill, world.arena) : null;
    const relay = barbarian ? ancestralRelayView(world, player) : null;
    const burstOrigin = relay?.remote ? relay.origin : player.pos;
    const burstReach = (player.abilities.a3.radius ?? 135) + boss.radius + momentum * 10;
    const knightLead =
      player.classId === 'knight' && (player.peerId === 'lead' || player.peerId === 'tank');
    const cleric = player.classId === 'cleric';
    const druid = player.classId === 'druid';
    const moon = player.subclassPassiveId === 'moon_aspect';
    const entangle = druid ? boundedAbility(player.abilities.a1, world.arena) : null;
    const wall =
      druid && subSkill?.zoneKind === 'entangle' ? boundedAbility(subSkill, world.arena) : null;
    const fieldAligned = (ab) =>
      Math.abs((ab.range ?? 500) - distance) <= Math.max(45, (ab.radius ?? 125) - 45);
    const healer = cleric || druid;
    const whispers =
      player.subclassPassiveId === 'whispers_echoed_refrain' ||
      player.subSkillIds?.includes('ba_whispers_wound');
    const mageField =
      mage && subSkill?.kind === 'groundZone' && boundedAbility(subSkill, world.arena);
    const mageBurst = mage && subSkill?.kind === 'pbaoe' && boundedAbility(subSkill, world.arena);
    const novaReach = mage
      ? boundedAbility(player.abilities.a2, world.arena).radius + boss.radius
      : 0;
    const phaseOrigin = sorcerer && originView(world, player);
    const sorcery = sorcerer && boundedAbility(subSkill, world.arena);
    const rangedBurst = sorcery?.guidedBurst;
    const sorcererReach = sorcery?.range ?? sorcery?.radius ?? 0;
    const closeSorcery = sorcery && !rangedBurst && ['meleeCone', 'pbaoe'].includes(sorcery.kind);
    const rogueField =
      rogue && subSkill?.kind === 'groundZone' && boundedAbility(subSkill, world.arena);
    const rogueBlink = rogue && boundedAbility(player.abilities.a2, world.arena);
    const rogueMelee = rogue
      ? boundedAbility(player.abilities.basic, world.arena).range + boss.radius
      : 0;
    const hex = warlock && boundedAbility(player.abilities.a1, world.arena);
    const rebuke = warlock && boundedAbility(player.abilities.a2, world.arena);
    const warlockSkill = warlock && boundedAbility(subSkill, world.arena);
    const portal = warlock && player.infernalAperture;
    const warlockSpacing =
      warlock &&
      (player.cooldowns.a1 < 1
        ? hex.range - hex.radius * 0.35
        : warlockSkill.kind === 'pbaoe' && !warlockSkill.infernalClaim
          ? warlockSkill.radius + boss.radius - 25
          : rebukePass && player.cooldowns.a2 < 1
            ? rebuke.radius + boss.radius - 30
            : 325);
    const rangerSnare =
      rangerPolicy?.alignFields &&
      subSkill.kind === 'groundZone' &&
      !world.bossFlying(boss) &&
      boundedAbility(subSkill, world.arena);
    const rangerRain =
      rangerPolicy?.alignFields && boundedAbility(player.abilities.a2, world.arena);
    const rainReaches =
      rangerRain &&
      (!world.bossFlying(boss) ||
        zoneReachesAir({
          kind: rangerRain.zoneKind ?? 'rainOfArrows',
          airborne: rangerRain.airborne,
        }));
    const rangerField =
      rangerSnare && player.cooldowns.sub1 < 1
        ? rangerSnare
        : rainReaches && player.cooldowns.a2 < 1
          ? rangerRain
          : null;
    const rangerSpacing = rangerField
      ? rangerField.range - rangerField.radius * 0.35
      : rangerPolicy?.spacing;
    const spacing =
      rangerSpacing ??
      (warlock
        ? warlockSpacing
        : rogue
          ? rogueField && player.cooldowns.sub1 < 1 && !world.bossFlying(boss)
            ? rogueField.range - rogueField.radius * 0.35
            : rogueMelee - 20
          : sorcerer
            ? closeSorcery
              ? sorcererReach - 25
              : 285
            : mage
              ? mageField && player.cooldowns.sub1 < 1
                ? mageField.range - mageField.radius * 0.35
                : mageBurst || player.cooldowns.a2 < 1
                  ? novaReach - 25
                  : 260
              : moon
                ? boss.radius + player.radius + 25
                : archer
                  ? player.spiritCompanion
                    ? 120
                    : 230
                  : healer
                    ? 235
                    : ranged && !meleeValor
                      ? whisperReach - 25
                      : boss.radius + player.radius + 8);
    let move = distance > spacing + 20 ? aim : holdLane ? { x: 0, y: 0 } : tangent;
    if (distance < spacing - 15) move = { x: -aim.x, y: -aim.y };
    // Use the same movement policy for either identity. The optional rally and
    // active hazards change what routes are available in the live encounter.
    const rally = world.groundZones.find(
      (z) => z.rally && z.remaining > 0 && !z.rally.visitors.includes(player.id),
    );
    if (seekRally && rally) move = normalize(sub(rally.pos, player.pos));
    const danger = world.groundZones.find(
      (z) =>
        z.side === 'boss' &&
        (z.armRemaining ?? 0) <= 0 &&
        (z.damagePerTick > 0 || (z.silence ?? 0) > 0) &&
        (!isFlying(player) || zoneReachesAir(z)) &&
        dist(z.pos, player.pos) < z.radius + player.radius + 15,
    );
    if (
      druid &&
      !moon &&
      player.peerId === 'lead' &&
      !danger &&
      entangle.kind === 'groundZone' &&
      player.cooldowns.a1 < 1 &&
      !fieldAligned(entangle)
    )
      move = distance < (entangle.range ?? 400) ? { x: -aim.x, y: -aim.y } : aim;
    if (earth && rhythm && player.cooldowns.sub1 < 0.5 && momentum > 0 && !fieldAligned(earth))
      move = distance < (earth.range ?? 380) ? { x: -aim.x, y: -aim.y } : aim;
    if (danger) move = normalize(sub(player.pos, danger.pos));
    const gapCloser = monk && distance > 200 && distance < 340 && !flow && !danger;
    if (gapCloser) move = aim;
    // For a frontline Knight, cross the attack lane before shielding; aim still
    // faces the threat. This also gives fresh utility presses a real step vector.
    if (knightLead && boss.action.kind === 'windup' && boss.action.remaining < 0.65 && !danger)
      move = tangent;
    const fallen = world.players.find((ally) => ally.state === 'downed');
    if (fallen && !danger)
      move =
        dist(fallen.pos, player.pos) <= REVIVE_RANGE + fallen.radius + player.radius
          ? { x: 0, y: 0 }
          : normalize(sub(fallen.pos, player.pos));
    const needsHeal = world.players.some(
      (ally) =>
        ally.state === 'alive' &&
        dist(player.pos, ally.pos) <= (player.abilities.a2.range ?? 420) &&
        (ally.hp < ally.maxHp * 0.83 || ally.faithWound),
    );
    const hurt = world.players
      .filter((ally) => ally.state === 'alive' && ally.hp < ally.maxHp * (triage ? 0.88 : 0.7))
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
    const healInRange = (ab) =>
      hurt.some((ally) => dist(player.pos, ally.pos) <= (ab.range ?? 400));
    const fields = cleric
      ? [
          ['a2', player.abilities.a2],
          ['sub1', subSkill],
        ]
      : [['sub1', subSkill]];
    const field = fields.find(
      ([, ab]) =>
        ab?.zoneTickHeal &&
        (player.cooldowns[ab.slot] ?? 0) <= dt + 1e-6 &&
        (hurt.length || (fallen && ab.revivalFont)),
    );
    const fieldTarget = fallen && field?.[1].revivalFont ? fallen : hurt[0];
    if (
      healer &&
      field &&
      fieldTarget !== player &&
      fieldTarget &&
      !danger &&
      dist(fieldTarget.pos, player.pos) > (field[1].radius ?? 140) - 12
    )
      move = normalize(sub(fieldTarget.pos, player.pos));
    const fieldCast =
      field && fieldTarget && dist(fieldTarget.pos, player.pos) <= (field[1].radius ?? 140);
    const transplant =
      druid &&
      !moon &&
      !danger &&
      !fallen &&
      fieldTransplantViews(world, { ...player, aim }).find((view) => {
        const zone = world.groundZones.find((z) => z.id === view.zoneId);
        const target = zone.damagePerTick > 0 ? boss : hurt[0];
        return (
          !view.blocked &&
          view.remaining >= 0.6 &&
          target &&
          dist(target.pos, view.from) > zone.radius + target.radius &&
          dist(target.pos, view.to) < zone.radius + target.radius
        );
      });
    const verse = (kind) => player.buffs.some((b) => b.kind === kind);
    const incoming =
      (boss.action.kind === 'windup' && boss.action.remaining < 0.6) ||
      boss.action.kind === 'channel' ||
      danger != null;
    // Prioritize key class actions before basic autofire. All requests still
    // pass through input, cast, cooldown, contact and targeting gates in World.
    const ready = (slot) => (player.cooldowns[slot] ?? 0) <= dt + 1e-6;
    const choices =
      player.classId === 'bard'
        ? [
            [
              'sub1',
              meleeValor
                ? distance <= (subSkill.range ?? 70) + boss.radius
                : whispers
                  ? Boolean(player.whisperSecret) || !verse('discord')
                  : verse('harmony') && verse('discord'),
            ],
            ['a1', verse('harmony') && verse('discord')],
            [
              'a2',
              needsHeal || (player.abilities.a2.rhapsody && verse('discord') && !verse('harmony')),
            ],
            ['a3', distance <= whisperReach],
          ]
        : player.classId === 'paladin'
          ? [
              ['a2', needsHeal],
              ['a3', incoming],
              [
                'sub1',
                subSkill?.paladinAura?.kind === 'pursuit'
                  ? distance <= (player.abilities.basic.range ?? 70) + boss.radius + 25 && !incoming
                  : incoming && player.paladinAura?.kind !== 'bulwark',
              ],
              ['a1', distance < 210],
            ]
          : cleric
            ? [
                [field?.[0], Boolean(fieldCast && fallen && field[1].revivalFont)],
                [
                  'sub2',
                  player.subAbilities?.sub2?.kind === 'heal' &&
                    healInRange(player.subAbilities.sub2),
                ],
                ['a1', healInRange(player.abilities.a1)],
                [field?.[0], Boolean(fieldCast)],
                ['sub1', Boolean(subSkill?.absorption && incoming)],
                ['a3', distance < 320],
                ['sub1', subSkill?.kind === 'projectile' && distance < 395],
              ]
            : druid
              ? [
                  ['a2', healInRange(player.abilities.a2)],
                  [field?.[0], Boolean(fieldCast)],
                  [
                    'a1',
                    entangle.kind === 'buffAlly' ||
                      (entangle.kind === 'groundZone' && fieldAligned(entangle)),
                  ],
                  [
                    'sub1',
                    Boolean(wall && fieldAligned(wall)) ||
                      (moon &&
                        subSkill?.kind === 'meleeCone' &&
                        distance < (subSkill.range ?? 80) + boss.radius),
                  ],
                  ['a3', distance < (player.abilities.a3.radius ?? 155) + boss.radius],
                ]
              : archer
                ? [
                    ['a3', Boolean(danger)],
                    [
                      'a2',
                      rangerPolicy?.alignFields
                        ? Boolean(rainReaches && fieldAligned(rangerRain))
                        : distance < (player.abilities.a2.range ?? 500),
                    ],
                    [
                      'sub1',
                      rangerPolicy?.alignFields && subSkill.kind === 'groundZone'
                        ? Boolean(rangerSnare && fieldAligned(rangerSnare))
                        : distance < (subSkill.range ?? 400),
                    ],
                    ['a1', distance < 400],
                  ]
                : barbarian
                  ? [
                      ['a2', Boolean(danger)],
                      ['sub1', !rhythm && Boolean(subSkill.momentumWindow || subSkill.wolfHunt)],
                      ['a1', !rhythm && distance < 310],
                      ['sub1', Boolean(earth && fieldAligned(earth) && (momentum > 0 || !rhythm))],
                      [
                        'sub1',
                        Boolean(
                          subSkill.pull &&
                          distance < (subSkill.range ?? 220) + boss.radius &&
                          (momentum >= 2 || distance > 155 || !rhythm),
                        ),
                      ],
                      [
                        'a3',
                        dist(burstOrigin, boss.pos) <= burstReach && (momentum >= 2 || !rhythm),
                      ],
                    ]
                  : monk
                    ? [
                        [
                          'sub1',
                          Boolean(
                            flowWind &&
                            !flow &&
                            (danger || gapCloser || player.hp < player.maxHp * 0.7),
                          ),
                        ],
                        [
                          'a2',
                          Boolean(
                            danger || gapCloser || (!flow && player.hp < player.maxHp * 0.72),
                          ),
                        ],
                        [
                          'sub1',
                          subSkill.kind === 'projectile'
                            ? distance < 400 && (flow || distance > 150)
                            : subSkill.kind === 'meleeCone' && distance <= monkReach(subSkill),
                        ],
                        ['a3', distance <= monkReach(player.abilities.a3)],
                        ['a1', distance <= monkReach(player.abilities.a1)],
                      ]
                    : knightLead
                      ? [
                          [
                            'a2',
                            player.abilities.a2.kind === 'heal'
                              ? needsHeal
                              : incoming ||
                                world.projectiles.some(
                                  (shot) =>
                                    shot.side === 'boss' && dist(shot.pos, player.pos) < 145,
                                ),
                          ],
                          ['a1', incoming && distance < 190],
                          [
                            'sub1',
                            subSkill.kind === 'heal'
                              ? needsHeal
                              : subSkill.healOnUse
                                ? player.hp < player.maxHp * 0.68
                                : distance < 220,
                          ],
                          ['a3', distance <= (player.abilities.a3.range ?? 60) + boss.radius],
                        ]
                      : [
                          ['a2', incoming],
                          ['a1', distance < spacing + 25],
                        ];
    const blink = mage && boundedAbility(player.abilities.a3, world.arena);
    const silenced = mage && player.buffs.some((b) => b.kind === 'silence');
    const blinkAim = danger ? move : tangent;
    const warding = blink && carriesDispel(blink) && ready('a3');
    const reclaim =
      warding &&
      wardingTarget(
        world,
        player,
        player.pos,
        blinkArrival(world, { ...player, aim: blinkAim }, blink),
      );
    const controlled = mage && boss.buffs.some(isBurstControl);
    const evocation = mage && player.buffs.some((b) => b.kind === 'evocation');
    const mageChoices = mage && [
      ['a3', Boolean(warding && (silenced || reclaim)) || (!silenced && Boolean(danger))],
      ['sub1', subSkill.kind === 'heal' && healInRange(subSkill)],
      ['a2', distance <= novaReach && !controlled && !evocation],
      ['sub1', mageField && fieldAligned(mageField)],
      [
        'a1',
        distance < 400 &&
          (controlled || evocation || player.cooldowns.a2 > 1 || distance > novaReach),
      ],
      [
        'sub1',
        mageBurst
          ? distance <= mageBurst.radius + boss.radius
          : subSkill.kind === 'projectile' && distance < 400,
      ],
      ['a2', distance <= novaReach],
    ];
    const surge = sorcerer && player.buffs.some((b) => b.kind === 'spellSurge');
    const guided = sorcerer && player.guidance;
    const liveBurst = guided?.burst;
    const detonate =
      liveBurst &&
      !liveBurst.requested &&
      dist(liveBurst.pos, boss.pos) <= (liveBurst.payload.radius ?? 150) + boss.radius - 25;
    const sorcererChoices = sorcerer && [
      [
        'a3',
        Boolean(danger) ||
          (!phaseOrigin &&
            !guided &&
            !surge &&
            ready('a1') &&
            Boolean(player.abilities.a3.guideRelay)),
      ],
      ['sub1', Boolean(sorcery.grantsFlight && (danger || !isFlying(player)))],
      ['a2', !surge && !guided],
      ['a1', !liveBurst && dist(phaseOrigin?.pos ?? player.pos, boss.pos) < 420],
      [
        'sub1',
        !guided &&
          (sorcery.kind === 'projectile'
            ? distance < 350
            : rangedBurst
              ? dist(phaseOrigin?.pos ?? player.pos, boss.pos) <
                GUIDED_BURST_RANGE + (sorcery.radius ?? 150)
              : closeSorcery && distance < sorcererReach + boss.radius),
      ],
    ];
    const reprise = rogue && shadowRepriseView(world, player);
    const returnNow =
      withdraw &&
      reprise?.armed &&
      !reprise.blocked &&
      (incoming || player.hp < player.maxHp * 0.55) &&
      !world.groundZones.some(
        (zone) =>
          zone.side === 'boss' &&
          (zone.armRemaining ?? 0) <= 0 &&
          (zone.damagePerTick > 0 || zone.silence > 0) &&
          dist(zone.pos, reprise.anchor) <= zone.radius + player.radius,
      );
    const rogueAim = danger ? normalize(sub(player.pos, danger.pos)) : aim;
    const stepIntoReach =
      rogueBlink &&
      distance > rogueMelee &&
      dist(blinkArrival(world, { ...player, aim }, rogueBlink), boss.pos) <= rogueMelee - 10;
    const precision = rogue && player.buffs.some((buff) => buff.kind === 'precision');
    const rogueChoices = rogue && [
      ['a2', !reprise && (Boolean(danger) || (stepIntoReach && !precision))],
      ['sub1', Boolean(rogueField && !world.bossFlying(boss) && fieldAligned(rogueField))],
      ['sub1', Boolean(subSkill.venomCoating && distance <= rogueMelee + 25)],
      ['a3', !world.bossFlying(boss) && fieldAligned(player.abilities.a3)],
      ['sub1', subSkill.kind === 'meleeCone' && distance <= subSkill.range + boss.radius],
      ['a1', distance <= player.abilities.a1.range + boss.radius],
      ['sub1', subSkill.kind === 'projectile' && distance < 375],
    ];
    const portalAim =
      portal && portal.conduitReady !== false && normalize(sub(portal.entry, player.pos));
    const portalOpportunity =
      portalAim &&
      dist(player.pos, portal.entry) > player.radius + 8 &&
      dist(player.pos, portal.entry) < 135 &&
      portalAim.x * portal.direction.x + portalAim.y * portal.direction.y > 0.6;
    const exitAim = portalOpportunity && normalize(sub(boss.pos, portal.exit));
    const usePortal =
      exitAim && exitAim.x * portal.direction.x + exitAim.y * portal.direction.y > 0.94;
    const warlockSurge = warlock && player.buffs.some((b) => b.kind === 'spellSurge');
    const canBreak =
      warlockSurge &&
      !boss.buffs.some((b) => b.kind === 'thoughtBreakRecovery') &&
      (boss.action.kind === 'windup' || boss.action.kind === 'channel');
    const breakTime =
      canBreak &&
      boss.action.remaining * (boss.action.kind === 'windup' ? castTimeFactor(boss) : 1);
    const inRebuke = warlock && distance <= rebuke.radius + boss.radius;
    const warlockChoices = warlock && [
      [
        'a3',
        !portal &&
          (player.abilities.a3.infernalAperture
            ? distance > 320 && distance < 550
            : player.abilities.a3.prepareSurge
              ? !warlockSurge
              : true),
      ],
      ['a1', fieldAligned(hex)],
      [
        'sub1',
        warlockSkill.kind === 'projectile' &&
          distance < 490 &&
          (!warlockSkill.consumesSurge ||
            !warlockSurge ||
            breakTime > distance / (warlockSkill.projSpeed ?? 660) + dt),
      ],
      [
        'sub1',
        warlockSkill.infernalClaim
          ? Boolean(findInfernalClaimTarget(world, { ...player, aim }, warlockSkill))
          : warlockSkill.kind === 'pbaoe' &&
            distance <= warlockSkill.radius + boss.radius &&
            (!warlockSkill.consumesSurge || !warlockSurge || canBreak),
      ],
      ['a2', inRebuke && (!rebuke.consumesSurge || !warlockSurge || canBreak)],
    ];
    const preview = warlock && useForecast && forethoughtView(world, boss)?.preview;
    const forecastShape = preview?.mode === 'fixed' && preview.shape;
    const avoidForecast =
      !danger &&
      !fallen &&
      forecastShape?.kind === 'circle' &&
      dist(player.pos, forecastShape.target) < forecastShape.radius + player.radius + 15;
    if (avoidForecast) {
      const away = sub(player.pos, forecastShape.target);
      move = Math.hypot(away.x, away.y) > 1 ? normalize(away) : tangent;
    }
    const pursuit = player.prevButtons.basic && vengeancePursuit(world, { ...player, aim });
    const nextOnGlide =
      monk &&
      flow &&
      player.glide &&
      !player.flowQueue &&
      (player.glide.palmSweep || player.glide.ab.prepareFlow) &&
      ['sub1', 'a3', 'a1'].find((slot) => {
        const ab = slot === 'sub1' ? subSkill : player.abilities[slot];
        return ab?.palmSweep && (player.cooldowns[slot] ?? 0) < 0.4 && !player.prevButtons[slot];
      });
    const slot =
      (portal?.emberReady && usePortal && portal.slot) ||
      (returnNow && reprise.slot) ||
      (detonate && guided.slot) ||
      nextOnGlide ||
      (transplant
        ? transplant.slot
        : ((warlockChoices || rogueChoices || sorcererChoices || mageChoices || choices).find(
            ([key, wanted]) => wanted && ready(key),
          )?.[0] ?? 'basic'));
    const releaseForTransplant = Boolean(transplant && player.prevButtons[slot]);
    const releaseForPursuit = slot === 'basic' && pursuit && !pursuit.blocked;
    const releaseForFreshPress =
      (sorcerer || rogue || warlock) && slot !== 'basic' && player.prevButtons[slot];
    const steerBurst = liveBurst && !guided.origin && ['basic', guided.slot].includes(slot);
    const revive = Boolean(fallen) && !danger && !(fieldCast && field[1].revivalFont);
    const approachFont = Boolean(fallen && field && field[1].revivalFont && !fieldCast);
    const retreatingDrain =
      retreatDrain &&
      player.state === 'alive' &&
      !danger &&
      !fallen &&
      boss.action.abilityId === 'lifeDrain' &&
      boss.action.targetId === player.id &&
      ['windup', 'channel'].includes(boss.action.kind);
    if (retreatingDrain) move = { x: -aim.x, y: -aim.y };
    const addTarget =
      clearAdds &&
      ['basic', 'a1', 'sub1'].includes(slot) &&
      world.adds.find((add) => add.hp > 0 && !add.charm && dist(player.pos, add.pos) <= 225);
    return {
      ...(warlock && { avoidForecast }),
      ...(retreatingDrain && { retreatingDrain }),
      seq: world.tick,
      aim: addTarget
        ? normalize(sub(addTarget.pos, player.pos))
        : usePortal &&
            (slot === 'basic' ||
              (slot === 'a3' && portal.emberReady) ||
              (slot === 'sub1' && warlockSkill.kind === 'projectile'))
          ? portalAim
          : rogue && slot === 'a2'
            ? rogueAim
            : (mage || sorcerer) && slot === 'a3'
              ? blinkAim
              : steerBurst
                ? normalize(sub(boss.pos, liveBurst.pos))
                : aim,
      aimPoint: addTarget ? addTarget.pos : boss.pos,
      move:
        (warding && slot === 'a3') ||
        returnNow ||
        (usePortal && !danger && !fallen && !avoidForecast)
          ? { x: 0, y: 0 }
          : move,
      autofire: true,
      buttons: {
        basic: false,
        a1: false,
        a2: false,
        a3: false,
        revive,
        [slot]:
          !revive &&
          !releaseForPursuit &&
          !releaseForTransplant &&
          !releaseForFreshPress &&
          !approachFont,
      },
    };
  }

  function fight(
    build,
    identity,
    monsterId,
    seed,
    partySize,
    seekRally,
    ordinary,
    ranks,
    holdLane,
    third,
    withdraw = true,
    useForecast = true,
    { rewards, rangerPolicy, clearAdds = false, retreatDrain = false, extraParty = [] } = {},
  ) {
    const history = rewards?.history ?? Array(ranks).fill(ordinary);
    const context = { classes: [build.classId], history, subSkills: [build.pick] };
    if (!build.identities.every((id) => grandEarnable(id, build.classId, context)))
      throw new Error(`Ineligible comparison for ${build.label}`);
    const world = new World({
      monsterId,
      seed,
      players: [
        {
          peerId: 'lead',
          name: build.label,
          classId: build.classId,
          subSkills: [build.pick],
          charUpgrades: history,
          upgrades: rewards?.generic,
          grandLoadout: {
            version: 1,
            classes: {
              [build.classId]: { bank: build.identities, equipped: identity ? [identity] : [] },
            },
          },
        },
        ...(partySize >= 2
          ? [
              rewards
                ? {
                    peerId: 'ally',
                    name: 'Life triage',
                    classId: 'cleric',
                    subSkills: ['cl_life_bloom', 'cl_life_mend'],
                    charUpgrades: ['cl_life_g_a'],
                  }
                : build.classId === 'knight'
                  ? {
                      peerId: 'ally',
                      name: 'Ranger',
                      classId: 'ranger',
                      subSkills: ['rg_hunter_mark'],
                    }
                  : { peerId: 'ally', name: 'Knight', classId: 'knight' },
            ]
          : []),
        ...(third
          ? [
              {
                peerId: 'third',
                name: third.name,
                classId: third.classId,
                subSkills: third.skills,
                charUpgrades: third.identity ? [third.identity] : [],
              },
            ]
          : []),
        ...extraParty,
      ],
    });
    assert.equal(world.players.length, partySize);
    const lead = world.players[0];
    const equipped = build.identities.filter((id) => lead.charUpgradeIds?.includes(id));
    if (equipped.length !== Number(Boolean(identity)) || (identity && equipped[0] !== identity))
      throw new Error(`Unexpected active identity for ${build.label}: ${equipped}`);
    if (third?.identity && !world.players[2].charUpgradeIds.includes(third.identity))
      throw new Error(`Third slot identity did not equip: ${third.identity}`);
    const bossStartHp = world.boss.maxHp;
    const start = JSON.stringify({
      boss: [world.boss.pos, bossStartHp, world.scaling.bossDamageMult],
      party: world.players.map((p) => p.pos),
      obstacles: world.obstacles,
      terrain: world.terrain,
    });
    const attribution = lichMode && {
      beamContacts: 0,
      drainHpRemoved: 0,
      drainHpRestored: 0,
      players: world.players.map(() => ({
        bossDamage: 0,
        addDamage: 0,
        downedSeconds: 0,
        deadSeconds: 0,
        retreatSeconds: 0,
      })),
    };
    if (attribution) {
      const playerMetrics = new Map(world.players.map((p, i) => [p.id, attribution.players[i]]));
      world.combatObserver = {
        damage(source, target, effective) {
          const metric = playerMetrics.get(source.id);
          if (!metric) return;
          if (target === world.boss) metric.bossDamage += effective;
          else metric.addDamage += effective;
        },
        beamDrain(boss, target, removed, restored) {
          if (boss !== world.boss || !playerMetrics.has(target.id)) return;
          if (removed > 0) attribution.beamContacts++;
          attribution.drainHpRemoved += removed;
          attribution.drainHpRestored += restored;
        },
      };
    }
    const effects = world.players.map(() => ({
      damageTaken: 0,
      downed: 0,
      rallyPickups: 0,
      faithWounds: 0,
      faithDeferred: 0,
      faithPaid: 0,
      faithExpired: 0,
      faithPending: 0,
      faithDiscarded: 0,
      pursuitStarts: 0,
      pursuitSwings: 0,
      packHunts: 0,
      returningTurns: 0,
      returningHits: 0,
      fearSeconds: 0,
      quarrySeconds: 0,
      healingReceived: 0,
      moonSeconds: 0,
      transplants: 0,
      projectedGuardChargesSpent: 0,
      projectedShotInterceptions: 0,
      challengeConnections: 0,
      defensiveSteps: 0,
      steeredBosses: 0,
      steeredDuringAction: 0,
      walkMomentumGains: 0,
      momentumSpent: 0,
      remoteRelays: 0,
      flowSpent: 0,
      palmSweeps: 0,
      queuedFlow: 0,
      shadowCommits: 0,
      steeredAdds: 0,
      casts: {},
    }));
    const wounds = world.players.map(() => []);
    const deferPlayerDamage = world.deferPlayerDamage.bind(world);
    // Observe the real wound at creation before a same-tick heal can repay it.
    world.deferPlayerDamage = (target, damage) => {
      const before = target.faithWound;
      const immediate = deferPlayerDamage(target, damage);
      const wound = target.faithWound;
      if (wound && wound !== before)
        wounds[world.players.indexOf(target)].push({ wound, initial: wound.amount });
      return immediate;
    };
    if (build.classId === 'knight') {
      const resolveManeuver = world.onManeuverHit.bind(world);
      world.onManeuverHit = (source, target, effective, cast) => {
        const alreadySteered = cast.steeredTargets?.has(target.id);
        const inAction = ['windup', 'channel'].includes(target.action?.kind);
        resolveManeuver(source, target, effective, cast);
        if (!alreadySteered && cast.steeredTargets?.has(target.id)) {
          const metric = effects[world.players.indexOf(source)];
          if ('monsterId' in target) metric.steeredBosses++;
          else metric.steeredAdds++;
          if (inAction) metric.steeredDuringAction++;
        }
      };
    }
    const recordedPickups = new Set();
    let bossStunSeconds = 0;
    let bossCasts = 0;
    let reflections = 0;
    let quarryCasts = 0;
    let fontStarts = 0;
    let refugeSeconds = 0;
    let addDeaths = 0;
    const mageEffects =
      build.classId === 'mage'
        ? {
            fieldDispels: 0,
            silenceBreaks: 0,
            cadenceTriggers: 0,
            cadenceSpends: 0,
            bindingWardTriggers: 0,
            bindContactSeconds: 0,
            suppressedWindups: 0,
          }
        : null;
    const sorcererEffects =
      build.classId === 'sorcerer'
        ? {
            surgeSpends: 0,
            ascents: 0,
            weaveTriggers: 0,
            flightSeconds: 0,
            groundHazardOverflightSeconds: 0,
            departureOrigins: 0,
            remoteCasts: 0,
            guidedProjectiles: 0,
            guidedBursts: 0,
            manualBursts: 0,
          }
        : null;
    const rogueEffects =
      build.classId === 'rogue'
        ? {
            repriseAnchors: 0,
            repriseArmed: 0,
            repriseReturns: 0,
            spellbladeSpends: 0,
            poisonApplications: 0,
            snareContactSeconds: 0,
          }
        : null;
    const warlockEffects =
      build.classId === 'warlock'
        ? {
            apertures: 0,
            bulwarks: 0,
            embers: 0,
            transits: 0,
            firstReveals: 0,
            secondReveals: 0,
            thoughtBreaks: 0,
            forecastResponseSeconds: 0,
          }
        : null;
    let snareContactSeconds = 0;
    let rainContactSeconds = 0;
    for (let tick = 0; tick < duration / dt && !world.finished; tick++) {
      const priorAction = world.boss.action;
      const warlockLead = warlockEffects && world.players[0];
      const oldPortal = warlockLead && warlockLead.infernalAperture;
      const oldEmber = oldPortal?.emberReady;
      const priorTransits =
        warlockLead &&
        new Set(
          world.projectiles.filter(
            (shot) => shot.ownerId === warlockLead.id && shot.apertureTransit,
          ),
        );
      const hadBreak =
        warlockLead && world.boss.buffs.some((buff) => buff.kind === 'thoughtBreakRecovery');
      const rogueLead = rogueEffects && world.players[0];
      const oldReprise = rogueLead && rogueLead.shadowReprise;
      const repriseWasArmed = oldReprise?.armedTick !== undefined;
      const hadSpellblade =
        rogueLead &&
        rogueLead.buffs.some((buff) => buff.kind === 'spellblade' && buff.remaining > dt);
      const oldCoatings =
        rogueLead &&
        [world.boss, ...world.adds].flatMap((enemy) =>
          enemy.buffs.filter((buff) => buff.venom?.ownerId === rogueLead.id && !buff.venom.field),
        );
      const caster = sorcererEffects && world.players[0];
      const priorSurge =
        caster && caster.buffs.find((buff) => buff.kind === 'spellSurge' && buff.remaining > dt);
      const priorGuidance = caster && caster.guidance;
      const priorBurst = priorGuidance?.burst;
      const requestedBurst = priorBurst?.requested;
      const priorAscent = caster && caster.subclassPassiveCooldowns?.draconic_surge_ascent;
      const priorWeave = caster && caster.subclassPassiveCooldowns?.wild_spell_weave;

      const priorEvocation =
        mageEffects &&
        world.players[0].buffs.find((buff) => buff.kind === 'evocation' && buff.remaining > dt);
      const priorBinding =
        mageEffects && world.players[0].subclassPassiveCooldowns?.abjurer_binding_ward;
      const prior = world.players.map((p) => ({
        pursuitReadyAt: p.vengeancePursuitReadyAt,
        pursuing: Boolean(p.glide?.vengeancePursuit),
        hunt: p.spiritCompanion?.hunt,
        stepping: p.glide?.ab.name === 'Maneuver step',
        flow: p.classId === 'monk' && p.buffs.find((b) => b.kind === 'flow' && b.remaining > dt),
        sweep: p.glide?.palmSweep,
        queued: p.flowQueue,
        shadowCasts: p.shadowCommits?.slice(),
        momentum: p.buffs.find((b) => b.kind === 'momentum'),
        relay: p.castAbility?.ancestralCast,
        walkingRage: p.buffs.some((b) => b.kind === 'wolfHunt'),
        challenge: p.buffs.find((buff) => buff.kind === 'challengeReady' && buff.remaining > dt),
        projection: p.buffs.filter((buff) => buff.projectedGuard).map((buff) => [buff, buff.mult]),
        transplantOptions: Object.values(p.fieldTransplants ?? {}).filter((cast) => !cast.used),
      }));
      const priorRallies = world.groundZones.filter((z) => z.rally);
      const priorShots = new Map(
        world.projectiles
          .filter((shot) => shot.returningShot)
          .map((shot) => [
            shot,
            { phase: shot.returningShot.phase, hits: shot.returningShot.hitsLeft },
          ]),
      );
      const inputs = new Map(
        world.players.map((p) => [
          p.peerId,
          command(
            world,
            p,
            seekRally,
            holdLane && p.peerId === 'lead',
            (p.peerId === 'third' && third?.triage) || Boolean(rewards && p.peerId === 'ally'),
            withdraw,
            useForecast,
            p.peerId === 'lead' ? rangerPolicy : undefined,
            clearAdds && p.peerId === 'third',
            retreatDrain,
            Boolean(rewards?.rebukePass && p.peerId === 'lead'),
          ),
        ]),
      );
      if (rangerPolicy) {
        const flying = world.bossFlying(world.boss);
        for (const zone of world.groundZones) {
          if (
            zone.ownerId !== lead.id ||
            (zone.armRemaining ?? 0) > 0 ||
            (flying && !zoneReachesAir(zone)) ||
            dist(zone.pos, world.boss.pos) > zone.radius + world.boss.radius
          )
            continue;
          if (zone.kind === 'entangle') snareContactSeconds += dt;
          if (zone.kind === 'rainOfArrows') rainContactSeconds += dt;
        }
      }
      if (warlockEffects && inputs.get('lead').avoidForecast) {
        warlockEffects.forecastResponseSeconds += dt;
      }
      world.step(dt, inputs);
      if (attribution) {
        world.players.forEach((p, i) => {
          if (p.state === 'downed') attribution.players[i].downedSeconds += dt;
          if (p.state === 'dead') attribution.players[i].deadSeconds += dt;
          if (inputs.get(p.peerId).retreatingDrain) attribution.players[i].retreatSeconds += dt;
        });
      }
      // Retain expired field references for the last tick on which players could collect them.
      if (world.boss.buffs.some((b) => b.kind === 'stun')) bossStunSeconds += dt;
      bossCasts += world.events.filter(
        (event) => event.t === 'cast' && event.side === 'boss',
      ).length;
      reflections += world.events.filter((event) => event.t === 'reflection').length;
      fontStarts += world.events.filter((event) => event.t === 'fontRescue').length;
      if (world.boss.action !== priorAction && world.boss.action.illusionPos) quarryCasts++;
      if (world.groundZones.some((z) => z.refuge)) refugeSeconds += dt;
      addDeaths += world.events.filter(
        (event) => event.t === 'death' && event.kind === 'add',
      ).length;
      if (sorcererEffects) {
        sorcererEffects.departureOrigins += world.events.filter(
          (e) => e.t === 'phaseOrigin',
        ).length;
        if ((caster.subclassPassiveCooldowns?.draconic_surge_ascent ?? 0) > (priorAscent ?? 0))
          sorcererEffects.ascents++;
        if ((caster.subclassPassiveCooldowns?.wild_spell_weave ?? 0) > (priorWeave ?? 0))
          sorcererEffects.weaveTriggers++;
        if (
          priorSurge &&
          caster.state === 'alive' &&
          !caster.buffs.some((buff) => buff.kind === 'spellSurge')
        )
          sorcererEffects.surgeSpends++;
        if (priorBurst?.requested && !requestedBurst) sorcererEffects.manualBursts++;
        if (caster.guidance && caster.guidance !== priorGuidance) {
          if (caster.guidance.origin) sorcererEffects.remoteCasts++;
          if (caster.guidance.burst) sorcererEffects.guidedBursts++;
          else sorcererEffects.guidedProjectiles++;
        }
        if (isFlying(caster)) {
          sorcererEffects.flightSeconds += dt;
          if (
            world.terrain.some(
              (patch) =>
                (patch.damagePerTick > 0 || patch.slowMult < 1) &&
                dist(patch.pos, caster.pos) <= patch.radius + caster.radius,
            ) ||
            world.groundZones.some(
              (z) =>
                z.side === 'boss' &&
                (z.damagePerTick > 0 || z.slowMult < 1 || (z.silence ?? 0) > 0) &&
                (z.armRemaining ?? 0) <= 0 &&
                !zoneReachesAir(z) &&
                dist(z.pos, caster.pos) <= z.radius + caster.radius,
            )
          )
            sorcererEffects.groundHazardOverflightSeconds += dt;
        }
      }
      if (warlockEffects) {
        const portal = warlockLead.infernalAperture;
        if (portal && portal !== oldPortal) {
          warlockEffects.apertures++;
          if (portal.bulwark) warlockEffects.bulwarks++;
        }
        if (oldEmber && portal === oldPortal && !portal.emberReady) warlockEffects.embers++;
        for (const shot of world.projectiles) {
          if (shot.ownerId === warlockLead.id && shot.apertureTransit && !priorTransits?.has(shot))
            warlockEffects.transits++;
        }
        if (world.boss.action !== priorAction) {
          const reveal = world.boss.action.forethoughtRead;
          if (reveal?.index === 1) warlockEffects.firstReveals++;
          if (reveal?.index === 2) warlockEffects.secondReveals++;
        }
        if (!hadBreak && world.boss.buffs.some((buff) => buff.kind === 'thoughtBreakRecovery'))
          warlockEffects.thoughtBreaks++;
      }
      if (rogueEffects) {
        const reprise = rogueLead.shadowReprise;
        if (reprise && reprise !== oldReprise) rogueEffects.repriseAnchors++;
        if (reprise?.armedTick !== undefined && !repriseWasArmed) rogueEffects.repriseArmed++;
        if (
          repriseWasArmed &&
          !reprise &&
          world.events.some(
            (event) =>
              event.t === 'blink' &&
              event.id === rogueLead.id &&
              dist(event.to, oldReprise.anchor) < 1e-6,
          )
        )
          rogueEffects.repriseReturns++;
        if (
          hadSpellblade &&
          rogueLead.state === 'alive' &&
          !rogueLead.buffs.some((buff) => buff.kind === 'spellblade')
        )
          rogueEffects.spellbladeSpends++;
        for (const enemy of [world.boss, ...world.adds]) {
          rogueEffects.poisonApplications += enemy.buffs.filter(
            (buff) =>
              buff.venom?.ownerId === rogueLead.id &&
              !buff.venom.field &&
              !oldCoatings.includes(buff),
          ).length;
        }
        if (
          !world.bossFlying(world.boss) &&
          world.groundZones.some(
            (zone) =>
              zone.ownerId === rogueLead.id &&
              zone.roots &&
              (zone.armRemaining ?? 0) <= 0 &&
              dist(zone.pos, world.boss.pos) <= zone.radius + world.boss.radius,
          )
        )
          rogueEffects.snareContactSeconds += dt;
      }
      if (mageEffects) {
        const lead = world.players[0];
        if (priorEvocation && lead.state === 'alive' && !lead.buffs.includes(priorEvocation))
          mageEffects.cadenceSpends++;
        if ((lead.subclassPassiveCooldowns?.abjurer_binding_ward ?? 0) > (priorBinding ?? 0))
          mageEffects.bindingWardTriggers++;
        if (
          world.boss.action !== priorAction &&
          world.boss.action.kind === 'windup' &&
          world.boss.buffs.some((buff) => buff.kind === 'castSlow')
        )
          mageEffects.suppressedWindups++;
        mageEffects.fieldDispels += world.events.filter((e) => e.t === 'fieldDispel').length;
        mageEffects.silenceBreaks += world.events.filter((e) => e.t === 'silenceBreak').length;
        for (const event of world.events) {
          if (event.t !== 'support' || event.sourceId !== lead.id || event.targetId !== lead.id)
            continue;
          if (event.kind === 'empower') mageEffects.cadenceTriggers++;
        }
        if (
          world.groundZones.some(
            (z) =>
              z.ownerId === lead.id &&
              z.roots &&
              (z.armRemaining ?? 0) <= 0 &&
              dist(z.pos, world.boss.pos) <= z.radius + world.boss.radius &&
              (!world.bossFlying(world.boss) || zoneReachesAir(z)),
          )
        )
          mageEffects.bindContactSeconds += dt;
      }
      for (const enemy of [...world.bosses, ...world.adds]) {
        if (!enemy.perception) continue;
        const metric = effects[world.players.findIndex((p) => p.id === enemy.perception.ownerId)];
        if (enemy.perception.mode === 'lure') metric.quarrySeconds += dt;
        else if (enemy.perception.active) metric.fearSeconds += dt;
      }
      const currentShots = world.projectiles.filter((shot) => shot.returningShot);
      for (const shot of new Set([...priorShots.keys(), ...currentShots])) {
        const returning = shot.returningShot;
        if (returning.phase !== 'back') continue;
        const metric = effects[world.players.findIndex((p) => p.id === shot.ownerId)];
        const previous = priorShots.get(shot);
        if (previous?.phase !== 'back') metric.returningTurns++;
        metric.returningHits +=
          (previous?.phase === 'back' ? previous.hits : returning.hitsPerLeg) - returning.hitsLeft;
      }
      const rallies = new Set([...priorRallies, ...world.groundZones.filter((z) => z.rally)]);
      world.players.forEach((p, i) => {
        const now = effects[i];
        if (p.classId === 'monk') {
          const old = prior[i];
          if (old.flow && !p.buffs.some((b) => b.kind === 'flow') && p.state === 'alive')
            now.flowSpent++;
          if (p.glide?.palmSweep && p.glide.palmSweep !== old.sweep) now.palmSweeps++;
          if (p.flowQueue && p.flowQueue !== old.queued) now.queuedFlow++;
          now.shadowCommits += (p.shadowCommits ?? []).filter(
            (cast) => !old.shadowCasts?.includes(cast),
          ).length;
        }
        if (p.classId === 'barbarian') {
          const old = prior[i];
          const current = p.buffs.find((b) => b.kind === 'momentum');
          if (old.walkingRage && (current?.mult ?? 0) > (old.momentum?.mult ?? 0))
            now.walkMomentumGains++;
          if (old.relay?.remote && old.relay.spent) now.remoteRelays++;
          if (old.momentum && !p.buffs.includes(old.momentum) && p.state === 'alive') {
            const spent =
              p.castAbility?.momentumUsed ||
              world.events.some(
                (event) =>
                  event.t === 'cast' &&
                  event.sourceId === p.id &&
                  (event.slot === 'a3' ||
                    (event.slot === 'sub1' && p.subAbilities?.sub1?.spendsMomentum)),
              );
            if (spent) now.momentumSpent += old.momentum.mult;
          }
        }
        if (prior[i].challenge && !p.buffs.includes(prior[i].challenge) && p.state === 'alive')
          now.challengeConnections++;
        if (!prior[i].stepping && p.glide?.ab.name === 'Maneuver step') now.defensiveSteps++;
        for (const [buff, charges] of prior[i].projection)
          now.projectedGuardChargesSpent += Math.max(0, charges - buff.mult);
        if (inMoonForm(p)) now.moonSeconds += dt;
        now.transplants += prior[i].transplantOptions.filter((cast) => cast.used).length;
        if (p.spiritCompanion?.hunt && p.spiritCompanion.hunt !== prior[i].hunt) now.packHunts++;
        for (const z of rallies) {
          const key = `${z.id}:${p.id}`;
          if (z.rally.visitors.includes(p.id) && !recordedPickups.has(key)) {
            recordedPickups.add(key);
            now.rallyPickups++;
          }
        }
        const pursuitStarted = p.vengeancePursuitReadyAt !== prior[i].pursuitReadyAt;
        if (pursuitStarted) now.pursuitStarts++;
        const pursuitEnded = (pursuitStarted || prior[i].pursuing) && !p.glide?.vengeancePursuit;
        for (const event of world.events) {
          if (
            event.t === 'support' &&
            event.kind === 'protect' &&
            event.sourceId === p.id &&
            event.targetId === p.id &&
            dist(event.from, event.pos) > 1 &&
            p.charUpgradeIds?.includes('kn_champion_g_a')
          )
            now.projectedShotInterceptions++;
          if (event.t === 'hit' && event.targetId === p.id) now.damageTaken += event.amount;
          if (event.t === 'downed' && event.id === p.id) now.downed++;
          if (event.t === 'heal' && event.targetId === p.id) now.healingReceived += event.amount;
          if (
            event.t === 'cast' &&
            event.sourceId === p.id &&
            event.slot &&
            !event.ability.endsWith(' (cast)')
          ) {
            now.casts[event.slot] = (now.casts[event.slot] ?? 0) + 1;
            if (pursuitEnded && event.slot === 'basic') now.pursuitSwings++;
          }
        }
      });
    }
    const round = (n) => Math.round(n * 100) / 100;
    if (attribution) {
      world.players.forEach((p, i) => {
        const { bossDamage, addDamage } = attribution.players[i];
        assert.ok(Math.abs(bossDamage + addDamage - p.stats.damageDealt) < 1e-6);
      });
      const bossDamage = attribution.players.reduce((sum, p) => sum + p.bossDamage, 0);
      assert.ok(
        Math.abs(
          bossStartHp + attribution.drainHpRestored - Math.max(world.boss.hp, 0) - bossDamage,
        ) < 1e-6,
        'Unattributed Lich HP change',
      );
    }
    for (const [i, entries] of wounds.entries()) {
      const metric = effects[i];
      metric.faithWounds = entries.length;
      for (const { wound, initial } of entries) {
        metric.faithDeferred += initial;
        metric.faithPaid += initial - wound.amount;
        if (world.players[i].faithWound === wound) metric.faithPending += wound.amount;
        else if (wound.remaining <= 1e-6) metric.faithExpired += wound.amount;
        else metric.faithDiscarded += wound.amount;
      }
      const totaled =
        metric.faithPaid + metric.faithPending + metric.faithExpired + metric.faithDiscarded;
      assert.ok(
        Math.abs(metric.faithDeferred - totaled) < 1e-6,
        'Unbalanced deferred damage accounting',
      );
      for (const key of [
        'faithDeferred',
        'faithPaid',
        'faithExpired',
        'faithPending',
        'faithDiscarded',
      ])
        metric[key] = round(metric[key]);
    }
    return {
      start,
      build: build.label,
      firstPick: build.pick,
      ordinary,
      ranks,
      seekRally,
      holdLane,
      identity: identity ?? null,
      name: identity ? getCharUpgrade(identity).name : 'No identity',
      monsterId,
      seed,
      partySize,
      thirdSlot: third?.name ?? null,
      reflections,
      quarryCasts,
      fontStarts,
      refugeSeconds: round(refugeSeconds),
      addDeaths,
      ...(sorcererEffects && {
        sorcererEffects: {
          ...sorcererEffects,
          flightSeconds: round(sorcererEffects.flightSeconds),
          groundHazardOverflightSeconds: round(sorcererEffects.groundHazardOverflightSeconds),
        },
      }),
      ...(warlockEffects && {
        warlockEffects: {
          ...warlockEffects,
          useForecast,
          forecastResponseSeconds: round(warlockEffects.forecastResponseSeconds),
        },
      }),
      ...(rogueEffects && {
        rogueEffects: {
          ...rogueEffects,
          withdraw,
          snareContactSeconds: round(rogueEffects.snareContactSeconds),
        },
      }),
      ...(mageEffects && {
        mageEffects: { ...mageEffects, bindContactSeconds: round(mageEffects.bindContactSeconds) },
      }),
      ...(rewards && { rewards }),
      ...(attribution && {
        clearAdds,
        retreatDrain,
        attribution: {
          beamContacts: attribution.beamContacts,
          drainHpRemoved: round(attribution.drainHpRemoved),
          drainHpRestored: round(attribution.drainHpRestored),
          players: attribution.players.map((p) =>
            Object.fromEntries(Object.entries(p).map(([key, value]) => [key, round(value)])),
          ),
        },
      }),
      ...(rangerPolicy && {
        rangerPolicy,
        snareContactSeconds: round(snareContactSeconds),
        rainContactSeconds: round(rainContactSeconds),
      }),
      outcome: world.outcome ?? 'timeout',
      seconds: round(world.elapsed),
      bossStartHp: round(bossStartHp),
      bossStunSeconds: round(bossStunSeconds),
      bossCasts,
      bossRemainingPct: round((100 * world.boss.hp) / bossStartHp),
      players: world.players.map((p, i) => ({
        ...effects[i],
        damageTaken: round(effects[i].damageTaken),
        fearSeconds: round(effects[i].fearSeconds),
        quarrySeconds: round(effects[i].quarrySeconds),
        healingReceived: round(effects[i].healingReceived),
        moonSeconds: round(effects[i].moonSeconds),
        damageDealt: round(p.stats.damageDealt),
        healingDone: round(p.stats.healingDone),
        revives: p.stats.revives,
        state: p.state,
      })),
    };
  }

  const fights = [];
  const offerWindows = [];
  if (choiceMode) {
    const scanSize = 512;
    for (const [pick, native, alternative, bosses] of choiceProfiles) {
      const build = selectedBuilds.find((candidate) => candidate.pick === pick);
      if (!build) continue;
      if (roleTuning && !['kn_champion_rally', 'dr_land_wall'].includes(pick)) continue;
      const contests = [];
      for (let seed = 1; seed <= scanSize; seed++) {
        const offer = firstContestedOffer(build, seed, native, alternative);
        if (offer) contests.push(offer);
      }
      assert.ok(contests.length >= seeds.length, `Too few shared offers for ${pick}`);
      offerWindows.push({ pick, native, alternative, scanSize, contests: contests.length });
      for (const [index, seed] of seeds.entries()) {
        const offer = contests[index];
        for (const boss of bosses) {
          for (let partySize = 1; partySize <= (roleTuning ? MAX_PLAYERS : 2); partySize++) {
            const extraParty = [
              {
                peerId: 'damage',
                name: 'Hunter',
                classId: 'ranger',
                subSkills: ['rg_hunter_mark'],
              },
              pick === 'kn_champion_rally'
                ? {
                    peerId: 'burst',
                    name: 'Evoker',
                    classId: 'mage',
                    subSkills: ['mg_evoker_lightning'],
                  }
                : {
                    peerId: 'tank',
                    name: 'Knight',
                    classId: 'knight',
                    subSkills: ['kn_champion_rally'],
                  },
            ].slice(0, Math.max(0, partySize - 2));
            const matched = [];
            for (const rebukePass of pick === 'wa_fiend_hurl' ? [false, true] : [false]) {
              for (const identity of build.identities) {
                for (const claim of [native, alternative]) {
                  const rewards = {
                    ...offer,
                    claim,
                    rebukePass,
                    history: [...offer.history, claim],
                  };
                  matched.push(
                    fight(
                      build,
                      identity,
                      boss,
                      seed,
                      partySize,
                      true,
                      null,
                      0,
                      false,
                      undefined,
                      true,
                      true,
                      { rewards, extraParty },
                    ),
                  );
                }
              }
            }
            for (const { start, ...result } of matched) {
              assert.equal(start, matched[0].start, 'Mismatched reward-choice encounter');
              fights.push(result);
            }
          }
        }
      }
    }
  } else if (rosterMode || lichMode) {
    const startingEncounters = new Map();
    for (const [role, pick, index, target] of rosterProfiles) {
      const build = selectedBuilds.find((candidate) => candidate.pick === pick);
      if (!build) continue;
      assert.ok(getCharUpgrade(target), target);
      for (const monsterId of lichMode ? ['lich'] : ['troll', 'dragon', 'lich']) {
        for (const seed of seeds) {
          for (const partySize of [1, 2]) {
            for (const stops of [0, RUN_LENGTH - 1]) {
              const rewards = drawRosterRewards(build, seed, target, stops);
              const retestDrain =
                lichMode &&
                stops === RUN_LENGTH - 1 &&
                [
                  'cl_life_bloom',
                  'kn_champion_rally',
                  'bb_berserker_frenzy',
                  'wa_fiend_hurl',
                ].includes(pick);
              for (const retreatDrain of retestDrain ? [false, true] : [false]) {
                const { start, ...result } = fight(
                  build,
                  build.identities[index],
                  monsterId,
                  seed,
                  partySize,
                  true,
                  null,
                  0,
                  false,
                  undefined,
                  true,
                  true,
                  { rewards, retreatDrain },
                );
                const key = `${monsterId}/${seed}/${partySize}`;
                if (!startingEncounters.has(key)) startingEncounters.set(key, start);
                assert.equal(
                  start,
                  startingEncounters.get(key),
                  `Mismatched roster encounter ${key}`,
                );
                fights.push({ ...result, role });
              }
            }
          }
        }
      }
    }
  } else if (rangerMode) {
    for (const build of selectedBuilds.filter(({ pick }) =>
      ['rg_hunter_mark', 'rg_beast_snare'].includes(pick),
    )) {
      const policies = [120, 230].flatMap((spacing) =>
        [false, true].map((alignFields) => ({ spacing, alignFields })),
      );
      for (const monsterId of ['troll', 'dragon', 'lich']) {
        for (const seed of seeds) {
          for (const partySize of [1, 2]) {
            const matched = policies.map((rangerPolicy) =>
              fight(
                build,
                build.identities[1],
                monsterId,
                seed,
                partySize,
                true,
                null,
                0,
                false,
                undefined,
                true,
                true,
                { rangerPolicy },
              ),
            );
            for (const { start, ...result } of matched) {
              assert.equal(start, matched[0].start, 'Mismatched Ranger encounter');
              fights.push(result);
            }
          }
        }
      }
    }
  } else {
    for (const build of selectedBuilds) {
      for (const boss of build.bosses) {
        for (const seed of seeds) {
          for (const party of [1, 2]) {
            const run = (
              identity,
              seekRally = true,
              ordinary = null,
              ranks = 0,
              holdLane = false,
            ) => fight(build, identity, boss, seed, party, seekRally, ordinary, ranks, holdLane);
            const matched = [null, ...build.identities].map((id) => run(id));
            if (build.pick.startsWith('ba_valor_')) matched.push(run(build.identities[1], false));
            if (build.pick === 'kn_champion_rally')
              matched.push(run(build.identities[0], true, 'hy_fieldmedic', 1));
            if (build.pick === 'dr_land_wall')
              matched.push(
                ...['dr_grasp', 'hy_inspire'].map((id) => run(build.identities[1], true, id, 1)),
              );
            if (build.pick === 'ro_assassin_strike')
              matched.push(
                fight(
                  build,
                  build.identities[0],
                  boss,
                  seed,
                  party,
                  true,
                  null,
                  0,
                  false,
                  undefined,
                  false,
                ),
              );
            if (build.pick === 'wa_goo_blast')
              matched.push(
                fight(
                  build,
                  build.identities[0],
                  boss,
                  seed,
                  party,
                  true,
                  null,
                  0,
                  false,
                  undefined,
                  true,
                  false,
                ),
              );
            if (build.pick === 'rg_hunter_mark')
              matched.push(
                ...[null, ...build.identities].map((id) => run(id, true, null, 0, true)),
              );
            // Ordinary comparisons use the same identity at ranks 0, 1 and 3.
            for (const upgrade of build.ordinary ?? []) {
              const ranksToTry = upgrade === 'pa_radiant' ? [1, 3, 5] : [1, 3];
              for (const ranks of ranksToTry)
                matched.push(
                  run(build.identities[build.ordinaryIdentity ?? 1], true, upgrade, ranks),
                );
            }
            for (const { start, ...result } of matched) {
              assert.equal(
                start,
                matched[0].start,
                'Matched variants must begin in the same encounter',
              );
              fights.push(result);
            }
          }
        }
      }
    }
  }
  if (!rosterMode && !rangerMode && !choiceMode) {
    for (const [pick, boss, routes, identityIndex = 1] of [
      ['rg_hunter_mark', 'lich'],
      ['rg_beast_snare', 'lich'],
      ['pa_devotion_aura', 'beholder'],
      ['bb_berserker_chain', 'lich', ['Hunter damage', 'Whispers utility', 'Life protection']],
      ['bb_totem_quake', 'lich', ['Hunter damage', 'Whispers utility', 'Life protection']],
      ['mo_openhand_wind', 'lich', ['Hunter damage', 'Whispers utility', 'Life protection']],
      ['mo_shadow_strike', 'lich', ['Hunter damage', 'Whispers utility', 'Life protection']],
      ['mg_evoker_sculpt', 'lich', ['Hunter damage', 'Whispers utility', 'Life protection']],
      ['mg_abjurer_bind', 'beholder', ['Hunter damage', 'Whispers utility', 'Life protection'], 0],
      ['so_draconic_wing', 'lich', ['Hunter damage', 'Whispers utility', 'Life protection'], 0],
      ['so_wild_surge', 'lich', ['Hunter damage', 'Whispers utility', 'Life protection']],
      ['ro_assassin_poison', 'lich', ['Hunter damage', 'Whispers utility', 'Life protection']],
      ['ro_trickster_snare', 'lich', ['Hunter damage', 'Whispers utility', 'Life protection']],
      ['wa_fiend_rebuke', 'lich', ['Hunter damage', 'Whispers utility', 'Life protection'], 0],
      ['wa_goo_blast', 'lich', ['Hunter damage', 'Whispers utility', 'Life protection']],
    ]) {
      const build = selectedBuilds.find((candidate) => candidate.pick === pick);
      if (!build || (lichMode && boss !== 'lich')) continue;
      for (const seed of seeds) {
        const matched = thirdSlots
          .filter((third) => !routes || routes.includes(third.name))
          .filter(
            (third) =>
              !lichMode ||
              ['Hunter damage', 'Whispers utility', 'Life protection'].includes(third.name),
          )
          .map((third) =>
            fight(
              build,
              build.identities[identityIndex],
              boss,
              seed,
              3,
              true,
              null,
              0,
              false,
              third,
            ),
          );
        if (lichMode)
          matched.push(
            fight(
              build,
              build.identities[identityIndex],
              boss,
              seed,
              3,
              true,
              null,
              0,
              false,
              thirdSlots.find((third) => third.name === 'Hunter damage'),
              true,
              true,
              { clearAdds: true },
            ),
          );
        for (const { start, ...result } of matched) {
          assert.equal(
            start,
            matched[0].start,
            'Matched trios must start with the same arena and scaling',
          );
          fights.push(result);
        }
      }
    }
  }
  console.log(
    JSON.stringify({ hz: 1 / dt, duration, ...(choiceMode && { offerWindows }), fights }, null, 2),
  );
} finally {
  await server.close();
}
