import { applyUpgrades, type UpgradeId } from './upgrades';
/** Active-class grand stat overlays; rebuild from one identity-bound neutral block. */
import type { Player, ClassId } from '../core/types';
import {
  stubPlayer,
  applyCharUpgrades,
  applySubclassGrands,
  previewAbilityTable,
  previewSubAbility,
  CHAR_UPGRADES,
  type PreviewedStats,
} from './charUpgrades';
import { subclassOfSkill } from './subclasses';
import { grandHistory, type GrandLoadout } from './grandSelections';
const KEYS = [
  'maxHp',
  'moveSpeed',
  'damageMult',
  'cooldownMult',
  'castMult',
  'damageTakenMult',
  'terrainResist',
  'regenPerSec',
  'critChance',
  'critMult',
] as const;
export function snapshotGrandStats(p: Player): PreviewedStats {
  return {
    maxHp: p.maxHp,
    moveSpeed: p.moveSpeed,
    damageMult: p.damageMult,
    cooldownMult: p.cooldownMult,
    castMult: p.castMult,
    damageTakenMult: p.damageTakenMult,
    terrainResist: p.terrainResist,
    regenPerSec: p.regenPerSec,
    critChance: p.critChance,
    critMult: p.critMult,
  };
}
export function buildGrandStats(
  neutral: PreviewedStats,
  classes: ClassId[],
  history: string[],
  loadout: GrandLoadout,
  subs: string[],
  applyExtras: (player: Player) => void,
): Partial<Record<ClassId, PreviewedStats>> {
  const ordinary = history.filter((id) => !CHAR_UPGRADES[id]?.grand);
  return Object.fromEntries(
    classes.map((classId) => {
      const selected = grandHistory(classId, history, loadout, subs).filter(
        (id) => CHAR_UPGRADES[id]?.grand,
      );
      const stub: Player = {
        ...stubPlayer(classId),
        ...neutral,
        hp: neutral.maxHp,
        classId,
        abilities: previewAbilityTable(classId, ordinary),
        subSkillIds: subs,
        subAbilities: {},
      };
      subs
        .filter((id) => subclassOfSkill(id)?.classId === classId)
        .slice(0, 2)
        .forEach((id, i) => {
          const ab = previewSubAbility(id, ordinary);
          if (ab) stub.subAbilities![i === 0 ? 'sub1' : 'sub2'] = ab;
        });
      applyCharUpgrades(stub, selected);
      applySubclassGrands(stub, selected);
      applyExtras(stub);
      return [classId, snapshotGrandStats(stub)];
    }),
  );
}
export function activateGrandStats(p: Player, values: PreviewedStats | undefined): void {
  if (!values) return;
  const fraction = p.maxHp > 0 ? Math.min(1, p.hp / p.maxHp) : 0;
  for (const key of KEYS) p[key] = values[key];
  p.hp = fraction * p.maxHp;
}

/** Same identity-bound neutral stats as the host, with only the active grand overlay. */
export function previewGrandStats(
  identity: ClassId,
  active: ClassId,
  generic: string[],
  history: string[],
  loadout: GrandLoadout,
  subs: string[],
): PreviewedStats {
  const p = stubPlayer(identity);
  applyUpgrades(p, generic as UpgradeId[]);
  applyCharUpgrades(
    p,
    history.filter((id) => !CHAR_UPGRADES[id]?.grand),
  );
  return buildGrandStats(snapshotGrandStats(p), [active], history, loadout, subs, () => {})[
    active
  ]!;
}
