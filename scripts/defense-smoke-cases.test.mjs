import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { loadPassiveRegistry } from './passive-smoke-cases.mjs';
import {
  DEFENSE_CASES,
  resolveDefenseSmokeCases,
  defenseViewports,
} from './defense-smoke-cases.mjs';
const registry = await loadPassiveRegistry();
test('both production defense cohorts resolve receivers by stable ID', () => {
  for (const cohort of Object.keys(DEFENSE_CASES)) {
    const { tests } = resolveDefenseSmokeCases(registry, cohort);
    assert.equal(tests.length, 8);
    for (const c of tests) {
      assert.ok(c.skillId || c.slot);
      const id = c.skillId ?? `${c.classId}.${c.slot}`;
      assert.match(registry.abilityDescriptions[id], c.text, `Stale defense expectation: ${id}`);
    }
  }
  const { tests } = resolveDefenseSmokeCases(registry, 'remaining', 'mg_abjurer_mend');
  assert.equal(tests.length, 1);
  assert.equal(tests[0].bubble, true);
  assert.throws(() => resolveDefenseSmokeCases(registry, 'missing'), /Unknown defense cohort/);
  assert.throws(
    () => resolveDefenseSmokeCases(registry, 'remaining', 'removed'),
    /Unknown defense smoke filter/,
  );
});
test('renames flow through to selectors without changing cohort membership', () => {
  const renamed = structuredClone(registry);
  for (const c of Object.values(renamed.classes))
    for (const ab of Object.values(c.abilities)) ab.name = `New ${c.id}.${ab.slot}`;
  for (const s of renamed.subclasses) for (const skill of s.skills) skill.name = `New ${skill.id}`;
  for (const cohort of Object.keys(DEFENSE_CASES)) {
    const { tests } = resolveDefenseSmokeCases(renamed, cohort);
    for (const c of tests) assert.equal(c.name, `New ${c.skillId ?? `${c.classId}.${c.slot}`}`);
  }
  renamed.subclasses = [];
  assert.throws(
    () => resolveDefenseSmokeCases(renamed, 'remaining'),
    /Missing defense smoke receiver/,
  );
});
test('both production runners arm observation before sending input', () => {
  for (const file of ['smoke-defensive-identity.mjs', 'smoke-defense-recovery.mjs']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    const arm = source.indexOf('await armDefenseCastProbe(page, test)');
    const input = source.indexOf('await hold(test.key');
    assert.ok(arm >= 0 && input >= 0 && arm < input);
    assert.ok(source.includes('loadDefenseSmokeCases'));
    assert.ok(source.indexOf('await page.clock.install()') < source.indexOf('await page.goto('));
    assert.ok(
      source.indexOf('await page.clock.pauseAt(') <
        source.indexOf("await click(button('Start Fight'))"),
    );
    assert.ok(source.includes('advanceDefenseUntil'));
  }
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  assert.ok(ci.includes('npm run test:coverage'));
  const { scripts } = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal(scripts.pretest, 'npm run test:smoke-contracts');
  assert.equal(scripts['pretest:coverage'], 'npm run test:smoke-contracts');
  for (const file of [
    'passive-smoke-cases.test.mjs',
    'defense-smoke-cases.test.mjs',
    'defense-cast-probe.test.mjs',
  ])
    assert.ok(scripts['test:smoke-contracts'].includes(`node scripts/${file}`));
});

test('diagnostic viewport splits preserve the complete default coverage', () => {
  assert.deepEqual(defenseViewports(''), [false, true]);
  assert.deepEqual(defenseViewports('desktop'), [false]);
  assert.deepEqual(defenseViewports('touch'), [true]);
  assert.throws(() => defenseViewports('unknown'), /Unknown defense viewport/);
});
