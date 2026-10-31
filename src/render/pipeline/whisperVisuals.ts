/** The departure footprint is public; cast identities and damage tuning stay host-only. */
import type { Graphics } from 'pixi.js';
import type { BuffView, Vec2 } from '../../engine/core/types';

export function whisperAfterimage(b: BuffView) {
  if (
    b.kind !== 'whisperRefrain' ||
    b.remaining <= 0 ||
    !b.whisperRefrain ||
    b.whisperRefrain.charges <= 0
  )
    return null;
  return { ...b.whisperRefrain, remaining: b.remaining };
}

export function drawWhisperAfterimage(
  g: Graphics,
  b: BuffView,
  screen: Vec2,
  scale: number,
  local: boolean,
  time: number,
): void {
  const image = whisperAfterimage(b);
  if (!image) return;
  const { x, y } = screen;
  const color = 0xc6a8ff;
  const fade = Math.min(1, image.remaining);
  const alpha = (local ? 0.45 : 0.28) * fade;
  const glyphScale = Math.max(scale, 0.85);
  const r = image.radius * scale;
  // Thin exact boundary plus a small masked silhouette: no large floating text.
  g.circle(x, y, r).stroke({ color, width: 1, alpha: alpha * 0.6 });
  g.ellipse(x, y - 5 * glyphScale, 10 * glyphScale, 15 * glyphScale)
    .fill({ color, alpha: 0.12 * fade })
    .stroke({ color, width: 2, alpha: fade * (0.85 + 0.05 * Math.sin(time * 2)) });
  for (const sign of [-1, 1])
    g.moveTo(x + sign * 3 * glyphScale, y - 9 * glyphScale)
      .lineTo(x + sign * 6 * glyphScale, y - 8 * glyphScale)
      .stroke({ color, width: 2, alpha: 0.95 * fade });
  for (let i = 0; i < Math.min(4, image.charges); i++) {
    const dx = (i - (image.charges - 1) / 2) * 7 * glyphScale;
    g.moveTo(x + dx, y + 15 * glyphScale)
      .lineTo(x + dx, y + 21 * glyphScale)
      .stroke({ color, width: 3, alpha: 0.9 * fade });
  }
}
