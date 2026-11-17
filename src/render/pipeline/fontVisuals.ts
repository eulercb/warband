import type { Graphics } from 'pixi.js';
import type { Vec2 } from '../../engine/core/types';
/** A seed/cross on ready territory; a bright rooted cross surrounds the rescued body. */
export function drawFont(g: Graphics, at: Vec2, scale: number, claimed: boolean): void {
  const r = Math.max(claimed ? 22 : 16, 28 * scale),
    color = claimed ? 0xffffff : 0x9dffcf;
  g.poly([at.x, at.y - r, at.x + r, at.y, at.x, at.y + r, at.x - r, at.y])
    .fill({ color: 0x286b55, alpha: 0.14 })
    .stroke({ color, width: claimed ? 3 : 2, alpha: 0.85 });
  g.moveTo(at.x, at.y - r * 0.5)
    .lineTo(at.x, at.y + r * 0.5)
    .stroke({ color, width: 4 });
  g.moveTo(at.x - r * 0.5, at.y)
    .lineTo(at.x + r * 0.5, at.y)
    .stroke({ color, width: 4 });
  g.moveTo(at.x - r * 0.65, at.y + r * 0.35)
    .lineTo(at.x, at.y + r * 0.85)
    .lineTo(at.x + r * 0.65, at.y + r * 0.35)
    .stroke({ color: 0x9dffcf, width: 2 });
}

export function drawFontFootprint(g: Graphics, at: Vec2, radius: number, scale: number): void {
  const r = radius * scale;
  for (let i = 0; i < 4; i++) {
    const start = (i * Math.PI) / 2 - Math.PI / 12,
      end = start + Math.PI / 6;
    g.moveTo(at.x + Math.cos(start) * r, at.y + Math.sin(start) * r)
      .arc(at.x, at.y, r, start, end)
      .stroke({ color: 0x9dffcf, width: 2, alpha: 0.6 });
  }
}
