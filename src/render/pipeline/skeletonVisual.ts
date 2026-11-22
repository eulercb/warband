import type { Graphics } from 'pixi.js';
import type { Vec2 } from '../../engine/core/types';

/** Offset shoulders, skull and weapon around planted feet during the hit pulse. */
export function drawSkeleton(
  g: Graphics,
  screen: Vec2,
  radius: number,
  flash: number,
  breath: number,
): void {
  const { x, y } = screen;
  const recoil = flash * flash;
  const headX = x + radius * recoil * 0.37;
  const headY = y - radius * (0.72 + recoil * 0.29 + breath * 0.06);
  const ivory = flash > 0.3 ? 0xfff5d8 : 0xcfba91;
  const bone = (ax: number, ay: number, bx: number, by: number, width: number): void => {
    g.moveTo(x + ax * radius, y + ay * radius)
      .lineTo(x + bx * radius, y + by * radius)
      .stroke({ color: 0x302239, width: width * radius + 1.5, cap: 'round' });
    g.moveTo(x + ax * radius, y + ay * radius)
      .lineTo(x + bx * radius, y + by * radius)
      .stroke({ color: ivory, width: Math.max(1, width * radius), cap: 'round' });
  };
  bone(-0.26, 0.31, -0.42, 0.94, 0.16);
  bone(0.24, 0.33, 0.48, 0.88, 0.16);
  bone(-0.45, -0.15 - recoil * 0.18, -0.74, 0.37, 0.17);
  bone(0.48, -0.21, 0.76 + recoil * 0.19, 0.45, 0.16);
  bone(0.79 + recoil * 0.1, 0.43, 1.3 + recoil * 0.16, -0.28, 0.21);
  bone(0, -0.35, 0, 0.39, 0.19);
  for (let i = 0; i < 3; i++) {
    const width = 0.43 - i * 0.08;
    const row = -0.24 + i * 0.21;
    bone(-width, row, width, row, 0.13);
  }
  g.roundRect(headX - radius * 0.23, headY + radius * 0.15, radius * 0.46, radius * 0.34, 1).fill({
    color: ivory,
  });
  g.ellipse(headX, headY, radius * 0.42, radius * 0.36)
    .fill({ color: ivory })
    .stroke({ color: 0x302239, width: 1.25 });
  for (const side of [-1, 1]) {
    g.circle(headX + side * radius * 0.17, headY, Math.max(1, radius * 0.095)).fill({
      color: 0x2a2033,
    });
  }
}
