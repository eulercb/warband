/**
 * Warband — post-fight results + terminal upgrade phases.
 *
 * The BETWEEN-BOSS upgrade phase (another boss still queued) is now the walkable
 * RewardRoom — walk over relics to claim boons, into the vortex to descend — so
 * this screen delegates that case to <RewardRoom>. What remains here are the
 * flat, once-per-run TERMINAL results: a single-fight victory/defeat, and the
 * "RUN CLEARED" endless offer (bank your boons, then the host presses on into a
 * harder cycle). Both show the victory/defeat banner, time-to-kill and a
 * per-player stats table (MVP callouts + run score). Fully controller-navigable.
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
  playUiSound,
} from '../state/session';
import { CLASSES, CLASS_IDS } from '../../engine/content/classes';
import { getMonster } from '../../engine/content/monsters';
import { Rng, mixSeed } from '../../engine/core/math';
import { getUpgrade, rollUpgradeChoices, type UpgradeId } from '../../engine/content/upgrades';
import {
  rollCharChoices,
  describeCharOffer,
  charUpgradeBadge,
} from '../../engine/content/charUpgrades';
import { useGamepadMenu } from '../../input/useGamepadMenu';
import RewardRoom from '../game/RewardRoom';
import SpecialReward from './SpecialReward';
import EphemeralShop from './EphemeralShop';

/**
 * A reward RNG seeded from the shared reward seed (so peers agree), salted with the
 * hero + owned-set so re-rolling after a same-screen multiclass yields a fresh,
 * class-aware draw (item 8). Falls back to Math.random when no seed is present.
 */
