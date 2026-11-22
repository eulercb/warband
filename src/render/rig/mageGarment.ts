import type { Graphics } from 'pixi.js';
import type { Vec2 } from './math/vec';

type BodyPoint = (forward: number, lateral: number) => Vec2;

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
    points: readonly (readonly [number, number])[],
    fill: number,
    trim: number,
  ) => {
    const polygon = g.poly(
      points.flatMap(([x, y]) => {
        const point = at(x, y);
        return [point.x, point.y];
      }),
    );
    polygon.fill({ color: fill }).stroke({ color: trim, width: Math.max(0.75, radius * 0.075) });
  };

  for (const side of [-1, 1]) {
    panel(
      behind,
      [
        [0.28, side * 0.73],
        [-0.65, side * 0.96],
        [-1.67 - release * 0.15, side * 0.78 + drift],
        [-1.87, side * 0.26 + drift],
        [-0.56, side * 0.15],
      ],
      side < 0 ? 0x29264f : 0x403669,
      0x191a32,
    );
    panel(
      behind,
      [
        [-0.55, side * 0.77],
        [-1.56, side * 0.73 + drift],
        [-1.64, side * 0.58 + drift],
      ],
      0x9c7a5f,
      0x9c7a5f,
    );
  }

  panel(
    front,
    [
      [0.47, -0.51],
      [0.22, -0.98],
      [-0.41, -0.7],
      [-0.62, 0],
      [-0.41, 0.7],
      [0.22, 0.98],
      [0.47, 0.51],
      [-0.06, 0],
    ],
    0x625183,
    0xc6a379,
  );
  panel(
    front,
    [
      [0.69, -0.47],
      [0.94, -0.24],
      [0.96, 0.24],
      [0.69, 0.47],
      [0.15, 0],
    ],
    0x302741,
    0x9b7eae,
  );
  panel(
    front,
    [
      [0.88, -0.22],
      [1.04, -0.15],
      [1.04, 0.15],
      [0.88, 0.22],
    ],
    0xe1b893,
    0x5b3d44,
  );
  panel(
    front,
    [
      [0.02, 0],
      [-0.13, 0.13],
      [-0.29, 0],
      [-0.13, -0.13],
    ],
    0xa3e2e1,
    0x362d52,
  );
}
