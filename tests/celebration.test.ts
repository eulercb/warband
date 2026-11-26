import { expect, it } from 'vitest';
import { CLASSES } from '../src/engine/content/classes';
import type { ClassId } from '../src/engine/core/types';
import { celebrationPose } from '../src/render/rig/celebration';

it('gives all twelve classes distinguishable victory rhythms', () => {
  const classes = Object.keys(CLASSES) as ClassId[];
  const beats = classes.map((classId) =>
    [0, 0.24, 0.61, 1.21].map((t) => celebrationPose(classId, t)),
  );
  expect(new Set(beats.map((pose) => JSON.stringify(pose))).size).toBe(12);
  expect(celebrationPose('barbarian', 0.57).lift).toBeGreaterThan(
    celebrationPose('cleric', 0.57).lift,
  );
  const monk = celebrationPose('monk', 0.25);
  expect(monk.left + monk.right).toBeCloseTo(0.74);
});
