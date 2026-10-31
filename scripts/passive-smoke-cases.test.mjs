import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  loadPassiveRegistry,
  PASSIVE_COHORTS,
  resolvePassiveSmokeCases,
} from './passive-smoke-cases.mjs';
const { subclasses } = await loadPassiveRegistry();

test('CI cohorts cover every smoke case and every subclass exactly once', () => {
  const all = resolvePassiveSmokeCases(subclasses);
  const selected = Object.keys(PASSIVE_COHORTS).flatMap((cohort) =>
    resolvePassiveSmokeCases(subclasses, { cohort }),
  );
  assert.deepEqual(selected.map((c) => c.skillId).sort(), all.map((c) => c.skillId).sort());
  assert.equal(new Set(selected.map((c) => c.skillId)).size, selected.length);
  assert.deepEqual(
    [...new Set(all.map((c) => c.subclassId))].sort(),
    subclasses.map((s) => s.id).sort(),
  );
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  const cohorts = [...workflow.matchAll(/- cohort: ([a-z]+)/g)].map((m) => m[1]);
  assert.deepEqual(cohorts.sort(), Object.keys(PASSIVE_COHORTS).sort());
  assert.ok(workflow.includes('SMOKE_PASSIVE_COHORT: ${{ matrix.cohort }}'));
  assert.ok(!workflow.includes('SMOKE_PASSIVE_NAMES'));
});

test('renaming skill and passive labels preserves all cohort membership and uses new UI labels', () => {
  const renamed = structuredClone(subclasses);
  for (const sub of renamed) {
    sub.passive.name = `Renamed ${sub.passive.id}`;
    for (const skill of sub.skills) skill.name = `Renamed ${skill.id}`;
  }
  for (const cohort of Object.keys(PASSIVE_COHORTS)) {
    const before = resolvePassiveSmokeCases(subclasses, { cohort });
    const after = resolvePassiveSmokeCases(renamed, { cohort });
    assert.deepEqual(
      after.map((c) => [c.skillId, c.passiveId]),
      before.map((c) => [c.skillId, c.passiveId]),
    );
    for (const c of after) {
      assert.equal(c.skill, `Renamed ${c.skillId}`);
      assert.equal(c.passive, `Renamed ${c.passiveId}`);
    }
  }
});

test('stable-ID filters select Whispers while actual removed identities fail clearly', () => {
  const [c] = resolvePassiveSmokeCases(subclasses, {
    cohort: 'casters',
    skillIds: ['ba_whispers_song'],
  });
  assert.equal(c.passiveId, 'whispers_echoed_refrain');
  assert.equal(c.passive, subclasses.find((s) => s.id === 'ba_whispers').passive.name);
  assert.throws(
    () => resolvePassiveSmokeCases(subclasses, { cohort: 'unknown' }),
    /Unknown passive cohort/,
  );
  assert.throws(
    () => resolvePassiveSmokeCases(subclasses, { skillIds: ['removed_skill'] }),
    /Unknown smoke skill ID/,
  );
  assert.throws(
    () => resolvePassiveSmokeCases(subclasses.filter((s) => s.id !== 'ba_whispers')),
    /Missing or ambiguous smoke skill ID/,
  );
});
