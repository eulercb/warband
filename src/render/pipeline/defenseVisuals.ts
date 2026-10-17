import type { Graphics } from 'pixi.js';
import type { PlayerView } from '../../engine/core/types';
/** The arc follows actual aim; planted gold feet distinguish control resistance. */
export function drawDefenseState(
  g: Graphics,
  p: PlayerView,
  x: number,
  y: number,
  r: number,
): void {
  const guard = p.buffs.find((b) => b.kind === 'frontGuard' && b.remaining > 0 && b.mult > 0);
  if (guard) {
    const angle = Math.atan2(p.aim.y, p.aim.x),
      radius = r + 10;
    g.moveTo(x + Math.cos(angle - Math.PI / 3) * radius, y + Math.sin(angle - Math.PI / 3) * radius)
      .arc(x, y, radius, angle - Math.PI / 3, angle + Math.PI / 3)
      .stroke({ color: 0x80e4ff, width: 4, alpha: 0.95 });
    for (let i = 0; i < guard.mult; i++) {
      const a = angle + (i - (guard.mult - 1) / 2) * 0.24;
      g.circle(x + Math.cos(a) * (radius + 5), y + Math.sin(a) * (radius + 5), 2).fill(0xffffff);
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
