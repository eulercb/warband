/**
 * Warband — eye rig: a floating eye-tyrant (beholder, will-o'-wisp, archfae). One
 * great eyeball — a glowing sclera, a forward iris and a dark pupil that both sit
 * toward the facing so it always stares at its prey — ringed by a fan of waving
 * eyestalks trailing behind. No legs; it hovers.
 */
import type { RigSpec, TentacleSpec } from '../types';

function stalk(baseAngleDeg: number, phase: number): TentacleSpec {
  return {
    anchorPart: 'orb',
    baseAngleDeg,
    segments: 3,
    segLen: 0.5,
    width: 0.12,
    sinAmp: 0.22, // eyestalks weave restlessly
    sinFreq: 1.7,
    phase,
    z: 'behind',
  };
}

export function buildEyeSpec(): RigSpec {
  return {
    id: 'eye',
    parts: [
      { id: 'orb', local: { x: 0, y: 0 }, rx: 1.0, ry: 1.0, z: 'main' },
      { id: 'iris', local: { x: 0.32, y: 0 }, rx: 0.52, ry: 0.52, z: 'front', tint: 0xf4f8ff },
      { id: 'pupil', local: { x: 0.5, y: 0 }, rx: 0.24, ry: 0.24, z: 'front', tint: 0x0e0e18 },
    ],
    // A back-fanned ring of eyestalks (each ends in a small bulb of its own).
    tentacles: [
      stalk(130, 0.0),
      stalk(160, 0.9),
      stalk(180, 1.8),
      stalk(-160, 2.7),
      stalk(-130, 3.6),
    ],
    idle: { breatheAmp: 0.04, breatheFreq: 1.6 },
  };
}
