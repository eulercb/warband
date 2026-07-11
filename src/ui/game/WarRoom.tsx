/**
 * Warband — the walkable WAR ROOM (diegetic host setup).
 *
 * Replaces the flat boss grid: you stand in a war room, the bosses risen as
 * effigies grouped behind EASY / MEDIUM / HARD gates. Walk onto an effigy to
 * choose your run's opener; step into the SINGLE / GAUNTLET portal to pick the
 * run mode; then walk into the RAISE YOUR BANNER portal (a deliberate channel)
 * to host. The classic host-setup form stays one click away as the List view
 * for pointer / keyboard / screen-reader players. Networking is unchanged — the
 * host portal calls the same hostGame() the Create Room button did.
 */
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { hostGame, setMonster, setGauntlet, playUiSound } from '../state/session';
import { useGamepadMenu } from '../../input/useGamepadMenu';
import HUD from './HUD';
import HostSetup from '../screens/HostSetup';
import { useHudStore } from '../state/hudStore';
import { pushHud } from '../state/hudBridge';
import { WarScene } from '../state/warScene';
import { Renderer } from '../../render/pipeline/renderer';
import { InputManager } from '../../input/input';
import { ARENA_W, ARENA_H, RUN_LENGTH } from '../../engine/core/constants';
import { MONSTERS } from '../../engine/content/monsters';
import type { MonsterId } from '../../engine/core/types';

/** Gamepad "Options / Start" button index (standard mapping). */
const PAD_MENU_BUTTON = 9;

function padMenuPressed(): boolean {
  try {
    const nav = navigator as Navigator & { getGamepads?: () => (Gamepad | null)[] };
    for (const pad of nav.getGamepads?.() ?? []) {
      if (pad && pad.connected && pad.buttons[PAD_MENU_BUTTON]?.pressed) return true;
    }
  } catch {
    /* no gamepad API — ignore */
  }
  return false;
}

export default function WarRoom() {
  const monsterId = useStore((s) => s.monsterId);
  const gauntlet = useStore((s) => s.gauntlet);
  const localName = useStore((s) => s.localName);
  const setLocalName = useStore((s) => s.setLocalName);
  const error = useStore((s) => s.error);

  const canvasRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [showList, setShowList] = useState(false);
  const [focusBoss, setFocusBoss] = useState<MonsterId | null>(null);
  const [creating, setCreating] = useState(false);

  const showListRef = useRef(showList);
  useEffect(() => {
    showListRef.current = showList;
  }, [showList]);

  useGamepadMenu(listRef, { enabled: showList, onBack: () => setShowList(false) });

  const opener = MONSTERS[monsterId];

  useEffect(() => {
    const container = canvasRef.current;
    if (!container) return;

    const st = useStore.getState();
    const scene = new WarScene(st.localName || 'Hero', st.localClass, st.monsterId, st.gauntlet);

    let renderer: Renderer | null = null;
    let input: InputManager | null = null;
    let raf = 0;
    let disposed = false;
    let seq = 0;
    let lastHud = 0;
    let lastPush = 0;
    let padMenuPrev = false;
    let hosting = false;

    const doHost = (): void => {
      if (hosting) return;
      hosting = true;
      setCreating(true);
      playUiSound('uiConfirm');
      void hostGame().catch((err: unknown) => {
        hosting = false;
        setCreating(false);
        useStore.getState().setError(err instanceof Error ? err.message : 'Failed to create room.');
      });
    };

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
        renderer?.dispose();
        renderer = null;
        return;
      }

      const loop = (): void => {
        raf = requestAnimationFrame(loop);
        if (!renderer || !input) return;
        const now = performance.now();
        const uiOpen = showListRef.current || useStore.getState().showControls;

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
          buttons: { basic: false, a1: false, a2: false, a3: false, revive: false },
        });

        renderer.render(state);

        for (const trig of scene.takeTriggers()) {
          if (trig.kind === 'boss' && trig.refId) {
            setMonster(trig.refId as MonsterId);
            playUiSound('uiClick');
          } else if (trig.kind === 'single') {
            setGauntlet(false);
            playUiSound('uiClick');
          } else if (trig.kind === 'gauntlet') {
            setGauntlet(true);
            playUiSound('uiClick');
          } else if (trig.kind === 'host') {
            doHost();
          }
        }

        if (now - lastPush > 90) {
          lastPush = now;
          setFocusBoss(scene.focusBoss());
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
      useHudStore.getState().resetHud();
    };
    // Mount-once by design (mirrors MainMenu / RewardRoom).
  }, []);

  const inspected = focusBoss ? MONSTERS[focusBoss] : null;

  return (
    <div className="wb-playground-root wb-war-root">
      <div ref={canvasRef} className="wb-playground-canvas" aria-hidden="true" />
      <HUD />

      {/* Current selection banner. */}
      <div className="wb-reward-banner wb-war-banner">
        <span className="wb-reward-banner-title">Choose your fight</span>
        <span className="wb-reward-banner-next">
          {opener.name} · {gauntlet ? `${RUN_LENGTH}-boss gauntlet` : 'single fight'}
        </span>
        <span className="wb-reward-banner-hint">
          Walk to a boss to pick it, into a portal for the mode, then into the banner to host. Or
          open the list view.
        </span>
      </div>

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

      {/* Corner: your name + the diegetic Back, plus any error. */}
      <div className="wb-panel wb-war-panel">
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
        <button
          type="button"
          className="wb-btn wb-btn-ghost"
          onClick={() => {
            playUiSound('uiClick');
            useStore.getState().setError(null);
            useStore.getState().setPhase('menu');
          }}
          disabled={creating}
        >
          Back to camp
        </button>
        {error ? (
          <div className="wb-error" role="alert">
            {error}
          </div>
        ) : null}
      </div>

      {/* Boss inspector when standing near an effigy. */}
      {inspected && !showList ? (
        <div className="wb-totem-hint wb-reward-inspect wb-war-inspect">
          <div className="wb-reward-inspect-name">{inspected.name}</div>
          <div className="wb-reward-inspect-desc">{inspected.theme}</div>
          <div className="wb-reward-inspect-tag" style={{ color: '#f2c14e' }}>
            {inspected.difficulty}
            {monsterId === focusBoss ? ' · chosen ✓' : ''}
          </div>
        </div>
      ) : null}

      {creating ? (
        <div className="wb-reward-descend" role="status">
          <div className="wb-reward-descend-title">Raising your banner…</div>
        </div>
      ) : null}

      {/* Accessible list overlay: the classic host-setup form. */}
      {showList ? (
        <div className="wb-overlay" role="dialog" aria-label="Host setup">
          <div ref={listRef}>
            <HostSetup />
          </div>
        </div>
      ) : null}
    </div>
  );
}
