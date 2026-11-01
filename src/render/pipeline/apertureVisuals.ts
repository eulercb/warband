import type { Graphics } from 'pixi.js';
import type { PlayerView, Vec2 } from '../../engine/core/types';
/** Two directed mouths and a dashed non-damaging link, distinct from an impact/zone. */
export function drawInfernalAperture(
  g: Graphics,
  a: NonNullable<PlayerView['infernalAperture']>,
  entry: Vec2,
  exit: Vec2,
  scale: number,
  local: boolean,
): void {
  const color = a.blocked ? 0xd7a081 : 0xffa85b,
    alpha = (local ? 0.85 : 0.4) * Math.min(1, a.remaining);
  const u = a.direction,
    r = a.radius * scale;
  for (const p of [entry, exit]) {
    g.moveTo(p.x - u.y * r, p.y + u.x * r)
      .lineTo(p.x + u.y * r, p.y - u.x * r)
      .stroke({ color, width: 4, alpha });
    const tip = { x: p.x + u.x * 12 * scale, y: p.y + u.y * 12 * scale };
    g.moveTo(p.x - u.y * 7 * scale, p.y + u.x * 7 * scale)
      .lineTo(tip.x, tip.y)
      .lineTo(p.x + u.y * 7 * scale, p.y - u.x * 7 * scale)
      .stroke({ color, width: 2, alpha });
  }
  for (let t = 0; t < 1; t += 0.1)
    g.moveTo(entry.x + (exit.x - entry.x) * t, entry.y + (exit.y - entry.y) * t)
      .lineTo(entry.x + (exit.x - entry.x) * (t + 0.04), entry.y + (exit.y - entry.y) * (t + 0.04))
      .stroke({ color, width: 1, alpha: alpha * 0.45 });
}
