import type { Graphics } from 'pixi.js';
import type { PlayerView, Vec2 } from '../../engine/core/types';

/** A fixed diamond footprint; an inward chevron appears when return is earned. */
export function drawShadowAnchor(
  g: Graphics,
  r: NonNullable<PlayerView['shadowReprise']>,
  screen: Vec2,
  scale: number,
  local: boolean,
  ownerScreen?: Vec2,
): void {
  const size = 15 * Math.max(0.8, scale);
  const color = r.armed ? (r.blocked ? 0xe3a56c : 0xbff6ff) : 0xa48bd6;
  const alpha = (local ? 0.95 : 0.5) * Math.min(1, r.remaining);
  // The departure can leave a narrow phone viewport; keep its direction beside the owner.
  if (local && ownerScreen) {
    const dx = screen.x - ownerScreen.x,
      dy = screen.y - ownerScreen.y;
    const length = Math.hypot(dx, dy);
    if (length > 1) {
      const ux = dx / length,
        uy = dy / length;
      const tip = { x: ownerScreen.x + ux * size * 2.8, y: ownerScreen.y + uy * size * 2.8 };
      const back = { x: tip.x - ux * size * 0.6, y: tip.y - uy * size * 0.6 };
      g.moveTo(back.x - uy * size * 0.35, back.y + ux * size * 0.35)
        .lineTo(tip.x, tip.y)
        .lineTo(back.x + uy * size * 0.35, back.y - ux * size * 0.35)
        .stroke({ color, width: 3, alpha });
    }
  }
  const { x, y } = screen;
  g.moveTo(x, y - size)
    .lineTo(x + size, y)
    .lineTo(x, y + size)
    .lineTo(x - size, y)
    .closePath()
    .stroke({ color, width: r.armed ? 3 : 1.5, alpha });
  if (r.armed)
    g.moveTo(x + size / 3, y - size / 3)
      .lineTo(x - size / 3, y)
      .lineTo(x + size / 3, y + size / 3)
      .stroke({ color, width: 3, alpha });
}
