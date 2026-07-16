/**
 * item 6 — pure resolver for the pause menu's owned-skill review. Kept out of the
 * component file so PauseMenu.tsx only exports React components (react-refresh clean).
 */
import {
  previewAbilityTable,
  previewSubAbility,
  previewPlayerStats,
} from '../../engine/content/charUpgrades';
import { describeAbility, type DescribeMods } from '../../engine/content/classes';
import { getSubSkill, subclassOfSkill } from '../../engine/content/subclasses';
import { BASIC_CD_FLOOR } from '../../engine/core/constants';
import type { SLOT_ACTION } from '../../input/bindings';
import type { ClassId, AbilitySlot } from '../../engine/core/types';

const BASE_SLOTS: AbilitySlot[] = ['basic', 'a1', 'a2', 'a3'];

/** One reviewable owned skill: its bind slot, display name and numeric line. */
export interface OwnedSkillRow {
  key: string;
  slot: keyof typeof SLOT_ACTION;
  name: string;
  line: string;
}

/**
 * Resolve the local hero's currently-owned skills into review rows: the base kit
 * (upgrade-resolved, so the numbers reflect the hero's actual picks) plus every
 * equipped subclass skill for the ACTIVE class. Each row carries a describeAbility
 * numeric line (damage · reach · cooldown …), the same formatter the HUD tiles use,
 * so the pause panel can lay them out for an at-a-glance review. Multiclass heroes
 * only see the sub-skills belonging to the class they currently wield (mirroring the
 * HUD), so the list never shows an unusable skill.
 *
 * `activeClass` is the kit currently wielded (which skills to show); `identityClass` is
 * the spawn/identity class the GENERIC + class boons were gated on at spawn (they're
 * fixed once, never re-derived on a class swap). They differ only for a multiclass hero
 * who has swapped kits — resolving the mults off the identity class keeps the per-skill
 * numbers consistent with the sim AND with the character sheet (which does the same),
 * instead of dropping a spawn-fixed class boon the moment the other kit is active.
 */
export function ownedSkillRows(
  activeClass: ClassId,
  identityClass: ClassId,
  upgrades: string[],
  charUpgrades: string[],
  subSkills: string[],
): OwnedSkillRow[] {
  const table = previewAbilityTable(activeClass, charUpgrades);
  // The class/hybrid upgrades + grafts are already baked into `table` (they mutate the
  // def); the GENERIC boons (Mighty/Haste/Focus and any upgrade that tugs the player's
  // damage/cooldown/cast multipliers) are applied by the sim at use-time, so fold them
  // into every line here — the same generic-then-class resolution the spawn does, off the
  // IDENTITY class so a multiclass hero's spawn-fixed boons survive a kit swap — so a
  // skill reads its REAL effective damage / cooldown / cast at a glance.
  const stats = previewPlayerStats(identityClass, upgrades, charUpgrades);
  const mods: DescribeMods = {
    damageMult: stats.damageMult,
    cooldownMult: stats.cooldownMult,
    castMult: stats.castMult,
  };
  // The sim floors ONLY the basic slot's cooldown (world tick, at BASIC_CD_FLOOR); fold
  // that same floor into the basic line so a heavily-Haste-stacked basic never prints
  // below the cooldown the sim actually delivers.
  const basicMods: DescribeMods = { ...mods, cooldownFloor: BASIC_CD_FLOOR };
  const rows: OwnedSkillRow[] = BASE_SLOTS.map((slot) => ({
    key: slot,
    slot,
    name: table[slot].name,
    line: describeAbility(table[slot], slot === 'basic' ? basicMods : mods),
  }));
  subSkills.forEach((id, i) => {
    const sk = getSubSkill(id);
    if (!sk) return;
    const owner = subclassOfSkill(id)?.classId;
    if (owner != null && owner !== activeClass) return; // not usable by the active class
    // Resolve the sub-ability through its own Honed boons + subclass grands (like the
    // HUD tooltip), then fold the generics — so a sub-skill line is as accurate as the
    // base kit's, not the raw authored numbers.
    const ability = previewSubAbility(id, charUpgrades) ?? sk.ability;
    rows.push({
      key: id,
      slot: i === 0 ? 'sub1' : 'sub2',
      name: `${sk.icon} ${sk.name}`,
      line: describeAbility(ability, mods),
    });
  });
  return rows;
}
