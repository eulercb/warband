/**
 * Warband — kraken rig. A central mantle + head bump with eight curling arms
 * radiating at fixed angles, each a per-frame curl (cumulative idle-sine per
 * segment). Two front arms bias toward the telegraph point during a windup.
 */
import type { RigSpec, TentacleSpec } from '../types';

function arm(baseAngleDeg: number, phase: number, reach = false): TentacleSpec {
  return {
    anchorPart: 'mantle',
    baseAngleDeg,
    segments: 5,
    segLen: 0.72,
    width: 0.3,
    sinAmp: 0.16,
    sinFreq: 1.9,
    phase,
    z: 'behind',
    ...(reach ? { reach: 'telegraph' as const } : {}),
  };
}

export function buildKrakenSpec(): RigSpec {
  return {
    id: 'kraken',
    parts: [
      { id: 'mantle', local: { x: 0, y: 0 }, rx: 1.1, ry: 1.0, z: 'main' },
      { id: 'hood', local: { x: 0.4, y: 0 }, rx: 0.6, ry: 0.55, z: 'front' },
    ],
    tentacles: [
      arm(-150, 0.0),
      arm(-110, 0.7),
      arm(-70, 1.4),
      arm(-25, 2.1, true), // front-left arm reaches toward the telegraph
      arm(25, 2.8, true), // front-right arm reaches toward the telegraph
      arm(70, 3.5),
      arm(110, 4.2),
      arm(150, 4.9),
    ],
    decor: [
      {
        kind: 'eyes',
        anchorPart: 'hood',
        local: { x: 0.2, y: 0 },
        scale: 0.16,
        color: 0xd7f0ff,
        count: 2,
      },
    ],
    idle: { breatheAmp: 0.03, breatheFreq: 1.3 },
  };
}
