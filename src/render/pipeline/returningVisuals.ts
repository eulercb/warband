import type { Graphics } from 'pixi.js';
import type { ProjectileView, Vec2 } from '../../engine/core/types';
/** Outward spear / double-chevron return: direction remains readable beyond color. */
export function drawReturningShot(g: Graphics, p: ProjectileView, s: Vec2, scale: number): void {
  const length = Math.hypot(p.vel.x, p.vel.y) || 1,
    x = p.vel.x / length,
    y = p.vel.y / length;
  const color = p.returnPhase === 'back' ? 0x8cf0d1 : 0xf2ce82;
  const at = (along: number, across: number) => ({
    x: s.x + (along * x - across * y) * scale,
    y: s.y + (along * y + across * x) * scale,
  });
  const line = (a: number, b: number, c: number, d: number) => {
    const u = at(a, b),
      v = at(c, d);
    g.moveTo(u.x, u.y).lineTo(v.x, v.y).stroke({ color, width: 2, alpha: 0.95 });
  };
  const tail = at(-26, 0),
    tip = at(-15, 0);
  g.moveTo(tail.x, tail.y).lineTo(tip.x, tip.y).stroke({ color, width: 2, alpha: 0.35 });
  line(-15, 0, 9, 0);
  line(3, -5, 9, 0);
  line(9, 0, 3, 5);
  if (p.returnTurn) g.circle(s.x, s.y, 12 * scale).stroke({ color, width: 2, alpha: 0.65 });
  if (p.returnPhase === 'back') {
    line(-5, -5, 1, 0);
    line(1, 0, -5, 5);
  } else {
    line(-13, -3, -8, 0);
    line(-8, 0, -13, 3);
  }
}
