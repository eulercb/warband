/**
 * Warband — Single-fight TEST LOADOUT editor (item: lobby loadout).
 *
 * A collapsible, host-only panel shown in the lobby for a single fight. It lets a
 * tester build essentially ANY loadout to try against the chosen boss — extra classes
 * (multiclass), subclass skills, class boons at a chosen rank, grand improvements,
 * per-sub-skill "Honed" boons, and generic boons at a chosen rank — then re-open and
 * adjust it freely between attempts without recreating the room.
 *
 * The selection lives in the store (`sfLoadout`); the Host reads it LIVE at startFight,
 * so the latest pick is always what spawns, and the pause menu reflects it. Every list
 * is derived from the content tables (no per-item wiring), so new classes, skills, boons
 * and grands appear automatically. Caps are enforced here so a test build can't reach an
 * impossible state: generic/class-boon ranks clamp to each id's `maxStacks`, grands to 1,
 * subclass skills to MAX_SF_SUBSKILLS, and class-specific picks are pruned when they no
 * longer belong to the active class or an owned extra class.
 */
import { useEffect } from 'react';
import { useStore } from '../state/store';
import type { SfLoadout } from '../state/store';
import { playUiSound } from '../state/session';
import { CLASS_IDS, CLASSES } from '../../engine/content/classes';
import { subclassesFor, subclassOfSkill } from '../../engine/content/subclasses';
import {
  CHAR_UPGRADES,
  CHAR_UPGRADES_BY_CLASS,
  SUB_SKILL_UPGRADES,
  charUpgradeMaxStacks,
  offerableGrands,
} from '../../engine/content/charUpgrades';
import { UPGRADE_IDS, getUpgrade, upgradeMaxStacks } from '../../engine/content/upgrades';
import type { UpgradeId } from '../../engine/content/upgrades';
import type { ClassId } from '../../engine/core/types';

/** Subclass skills a single hero may be granted up front (matches the fight cap). */
const MAX_SF_SUBSKILLS = 2;
/** Extra classes a test build may stack for multiclass swapping. */
const MAX_SF_EXTRA_CLASSES = 3;

const countOf = (id: string, arr: readonly string[]): number =>
  arr.reduce((n, x) => (x === id ? n + 1 : n), 0);

/** Return `arr` with exactly `n` copies of `id` (dropping any it already held). */
const withCount = (id: string, n: number, arr: readonly string[]): string[] => [
  ...arr.filter((x) => x !== id),
  ...(Array(n).fill(id) as string[]),
];

