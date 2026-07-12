/**
 * Warband — the walkable REWARD ROOM (diegetic between-boss upgrade phase).
 *
 * Instead of a flat card screen, you drop into a small chamber as your hero:
 * relics lie on the floor (a set of generic boons + a set of class boons). Walk
 * onto one to CLAIM it — a short dwell so you don't grab the wrong one in
 * passing. Claim your boons and a descent VORTEX opens at the head of the room;
 * walk into it to ready up for the next boss (step out to un-ready). The band
 * only descends once everyone has, exactly like the old ready-gate.
 *
 * Mirrors MainMenu's walkable-playground pattern: a local `RewardScene` (the
 * real engine World in `reward` mode) rendered by the real renderer, with the
 * classic card list kept one click away as an accessible / pointer fallback.
 * Networking is unchanged — claims relay through chooseUpgrade/chooseCharUpgrade
 * and readiness through setNextReady, just as the flat screen did.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { chooseUpgrade, chooseCharUpgrade, setNextReady, playUiSound, sfx } from '../state/session';
import { selfId } from '../../net/transport/room';
import { useGamepadMenu } from '../../input/useGamepadMenu';
import HUD from './HUD';
import TouchControls from './TouchControls';
import { useHudStore } from '../state/hudStore';
import { pushHud } from '../state/hudBridge';
import { RewardScene, type RewardOffers, type RelicFocus } from '../state/rewardScene';
import { Renderer } from '../../render/pipeline/renderer';
import { InputManager } from '../../input/input';
import { ARENA_W, ARENA_H } from '../../engine/core/constants';
import { CLASSES, CLASS_IDS } from '../../engine/content/classes';
import { MONSTERS } from '../../engine/content/monsters';
import { Rng, mixSeed } from '../../engine/core/math';
import { UPGRADES, rollUpgradeChoices, type UpgradeId } from '../../engine/content/upgrades';
import {
  CHAR_UPGRADES,
  rollCharChoices,
  previewAbilityTable,
} from '../../engine/content/charUpgrades';
import type { ClassId, FightResult } from '../../engine/core/types';

/**
 * Roll this round's offers (3 generic + 4 class) and hydrate them for the floor.
 * Boons already at their stacking cap are filtered out (owned lists), and a graft
 * offer names the REAL skill it would replace (e.g. "Replaces Fireball") using the
 * hero's current, upgrade-resolved ability table.
 */
function rollOffers(
  classId: ClassId,
  ownedGen: UpgradeId[],
  ownedChar: string[],
  rewardSeed?: number,
): RewardOffers {
  // With a shared seed, roll from a deterministic per-class stream so the same
  // seed reproduces the same boons between the same bosses (seed mode / daily
  // run). Without one (legacy single fights), fall back to Math.random.
  let rnd: () => number = Math.random;
  if (rewardSeed != null) {
    const rng = new Rng(mixSeed(rewardSeed, CLASS_IDS.indexOf(classId) + 1));
    rnd = () => rng.next();
  }
  const gen = rollUpgradeChoices(3, rnd, ownedGen);
  const chr = rollCharChoices(classId, 4, rnd, ownedChar);
  const current = previewAbilityTable(classId, ownedChar);
  return {
    generic: gen.map((id) => {
      const u = UPGRADES[id];
      return { id, label: `${u.icon} ${u.name}`, desc: u.desc };
    }),
    char: chr
      .filter((id) => CHAR_UPGRADES[id])
      .map((id) => {
        const u = CHAR_UPGRADES[id];
        const replaced = u.replaces ? current[u.replaces]?.name : null;
        let desc = replaced ? `${u.desc}. Replaces ${replaced}.` : u.desc;
        // A GRAND improvement is a rare one-of-a-kind capstone — flag it.
        if (u.grand) desc = `GRAND — ${desc}`;
        const label = u.grand ? `★ ${u.icon} ${u.name}` : `${u.icon} ${u.name}`;
        return { id, label, desc };
      }),
  };
}

