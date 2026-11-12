import type { Graphics } from 'pixi.js';
import type { ShadowCommitView, Vec2 } from '../../engine/core/types';
/** Stationary silhouette and locked footprint; filled progress is commitment, not safety. */
export function drawShadowCommit(
  g: Graphics,
  c: ShadowCommitView,
  screen: (p: Vec2) => Vec2,
  scale: number,
  local: boolean,
): void {
  const p = screen(c.origin),
    color = 0xb697ff,
    alpha = local ? 0.8 : 0.55,
    progress = Math.max(0, Math.min(1, 1 - c.remaining / c.duration));
  if (c.kind === 'meleeCone') {
    const reach = c.range * scale;
    g.moveTo(p.x, p.y)
      .lineTo(
        p.x + Math.cos(c.angle - c.halfAngle) * reach,
        p.y + Math.sin(c.angle - c.halfAngle) * reach,
      )
      .arc(p.x, p.y, reach, c.angle - c.halfAngle, c.angle + c.halfAngle)
      .lineTo(p.x, p.y)
      .fill({ color, alpha: 0.06 + progress * 0.12 })
      .stroke({ color, width: 2, alpha });
  } else
    g.circle(p.x, p.y, c.radius * scale)
      .fill({ color, alpha: 0.06 + progress * 0.12 })
      .stroke({ color, width: 2, alpha });
  // Separate head/body and arms make the departed actor readable beside the real hero.
  g.ellipse(p.x, p.y + 9 * scale, 11 * scale, 15 * scale)
    .fill({ color: 0x2d204b, alpha: 0.85 })
    .stroke({ color, width: 1, alpha });
  g.circle(p.x, p.y - 10 * scale, 7 * scale)
    .fill({ color: 0x2d204b, alpha: 0.95 })
    .stroke({ color, width: 1.5, alpha });
  g.moveTo(p.x - 15 * scale, p.y + 1 * scale)
    .lineTo(p.x + 15 * scale, p.y + 1 * scale)
    .stroke({ color, width: 3 * scale, alpha });
  g.arc(p.x, p.y, 29 * scale, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - progress)).stroke({
    color: 0xefd9ff,
    width: 3 * scale,
    alpha: 0.9,
  });
  const facing = {
    x: p.x + Math.cos(c.angle) * 21 * scale,
    y: p.y + Math.sin(c.angle) * 21 * scale,
  };
  if (c.kind === 'meleeCone')
    g.moveTo(p.x, p.y)
      .lineTo(facing.x, facing.y)
      .stroke({ color: 0xefd9ff, width: 2 * scale, alpha });
}
