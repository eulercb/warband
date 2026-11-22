/** A small spirit-wolf silhouette, separate from hero/bot bodies and enemy status rings. */
import { sub } from '../../engine/core/torus';
import { animalPaw, type AnimalMotion } from './animalMotion';
import type { Graphics } from 'pixi.js';
import type { SpiritCompanionView, Vec2 } from '../../engine/core/types';
export function drawCompanion(
  g: Graphics,
  pet: SpiritCompanionView,
  screen: Vec2,
  scale: number,
  sizeScale = 1,
  stride?: (slot: number, pos: Vec2) => AnimalMotion,
  slot = 0,
): void {
  for (const [i, wolf] of (pet.flankers ?? []).entries()) {
    const d = sub(wolf.pos, pet.pos);
    drawCompanion(
      g,
      { ...wolf, bondReady: false },
      { x: screen.x + d.x * scale, y: screen.y + d.y * scale },
      scale,
      0.65,
      stride,
      i + 1,
    );
  }
  if (pet.quarry) {
    const q = pet.quarry,
      d = sub(q.pos, pet.pos);
    const x = screen.x + d.x * scale,
      y = screen.y + d.y * scale;
    const radius = (q.radius + 12) * scale;
    g.moveTo(screen.x, screen.y).lineTo(x, y).stroke({ color: 0x7ae7ce, width: 1.5, alpha: 0.4 });
    g.circle(x, y, radius).stroke({ color: 0x7ae7ce, width: 1, alpha: 0.4 });
    g.moveTo(x, y - radius - 4)
      .arc(
        x,
        y,
        radius + 4,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, q.remaining / q.duration)),
      )
      .stroke({ color: 0xffdc79, width: 3, alpha: 0.9 });
    g.poly([x - 7, y - radius - 8, x, y - radius - 2, x + 7, y - radius - 8]).stroke({
      color: 0xffdc79,
      width: 2,
      alpha: 1,
    });
  }
  const size = Math.max(7, 14 * scale) * sizeScale;
  const c = Math.cos(pet.facing);
  const s = Math.sin(pet.facing);
  const motion = stride?.(slot, pet.pos);
  const lean = pet.attacking ? 0.13 : 0;
  const at = (x: number, y: number, h = 0): [number, number] => [
    screen.x + (x * c - y * s) * size,
    screen.y + ((x * s + y * c) * 0.66 - h) * size,
  ];
  const poly = (points: readonly (readonly [number, number, number])[], color: number) =>
    g
      .poly(points.flatMap(([x, y, h]) => at(x, y, h)))
      .fill({ color })
      .stroke({ color: 0x183c4b, width: Math.max(0.75, size * 0.08) });
  const color = pet.bondReady ? 0xffdc79 : 0x7ae7ce;
  g.ellipse(screen.x, screen.y + size * 0.22, size * 1.15, size * 0.45).fill({
    color: 0x071d22,
    alpha: 0.45,
  });
  for (const [i, side] of [-1, 1].entries()) {
    for (const [j, fore] of [-0.59, 0.44].entries()) {
      const step = animalPaw(motion, (i + j) * Math.PI, 37);
      const foot = at(fore + step * 0.31, side * 0.4, Math.max(0, step) * 0.25);
      g.moveTo(...at(fore, side * 0.25, 0.53))
        .lineTo(...foot)
        .stroke({
          color: side < 0 ? 0x3b807f : 0x93d9cd,
          width: Math.max(1, size * 0.17),
          cap: 'round',
        });
    }
  }
  poly(
    [
      [-0.65, -0.08, 0.6],
      [-1.09, -0.35, 0.9],
      [-1.7, -0.22, 0.58],
      [-1.05, 0.08, 0.42],
    ],
    0x3d7d80,
  );
  poly(
    [
      [-0.93, -0.34, 0.58],
      [-0.54, -0.41, 0.88],
      [0.45, -0.36, 0.93],
      [0.7, 0.09, 0.73],
      [0.36, 0.41, 0.5],
      [-0.47, 0.34, 0.48],
    ],
    0x488d91,
  );
  poly(
    [
      [-0.56, -0.29, 0.89],
      [0.56, -0.34, 0.98],
      [0.62, 0.15, 0.85],
      [-0.58, 0.14, 0.76],
    ],
    0x84beb9,
  );
  poly(
    [
      [0.41, -0.3, 0.82],
      [0.47, -0.34, 1.43],
      [0.76, -0.12, 1.06],
      [0.83, 0.24, 1.38],
      [1.02, 0.31, 0.94],
      [1.48 + lean, 0.05, 0.64],
      [0.94, 0.29, 0.66],
    ],
    0xa7d7cf,
  );
  poly(
    [
      [0.78, -0.16, 0.87],
      [1.12, -0.12, 0.73],
      [1.48 + lean, 0.05, 0.64],
      [1.11, 0.24, 0.61],
    ],
    0x37636f,
  );
  for (const side of [-1, 1])
    g.circle(...at(0.97, side * 0.15, 0.94), Math.max(0.75, scale * 1.2)).fill({ color: 0xffe0a0 });
  g.circle(...at(1.46 + lean, 0.05, 0.67), Math.max(1, scale * 1.7)).fill({ color: 0x112d36 });
  if (pet.attacking)
    g.circle(screen.x, screen.y, size * 1.65).stroke({ color, width: 2, alpha: 0.7 });
  if (pet.bondReady) {
    g.circle(...at(-0.25, 0, 0.95), size * 0.22).fill({ color: 0xffffff, alpha: 0.9 });
  }
}
