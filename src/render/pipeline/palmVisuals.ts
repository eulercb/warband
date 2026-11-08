import type { Graphics } from 'pixi.js';
import type { PalmSweepView, Vec2 } from '../../engine/core/types';
/** Body-bound paired arcs and travel cue, distinct from a stationary ancestor. */
export function drawPalmSweep(
  g: Graphics,
  r: PalmSweepView,
  pos: Vec2,
  screen: (p: Vec2) => Vec2,
  scale: number,
  local: boolean,
): void {
  if (!r.active && (!local || (!r.ready && !r.casting))) return;
  const p = screen(pos),
    radius = r.radius * scale,
    color = r.blocked ? 0xacaab5 : 0xf4d19e;
  const alpha = r.active ? 0.85 : 0.3;
  g.arc(p.x, p.y, radius, 0.18, Math.PI - 0.18).stroke({ color, width: r.active ? 3 : 1, alpha });
  g.arc(p.x, p.y, radius, Math.PI + 0.18, Math.PI * 2 - 0.18).stroke({
    color,
    width: r.active ? 3 : 1,
    alpha,
  });
  if (r.active) {
    const from = screen(r.origin);
    g.moveTo(from.x, from.y)
      .lineTo(p.x, p.y)
      .stroke({ color, width: 6 * scale, alpha: 0.25 });
  }
  if (local && !r.blocked) {
    const to = screen({ x: pos.x + r.dir.x * r.distance, y: pos.y + r.dir.y * r.distance });
    const dx = to.x - p.x,
      dy = to.y - p.y,
      length = Math.hypot(dx, dy);
    if (length > 1) {
      const x = dx / length,
        y = dy / length;
      g.moveTo(p.x, p.y).lineTo(to.x, to.y).stroke({ color, width: 1.5, alpha: 0.5 });
      g.moveTo(to.x - x * 10 - y * 6, to.y - y * 10 + x * 6)
        .lineTo(to.x, to.y)
        .lineTo(to.x - x * 10 + y * 6, to.y - y * 10 - x * 6)
        .stroke({ color, width: 2, alpha: 0.8 });
    }
  }
}
