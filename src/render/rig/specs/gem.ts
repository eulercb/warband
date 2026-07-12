/**
 * Warband — gem rig: a floating undead relic (lich, archlich, wraith). A tall
 * faceted crystal core lit by an inner soul-glow, a forward crown facet with two
 * cold eyes, and a few spectral tatters drifting behind. No legs — it hovers, so
 * only the body breathes and the tatters drift.
 */
import type { RigSpec, TentacleSpec } from '../types';

function tatter(baseAngleDeg: number, segments: number, phase: number): TentacleSpec {
  return {
    anchorPart: 'core',
    baseAngleDeg,
    segments,
    segLen: 0.42,
    width: 0.15,
    sinAmp: 0.22, // drifts loosely, like a ragged spectral robe
    sinFreq: 0.95,
    phase,
    z: 'behind',
  };
}

export function buildGemSpec(): RigSpec {
  return {
    id: 'gem',
    parts: [
      { id: 'core', local: { x: 0, y: 0 }, rx: 0.92, ry: 1.15, z: 'main' },
      { id: 'crown', local: { x: 0.45, y: 0 }, rx: 0.5, ry: 0.55, z: 'front' },
      // An inner soul-glow floating in the core (violet-white, tinted not base).
      { id: 'heart', local: { x: 0, y: 0 }, rx: 0.42, ry: 0.5, z: 'front', tint: 0xbfa8ff },
    ],
    tentacles: [tatter(150, 4, 0.0), tatter(-150, 4, 1.3), tatter(180, 5, 2.6)],
    decor: [
      // A bright rhombus facet on the core reinforces the gem read.
      { kind: 'marking', anchorPart: 'core', local: { x: 0, y: 0 }, scale: 0.72, color: 0xece0ff },
      {
        kind: 'eyes',
        anchorPart: 'crown',
        local: { x: 0.12, y: 0 },
        scale: 0.12,
        color: 0x8affff,
        count: 2,
      },
    ],
    idle: { breatheAmp: 0.035, breatheFreq: 1.4 },
  };
}
