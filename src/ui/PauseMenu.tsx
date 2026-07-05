/**
 * Warband — in-fight pause menu overlay. Rendered by GameView while the local
 * menu is open. The host sees an "End Run" control to finish the fight early;
 * every player can open Controls (rebinding) or leave to the main menu.
 */
import { useStore } from './store';
import { endRun, leaveToMenu, openControls, playUiSound } from './session';

export default function PauseMenu({ onResume }: { onResume: () => void }) {
  const isHost = useStore((s) => s.isHost);

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
          {isHost
            ? 'The fight is frozen for everyone while this menu is open.'
            : 'Your hero holds position while this menu is open.'}
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
      </div>
    </div>
  );
}