function rewardRnd(rewardSeed: number | null | undefined, ...salts: number[]): () => number {
  if (rewardSeed == null) return Math.random;
  const rng = new Rng(mixSeed(rewardSeed, ...salts));
  return () => rng.next();
}

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
  const activeHardcore = useStore((s) => s.activeHardcore);
  // The hero's EFFECTIVE class: the Chaos-Draft class in a randomized run (item 10),
  // else the picked class. Drives the kit + all upgrade offers so a drafted hero is
  // offered its drafted class's correct boons.
  const localClass = useStore((s) => s.activeDraftedClass ?? s.localClass);
  const myUpgrades = useStore((s) => s.myUpgrades);
  const myCharUpgrades = useStore((s) => s.myCharUpgrades);
  // Subscribed (not just read via getState) so the CHAR offer re-rolls the moment a
  // class or sub-skill is acquired on THIS screen via SpecialReward (item 8).
  const myExtraClasses = useStore((s) => s.myExtraClasses);
  const mySubSkills = useStore((s) => s.mySubSkills);

  const panelRef = useRef<HTMLDivElement>(null);
  useGamepadMenu(panelRef);

  const nextMonsterId = result?.nextMonsterId ?? null;
  const advancing = !!nextMonsterId; // another boss queued in this run
  const endlessAvailable = !!result?.endlessAvailable; // cleared the whole run
  // The endless offer still lets you bank a boon that carries into the next cycle.
  const showUpgrades = endlessAvailable;

  // Offers for the endless bank (3 generic + 4 character picks). Rolled randomly,
  // so seed them in an effect (can't run during render) whenever a new eligible
  // result lands, and reset the picks.
  const [genOffers, setGenOffers] = useState<UpgradeId[]>([]);
  const [charOffers, setCharOffers] = useState<string[]>([]);
  const [pickedGen, setPickedGen] = useState<UpgradeId | null>(null);
  const [pickedChar, setPickedChar] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- intentional derived-random reset keyed on a new result */
  // Generic offers + pick reset: only on a NEW result. Kept separate from the char
  // roll so acquiring a class mid-screen never disturbs a banked generic pick.
  useEffect(() => {
    if (!showUpgrades) return;
    const st = useStore.getState();
    const rnd = rewardRnd(result?.rewardSeed, CLASS_IDS.indexOf(localClass) + 1);
    setGenOffers(rollUpgradeChoices(3, rnd, st.myUpgrades));
    setPickedGen(null);
    setPickedChar(null);
  }, [showUpgrades, localClass, result]);

  // Character offers span EVERY owned class (weighted toward the primary) and RE-ROLL
  // whenever a class or sub-skill is acquired here via SpecialReward (item 8) — so the
  // final screen's picks include the class you just multiclassed into. Never overwrites
  // a char pick already committed this screen (would double-bank the boon).
  useEffect(() => {
    if (!showUpgrades || pickedChar) return;
    const st = useStore.getState();
    const rnd = rewardRnd(
      result?.rewardSeed,
      CLASS_IDS.indexOf(localClass) + 1,
      myExtraClasses.length,
      mySubSkills.length,
    );
    // item 6: equipped sub skills bring their per-sub-skill boons into the pool.
    setCharOffers(
      rollCharChoices(localClass, 4, rnd, st.myCharUpgrades, myExtraClasses, mySubSkills),
    );
  }, [showUpgrades, localClass, result, myExtraClasses, mySubSkills, pickedChar]);
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

  // Between-boss (another boss queued): the walkable reward room replaces the
  // flat card screen entirely.
  if (advancing) return <RewardRoom result={result} />;

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
            {(result.modName ? `${result.modName} ` : '') + getMonster(result.monsterId).name} —
            Boss {runIndex + 1} of {runTotal}
            {cycle > 0 ? ` · Cycle ${cycle + 1}` : ''}
          </p>
        ) : null}

        {endlessAvailable ? (
          <div className="wb-advance-note" role="status">
            <span className="wb-advance-title">You felled the whole gauntlet!</span>
            <span className="wb-advance-sub">
              Bank your upgrades and press on into Endless — every cycle grows deadlier.
            </span>
          </div>
        ) : null}

        {showUpgrades ? <SpecialReward /> : null}

        {showUpgrades ? <EphemeralShop /> : null}

        {showUpgrades ? (
          <div className="wb-upgrades">
            <h3 className="wb-upgrades-title">
              {pickedGen ? 'Generic upgrade chosen' : 'Choose a generic upgrade'}
            </h3>
            <div className="wb-upgrade-cards">
              {genOffers.map((id) => {
                const u = getUpgrade(id);
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
                // describeCharOffer resolves real boons, `restore:` reclaims and
                // `graftup:` grafted-skill upgrades alike (items 15 & 17).
                const view = describeCharOffer(localClass, myCharUpgrades, id);
                if (!view) return null;
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
                    <span className="wb-upgrade-name">{view.label}</span>
                    <span className="wb-upgrade-desc">{view.desc}</span>
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
                  {myUpgrades.map((id, i) => {
                    const u = getUpgrade(id);
                    return (
                      <span key={`g-${id}-${i}`} className="wb-upgrade-badge" title={u.desc}>
                        {u.icon} {u.name}
                      </span>
                    );
                  })}
                  {myCharUpgrades.map((id, i) => {
                    const b = charUpgradeBadge(id);
                    return b ? (
                      <span
                        key={`c-${id}-${i}`}
                        className="wb-upgrade-badge wb-badge-char"
                        title={b.desc}
                      >
                        {b.icon} {b.name}
                      </span>
                    ) : null;
                  })}
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
          ) : (
            <>
              {/* Hardcore has no FREE retry on a wipe (item 11) — but a banked
                  Second Chance from the ephemeral shop (item 21) buys one back. */}
              {isHost && (!(activeHardcore && !victory) || result.hardcoreRetryAvailable) ? (
                <button type="button" className="wb-btn wb-btn-danger" onClick={onRetry}>
                  {victory
                    ? 'Play Again'
                    : result.hardcoreRetryAvailable
                      ? 'Second Chance'
                      : 'Retry'}
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
