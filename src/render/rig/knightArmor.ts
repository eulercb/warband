import type { Graphics } from 'pixi.js';
import type { Vec2 } from './math/vec';

/** Steel plate, heraldry and a raised visor. Shapes are independent of floor reach. */
export function drawKnightArmor(
  g: Graphics,
  point: (forward: number, lateral: number, height: number) => Vec2,
  radius: number,
): void {
  const plate = (vertices: readonly (readonly [number, number, number])[], color: number) =>
    g
      .poly(
        vertices.flatMap(([x, y, h]) => {
          const p = point(x, y, h);
          return [p.x, p.y];
        }),
      )
      .fill({ color })
      .stroke({ color: 0x252c39, width: Math.max(0.9, radius * 0.075) });

  plate(
    [
      [0.18, -0.84, 1.03],
      [0.37, -0.58, 1.19],
      [0.44, 0.54, 1.19],
      [0.12, 0.83, 1.03],
      [-0.22, 0.53, 0.32],
      [-0.28, -0.52, 0.32],
    ],
    0x74838f,
  );
  plate(
    [
      [0.27, -0.29, 0.97],
      [0.39, 0.26, 0.97],
      [0.27, 0.2, 0.42],
      [-0.01, -0.14, 0.45],
    ],
    0x355484,
  );
  for (const side of [-1, 1]) {
    plate(
      [
        [0.29, side * 0.62, 1.23],
        [-0.06, side * 1.0, 1.18],
        [-0.21, side * 1.13, 0.75],
        [0.27, side * 0.68, 0.81],
      ],
      side < 0 ? 0x8796a1 : 0xb7c5c8,
    );
  }
  plate(
    [
      [0.15, -0.38, 1.34],
      [0.47, -0.4, 1.97],
      [0.83, 0, 2.12],
      [0.57, 0.43, 1.94],
      [0.75, 0.32, 1.37],
      [0.43, 0, 1.25],
    ],
    0xb3c0c5,
  );
  plate(
    [
      [0.5, -0.28, 1.72],
      [0.83, 0, 1.77],
      [0.59, 0.3, 1.68],
      [0.62, 0, 1.61],
    ],
    0x303b4b,
  );
  plate(
    [
      [0.29, -0.1, 1.97],
      [0.12, -0.13, 2.41],
      [-0.39, -0.08, 2.2],
      [0.2, 0.16, 1.97],
    ],
    0x527bb5,
  );
}

export function drawKnightShield(g: Graphics, { x, y }: Vec2, r: number, guard: number): void {
  const w = r * (0.26 + 0.44 * guard);
  const h = r * (0.58 + 0.13 * guard);
  g.poly([
    x - w,
    y - h,
    x + w,
    y - h,
    x + w * 0.87,
    y + h * 0.32,
    x,
    y + h,
    x - w * 0.87,
    y + h * 0.32,
  ])
    .fill({ color: 0x304e75 })
    .stroke({ color: 0xbac6cb, width: Math.max(1, r * 0.095) });
  g.moveTo(x, y - h * 0.77)
    .lineTo(x, y + h * 0.68)
    .stroke({ color: 0x819cb7, width: Math.max(0.8, r * 0.07) });
  g.circle(x, y - h * 0.14, r * 0.12).fill({ color: 0xd6b671 });
}
