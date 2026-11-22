import type { Graphics } from 'pixi.js';
import type { AddView, Vec2 } from '../../engine/core/types';

/** Offset shoulders, skull and weapon around planted feet during the hit pulse. */
export function drawSkeleton(
  g: Graphics,
  screen: Vec2,
  radius: number,
  flash: number,
  breath: number,
  motion?: AddView['skeletonMotion'],
): void {
  const { x, y } = screen;
  const face = motion?.facing ?? 1;
  const phase = (motion?.distance ?? 0) / 4;
  const step = Number(motion?.moving ?? false) * Math.sin(phase);
  const slash = 1 - (motion?.swing ?? 0) / 0.28;
  const attack = (1 - slash) ** 2;
  const recoil = flash * (1 - attack * 0.35);
  const headX = x + radius * face * (0.19 + attack * 0.18 - recoil * 0.62);
  const headY = y - radius * (0.9 + recoil * 0.51 + Math.abs(step) * 0.14 + breath * 0.05);
  const ivory = flash > 0.3 ? 0xfff5d8 : 0xcfba91;
  const bone = (ax: number, ay: number, bx: number, by: number, width: number): void => {
    g.moveTo(x + ax * radius, y + ay * radius)
      .lineTo(x + bx * radius, y + by * radius)
      .stroke({ color: 0x302239, width: width * radius + 1.5, cap: 'round' });
    g.moveTo(x + ax * radius, y + ay * radius)
      .lineTo(x + bx * radius, y + by * radius)
      .stroke({ color: ivory, width: Math.max(1, width * radius), cap: 'round' });
  };
  for (const side of [-1, 1]) {
    const stride = step * side;
    const foot = side * 0.4 + stride * 0.44 * face;
    const lift = Math.max(0, stride) * 0.48;
    bone(side * 0.24, 0.27, foot * 0.7, 0.55 - lift * 0.4, 0.17);
    bone(foot * 0.7, 0.55 - lift * 0.4, foot, 0.94 - lift, 0.16);
  }
  bone(-0.45, -0.15 - recoil * 0.18, -0.74, 0.37, 0.17);
  const handX = face * (0.66 + attack * 0.54 - recoil * 0.24);
  const handY = 0.34 - attack * 0.63 - recoil * 0.28;
  const blade = -1.04 + attack * 1.6;
  bone(face * 0.43, -0.21, handX, handY, 0.16);
  bone(handX, handY, handX + face * Math.cos(blade) * 0.9, handY + Math.sin(blade) * 0.9, 0.21);
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
