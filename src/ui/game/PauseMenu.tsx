/**
 * Warband — in-fight pause menu overlay. Shown to EVERY player while the shared
 * sim is paused (any player may pause; the host is authoritative). Anyone can
 * hit Resume, which starts a shared countdown before control returns. The host
 * additionally sees an "End Run" control to finish the fight early.
 */
import { useMemo, useRef } from 'react';
import { useStore } from '../state/store';
import { useHudStore } from '../state/hudStore';
import { endRun, leaveToMenu, openControls, playUiSound } from '../state/session';
import { useGamepadMenu } from '../../input/useGamepadMenu';
import { previewPlayerStats, PERSISTENT_STATS } from '../../engine/content/charUpgrades';
import { CLASSES, getClass } from '../../engine/content/classes';
import { useBindings, keyLabelFor, padLabelFor, SLOT_ACTION } from '../../input/bindings';
import type { InputSource } from '../../input/input';
import { ownedSkillRows } from './pauseSkills';
import TerrainLegend from './TerrainLegend';

/**
 * The local hero's live character sheet (item: know your current stats). Resolved
 * from the owned run boons — no per-frame data, no wire cost. Exported so the
 * (local, no-sim) reward-room pause overlay can reuse it.
 *
 * A multiclass hero's PERSISTENT stats (maxHp, moveSpeed, damageMult, …) are
 * IDENTITY-BOUND: the sim resolves them once at spawn from the hero's spawn class +
 * run boons and never recomputes them on a class swap — `setActiveClass` swaps only
 * the kit/cooldowns (see world.ts). So the sheet must preview against that spawn
 * identity (`classes[0]` for a multiclass hero, else the sole active class), or its
 * numbers would drift from the authoritative sim the instant the hero swaps (#70).
 * The ACTIVE class's kit is shown separately by <OwnedSkills>, so nothing is lost.
 */
