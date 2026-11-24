import type { Graphics } from 'pixi.js';
import type { Vec2 } from './math/vec';
import type { PlayerView } from '../../engine/core/types';

/** Clearance for the standing Mage hood, in world units. */
export function playerVisualHeadroom(p: PlayerView, baseline: number): number {
  if (p.form === 'moonBear' && p.state === 'alive') return baseline * 1.62;
  return (p.classId === 'mage' ||
    p.classId === 'knight' ||
    p.classId === 'paladin' ||
    p.classId === 'rogue' ||
    p.classId === 'monk' ||
    p.classId === 'barbarian') &&
    !p.form &&
    p.state === 'alive'
    ? baseline * (p.classId === 'knight' ? 2.55 : 2.34)
    : baseline;
}

type BodyPoint = (forward: number, lateral: number, height?: number) => Vec2;

/** A split silhouette with broad cloth panels and readable trim at arena scale. */
export function drawMageGarment(
  behind: Graphics,
  front: Graphics,
  at: BodyPoint,
  radius: number,
  drift: number,
  release: number,
): void {
  const panel = (
    g: Graphics,
    points: readonly (readonly [number, number, number?])[],
    fill: number,
    trim: number,
  ) => {
    const polygon = g.poly(
      points.flatMap(([x, y, height]) => {
        const point = at(x, y, height);
        return [point.x, point.y];
      }),
    );
    polygon.fill({ color: fill }).stroke({ color: trim, width: Math.max(0.75, radius * 0.075) });
  };

  for (const side of [-1, 1]) {
    panel(
      behind,
      [
        [0.28, side * 0.73, 0.96],
        [-0.65, side * 0.96, 0.63],
        [-1.67 - release * 0.82, side * (0.78 + release * 0.35) + drift, 0.09],
        [-1.87 - release * 0.55, side * 0.26 + drift, 0.12],
        [-0.56, side * 0.15, 0.47],
      ],
      side < 0 ? 0x29264f : 0x403669,
      0x191a32,
    );
    panel(
      behind,
      [
        [-0.55, side * 0.77, 0.7],
        [-1.56 - release * 0.62, side * 0.73 + drift, 0.14],
        [-1.64, side * 0.58 + drift],
      ],
      0x9c7a5f,
      0x9c7a5f,
    );
  }

  panel(
    front,
    [
      [0.38, -0.64, 1.13],
      [0.18, -1.04, 0.93],
      [-0.45, -0.65, 0.17],
      [-0.55, 0.54, 0.16],
      [0.18, 1.04, 0.91],
      [0.38, 0.57, 1.13],
      [0.3, 0, 0.75],
    ],
    0x605481,
    0xe2ba84,
  );
  panel(
    front,
    [
      [0.25, -0.47, 1.09],
      [0.63, -0.47, 1.65],
      [0.14, 0, 2.18],
      [0.63, 0.47, 1.65],
      [0.25, 0.47, 1.09],
    ],
    0x352b50,
    0xb699c7,
  );
  panel(
    front,
    [
      [0.67, -0.29, 1.56],
      [0.83, -0.21, 1.24],
      [0.92, 0, 1.17],
      [0.83, 0.21, 1.24],
      [0.67, 0.29, 1.56],
    ],
    0xe0b994,
    0x655063,
  );
  panel(
    front,
    [
      [0.46, 0, 0.86],
      [0.47, 0.14, 0.66],
      [0.52, 0, 0.51],
      [0.47, -0.14, 0.66],
    ],
    0xa3e2e1,
    0x362d52,
  );
}
