/**
 * Warband — beast rig: a lean four-legged predator (direwolf, gnoll, manticore,
 * minotaur). An elongated haunch → chest → head body over four IK legs with a trot
 * gait, a swishing tail and a pair of horns/ears. Reads as a stalking quadruped
 * from structure + motion alone. (The winged harpy has its own rig now — item 7,
 * specs/harpy.ts — she no longer borrows this wingless silhouette.)
 */
import type { RigSpec } from '../types';

export function buildBeastSpec(): RigSpec {
  return {
    id: 'beast',
    parts: [
      { id: 'haunch', local: { x: -0.85, y: 0 }, rx: 0.92, ry: 0.78, z: 'behind' },
      { id: 'chest', local: { x: 0.35, y: 0 }, rx: 0.82, ry: 0.7, z: 'main' },
      { id: 'head', local: { x: 1.25, y: 0 }, rx: 0.52, ry: 0.46, z: 'front' },
    ],
    legs: {
      count: 4,
      // Front pair (0,1) fan forward-out; rear pair (2,3) reach back-out.
      anchorPart: 'chest',
      baseAngleDeg: (i) => {
        const side = i % 2 === 0 ? 1 : -1;
        return side * (i < 2 ? 58 : 128);
      },
      attachDist: 0.6,
      homeDist: (i) => (i < 2 ? 1.7 : 1.95),
      l1: 1.0,
      l2: 1.0,
      liftHeight: 0.4,
      legWidthRoot: 0.16,
      legWidthTip: 0.09,
      gait: {
        stepDistance: 0.95,
        stepDuration: 0.15,
        overstep: 0.5,
        maxConcurrent: 2,
        partnerStride: 2, // same-side legs alternate; a side never lifts both at once
      },
      bendOutward: true,
      around: 'facing',
    },
    tentacles: [
      {
        anchorPart: 'haunch',
        baseAngleDeg: 180, // a tail lashing straight back
        segments: 4,
        segLen: 0.42,
        width: 0.18,
        sinAmp: 0.13,
        sinFreq: 1.4,
        phase: 0,
        z: 'behind',
      },
    ],
    decor: [
      {
        kind: 'eyes',
        anchorPart: 'head',
        local: { x: 0.32, y: 0 },
        scale: 0.14,
        color: 0xffd24a,
        count: 2,
      },
      { kind: 'horn', anchorPart: 'head', local: { x: 0.05, y: 0 }, scale: 0.5, count: 2 },
    ],
    idle: { breatheAmp: 0.02, breatheFreq: 1.8 },
  };
}
