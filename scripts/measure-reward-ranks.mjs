/** Run from the repository root: node scripts/measure-reward-ranks.mjs */
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const profiles = [
  { target: 'pa_radiant', alternative: 'pa_aegis', classId: 'paladin' },
  { target: 'rg_frost', alternative: 'rg_volley', classId: 'ranger' },
  {
    target: 'subup_pa_vengeance_hunt',
    alternative: 'pa_radiant',
    classId: 'paladin',
    skills: ['pa_vengeance_hunt', 'pa_vengeance_charge'],
  },
  {
    target: 'subup_pa_devotion_aura',
    alternative: 'pa_mercy',
    classId: 'paladin',
    skills: ['pa_devotion_aura', 'pa_devotion_bless'],
  },
  {
    target: 'subup_ba_valor_bolster',
    alternative: 'ba_anthem',
    classId: 'bard',
    skills: ['ba_valor_bolster', 'ba_valor_blade'],
  },
  {
    target: 'rg_volley',
    alternative: 'rg_barbed',
    classId: 'ranger',
    skills: ['rg_hunter_mark', 'rg_hunter_stand'],
  },
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
  const { rollCharChoices, charUpgradeMaxStacks, getCharUpgrade } = await server.ssrLoadModule(
    '/src/engine/content/charUpgrades.ts',
  );
  const { subclassOfSkill } = await server.ssrLoadModule('/src/engine/content/subclasses.ts');
  const stops = RUN_LENGTH - 1;
  const rows = [];
  for (const profile of profiles) {
    const { classId, target, alternative, skills = [] } = profile;
    assert.ok(getCharUpgrade(target) && getCharUpgrade(alternative));
    assert.ok(skills.every((id) => subclassOfSkill(id)?.classId === classId));
    for (const priority of [
      [target, alternative],
      [alternative, target],
    ]) {
      const cumulative = Array.from({ length: stops }, () => ({
        seenTarget: 0,
        ranks: [0, 0, 0, 0, 0],
        alternativeRanks: 0,
      }));
      let jointOffers = 0;
      let targetClaims = 0;
      let alternativeClaims = 0;
      for (let masterSeed = 1; masterSeed <= trials; masterSeed++) {
        const owned = [];
        const generic = [];
        let seenTarget = false;
        for (let stop = 0; stop < stops; stop++) {
          // Host rewardSeed + RewardRoom's per-class stream at reroll count zero.
          const cycle = skills.length ? 2 : 0;
          const rewardSeed = mixSeed(masterSeed, cycle, stop, 0x2ec0);
          const rng = new Rng(mixSeed(rewardSeed, CLASS_IDS.indexOf(classId) + 1));
          const random = () => rng.next();
          const genericOffers = rollUpgradeChoices(3, random, generic);
          const offers = rollCharChoices(classId, 4, random, owned, [], skills);
          assert.equal(new Set(offers).size, offers.length);
          if (genericOffers.length) generic.push(genericOffers[0]);
          seenTarget ||= offers.includes(target);
          if (offers.includes(target) && offers.includes(alternative)) jointOffers++;
          const claim = priority.find((id) => offers.includes(id)) ?? offers[0];
          if (claim) {
            assert.ok(owned.filter((id) => id === claim).length < charUpgradeMaxStacks(claim));
            owned.push(claim);
          }
          if (claim === target) targetClaims++;
          if (claim === alternative) alternativeClaims++;
          const ranks = owned.filter((id) => id === target).length;
          const summary = cumulative[stop];
          if (seenTarget) summary.seenTarget++;
          for (let rank = 1; rank <= ranks; rank++) summary.ranks[rank - 1]++;
          summary.alternativeRanks += owned.filter((id) => id === alternative).length;
        }
      }
      rows.push({
        ...profile,
        policy: priority[0],
        jointOffers,
        targetClaims,
        alternativeClaims,
        cumulative,
      });
    }
  }
  console.log(JSON.stringify({ trials, stops, rows }, null, 2));
} finally {
  await server.close();
}
