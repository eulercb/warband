/**
 * Warband — GameView. Mounts the PixiJS canvas (imperative, outside React's
 * render cycle), runs the input + render loop each animation frame, feeds input
 * upstream via the NetSession, and bridges a throttled HUD slice to React.
 *
 * Also owns the in-fight pause menu: Esc (keyboard) or Options/Start (gamepad)
 * opens a local overlay; the host additionally freezes the shared sim while it
 * is open. Input is neutralised while the menu is open so nobody keeps acting.
 */
import { useEffect, useRef } from 'react';
import { useStore } from './store';
import { hudSet, useHudStore } from './hudStore';
import { pushHud } from './hudBridge';
import { sfx, requestPause } from './session';
import HUD from './HUD';
import PauseMenu from './PauseMenu';
import ResumeCountdown from './ResumeCountdown';
import { Renderer } from '../render/renderer';
import { InputManager } from '../input/input';
import { ARENA_W, ARENA_H } from '../engine/constants';
import type { InputCommand, InputState } from '../engine/types';

/** Gamepad "Options / Start" button index (standard mapping) for the menu toggle. */
const PAD_MENU_BUTTON = 9;

const NEUTRAL_BUTTONS = { basic: false, a1: false, a2: false, a3: false, revive: false };

/**
 * Is the shared sim currently frozen for the local player? True while paused OR
 * during the resume countdown — input is neutralised the whole time so nobody
 * keeps acting on a frozen arena and rubber-bands on resume.
 */
function isFrozen(): boolean {
  const s = useStore.getState();
  return s.paused || s.resumeCountdown != null;
}

/**
 * Toggle the shared pause. Running → pause; paused → begin the resume countdown;
 * mid-countdown → re-pause (cancel the countdown), so a mis-click doesn't force
 * everyone to wait out the 3 seconds.
 */
function togglePause(): void {
  const s = useStore.getState();
  if (s.resumeCountdown != null)
    requestPause(true); // cancel the countdown
  else requestPause(!s.paused);
}

export default function GameView() {
  const containerRef = useRef<HTMLDivElement>(null);
  // Shared pause state (authoritative from the host) drives the overlays for
  // EVERY player — not just whoever opened the menu.
  const paused = useStore((s) => s.paused);
  const resumeCountdown = useStore((s) => s.resumeCountdown);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: Renderer | null = null;
    let input: InputManager | null = null;
    let raf = 0;
    let disposed = false;
    let seq = 0;
    let lastHud = 0;
    let padMenuPrev = false;
    let legendInited = false; // set the pause-menu map legend once per fight

    const session = useStore.getState().session;

    // Esc toggles the shared pause — but if the Controls overlay is stacked on
    // top, let it handle Esc (close itself) instead of toggling pause.
    const onKey = (e: KeyboardEvent): void => {
      if (e.code === 'Escape') {
        if (useStore.getState().showControls) return;
        e.preventDefault();
        togglePause();
      }
    };
    window.addEventListener('keydown', onKey);

    void (async () => {
      renderer = await Renderer.create(container, { w: ARENA_W, h: ARENA_H });
      if (disposed) {
        renderer.dispose();
        renderer = null;
        return;
      }
      input = new InputManager(renderer.app.canvas as HTMLElement);

      const loop = () => {
        raf = requestAnimationFrame(loop);
        if (!renderer || !input) return;
        const now = performance.now();
        const state = session?.getRenderState(now) ?? null;
        if (!state) return;

        // Terrain + obstacles are static per fight — snapshot the legend once (on
        // the first real frame) so the pause menu can describe every hazard.
        if (!legendInited) {
          legendInited = true;
          const kinds = [...new Set(state.terrain.map((t) => t.kind))];
          hudSet({ terrainKinds: kinds, hasObstacles: state.obstacles.length > 0 });
        }

        // Local player's screen position, for mouse-relative aim.
        const localId = state.localPlayerId;
        const lp = localId != null ? state.players.find((p) => p.id === localId) : null;
        const localScreen = lp
          ? renderer.worldToScreen(lp.pos)
          : { x: container.clientWidth / 2, y: container.clientHeight / 2 };

        const sampled: InputState = input.sample(localScreen);

        // Gamepad Options/Start edge toggles the shared pause.
        const padMenu = padMenuPressed();
        if (padMenu && !padMenuPrev) togglePause();
        padMenuPrev = padMenu;

        seq += 1;
        // Freeze input while the shared sim is paused OR counting down to resume,
        // so nobody walks a predicted hero around a frozen arena.
        const frozen = isFrozen();
        const cmd: InputCommand = {
          seq,
          move: frozen ? { x: 0, y: 0 } : sampled.move,
          aim: sampled.aim,
          buttons: frozen ? { ...NEUTRAL_BUTTONS } : sampled.buttons,
          autofire: frozen ? false : useStore.getState().autofire,
        };
        session?.setLocalInput(cmd);

        renderer.render(state);

        if (!useStore.getState().muted && state.events.length > 0) {
          sfx.handleEvents(state.events);
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
      window.removeEventListener('keydown', onKey);
      input?.dispose();
      renderer?.dispose();
      useHudStore.getState().resetHud();
    };
  }, []);

  return (
    <div className="game-root">
      <div ref={containerRef} className="game-canvas" />
      <HUD />
      {resumeCountdown != null ? (
        <ResumeCountdown count={resumeCountdown} />
      ) : paused ? (
        <PauseMenu onResume={() => requestPause(false)} />
      ) : null}
    </div>
  );
}

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