export function LoadoutEditor() {
  const isHost = useStore((s) => s.isHost);
  const gauntlet = useStore((s) => s.gauntlet);
  const localClass = useStore((s) => s.localClass);
  const lo = useStore((s) => s.sfLoadout);
  const setSfLoadout = useStore((s) => s.setSfLoadout);
  const open = useStore((s) => s.sfLoadoutOpen);
  const setOpen = useStore((s) => s.setSfLoadoutOpen);

  // Prune class-specific picks that no longer belong to the active class or an owned
  // extra class (switching class mustn't leave a Mage boon smearing a Knight's kit).
  useEffect(() => {
    const valid = new Set<ClassId>([localClass, ...lo.extraClasses]);
    const char = lo.charUpgrades.filter((id) => {
      const def = CHAR_UPGRADES[id];
      if (!def) return false;
      return def.classId === 'any' || valid.has(def.classId);
    });
    const subs = lo.subSkills.filter((id) => {
      const owner = subclassOfSkill(id)?.classId;
      return owner == null || valid.has(owner);
    });
    if (char.length !== lo.charUpgrades.length || subs.length !== lo.subSkills.length) {
      setSfLoadout({ ...lo, charUpgrades: char, subSkills: subs });
    }
  }, [localClass, lo, setSfLoadout]);

  if (!isHost || gauntlet) return null;

  const set = (patch: Partial<SfLoadout>): void => setSfLoadout({ ...lo, ...patch });

  // Stackable char/generic boons: click cycles the rank 0 → 1 → … → cap → 0.
  const cycleChar = (id: string): void => {
    playUiSound('uiClick');
    const cap = charUpgradeMaxStacks(id);
    set({ charUpgrades: withCount(id, (countOf(id, lo.charUpgrades) + 1) % (cap + 1), lo.charUpgrades) });
  };
  const cycleGen = (id: UpgradeId): void => {
    playUiSound('uiClick');
    const cap = upgradeMaxStacks(id);
    const next = (countOf(id, lo.upgrades) + 1) % (cap + 1);
    set({ upgrades: withCount(id, next, lo.upgrades) as UpgradeId[] });
  };
  const toggleChar = (id: string): void => {
    playUiSound('uiClick');
    const has = lo.charUpgrades.includes(id);
    set({ charUpgrades: has ? lo.charUpgrades.filter((x) => x !== id) : [...lo.charUpgrades, id] });
  };
  const toggleSub = (id: string): void => {
    const has = lo.subSkills.includes(id);
    if (!has && lo.subSkills.length >= MAX_SF_SUBSKILLS) return;
    playUiSound('uiClick');
    set({ subSkills: has ? lo.subSkills.filter((x) => x !== id) : [...lo.subSkills, id] });
  };
  const toggleExtra = (id: ClassId): void => {
    const has = lo.extraClasses.includes(id);
    if (!has && lo.extraClasses.length >= MAX_SF_EXTRA_CLASSES) return;
    playUiSound('uiClick');
    set({ extraClasses: has ? lo.extraClasses.filter((x) => x !== id) : [...lo.extraClasses, id] });
  };
  const reset = (): void => {
    playUiSound('uiClick');
    set({ upgrades: [], charUpgrades: [], subSkills: [], extraClasses: [] });
  };

  const grands = offerableGrands(localClass, lo.charUpgrades, lo.subSkills);
  const takenGrands = lo.charUpgrades
    .filter((id) => CHAR_UPGRADES[id]?.grand)
    .map((id) => CHAR_UPGRADES[id]);
  const grandList = [...takenGrands, ...grands].filter(
    (d, i, arr) => arr.findIndex((x) => x.id === d.id) === i,
  );
  // Honed boons only enter the pool for the sub-skills the hero has actually equipped.
  const subUpgrades = SUB_SKILL_UPGRADES.filter(
    (u) => u.subSkillId != null && lo.subSkills.includes(u.subSkillId),
  );
  const totalPicks =
    lo.upgrades.length + lo.charUpgrades.length + lo.subSkills.length + lo.extraClasses.length;

  return (
    <div className="wb-field wb-sf-loadout" role="group" aria-label="Test loadout">
      <button
        type="button"
        className={`wb-sf-loadout-toggle${open ? ' open' : ''}`}
        onClick={() => {
          playUiSound('uiClick');
          setOpen(!open);
        }}
        aria-expanded={open}
      >
        <span className="wb-sf-loadout-caret" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
        <span className="wb-gauntlet-title">Test loadout {totalPicks > 0 ? `(${totalPicks})` : ''}</span>
        <span className="wb-gauntlet-sub">
          Grant skills, boons, ranks, grands and extra classes to test a build against this boss.
        </span>
      </button>

      {open ? (
        <div className="wb-sf-loadout-body">
          <div className="wb-sf-loadout-head">
            <span className="wb-gauntlet-sub">Click a boon to cycle its rank; click a chip to toggle.</span>
            <button type="button" className="wb-btn wb-btn-chip" onClick={reset} disabled={totalPicks === 0}>
              Clear
            </button>
          </div>

          <span className="wb-field-label">
            Multiclass — add classes ({lo.extraClasses.length}/{MAX_SF_EXTRA_CLASSES})
          </span>
          <div className="wb-pad-scheme-row">
            {CLASS_IDS.filter((id) => id !== localClass).map((id) => {
              const on = lo.extraClasses.includes(id);
              return (
                <button
                  type="button"
                  key={id}
                  className={`wb-btn wb-btn-chip${on ? ' selected' : ''}`}
                  onClick={() => toggleExtra(id)}
                  aria-pressed={on}
                  disabled={!on && lo.extraClasses.length >= MAX_SF_EXTRA_CLASSES}
                >
                  {CLASSES[id].name}
                </button>
              );
            })}
          </div>

          <span className="wb-field-label">
            Subclass skills — pick up to {MAX_SF_SUBSKILLS} ({lo.subSkills.length}/{MAX_SF_SUBSKILLS})
          </span>
          {subclassesFor(localClass).map((sub) => (
            <div key={sub.id} className="wb-pad-scheme-row" role="group" aria-label={sub.name}>
              {sub.skills.map((sk) => {
                const on = lo.subSkills.includes(sk.id);
                return (
                  <button
                    type="button"
                    key={sk.id}
                    className={`wb-btn wb-btn-chip${on ? ' selected' : ''}`}
                    onClick={() => toggleSub(sk.id)}
                    aria-pressed={on}
                    disabled={!on && lo.subSkills.length >= MAX_SF_SUBSKILLS}
                    title={sk.desc}
                  >
                    {sk.icon} {sk.name}
                  </button>
                );
              })}
            </div>
          ))}

          <span className="wb-field-label">{CLASSES[localClass].name} boons — click to rank up</span>
          <div className="wb-pad-scheme-row">
            {(CHAR_UPGRADES_BY_CLASS[localClass] ?? []).map((u) => {
              const n = countOf(u.id, lo.charUpgrades);
              const cap = charUpgradeMaxStacks(u.id);
              return (
                <button
                  type="button"
                  key={u.id}
                  className={`wb-btn wb-btn-chip${n > 0 ? ' selected' : ''}`}
                  onClick={() => cycleChar(u.id)}
                  aria-pressed={n > 0}
                  title={`${u.desc}${cap > 1 ? ` — up to ×${cap}` : ''}`}
                >
                  {u.icon} {u.name}
                  {n > 0 && cap > 1 ? ` ×${n}` : ''}
                </button>
              );
            })}
          </div>

          {grandList.length > 0 ? (
            <>
              <span className="wb-field-label">Grand improvements</span>
              <div className="wb-pad-scheme-row">
                {grandList.map((g) => {
                  const on = lo.charUpgrades.includes(g.id);
                  return (
                    <button
                      type="button"
                      key={g.id}
                      className={`wb-btn wb-btn-chip wb-btn-grand${on ? ' selected' : ''}`}
                      onClick={() => toggleChar(g.id)}
                      aria-pressed={on}
                      title={g.desc}
                    >
                      {g.icon} {g.name}
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}

          {subUpgrades.length > 0 ? (
            <>
              <span className="wb-field-label">Subclass-skill boons — click to rank up</span>
              <div className="wb-pad-scheme-row">
                {subUpgrades.map((u) => {
                  const n = countOf(u.id, lo.charUpgrades);
                  const cap = charUpgradeMaxStacks(u.id);
                  return (
                    <button
                      type="button"
                      key={u.id}
                      className={`wb-btn wb-btn-chip${n > 0 ? ' selected' : ''}`}
                      onClick={() => cycleChar(u.id)}
                      aria-pressed={n > 0}
                      title={u.desc}
                    >
                      {u.icon} {u.name}
                      {n > 0 && cap > 1 ? ` ×${n}` : ''}
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}

          <span className="wb-field-label">Generic boons — click to rank up</span>
          <div className="wb-pad-scheme-row">
            {UPGRADE_IDS.map((id) => {
              const u = getUpgrade(id);
              const n = countOf(id, lo.upgrades);
              const cap = upgradeMaxStacks(id);
              return (
                <button
                  type="button"
                  key={id}
                  className={`wb-btn wb-btn-chip${n > 0 ? ' selected' : ''}`}
                  onClick={() => cycleGen(id)}
                  aria-pressed={n > 0}
                  title={`${u.desc}${cap > 1 ? ` — up to ×${cap}` : ''}`}
                >
                  {u.icon} {u.name}
                  {n > 0 && cap > 1 ? ` ×${n}` : ''}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default LoadoutEditor;
