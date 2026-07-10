/**
 * Warband — top-level phase router. Reads `phase` from the store and mounts the
 * matching screen. Reads the room code from the URL hash once on load.
 */
import { useEffect } from 'react';
import { useStore } from './state/store';
import { readRoomFromHash, configuredRelayUrl } from '../net/transport/room';
import { sfx, leaveToMenu } from './state/session';
import MainMenu from './screens/MainMenu';
import HostSetup from './screens/HostSetup';
import JoinScreen from './screens/JoinScreen';
import Lobby from './screens/Lobby';
import GameView from './game/GameView';
import ResultScreen from './screens/ResultScreen';
import Controls from './screens/Controls';
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
    const fromHash = readRoomFromHash();
    if (fromHash) {
      const s = useStore.getState();
      s.setRoom(fromHash.code, false);
      // Honor a global-server link only when this build actually has a relay
      // configured; otherwise fall back to P2P and say so instead of failing
      // silently with a link that still advertises the relay.
      if (fromHash.net === 'relay' && !configuredRelayUrl()) {
        s.setNetMode('p2p');
        s.setError(
          'This invite uses a global server, but this build has none configured — trying peer-to-peer instead.',
        );
      } else {
        s.setNetMode(fromHash.net);
      }
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
