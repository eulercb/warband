/**
 * Warband — join screen. Enter a room code (optionally prefilled from the URL
 * hash) and a display name, then connect to an existing host via
 * session.joinGame().
 */
import { useRef, useState } from 'react';
import { useStore } from './store';
import { joinGame, playUiSound } from './session';
import { useGamepadMenu } from '../input/useGamepadMenu';

export function JoinScreen() {
  const localName = useStore((s) => s.localName);
  const error = useStore((s) => s.error);
  const setLocalName = useStore((s) => s.setLocalName);
  const setPhase = useStore((s) => s.setPhase);
  const setError = useStore((s) => s.setError);
  const panelRef = useRef<HTMLDivElement>(null);

  // Prefill from a room code the URL-hash handler may have written to the store.
  const [code, setCode] = useState<string>(() => useStore.getState().roomCode ?? '');
  const [joining, setJoining] = useState(false);

  const canJoin = code.trim().length >= 4 && !joining;

  const onJoin = async (): Promise<void> => {
    if (!canJoin) return;
    playUiSound('uiConfirm');
    setJoining(true);
    try {
      await joinGame(code.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join room.');
      setJoining(false);
    }
  };

  const onBack = (): void => {
    playUiSound('uiClick');
    setError(null);
    setPhase('menu');
  };

  useGamepadMenu(panelRef, { onBack });

  return (
    <div className="wb-screen">
      <div className="wb-panel wb-setup-panel" ref={panelRef}>
        <h2 className="wb-title wb-title-sm">Join a Fight</h2>
        <p className="wb-subtitle">Enter the room code your host shared.</p>

        <label className="wb-field">
          <span className="wb-field-label">Room code</span>
          <input
            className="wb-input wb-input-code"
            type="text"
            value={code}
            maxLength={6}
            placeholder="ABCDEF"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canJoin) void onJoin();
            }}
            aria-label="Room code"
          />
        </label>

        <label className="wb-field">
          <span className="wb-field-label">Your name</span>
          <input
            className="wb-input"
            type="text"
            value={localName}
            maxLength={16}
            placeholder="Nameless Hero"
            onChange={(e) => setLocalName(e.target.value)}
            aria-label="Your display name"
          />
        </label>

        <div className="wb-row wb-actions-row">
          <button type="button" className="wb-btn wb-btn-ghost" onClick={onBack} disabled={joining}>
            Back
          </button>
          <button
            type="button"
            className="wb-btn wb-btn-primary"
            onClick={onJoin}
            disabled={!canJoin}
          >
            {joining ? 'Joining…' : 'Join'}
          </button>
        </div>

        {error ? (
          <div className="wb-error" role="alert">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default JoinScreen;
