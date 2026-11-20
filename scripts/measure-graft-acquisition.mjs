/** Run from the repository root: node scripts/measure-graft-acquisition.mjs */
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const profiles = [
  { classId: 'knight', graft: 'hy_fieldmedic', native: 'kn_bulwark' },
  { classId: 'ranger', graft: 'hy_fieldmedic', native: 'rg_barbed' },
  { classId: 'druid', graft: 'hy_inspire', native: 'dr_grasp' },
  { classId: 'knight', graft: 'hy_hexbrand', native: 'kn_concuss' },
];
const trials = 2048;
const server = await createServer({
  logLevel: 'silent',
  server: { middlewareMode: true, hmr: false },
});
try {
  const { CLASS_IDS } = await server.ssrLoadModule('/src/engine/content/classes.ts');
  const { RUN_LENGTH } = await server.ssrLoadModule('/src/engine/core/constants.ts');
  const { Rng, mixSeed } = await server.ssrLoadModule('/src/engine/core/math.ts');
  const { rollUpgradeChoices } = await server.ssrLoadModule('/src/engine/content/upgrades.ts');
  const { CHAR_UPGRADES, occupancyAfter, reofferCandidates, rollCharChoices, previewAbilityTable } =
    await server.ssrLoadModule('/src/engine/content/charUpgrades.ts');

  function draw(classId, seed, cycle, stop, generic, owned) {
    const rewardSeed = mixSeed(seed, cycle, stop, 0x2ec0);
    const rng = new Rng(mixSeed(rewardSeed, CLASS_IDS.indexOf(classId) + 1));
    const random = () => rng.next();
    const raw = rollUpgradeChoices(3, random, generic);
    const offers = rollCharChoices(classId, 4, random, owned);
    assert.equal(new Set(offers).size, offers.length);
    if (raw.length) generic.push(raw[0]);
    return offers;
  }

  const stops = RUN_LENGTH - 1;
  const rows = [];
  for (const { classId, graft, native } of profiles) {
    const slot = CHAR_UPGRADES[graft].replaces;
    const restore = `restore:${slot}`;
    const expectedUpgrade = reofferCandidates(classId, [graft]).filter((id) => id !== restore);
    const baselineAbility = previewAbilityTable(classId, [native])[slot];
    const graftedAbility = previewAbilityTable(classId, [native, graft])[slot];
    assert.notDeepEqual(graftedAbility, baselineAbility);
    assert.ok(expectedUpgrade.length > 0);

    const acquisition = [];
    for (const priority of [
      [graft, native],
      [native, graft],
    ]) {
      const totals = { offered: 0, acquired: 0, conflicts: 0, nativeClaims: 0 };
      const firstClaimAt = Array(stops).fill(0);
      for (let seed = 1; seed <= trials; seed++) {
        const generic = [];
        const owned = [];
        let offered = false;
        for (let stop = 0; stop < stops; stop++) {
          const offers = draw(classId, seed, 0, stop, generic, owned);
          if (offers.includes(graft)) offered = true;
          if (offers.includes(graft) && offers.includes(native)) totals.conflicts++;
          if (occupancyAfter(classId, owned)[slot] === graft) assert.ok(!offers.includes(native));
          const pick =
            priority.find((id) => offers.includes(id)) ??
            offers.find((id) => !CHAR_UPGRADES[id]?.replaces && !id.includes(':'));
          if (pick === graft) firstClaimAt[stop]++;
          if (pick === native) totals.nativeClaims++;
          if (pick) owned.push(pick);
        }
        if (offered) totals.offered++;
        if (owned.includes(graft)) totals.acquired++;
      }
      acquisition.push({ priority: priority[0], ...totals, firstClaimAt });
    }

    const lifecycle = {
      upgradeSeen: 0,
      reclaimSeenWhileInstalled: 0,
      improved: 0,
      reclaimed: 0,
      reseated: 0,
    };
    for (let seed = 1; seed <= trials; seed++) {
      const generic = [];
      const owned = [native, graft];
      let upgradedAbility;
      let improved = false;
      let reclaimed = false;
      let reseated = false;
      let upgradeSeen = false;
      let reclaimSeen = false;
      for (let stop = 0; stop < stops; stop++) {
        const offers = draw(classId, seed, 1, stop, generic, owned);
        const upgrade = offers.find((id) => expectedUpgrade.includes(id));
        if (upgrade) upgradeSeen = true;
        if (offers.includes(restore)) reclaimSeen = true;
        if (!improved && upgrade) {
          owned.push(upgrade);
          upgradedAbility = previewAbilityTable(classId, owned)[slot];
          assert.notDeepEqual(upgradedAbility, graftedAbility);
          improved = true;
        } else if (improved && !reclaimed && offers.includes(restore)) {
          owned.push(restore);
          assert.equal(occupancyAfter(classId, owned)[slot], slot);
          assert.deepEqual(previewAbilityTable(classId, owned)[slot], baselineAbility);
          reclaimed = true;
        } else if (reclaimed && !reseated && offers.includes(graft)) {
          owned.push(graft);
          assert.equal(occupancyAfter(classId, owned)[slot], graft);
          assert.deepEqual(previewAbilityTable(classId, owned)[slot], upgradedAbility);
          reseated = true;
        }
      }
      if (upgradeSeen) lifecycle.upgradeSeen++;
      if (reclaimSeen) lifecycle.reclaimSeenWhileInstalled++;
      if (improved) lifecycle.improved++;
      if (reclaimed) lifecycle.reclaimed++;
      if (reseated) lifecycle.reseated++;
    }
    rows.push({ classId, graft, native, slot, expectedUpgrade, acquisition, lifecycle });
  }
  console.log(JSON.stringify({ trials, stops, rows }, null, 2));
} finally {
  await server.close();
}
