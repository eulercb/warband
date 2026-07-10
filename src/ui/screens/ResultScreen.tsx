/**
 * Warband — post-fight results + between-boss upgrade phase.
 *
 * Renders the victory/defeat banner, time-to-kill and a per-player stats table
 * (with MVP callouts + run score). Between bosses each hero picks BOTH a generic
 * upgrade and a class-specific character upgrade, then marks themselves ready;
 * the run only advances once EVERYONE is ready (no countdown). Clearing a whole
 * run shows Victory with a "Continue (Endless)" option that carries everything
 * into a harder cycle. Fully controller-navigable.
 */
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import {
  returnToLobby,
  retryFight,
  continueEndless,
  leaveToMenu,
  chooseUpgrade,
  chooseCharUpgrade,
  setNextReady,
  playUiSound,
} from '../state/session';
import { CLASSES } from '../../engine/content/classes';
import { MONSTERS } from '../../engine/content/monsters';
import { UPGRADES, rollUpgradeChoices, type UpgradeId } from '../../engine/content/upgrades';
import { CHAR_UPGRADES, rollCharChoices } from '../../engine/content/charUpgrades';
import { useGamepadMenu } from '../../input/useGamepadMenu';

/** Format milliseconds as `m:ss.mmm` (>= 1 min) or `s.d`s (under a minute). */
function formatTime(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalSec = clamped / 1000;
  if (totalSec >= 60) {
    const m = Math.floor(totalSec / 60);
    const s = Math.floor(totalSec % 60);
    const mmm = Math.floor(clamped % 1000);
    return `${m}:${s.toString().padStart(2, '0')}.${mmm.toString().padStart(3, '0')}`;
  }
  return `${totalSec.toFixed(1)}s`;
}

