/** Shared player-facing explanation; verses are preparation, not standalone buffs. */
export const BARD_VERSE_GUIDE =
  'Harmony stores a healing verse after restoring HP. Discord stores a disruptive verse after casting a marked special. Neither changes your stats alone. Get both (in either order), then use Inspiration or Battle Hymn before either 8s timer expires: that skill buffs all allies in range and adds 15% move speed for its duration. Healing a full-health target gives no Harmony.';
export function bardSongText(part: 'harmony' | 'discord' | 'chorus'): string {
  if (part === 'chorus')
    return 'spend both 8s verses (Harmony + Discord) to share this skill’s buffs with all allies in range and add +15% speed for its duration';
  return part === 'harmony'
    ? 'effective heal prepares harmony for 8s; no effect alone; get Discord, then use Inspiration/Battle Hymn'
    : 'cast prepares discord for 8s; no effect alone; get Harmony by healing, then use Inspiration/Battle Hymn';
}
