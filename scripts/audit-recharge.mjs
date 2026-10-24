/** Current no-generic-Haste special cooldowns. All-grands profile is legal today, not a proposed future loadout. */
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
import { format } from 'prettier';
const server = await createServer({
  logLevel: 'silent',
  server: { middlewareMode: true, hmr: false },
});
try {
  const { World } = await server.ssrLoadModule('/src/engine/world/world.ts');
  const { CLASS_IDS } = await server.ssrLoadModule('/src/engine/content/classes.ts');
  const { CHAR_UPGRADES, CHAR_UPGRADES_BY_CLASS } = await server.ssrLoadModule(
    '/src/engine/content/charUpgrades.ts',
  );
  const { subclassesFor } = await server.ssrLoadModule('/src/engine/content/subclasses.ts');
  const rows = [];
  for (const classId of CLASS_IDS)
    for (const sub of subclassesFor(classId))
      for (const skill of sub.skills) {
        for (const rank of [0, 1, 3, 5])
          for (const grands of [false, true]) {
            const picks = CHAR_UPGRADES_BY_CLASS[classId].flatMap((d) => Array(rank).fill(d.id));
            picks.push(...Array(rank).fill(`subup_${skill.id}`));
            if (grands)
              picks.push(
                ...Object.values(CHAR_UPGRADES)
                  .filter(
                    (d) =>
                      d.classId === classId &&
                      d.grand &&
                      !d.graftId &&
                      (!d.subclassId || d.subclassId === sub.id),
                  )
                  .map((d) => d.id),
              );
            const world = new World({
              monsterId: 'lich',
              seed: 31,
              players: [
                {
                  peerId: 'audit',
                  name: 'Audit',
                  classId,
                  charUpgrades: picks,
                  subSkills: [skill.id],
                },
              ],
            });
            const p = world.players[0];
            for (const slot of ['a1', 'a2', 'a3', 'sub1']) {
              const ab = slot === 'sub1' ? p.subAbilities.sub1 : p.abilities[slot];
              const seconds = ab.cooldown * p.cooldownMult;
              if (!Number.isFinite(seconds) || seconds <= 0)
                throw new Error(`Invalid cooldown: ${classId}/${slot}`);
              rows.push({
                classId,
                subclass: sub.id,
                chosenSkill: skill.id,
                rank,
                allCurrentGrands: grands,
                slot,
                name: ab.name,
                seconds: Math.round(seconds * 1000) / 1000,
              });
            }
          }
      }
  const unique = new Map();
  for (const row of rows) {
    const key = JSON.stringify([
      row.classId,
      row.rank,
      row.allCurrentGrands,
      row.slot,
      row.slot === 'sub1' ? row.chosenSkill : null,
    ]);
    const previous = unique.get(key);
    if (previous && previous.seconds !== row.seconds)
      throw new Error(`Context-dependent base recharge: ${key}`);
    if (!previous)
      unique.set(
        key,
        row.slot === 'sub1'
          ? row
          : {
              classId: row.classId,
              rank: row.rank,
              allCurrentGrands: row.allCurrentGrands,
              slot: row.slot,
              name: row.name,
              seconds: row.seconds,
            },
      );
  }
  const result = {
    baseline: '3da6a2c + upgrade foundation corrections',
    genericHaste: false,
    note: 'Canonical single-class profiles; all current native grands coexist today. No refund/charge/Forge simulation. Cast windup is separate from cooldown.',
    observations: rows.length,
    rows: [...unique.values()],
  };
  writeFileSync(
    'docs/RECHARGE_AUDIT.json',
    await format(JSON.stringify(result), { parser: 'json', printWidth: 100 }),
  );
  const worst = rows
    .filter((r) => r.rank === 5 && r.allCurrentGrands)
    .sort((a, b) => a.seconds - b.seconds);
  console.log(JSON.stringify({ rows: rows.length, shortest: worst.slice(0, 12) }, null, 2));
} finally {
  await server.close();
}
