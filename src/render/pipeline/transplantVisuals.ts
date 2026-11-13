import type { Graphics } from 'pixi.js';
import type { FieldTransplantView, Vec2 } from '../../engine/core/types';
/** Keep an actionable direction cue when the exact destination is outside the camera. */
export function transplantEdge(
  target: Vec2,
  viewport: { width: number; height: number },
): Vec2 | null {
  if (target.x >= 0 && target.x <= viewport.width && target.y >= 0 && target.y <= viewport.height)
    return null;
  const mx = Math.min(20, viewport.width / 4),
    my = Math.min(80, viewport.height / 4),
    bottom = Math.min(110, viewport.height / 4);
  return {
    x: Math.max(mx, Math.min(viewport.width - mx, target.x)),
    y: Math.max(my, Math.min(viewport.height - bottom, target.y)),
  };
}
/** Explicit live-field selection and the exact fixed-ahead destination, not a damaging sweep. */
export function drawFieldTransplant(
  g: Graphics,
  t: FieldTransplantView,
  from: Vec2,
  to: Vec2,
  scale: number,
  viewport?: { width: number; height: number },
): void {
  const color = t.blocked ? 0xa1a6a3 : 0x85e6a1,
    r = t.radius * scale;
  g.circle(from.x, from.y, r + 5).stroke({ color, width: 2, alpha: 0.7 });
  const edge = viewport ? transplantEdge(to, viewport) : null;
  if (edge) {
    const angle = Math.atan2(to.y - edge.y, to.x - edge.x),
      dx = Math.cos(angle),
      dy = Math.sin(angle);
    g.circle(edge.x, edge.y, 11).stroke({ color, width: 1.5, alpha: 0.9 });
    g.poly([
      edge.x + dx * 8,
      edge.y + dy * 8,
      edge.x - dx * 6 - dy * 5,
      edge.y - dy * 6 + dx * 5,
      edge.x - dx * 6 + dy * 5,
      edge.y - dy * 6 - dx * 5,
    ]).fill({ color, alpha: 0.95 });
  }

  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6,
      b = a + Math.PI / 12;
    g.moveTo(to.x + Math.cos(a) * r, to.y + Math.sin(a) * r)
      .arc(to.x, to.y, r, a, b)
      .stroke({ color, width: 2, alpha: 0.85 });
  }
  g.moveTo(to.x - 7, to.y)
    .lineTo(to.x + 7, to.y)
    .moveTo(to.x, to.y - 7)
    .lineTo(to.x, to.y + 7)
    .stroke({ color, width: 2, alpha: 0.9 });
}
