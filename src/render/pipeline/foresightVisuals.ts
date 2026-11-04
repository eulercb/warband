import { getMonster } from '../../engine/content/monsters';
import type { Graphics } from 'pixi.js';
import type { BossView } from '../../engine/core/types';
import type { Camera } from './camera';
const COLOR = 0xd3a5ff;
/** Dashed intent outlines have no countdown fill: the orange telegraph owns attack timing. */
export function drawForesight(g: Graphics, boss: BossView, camera: Camera): void {
  const view = boss.forethought?.preview ?? boss.revealed;
  if (!view) return;
  const early = !!boss.forethought?.preview;
  const s = camera.scale;
  const point = (x: number, y: number) => camera.worldToScreen({ x, y });
  const dash = (ax: number, ay: number, bx: number, by: number) => {
    const len = Math.hypot(bx - ax, by - ay),
      steps = Math.max(1, Math.ceil(len / 12));
    for (let i = 0; i < steps; i += 2) {
      const end = Math.min(i + 1, steps);
      g.moveTo(ax + ((bx - ax) * i) / steps, ay + ((by - ay) * i) / steps)
        .lineTo(ax + ((bx - ax) * end) / steps, ay + ((by - ay) * end) / steps)
        .stroke({ color: COLOR, width: 3, alpha: 0.95 });
    }
  };
  const ring = (x: number, y: number, r: number) => {
    const radius = Math.max(1, r);
    for (let i = 0; i < 32; i += 2) {
      const start = (i * Math.PI) / 16;
      g.moveTo(x + Math.cos(start) * radius, y + Math.sin(start) * radius)
        .arc(x, y, radius, start, ((i + 1) * Math.PI) / 16)
        .stroke({ color: COLOR, width: 3, alpha: 0.95 });
    }
  };
  // The eye persists through the real wind-up, including a slowed one.
  const b = point(boss.pos.x, boss.pos.y),
    eyeY = b.y - getMonster(boss.monsterId).radius * s - 56;
  g.ellipse(b.x, eyeY, 13, 7).stroke({ color: COLOR, width: 3 });
  g.circle(b.x, eyeY, 3).fill(COLOR);
  if (!early && !['tracking', 'volley'].includes(view.mode)) return;
  const t = view.shape;
  if (!t) return; // summon/buff/hazards use the eye and explicit HUD instruction.
  const o = point(t.origin.x, t.origin.y),
    end = point(t.target.x, t.target.y);
  if (view.mode === 'tracking') {
    ring(o.x, o.y, (view.range ?? t.radius) * s);
    dash(o.x, o.y, end.x, end.y);
    ring(end.x, end.y, 19);
  } else if (view.mode === 'volley') {
    for (let i = 0; i < (view.rays ?? 1); i++) {
      const a =
        t.angle +
        ((view.rays ?? 1) > 1 ? -t.halfAngle + (2 * t.halfAngle * i) / ((view.rays ?? 1) - 1) : 0);
      dash(o.x, o.y, o.x + Math.cos(a) * t.range * s, o.y + Math.sin(a) * t.range * s);
    }
  } else if (t.kind === 'circle') ring(end.x, end.y, t.radius * s);
  else if (t.kind === 'cone') {
    const r = t.range * s;
    for (const a of [t.angle - t.halfAngle, t.angle + t.halfAngle])
      dash(o.x, o.y, o.x + Math.cos(a) * r, o.y + Math.sin(a) * r);
    for (let i = 0; i < 16; i += 2) {
      const start = t.angle - t.halfAngle + (2 * t.halfAngle * i) / 16;
      g.moveTo(o.x + Math.cos(start) * r, o.y + Math.sin(start) * r)
        .arc(
          o.x,
          o.y,
          r,
          t.angle - t.halfAngle + (2 * t.halfAngle * i) / 16,
          t.angle - t.halfAngle + (2 * t.halfAngle * (i + 1)) / 16,
        )
        .stroke({ color: COLOR, width: 3, alpha: 0.95 });
    }
  } else {
    const d = Math.hypot(end.x - o.x, end.y - o.y) || 1,
      nx = ((-(end.y - o.y) / d) * t.width * s) / 2,
      ny = (((end.x - o.x) / d) * t.width * s) / 2;
    dash(o.x + nx, o.y + ny, end.x + nx, end.y + ny);
    dash(o.x - nx, o.y - ny, end.x - nx, end.y - ny);
    dash(end.x + nx, end.y + ny, end.x - nx, end.y - ny);
  }
}
