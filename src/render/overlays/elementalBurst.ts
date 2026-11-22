import type { Graphics } from 'pixi.js';
import type { Vec2 } from '../../engine/core/types';

/** All radial accents terminate within the authoritative effect radius. */
export function drawElementalBurst(
  g: Graphics,
  center: Vec2,
  radius: number,
  t: number,
  ice: boolean,
): void {
  const alpha = (1 - t) ** 1.35;
  const ring =
    radius * (ice ? 0.44 + 0.56 * Math.min(1, t * 4) : 0.25 + 0.75 * Math.min(1, t * 2.9));
  const main = ice ? 0x82e3ff : 0xff7842;
  const light = ice ? 0xe3faff : 0xffda80;
  const point = (angle: number, r: number): readonly [number, number] => [
    center.x + Math.cos(angle) * r,
    center.y + Math.sin(angle) * r,
  ];

  // The precise boundary is visible on the hit frame; animated motion is decorative.
  g.circle(center.x, center.y, radius).stroke({ color: main, alpha: alpha * 0.4, width: 1.4 });
  g.circle(center.x, center.y, ring).stroke({
    color: light,
    alpha: alpha * 0.8,
    width: ice ? 2 : 3.2,
  });
  const count = ice ? 12 : 10;
  for (let i = 0; i < count; i++) {
    const angle = (i * 2 * Math.PI) / count + 0.12;
    const tint = i % 2 === 0 ? light : main;
    if (ice) {
      const outer = Math.min(radius, ring * 1.25);
      g.poly([
        ...point(angle, outer),
        ...point(angle + 0.052, ring * 0.77),
        ...point(angle - 0.02, ring * 0.49),
        ...point(angle - 0.052, ring * 0.77),
      ]).fill({ color: tint, alpha: alpha * 0.88 });
    } else {
      const plume = radius * (0.12 + t * 0.1);
      const [x, y] = point(angle, Math.min(radius - plume, ring * (0.76 + (i % 3) * 0.08)));
      g.ellipse(x, y, plume, plume * (0.6 + (i % 3) * 0.12)).fill({
        color: tint,
        alpha: alpha ** 2 * 0.76,
      });
    }
    g.circle(...point(angle + 0.15, radius * (0.46 + t * 0.5)), ice ? 1.25 : 2.15).fill({
      color: main,
      alpha,
    });
  }
  if (!ice) {
    g.circle(center.x, center.y, radius * (0.07 + 0.22 * t)).fill({
      color: light,
      alpha: alpha ** 3 * 0.87,
    });
  }
}
