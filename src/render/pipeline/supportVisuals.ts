/** Shared, color-independent support symbols for cast recipients and persistent states. */
import type { Graphics } from 'pixi.js';
import type { BuffView, PlayerView, SupportCueKind } from '../../engine/core/types';
export const SUPPORT_COLORS: Record<SupportCueKind, number> = {
  heal: 0x77efa2,
  empower: 0xffd66b,
  protect: 0x8ac9ff,
  haste: 0xffb56b,
  absorb: 0x7eeaff,
};
export function drawSupportSymbol(
  g: Graphics,
  kind: SupportCueKind,
  x: number,
  y: number,
  r: number,
  alpha: number,
): void {
  const color = SUPPORT_COLORS[kind];
  if (kind === 'heal') {
    g.moveTo(x - r, y)
      .lineTo(x + r, y)
      .moveTo(x, y - r)
      .lineTo(x, y + r)
      .stroke({ color, width: 2.5, alpha });
  } else if (kind === 'empower') {
    g.poly([
      x,
      y - r,
      x + r * 0.35,
      y - r * 0.35,
      x + r,
      y,
      x + r * 0.35,
      y + r * 0.35,
      x,
      y + r,
      x - r * 0.35,
      y + r * 0.35,
      x - r,
      y,
      x - r * 0.35,
      y - r * 0.35,
    ]).stroke({ color, width: 2, alpha });
  } else if (kind === 'haste') {
    for (const offset of [-r * 0.6, r * 0.6])
      g.moveTo(x - r * 0.65 + offset, y + r * 0.6)
        .lineTo(x + offset, y - r * 0.6)
        .lineTo(x + r * 0.65 + offset, y + r * 0.6)
        .stroke({ color, width: 2, alpha });
  } else {
    g.poly([
      x - r,
      y - r * 0.65,
      x,
      y - r,
      x + r,
      y - r * 0.65,
      x + r * 0.8,
      y + r * 0.35,
      x,
      y + r,
      x - r * 0.8,
      y + r * 0.35,
    ]).stroke({ color, width: 2, alpha });
    if (kind === 'absorb')
      g.circle(x, y, r * 1.45).stroke({ color, width: 1.5, alpha: alpha * 0.65 });
  }
}
export function supportStateKind(b: BuffView): SupportCueKind | null {
  if (b.remaining <= 0) return null;
  switch (b.kind) {
    case 'auraRenewal':
      return 'heal';
    case 'auraStrike':
      return 'empower';
    case 'auraBulwark':
      return 'protect';
    case 'damageDealt':
      return b.mult > 1 ? 'empower' : null;
    case 'damageTaken':
      return b.mult < 1 ? 'protect' : null;
    case 'moveSpeed':
      return b.mult > 1 ? 'haste' : null;
    default:
      return null;
  }
}
/** Visible shell, not another ground range ring. Constant size; slow pulse, no flashes. */
export function drawBubble(g: Graphics, x: number, y: number, bodyR: number, time: number): void {
  const r = bodyR + 9;
  const alpha = 0.6 + 0.1 * Math.sin(time * 2);
  g.ellipse(x, y - bodyR * 0.25, r, r * 1.2)
    .fill({ color: 0x7eeaff, alpha: 0.08 })
    .stroke({ color: 0x7eeaff, width: 2, alpha });
  g.moveTo(x - r * 0.7, y - r * 0.4)
    .arc(x, y - bodyR * 0.25, r * 0.8, Math.PI * 1.12, Math.PI * 1.6)
    .stroke({ color: 0xe2fbff, width: 2, alpha });
  drawSupportSymbol(g, 'absorb', x, y - r * 1.65, 4.5, alpha);
}
/** Boundary remains exact. Shield posts / moving chevrons / crosses identify role without color. */
export function drawAuraField(
  g: Graphics,
  a: NonNullable<PlayerView['paladinAura']>,
  x: number,
  y: number,
  scale: number,
  local: boolean,
  time: number,
): void {
  const kind = a.kind === 'bulwark' ? 'protect' : a.kind === 'pursuit' ? 'haste' : 'heal';
  const color = SUPPORT_COLORS[kind];
  const r = a.radius * scale;
  const alpha = local ? 0.5 : 0.32;
  g.circle(x, y, r).stroke({ width: a.kind === 'bulwark' ? 2 : 1, color, alpha });
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3 + (a.kind === 'pursuit' ? time * 0.16 : 0);
    drawSupportSymbol(g, kind, x + Math.cos(angle) * r, y + Math.sin(angle) * r, 6, alpha + 0.18);
  }
  drawSupportSymbol(g, kind, x, y - 30 * scale, 7, 0.9);
}
