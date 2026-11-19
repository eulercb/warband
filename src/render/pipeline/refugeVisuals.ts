import type { Graphics } from 'pixi.js';
import type { Vec2 } from '../../engine/core/types';
/** Open outward teeth distinguish a bodily boundary from a solid projectile shield. */
export function drawRefuge(g: Graphics, at: Vec2, radius: number, scale: number): void {
  const r = radius * scale;
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8,
      b = a + Math.PI / 12;
    g.moveTo(at.x + Math.cos(a) * r, at.y + Math.sin(a) * r)
      .arc(at.x, at.y, r, a, b)
      .stroke({ color: 0xd8ffe7, width: 3, alpha: 0.85 });
    g.moveTo(at.x + Math.cos(a) * r, at.y + Math.sin(a) * r)
      .lineTo(at.x + Math.cos(a) * (r + 5), at.y + Math.sin(a) * (r + 5))
      .stroke({ color: 0x7de8ab, width: 2, alpha: 0.8 });
  }
}
