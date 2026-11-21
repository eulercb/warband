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
  const { getCharUpgrade } = await server.ssrLoadModule('/src/engine/content/charUpgrades.ts');

  function command(world, player, seekRally, holdLane, triage) {
    const boss = world.boss;
    const aim = normalize(sub(boss.pos, player.pos));
    const distance = dist(boss.pos, player.pos);
    const tangent = { x: -aim.y, y: aim.x };
    const ranged = player.classId === 'bard';
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
    const knightLead = player.classId === 'knight' && player.peerId === 'lead';
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
    const spacing = moon
      ? boss.radius + player.radius + 25
      : archer
        ? player.spiritCompanion
          ? 120
          : 230
        : healer
          ? 235
          : ranged && !meleeValor
            ? whisperReach - 25
            : boss.radius + player.radius + 8;
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
                    ['a2', distance < (player.abilities.a2.range ?? 500)],
                    ['sub1', distance < (subSkill.range ?? 400)],
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
      nextOnGlide ||
      (transplant
        ? transplant.slot
        : (choices.find(([key, wanted]) => wanted && ready(key))?.[0] ?? 'basic'));
    const releaseForTransplant = Boolean(transplant && player.prevButtons[slot]);
    const releaseForPursuit = slot === 'basic' && pursuit && !pursuit.blocked;
    const revive = Boolean(fallen) && !danger && !(fieldCast && field[1].revivalFont);
    const approachFont = Boolean(fallen && field && field[1].revivalFont && !fieldCast);
    return {
      seq: world.tick,
      aim,
      aimPoint: boss.pos,
      move,
      autofire: true,
      buttons: {
        basic: false,
        a1: false,
        a2: false,
        a3: false,
        revive,
        [slot]: !revive && !releaseForPursuit && !releaseForTransplant && !approachFont,
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
  ) {
    const history = Array(ranks).fill(ordinary);
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
          grandLoadout: {
            version: 1,
            classes: {
              [build.classId]: { bank: build.identities, equipped: identity ? [identity] : [] },
            },
          },
        },
        ...(partySize >= 2
          ? [
              build.classId === 'knight'
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
      ],
    });
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
    for (let tick = 0; tick < duration / dt && !world.finished; tick++) {
      const priorAction = world.boss.action;
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
      world.step(
        dt,
        new Map(
          world.players.map((p) => [
            p.peerId,
            command(
              world,
              p,
              seekRally,
              holdLane && p.peerId === 'lead',
              p.peerId === 'third' && third?.triage,
            ),
          ]),
        ),
      );
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
  for (const build of selectedBuilds) {
    for (const boss of build.bosses) {
      for (const seed of seeds) {
        for (const party of [1, 2]) {
          const run = (identity, seekRally = true, ordinary = null, ranks = 0, holdLane = false) =>
            fight(build, identity, boss, seed, party, seekRally, ordinary, ranks, holdLane);
          const matched = [null, ...build.identities].map((id) => run(id));
          if (build.pick.startsWith('ba_valor_')) matched.push(run(build.identities[1], false));
          if (build.pick === 'kn_champion_rally')
            matched.push(run(build.identities[0], true, 'hy_fieldmedic', 1));
          if (build.pick === 'dr_land_wall')
            matched.push(
              ...['dr_grasp', 'hy_inspire'].map((id) => run(build.identities[1], true, id, 1)),
            );
          if (build.pick === 'rg_hunter_mark')
            matched.push(...[null, ...build.identities].map((id) => run(id, true, null, 0, true)));
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
  for (const [pick, boss, routes] of [
    ['rg_hunter_mark', 'lich'],
    ['rg_beast_snare', 'lich'],
    ['pa_devotion_aura', 'beholder'],
    ['bb_berserker_chain', 'lich', ['Hunter damage', 'Whispers utility', 'Life protection']],
    ['bb_totem_quake', 'lich', ['Hunter damage', 'Whispers utility', 'Life protection']],
    ['mo_openhand_wind', 'lich', ['Hunter damage', 'Whispers utility', 'Life protection']],
    ['mo_shadow_strike', 'lich', ['Hunter damage', 'Whispers utility', 'Life protection']],
  ]) {
    const build = selectedBuilds.find((candidate) => candidate.pick === pick);
    if (!build) continue;
    for (const seed of seeds) {
      const matched = thirdSlots
        .filter((third) => !routes || routes.includes(third.name))
        .map((third) =>
          fight(build, build.identities[1], boss, seed, 3, true, null, 0, false, third),
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
  console.log(JSON.stringify({ hz: 1 / dt, duration, fights }, null, 2));
} finally {
  await server.close();
}
