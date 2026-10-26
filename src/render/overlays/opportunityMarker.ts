/** A local actionable target, separate from persistent status/ground effects.
 * Coordinates and sizes are screen pixels, so zoom cannot shrink the cue away.
 * Other conditional abilities may reuse this treatment when explicitly designed. */
import type { Graphics } from 'pixi.js';

export function opportunityAnchor(
  target: { x: number; y: number; radius: number },
  viewport: { w: number; h: number },
): { x: number; y: number; side: number } {
  // Put the badge toward the roomier side of the screen, beside the body rather
  // than in the name/buff rows above and below it. Keep it inside narrow phones.
  const side = target.x > viewport.w / 2 ? -1 : 1;
  return {
    x: Math.max(18, Math.min(viewport.w - 18, target.x + side * (target.radius + 26))),
    y: Math.max(18, Math.min(viewport.h - 18, target.y)),
    side,
  };
}

export function drawOpportunityMarker(
  g: Graphics,
  target: { x: number; y: number; radius: number },
  viewport: { w: number; h: number },
): void {
  const { x, y, side } = opportunityAnchor(target, viewport);
  const ink = 0x180d24;
  // Short inward pointer: clear association without a line across the arena.
  const tip = x - side * 25;
  g.moveTo(x - side * 12, y)
    .lineTo(tip, y)
    .moveTo(tip + side * 5, y - 5)
    .lineTo(tip, y)
    .lineTo(tip + side * 5, y + 5)
    .stroke({ color: ink, width: 6 });
  g.moveTo(x - side * 12, y)
    .lineTo(tip, y)
    .moveTo(tip + side * 5, y - 5)
    .lineTo(tip, y)
    .lineTo(tip + side * 5, y + 5)
    .stroke({ color: 0xffffff, width: 2 });
  // Opaque gold area + dark/white edges survive both dark floors and bright FX.
  g.poly([x, y - 18, x + 18, y, x, y + 18, x - 18, y]).fill(ink);
  g.poly([x, y - 16, x + 16, y, x, y + 16, x - 16, y]).fill(0xffffff);
  g.poly([x, y - 14, x + 14, y, x, y + 14, x - 14, y]).fill(0xffd66b);
  // A crosshair denotes the usable target; no color recognition or text needed.
  g.moveTo(x - 7, y)
    .lineTo(x - 3, y)
    .moveTo(x + 3, y)
    .lineTo(x + 7, y)
    .moveTo(x, y - 7)
    .lineTo(x, y - 3)
    .moveTo(x, y + 3)
    .lineTo(x, y + 7)
    .stroke({ color: ink, width: 2 });
  g.rect(x - 1.5, y - 1.5, 3, 3).fill(ink);
}
