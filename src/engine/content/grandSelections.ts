/** Versioned earned bank and per-class selections. Never mutate normal upgrade history. */
import type { AbilitySlot, ClassId } from '../core/types';
import { CLASS_IDS } from './classes';
import { CHAR_UPGRADES, canonicalGrandId, occupancyAfter, upgradeAllowedFor } from './charUpgrades';
import { subclassOfSkill } from './subclasses';
export interface GrandSelection {
  bank: string[];
  equipped: string[];
}
export interface GrandLoadout {
  version: 1;
  classes: Partial<Record<ClassId, GrandSelection>>;
}
export interface GrandContext {
  classes: readonly ClassId[];
  history: readonly string[];
  subSkills: readonly string[];
}
export interface GrandRequest {
  classId: ClassId;
  id: string;
  action: 'earn' | 'equip' | 'unequip';
  replace?: string;
}
export const emptyGrandLoadout = (): GrandLoadout => ({ version: 1, classes: {} });
// Single-skill legacy class entries fold directly into their occupied base bucket.
const FOLDED_BASE: Record<string, AbilitySlot | undefined> = {
  kn_grand_wrath: 'basic',
  rg_grand_deadeye: 'basic',
  rg_grand_storm: 'a1',
  mg_grand_cataclysm: 'a1',
  ro_grand_venom: 'a3',
  dr_grand_grove: 'a1',
  ba_grand_symphony: 'a1',
  so_grand_wild: 'basic',
  so_grand_cataclysm: 'a1',
  wa_grand_pact: 'basic',
};
export function grandCategory(id: string): 'base' | 'skill' | 'identity' | 'legacy' | null {
  const d = CHAR_UPGRADES[id];
  if (!d?.grand) return null;
  return d.subSkillId
    ? 'skill'
    : d.graftId || d.skillSlot || FOLDED_BASE[id]
      ? 'base'
      : d.subclassId
        ? 'identity'
        : 'legacy';
}
export function grandSlot(id: string): AbilitySlot | undefined {
  const d = CHAR_UPGRADES[id];
  return d?.graftId ? CHAR_UPGRADES[d.graftId]?.replaces : (d?.skillSlot ?? FOLDED_BASE[id]);
}
export function grandEligible(id: string, classId: ClassId, ctx: GrandContext): boolean {
  const d = CHAR_UPGRADES[id];
  if (!d?.grand || !ctx.classes.includes(classId) || !upgradeAllowedFor(d, classId)) return false;
  const bound = ctx.subSkills
    .filter((sid) => subclassOfSkill(sid)?.classId === classId)
    .slice(0, 2);
  const committed = bound.length ? subclassOfSkill(bound[0])?.id : undefined;
  if (d.subclassId && d.subclassId !== committed) return false;
  if (
    d.subSkillId &&
    (!bound.includes(d.subSkillId) || subclassOfSkill(d.subSkillId)?.id !== committed)
  )
    return false;
  const slot = grandSlot(id);
  if (slot) {
    const occupant = occupancyAfter(classId, ctx.history)[slot];
    if (occupant !== (d.graftId ?? slot)) return false;
  }
  return true;
}
export function grandEarnable(id: string, classId: ClassId, ctx: GrandContext): boolean {
  return (
    canonicalGrandId(id) === id &&
    grandEligible(id, classId, ctx) &&
    (grandCategory(id) !== 'legacy' ||
      ctx.subSkills.some((sid) => subclassOfSkill(sid)?.classId === classId))
  );
}
function fits(ids: readonly string[], candidate: string): boolean {
  const category = (id: string) =>
    grandCategory(id) === 'legacy' ? 'identity' : grandCategory(id);
  const bucket = category(candidate);
  const same = ids.filter((id) => category(id) === bucket);
  return bucket === 'base'
    ? same.length < 2 && !same.some((id) => grandSlot(id) === grandSlot(candidate))
    : (bucket === 'identity' || bucket === 'skill') && same.length === 0;
}
/** Old accumulated grands remain earned; first valid choices occupy legal buckets. */
export function normalizeGrandLoadout(
  value: GrandLoadout | undefined,
  ctx: GrandContext,
): GrandLoadout {
  const result = emptyGrandLoadout();
  for (const classId of CLASS_IDS.filter((c) => ctx.classes.includes(c))) {
    const saved = value?.version === 1 ? value.classes?.[classId] : undefined;
    const legacy = ctx.history
      .filter((id) => CHAR_UPGRADES[id]?.grand && upgradeAllowedFor(CHAR_UPGRADES[id], classId))
      .map(canonicalGrandId);
    const bank = [
      ...new Set([
        ...(Array.isArray(saved?.bank)
          ? saved.bank.filter((id): id is string => typeof id === 'string').map(canonicalGrandId)
          : []),
        ...legacy,
      ]),
    ].filter((id) => CHAR_UPGRADES[id]?.grand && upgradeAllowedFor(CHAR_UPGRADES[id], classId));
    const equipped: string[] = [];
    for (const id of (Array.isArray(saved?.equipped) ? saved.equipped : value ? [] : bank)
      .filter((id): id is string => typeof id === 'string')
      .map(canonicalGrandId))
      if (bank.includes(id) && grandEligible(id, classId, ctx) && fits(equipped, id))
        equipped.push(id);
    result.classes[classId] = { bank, equipped };
  }
  return result;
}
/** Invalid/ambiguous replacements reject atomically; earning at capacity still banks the option. */
export function changeGrand(
  value: GrandLoadout,
  ctx: GrandContext,
  request: GrandRequest,
  canEarn = false,
): GrandLoadout | null {
  const state = normalizeGrandLoadout(value, ctx);
  const { classId, action } = request;
  const id = canonicalGrandId(request.id);
  const replace = request.replace && canonicalGrandId(request.replace);
  if (!ctx.classes.includes(classId)) return null;
  const selected = state.classes[classId];
  if (!selected || !grandEligible(id, classId, ctx)) return null;
  if (action === 'earn') {
    if (!canEarn || !grandEarnable(id, classId, ctx) || selected.bank.includes(id)) return null;
    selected.bank.push(id);
    if (fits(selected.equipped, id)) selected.equipped.push(id);
    return state;
  }
  if (!selected.bank.includes(id)) return null;
  if (action === 'unequip') {
    if (!selected.equipped.includes(id)) return null;
    selected.equipped = selected.equipped.filter((x) => x !== id);
    return state;
  }
  if (action !== 'equip' || selected.equipped.includes(id)) return null;
  if (
    replace &&
    (!selected.equipped.includes(replace) ||
      (grandCategory(replace) === 'legacy' ? 'identity' : grandCategory(replace)) !==
        (grandCategory(id) === 'legacy' ? 'identity' : grandCategory(id)))
  )
    return null;
  const next = selected.equipped.filter((x) => x !== replace);
  if (!fits(next, id)) return null;
  selected.equipped = [...next, id];
  return state;
}
export function grandHistory(
  classId: ClassId,
  history: readonly string[],
  state: GrandLoadout | undefined,
  subSkills: readonly string[] = [],
): string[] {
  if (!state) {
    const seen = new Set<string>();
    return history.flatMap((id) => {
      const canonical = canonicalGrandId(id);
      if (CHAR_UPGRADES[id]?.grand) {
        if (seen.has(canonical)) return [];
        seen.add(canonical);
      }
      return [canonical];
    });
  }
  const ctx = { classes: Object.keys(state.classes) as ClassId[], history, subSkills };
  const selected = normalizeGrandLoadout(state, ctx).classes[classId]?.equipped ?? [];
  return [...history.filter((id) => !CHAR_UPGRADES[id]?.grand), ...selected];
}
