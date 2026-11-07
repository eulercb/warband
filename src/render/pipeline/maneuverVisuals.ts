/** Positioning cues use brackets + arrows, separate from name/status glyph rows. */
import type { Graphics } from 'pixi.js';
import type { Vec2 } from '../../engine/core/types';
export function drawManeuverArrow(
  g: Graphics,
  center: Vec2,
  radius: number,
  direction: Vec2,
  distance: number,
  queued: boolean,
  own: boolean,
  bracket = true,
): void {
  const length = Math.hypot(direction.x, direction.y);
  if (length < 1e-6) return;
  const nx = direction.x / length,
    ny = direction.y / length;
  const color = own ? 0xffd36b : 0x80e4ff;
  const from = { x: center.x + nx * (radius + 8), y: center.y + ny * (radius + 8) };
  const reach = Math.max(24, Math.min(70, distance));
  const end = { x: from.x + nx * reach, y: from.y + ny * reach };
  if (queued) {
    for (let d = 0; d < reach; d += 12)
      g.moveTo(from.x + nx * d, from.y + ny * d)
        .lineTo(from.x + nx * Math.min(d + 6, reach), from.y + ny * Math.min(d + 6, reach))
        .stroke({ color, width: 3, alpha: 1 });
  } else g.moveTo(from.x, from.y).lineTo(end.x, end.y).stroke({ color, width: 4, alpha: 1 });
  g.poly([
    end.x + nx * 7,
    end.y + ny * 7,
    end.x - nx * 4 - ny * 6,
    end.y - ny * 4 + nx * 6,
    end.x - nx * 4 + ny * 6,
    end.y - ny * 4 - nx * 6,
  ]).fill(color);
  if (bracket) drawManeuverTarget(g, center, radius, own);
}

/** Marks the selected foe without implying that the foe will move. */
export function drawManeuverTarget(g: Graphics, center: Vec2, radius: number, own: boolean): void {
  const color = own ? 0xffd36b : 0x80e4ff;
  // Four corners distinguish an opened target from a circular area hazard.
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      const x = center.x + sx * (radius + 5),
        y = center.y + sy * (radius + 5);
      g.moveTo(x - sx * 8, y)
        .lineTo(x, y)
        .lineTo(x, y - sy * 8)
        .stroke({ color, width: 2, alpha: 0.95 });
    }
}
