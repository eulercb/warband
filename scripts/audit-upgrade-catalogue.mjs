/** Read-only upgrade/reward audit. Regenerate the checked-in design evidence or use --check. */
import { createServer } from 'vite';
import { format } from 'prettier';
import { readFileSync, writeFileSync } from 'node:fs';
const server = await createServer({
  logLevel: 'silent',
  server: { middlewareMode: true, hmr: false },
});
try {
  const { World } = await server.ssrLoadModule('/src/engine/world/world.ts');
  const { CLASS_IDS } = await server.ssrLoadModule('/src/engine/content/classes.ts');
  const { getSubclass, subclassOfSkill, specialRewardStep } = await server.ssrLoadModule(
    '/src/engine/content/subclasses.ts',
  );
  const {
    CHAR_UPGRADES,
    charUpgradeMaxStacks,
    upgradeAllowedFor,
    reofferCandidates,
    rollCharChoices,
    previewAbilityTable,
  } = await server.ssrLoadModule('/src/engine/content/charUpgrades.ts');
  const { UPGRADES, upgradeMaxStacks } = await server.ssrLoadModule(
    '/src/engine/content/upgrades.ts',
  );
  const { Rng } = await server.ssrLoadModule('/src/engine/core/math.ts');
  const { setProceduralSeed } = await server.ssrLoadModule('/src/engine/content/procgen.ts');
  const { setForgeSeed } = await server.ssrLoadModule('/src/engine/content/forge.ts');
  setProceduralSeed(null);
  setForgeSeed(null);
  const stats = [
    'maxHp',
    'moveSpeed',
    'damageMult',
    'damageTakenMult',
    'cooldownMult',
    'castMult',
    'regenPerSec',
    'critChance',
    'critMult',
    'terrainResist',
  ];
  const make = (classId, subSkills = [], charUpgrades = [], upgrades = []) =>
    new World({
      monsterId: 'lich',
      seed: 31,
      players: [{ peerId: 'audit', name: 'Audit', classId, subSkills, charUpgrades, upgrades }],
    }).players[0];
  const snapshot = (p) => ({
    stats: Object.fromEntries(stats.map((k) => [k, p[k]])),
    abilities: p.abilities,
    subAbilities: p.subAbilities ?? {},
  });
  const diff = (a, b, path = '') => {
    if (JSON.stringify(a) === JSON.stringify(b)) return [];
    if (
      a &&
      b &&
      typeof a === 'object' &&
      typeof b === 'object' &&
      !Array.isArray(a) &&
      !Array.isArray(b)
    )
      return [...new Set([...Object.keys(a), ...Object.keys(b)])]
        .sort()
        .flatMap((k) => diff(a[k], b[k], path ? `${path}.${k}` : k));
    return [{ path, before: a ?? null, after: b ?? null }];
  };
  const kind = (d) =>
    d.subSkillId
      ? 'honed'
      : d.graftId
        ? 'graft-grand'
        : d.subclassId
          ? 'subclass-grand'
          : d.skillSlot
            ? 'skill-grand'
            : d.grand
              ? 'class-grand'
              : d.replaces
                ? 'graft'
                : d.classId === 'any'
                  ? 'style'
                  : 'class-boon';
  const records = [];
  const priority = new Set([
    'ro_assassin',
    'ro_poison',
    'ro_vanish',
    'wa_hex',
    'wa_rebuke',
    'wa_pact',
    'ro_grand_venom',
    'ro_gk_a3_a',
    'wa_grand_ruin',
    'wa_gk_a1_a',
    'subup_ro_assassin_poison',
    'subup_wa_fiend_pit',
    'subup_wa_goo_whispers',
    'subup_wa_goo_blast',
    'ro_assassin_g_a',
    'ro_assassin_g_b',
    'wa_great_old_one_g_a',
    'wa_great_old_one_g_b',
    'hy_hexbrand',
    'hy_shadowpact',
  ]);
  for (const d of Object.values(CHAR_UPGRADES)) {
    const category = kind(d),
      max = charUpgradeMaxStacks(d.id);
    const classes =
      d.classId === 'any' ? CLASS_IDS.filter((c) => upgradeAllowedFor(d, c)) : [d.classId];
    const contexts = [];
    for (const classId of classes) {
      const picks = d.subSkillId
        ? [[d.subSkillId]]
        : d.subclassId
          ? getSubclass(d.subclassId).skills.map((s) => [s.id])
          : [[]];
      for (const subSkills of picks) {
        const prefix = d.graftId ? [d.graftId] : [];
        const p0 = make(classId, subSkills, prefix),
          p1 = make(classId, subSkills, [...prefix, d.id]);
        const pm = make(classId, subSkills, [...prefix, ...Array(max).fill(d.id)]);
        const once = diff(snapshot(p0), snapshot(p1)),
          atCap = diff(snapshot(p0), snapshot(pm));
        const finite = (value) =>
          typeof value === 'number'
            ? Number.isFinite(value)
            : value && typeof value === 'object'
              ? Object.values(value).every(finite)
              : true;
        if (!finite(snapshot(pm))) throw new Error(`Nonfinite replay: ${d.id}`);
        contexts.push({ classId, subSkills, prefix, once, atCap });
      }
    }
    if (!contexts.length) throw new Error(`Missing context: ${d.id}`);
    const touched = [...new Set(contexts.flatMap((c) => c.once.map((x) => x.path)))].sort();
    const honedGeneric = category === 'honed' && d.desc.includes('strikes harder');
    let disposition =
      category === 'graft'
        ? 'retain'
        : category === 'honed'
          ? honedGeneric
            ? 'adjust'
            : 'retain'
          : category.endsWith('grand')
            ? 'adjust'
            : category === 'style'
              ? 'investigate'
              : touched.every((p) => p.startsWith('stats.'))
                ? 'retain'
                : 'adjust';
    let rationale =
      category === 'graft'
        ? 'Keep skill identity and replacement cost; audit donor upgrades/reclaim.'
        : category === 'honed'
          ? honedGeneric
            ? 'Replace generic offer promise with skill-specific tuning; candidate for a role-changing rider.'
            : 'Keep clear role-aware numeric fallback; advanced routes belong in separate decisions.'
          : category.endsWith('grand')
            ? 'Review rare-choice role and stacking; a larger numeric bundle is not automatically a distinct route.'
            : category === 'style'
              ? 'Check coverage, tradeoff and replay order across all eligible classes.'
              : disposition === 'retain'
                ? 'Keep understandable stat growth as weak-run fallback.'
                : 'Review live field changes and wording; prefer a useful timing, coverage or resource decision.';
    if (!touched.length) {
      disposition = 'investigate';
      rationale =
        'No resolved change in these valid contexts; trace executor/replay before changing it.';
    }
    records.push({
      id: d.id,
      name: d.name,
      category,
      classId: d.classId,
      exclude: d.exclude ?? [],
      maxStacks: max,
      subSkillId: d.subSkillId ?? null,
      subclassId: d.subclassId ?? null,
      skillSlot: d.skillSlot ?? null,
      graftId: d.graftId ?? null,
      graftSource: d.graftSource ?? null,
      replaces: d.replaces ?? null,
      description: d.desc,
      disposition,
      rationale,
      pilotPriority: priority.has(d.id),
      contexts,
    });
  }
  const generic = Object.values(UPGRADES).map((d) => ({
    id: d.id,
    name: d.name,
    category: 'generic',
    role: d.role,
    description: d.desc,
    maxStacks: upgradeMaxStacks(d.id),
    disposition: 'retain',
    rationale:
      'Keep broad, legible growth; check capped stat and passive scaling when designing class branches.',
    contexts: CLASS_IDS.map((classId) => ({
      classId,
      once: diff(snapshot(make(classId)), snapshot(make(classId, [], [], [d.id]))),
      atCap: diff(
        snapshot(make(classId)),
        snapshot(make(classId, [], [], Array(upgradeMaxStacks(d.id)).fill(d.id))),
      ),
    })),
  }));
  // Resolved equal-effect families: a review flag, not proof of equal combat value.
  const groups = new Map();
  for (const r of records)
    if (r.category.endsWith('grand') && !r.subclassId && !r.graftId) {
      const signature = JSON.stringify([r.classId, r.contexts.map((c) => c.once)]);
      if (!groups.has(signature)) groups.set(signature, []);
      groups.get(signature).push(r.id);
    }
  const duplicateFamilies = [...groups.values()].filter((ids) => ids.length > 1);
  for (const ids of duplicateFamilies)
    for (const id of ids) {
      const r = records.find((r) => r.id === id);
      r.disposition = 'replace';
      r.rationale = `Equal resolved unupgraded delta to ${ids.filter((x) => x !== id).join(', ')}; differentiate one path, preserve stable ownership.`;
    }
  const grafts = records
    .filter((r) => r.category === 'graft')
    .map((r) => {
      const classId = r.contexts[0].classId,
        all = reofferCandidates(classId, [r.id]);
      const grands = records.filter((g) => g.graftId === r.id).map((g) => g.id);
      const sourceBoons = all.filter((id) => id.startsWith('graftup:'));
      const checks = [];
      for (const followup of [...sourceBoons, ...grands]) {
        const live = previewAbilityTable(classId, [r.id, followup]);
        const restored = previewAbilityTable(classId, [r.id, followup, `restore:${r.replaces}`]);
        const reseated = previewAbilityTable(classId, [
          r.id,
          followup,
          `restore:${r.replaces}`,
          r.id,
        ]);
        if (JSON.stringify(live) !== JSON.stringify(reseated))
          throw new Error(`Graft reseat differs: ${r.id}/${followup}`);
        checks.push({
          id: followup,
          liveDiff: diff(previewAbilityTable(classId, [r.id]), live),
          reclaimChanges: diff(live, restored).map((x) => x.path),
          reseatPreserves: true,
        });
      }
      return { id: r.id, recipient: classId, source: r.graftSource, reoffers: all, checks };
    });
  const profiles = [
    { name: 'rogue-base', classId: 'rogue', subSkills: [], targets: ['ro_assassin', 'ro_poison'] },
    {
      name: 'rogue-assassin',
      classId: 'rogue',
      subSkills: ['ro_assassin_poison', 'ro_assassin_strike'],
      targets: ['subup_ro_assassin_poison', 'ro_poison'],
    },
    { name: 'warlock-base', classId: 'warlock', subSkills: [], targets: ['wa_hex', 'wa_rebuke'] },
    {
      name: 'warlock-fiend',
      classId: 'warlock',
      subSkills: ['wa_fiend_pit', 'wa_fiend_rebuke'],
      targets: ['subup_wa_fiend_pit', 'wa_hex'],
    },
  ];
  const availability = profiles.map((profile) => {
    const totals = { 1: 0, 5: 0, 10: 0 };
    const trials = 2048;
    for (let seed = 1; seed <= trials; seed++) {
      const rng = new Rng(seed),
        owned = [];
      for (let reward = 1; reward <= 10; reward++) {
        const offers = rollCharChoices(
          profile.classId,
          4,
          () => rng.next(),
          owned,
          [],
          profile.subSkills,
        );
        if (offers.length !== new Set(offers).size) throw new Error('Duplicate offer');
        const pick =
          offers.find((id) => profile.targets.includes(id) && !owned.includes(id)) ?? offers[0];
        if (pick) owned.push(pick);
        if (reward in totals && profile.targets.every((id) => owned.includes(id))) totals[reward]++;
      }
    }
    return {
      ...profile,
      trials,
      pairAcquiredBy: Object.fromEntries(
        Object.entries(totals).map(([n, v]) => [n, { count: v, fraction: v / trials }]),
      ),
    };
  });
  const counts = Object.fromEntries(
    [...new Set(records.map((r) => r.category))].map((k) => [
      k,
      records.filter((r) => r.category === k).length,
    ]),
  );
  if (
    records.length !== 350 ||
    generic.length !== 9 ||
    new Set(records.map((r) => r.id)).size !== 350
  )
    throw new Error('Registry changed; review audit scope/counts.');
  const evidence = {
    schema: 1,
    baseline: '3da6a2c plus upgrade foundation corrections (see UPGRADE_FOUNDATIONS_AND_GRANDS.md)',
    seed: 31,
    counts,
    genericCount: generic.length,
    limits: [
      'Single-upgrade and at-cap native replay, all eligible class recipients and every individual subclass choice; not all upgrade permutations.',
      'Flags and dispositions are design triage; resolved deltas do not certify live executor value or balanced throughput.',
      'Availability: 2,048 sequential seeded 10-reward simulations per profile, four character offers, one pick per reward; take a missing target first, otherwise first offer. No shop/reroll/grands/multiclass; subclass profiles start already unlocked. Current analogue IDs, not proposed future probabilities.',
    ],
    duplicateFamilies,
    grafts,
    availability,
    records,
    generic,
  };
  const esc = (s) => String(s).replaceAll('|', '\\|').replaceAll('\n', ' ');
  const rows = [
    '# Upgrade inventory and replay evidence',
    '',
    'Generated by `node scripts/audit-upgrade-catalogue.mjs`. Baseline: merged coherence C.',
    '',
    '350 character definitions plus 9 generic stat boons. Full deltas, caps, every recipient/context, graft replay checks and availability probes are in [UPGRADE_INVENTORY.json](UPGRADE_INVENTORY.json).',
    '',
    '**Disposition is initial design triage, not a claim that every numeric boon is bad or every changed field is executed.** See [the design checkpoint](UPGRADE_DESIGN_CHECKPOINT.md) for verified findings, concrete decisions, research limitations and implementation scope.',
    '',
    '| ID | Category / owner | Cap | Disposition | Fields changed on first native application | Reason |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const r of records) {
    const paths = [...new Set(r.contexts.flatMap((c) => c.once.map((x) => x.path)))];
    rows.push(
      `| ${r.id} | ${r.category} / ${r.classId} | ${r.maxStacks} | ${r.disposition}${r.pilotPriority ? ' · pilot' : ''} | ${esc(paths.slice(0, 4).join(', ') + (paths.length > 4 ? `, +${paths.length - 4} more (JSON)` : '') || 'none')} | ${esc(r.rationale)} |`,
    );
  }
  rows.push(
    '',
    '## Generic stat boons',
    '',
    '| ID | Role | Cap | Direction |',
    '| --- | --- | --- | --- |',
  );
  for (const r of generic)
    rows.push(`| ${r.id} | ${r.role} | ${r.maxStacks} | Retain; ${esc(r.description)} |`);
  const outputs = {
    'docs/UPGRADE_INVENTORY.json': await format(JSON.stringify(evidence), {
      parser: 'json',
      printWidth: 100,
    }),
    'docs/UPGRADE_INVENTORY.md': await format(rows.join('\n'), {
      parser: 'markdown',
      printWidth: 100,
    }),
  };
  for (const [path, content] of Object.entries(outputs))
    if (process.argv.includes('--check')) {
      if (readFileSync(path, 'utf8') !== content) throw new Error(`Stale ${path}`);
    } else writeFileSync(path, content);
  console.log(
    JSON.stringify(
      {
        counts,
        generic: generic.length,
        contexts: records.reduce((n, r) => n + r.contexts.length, 0),
        duplicateFamilies,
        graftReplayChecks: grafts.reduce((n, g) => n + g.checks.length, 0),
        availability,
      },
      null,
      2,
    ),
  );
  // Keep this import in the audit's API check: progression must be represented in design, not inferred from offerability alone.
  console.log(
    'Progression:',
    JSON.stringify(
      [[], ['ro_assassin_poison'], ['ro_assassin_poison', 'ro_assassin_strike']].map((skills) =>
        specialRewardStep('rogue', [], skills),
      ),
    ),
  );
  if (!subclassOfSkill('ro_assassin_poison')) throw new Error('Pilot source missing');
} finally {
  await server.close();
}
