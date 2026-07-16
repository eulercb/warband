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
 */
export function ownedSkillRows(
  classId: ClassId,
  upgrades: string[],
  charUpgrades: string[],
  subSkills: string[],
): OwnedSkillRow[] {
  const table = previewAbilityTable(classId, charUpgrades);
  // The class/hybrid upgrades + grafts are already baked into `table` (they mutate the
  // def); the GENERIC boons (Mighty/Haste/Focus and any upgrade that tugs the player's
  // damage/cooldown/cast multipliers) are applied by the sim at use-time, so fold them
  // into every line here — the same generic-then-class resolution the spawn does — so a
  // skill reads its REAL effective damage / cooldown / cast at a glance.
  const stats = previewPlayerStats(classId, upgrades, charUpgrades);
  const mods: DescribeMods = {
    damageMult: stats.damageMult,
    cooldownMult: stats.cooldownMult,
    castMult: stats.castMult,
  };
  const rows: OwnedSkillRow[] = BASE_SLOTS.map((slot) => ({
    key: slot,
    slot,
    name: table[slot].name,
    line: describeAbility(table[slot], mods),
  }));
  subSkills.forEach((id, i) => {
    const sk = getSubSkill(id);
    if (!sk) return;
    const owner = subclassOfSkill(id)?.classId;
    if (owner != null && owner !== classId) return; // not usable by the active class
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
