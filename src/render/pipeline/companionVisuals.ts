/** A small spirit-wolf silhouette, separate from hero/bot bodies and enemy status rings. */
import type { Graphics } from 'pixi.js';
import type { SpiritCompanionView, Vec2 } from '../../engine/core/types';
export function drawCompanion(
  g: Graphics,
  pet: SpiritCompanionView,
  screen: Vec2,
  scale: number,
): void {
  const size = Math.max(7, 14 * scale);
  const c = Math.cos(pet.facing),
    s = Math.sin(pet.facing);
  const point = (x: number, y: number) => ({
    x: screen.x + (x * c - y * s) * size,
    y: screen.y + (x * s + y * c) * size,
  });
  const poly = (coords: number[]) =>
    coords.reduce<number[]>((out, _, i) => {
      if (i % 2 === 0) {
        const p = point(coords[i], coords[i + 1]);
        out.push(p.x, p.y);
      }
      return out;
    }, []);
  const color = pet.bondReady ? 0xffdc79 : 0x7ae7ce;
  g.ellipse(screen.x, screen.y + size * 0.5, size * 1.25, size * 0.65).fill({
    color: 0x071d22,
    alpha: 0.35,
  });
  // Four paws, a tapered tail and a separate muzzle distinguish it from an arrow marker.
  for (const [x, y] of [
    [-0.65, -0.52],
    [-0.65, 0.52],
    [0.25, -0.5],
    [0.25, 0.5],
  ]) {
    g.poly(poly([x - 0.15, y - 0.18, x + 0.2, y - 0.18, x + 0.25, y + 0.18, x - 0.15, y + 0.18]))
      .fill({ color, alpha: 0.8 })
      .stroke({ color: 0xd9fff4, width: 1, alpha: 0.65 });
  }
  g.poly(poly([-0.8, -0.25, -1.45, -0.48, -1.7, -0.12, -1.15, 0.12, -0.8, 0.25])).fill({
    color,
    alpha: 0.65,
  });
  g.poly(
    poly([
      -0.95, -0.3, -0.6, -0.47, 0.3, -0.38, 0.68, -0.28, 0.68, 0.28, 0.3, 0.38, -0.6, 0.47, -0.95,
      0.3,
    ]),
  )
    .fill({ color, alpha: 0.85 })
    .stroke({ color: 0xd9fff4, width: 1, alpha: 0.8 });
  // Ears point backward from the head; the nose points forward.
  g.poly(
    poly([
      0.35, -0.28, 0.24, -0.7, 0.75, -0.38, 1.02, -0.22, 1.4, -0.1, 1.4, 0.1, 1.02, 0.22, 0.75,
      0.38, 0.24, 0.7, 0.35, 0.28,
    ]),
  )
    .fill({ color: 0xcaffed, alpha: 0.9 })
    .stroke({ color, width: 1.2, alpha: 0.9 });
  for (const y of [-0.2, 0.2]) {
    const eye = point(0.88, y);
    g.circle(eye.x, eye.y, Math.max(0.8, scale * 1.2)).fill({ color: 0x092d34 });
  }
  const nose = point(1.4, 0);
  g.circle(nose.x, nose.y, Math.max(1, scale * 1.7)).fill({ color: 0x092d34 });
  if (pet.attacking)
    g.circle(screen.x, screen.y, size * 1.65).stroke({ color, width: 2, alpha: 0.7 });
  if (pet.bondReady) {
    const badge = point(-0.25, 0);
    g.circle(badge.x, badge.y, size * 0.25).fill({ color: 0xffffff, alpha: 0.9 });
  }
}
