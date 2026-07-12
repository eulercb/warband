/**
 * Warband — host setup screen. The host picks the boss to fight and a display
 * name, then creates a room. Networking is delegated to session.hostGame().
 */
import { useRef, useState } from 'react';
import { useStore } from '../state/store';
import { hostGame, playUiSound, setGauntlet } from '../state/session';
import { useGamepadMenu } from '../../input/useGamepadMenu';
import { MONSTER_IDS, MONSTERS } from '../../engine/content/monsters';
import { RUN_LENGTH } from '../../engine/core/constants';
import { configuredRelayUrl } from '../../net/transport/room';

/** Convert a PixiJS numeric color (0xRRGGBB) to a CSS hex string. */
function toHex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}

export function HostSetup() {
  const monsterId = useStore((s) => s.monsterId);
  const localName = useStore((s) => s.localName);
  const gauntlet = useStore((s) => s.gauntlet);
  const seedMode = useStore((s) => s.seedMode);
  const seedInput = useStore((s) => s.seedInput);
  const setSeedMode = useStore((s) => s.setSeedMode);
  const setSeedInput = useStore((s) => s.setSeedInput);
  const hardcore = useStore((s) => s.hardcore);
  const setHardcore = useStore((s) => s.setHardcore);
  const netMode = useStore((s) => s.netMode);
  const error = useStore((s) => s.error);
  const setMonster = useStore((s) => s.setMonster);
  const setLocalName = useStore((s) => s.setLocalName);
  const setNetMode = useStore((s) => s.setNetMode);
  const setPhase = useStore((s) => s.setPhase);
  const setError = useStore((s) => s.setError);
  const relayConfigured = configuredRelayUrl() !== null;

  const panelRef = useRef<HTMLDivElement>(null);
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

  useGamepadMenu(panelRef, { onBack });

  return (
    <div className="wb-screen">
      <div className="wb-panel wb-setup-panel" ref={panelRef}>
        <h2 className="wb-title wb-title-sm">Host a Fight</h2>
        <p className="wb-subtitle">
          {gauntlet
            ? 'Run mode assembles a fully RANDOM boss set — the pick below is only used for a single fight.'
            : 'Choose the boss to fight.'}
        </p>

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
                style={selected ? { borderColor: hex, boxShadow: `0 0 0 2px ${hex}55` } : undefined}
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

        <button
          type="button"
          className={`wb-gauntlet-toggle${gauntlet ? ' on' : ''}`}
          onClick={() => {
            playUiSound('uiClick');
            setGauntlet(!gauntlet);
          }}
          aria-pressed={gauntlet}
        >
          <span className="wb-gauntlet-check" aria-hidden="true">
            {gauntlet ? '✓' : ''}
          </span>
          <span className="wb-gauntlet-text">
            <span className="wb-gauntlet-title">
              Run mode ({RUN_LENGTH}-boss gauntlet + Endless)
            </span>
            <span className="wb-gauntlet-sub">
              {gauntlet
                ? `A ${RUN_LENGTH}-boss run of climbing difficulty from a random, seeded boss set. Pick upgrades between bosses; clear all ${RUN_LENGTH} to unlock Endless.`
                : 'On: a full run of bosses with between-boss upgrades and Endless. Off: a single fight.'}
            </span>
          </span>
        </button>

        {gauntlet ? (
          <div className="wb-field" role="group" aria-label="Gauntlet seed">
            <span className="wb-field-label">Gauntlet seed</span>
            <div className="wb-pad-scheme-row">
              {(['random', 'daily', 'custom'] as const).map((m) => (
                <button
                  type="button"
                  key={m}
                  className={`wb-btn wb-btn-chip${seedMode === m ? ' selected' : ''}`}
                  onClick={() => {
                    playUiSound('uiClick');
                    setSeedMode(m);
                  }}
                  aria-pressed={seedMode === m}
                >
                  {m === 'random' ? 'Random' : m === 'daily' ? 'Run of the Day' : 'Custom seed'}
                </button>
              ))}
            </div>
            {seedMode === 'custom' ? (
              <input
                className="wb-input"
                type="text"
                value={seedInput}
                maxLength={24}
                placeholder="Enter a seed (any text or number)"
                onChange={(e) => setSeedInput(e.target.value)}
                aria-label="Custom gauntlet seed"
              />
            ) : null}
            <span className="wb-gauntlet-sub">
              {seedMode === 'random'
                ? 'A fresh random boss set and reward sequence each run.'
                : seedMode === 'daily'
                  ? 'Everyone playing today shares one boss set and reward sequence (based on the UTC date).'
                  : 'Reproduce an exact run — the same seed always yields the same bosses and the same boons between them.'}
            </span>
          </div>
        ) : null}

        {gauntlet ? (
          <button
            type="button"
            className={`wb-gauntlet-toggle${hardcore ? ' on' : ''}`}
            onClick={() => {
              playUiSound('uiClick');
              setHardcore(!hardcore);
            }}
            aria-pressed={hardcore}
          >
            <span className="wb-gauntlet-check" aria-hidden="true">
              {hardcore ? '💀' : ''}
            </span>
            <span className="wb-gauntlet-text">
              <span className="wb-gauntlet-title">Hardcore</span>
              <span className="wb-gauntlet-sub">
                {hardcore
                  ? 'Kill fast or die: a per-fight kill-DEADLINE counts down on the HUD — let it hit zero with the boss still standing and the whole band wipes. Mid-fight corruption also comes thick and ACCELERATES the longer a boss survives, revives are limited to 2 per fight, and a wipe ends the run — no free retry. For aggressive players.'
                  : 'Off: the standard run. On: a deadlier run with a hard kill-deadline, limited revives and no free retry.'}
              </span>
            </span>
          </button>
        ) : null}

        {relayConfigured && (
          <button
            type="button"
            className={`wb-gauntlet-toggle${netMode === 'relay' ? ' on' : ''}`}
            onClick={() => {
              playUiSound('uiClick');
              setNetMode(netMode === 'relay' ? 'p2p' : 'relay');
            }}
            aria-pressed={netMode === 'relay'}
          >
            <span className="wb-gauntlet-check" aria-hidden="true">
              {netMode === 'relay' ? '✓' : ''}
            </span>
            <span className="wb-gauntlet-text">
              <span className="wb-gauntlet-title">Host on the global server</span>
              <span className="wb-gauntlet-sub">
                {netMode === 'relay'
                  ? 'All traffic is relayed through the global server — connects even where peer-to-peer is blocked. The share link carries this setting.'
                  : 'Off: direct peer-to-peer over WebRTC (default). Turn on if friends can never connect — the global server relays for you.'}
              </span>
            </span>
          </button>
        )}

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
