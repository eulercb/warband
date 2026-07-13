import { describe, it, expect } from 'vitest';
import { SUBCLASSES, getSubSkill } from '../src/engine/content/subclasses';
import { CHAR_UPGRADES } from '../src/engine/content/charUpgrades';
import { UPGRADES } from '../src/engine/content/upgrades';
import { EPHEMERAL } from '../src/engine/content/ephemeral';

/**
 * item 4 — broken icons. A full audit of the content defs found no tofu / empty /
 * mojibake glyphs, but three defensive subclass skills carried a 🔵 blue-circle
 * PLACEHOLDER (where every other shield skill uses 🛡️) and a "Berserker's Howl"
 * graft wore a 📯 postal horn. These tests fix those and guard against any icon
 * regressing to empty, a placeholder, or a tofu/replacement glyph.
 */
const PLACEHOLDERS = new Set(['', '🔵', '□', '▢', '◻', '◼', '�', '?']);

function assertIcon(icon: string, where: string): void {
  expect(typeof icon, where).toBe('string');
  expect(icon.trim().length, `${where}: empty icon`).toBeGreaterThan(0);
  expect(PLACEHOLDERS.has(icon), `${where}: placeholder/broken icon ${JSON.stringify(icon)}`).toBe(
    false,
  );
}

describe('content icons are present and not placeholders (item 4)', () => {
  it('every subclass skill has a real icon', () => {
    for (const list of Object.values(SUBCLASSES))
      for (const sub of list)
        for (const sk of sub.skills) assertIcon(sk.icon, `${sub.id}/${sk.id}`);
  });

  it('every character / hybrid / grand upgrade has a real icon', () => {
    for (const [id, def] of Object.entries(CHAR_UPGRADES)) assertIcon(def.icon, id);
  });

  it('every generic boon and ephemeral item has a real icon', () => {
    for (const [id, def] of Object.entries(UPGRADES)) assertIcon(def.icon, id);
    for (const [id, def] of Object.entries(EPHEMERAL)) assertIcon(def.icon, id);
  });

  it('the fixed placeholder icons now read true', () => {
    // The three shield/ward skills follow the 🛡️ shield convention now.
    expect(getSubSkill('mg_evoker_shield')?.icon).toBe('🛡️');
    expect(getSubSkill('ro_trickster_shield')?.icon).toBe('🛡️');
    expect(getSubSkill('so_wild_font')?.icon).toBe('🛡️');
    // Berserker's Howl is a feral howl, not a mail horn.
    expect(CHAR_UPGRADES['hy_warhowl'].icon).toBe('🐺');
  });
});
