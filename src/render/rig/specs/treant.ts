/**
 * Warband — treant rig. A tall trunk under a soft green canopy, two ponderous
 * root-legs (slow, single-step gait) and a few gently swaying branch tentacles.
 * Reuses the leg + tentacle primitives — no new machinery.
 */
import type { RigSpec } from '../types';

export function buildTreantSpec(): RigSpec {
  return {
    id: 'treant',
    parts: [
      { id: 'trunk', local: { x: 0, y: 0.15 }, rx: 0.78, ry: 1.1, z: 'main', tint: 0x6b5330 },
      // Canopy sits high + a touch smaller so the trunk base and roots read below it.
      { id: 'canopy', local: { x: 0, y: -0.62 }, rx: 1.15, ry: 1.0, z: 'front', tint: 0x4f7a2e },
    ],
    legs: {
      count: 2,
      anchorPart: 'trunk',
      baseAngleDeg: (i) => (i === 0 ? 122 : -122), // two roots, splayed down/out to the rear
      attachDist: 0.5,
      homeDist: () => 1.9, // reach well past the canopy so the roots are visible
      l1: 1.05,
      l2: 1.05,
      liftHeight: 0.32,
      legWidthRoot: 0.22,
      legWidthTip: 0.13,
      gait: {
        stepDistance: 1.5, // big, slow strides
        stepDuration: 0.34,
        overstep: 0.4,
        maxConcurrent: 1,
        partnerStride: 1,
      },
      bendOutward: true,
      around: 'velocity',
    },
    tentacles: [
      {
        anchorPart: 'trunk',
        baseAngleDeg: -55,
        segments: 3,
        segLen: 0.62,
        width: 0.16,
        sinAmp: 0.1,
        sinFreq: 1.1,
        phase: 0.0,
        z: 'front',
      },
      {
        anchorPart: 'trunk',
        baseAngleDeg: 55,
        segments: 3,
        segLen: 0.62,
        width: 0.16,
        sinAmp: 0.1,
        sinFreq: 1.1,
        phase: 1.6,
        z: 'front',
      },
      {
        anchorPart: 'trunk',
        baseAngleDeg: 150,
        segments: 3,
        segLen: 0.55,
        width: 0.14,
        sinAmp: 0.12,
        sinFreq: 0.9,
        phase: 3.0,
        z: 'front',
      },
    ],
    idle: { breatheAmp: 0.012, breatheFreq: 0.8 },
  };
}
