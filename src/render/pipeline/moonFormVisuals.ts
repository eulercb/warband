/** Temporary moon-bear body. Replaces the hero rig; normal overlays retain health/control feedback. */
import type { Graphics } from 'pixi.js';
import type { PlayerView, Vec2 } from '../../engine/core/types';
export function drawMoonBear(
  g: Graphics,
  p: PlayerView,
  screen: Vec2,
  scale: number,
  time = 0,
): void {
  const r = Math.max(11, 23 * scale) * (1 + Math.sin(time * 3) * 0.015);
  const angle = Math.atan2(p.aim.y, p.aim.x),
    c = Math.cos(angle),
    s = Math.sin(angle);
  const pt = (x: number, y: number) => ({
    x: screen.x + (x * c - y * s) * r,
    y: screen.y + (x * s + y * c) * r,
  });
  const circle = (x: number, y: number, radius: number, color: number) => {
    const v = pt(x, y);
    g.circle(v.x, v.y, r * radius)
      .fill({ color })
      .stroke({ color: 0xd4ccff, width: 1, alpha: 0.7 });
  };
  g.ellipse(screen.x, screen.y + r * 0.6, r * 1.2, r * 0.7).fill({ color: 0x080917, alpha: 0.5 });
  for (const [x, y] of [
    [-0.55, -0.65],
    [-0.55, 0.65],
    [0.45, -0.65],
    [0.45, 0.65],
  ])
    circle(x, y, 0.3, 0x494060);
  circle(-0.12, 0, 0.88, 0x64587e);
  circle(0.65, -0.48, 0.25, 0x85739b);
  circle(0.65, 0.48, 0.25, 0x85739b);
  circle(0.65, 0, 0.58, 0x9281ac);
  circle(1.1, 0, 0.28, 0xc2b6d8);
  const nose = pt(1.3, 0);
  g.circle(nose.x, nose.y, r * 0.12).fill({ color: 0x171222 });
  for (const y of [-0.26, 0.26]) {
    const eye = pt(0.88, y);
    g.circle(eye.x, eye.y, Math.max(1.1, r * 0.07)).fill({ color: 0xffe9a9 });
  }
  // Gold crescent on the back reads as a Moon shape rather than another party member.
  const moon = pt(-0.25, 0);
  g.moveTo(moon.x + Math.cos(Math.PI * 0.4) * r * 0.34, moon.y + Math.sin(Math.PI * 0.4) * r * 0.34)
    .arc(moon.x, moon.y, r * 0.34, Math.PI * 0.4, Math.PI * 1.6)
    .stroke({
      color: 0xffe4a0,
      width: Math.max(2, scale * 3),
      cap: 'round',
    });
}
