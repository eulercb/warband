/** Current canonical cadence/geometry, with/without Haste. All current grands are a legal legacy stress profile. */
import { createServer } from 'vite';
import { writeFileSync, readFileSync } from 'node:fs';
import { format } from 'prettier';
const server = await createServer({
  logLevel: 'silent',
  server: { middlewareMode: true, hmr: false },
});
try {
  const { World } = await server.ssrLoadModule('/src/engine/world/world.ts');
  const { CLASS_IDS } = await server.ssrLoadModule('/src/engine/content/classes.ts');
  const { CHAR_UPGRADES, CHAR_UPGRADES_BY_CLASS, canonicalGrandId } = await server.ssrLoadModule(
    '/src/engine/content/charUpgrades.ts',
  );
  const { subclassesFor } = await server.ssrLoadModule('/src/engine/content/subclasses.ts');
  const { effectiveRecharge, persistentDuration, rechargeFloor } = await server.ssrLoadModule(
    '/src/engine/content/abilityLimits.ts',
  );
  const rows = [];
  for (const classId of CLASS_IDS)
    for (const sub of subclassesFor(classId))
      for (const skill of sub.skills)
        for (const rank of [0, 1, 3, 5])
          for (const grands of [false, true])
            for (const haste of [0, 5]) {
              const picks = CHAR_UPGRADES_BY_CLASS[classId].flatMap((d) => Array(rank).fill(d.id));
              picks.push(...Array(rank).fill(`subup_${skill.id}`));
              if (grands)
                picks.push(
                  ...Object.values(CHAR_UPGRADES)
                    .filter(
                      (d) =>
                        canonicalGrandId(d.id) === d.id &&
                        d.classId === classId &&
                        d.grand &&
                        !d.graftId &&
                        (!d.subclassId || d.subclassId === sub.id),
                    )
                    .map((d) => d.id),
                );
              const p = new World({
                monsterId: 'lich',
                seed: 31,
                players: [
                  {
                    peerId: 'audit',
                    name: 'Audit',
                    classId,
                    charUpgrades: picks,
                    subSkills: [skill.id],
                    upgrades: Array(haste).fill('haste'),
                  },
                ],
              }).players[0];
              for (const slot of ['a1', 'a2', 'a3', 'sub1']) {
                const ab = slot === 'sub1' ? p.subAbilities.sub1 : p.abilities[slot];
                const seconds = effectiveRecharge(ab, p.cooldownMult, p.castMult);
                const duration = persistentDuration(ab);
                if (
                  !Number.isFinite(seconds) ||
                  seconds < 4 ||
                  (duration > 0 && seconds < duration + 2)
                )
                  throw new Error(`Cadence violation ${classId}/${slot}`);
                if ((ab.kind === 'dash' || ab.kind === 'blink') && ab.range > 420)
                  throw new Error('Travel violation');
                if (ab.kind === 'groundZone' && ab.range > 400)
                  throw new Error('Placement violation');
                const n = (x) => Math.round(x * 1000) / 1000;
                rows.push({
                  classId,
                  subclass: sub.id,
                  chosenSkill: skill.id,
                  rank,
                  hasteRanks: haste,
                  allCurrentGrands: grands,
                  slot,
                  name: ab.name,
                  seconds: n(seconds),
                  rawSeconds: n(ab.cooldown * p.cooldownMult),
                  persistentSeconds: n(duration),
                  recoveryFloor: n(rechargeFloor(ab, slot, p.castMult)),
                  range: ab.range ?? null,
                  radius: ab.radius ?? null,
                });
              }
            }
  const unique = new Map();
  for (const row of rows) {
    const key = JSON.stringify([
      row.classId,
      ['rogue', 'warlock'].includes(row.classId) ? row.subclass : null,
      row.rank,
      row.hasteRanks,
      row.allCurrentGrands,
      row.slot,
      row.slot === 'sub1' ? row.chosenSkill : null,
    ]);
    const previous = unique.get(key);
    if (previous && previous.seconds !== row.seconds)
      throw new Error(`Context-dependent base recharge: ${key}`);
    if (!previous) {
      const base = { ...row };
      if (!['rogue', 'warlock'].includes(row.classId)) delete base.subclass;
      delete base.chosenSkill;
      unique.set(key, row.slot === 'sub1' ? row : base);
    }
  }
  const result = {
    baseline: '62c89e6 plus Rogue/Warlock grand content redesign',
    note: 'Canonical single-class profiles with 0/5 Haste, 0/1/3/5 ordinary ranks and with/without all current native grands. Effective cooldown includes protected recovery. Raw reductions are not usable cooldowns. No live input/refund/Forge simulation.',
    observations: rows.length,
    rows: [...unique.values()],
  };
  const output = await format(JSON.stringify(result), { parser: 'json', printWidth: 100 });
  if (process.argv.includes('--check')) {
    if (readFileSync('docs/RECHARGE_AUDIT.json', 'utf8') !== output)
      throw new Error('Stale recharge audit');
  } else writeFileSync('docs/RECHARGE_AUDIT.json', output);
  console.log(
    JSON.stringify({
      observations: rows.length,
      profiles: unique.size,
      minimumSeconds: Math.min(...rows.map((r) => r.seconds)),
      maximumSeconds: Math.max(...rows.map((r) => r.seconds)),
    }),
  );
} finally {
  await server.close();
}
