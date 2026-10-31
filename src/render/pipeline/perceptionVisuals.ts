import type { Graphics } from 'pixi.js';
import type { ApparitionView, Vec2 } from '../../engine/core/types';

/** Friendly allegiance pennant stays visible even beside a much larger boss. */
export function drawBorrowedAlly(g: Graphics, pt: Vec2, scale: number): void {
  const s = Math.max(0.7, scale),
    x = pt.x,
    y = pt.y - 30 * s;
  g.circle(pt.x, pt.y, 16 * s).stroke({ color: 0x99ffcc, width: 2 * s, alpha: 0.9 });
  g.moveTo(x, y + 12 * s)
    .lineTo(x, y - 8 * s)
    .stroke({ color: 0x99ffcc, width: 2 * s });
  g.poly([x, y - 8 * s, x + 15 * s, y - 5 * s, x, y + 2 * s]).fill({ color: 0x99ffcc, alpha: 0.9 });
}

/** Fixed perception anchor with a readable silhouette above bodies and particles. */
export function drawApparition(
  g: Graphics,
  a: ApparitionView,
  pt: Vec2,
  enemy: Vec2 | undefined,
  scale: number,
): void {
  const s = Math.max(0.7, scale),
    x = pt.x - (a.mode === 'fear' ? 24 : 0) * s,
    y = pt.y - (a.mode === 'fear' ? 10 : 42) * s;
  const color = a.mode === 'fear' ? 0xe3bdff : 0xa6efff;
  const alpha = a.pending ? 0.55 : 0.8;
  if (enemy) g.moveTo(pt.x, pt.y).lineTo(enemy.x, enemy.y).stroke({ color, width: s, alpha: 0.4 });
  g.moveTo(x, y + 15 * s)
    .lineTo(pt.x, pt.y)
    .stroke({ color, width: s, alpha: 0.55 });
  if (a.mode === 'fear') {
    g.poly([
      x - 13 * s,
      y - 15 * s,
      x + 13 * s,
      y - 15 * s,
      x + 10 * s,
      y + 5 * s,
      x,
      y + 16 * s,
      x - 10 * s,
      y + 5 * s,
    ])
      .fill({ color: 0x251333, alpha })
      .stroke({ color, width: 2 * s });
    g.circle(x - 5 * s, y - 4 * s, 2 * s)
      .circle(x + 5 * s, y - 4 * s, 2 * s)
      .ellipse(x, y + 7 * s, 3 * s, 5 * s)
      .fill({ color, alpha });
  } else {
    // A head and ghostly shoulders read as a false person, not another fear mask.
    g.circle(x, y - 11 * s, 7 * s)
      .fill({ color, alpha })
      .stroke({ color: 0xffffff, width: s });
    g.poly([
      x - 8 * s,
      y - 2 * s,
      x + 8 * s,
      y - 2 * s,
      x + 14 * s,
      y + 15 * s,
      x + 5 * s,
      y + 11 * s,
      x,
      y + 16 * s,
      x - 5 * s,
      y + 11 * s,
      x - 14 * s,
      y + 15 * s,
    ])
      .fill({ color, alpha: alpha * 0.65 })
      .stroke({ color, width: 2 * s });
  }
}
