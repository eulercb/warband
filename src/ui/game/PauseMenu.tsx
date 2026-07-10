/**
 * Warband — in-fight pause menu overlay. Shown to EVERY player while the shared
 * sim is paused (any player may pause; the host is authoritative). Anyone can
 * hit Resume, which starts a shared countdown before control returns. The host
 * additionally sees an "End Run" control to finish the fight early.
 */
import { useRef } from 'react';
import { useStore } from '../state/store';
import { useHudStore } from '../state/hudStore';
import { endRun, leaveToMenu, openControls, playUiSound } from '../state/session';
import { useGamepadMenu } from '../../input/useGamepadMenu';
import TerrainLegend from './TerrainLegend';

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

        <TerrainLegend />
      </div>
    </div>
  );
}
