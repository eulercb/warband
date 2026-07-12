/**
 * Warband — dragon rig: the winged serpent behind the `star` silhouette (dragon —
 * the game's marquee foe). A body from chest to snout, a lashing follow-spine tail,
 * four clawed IK legs and two broad wings that beat in phase, crowned with horns and
 * a fiery eye. The most ornate rig — it composes every primitive but adds none.
 */
import type { RigSpec, TentacleSpec } from '../types';

function wing(baseAngleDeg: number): TentacleSpec {
  return {
    anchorPart: 'body',
    baseAngleDeg,
    segments: 4,
    segLen: 0.82,
    width: 0.5, // broad membrane
    sinAmp: 0.16,
    sinFreq: 1.5,
    phase: 0, // both wings share a phase → a flap, not a slither
    z: 'behind',
  };
}

export function buildDragonSpec(): RigSpec {
  return {
    id: 'dragon',
    parts: [
      { id: 'body', local: { x: 0, y: 0 }, rx: 1.05, ry: 0.9, z: 'main' },
      { id: 'chest', local: { x: 0.68, y: 0 }, rx: 0.72, ry: 0.64, z: 'main' },
      { id: 'brow', local: { x: 1.25, y: 0 }, rx: 0.42, ry: 0.4, z: 'front' },
      { id: 'snout', local: { x: 1.72, y: 0 }, rx: 0.4, ry: 0.28, z: 'front' },
    ],
    spine: {
      segments: 7,
      spacing: 0.5,
      ease: 0.4, // lags into a lashing tail
      rx: 0.66,
      ry: 0.58,
      taper: 0.14,
      sinAmp: 0.16,
      sinFreq: 2.6,
    },
    legs: {
      count: 4,
      anchorPart: 'chest',
      baseAngleDeg: (i) => {
        const side = i % 2 === 0 ? 1 : -1;
        return side * (i < 2 ? 62 : 126);
      },
      attachDist: 0.55,
      homeDist: (i) => (i < 2 ? 1.5 : 1.75),
      l1: 0.85,
      l2: 0.85,
      liftHeight: 0.36,
      legWidthRoot: 0.16,
      legWidthTip: 0.09,
      gait: {
        stepDistance: 1.0,
        stepDuration: 0.18,
        overstep: 0.5,
        maxConcurrent: 2,
        partnerStride: 2,
      },
      bendOutward: true,
      around: 'facing',
    },
    tentacles: [wing(118), wing(-118)],
    decor: [
      {
        kind: 'eyes',
        anchorPart: 'brow',
        local: { x: 0.1, y: 0 },
        scale: 0.15,
        color: 0xffb03a,
        count: 2,
      },
      { kind: 'horn', anchorPart: 'brow', local: { x: 0, y: 0 }, scale: 0.6, count: 2 },
    ],
    idle: { breatheAmp: 0.02, breatheFreq: 1.2 },
  };
}
