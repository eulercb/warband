/**
 * Warband — spider rig (the reference). Two shaded ellipses (cephalothorax +
 * abdomen) with eight 2-bone IK legs placed each frame against a stepping gait.
 * Reads as a spider from structure + motion alone — no painted detail.
 */
import type { RigSpec } from '../types';

export function buildSpiderSpec(): RigSpec {
  return {
    id: 'spider',
    parts: [
      { id: 'abdomen', local: { x: -0.9, y: 0 }, rx: 1.15, ry: 0.95, z: 'behind' },
      { id: 'cephalothorax', local: { x: 0.5, y: 0 }, rx: 0.72, ry: 0.62, z: 'main' },
    ],
    legs: {
      count: 8,
      anchorPart: 'cephalothorax',
      // Legs 0-3 splay to one side, 4-7 mirror; j fans them front → back.
      baseAngleDeg: (i) => {
        const side = i < 4 ? 1 : -1;
        const j = i % 4;
        return side * (55 + 32 * j);
      },
      attachDist: 0.85,
      homeDist: (i) => 2.1 + 0.18 * (i % 4),
      l1: 1.18,
      l2: 1.18,
      liftHeight: 0.55,
      legWidthRoot: 0.1,
      legWidthTip: 0.06,
      gait: {
        stepDistance: 1.0,
        stepDuration: 0.16,
        overstep: 0.6,
        maxConcurrent: 3,
        partnerStride: 4, // antiphase: leg i steps opposite leg (i+4)%8
      },
      bendOutward: true,
      around: 'facing',
    },
    decor: [
      {
        kind: 'eyes',
        anchorPart: 'cephalothorax',
        local: { x: 0.45, y: 0 },
        scale: 0.14,
        color: 0xbfe9ff,
        count: 8,
      },
      {
        kind: 'marking',
        anchorPart: 'abdomen',
        local: { x: 0, y: 0 },
        scale: 0.4,
        color: 0xb23a2e,
      },
      { kind: 'mandible', anchorPart: 'cephalothorax', local: { x: 0.75, y: 0 }, scale: 0.28 },
    ],
    idle: { breatheAmp: 0.02, breatheFreq: 1.6 },
  };
}
