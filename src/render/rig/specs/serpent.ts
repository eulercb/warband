/**
 * Warband — serpent rig. A shaded head plus a distance-constrained follow chain
 * of tapered segments that lag (ease < 1) and carry a lateral sine, so the body
 * slithers even when travelling straight. No legs; facing from the view.
 */
import type { RigSpec } from '../types';

export function buildSerpentSpec(): RigSpec {
  return {
    id: 'serpent',
    parts: [{ id: 'head', local: { x: 0.15, y: 0 }, rx: 0.95, ry: 0.78, z: 'main' }],
    spine: {
      segments: 11,
      spacing: 0.62,
      ease: 0.35, // lag → sinuous follow
      rx: 0.82,
      ry: 0.7,
      taper: 0.24, // tail shrinks to ~1/4 of the head-end segment
      sinAmp: 0.22,
      sinFreq: 3.2,
    },
    decor: [
      {
        kind: 'eyes',
        anchorPart: 'head',
        local: { x: 0.4, y: 0 },
        scale: 0.14,
        color: 0xf2d24a,
        count: 2,
      },
    ],
    idle: { breatheAmp: 0.015, breatheFreq: 2.2 },
  };
}
