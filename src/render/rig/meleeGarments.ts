import type { Graphics } from 'pixi.js';
import type { Vec2 } from './math/vec';

type Point = (forward: number, side: number, height: number) => Vec2;

export function drawMeleeGarment(
  behind: Graphics,
  front: Graphics,
  at: Point,
  radius: number,
  style: 'paladin' | 'rogue',
  sway: number,
): void {
  const plate = (g: Graphics, points: [number, number, number][], color: number, edge: number) =>
    g
      .poly(
        points.flatMap(([f, s, h]) => {
          const p = at(f, s, h);
          return [p.x, p.y];
        }),
      )
      .fill({ color })
      .stroke({ color: edge, width: Math.max(0.8, radius * 0.065) });

  if (style === 'paladin') {
    const edge = 0x674b2d;
    for (const side of [-1, 1]) {
      plate(
        behind,
        [
          [-0.34, side * 0.68, 1.24],
          [-0.76, side * 0.59, 0.08],
          [-0.81, side * 0.13, 0.18],
          [-0.25, side * 0.12, 1.14],
        ],
        0x862c37,
        edge,
      );
      plate(
        front,
        [
          [0.35, side * 0.34, 1.13],
          [0.43, side * 0.43, 0.12],
          [0.4, side * 0.08, 0.2],
          [0.36, side * 0.07, 1.17],
        ],
        0xf4e1ac,
        edge,
      );
      plate(
        front,
        [
          [0.29, side * 0.36, 1.19],
          [-0.02, side * 0.94, 1.31],
          [-0.33, side * 1.04, 0.9],
          [0.35, side * 0.6, 0.93],
        ],
        0xd3a453,
        edge,
      );
    }
    plate(
      front,
      [
        [0.48, -0.39, 1.53],
        [0.39, -0.27, 2.12],
        [0.48, 0.03, 2.24],
        [0.48, 0.38, 2.05],
        [0.63, 0.31, 1.54],
        [0.74, 0, 1.38],
      ],
      0xffde91,
      edge,
    );
    plate(
      front,
      [
        [0.69, -0.23, 1.77],
        [0.78, 0, 1.85],
        [0.71, 0.23, 1.77],
        [0.75, 0, 1.64],
      ],
      0x42332b,
      edge,
    );
    return;
  }

  const edge = 0x292139;
  plate(
    behind,
    [
      [-0.22, -0.67, 1.39],
      [-0.93, -0.56 + sway, 0.54],
      [-1.02, 0.16 + sway, 0.75],
      [-0.33, 0.48, 1.21],
    ],
    0x594164,
    edge,
  );
  plate(
    front,
    [
      [0.36, -0.51, 1.12],
      [0.31, 0.52, 1.14],
      [-0.06, 0.41, 0.5],
      [0.38, -0.44, 0.55],
    ],
    0x63475c,
    edge,
  );
  plate(
    front,
    [
      [0.37, -0.5, 1.42],
      [-0.02, -0.33, 1.89],
      [0.39, 0, 2.0],
      [0.61, 0.41, 1.56],
      [0.42, 0.34, 1.24],
      [0.06, 0, 1.21],
    ],
    0x463452,
    edge,
  );
  plate(
    front,
    [
      [0.64, -0.28, 1.56],
      [0.72, 0.05, 1.62],
      [0.63, 0.32, 1.52],
      [0.62, 0.02, 1.41],
    ],
    0xb68983,
    edge,
  );
}

export function drawSunShield(g: Graphics, { x, y }: Vec2, r: number): void {
  const w = r * 0.58;
  const h = r * 0.75;
  g.poly([
    x - w,
    y - h * 0.8,
    x,
    y - h,
    x + w,
    y - h * 0.8,
    x + w * 0.78,
    y + h * 0.48,
    x,
    y + h,
    x - w * 0.78,
    y + h * 0.48,
  ])
    .fill({ color: 0x9d642f })
    .stroke({ color: 0xffda88, width: Math.max(1.2, r * 0.1) });
  g.circle(x, y - h * 0.1, r * 0.19).fill({ color: 0xffdf93 });
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    const dx = Math.cos(angle) * r;
    const dy = Math.sin(angle) * r;
    g.moveTo(x + dx * 0.25, y - h * 0.1 + dy * 0.25)
      .lineTo(x + dx * 0.36, y - h * 0.1 + dy * 0.36)
      .stroke({ color: 0xffe6aa, width: Math.max(0.8, r * 0.06) });
  }
}
