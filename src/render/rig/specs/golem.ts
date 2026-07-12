/**
 * Warband — golem/construct rig: a heavy, blocky automaton (animated armor,
 * gargoyle, mud golem). A broad torso with boxy shoulders and a small head on two
 * ponderous legs, plus two short thick arms that stay near-rigid (stone doesn't
 * wave) but punch toward the telegraph on a windup. Weight over agility.
 */
import type { RigSpec, TentacleSpec } from '../types';

function armLimb(anchorPart: string, baseAngleDeg: number, phase: number): TentacleSpec {
  return {
    anchorPart,
    baseAngleDeg,
    segments: 2,
    segLen: 0.62,
    width: 0.34,
    sinAmp: 0.05, // barely sways — a slab of an arm
    sinFreq: 0.9,
    phase,
    z: 'front',
    reach: 'telegraph',
  };
}

export function buildGolemSpec(): RigSpec {
  return {
    id: 'golem',
    parts: [
      { id: 'core', local: { x: 0, y: 0 }, rx: 0.95, ry: 1.05, z: 'main' },
      { id: 'shoulderL', local: { x: 0.12, y: -0.85 }, rx: 0.44, ry: 0.44, z: 'main' },
      { id: 'shoulderR', local: { x: 0.12, y: 0.85 }, rx: 0.44, ry: 0.44, z: 'main' },
      { id: 'head', local: { x: 0.72, y: 0 }, rx: 0.4, ry: 0.4, z: 'front' },
    ],
    legs: {
      count: 2,
      anchorPart: 'core',
      baseAngleDeg: (i) => (i === 0 ? 100 : -100),
      attachDist: 0.45,
      homeDist: () => 1.25,
      l1: 0.7,
      l2: 0.7,
      liftHeight: 0.26, // heavy, low-clearance strides
      legWidthRoot: 0.28,
      legWidthTip: 0.17,
      gait: {
        stepDistance: 0.85,
        stepDuration: 0.24, // ponderous
        overstep: 0.35,
        maxConcurrent: 1,
        partnerStride: 1,
      },
      bendOutward: false,
      around: 'velocity',
    },
    tentacles: [armLimb('shoulderL', -60, 0.0), armLimb('shoulderR', 60, 1.5)],
    decor: [
      {
        kind: 'eyes',
        anchorPart: 'head',
        local: { x: 0.24, y: 0 },
        scale: 0.13,
        color: 0x9fe6ff,
        count: 2,
      },
      // A glowing core sigil stamped on the chest.
      {
        kind: 'marking',
        anchorPart: 'core',
        local: { x: 0.1, y: 0 },
        scale: 0.45,
        color: 0xffffff,
      },
    ],
  };
}
