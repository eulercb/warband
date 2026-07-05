/**
 * Warband — main menu screen. Entry point: choose to host or join a game,
 * toggle sound, and read a short explanation of how the peer-to-peer model
 * works. Purely presentational; all state lives in the app store.
 */
import './styles.css';
import { useStore } from './store';
import { playUiSound, openControls } from './session';

export function MainMenu() {
  const error = useStore((s) => s.error);
  const muted = useStore((s) => s.muted);
  const setPhase = useStore((s) => s.setPhase);
  const toggleMute = useStore((s) => s.toggleMute);

  const goHost = (): void => {
    playUiSound('uiClick');
    setPhase('hostSetup');
  };

  const goJoin = (): void => {
    playUiSound('uiClick');
    setPhase('join');
  };

  const goControls = (): void => {
    playUiSound('uiClick');
    openControls();
  };

  return (
    <div className="wb-screen">
      <div className="wb-panel wb-menu-panel">
        <h1 className="wb-title">WARBAND</h1>
        <p className="wb-tagline">
          Gather a warband. Slay the boss. No server required.
        </p>

        <div className="wb-menu-actions">
          <button
            type="button"
            className="wb-btn wb-btn-primary wb-btn-lg"
            onClick={goHost}
          >
            Host Game
          </button>
          <button
            type="button"
            className="wb-btn wb-btn-primary wb-btn-lg"
            onClick={goJoin}
          >
            Join Game
          </button>
        </div>

        <div className="wb-menu-secondary">
          <button
            type="button"
            className="wb-btn wb-btn-ghost"
            onClick={goControls}
          >
            Controls
          </button>
          <button
            type="button"
            className="wb-btn wb-btn-ghost wb-mute-toggle"
            onClick={toggleMute}
            aria-pressed={muted}
            aria-label={muted ? 'Unmute sound' : 'Mute sound'}
          >
            {muted ? 'Sound: Off' : 'Sound: On'}
          </button>
        </div>

        <p className="wb-blurb">
          Warband is a cooperative boss fight that runs entirely in your browser.
          One player <strong>hosts</strong> the fight, shares a link with friends,
          and everyone connects peer-to-peer over WebRTC. There is no game server
          and nothing to install — close the tab and the room is gone.
        </p>

        {error ? (
          <div className="wb-error" role="alert">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default MainMenu;
