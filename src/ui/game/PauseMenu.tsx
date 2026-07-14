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
import { previewPlayerStats } from '../../engine/content/charUpgrades';
import { CLASSES, getClass } from '../../engine/content/classes';
import { useBindings, keyLabelFor, padLabelFor, SLOT_ACTION } from '../../input/bindings';
import type { InputSource } from '../../input/input';
import { ownedSkillRows } from './pauseSkills';
import TerrainLegend from './TerrainLegend';

/** Signed percentage from a multiplier delta (0 → "—", 0.3 → "+30%", -0.18 → "-18%"). */
function pctDelta(delta: number): string {
  const n = Math.round(delta * 100);
  if (n === 0) return '—';
  return `${n > 0 ? '+' : ''}${n}%`;
}

/**
 * The local hero's live character sheet (item: know your current stats). Resolved
 * from the owned run boons for the ACTIVE class — no per-frame data, no wire cost.
 * Exported so the (local, no-sim) reward-room pause overlay can reuse it.
 */
export function CharacterSheet() {
  const classId = useHudStore((s) => s.classId);
  const hp = useHudStore((s) => s.hp);
  const maxHp = useHudStore((s) => s.maxHp);
  const myUpgrades = useStore((s) => s.myUpgrades);
  const myCharUpgrades = useStore((s) => s.myCharUpgrades);
  const stats = useMemo(
    () => (classId ? previewPlayerStats(classId, myUpgrades, myCharUpgrades) : null),
    [classId, myUpgrades, myCharUpgrades],
  );
  if (!classId || !stats) return null;
  // Run-aware base (getClass): the delta shows what the BOONS added, not the roll.
  const baseMove = getClass(classId).moveSpeed;
  const rows: Array<[string, string, boolean]> = [
    ['Damage', pctDelta(stats.damageMult - 1), stats.damageMult >= 1],
    ['Damage taken', pctDelta(stats.damageTakenMult - 1), stats.damageTakenMult <= 1],
    ['Cooldowns', pctDelta(stats.cooldownMult - 1), stats.cooldownMult <= 1],
    ['Cast time', pctDelta(stats.castMult - 1), stats.castMult <= 1],
    ['Move speed', pctDelta(stats.moveSpeed / baseMove - 1), stats.moveSpeed >= baseMove],
  ];
  if (stats.regenPerSec > 0) rows.push(['Regen', `${stats.regenPerSec.toFixed(1)} HP/s`, true]);
  if (stats.terrainResist > 0) rows.push(['Terrain resist', pctDelta(stats.terrainResist), true]);
  return (
    <div className="wb-pause-stats">
      <span className="wb-field-label">
        {CLASSES[classId].name} — {Math.round(hp)}/{Math.round(maxHp)} HP
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
  const subSkills = useHudStore((s) => s.subSkills);
  const source = useHudStore((s) => s.inputSource);
  const myCharUpgrades = useStore((s) => s.myCharUpgrades);
  // Re-render on rebinds so the per-skill key badges stay accurate.
  useBindings((s) => s.bindings);
  const rows = useMemo(
    () => (classId ? ownedSkillRows(classId, myCharUpgrades, subSkills) : []),
    [classId, myCharUpgrades, subSkills],
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
