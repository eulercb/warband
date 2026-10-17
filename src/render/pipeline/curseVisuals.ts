/** Shape-coded zone seals; tint is secondary and no battle text is added. */
import type { Graphics } from 'pixi.js';
import type { CurseStyle } from '../../engine/core/curses';
export const CURSE_COLORS = { hex: 0xce95ff, searing: 0xffaa64, dread: 0x9ecaff };
export function drawCurseSigil(
  g: Graphics,
  style: CurseStyle,
  x: number,
  y: number,
  alpha: number,
): void {
  const color = CURSE_COLORS[style];
  g.circle(x, y, 10).fill({ color: 0x090d18, alpha: alpha * 0.8 });
  if (style === 'searing') {
    g.poly([
      x,
      y - 8,
      x + 2,
      y - 1,
      x + 5,
      y - 4,
      x + 6,
      y + 4,
      x,
      y + 7,
      x - 6,
      y + 4,
      x - 4,
      y - 2,
      x - 2,
      y + 1,
      x,
      y - 8,
    ]);
  } else if (style === 'dread') {
    g.ellipse(x, y, 8, 4)
      .moveTo(x, y - 4)
      .lineTo(x, y + 4);
  } else {
    g.poly([x - 3, y - 6, x + 2, y - 1, x - 3, y + 4, x - 8, y - 1, x - 3, y - 6]).poly([
      x + 3,
      y - 4,
      x + 8,
      y + 1,
      x + 3,
      y + 6,
      x - 2,
      y + 1,
      x + 3,
      y - 4,
    ]);
  }
  g.stroke({ color, width: 2, alpha });
}
