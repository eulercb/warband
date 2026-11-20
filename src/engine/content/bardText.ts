/** Shared player-facing explanation; verses are preparation, not standalone buffs. */
export const BARD_VERSE_GUIDE =
  'Harmony stores a healing verse after restoring HP. Discord stores a disruptive verse after casting a marked special. Neither changes your stats alone. Get both (in either order), then use Inspiration or Battle Hymn before either 8s timer expires: that skill buffs all allies in range and adds 15% move speed for its duration. Battle Rhapsody can prepare Harmony at full health after Discord and adds an aimed rally that lets allies pass through foes.';
export function bardSongText(part: 'harmony' | 'discord' | 'chorus', rhapsody?: boolean): string {
  if (rhapsody && part === 'harmony')
    return 'prepares Harmony for 8s after restoring HP or when healing a full-health ally while Discord is ready';
  if (rhapsody && part === 'chorus')
    return 'spend Harmony and Discord to buff allies in range with 15% extra movement and place a rally 200u ahead for 4s (95u radius); each ally who enters can move through foes for 2s';
  if (part === 'chorus')
    return 'spend both 8s verses (Harmony + Discord) to share this skill’s buffs with all allies in range and add +15% speed for its duration';
  return part === 'harmony'
    ? 'effective heal prepares harmony for 8s; no effect alone; get Discord, then use Inspiration/Battle Hymn'
    : 'cast prepares discord for 8s; no effect alone; get Harmony by healing, then use Inspiration/Battle Hymn';
}
