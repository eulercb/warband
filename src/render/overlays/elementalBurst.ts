import type { Graphics } from 'pixi.js';
import type { Vec2 } from '../../engine/core/types';

type Point = readonly [number, number];
type RadialPoint = (angle: number, distance: number) => Point;

/** Elemental silhouettes share the real radius and keep their ground accents inside it. */
export function drawElementalBurst(
  g: Graphics,
  center: Vec2,
  radius: number,
  t: number,
  ice: boolean,
  heading = 0,
): void {
  const at: RadialPoint = (angle, distance) => [
    center.x + Math.cos(angle) * radius * distance,
    center.y + Math.sin(angle) * radius * distance,
  ];
  if (ice) drawRime(g, at, radius, t);
  else drawCombustion(g, at, radius, t, heading);
}

function drawRime(g: Graphics, at: RadialPoint, radius: number, time: number): void {
  const fade = (1 - time) ** 1.65;
  const spread = 0.43 + 0.57 * Math.min(1, time * 5.5);

  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    // Low rime at full reach on the hit frame, without a connecting outline.
    const bend = 0.08 + (i % 3) * 0.025;
    g.poly([
      ...at(a, 1),
      ...at(a + bend, 0.89),
      ...at(a - bend * 0.2, 0.79),
      ...at(a - bend, 0.91),
    ]).fill({ color: 0x9dd9ea, alpha: fade * 0.32 });
  }

  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 + 0.035;
    const tip = spread * (0.9 + (i % 3) * 0.03);
    const tipPoint = at(a, tip);
    const root = at(a, 0.1);
    g.poly([
      ...root,
      ...at(a - 0.17, spread * 0.6),
      ...tipPoint,
      ...at(a + 0.11, spread * 0.66),
    ]).fill({ color: 0x54839c, alpha: fade * 0.8 });
    g.poly([...root, ...tipPoint, ...at(a + 0.11, spread * 0.66)]).fill({
      color: 0xc3f1f4,
      alpha: fade * 0.88,
    });
    for (const side of [-1, 1]) {
      const angle = a + side * 0.23;
      g.poly([
        ...at(a, spread * 0.49),
        ...at(angle, spread * 0.82),
        ...at(angle - side * 0.07, spread * 0.6),
      ]).fill({ color: 0x81b9d4, alpha: fade * 0.73 });
    }
    const [x, y] = at(a + 0.19, 0.61 + time * 0.29);
    g.rect(x, y, Math.min(2, radius * 0.024), Math.min(2, radius * 0.024)).fill({
      color: 0xe0faff,
      alpha: fade * 0.76,
    });
  }
}

function drawCombustion(
  g: Graphics,
  at: RadialPoint,
  radius: number,
  time: number,
  heading: number,
): void {
  const fade = (1 - time) ** 1.5;
  const push = 0.29 + 0.57 * Math.min(1, time * 2.9);
  for (let i = 0; i < 9; i++) {
    const a = heading + (i * 2 * Math.PI) / 9 + Math.sin(i * 2.31) * 0.12;
    g.poly([
      ...at(a - 0.07, 0.83),
      ...at(a, 1),
      ...at(a + 0.032, 0.92),
      ...at(a + 0.09, 0.76),
    ]).fill({ color: 0xff9148, alpha: fade ** 2 * 0.43 });

    const root = at(a, push * 0.16);
    const tip = at(a + 0.15, push * (0.86 + 0.14 * Math.cos(a - heading)));
    const outer = at(a + 0.39, push * 0.71);
    const inner = at(a - 0.27, push * 0.49);
    g.moveTo(...root)
      .quadraticCurveTo(...outer, ...tip)
      .quadraticCurveTo(...inner, ...root)
      .fill({ color: i % 2 === 0 ? 0xff652d : 0xd63f23, alpha: fade * 0.77 });
    const flame = at(a + 0.08, push * 0.72);
    g.moveTo(...root)
      .quadraticCurveTo(...at(a + 0.31, push * 0.49), ...flame)
      .quadraticCurveTo(...at(a - 0.15, push * 0.48), ...root)
      .fill({ color: 0xffc166, alpha: fade ** 2 * 0.87 });

    g.moveTo(...at(a - 0.15, 0.31 + 0.52 * time))
      .lineTo(...at(a - 0.12, 0.42 + 0.54 * time))
      .stroke({ color: 0xffd38a, width: Math.min(2, radius * 0.032), alpha: fade });
  }
  // A dark, dissipating underside gives the rolling flame a little volume.
  for (let i = 0; i < 3; i++) {
    const center = at(0.8 + i * 2.1, 0.17 + 0.27 * time);
    g.ellipse(...center, radius * (0.13 + time * 0.16), radius * (0.09 + time * 0.08)).fill({
      color: 0x4c3140,
      alpha: (1 - time) * time * 0.6,
    });
  }
}
