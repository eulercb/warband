/**
 * Warband — handbook-style "Class Codex" card.
 *
 * A parchment Player's-Handbook stat block for one class: name / role / blurb,
 * the Hit-Points · Speed · Threat line, and one row per base ability (a key chip
 * + the ability name + its concrete effect line). Every number is read LIVE from
 * the engine — `getClass(id)` for the name + vitals and `previewAbilityTable` +
 * `describeAbility` for the kit (exactly what the fight commits) — so the card can
 * never drift from the real values. Resolving through `getClass` (not the raw
 * `CLASSES` table) means a Chaos Forge run shows the FORGED name + recomputed vitals
 * over the forged ability rows, instead of a base name above fused rows (item 3/4);
 * it returns the canonical def when Forge is off, so non-Forge cards are unchanged.
 * Slot chips follow the player's live keyboard bindings (LMB / Q / E / R by default).
 * Used by both the lobby class grid and the main-menu hero picker.
 */
import type { CSSProperties } from 'react';
import { getClass, describeAbility } from '../../engine/content/classes';
import { previewAbilityTable } from '../../engine/content/charUpgrades';
import { useBindings, codeToLabel, SLOT_ACTION } from '../../input/bindings';
import type { ClassId, AbilitySlot } from '../../engine/core/types';

/** The four base-kit slots, in card order. */
const KIT_SLOTS: AbilitySlot[] = ['basic', 'a1', 'a2', 'a3'];

/**
 * Per-class parchment accent — each `--cls-*` token darkened to keep ~4.5:1
 * contrast as text on the parchment surface (#f0e5c8). The four originals are the
 * design-spec values; the expansion classes derive the same way. Drives the card's
 * accent ribbon and the class-name colour.
 */
const CODEX_ACCENTS: Record<ClassId, string> = {
  knight: '#2d5f96',
  ranger: '#2e7d43',
  mage: '#6b3fb8',
  cleric: '#9a6b1a',
  barbarian: '#a5471c',
  rogue: '#565b63',
  paladin: '#8a6f1f',
  druid: '#2f7d4a',
  bard: '#a63c86',
  monk: '#1f7a6e',
  sorcerer: '#b2401d',
  warlock: '#5a3494',
};

/**
 * Chip label for a kit slot: the basic slot always fires on left-mouse, so it
 * shows `LMB`; the three abilities show their live primary keyboard binding
 * (Q / E / R by default, or whatever the player has rebound them to).
 */
function slotKey(slot: AbilitySlot, keys: Record<string, string[]>): string {
  if (slot === 'basic') return 'LMB';
  const action = SLOT_ACTION[slot];
  const label = codeToLabel(keys[action]?.[0]);
  return label === '—' ? slot.toUpperCase() : label;
}

/** Threat multiplier as `×1.5` / `×1.0` / `×0.5` (a whole number gets a `.0`). */
function formatThreat(mult: number): string {
  const body = Number.isInteger(mult) ? mult.toFixed(1) : String(mult);
  return `×${body}`;
}

export interface CodexCardProps {
  classId: ClassId;
  selected: boolean;
  onSelect: (id: ClassId) => void;
}

export function CodexCard({ classId, selected, onSelect }: CodexCardProps) {
  // getClass (not CLASSES[...]) so a Forge run shows the forged name + recomputed
  // vitals that match the forged ability rows below (item 3/4); canonical when off.
  const def = getClass(classId);
  // Subscribe to the bindings store so the key chips stay live if a player rebinds.
  const keys = useBindings((s) => s.bindings.keys);
  // Spawn-resolved kit table — the same source the lobby tooltip used, rendered
  // in-card instead of a hover title. No hardcoded numbers.
  const table = previewAbilityTable(classId, []);
  const accent = CODEX_ACCENTS[classId] ?? '#5b4a30';

  return (
    <button
      type="button"
      data-cls={classId}
      className={`wb-codex-card${selected ? ' selected' : ''}`}
      style={{ '--codex-accent': accent } as CSSProperties}
      onClick={() => onSelect(classId)}
      aria-pressed={selected}
    >
      <span className="wb-codex-ribbon" aria-hidden="true" />
      <span className="wb-codex-body">
        <span className="wb-codex-head">
          <span className="wb-codex-name">{def.name}</span>
          {selected ? <span className="wb-codex-badge">✓ Your hero</span> : null}
        </span>
        <span className="wb-codex-role">{def.role}</span>

        <span className="wb-codex-divider" aria-hidden="true" />
        <span className="wb-codex-stats">
          <b>Hit Points</b> {def.maxHp} &nbsp;·&nbsp; <b>Speed</b> {def.moveSpeed} &nbsp;·&nbsp;{' '}
          <b>Threat</b> {formatThreat(def.threatMult)}
        </span>
        <span className="wb-codex-blurb">{def.blurb}</span>

        <span className="wb-codex-divider" aria-hidden="true" />
        <span className="wb-codex-abilities">
          {KIT_SLOTS.map((slot) => {
            const ab = table[slot];
            return (
              <span className="wb-codex-ability" key={slot}>
                <span className="wb-codex-key">{slotKey(slot, keys)}</span>
                <span className="wb-codex-ab">
                  <b className="wb-codex-ab-name">{ab.name}.</b>{' '}
                  <span className="wb-codex-ab-line">{describeAbility(ab)}</span>
                </span>
              </span>
            );
          })}
        </span>
      </span>
    </button>
  );
}

export default CodexCard;
