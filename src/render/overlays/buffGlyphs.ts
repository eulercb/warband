/**
 * Warband — buff/debuff glyphs shared by the canvas labels and the React HUD.
 * Pure (only depends on the BuffView shape) so both the renderer and the HUD can
 * read out, at a glance, what is affecting a creature and for how long.
 */
import type { BuffView, BuffKind } from '../../engine/core/types';

export interface BuffBadge {
  glyph: string;
  /** Whole seconds remaining (for the cooldown number shown beside the glyph). */
  secs: number;
  /** CSS/Pixi hex color for the badge accent. */
  color: number;
  good: boolean;
  label: string;
}

/** Emoji + accent for one buff/debuff, or null if it shouldn't surface. */
function describe(
  kind: BuffKind,
  mult: number,
): { glyph: string; color: number; good: boolean; label: string } | null {
  switch (kind) {
    case 'stun':
      return { glyph: '💫', color: 0xffe14d, good: false, label: 'Stunned' };
    case 'silence':
      return { glyph: '🔇', color: 0xc06cff, good: false, label: 'Silenced' };
    case 'root': // item 9 — immobilised (movement + blink/charge/teleport disabled)
      return { glyph: '🌿', color: 0x6bbf59, good: false, label: 'Rooted' };
    case 'invuln':
      return { glyph: '✨', color: 0xbfe9ff, good: true, label: 'Invulnerable' };
    case 'moveSpeed':
      return mult < 1
        ? { glyph: '🐌', color: 0x59a0ff, good: false, label: 'Slowed' }
        : { glyph: '💨', color: 0x7dffa0, good: true, label: 'Hastened' };
    case 'damageDealt':
      return mult >= 1
        ? { glyph: '💪', color: 0xff9a3d, good: true, label: 'Empowered' }
        : { glyph: '🔻', color: 0x9a7dff, good: false, label: 'Weakened' };
    case 'damageTaken':
      return mult <= 1
        ? { glyph: '🛡️', color: 0x59d9ff, good: true, label: 'Shielded' }
        : { glyph: '💔', color: 0xff5a5a, good: false, label: 'Vulnerable' };
    default:
      return null;
  }
}

/** Build compact badges for a list of buffs (deduped by glyph, longest wins). */
export function buffBadges(buffs: BuffView[] | undefined, cap = 4): BuffBadge[] {
  if (!buffs || buffs.length === 0) return [];
  const byGlyph = new Map<string, BuffBadge>();
  for (const b of buffs) {
    const d = describe(b.kind, b.mult);
    if (!d) continue;
    const secs = Math.max(1, Math.ceil(b.remaining));
    const existing = byGlyph.get(d.glyph);
    if (!existing || secs > existing.secs) {
      byGlyph.set(d.glyph, { glyph: d.glyph, secs, color: d.color, good: d.good, label: d.label });
    }
  }
  return [...byGlyph.values()].slice(0, cap);
}

/** One-line text summary ("🛡️2 ❄3") for a canvas label. */
export function buffLabel(buffs: BuffView[] | undefined, cap = 4): string {
  return buffBadges(buffs, cap)
    .map((b) => `${b.glyph}${b.secs}`)
    .join(' ');
}
