/**
 * Warband — blob rig: a hunched amorphous bruiser (troll, owlbear). A big central
 * mass under two shoulder lumps and a low head, waddling on two stubby splayed legs
 * and swinging two heavy arms that reach toward the telegraph on a windup.
 * Lumbering, not graceful — reuses the leg + tentacle primitives only.
 */
import type { RigSpec, TentacleSpec } from '../types';

function armLimb(baseAngleDeg: number, phase: number): TentacleSpec {
  return {
    anchorPart: 'belly',
    baseAngleDeg,
    segments: 3,
    segLen: 0.6,
    width: 0.32,
    sinAmp: 0.09,
    sinFreq: 1.2,
    phase,
    z: 'front',
    reach: 'telegraph', // arms wind up toward the telegraph point before a swipe
  };
}

export function buildBlobSpec(): RigSpec {
  return {
    id: 'blob',
    parts: [
      { id: 'belly', local: { x: -0.1, y: 0 }, rx: 1.05, ry: 0.98, z: 'main' },
      { id: 'lumpL', local: { x: 0.3, y: -0.6 }, rx: 0.52, ry: 0.5, z: 'behind' },
      { id: 'lumpR', local: { x: 0.3, y: 0.6 }, rx: 0.5, ry: 0.48, z: 'behind' },
      { id: 'head', local: { x: 0.8, y: 0 }, rx: 0.5, ry: 0.46, z: 'front' },
    ],
    legs: {
      count: 2,
      anchorPart: 'belly',
      baseAngleDeg: (i) => (i === 0 ? 95 : -95),
      attachDist: 0.5,
      homeDist: () => 1.15,
      l1: 0.65,
      l2: 0.65,
      liftHeight: 0.3,
      legWidthRoot: 0.28,
      legWidthTip: 0.16,
      gait: {
        stepDistance: 0.7,
        stepDuration: 0.2,
        overstep: 0.4,
        maxConcurrent: 1,
        partnerStride: 1,
      },
      bendOutward: true,
      around: 'velocity',
    },
    tentacles: [armLimb(58, 0.4), armLimb(-58, 2.0)],
    decor: [
      {
        kind: 'eyes',
        anchorPart: 'head',
        local: { x: 0.28, y: 0 },
        scale: 0.13,
        color: 0xf2e6c0,
        count: 2,
      },
    ],
    idle: { breatheAmp: 0.03, breatheFreq: 1.1 },
  };
}
