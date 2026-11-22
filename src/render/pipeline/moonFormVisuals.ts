/** Temporary Moon Bear art. Paws stay on the original ground anchor. */
import type { Graphics } from 'pixi.js';
import type { PlayerView, Vec2 } from '../../engine/core/types';
import { animalPaw, type AnimalMotion } from './animalMotion';

export function drawMoonBear(
  g: Graphics,
  p: PlayerView,
  screen: Vec2,
  scale: number,
  time = 0,
  motion?: AnimalMotion,
): void {
  const r = Math.max(11, 24 * scale);
  const facing = Math.atan2(p.aim.y, p.aim.x);
  const c = Math.cos(facing);
  const s = Math.sin(facing);
  const at = (x: number, y: number, h = 0): [number, number] => [
    screen.x + (x * c - y * s) * r,
    screen.y + ((x * s + y * c) * 0.63 - h) * r,
  ];
  const outline = 0x27243e;
  const body = (x: number, y: number, h: number, rx: number, ry: number, color: number) =>
    g
      .ellipse(...at(x, y, h), rx * r, ry * r)
      .fill({ color })
      .stroke({ color: outline, width: Math.max(1, r * 0.065) });
  const breathe = Math.sin(time * 3) * 0.035;

  g.ellipse(screen.x, screen.y + r * 0.16, r * 1.16, r * 0.57).fill({
    color: 0x080917,
    alpha: 0.55,
  });
  for (const [i, side] of [-1, 1].entries()) {
    for (const [j, fore] of [-0.62, 0.52].entries()) {
      const step = animalPaw(motion, (i + j) * Math.PI, 54);
      const foot = at(fore + step * 0.2, side * 0.54, Math.max(0, step) * 0.17);
      const shoulder = at(fore, side * 0.36, 0.52);
      g.moveTo(...shoulder)
        .lineTo(...foot)
        .stroke({ color: side < 0 ? 0x3f3a56 : 0x5e5276, width: r * 0.31, cap: 'round' });
      g.ellipse(...foot, r * 0.22, r * 0.14)
        .fill({ color: 0xa799bb })
        .stroke({ color: outline, width: Math.max(1, r * 0.05) });
    }
  }
  body(-0.55, 0, 0.56 + breathe, 0.62, 0.51, 0x514965);
  body(0.1, 0, 0.73 + breathe, 0.74, 0.62, 0x79698c);
  body(0.36, 0, 0.81 + breathe, 0.61, 0.51, 0x9282a8);
  for (const side of [-1, 1]) {
    body(0.68, side * 0.4, 1.12, 0.2, 0.19, 0x746484);
    body(0.7, side * 0.41, 1.12, 0.1, 0.09, 0xaca0be);
  }
  body(0.78, 0, 0.83, 0.45, 0.38, 0x9a8bad);
  body(1.04, 0, 0.64, 0.29, 0.2, 0xd3c5df);
  g.circle(...at(1.24, 0, 0.67), r * 0.11).fill({ color: 0x231b31 });
  for (const side of [-1, 1])
    g.circle(...at(0.91, side * 0.23, 0.89), Math.max(1, r * 0.065)).fill({ color: 0xffe6a3 });

  const [mx, my] = at(-0.27, 0, 1.0);
  g.moveTo(mx + Math.cos(0.45) * r * 0.28, my + Math.sin(0.45) * r * 0.28)
    .arc(mx, my, r * 0.28, 0.45, Math.PI * 1.65)
    .stroke({ color: 0xffdda0, width: Math.max(1.6, r * 0.1), cap: 'round' });
}