export function CharacterSheet() {
  const classId = useHudStore((s) => s.classId);
  const classes = useHudStore((s) => s.classes);
  const hp = useHudStore((s) => s.hp);
  const maxHp = useHudStore((s) => s.maxHp);
  const myUpgrades = useStore((s) => s.myUpgrades);
  const myCharUpgrades = useStore((s) => s.myCharUpgrades);
  // Spawn/identity class: first owned class for a multiclass hero (buildMulticlass
  // seeds `classes` as [spawnClass, ...extras]), else the active class (single-class
  // heroes never swap, so active === identity there).
  const identityClass = classes[0] ?? classId;
  const stats = useMemo(
    () => (identityClass ? previewPlayerStats(identityClass, myUpgrades, myCharUpgrades) : null),
    [identityClass, myUpgrades, myCharUpgrades],
  );
  if (!identityClass || !stats) return null;
  // Run-aware base (getClass): the move delta shows what the BOONS added, not the roll.
  const baseMove = getClass(identityClass).moveSpeed;
  // Rows come from the single PERSISTENT_STATS model (charUpgrades.ts) — crit and any
  // future stat mechanic appear here with no local edit. Skip readout-only stats
  // (maxHp lives in the header) and rows still at their neutral default.
  const rows: Array<[string, string, boolean]> = PERSISTENT_STATS.filter(
    (r) => r.panelRow !== false && (!r.show || r.show(stats)),
  ).map((r): [string, string, boolean] => {
    const { text, good } = r.cell(stats, { baseMoveSpeed: baseMove });
    return [r.label, text, good];
  });
  return (
    <div className="wb-pause-stats">
      <span className="wb-field-label">
        {CLASSES[identityClass].name} — {Math.round(hp)}/{Math.round(maxHp)} HP
      </span>
      <div className="wb-pause-stat-grid">
        {rows.map(([label, val, good]) => (
          <div key={label} className="wb-pause-stat">
            <span className="wb-pause-stat-label">{label}</span>
            <span className={`wb-pause-stat-val${val === '—' ? '' : good ? ' good' : ' bad'}`}>
              {val}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Button label for a slot, keyboard or controller per the active device. */
function slotLabel(slot: keyof typeof SLOT_ACTION, source: InputSource): string {
  const action = SLOT_ACTION[slot];
  return source === 'gamepad' ? padLabelFor(action) : keyLabelFor(action);
}

/**
 * The local hero's owned-skill review (item 6). Unlike the HUD's hover-only tile
 * tooltips, every skill's numeric line is always visible here — the pause menu is a
 * read/review surface. Reuses the same resolved data as the HUD, so it reflects the
 * hero's live upgrades with no sim/wire cost.
 */
export function OwnedSkills() {
  const classId = useHudStore((s) => s.classId);
  const classes = useHudStore((s) => s.classes);
  const subSkills = useHudStore((s) => s.subSkills);
  const source = useHudStore((s) => s.inputSource);
  const myUpgrades = useStore((s) => s.myUpgrades);
  const myCharUpgrades = useStore((s) => s.myCharUpgrades);
  // Spawn/identity class (first owned; buildMulticlass seeds `classes` as [spawn, …extras]).
  // The active class picks which kit is shown; the identity class is what the sim gated the
  // hero's boons on at spawn, so fold the mults off it (matches CharacterSheet above).
  const identityClass = classes[0] ?? classId;
  // Re-render on rebinds so the per-skill key badges stay accurate.
  useBindings((s) => s.bindings);
  const rows = useMemo(
    () =>
      classId && identityClass
        ? ownedSkillRows(classId, identityClass, myUpgrades, myCharUpgrades, subSkills)
        : [],
    [classId, identityClass, myUpgrades, myCharUpgrades, subSkills],
  );
  if (!classId || rows.length === 0) return null;
  return (
    <div className="wb-pause-skills">
      <span className="wb-field-label">Your skills</span>
      <ul className="wb-pause-skill-list">
        {rows.map((r) => (
          <li key={r.key} className="wb-pause-skill" aria-label={`${r.name}: ${r.line}`}>
            <span className="wb-pause-skill-key" aria-hidden="true">
              {slotLabel(r.slot, source)}
            </span>
            <div className="wb-pause-skill-body">
              <span className="wb-pause-skill-name">{r.name}</span>
              <span className="wb-pause-skill-line">{r.line}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PauseMenu({ onResume }: { onResume: () => void }) {
  const isHost = useStore((s) => s.isHost);
  const pausedBy = useStore((s) => s.pausedBy);
  const cycle = useStore((s) => s.cycle);
  const score = useHudStore((s) => s.score);
  const teammates = useHudStore((s) => s.teammates);
  const panelRef = useRef<HTMLDivElement>(null);
  useGamepadMenu(panelRef, { onBack: onResume });

  const onResumeClick = (): void => {
    playUiSound('uiClick');
    onResume();
  };

  const onEndRun = (): void => {
    playUiSound('uiConfirm');
    endRun();
  };

  const onControls = (): void => {
    playUiSound('uiClick');
    openControls();
  };

  const onLeave = (): void => {
    playUiSound('uiClick');
    leaveToMenu();
  };

  const sorted = [...teammates].sort((a, b) => b.score - a.score);

  return (
    <div className="wb-overlay" role="dialog" aria-modal="true" aria-label="Paused">
      <div className="wb-panel wb-pause-panel" ref={panelRef}>
        <h2 className="wb-title wb-title-sm">Paused</h2>
        <p className="wb-subtitle">
          {pausedBy
            ? `${pausedBy} paused the fight — it's frozen for everyone. Anyone can resume.`
            : 'The fight is frozen for everyone. Anyone can resume.'}
        </p>

        <div className="wb-pause-score">
          <div className="wb-pause-score-mine">
            <span className="wb-field-label">Your run score</span>
            <span className="wb-score-big">★ {score}</span>
            {cycle > 0 ? <span className="wb-cycle-tag">Cycle {cycle + 1}</span> : null}
          </div>
          {sorted.length > 1 ? (
            <ul className="wb-pause-score-list">
              {sorted.map((t) => (
                <li key={t.id} className={t.isLocal ? 'is-local' : ''}>
                  <span className="wb-pause-score-name">
                    {t.name || 'Hero'}
                    {t.isLocal ? ' (you)' : ''}
                  </span>
                  <span className="wb-pause-score-val">★ {t.score}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <CharacterSheet />

        <OwnedSkills />

        <TerrainLegend />

        {/* Primary actions pinned to the panel's bottom edge: with a tall run
         * (4-player scores + character sheet + skills + legend) the content
         * outruns the viewport, so a static button row fell below the fold and
         * the panel edge sliced it. Sticky keeps all four reachable while the
         * rest scrolls behind it. (#82) */}
        <div className="wb-pause-actions">
          <button type="button" className="wb-btn wb-btn-primary wb-btn-lg" onClick={onResumeClick}>
            Resume
          </button>
          <button type="button" className="wb-btn wb-btn-ghost" onClick={onControls}>
            Controls
          </button>
          {isHost ? (
            <button type="button" className="wb-btn wb-btn-danger" onClick={onEndRun}>
              End Run
            </button>
          ) : null}
          <button type="button" className="wb-btn wb-btn-ghost" onClick={onLeave}>
            Leave to Menu
          </button>
        </div>
      </div>
    </div>
  );
}
