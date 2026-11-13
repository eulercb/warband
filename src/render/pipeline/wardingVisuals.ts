import type { Graphics } from 'pixi.js';
import type { Vec2 } from '../../engine/core/types';
/** Only the selected existing field is outlined; this is never a safety bubble. */
export function drawDispelTarget(g: Graphics, at: Vec2, radius: number, scale: number): void {
  g.circle(at.x, at.y, radius * scale).stroke({ color: 0x8fd3ff, width: 3, alpha: 0.95 });
  const r = 9 * scale;
  g.moveTo(at.x, at.y - r)
    .lineTo(at.x + r, at.y)
    .lineTo(at.x, at.y + r)
    .lineTo(at.x - r, at.y)
    .closePath()
    .fill({ color: 0x8fd3ff, alpha: 0.95 });
}
