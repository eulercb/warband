import type { Graphics } from 'pixi.js';
import type { Vec2 } from './math/vec';

type GearPoint = (forward: number, side?: number) => Vec2;

export function drawGreatAxe(g: Graphics, at: GearPoint, r: number): void {
  const face = (points: [number, number][], color: number, edge?: number) =>
    g
      .poly(
        points.flatMap(([x, y]) => {
          const p = at(x, y);
          return [p.x, p.y];
        }),
      )
      .fill({ color })
      .stroke({ color: edge ?? 0x33252a, width: Math.max(0.85, r * 0.07) });
  const tail = at(-0.88),
    tip = at(1.86);
  g.moveTo(tail.x, tail.y)
    .lineTo(tip.x, tip.y)
    .stroke({ color: 0x34272b, width: r * 0.26, cap: 'round' });
  g.moveTo(tail.x, tail.y)
    .lineTo(tip.x, tip.y)
    .stroke({ color: 0xb47b4d, width: r * 0.14, cap: 'round' });
  face(
    [
      [1.04, -0.29],
      [1.77, -0.26],
      [1.84, 0.25],
      [1.12, 0.34],
    ],
    0x777984,
  );
  face(
    [
      [1.18, 0.13],
      [1.53, 0.17],
      [1.91, 0.67],
      [1.98, 0.94],
      [1.54, 1.15],
      [0.71, 1.0],
      [0.66, 0.7],
      [0.99, 0.52],
    ],
    0xa8adb3,
  );
  face(
    [
      [1.91, 0.67],
      [1.98, 0.94],
      [1.54, 1.15],
      [0.71, 1.0],
      [0.66, 0.7],
      [1.16, 0.94],
      [1.58, 0.94],
    ],
    0xf0dde0,
  );
  for (const x of [-0.33, -0.15, 0.06])
    face(
      [
        [x, -0.15],
        [x + 0.07, -0.15],
        [x + 0.12, 0.15],
        [x + 0.04, 0.15],
      ],
      0xd1ab7b,
    );
}

export function drawBardLute(
  g: Graphics,
  neck: Vec2,
  strum: Vec2,
  r: number,
  showHand = true,
): void {
  const body = { x: strum.x + r * 0.13, y: strum.y + r * 0.16 };
  g.moveTo(body.x, body.y)
    .lineTo(neck.x, neck.y)
    .stroke({ color: 0x482b37, width: r * 0.31, cap: 'round' });
  g.moveTo(body.x, body.y)
    .lineTo(neck.x, neck.y)
    .stroke({ color: 0xe7b27a, width: r * 0.14, cap: 'round' });
  g.ellipse(body.x, body.y, r * 0.49, r * 0.58)
    .fill({ color: 0xb46a56 })
    .stroke({ color: 0x492638, width: Math.max(0.85, r * 0.08) });
  g.ellipse(body.x + r * 0.04, body.y - r * 0.11, r * 0.32, r * 0.36).fill({ color: 0xe3a46c });
  g.circle(body.x, body.y - r * 0.14, r * 0.13).fill({ color: 0x62404a });
  for (const offset of [-0.055, 0.055])
    g.moveTo(neck.x + r * offset, neck.y)
      .lineTo(body.x + r * offset, body.y + r * 0.24)
      .stroke({ color: 0xffdba1, width: Math.max(0.55, r * 0.035) });
  if (showHand) g.circle(strum.x, strum.y, r * 0.13).fill({ color: 0xe0ad86 });
}

export function drawStaffCrown(
  g: Graphics,
  at: GearPoint,
  length: number,
  r: number,
  style: 'druid' | 'sorcerer' | 'warlock',
): void {
  const points = (shape: [number, number][]) =>
    shape.flatMap(([f, s]) => {
      const p = at(length + f, s);
      return [p.x, p.y];
    });
  if (style === 'druid') {
    for (const side of [-1, 1])
      g.poly(
        points([
          [-0.35, 0],
          [-0.05, side * 0.43],
          [0.51, side * 0.37],
          [0.31, side * 0.13],
        ]),
      )
        .fill({ color: side > 0 ? 0xb6c76d : 0x719d56 })
        .stroke({ color: 0x405436, width: Math.max(0.8, r * 0.07) });
    return;
  }
  if (style === 'sorcerer') {
    g.poly(
      points([
        [0.47, 0],
        [0.03, 0.35],
        [-0.42, 0],
        [0.03, -0.35],
      ]),
    )
      .fill({ color: 0xd580ae })
      .stroke({ color: 0xf5bc98, width: Math.max(1, r * 0.08) });
    g.poly(
      points([
        [0.43, 0],
        [0.03, 0.15],
        [-0.28, 0],
        [0.04, -0.18],
      ]),
    ).fill({ color: 0xffdec2 });
    return;
  }
  g.poly(
    points([
      [-0.43, -0.12],
      [-0.23, -0.47],
      [0.28, -0.39],
      [-0.03, -0.13],
      [0.13, 0.14],
      [0.4, 0.33],
      [-0.19, 0.43],
      [-0.43, 0.17],
    ]),
  )
    .fill({ color: 0x675275 })
    .stroke({ color: 0xa98699, width: Math.max(1, r * 0.085) });
  const eye = at(length + 0.13);
  g.circle(eye.x, eye.y, r * 0.16).fill({ color: 0xbbd88e });
}
