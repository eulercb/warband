/**
 * Warband — top-level phase router. Reads `phase` from the store and mounts the
 * matching screen. Reads the room code from the URL hash once on load.
 */
import { useEffect } from 'react';
import { useStore } from './store';
import { readRoomFromHash } from '../net/room';
import { sfx, leaveToMenu } from './session';
import MainMenu from './MainMenu';
import HostSetup from './HostSetup';
import JoinScreen from './JoinScreen';
import Lobby from './Lobby';
import GameView from './GameView';
import ResultScreen from './ResultScreen';
import Controls from './Controls';
import './styles.css';

function Waiting() {
  const players = useStore((s) => s.players);
  return (
    <div className="wb-screen">
      <div className="wb-panel wb-waiting">
        <h2 className="wb-title">Fight in progress…</h2>
        <p>
          You&rsquo;ll drop into the lobby as soon as the current fight ends.
          {players.length > 0 ? ` ${players.length} in the party.` : ''}
        </p>
        <button className="wb-btn wb-btn-ghost" onClick={leaveToMenu}>
          Leave
        </button>
      </div>
    </div>
  );
}

function Screen({ phase }: { phase: ReturnType<typeof useStore.getState>['phase'] }) {
  switch (phase) {
    case 'menu':
      return <MainMenu />;
    case 'hostSetup':
      return <HostSetup />;
    case 'join':
      return <JoinScreen />;
    case 'lobby':
      return <Lobby />;
    case 'waiting':
      return <Waiting />;
    case 'game':
      return <GameView />;
    case 'result':
      return <ResultScreen />;
    default:
      return <MainMenu />;
  }
}

export default function App() {
  const phase = useStore((s) => s.phase);
  const showControls = useStore((s) => s.showControls);

  useEffect(() => {
    const code = readRoomFromHash();
    if (code) {
      const s = useStore.getState();
      s.setRoom(code, false);
      s.setPhase('join');
    }
    // Unlock the audio context on the first user gesture.
    const unlock = () => sfx.resume();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  return (
    <>
      <Screen phase={phase} />
      {showControls ? <Controls /> : null}
    </>
  );
}
