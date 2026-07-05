/**
 * Warband — in-fight pause menu overlay. Shown to EVERY player while the shared
 * sim is paused (any player may pause; the host is authoritative). Anyone can
 * hit Resume, which starts a shared countdown before control returns. The host
 * additionally sees an "End Run" control to finish the fight early.
 */
import { useStore } from './store';
import { endRun, leaveToMenu, openControls, playUiSound } from './session';
import TerrainLegend from './TerrainLegend';

export default function PauseMenu({ onResume }: { onResume: () => void }) {
  const isHost = useStore((s) => s.isHost);
  const pausedBy = useStore((s) => s.pausedBy);

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

  return (
    <div className="wb-overlay" role="dialog" aria-modal="true" aria-label="Paused">
      <div className="wb-panel wb-pause-panel">
        <h2 className="wb-title wb-title-sm">Paused</h2>
        <p className="wb-subtitle">
          {pausedBy
            ? `${pausedBy} paused the fight — it's frozen for everyone. Anyone can resume.`
            : 'The fight is frozen for everyone. Anyone can resume.'}
        </p>

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
