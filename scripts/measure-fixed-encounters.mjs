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
];

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
  const { getCharUpgrade } = await server.ssrLoadModule('/src/engine/content/charUpgrades.ts');

  function command(world, player, seekRally) {
    const boss = world.boss;
    const aim = normalize(sub(boss.pos, player.pos));
    const distance = dist(boss.pos, player.pos);
    const tangent = { x: -aim.y, y: aim.x };
    const ranged = player.classId === 'bard';
    const whisperReach = (player.abilities.a3.radius ?? 150) + boss.radius;
    const subSkill = player.subAbilities?.sub1;
    const meleeValor = ranged && subSkill?.kind === 'meleeCone';
    const spacing = ranged && !meleeValor ? whisperReach - 25 : boss.radius + player.radius + 8;
    let move = distance > spacing + 20 ? aim : tangent;
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
    if (danger) move = normalize(sub(player.pos, danger.pos));
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
          : [
              ['a2', incoming],
              ['a1', distance < spacing + 25],
            ];
    const pursuit = player.prevButtons.basic && vengeancePursuit(world, { ...player, aim });
    const slot = choices.find(([key, wanted]) => wanted && ready(key))?.[0] ?? 'basic';
    const releaseForPursuit = slot === 'basic' && pursuit && !pursuit.blocked;
    const revive = Boolean(fallen) && !danger;
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
        [slot]: !revive && !releaseForPursuit,
      },
    };
  }

  function fight(build, identity, monsterId, seed, partySize, seekRally, ordinary, ranks) {
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
        ...(partySize === 2 ? [{ peerId: 'ally', name: 'Knight', classId: 'knight' }] : []),
      ],
    });
    const lead = world.players[0];
    const equipped = build.identities.filter((id) => lead.charUpgradeIds?.includes(id));
    if (equipped.length !== Number(Boolean(identity)) || (identity && equipped[0] !== identity))
      throw new Error(`Unexpected active identity for ${build.label}: ${equipped}`);
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
    const recordedPickups = new Set();
    let bossStunSeconds = 0;
    let bossCasts = 0;
    for (let tick = 0; tick < duration / dt && !world.finished; tick++) {
      const prior = world.players.map((p) => ({
        pursuitReadyAt: p.vengeancePursuitReadyAt,
        pursuing: Boolean(p.glide?.vengeancePursuit),
      }));
      const priorRallies = world.groundZones.filter((z) => z.rally);
      world.step(dt, new Map(world.players.map((p) => [p.peerId, command(world, p, seekRally)])));
      // Retain expired field references for the last tick on which players could collect them.
      if (world.boss.buffs.some((b) => b.kind === 'stun')) bossStunSeconds += dt;
      bossCasts += world.events.filter(
        (event) => event.t === 'cast' && event.side === 'boss',
      ).length;
      const rallies = new Set([...priorRallies, ...world.groundZones.filter((z) => z.rally)]);
      world.players.forEach((p, i) => {
        const now = effects[i];
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
          if (event.t === 'hit' && event.targetId === p.id) now.damageTaken += event.amount;
          if (event.t === 'downed' && event.id === p.id) now.downed++;
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
      identity: identity ?? null,
      name: identity ? getCharUpgrade(identity).name : 'No identity',
      monsterId,
      seed,
      partySize,
      outcome: world.outcome ?? 'timeout',
      seconds: round(world.elapsed),
      bossStartHp: round(bossStartHp),
      bossStunSeconds: round(bossStunSeconds),
      bossCasts,
      bossRemainingPct: round((100 * world.boss.hp) / bossStartHp),
      players: world.players.map((p, i) => ({
        ...effects[i],
        damageTaken: round(effects[i].damageTaken),
        damageDealt: round(p.stats.damageDealt),
        healingDone: round(p.stats.healingDone),
        revives: p.stats.revives,
        state: p.state,
      })),
    };
  }

  const fights = [];
  for (const build of builds) {
    for (const boss of build.bosses) {
      for (const seed of seeds) {
        for (const party of [1, 2]) {
          const run = (identity, seekRally = true, ordinary = null, ranks = 0) =>
            fight(build, identity, boss, seed, party, seekRally, ordinary, ranks);
          const matched = [null, ...build.identities].map((id) => run(id));
          if (build.classId === 'bard') matched.push(run(build.identities[1], false));
          // Ordinary comparisons use the same identity at ranks 0, 1 and 3.
          for (const upgrade of build.ordinary ?? []) {
            const ranksToTry = upgrade === 'pa_radiant' ? [1, 3, 5] : [1, 3];
            for (const ranks of ranksToTry)
              matched.push(run(build.identities[1], true, upgrade, ranks));
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
  console.log(JSON.stringify({ hz: 1 / dt, duration, fights }, null, 2));
} finally {
  await server.close();
}
