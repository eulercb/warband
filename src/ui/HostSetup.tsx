/**
 * Warband — host setup screen. The host picks the boss to fight and a display
 * name, then creates a room. Networking is delegated to session.hostGame().
 */
import { useState } from 'react';
import { useStore } from './store';
import { hostGame, playUiSound } from './session';
import { MONSTER_IDS, MONSTERS } from '../engine/monsters';

/** Convert a PixiJS numeric color (0xRRGGBB) to a CSS hex string. */
function toHex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}

export function HostSetup() {
  const monsterId = useStore((s) => s.monsterId);
  const localName = useStore((s) => s.localName);
  const error = useStore((s) => s.error);
  const setMonster = useStore((s) => s.setMonster);
  const setLocalName = useStore((s) => s.setLocalName);
  const setPhase = useStore((s) => s.setPhase);
  const setError = useStore((s) => s.setError);

  const [creating, setCreating] = useState(false);

  const onCreate = async (): Promise<void> => {
    if (creating) return;
    playUiSound('uiConfirm');
    setCreating(true);
    try {
      await hostGame();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room.');
      setCreating(false);
    }
  };

  const onBack = (): void => {
    playUiSound('uiClick');
    setError(null);
    setPhase('menu');
  };

  return (
    <div className="wb-screen">
      <div className="wb-panel wb-setup-panel">
        <h2 className="wb-title wb-title-sm">Host a Fight</h2>
        <p className="wb-subtitle">Choose your boss.</p>

        <div className="wb-monster-grid">
          {MONSTER_IDS.map((id) => {
            const def = MONSTERS[id];
            const hex = toHex(def.color);
            const selected = id === monsterId;
            return (
              <button
                type="button"
                key={id}
                className={`wb-card wb-monster-card${selected ? ' selected' : ''}`}
                onClick={() => {
                  playUiSound('uiClick');
                  setMonster(id);
                }}
                aria-pressed={selected}
                style={
                  selected
                    ? { borderColor: hex, boxShadow: `0 0 0 2px ${hex}55` }
                    : undefined
                }
              >
                <span
                  className="wb-monster-accent"
                  style={{ background: hex }}
                  aria-hidden="true"
                />
                <span className="wb-card-name">{def.name}</span>
                <span className="wb-card-blurb">{def.theme}</span>
                <span className="wb-card-meta">
                  <span className="wb-badge wb-badge-diff">{def.difficulty}</span>
                </span>
              </button>
            );
          })}
        </div>

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
          <button
            type="button"
            className="wb-btn wb-btn-ghost"
            onClick={onBack}
            disabled={creating}
          >
            Back
          </button>
          <button
            type="button"
            className="wb-btn wb-btn-primary"
            onClick={onCreate}
            disabled={creating}
          >
            {creating ? 'Creating…' : 'Create Room'}
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

export default HostSetup;
