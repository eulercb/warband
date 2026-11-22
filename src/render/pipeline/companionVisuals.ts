/** A small spirit-wolf silhouette, separate from hero/bot bodies and enemy status rings. */
import { sub } from '../../engine/core/torus';
import {
  blendAnimalFacing,
  strikeProgress,
  type AnimalMotion,
  type AnimalStrike,
} from './animalMotion';
import type { Graphics } from 'pixi.js';
import type { SpiritCompanionView, Vec2 } from '../../engine/core/types';
export function drawCompanion(
  g: Graphics,
  pet: SpiritCompanionView,
  screen: Vec2,
  scale: number,
  sizeScale = 1,
  stride?: (slot: number, pos: Vec2, facing: number) => AnimalMotion,
  slot = 0,
  attack?: (slot: number) => AnimalStrike | undefined,
  now = 0,
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
      attack,
      now,
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
  const strike = attack?.(slot);
  const progress = strikeProgress(strike, now, 340);
  const snap = Math.pow(1 - progress, 0.6);
  const motion = stride?.(slot, pet.pos, pet.facing);
  const heading = motion?.facing ?? pet.facing;
  const facing = strike
    ? blendAnimalFacing(heading, strike.angle, Math.min(1, snap * 2.5))
    : heading;
  const c = Math.cos(facing);
  const s = Math.sin(facing);
  const phase = motion?.phase ?? 0;
  const weight = (motion?.stride ?? 0) * (1 - snap * 0.65);
  const bound = Math.min(1, Math.max(0, ((motion?.speed ?? 0) - 210) / 300));
  const windup = pet.attacking ? 0.1 : 0;
  const bob = Math.cos(phase * 2) * weight * (0.045 + bound * 0.12) - windup;
  const at = (x: number, y: number, h = 0): [number, number] => [
    screen.x + (x * c - y * s) * size,
    screen.y + ((x * s + y * c) * 0.66 - h) * size,
  ];
  const width = Math.max(0.75, size * 0.075);
  const coat = 0x488d91;
  const edge = 0x183c4b;
  const poly = (points: readonly (readonly [number, number, number])[], color: number) =>
    g
      .poly(points.flatMap(([x, y, h]) => at(x, y, h)))
      .fill({ color })
      .stroke({ color: edge, width });
  const oval = (x: number, y: number, h: number, rx: number, ry: number, color: number) =>
    g
      .ellipse(...at(x, y, h), size * rx, size * ry)
      .fill({ color })
      .stroke({ color: edge, width });
  const color = pet.bondReady ? 0xffdc79 : 0x7ae7ce;
  g.ellipse(screen.x, screen.y + size * 0.22, size * 1.15, size * 0.45).fill({
    color: 0x071d22,
    alpha: 0.45,
  });
  const far = c >= 0 ? -1 : 1;
  for (const side of [far, -far]) {
    for (const fore of [-0.62, 0.47]) {
      const lead = fore > 0;
      const offset = (lead ? Math.PI : 0) + (side < 0 ? Math.PI * (1 - 0.78 * bound) : 0);
      const step = Math.cos(phase + offset) * weight;
      const lift = Math.max(0, Math.sin(phase + offset)) * weight;
      const foot = at(
        fore + step * (0.22 + bound * 0.35) + (lead ? snap * 0.36 : 0),
        side * 0.39,
        lift * (0.2 + bound * 0.15) + (lead ? snap * 0.26 : 0),
      );
      g.moveTo(...at(fore, side * 0.27, 0.59 + bob))
        .lineTo(...foot)
        .stroke({ color: side === far ? 0x3b807f : 0xa0ded0, width: size * 0.19, cap: 'round' });
    }
  }
  const tail = () =>
    poly(
      [
        [-0.59, -0.13, 0.65 + bob],
        [-1.13, -0.12, 0.64 + bob],
        [-1.66, Math.sin(phase) * weight * 0.14, 0.38 + bob],
        [-1.05, 0.19, 0.43 + bob],
      ],
      0x3d7d80,
    );
  const head = () => {
    const reach = snap * 0.36;
    const height = bob + snap * 0.19;
    for (const side of [far, -far]) {
      poly(
        [
          [0.57, side * 0.31, 0.86 + height],
          [0.53, side * 0.38, 1.46 + height],
          [0.91, side * 0.19, 0.96 + height],
        ],
        side === far ? 0x6eaa9f : 0xa7d7cf,
      );
    }
    oval(0.82 + reach, 0, 0.83 + height, 0.36, 0.29, 0xa7d7cf);
    const front = Math.max(0, s);
    if (front + Math.abs(c) > 0.32) {
      if (snap > 0.2) oval(1.22 + reach, 0, 0.52 + bob, 0.22, 0.13, 0x24444d);
      oval(1.17 + reach, 0, 0.66 + height, 0.17 + front * 0.09, 0.13, 0x659899);
      g.circle(...at(1.34 + reach, 0, 0.67 + height), size * 0.09).fill({ color: 0x112d36 });
      g.circle(...at(0.96 + reach, -far * 0.23, 0.89 + height), size * 0.073).fill({
        color: 0xffe0a0,
      });
      if (front > 0.76)
        g.circle(...at(0.96 + reach, far * 0.23, 0.89 + height), size * 0.073).fill({
          color: 0xffe0a0,
        });
    }
  };
  if (s >= -0.45) tail();
  else head();
  oval(-0.48, 0, 0.65 + bob, 0.49, 0.32, coat);
  oval(0.09, 0, 0.7 + bob, 0.56, 0.38, 0x6eb1a9);
  oval(0.44, 0, 0.77 + bob, 0.37, 0.36, 0x83bdb5);
  if (s >= -0.45) head();
  else tail();
  if (pet.attacking)
    g.circle(screen.x, screen.y, size * 1.65).stroke({ color, width: 2, alpha: 0.7 });
  if (pet.bondReady)
    g.circle(...at(-0.25, 0, 0.95), size * 0.22).fill({ color: 0xffffff, alpha: 0.9 });
}
