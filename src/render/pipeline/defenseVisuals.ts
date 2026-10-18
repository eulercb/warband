import type { Graphics } from 'pixi.js';
import type { PlayerView, Vec2 } from '../../engine/core/types';
/** Authoritative timed states, shared by geometry, sprite and rig overlays. */
export function drawDefenseState(
  g: Graphics,
  p: PlayerView,
  x: number,
  y: number,
  r: number,
): void {
  const guard = p.buffs.find((b) => b.kind === 'frontGuard' && b.remaining > 0 && b.mult > 0);
  const angle = Math.atan2(p.aim.y, p.aim.x);
  if (guard) {
    const radius = r + 8;
    g.moveTo(x + Math.cos(angle - Math.PI / 3) * radius, y + Math.sin(angle - Math.PI / 3) * radius)
      .arc(x, y, radius, angle - Math.PI / 3, angle + Math.PI / 3)
      .stroke({ color: 0x80e4ff, width: 3, alpha: 0.65 });
    const count = Math.min(4, Math.ceil(guard.mult));
    for (let i = 0; i < count; i++) {
      const a = angle + (i - (count - 1) / 2) * 0.55;
      const nx = Math.cos(a),
        ny = Math.sin(a);
      const cx = x + nx * radius,
        cy = y + ny * radius;
      const point = (u: number, v: number) => [cx - ny * u + nx * v, cy + nx * u + ny * v];
      const outline = [
        [-6, 5],
        [6, 5],
        [6, -2],
        [0, -8],
        [-6, -2],
      ].flatMap(([u, v]) => point(u, v));
      g.poly(outline)
        .fill({ color: 0x18364a, alpha: 0.95 })
        .stroke({ color: 0xc7f5ff, width: 2, alpha: 1 });
      const [ax, ay] = point(-3, 1),
        [bx, by] = point(3, 1);
      g.moveTo(ax, ay).lineTo(bx, by).stroke({ color: 0xffffff, width: 2, alpha: 1 });
    }
  }
  if (p.buffs.some((b) => b.kind === 'invuln' && b.visual === 'divineShield' && b.remaining > 0)) {
    const radius = r + 9;
    const points = Array.from({ length: 6 }, (_, i) => [
      x + Math.cos((i * Math.PI) / 3 - Math.PI / 6) * radius,
      y + Math.sin((i * Math.PI) / 3 - Math.PI / 6) * radius,
    ]).flat();
    g.circle(x, y, radius + 3).fill({ color: 0xffe6a3, alpha: 0.12 });
    g.poly(points)
      .fill({ color: 0xffe6a3, alpha: 0.12 })
      .stroke({ color: 0xffdf79, width: 4, alpha: 0.95 });
    g.circle(x, y, radius - 3).stroke({ color: 0xfffcdf, width: 2, alpha: 0.95 });
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      g.moveTo(x + Math.cos(a) * (radius + 5), y + Math.sin(a) * (radius + 5))
        .lineTo(x + Math.cos(a) * (radius + 11), y + Math.sin(a) * (radius + 11))
        .stroke({ color: 0xfffcdf, width: 3, alpha: 0.95 });
    }
  }
  const images = p.buffs.find((b) => b.kind === 'mirrorImages' && b.remaining > 0 && b.mult > 0);
  if (images) {
    const count = Math.min(5, Math.ceil(images.mult));
    for (let i = 0; i < count; i++) {
      const a = angle + Math.PI + (i - (count - 1) / 2) * 0.65;
      const cx = x + Math.cos(a) * (r + 16),
        cy = y + Math.sin(a) * (r + 16);
      g.ellipse(cx, cy + 3, 4, 6)
        .fill({ color: 0xbcaaff, alpha: 0.18 })
        .stroke({ color: 0xded3ff, width: 1.5, alpha: 0.7 });
      g.circle(cx, cy - 5, 3).fill({ color: 0xded3ff, alpha: 0.5 });
    }
  }
  if (p.buffs.some((b) => b.kind === 'steadfast' && b.remaining > 0)) {
    for (const dx of [-8, 8])
      g.moveTo(x + dx, y + r)
        .lineTo(x + dx, y + r + 5)
        .lineTo(x + dx + Math.sign(dx) * 5, y + r + 5)
        .stroke({ color: 0xffce70, width: 3, alpha: 0.95 });
  }
}
/** A compact foreground challenge marker; its arrow points toward the taunter. */
export function drawTauntState(
  g: Graphics,
  at: Vec2,
  target: Vec2,
  radius: number,
  own: boolean,
  view: Vec2,
): void {
  const x = Math.max(20, Math.min(view.x - 20, at.x - radius * 0.7));
  const y = Math.max(20, Math.min(view.y - 20, at.y - radius * 0.7));
  const color = own ? 0xffd36b : 0x80e4ff;
  g.circle(x, y, 10).fill({ color: 0x101724, alpha: 0.9 }).stroke({ color, width: 2, alpha: 1 });
  g.circle(x, y, 5).stroke({ color, width: 2, alpha: 1 });
  g.circle(x, y, 1.8).fill(color);
  const a = Math.atan2(target.y - at.y, target.x - at.x);
  const cx = x + Math.cos(a) * 14,
    cy = y + Math.sin(a) * 14;
  g.poly([
    cx + Math.cos(a) * 4,
    cy + Math.sin(a) * 4,
    cx + Math.cos(a + 2.4) * 4,
    cy + Math.sin(a + 2.4) * 4,
    cx + Math.cos(a - 2.4) * 4,
    cy + Math.sin(a - 2.4) * 4,
  ]).fill(color);
}
