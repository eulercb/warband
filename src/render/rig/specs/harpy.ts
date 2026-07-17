/**
 * Warband — harpy rig (item 7): the winged shrieker behind the Harpy Matriarch.
 *
 * The harpy used to borrow the shared quadruped BEAST rig — a wingless, splayed-leg
 * body that read as a spider, not a flyer. She now has her OWN silhouette: a compact
 * bird-of-prey torso over just TWO taloned legs, crowned with a feather crest, and —
 * the point of the redesign — a pair of broad FEATHERED WINGS that beat in phase
 * (modelled on the dragon rig's membrane `wing()`), plus a fanned tail. She reads as
 * airborne from structure + motion alone, matching her constant flight.
 */
import type { RigSpec, TentacleSpec } from '../types';

/** A broad feathered wing sweeping back-and-out, beating in phase with its mirror
 *  (phase 0 → a flap, not a slither) — the dragon rig's `wing()` re-tuned wider. */
function wing(baseAngleDeg: number): TentacleSpec {
  return {
    anchorPart: 'chest',
    baseAngleDeg,
    segments: 4,
    segLen: 0.9,
    width: 0.55, // broad feathered pinion
    sinAmp: 0.22, // a pronounced up/down beat
    sinFreq: 1.9,
    phase: 0, // both wings share a phase → a wing-beat
    z: 'behind',
  };
}

export function buildHarpySpec(): RigSpec {
  return {
    id: 'harpy',
    parts: [
      { id: 'haunch', local: { x: -0.5, y: 0 }, rx: 0.68, ry: 0.6, z: 'main' },
      { id: 'chest', local: { x: 0.38, y: 0 }, rx: 0.66, ry: 0.58, z: 'main' },
      { id: 'head', local: { x: 1.15, y: 0 }, rx: 0.44, ry: 0.42, z: 'front' },
    ],
    // Just TWO taloned legs — a perching bird of prey, not a splayed quadruped.
    legs: {
      count: 2,
      anchorPart: 'haunch',
      baseAngleDeg: (i) => (i % 2 === 0 ? 152 : -152), // two talons tucked rear-down
      attachDist: 0.42,
      homeDist: () => 1.3,
      l1: 0.72,
      l2: 0.72,
      liftHeight: 0.3,
      legWidthRoot: 0.12,
      legWidthTip: 0.06,
      gait: {
        stepDistance: 0.82,
        stepDuration: 0.16,
        overstep: 0.5,
        maxConcurrent: 2,
        partnerStride: 1,
      },
      bendOutward: true,
      around: 'facing',
    },
    tentacles: [
      wing(140),
      wing(-140),
      // A fanned, feathered tail trailing straight back.
      {
        anchorPart: 'haunch',
        baseAngleDeg: 180,
        segments: 3,
        segLen: 0.42,
        width: 0.22,
        sinAmp: 0.1,
        sinFreq: 1.3,
        phase: 0.5,
        z: 'behind',
      },
    ],
    decor: [
      {
        kind: 'eyes',
        anchorPart: 'head',
        local: { x: 0.3, y: 0 },
        scale: 0.13,
        color: 0xffe066,
        count: 2,
      },
      // A pair of swept crest feathers reading as a raptor's crown.
      { kind: 'horn', anchorPart: 'head', local: { x: -0.05, y: 0 }, scale: 0.42, count: 2 },
    ],
    idle: { breatheAmp: 0.03, breatheFreq: 1.6 },
  };
}
