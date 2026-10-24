/** Deterministic outgoing-pressure fixtures, not full encounters or player success rates.
 * node scripts/measure-upgrade-pilot.mjs /path/to/baseline-worktree > report.json
 * Baseline: merged design commit 45706e1, dependencies installed/available in both roots.
 */
import { createServer } from 'vite';
import { resolve } from 'node:path';
const roots = [process.argv[2], process.cwd()];
if (!roots[0]) throw new Error('Supply the baseline checkout path (45706e1).');
const report = [];
for (const [version, root] of roots.entries()) {
  const server = await createServer({
    root: resolve(root),
    logLevel: 'silent',
    server: { middlewareMode: true, hmr: false },
  });
  try {
    const { World } = await server.ssrLoadModule('/src/engine/world/world.ts');
    const { resolvePlayerAbility } = await server.ssrLoadModule('/src/engine/combat/abilities.ts');
    const { applyBuff, makeBuff } = await server.ssrLoadModule('/src/engine/combat/combat.ts');
    const { heroPowerRatio } = await server.ssrLoadModule('/src/engine/content/balance.ts');
    for (const classId of ['rogue', 'warlock'])
      for (const n of [0, 1, 3, 5])
        for (const pattern of ['stationary', 'moving', 'flight', 'immune', 'adds'])
          for (const party of [1, 2, 4]) {
            const ids =
              classId === 'rogue'
                ? ['ro_assassin', 'ro_poison', 'subup_ro_assassin_poison']
                : ['wa_hex', 'wa_rebuke', 'subup_wa_goo_blast'];
            for (const grand of [false, true]) {
              const upgrades = ids.flatMap((id) => Array(n).fill(id));
              if (grand) upgrades.push(classId === 'rogue' ? 'ro_grand_venom' : 'wa_grand_ruin');
              const w = new World({
                monsterId: 'lich',
                seed: 31,
                players: Array.from({ length: party }, (_, i) => ({
                  peerId: `p${i}`,
                  name: `P${i}`,
                  classId,
                  charUpgrades: upgrades,
                  subSkills: [classId === 'rogue' ? 'ro_assassin_poison' : 'wa_goo_blast'],
                })),
              });
              w.scene = null;
              w.obstacles = [];
              w.terrain = [];
              const boss = w.boss;
              boss.hp = boss.maxHp = 1e8;
              boss.decisionTimer = 1000;
              boss.moveSpeed = 0;
              if (pattern === 'adds')
                for (let i = 0; i < 4; i++)
                  w.adds.push({
                    id: w.allocId(),
                    pos: { x: 680 + i * 15, y: 420 },
                    hp: 1e7,
                    maxHp: 1e7,
                    radius: 12,
                    moveSpeed: 0,
                    targetId: null,
                    attackCd: 1000,
                    buffs: [],
                  });
              const power = heroPowerRatio(w.players[0]);
              let refunds = 0;
              for (let frame = 0; frame < 1800; frame++) {
                const t = frame / 60;
                boss.pos = {
                  x:
                    pattern === 'moving'
                      ? 680 + 330 * (0.5 - 0.5 * Math.cos((t * Math.PI) / 3))
                      : 680,
                  y: 400,
                };
                if (pattern === 'flight') applyBuff(boss, makeBuff('flight', 1, 1, 'fixture'));
                if (pattern === 'immune') applyBuff(boss, makeBuff('invuln', 1, 1, 'fixture'));
                for (const p of w.players) {
                  p.pos = { x: 600, y: 400 };
                  p.aim = { x: 1, y: 0 };
                  p.hp = p.maxHp;
                  for (const slot of ['sub1', 'a2', 'a1', 'a3', 'basic']) {
                    const ab = slot === 'sub1' ? p.subAbilities.sub1 : p.abilities[slot];
                    if (!ab || p.cooldowns[slot] > 0) continue;
                    const cooldown = p.cooldowns.a2;
                    const beforeZones = w.groundZones.length;
                    resolvePlayerAbility(w, p, slot, { x: 0, y: 0 });
                    refunds += Math.max(0, cooldown - p.cooldowns.a2);
                    // Deliberate field placement at cast time; no retargeting after placement.
                    for (const z of w.groundZones.slice(beforeZones)) z.pos = { ...boss.pos };
                    p.cooldowns[slot] =
                      ab.cooldown * p.cooldownMult + (ab.castTime ?? 0) * p.castMult;
                  }
                }
                const beforeStats = w.players.reduce((s, p) => s + p.stats.damageDealt, 0);
                w.step(1 / 60, new Map());
                if (w.players.reduce((s, p) => s + p.stats.damageDealt, 0) - beforeStats > 5000)
                  throw new Error(
                    JSON.stringify({
                      version,
                      classId,
                      n,
                      grand,
                      pattern,
                      party,
                      frame,
                      events: w.events.slice(-12),
                      buffs: boss.buffs,
                    }),
                  );
                w.events = [];
              }
              report.push({
                version: version ? 'pilot' : 'baseline',
                classId,
                stacks: n,
                grand,
                pattern,
                party,
                damage:
                  Math.round(w.players.reduce((s, p) => s + p.stats.damageDealt, 0) * 100) / 100,
                refundSeconds: Math.round(refunds * 100) / 100,
                power: Math.round(power * 1000) / 1000,
              });
            }
          }
  } finally {
    await server.close();
  }
}
console.log(JSON.stringify(report, null, 2));
