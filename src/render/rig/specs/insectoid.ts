/**
 * Warband — generic six-legged insectoid. Thorax + abdomen + head with six IK
 * legs fanned ±(50,90,130)° and a quick gait. A good default for the `insect`
 * archetype and swarm adds.
 */
import type { RigSpec } from '../types';

const FAN = [50, 90, 130];

export function buildInsectoidSpec(): RigSpec {
  return {
    id: 'insectoid',
    parts: [
      { id: 'abdomen', local: { x: -0.8, y: 0 }, rx: 0.95, ry: 0.8, z: 'behind' },
      { id: 'thorax', local: { x: 0.2, y: 0 }, rx: 0.7, ry: 0.6, z: 'main' },
      { id: 'head', local: { x: 0.85, y: 0 }, rx: 0.45, ry: 0.42, z: 'front' },
    ],
    legs: {
      count: 6,
      anchorPart: 'thorax',
      baseAngleDeg: (i) => {
        const side = i < 3 ? 1 : -1;
        return side * FAN[i % 3];
      },
      attachDist: 0.7,
      homeDist: (i) => 1.8 + 0.15 * (i % 3),
      l1: 1.0,
      l2: 1.0,
      liftHeight: 0.45,
      legWidthRoot: 0.09,
      legWidthTip: 0.055,
      gait: {
        stepDistance: 0.9,
        stepDuration: 0.12,
        overstep: 0.5,
        maxConcurrent: 2,
        partnerStride: 3, // tripod-ish: leg i paired with (i+3)%6
      },
      bendOutward: true,
      around: 'facing',
    },
    decor: [
      {
        kind: 'eyes',
        anchorPart: 'head',
        local: { x: 0.25, y: 0 },
        scale: 0.12,
        color: 0xff6a4a,
        count: 2,
      },
      { kind: 'mandible', anchorPart: 'head', local: { x: 0.5, y: 0 }, scale: 0.22 },
    ],
    idle: { breatheAmp: 0.02, breatheFreq: 2.4 },
  };
}
