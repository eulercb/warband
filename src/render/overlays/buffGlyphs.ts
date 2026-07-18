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
  /**
   * item 1 — a CONSTANT status with no duration (a permanent flyer's airborne
   * state): the badge shows the glyph alone, with no (misleading) countdown. Timed
   * buffs leave this unset and keep their shrinking `secs`.
   */
  permanent?: boolean;
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
    case 'castSlow': // item 9 — wind-up / cast time stretched (Hex, venom)
      return { glyph: '⏳', color: 0xb488e0, good: false, label: 'Sluggish' };
    case 'invuln':
      return { glyph: '✨', color: 0xbfe9ff, good: true, label: 'Invulnerable' };
    case 'flight': // item 7 — airborne: soaring over ground effects
      return { glyph: '🕊️', color: 0xbfe0ff, good: true, label: 'Airborne' };
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

/**
 * Build compact badges for a list of buffs (deduped by glyph, longest wins).
 *
 * item 1 — `flying` surfaces a CONSTANT flyer's airborne state (a boss with
 * `MonsterDef.flying`, which carries no timed `'flight'` buff): a permanent 🕊️
 * badge with no countdown, inserted first so it survives the `cap` and wins over
 * any same-glyph timed buff. Timed flyers surface through their real buff instead,
 * so the default `flying = false` keeps every non-flyer byte-identical.
 */
export function buffBadges(buffs: BuffView[] | undefined, cap = 4, flying = false): BuffBadge[] {
  const byGlyph = new Map<string, BuffBadge>();
  if (flying) {
    const d = describe('flight', 0);
    if (d) byGlyph.set(d.glyph, { ...d, secs: 0, permanent: true });
  }
  if (buffs) {
    for (const b of buffs) {
      const d = describe(b.kind, b.mult);
      if (!d) continue;
      const existing = byGlyph.get(d.glyph);
      if (existing?.permanent) continue; // constant status already shown — don't overwrite it
      const secs = Math.max(1, Math.ceil(b.remaining));
      if (!existing || secs > existing.secs) {
        byGlyph.set(d.glyph, { glyph: d.glyph, secs, color: d.color, good: d.good, label: d.label });
      }
    }
  }
  return [...byGlyph.values()].slice(0, cap);
}

/** One-line text summary ("🛡️2 ❄3") for a canvas label. A permanent badge (a
 * constant flyer's flight) shows the glyph alone, without a countdown. */
export function buffLabel(buffs: BuffView[] | undefined, cap = 4, flying = false): string {
  return buffBadges(buffs, cap, flying)
    .map((b) => (b.permanent ? b.glyph : `${b.glyph}${b.secs}`))
    .join(' ');
}
