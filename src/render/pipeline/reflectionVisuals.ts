import type { Graphics } from 'pixi.js';
import type { Vec2 } from '../../engine/core/types';
/** A hollow mirror, not another status ring. Every independent path starts explicitly. */
export function drawReflectionWard(g: Graphics, at: Vec2, remaining: number, scale: number): void {
  const r = Math.max(24, 34 * scale),
    gold = 0xffe690,
    blue = 0x88e7ff;
  const vertices = [
    { x: at.x, y: at.y - r },
    { x: at.x + r * 0.86, y: at.y - r * 0.5 },
    { x: at.x + r * 0.86, y: at.y + r * 0.5 },
    { x: at.x, y: at.y + r },
    { x: at.x - r * 0.86, y: at.y + r * 0.5 },
    { x: at.x - r * 0.86, y: at.y - r * 0.5 },
  ];
  g.poly(vertices.flatMap((p) => [p.x, p.y]))
    .fill({ color: blue, alpha: 0.09 })
    .stroke({ color: blue, width: 1, alpha: 0.45 });
  const lit = Math.ceil((Math.max(0, Math.min(4, remaining)) / 4) * 6);
  for (let i = 0; i < 6; i++) {
    const a = vertices[i],
      b = vertices[(i + 1) % 6];
    g.moveTo(a.x, a.y)
      .lineTo(b.x, b.y)
      .stroke({
        color: i < lit ? gold : blue,
        width: i < lit ? 3.5 : 1,
        alpha: i < lit ? 1 : 0.25,
      });
    if (i < lit)
      g.poly([a.x, a.y - 3, a.x + 3, a.y, a.x, a.y + 3, a.x - 3, a.y]).fill({
        color: 0xffffff,
        alpha: 0.9,
      });
  }
  // The mirror sits beside the body, clear of the ordinary buff row.
  const x = at.x + r + 9,
    y = at.y;
  g.poly([x, y - 7, x + 7, y, x, y + 7, x - 7, y])
    .fill({ color: 0x142b43, alpha: 0.95 })
    .stroke({ color: gold, width: 2 });
  g.moveTo(x + 3, y - 3)
    .lineTo(x - 3, y + 3)
    .stroke({ color: blue, width: 2 });
}