export default function RewardRoom({ result }: { result: FightResult }) {
  const localClass = useStore((s) => s.localClass);
  const myUpgrades = useStore((s) => s.myUpgrades);
  const myCharUpgrades = useStore((s) => s.myCharUpgrades);
  const readyReady = useStore((s) => s.nextReadyReady);
  const readyTotal = useStore((s) => s.nextReadyTotal);

  // Offers are rolled ONCE for this interstitial (the component remounts fresh
  // each result phase, so this is stable for the room's whole lifetime). The
  // owned picks are snapshotted at mount so claiming here never re-rolls the
  // floor — only maxed-out boons carried IN from prior bosses are filtered.
  const offers = useMemo(
    () =>
      rollOffers(
        localClass,
        useStore.getState().myUpgrades,
        useStore.getState().myCharUpgrades,
        result.rewardSeed,
      ),
    [localClass, result.rewardSeed],
  );

  const canvasRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<RewardScene | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Bridges the list-view "ready" toggle into the render loop's closure (and lets
  // the fallback work when the render loop never starts, e.g. no WebGL).
  const toggleListReadyRef = useRef<(() => void) | null>(null);

  const [pickedGen, setPickedGen] = useState<string | null>(null);
  const [pickedChar, setPickedChar] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [showList, setShowList] = useState(false);
  const [focus, setFocus] = useState<RelicFocus | null>(null);
  const [vortexOpen, setVortexOpen] = useState(false);
  const [descending, setDescending] = useState(false);
  const [descentCharge, setDescentCharge] = useState(0);

  const showListRef = useRef(showList);
  useEffect(() => {
    showListRef.current = showList;
  }, [showList]);

  // Gamepad drives the list overlay when it's open; otherwise the pad belongs to
  // the hero (walk to a relic / the vortex instead of scrolling a menu).
  useGamepadMenu(listRef, { enabled: showList, onBack: () => setShowList(false) });

  // Next-boss framing for the banner (twin fights name both).
  const nextName = useMemo(() => {
    const ids =
      result.nextMonsterIds && result.nextMonsterIds.length > 0
        ? result.nextMonsterIds
        : result.nextMonsterId
          ? [result.nextMonsterId]
          : [];
    if (ids.length === 0) return '';
    const prefix = result.modName ? `${result.modName} ` : '';
    if (ids.length > 1) return `${ids.map((id) => MONSTERS[id].name).join(' & ')} — TWIN fight!`;
    return `${prefix}${MONSTERS[ids[0]].name}`;
  }, [result]);

  useEffect(() => {
    const container = canvasRef.current;
    if (!container) return;

    const st = useStore.getState();
    const myScore = result.stats.find((s) => s.peerId === selfId)?.score ?? 0;
    const scene = new RewardScene(st.localName || 'Hero', st.localClass, offers, myScore);
    sceneRef.current = scene;

    let renderer: Renderer | null = null;
    let input: InputManager | null = null;
    let raf = 0;
    let disposed = false;
    let seq = 0;
    let lastHud = 0;
    let lastPush = 0;
    let lastSentReady = false;
    let listReady = false;

    // Single funnel for readiness so the walk-in vortex and the list-view button
    // never fight: relay only when the desired state actually flips.
    const applyReady = (desired: boolean): void => {
      if (desired === lastSentReady) return;
      lastSentReady = desired;
      setReady(desired);
      setNextReady(desired);
      if (desired) sfx.play('uiConfirm');
    };
    // Expose the list-view toggle to the loop via the scene ref closure. Base the
    // flip on the CURRENT effective readiness (not the private latch) so clicking
    // while already ready-via-vortex can't strand listReady=true and defeat the
    // "step out of the vortex to un-ready" rule.
    toggleListReadyRef.current = () => {
      listReady = !lastSentReady;
      applyReady(listReady || scene.readyToDescend());
    };

    let padMenuPrev = false;

    void (async () => {
      try {
        renderer = await Renderer.create(container, { w: ARENA_W, h: ARENA_H });
        if (disposed) {
          renderer.dispose();
          renderer = null;
          return;
        }
        input = new InputManager(renderer.app.canvas);
      } catch {
        // No WebGL / renderer failure (e.g. jsdom, headless): the accessible
        // list view still works; the room just goes undrawn.
        renderer?.dispose();
        renderer = null;
        return;
      }

      const loop = (): void => {
        raf = requestAnimationFrame(loop);
        if (!renderer || !input) return;
        const now = performance.now();

        // Freeze the hero while the list overlay (or Controls) is up.
        const uiOpen = showListRef.current || useStore.getState().showControls;

        // Gamepad Options/Start toggles the accessible list view (walk-free path).
        const padMenu = padMenuPressed();
        if (padMenu && !padMenuPrev && !useStore.getState().showControls) {
          setShowList((v) => !v);
        }
        padMenuPrev = padMenu;

        const state = scene.frame(now, uiOpen);
        const localId = state.localPlayerId;
        const lp = localId != null ? state.players.find((p) => p.id === localId) : null;
        const localScreen = lp
          ? renderer.worldToScreen(lp.pos)
          : { x: container.clientWidth / 2, y: container.clientHeight / 2 };

        const sampled = input.sample(localScreen);
        seq += 1;
        scene.setInput({
          seq,
          move: uiOpen ? { x: 0, y: 0 } : sampled.move,
          aim: sampled.aim,
          buttons: uiOpen
            ? { basic: false, a1: false, a2: false, a3: false, revive: false }
            : sampled.buttons,
          autofire: useStore.getState().autofire,
        });

        renderer.render(state);
        if (!useStore.getState().muted && state.events.length > 0) {
          sfx.handleEvents(state.events);
        }

        // Relic claims → relay + reflect in the local pick state.
        for (const c of scene.takeClaims()) {
          if (c.kind === 'generic') {
            setPickedGen(c.offer.id);
            chooseUpgrade(c.offer.id as UpgradeId);
          } else {
            setPickedChar(c.offer.id);
            chooseCharUpgrade(c.offer.id);
          }
          sfx.play('uiConfirm');
        }

        // Readiness follows a committed vortex descent (or a list-view toggle).
        applyReady(scene.readyToDescend() || listReady);

        // Throttled UI mirror: inspector chip, vortex state, descend charge.
        if (now - lastPush > 80) {
          lastPush = now;
          setFocus(scene.focus());
          setVortexOpen(scene.vortexOpen());
          setDescending(scene.standingInVortex());
          setDescentCharge(scene.descentCharge());
        }

        if (now - lastHud > 66) {
          lastHud = now;
          pushHud(state, input.activeSource);
        }
      };
      raf = requestAnimationFrame(loop);
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      input?.dispose();
      renderer?.dispose();
      sceneRef.current = null;
      toggleListReadyRef.current = null;
      useHudStore.getState().resetHud();
    };
    // Mount-once by design (mirrors MainMenu): the scene reads its config from the
    // store + offers and owns its own loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offers]);

  const onPickGen = (id: string): void => {
    if (pickedGen) return;
    playUiSound('uiConfirm');
    setPickedGen(id);
    chooseUpgrade(id as UpgradeId);
    sceneRef.current?.markClaimed('generic', id);
  };
  const onPickChar = (id: string): void => {
    if (pickedChar) return;
    playUiSound('uiConfirm');
    setPickedChar(id);
    chooseCharUpgrade(id);
    sceneRef.current?.markClaimed('char', id);
  };
  const onToggleListReady = (): void => {
    playUiSound('uiClick');
    // Set synchronously in the mount effect (before the async renderer bring-up),
    // so it is always available here — including headless, where the loop never
    // starts. The optional-call guard only covers the post-unmount teardown.
    toggleListReadyRef.current?.();
  };

  const generic = offers.generic;
  const chars = offers.char;

  return (
    <div className="wb-playground-root wb-reward-root">
      <div ref={canvasRef} className="wb-playground-canvas" aria-hidden="true" />
      <HUD />
      {/* Touch overlay so mobile players can walk to relics + the vortex. */}
      {!showList ? <TouchControls /> : null}

      {/* Room banner: run progress + next boss. */}
      <div className="wb-reward-banner">
        <span className="wb-reward-banner-title">
          {result.runTotal && result.runTotal > 1
            ? `Boss ${(result.runIndex ?? 0) + 1} of ${result.runTotal} felled`
            : 'Boss felled'}
        </span>
        {nextName ? <span className="wb-reward-banner-next">Next: {nextName}</span> : null}
        {result.runSeed != null ? (
          <span className="wb-reward-banner-seed" title="Share this seed to replay the exact run">
            Seed: {result.runSeed.toString(36).toUpperCase()}
          </span>
        ) : null}
        <span className="wb-reward-banner-hint">
          Walk onto a relic to claim it — then step into the vortex to descend. Or open the list
          view.
        </span>
      </div>

      {/* List-view toggle (accessible / pointer fallback). */}
      <button
        type="button"
        className="wb-btn wb-btn-ghost wb-reward-listbtn"
        onClick={() => {
          playUiSound('uiClick');
          setShowList((v) => !v);
        }}
        aria-expanded={showList}
      >
        {showList ? 'Close list' : 'List view'}
      </button>

      {/* Diegetic relic inspector (what you're standing on / near). */}
      {focus && !showList ? (
        <div className="wb-totem-hint wb-reward-inspect">
          <div className="wb-reward-inspect-name">{focus.offer.label}</div>
          <div className="wb-reward-inspect-desc">{focus.offer.desc}</div>
          {focus.claimed ? (
            <div className="wb-reward-inspect-tag claimed">Claimed ✓</div>
          ) : focus.locked ? (
            <div className="wb-reward-inspect-tag locked">
              Passed over — you already took a {focus.kind === 'generic' ? 'boon' : 'class boon'}
            </div>
          ) : (
            <div className="wb-totem-hint-track">
              <div className="wb-totem-hint-fill" style={{ width: `${focus.dwell * 100}%` }} />
            </div>
          )}
        </div>
      ) : null}

      {/* Descend prompt + band tally (near the vortex, once it's open). */}
      {vortexOpen && !showList ? (
        <div className="wb-reward-descend" role="status">
          <div className="wb-reward-descend-title">
            {ready ? 'Descending…' : descending ? 'Charging descent…' : 'The vortex yawns open'}
          </div>
          {descending && !ready ? (
            <div className="wb-totem-hint-track wb-reward-descend-track">
              <div className="wb-totem-hint-fill" style={{ width: `${descentCharge * 100}%` }} />
            </div>
          ) : (
            <div className="wb-reward-descend-sub">
              {ready
                ? readyTotal > 1
                  ? `Holding for the band — ${readyReady}/${readyTotal} descended`
                  : 'Falling to the next floor…'
                : 'Step into the vortex to descend to the next boss.'}
            </div>
          )}
        </div>
      ) : null}

      {/* Accessible list overlay: the classic cards + ready button. */}
      {showList ? (
        <div className="wb-overlay" role="dialog" aria-label="Between-boss upgrades">
          <div className="wb-panel wb-reward-list" ref={listRef}>
            <h2 className="wb-title-sm">Claim your boons</h2>
            {nextName ? (
              <p className="wb-reward-list-next" role="status">
                {result.runTotal && result.runTotal > 1
                  ? `Boss ${(result.runIndex ?? 0) + 1}/${result.runTotal} felled · Next: ${nextName}`
                  : `Next: ${nextName}`}
              </p>
            ) : null}

            <h3 className="wb-upgrades-title">
              {pickedGen ? 'Generic boon chosen' : 'Choose a generic boon'}
            </h3>
            <div className="wb-upgrade-cards">
              {generic.map((o) => {
                const isPicked = pickedGen === o.id;
                const dimmed = pickedGen && !isPicked;
                return (
                  <button
                    type="button"
                    key={o.id}
                    className={`wb-upgrade-card${isPicked ? ' picked' : ''}${dimmed ? ' dimmed' : ''}`}
                    onClick={() => onPickGen(o.id)}
                    disabled={!!pickedGen}
                    aria-pressed={isPicked}
                  >
                    <span className="wb-upgrade-name">{o.label}</span>
                    <span className="wb-upgrade-desc">{o.desc}</span>
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
              {pickedChar ? 'Class boon chosen' : `Choose a ${CLASSES[localClass].name} boon`}
            </h3>
            <div className="wb-upgrade-cards">
              {chars.map((o) => {
                const isPicked = pickedChar === o.id;
                const dimmed = pickedChar && !isPicked;
                return (
                  <button
                    type="button"
                    key={o.id}
                    className={`wb-upgrade-card wb-upgrade-char${isPicked ? ' picked' : ''}${dimmed ? ' dimmed' : ''}`}
                    onClick={() => onPickChar(o.id)}
                    disabled={!!pickedChar}
                    aria-pressed={isPicked}
                  >
                    <span className="wb-upgrade-name">{o.label}</span>
                    <span className="wb-upgrade-desc">{o.desc}</span>
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
                <span className="wb-field-label">Your boons this run</span>
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

            <div className="wb-next-ready" role="status">
              <button
                type="button"
                className={`wb-btn wb-btn-lg${ready ? ' wb-btn-ghost is-ready' : ' wb-btn-primary'}`}
                onClick={onToggleListReady}
                aria-pressed={ready}
              >
                {ready ? 'Ready ✓ — waiting' : 'Descend to next boss'}
              </button>
              <span className="wb-ready-tally">
                {readyReady}/{readyTotal} ready
              </span>
            </div>
            <p className="wb-await-host" role="status">
              {readyTotal > 0 && readyReady >= readyTotal
                ? 'Advancing…'
                : ready
                  ? 'Waiting for the rest of the band…'
                  : 'The run descends once everyone is ready.'}
            </p>

            <button
              type="button"
              className="wb-btn wb-btn-ghost"
              onClick={() => {
                playUiSound('uiClick');
                setShowList(false);
              }}
            >
              Back to the room
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Gamepad "Options / Start" button index (standard mapping). */
const PAD_MENU_BUTTON = 9;

/** Is the gamepad's Options/Start button currently pressed on any pad? */
function padMenuPressed(): boolean {
  try {
    const nav = navigator as Navigator & { getGamepads?: () => (Gamepad | null)[] };
    const pads = nav.getGamepads?.() ?? [];
    for (const pad of pads) {
      if (pad && pad.connected && pad.buttons[PAD_MENU_BUTTON]?.pressed) return true;
    }
  } catch {
    /* no gamepad API — ignore */
  }
  return false;
}
