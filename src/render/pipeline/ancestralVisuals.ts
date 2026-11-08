import type { Graphics } from 'pixi.js';
import type { PlayerView, Vec2 } from '../../engine/core/types';
/** Hollow spirit, attack footprint and captured next station: never a living target. */
export function drawAncestralRelay(
  g: Graphics,
  r: NonNullable<PlayerView['ancestralRelay']>,
  screen: (p: Vec2) => Vec2,
  scale: number,
  local: boolean,
  owner: Vec2,
): void {
  const color = r.casting ? 0xffe4a6 : r.remote ? 0x94e6d3 : 0x8c9cac;
  const alpha = local ? 0.8 : 0.3;
  const origin = screen(r.origin);
  // Only the owner needs the persistent attack planning footprint.
  if (local)
    g.circle(origin.x, origin.y, r.radius * scale).stroke({
      color,
      width: r.casting ? 3 : 1,
      alpha: r.casting ? 0.7 : 0.25,
    });
  if (r.station) {
    const p = screen(r.station),
      size = 15 * Math.max(0.8, scale);
    g.moveTo(owner.x, owner.y)
      .lineTo(p.x, p.y)
      .stroke({ color, width: 1, alpha: alpha * 0.25 });
    g.circle(p.x, p.y - size, 5 * scale).stroke({ color, width: 2, alpha });
    g.moveTo(p.x - size, p.y + size)
      .quadraticCurveTo(p.x, p.y - size * 2, p.x + size, p.y + size)
      .lineTo(p.x + size / 3, p.y + size / 2)
      .lineTo(p.x, p.y + size)
      .lineTo(p.x - size / 3, p.y + size / 2)
      .closePath()
      .stroke({ color, width: 2, alpha });
  }
  if (r.casting && r.next) {
    const p = screen(r.next),
      size = 9 * Math.max(0.8, scale);
    g.rect(p.x - size, p.y - size, size * 2, size * 2).stroke({ color: 0xffffff, width: 2, alpha });
  }
}
