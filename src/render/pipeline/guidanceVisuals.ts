import type { Graphics } from 'pixi.js';
import type { Vec2 } from '../../engine/core/types';
/** Open ring and heading arrow disappear when the spell becomes ballistic. */
export function drawGuidance(
  g: Graphics,
  at: Vec2,
  angle: number,
  remaining: number,
  scale: number,
  radius = 18,
): void {
  const r = radius * scale,
    dx = Math.cos(angle),
    dy = Math.sin(angle);
  g.moveTo(at.x, at.y - r)
    .arc(at.x, at.y, r, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * Math.min(1, remaining / 1.25))
    .stroke({ color: 0xffdc89, width: 2.5, alpha: 0.95 });
  const x = at.x + dx * (r + 16 * scale),
    y = at.y + dy * (r + 16 * scale);
  g.moveTo(at.x + dx * r, at.y + dy * r)
    .lineTo(x, y)
    .moveTo(x - dx * 7 * scale - dy * 5 * scale, y - dy * 7 * scale + dx * 5 * scale)
    .lineTo(x, y)
    .lineTo(x - dx * 7 * scale + dy * 5 * scale, y - dy * 7 * scale - dx * 5 * scale)
    .stroke({ color: 0xffdc89, width: 2.5 });
}
