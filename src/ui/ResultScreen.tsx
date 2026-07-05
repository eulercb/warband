/**
 * Warband — post-fight results. Renders the victory/defeat banner, time-to-kill
 * and a per-player stats table with MVP callouts. In a gauntlet run a win that
 * still has bosses left shows an "advancing to next boss" interstitial (the host
 * auto-starts the next fight); a loss offers a one-click Retry. Rendering only;
 * the win/lose audio sting is played by the game/session layer.
 */
import { useEffect, useState } from 'react';
import { useStore } from './store';
import {
  returnToLobby,
  retryFight,
  advanceGauntlet,
  leaveToMenu,
  playUiSound,
} from './session';
import { CLASSES } from '../engine/classes';
import { MONSTERS } from '../engine/monsters';
import { GAUNTLET_INTERSTITIAL_S } from '../engine/constants';

/** Format milliseconds as `m:ss.mmm` (>= 1 min) or `s.d`s (under a minute). */
function formatTime(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalSec = clamped / 1000;
  if (totalSec >= 60) {
    const m = Math.floor(totalSec / 60);
    const s = Math.floor(totalSec % 60);
    const mmm = Math.floor(clamped % 1000);
    return `${m}:${s.toString().padStart(2, '0')}.${mmm
      .toString()
      .padStart(3, '0')}`;
  }
  return `${totalSec.toFixed(1)}s`;
}

export function ResultScreen() {
  const result = useStore((s) => s.result);
  const isHost = useStore((s) => s.isHost);

  const nextMonsterId = result?.nextMonsterId ?? null;
  const advancing = !!nextMonsterId;
  const [countdown, setCountdown] = useState(GAUNTLET_INTERSTITIAL_S);

  // Cosmetic countdown while the gauntlet auto-advances (the host drives the
  // actual transition; clients just watch the timer tick down).
  useEffect(() => {
    if (!advancing) return;
    setCountdown(GAUNTLET_INTERSTITIAL_S);
    const t = setInterval(() => {
      setCountdown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [advancing, result]);

  const onReturn = (): void => {
    playUiSound('uiClick');
    returnToLobby();
  };

  const onMenu = (): void => {
    playUiSound('uiClick');
    leaveToMenu();
  };

  const onRetry = (): void => {
    playUiSound('uiConfirm');
    retryFight();
  };

  const onContinue = (): void => {
    playUiSound('uiConfirm');
    advanceGauntlet();
  };

  if (!result) {
    return (
      <div className="wb-screen">
        <div className="wb-panel wb-result-panel">
          <p className="wb-subtitle">No fight results to show.</p>
          <div className="wb-row wb-actions-row">
            <button type="button" className="wb-btn wb-btn-primary" onClick={onMenu}>
              Main Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  const stats = result.stats;
  const victory = result.outcome === 'victory';
  const runTotal = result.runTotal ?? 1;
  const runIndex = result.runIndex ?? 0;
  const isGauntlet = runTotal > 1;

  // MVP thresholds. Math.max over an empty list would be -Infinity, so seed 0
  // and only treat a positive maximum as a real MVP (avoids badging all-zeros).
  const maxDamage = Math.max(0, ...stats.map((s) => s.damageDealt));
  const maxHealing = Math.max(0, ...stats.map((s) => s.healingDone));
  const maxRevives = Math.max(0, ...stats.map((s) => s.revives));

  return (
    <div className="wb-screen">
      <div className="wb-panel wb-result-panel">
        <div
          className={`wb-banner ${victory ? 'wb-victory' : 'wb-defeat'}`}
          role="status"
        >
          {victory ? 'VICTORY' : 'DEFEAT'}
        </div>

        {isGauntlet ? (
          <p className="wb-run-progress">
            {MONSTERS[result.monsterId].name} — Boss {runIndex + 1} of {runTotal}
          </p>
        ) : null}

        {advancing ? (
          <div className="wb-advance-note" role="status">
            <span className="wb-advance-title">
              Next up: {MONSTERS[nextMonsterId].name}
            </span>
            <span className="wb-advance-sub">
              Advancing in {countdown}s…
            </span>
          </div>
        ) : null}

        <p className="wb-result-time">
          <span className="wb-field-label">Time to kill</span>
          <span className="wb-time-value">{formatTime(result.timeMs)}</span>
        </p>

        <div className="wb-table-wrap">
          <table className="wb-stat-table">
            <thead>
              <tr>
                <th scope="col">Hero</th>
                <th scope="col">Class</th>
                <th scope="col" className="wb-num">Damage</th>
                <th scope="col" className="wb-num">Healing</th>
                <th scope="col" className="wb-num">Revives</th>
                <th scope="col" className="wb-num">Deaths</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((row) => {
                const isDamageMvp = row.damageDealt === maxDamage && maxDamage > 0;
                const isHealMvp = row.healingDone === maxHealing && maxHealing > 0;
                const isReviveMvp = row.revives === maxRevives && maxRevives > 0;
                return (
                  <tr key={row.peerId}>
                    <td className="wb-cell-name">{row.name || 'Hero'}</td>
                    <td className={`cls-${row.classId}`}>
                      {CLASSES[row.classId].name}
                    </td>
                    <td className={`wb-num${isDamageMvp ? ' wb-mvp' : ''}`}>
                      {Math.round(row.damageDealt)}
                      {isDamageMvp ? (
                        <span className="wb-badge wb-badge-mvp">MVP</span>
                      ) : null}
                    </td>
                    <td className={`wb-num${isHealMvp ? ' wb-mvp' : ''}`}>
                      {Math.round(row.healingDone)}
                      {isHealMvp ? (
                        <span className="wb-badge wb-badge-mvp">MVP</span>
                      ) : null}
                    </td>
                    <td className={`wb-num${isReviveMvp ? ' wb-mvp' : ''}`}>
                      {row.revives}
                      {isReviveMvp ? (
                        <span className="wb-badge wb-badge-mvp">MVP</span>
                      ) : null}
                    </td>
                    <td className="wb-num">{row.deaths}</td>
                  </tr>
                );
              })}
              {stats.length === 0 ? (
                <tr>
                  <td colSpan={6} className="wb-player-empty">
                    No combatants recorded.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="wb-row wb-actions-row">
          <button type="button" className="wb-btn wb-btn-ghost" onClick={onMenu}>
            Main Menu
          </button>
          {advancing ? (
            isHost ? (
              <button type="button" className="wb-btn wb-btn-primary" onClick={onContinue}>
                Continue now →
              </button>
            ) : (
              <span className="wb-await-host">Waiting for the next boss…</span>
            )
          ) : (
            <>
              {isHost ? (
                <button type="button" className="wb-btn wb-btn-danger" onClick={onRetry}>
                  {victory ? 'Play Again' : 'Retry'}
                </button>
              ) : null}
              <button
                type="button"
                className="wb-btn wb-btn-primary"
                onClick={onReturn}
              >
                {isHost ? 'Return to Lobby' : 'Back to Lobby'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ResultScreen;
