import type { Graphics } from 'pixi.js';
import type { Vec2 } from './math/vec';

type Point = (forward: number, side: number, height: number) => Vec2;

export function drawMeleeGarment(
  behind: Graphics,
  front: Graphics,
  at: Point,
  radius: number,
  style: 'paladin' | 'rogue' | 'monk' | 'barbarian',
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

  if (style === 'monk') {
    const edge = 0x3f3456;
    for (const side of [-1, 1]) {
      plate(
        behind,
        [
          [-0.16, side * 0.55, 1.16],
          [-0.63, side * 0.43 + sway, 0.41],
          [-0.44, side * 0.09, 0.28],
          [0.08, side * 0.18, 1.09],
        ],
        0x4f5777,
        edge,
      );
    }
    plate(
      front,
      [
        [0.28, -0.63, 1.16],
        [0.41, 0.65, 1.05],
        [0.29, 0.39, 0.52],
        [0.32, -0.33, 0.51],
      ],
      0xb6a7c8,
      edge,
    );
    plate(
      front,
      [
        [0.37, -0.37, 1.13],
        [0.48, -0.24, 1.15],
        [0.47, 0.48, 0.66],
        [0.33, 0.36, 0.59],
      ],
      0xe9d6ad,
      edge,
    );
    plate(
      front,
      [
        [0.48, -0.41, 0.64],
        [0.48, 0.43, 0.64],
        [0.46, 0.34, 0.47],
        [0.43, -0.3, 0.49],
      ],
      0x6b536e,
      edge,
    );
    plate(
      front,
      [
        [0.51, -0.36, 0.59],
        [0.49, -0.15, 0.59],
        [0.38, -0.27 + sway, 0.12],
        [0.46, -0.48 + sway, 0.2],
      ],
      0x5f7785,
      edge,
    );
    plate(
      behind,
      [
        [-0.28, 0.21, 0.87],
        [-0.22, 0.47, 0.81],
        [-0.89, 0.79 + sway, 0.24],
        [-0.65, 0.29 + sway, 0.36],
      ],
      0x9f778a,
      edge,
    );
    const head = at(0.51, 0, 1.74);
    front
      .ellipse(head.x, head.y, radius * 0.38, radius * 0.4)
      .fill({ color: 0xd7a079 })
      .stroke({ color: edge, width: Math.max(0.8, radius * 0.065) });
    return;
  }
  if (style === 'barbarian') {
    const edge = 0x492b26;
    plate(
      behind,
      [
        [-0.29, -0.95, 1.34],
        [-0.87, -0.82 + sway, 0.46],
        [-0.89, 0.78 + sway, 0.37],
        [-0.03, 0.91, 1.35],
      ],
      0x63382e,
      edge,
    );
    plate(
      front,
      [
        [0.28, -1.03, 1.2],
        [-0.22, -0.88, 1.44],
        [0.25, -0.22, 1.53],
        [0.5, 0.59, 1.06],
        [0.45, 0.41, 0.87],
        [0.38, -0.42, 1.04],
      ],
      0xa57851,
      edge,
    );
    plate(
      front,
      [
        [0.34, -0.6, 0.59],
        [0.39, 0.58, 0.61],
        [0.32, 0.49, 0.22],
        [0.26, -0.54, 0.18],
      ],
      0x754637,
      edge,
    );
    plate(
      front,
      [
        [0.49, -0.46, 1.61],
        [0.45, -0.35, 2.08],
        [0.51, 0.27, 2.11],
        [0.68, 0.44, 1.66],
        [0.68, 0.16, 1.38],
        [0.68, -0.2, 1.4],
      ],
      0xd39067,
      edge,
    );
    plate(
      front,
      [
        [0.62, -0.34, 1.62],
        [0.66, 0.28, 1.65],
        [0.65, 0.14, 1.32],
        [0.62, -0.17, 1.29],
      ],
      0x6d3830,
      edge,
    );
    plate(
      front,
      [
        [0.11, -1.13, 1.26],
        [0.43, -0.82, 1.57],
        [0.65, -0.43, 1.36],
        [0.48, -0.22, 1.04],
        [0.38, -0.44, 1.11],
        [0.3, -0.56, 0.91],
        [0.22, -0.73, 1.05],
        [0.07, -0.92, 0.91],
      ],
      0xd5a16a,
      edge,
    );
    plate(
      front,
      [
        [0.44, -0.67, 0.63],
        [0.58, 0.62, 0.63],
        [0.53, 0.54, 0.48],
        [0.4, -0.59, 0.48],
      ],
      0xab6a46,
      edge,
    );
    const clasp = at(0.63, 0.13, 0.58);
    front
      .circle(clasp.x, clasp.y, radius * 0.15)
      .fill({ color: 0xd7b77d })
      .stroke({ color: edge, width: Math.max(0.75, radius * 0.06) });
    return;
  }

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
