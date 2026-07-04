/**
 * Warband — pre-fight lobby. Shows the room code + share link, the chosen boss,
 * the connected roster, a class picker, a ready toggle and (for the host) the
 * start button. All mutations route through the session helper.
 */
import { useState } from 'react';
import { useStore } from './store';
import {
  selectClass,
  setReady,
  startFight,
  leaveToMenu,
  shareLink,
  copyShareLink,
  setMonster,
  playUiSound,
} from './session';
import { CLASS_IDS, CLASSES } from '../engine/classes';
import { MONSTER_IDS, MONSTERS } from '../engine/monsters';

export function Lobby() {
  const roomCode = useStore((s) => s.roomCode);
  const isHost = useStore((s) => s.isHost);
  const monsterId = useStore((s) => s.monsterId);
  const players = useStore((s) => s.players);
  const localClass = useStore((s) => s.localClass);
  const localReady = useStore((s) => s.localReady);

  const [copied, setCopied] = useState(false);

  const link = shareLink();
  const monster = MONSTERS[monsterId];

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

  const onStart = (): void => {
    playUiSound('uiConfirm');
    startFight();
  };

  const onLeave = (): void => {
    playUiSound('uiClick');
    leaveToMenu();
  };

  return (
    <div className="wb-screen">
      <div className="wb-panel wb-lobby-panel">
        <div className="wb-lobby-head">
          <div className="wb-roomcode-block">
            <span className="wb-field-label">Room code</span>
            <span className="wb-roomcode">{roomCode ?? '——————'}</span>
          </div>
          <div className="wb-share-block">
            <button
              type="button"
              className="wb-btn wb-btn-ghost wb-share-btn"
              onClick={onCopy}
            >
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
          ) : null}
        </div>

        <div className="wb-lobby-cols">
          <section className="wb-lobby-col">
            <h3 className="wb-section-title">
              Warband ({players.length})
            </h3>
            <ul className="wb-player-list">
              {players.map((p) => (
                <li key={p.peerId} className="wb-player-row">
                  <span className={`wb-player-name cls-${p.classId}`}>
                    {p.name || 'Hero'}
                  </span>
                  <span className={`wb-player-class cls-${p.classId}`}>
                    {CLASSES[p.classId].name}
                  </span>
                  <span className="wb-player-tags">
                    {p.isHost ? (
                      <span className="wb-badge wb-badge-host">Host</span>
                    ) : null}
                    <span
                      className={`wb-ready${p.ready ? ' is-ready' : ''}`}
                      aria-label={p.ready ? 'Ready' : 'Not ready'}
                    >
                      {p.ready ? '✓' : '…'}
                    </span>
                  </span>
                </li>
              ))}
              {players.length === 0 ? (
                <li className="wb-player-row wb-player-empty">
                  Waiting for heroes…
                </li>
              ) : null}
            </ul>
          </section>

          <section className="wb-lobby-col">
            <h3 className="wb-section-title">Choose your class</h3>
            <div className="wb-class-grid">
              {CLASS_IDS.map((id) => {
                const def = CLASSES[id];
                const selected = id === localClass;
                return (
                  <button
                    type="button"
                    key={id}
                    data-cls={id}
                    className={`wb-card wb-class-card${selected ? ' selected' : ''}`}
                    onClick={() => {
                      playUiSound('uiClick');
                      selectClass(id);
                    }}
                    aria-pressed={selected}
                  >
                    <span className="wb-card-name">{def.name}</span>
                    <span className="wb-card-role">{def.role}</span>
                    <span className="wb-card-blurb">{def.blurb}</span>
                  </button>
                );
              })}
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
            >
              Start Fight
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default Lobby;