export function ResultScreen() {
  const result = useStore((s) => s.result);
  const isHost = useStore((s) => s.isHost);
  const localClass = useStore((s) => s.localClass);
  const myUpgrades = useStore((s) => s.myUpgrades);
  const myCharUpgrades = useStore((s) => s.myCharUpgrades);
  const readyReady = useStore((s) => s.nextReadyReady);
  const readyTotal = useStore((s) => s.nextReadyTotal);

  const panelRef = useRef<HTMLDivElement>(null);
  useGamepadMenu(panelRef);

  const nextMonsterId = result?.nextMonsterId ?? null;
  const advancing = !!nextMonsterId; // another boss queued in this run
  const endlessAvailable = !!result?.endlessAvailable; // cleared the whole run
  const showUpgrades = advancing || endlessAvailable;

  // Offers for this round: 3 generic + 4 character picks (class pool, with a
  // chance one is a wild cross-class HYBRID — see engine/charUpgrades.ts).
  const [genOffers, setGenOffers] = useState<UpgradeId[]>([]);
  const [charOffers, setCharOffers] = useState<string[]>([]);
  const [pickedGen, setPickedGen] = useState<UpgradeId | null>(null);
  const [pickedChar, setPickedChar] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Roll a fresh set of offers whenever a new upgrade-eligible result lands.
  // This is a legitimate effect: the offers are RANDOM (a side effect that
  // can't run during render, or it would reroll on every paint), so we seed
  // them — and reset the pick/ready state — in response to the result changing.
  /* eslint-disable react-hooks/set-state-in-effect -- intentional derived-random reset keyed on a new result */
  useEffect(() => {
    if (!showUpgrades) return;
    setGenOffers(rollUpgradeChoices(3, Math.random));
    setCharOffers(rollCharChoices(localClass, 4, Math.random));
    setPickedGen(null);
    setPickedChar(null);
    setReady(false);
  }, [showUpgrades, localClass, result]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const onPickGen = (id: UpgradeId): void => {
    if (pickedGen) return;
    playUiSound('uiConfirm');
    setPickedGen(id);
    chooseUpgrade(id);
  };
  const onPickChar = (id: string): void => {
    if (pickedChar) return;
    playUiSound('uiConfirm');
    setPickedChar(id);
    chooseCharUpgrade(id);
  };
  const onToggleReady = (): void => {
    playUiSound('uiConfirm');
    const next = !ready;
    setReady(next);
    setNextReady(next);
  };

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
  const onEndless = (): void => {
    playUiSound('uiConfirm');
    continueEndless();
  };

  if (!result) {
    return (
      <div className="wb-screen">
        <div className="wb-panel wb-result-panel" ref={panelRef}>
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
  const isRun = runTotal > 1;
  const cycle = result.cycle ?? 0;

  const maxDamage = Math.max(0, ...stats.map((s) => s.damageDealt));
  const maxHealing = Math.max(0, ...stats.map((s) => s.healingDone));
  const maxRevives = Math.max(0, ...stats.map((s) => s.revives));
  const maxScore = Math.max(0, ...stats.map((s) => s.score));

  return (
    <div className="wb-screen">
      <div className="wb-panel wb-result-panel" ref={panelRef}>
        <div className={`wb-banner ${victory ? 'wb-victory' : 'wb-defeat'}`} role="status">
          {endlessAvailable ? 'RUN CLEARED' : victory ? 'VICTORY' : 'DEFEAT'}
        </div>

        {isRun ? (
          <p className="wb-run-progress">
            {(result.modName ? `${result.modName} ` : '') + MONSTERS[result.monsterId].name} — Boss{' '}
            {runIndex + 1} of {runTotal}
            {cycle > 0 ? ` · Cycle ${cycle + 1}` : ''}
          </p>
        ) : null}

        {advancing ? (
          <div className="wb-advance-note" role="status">
            <span className="wb-advance-title">
              Next up:{' '}
              {(result.modName ? `${result.modName} ` : '') +
                (result.nextMonsterIds && result.nextMonsterIds.length > 1
                  ? result.nextMonsterIds.map((id) => MONSTERS[id].name).join(' & ') +
                    ' — a TWIN fight!'
                  : MONSTERS[nextMonsterId].name)}
            </span>
            <span className="wb-advance-sub">
              {ready
                ? 'Waiting for the rest of the band…'
                : 'Pick your upgrades, then ready up to advance.'}
            </span>
          </div>
        ) : null}

        {endlessAvailable ? (
          <div className="wb-advance-note" role="status">
            <span className="wb-advance-title">You felled the whole gauntlet!</span>
            <span className="wb-advance-sub">
              Bank your upgrades and press on into Endless — every cycle grows deadlier.
            </span>
          </div>
        ) : null}

        {showUpgrades ? (
          <div className="wb-upgrades">
            <h3 className="wb-upgrades-title">
              {pickedGen ? 'Generic upgrade chosen' : 'Choose a generic upgrade'}
            </h3>
            <div className="wb-upgrade-cards">
              {genOffers.map((id) => {
                const u = UPGRADES[id];
                const isPicked = pickedGen === id;
                const dimmed = pickedGen && !isPicked;
                return (
                  <button
                    type="button"
                    key={id}
                    className={`wb-upgrade-card${isPicked ? ' picked' : ''}${dimmed ? ' dimmed' : ''}`}
                    onClick={() => onPickGen(id)}
                    disabled={!!pickedGen}
                    aria-pressed={isPicked}
                  >
                    <span className="wb-upgrade-icon" aria-hidden="true">
                      {u.icon}
                    </span>
                    <span className="wb-upgrade-name">{u.name}</span>
                    <span className="wb-upgrade-desc">{u.desc}</span>
                    {isPicked ? (
                      <span className="wb-upgrade-tick" aria-hidden="true">
                        ✓
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <h3 className="wb-upgrades-title">
              {pickedChar
                ? 'Character upgrade chosen'
                : `Choose a ${CLASSES[localClass].name} upgrade`}
            </h3>
            <div className="wb-upgrade-cards">
              {charOffers.map((id) => {
                const u = CHAR_UPGRADES[id];
                if (!u) return null;
                const isPicked = pickedChar === id;
                const dimmed = pickedChar && !isPicked;
                return (
                  <button
                    type="button"
                    key={id}
                    className={`wb-upgrade-card wb-upgrade-char${isPicked ? ' picked' : ''}${dimmed ? ' dimmed' : ''}`}
                    onClick={() => onPickChar(id)}
                    disabled={!!pickedChar}
                    aria-pressed={isPicked}
                  >
                    <span className="wb-upgrade-icon" aria-hidden="true">
                      {u.icon}
                    </span>
                    <span className="wb-upgrade-name">{u.name}</span>
                    <span className="wb-upgrade-desc">{u.desc}</span>
                    {isPicked ? (
                      <span className="wb-upgrade-tick" aria-hidden="true">
                        ✓
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {myUpgrades.length > 0 || myCharUpgrades.length > 0 ? (
              <div className="wb-upgrade-owned">
                <span className="wb-field-label">Your upgrades</span>
                <span className="wb-upgrade-badges">
                  {myUpgrades.map((id, i) => (
                    <span
                      key={`g-${id}-${i}`}
                      className="wb-upgrade-badge"
                      title={UPGRADES[id].desc}
                    >
                      {UPGRADES[id].icon} {UPGRADES[id].name}
                    </span>
                  ))}
                  {myCharUpgrades.map((id, i) =>
                    CHAR_UPGRADES[id] ? (
                      <span
                        key={`c-${id}-${i}`}
                        className="wb-upgrade-badge wb-badge-char"
                        title={CHAR_UPGRADES[id].desc}
                      >
                        {CHAR_UPGRADES[id].icon} {CHAR_UPGRADES[id].name}
                      </span>
                    ) : null,
                  )}
                </span>
              </div>
            ) : null}
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
                <th scope="col" className="wb-num">
                  Damage
                </th>
                <th scope="col" className="wb-num">
                  Healing
                </th>
                <th scope="col" className="wb-num">
                  Revives
                </th>
                <th scope="col" className="wb-num">
                  Deaths
                </th>
                <th scope="col" className="wb-num">
                  Score
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.map((row) => {
                const isDamageMvp = row.damageDealt === maxDamage && maxDamage > 0;
                const isHealMvp = row.healingDone === maxHealing && maxHealing > 0;
                const isReviveMvp = row.revives === maxRevives && maxRevives > 0;
                const isScoreMvp = row.score === maxScore && maxScore > 0;
                return (
                  <tr key={row.peerId}>
                    <td className="wb-cell-name">{row.name || 'Hero'}</td>
                    <td className={`cls-${row.classId}`}>{CLASSES[row.classId].name}</td>
                    <td className={`wb-num${isDamageMvp ? ' wb-mvp' : ''}`}>
                      {Math.round(row.damageDealt)}
                      {isDamageMvp ? <span className="wb-badge wb-badge-mvp">MVP</span> : null}
                    </td>
                    <td className={`wb-num${isHealMvp ? ' wb-mvp' : ''}`}>
                      {Math.round(row.healingDone)}
                      {isHealMvp ? <span className="wb-badge wb-badge-mvp">MVP</span> : null}
                    </td>
                    <td className={`wb-num${isReviveMvp ? ' wb-mvp' : ''}`}>
                      {row.revives}
                      {isReviveMvp ? <span className="wb-badge wb-badge-mvp">MVP</span> : null}
                    </td>
                    <td className="wb-num">{row.deaths}</td>
                    <td className={`wb-num wb-score-cell${isScoreMvp ? ' wb-mvp' : ''}`}>
                      ★ {row.score}
                    </td>
                  </tr>
                );
              })}
              {stats.length === 0 ? (
                <tr>
                  <td colSpan={7} className="wb-player-empty">
                    No combatants recorded.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {advancing ? (
          <div className="wb-next-ready" role="status">
            <button
              type="button"
              className={`wb-btn wb-btn-lg${ready ? ' wb-btn-ghost is-ready' : ' wb-btn-primary'}`}
              onClick={onToggleReady}
              aria-pressed={ready}
            >
              {ready ? 'Ready ✓ — waiting' : 'Ready for next boss'}
            </button>
            <span className="wb-ready-tally">
              {readyReady}/{readyTotal} ready
            </span>
          </div>
        ) : null}

        <div className="wb-row wb-actions-row">
          <button type="button" className="wb-btn wb-btn-ghost" onClick={onMenu}>
            Main Menu
          </button>
          {endlessAvailable ? (
            isHost ? (
              <>
                <button type="button" className="wb-btn wb-btn-primary" onClick={onReturn}>
                  Return to Lobby
                </button>
                <button type="button" className="wb-btn wb-btn-endless" onClick={onEndless}>
                  Continue (Endless) →
                </button>
              </>
            ) : (
              <span className="wb-await-host">Waiting for the host to choose…</span>
            )
          ) : advancing ? (
            <span className="wb-await-host">
              {readyReady >= readyTotal && readyTotal > 0
                ? 'Advancing…'
                : 'The run advances once everyone is ready.'}
            </span>
          ) : (
            <>
              {isHost ? (
                <button type="button" className="wb-btn wb-btn-danger" onClick={onRetry}>
                  {victory ? 'Play Again' : 'Retry'}
                </button>
              ) : null}
              <button type="button" className="wb-btn wb-btn-primary" onClick={onReturn}>
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
