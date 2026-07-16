/**
 * Warband — pre-fight lobby. Shows the room code + share link, the chosen boss,
 * the connected roster, a class picker, a ready toggle and (for the host) the
 * start button. All mutations route through the session helper.
 */
import { useRef, useState } from 'react';
import { useStore } from '../state/store';
import {
  selectClass,
  setReady,
  startFight,
  leaveToMenu,
  shareLink,
  copyShareLink,
  setMonster,
  setGauntlet,
  addBot,
  removeBot,
  setBotClass,
  playUiSound,
} from '../state/session';
import { useGamepadMenu } from '../../input/useGamepadMenu';
import { LoadoutEditor } from './LoadoutEditor';
import { CodexCard } from './CodexCard';
import { CLASS_IDS, CLASSES } from '../../engine/content/classes';
import { MONSTER_IDS, MONSTERS } from '../../engine/content/monsters';
import { MAX_PLAYERS } from '../../engine/core/constants';
import type { ClassId } from '../../engine/core/types';

export function Lobby() {
  const panelRef = useRef<HTMLDivElement>(null);
  const roomCode = useStore((s) => s.roomCode);
  const isHost = useStore((s) => s.isHost);
  const monsterId = useStore((s) => s.monsterId);
  const gauntlet = useStore((s) => s.gauntlet);
  const players = useStore((s) => s.players);
  const localClass = useStore((s) => s.localClass);
  const localReady = useStore((s) => s.localReady);
  const peerCount = useStore((s) => s.peerCount);
  const netHint = useStore((s) => s.netHint);

  const [copied, setCopied] = useState(false);

  const link = shareLink();
  const monster = MONSTERS[monsterId];

  // Ready-gate: the host may start solo any time; otherwise every non-host
  // HUMAN must be ready (bots are always ready and never block the start).
  const otherHumans = players.filter((p) => !p.isBot && !p.isHost);
  const allHumansReady = otherHumans.every((p) => p.ready);
  const canStart = otherHumans.length === 0 || allHumansReady;
  const partyFull = players.length >= MAX_PLAYERS;

  const cycleBotClass = (peerId: string, current: ClassId): void => {
    const idx = CLASS_IDS.indexOf(current);
    const next = CLASS_IDS[(idx + 1) % CLASS_IDS.length];
    playUiSound('uiClick');
    setBotClass(peerId, next);
  };

  const connected = peerCount > 0;
  const connClass = connected ? 'is-connected' : isHost ? 'is-idle' : 'is-searching';
  const connMsg = isHost
    ? connected
      ? `${peerCount} ${peerCount === 1 ? 'player' : 'players'} connected`
      : 'Share the room code — players appear here as they connect.'
    : connected
      ? 'Connected to the host'
      : 'Connecting to the host…';

  const onCopy = async (): Promise<void> => {
    playUiSound('uiClick');
    try {
      await copyShareLink();
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const onReady = (): void => {
    playUiSound('uiClick');
    setReady(!localReady);
  };

  const onPickClass = (id: ClassId): void => {
    playUiSound('uiClick');
    selectClass(id);
  };

  const onStart = (): void => {
    playUiSound('uiConfirm');
    startFight();
  };

  const onLeave = (): void => {
    playUiSound('uiClick');
    leaveToMenu();
  };

  useGamepadMenu(panelRef, { onBack: onLeave });

  return (
    <div className="wb-screen">
      <div className="wb-panel wb-lobby-panel" ref={panelRef}>
        <div className="wb-lobby-head">
          <div className="wb-roomcode-block">
            <span className="wb-field-label">Room code</span>
            <span className="wb-roomcode">{roomCode ?? '——————'}</span>
          </div>
          <div className="wb-share-block">
            <button type="button" className="wb-btn wb-btn-ghost wb-share-btn" onClick={onCopy}>
              {copied ? 'Copied!' : 'Copy share link'}
            </button>
            <code className="wb-share-link" title={link}>
              {link}
            </code>
          </div>
        </div>

        <div className="wb-lobby-monster">
          <span className="wb-field-label">Boss</span>
          <span className="wb-monster-name">{monster.name}</span>
          <span className="wb-monster-sub">
            {monster.theme} · {monster.difficulty}
          </span>
          {isHost ? (
            <div className="wb-monster-switch" role="group" aria-label="Change boss">
              {MONSTER_IDS.map((id) => (
                <button
                  type="button"
                  key={id}
                  className={`wb-btn wb-btn-chip${id === monsterId ? ' selected' : ''}`}
                  onClick={() => {
                    playUiSound('uiClick');
                    setMonster(id);
                  }}
                  aria-pressed={id === monsterId}
                >
                  {MONSTERS[id].name}
                </button>
              ))}
            </div>
          ) : (
            gauntlet && <span className="wb-badge wb-badge-gauntlet">Gauntlet run</span>
          )}

          {isHost ? (
            <div className="wb-host-options">
              <button
                type="button"
                className={`wb-btn wb-btn-chip${gauntlet ? ' selected' : ''}`}
                onClick={() => {
                  playUiSound('uiClick');
                  setGauntlet(!gauntlet);
                }}
                aria-pressed={gauntlet}
                title="Beat one boss, then jump straight to the next"
              >
                {gauntlet ? '✓ Gauntlet run' : 'Gauntlet run'}
              </button>
              <div className="wb-addbot" role="group" aria-label="Add a bot">
                <span className="wb-addbot-label">Add bot:</span>
                {CLASS_IDS.map((id) => (
                  <button
                    type="button"
                    key={id}
                    className="wb-btn wb-btn-chip wb-addbot-btn"
                    disabled={partyFull}
                    onClick={() => {
                      playUiSound('uiClick');
                      addBot(id);
                    }}
                  >
                    {CLASSES[id].name}
                  </button>
                ))}
                {partyFull ? <span className="wb-addbot-full">Party full</span> : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className={`wb-conn ${connClass}`} role="status" aria-live="polite">
          <span className="wb-conn-msg">{connMsg}</span>
          {!connected && !isHost ? (
            <span className="wb-conn-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          ) : null}
        </div>
        {netHint && !connected ? (
          <div className="wb-conn-hint" role="status">
            {netHint}
          </div>
        ) : null}

        {/* Single-fight test loadout (item: lobby loadout) — host-only, non-gauntlet;
            gates itself internally so it stays out of a gauntlet run. Placed here, above
            the tall roster + class grid, so the collapsed toggle is reachable without
            scrolling past the whole grid and its expanded body has room clear of the
            sticky action bar (the class picker below feeds its class-boon sections live). */}
        <LoadoutEditor />

        <div className="wb-lobby-cols">
          <section className="wb-lobby-col wb-lobby-col-roster">
            <h3 className="wb-section-title">Warband ({players.length})</h3>
            <ul className="wb-player-list">
              {players.map((p) => (
                <li key={p.peerId} className="wb-player-row">
                  <span className={`wb-player-name cls-${p.classId}`}>{p.name || 'Hero'}</span>
                  <span className={`wb-player-class cls-${p.classId}`}>
                    {CLASSES[p.classId].name}
                  </span>
                  <span className="wb-player-tags">
                    {p.isHost ? <span className="wb-badge wb-badge-host">Host</span> : null}
                    {p.isBot ? <span className="wb-badge wb-badge-bot">Bot</span> : null}
                    {isHost && p.isBot ? (
                      <>
                        <button
                          type="button"
                          className="wb-bot-btn"
                          title="Change class"
                          onClick={() => cycleBotClass(p.peerId, p.classId)}
                        >
                          ⟳
                        </button>
                        <button
                          type="button"
                          className="wb-bot-btn wb-bot-remove"
                          title="Remove bot"
                          onClick={() => {
                            playUiSound('uiClick');
                            removeBot(p.peerId);
                          }}
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <span
                        className={`wb-ready${p.ready ? ' is-ready' : ''}`}
                        aria-label={p.ready ? 'Ready' : 'Not ready'}
                      >
                        {p.ready ? '✓' : '…'}
                      </span>
                    )}
                  </span>
                </li>
              ))}
              {players.length === 0 ? (
                <li className="wb-player-row wb-player-empty">Waiting for heroes…</li>
              ) : null}
            </ul>
          </section>

          <section className="wb-lobby-col wb-lobby-col-picker">
            <h3 className="wb-section-title">Choose your class</h3>
            <div className="wb-class-grid">
              {CLASS_IDS.map((id) => (
                <CodexCard
                  key={id}
                  classId={id}
                  selected={id === localClass}
                  onSelect={onPickClass}
                />
              ))}
            </div>
          </section>
        </div>

        <div className="wb-row wb-lobby-actions">
          <button type="button" className="wb-btn wb-btn-ghost" onClick={onLeave}>
            Leave
          </button>
          <button
            type="button"
            className={`wb-btn${localReady ? ' wb-btn-ghost is-ready' : ' wb-btn-primary'}`}
            onClick={onReady}
            aria-pressed={localReady}
          >
            {localReady ? 'Ready ✓' : 'Ready up'}
          </button>
          {isHost ? (
            <button
              type="button"
              className="wb-btn wb-btn-primary wb-btn-start"
              onClick={onStart}
              disabled={!canStart}
              title={canStart ? undefined : 'Waiting for all players to ready up'}
            >
              Start Fight
            </button>
          ) : null}
        </div>
        {isHost && !canStart ? (
          <div className="wb-start-hint" role="status">
            Waiting for everyone to ready up… ({otherHumans.filter((p) => p.ready).length}/
            {otherHumans.length} ready)
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default Lobby;
