/** Compare two legal selections, including the identity-bound stats of a multiclass hero. */
import { describeAbility } from '../../engine/content/classes';
import {
  previewAbilityTable,
  previewSubAbility,
  PERSISTENT_STATS,
} from '../../engine/content/charUpgrades';
import { previewGrandStats } from '../../engine/content/grandStats';
import {
  grandHistory,
  type GrandContext,
  type GrandLoadout,
} from '../../engine/content/grandSelections';
import { subclassOfSkill } from '../../engine/content/subclasses';
import type { ClassId } from '../../engine/core/types';
import type { UpgradeId } from '../../engine/content/upgrades';
export function describeGrandTransition(
  classId: ClassId,
  context: GrandContext,
  before: GrandLoadout,
  after: GrandLoadout,
  generic: readonly UpgradeId[],
): string {
  const oldHistory = grandHistory(classId, context.history, before, context.subSkills);
  const newHistory = grandHistory(classId, context.history, after, context.subSkills);
  const oldStats = previewGrandStats(
    context.classes[0],
    classId,
    [...generic],
    [...context.history],
    before,
    [...context.subSkills],
  );
  const newStats = previewGrandStats(
    context.classes[0],
    classId,
    [...generic],
    [...context.history],
    after,
    [...context.subSkills],
  );
  const oldTable = previewAbilityTable(classId, oldHistory),
    newTable = previewAbilityTable(classId, newHistory);
  const rows = (['basic', 'a1', 'a2', 'a3'] as const).map(
    (slot) => [oldTable[slot], newTable[slot]] as const,
  );
  for (const id of context.subSkills
    .filter((sid) => subclassOfSkill(sid)?.classId === classId)
    .slice(0, 2))
    rows.push([previewSubAbility(id, oldHistory)!, previewSubAbility(id, newHistory)!]);
  const changes: string[] = [];
  for (const [oldAbility, newAbility] of rows) {
    const previous = describeAbility(oldAbility, oldStats),
      next = describeAbility(newAbility, newStats);
    if (previous !== next) changes.push(`${newAbility.name}: ${next} (was ${previous})`);
  }
  for (const stat of PERSISTENT_STATS) {
    const previous = stat.readout(oldStats),
      next = stat.readout(newStats);
    if (previous !== next) changes.push(`${stat.label}: ${next} (was ${previous})`);
  }
  return changes.length
    ? `Now → ${changes.join(' · ')}`
    : 'Core numbers unchanged; see the grand effect above.';
}
