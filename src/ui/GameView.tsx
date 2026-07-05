/**
 * Warband — GameView. Mounts the PixiJS canvas (imperative, outside React's
 * render cycle), runs the input + render loop each animation frame, feeds input
 * upstream via the NetSession, and bridges a throttled HUD slice to React.
 *
 * Also owns the in-fight pause menu: Esc (keyboard) or Options/Start (gamepad)
 * opens a local overlay; the host additionally freezes the shared sim while it
 * is open. Input is neutralised while the menu is open so nobody keeps acting.
 */
import { useEffect, useRef, useState } from 'react';
import { useStore } from './store';
import { hudSet, useHudStore } from './hudStore';
import { sfx, pauseGame, resumeGame } from './session';
import HUD from './HUD';
import PauseMenu from './PauseMenu';
import { Renderer } from '../render/renderer';
import { InputManager } from '../input/input';
import { getMonster } from '../engine/monsters';
import { ARENA_W, ARENA_H, REVIVE_TIME } from '../engine/constants';
import type { InputCommand, InputState, RenderState } from '../engine/types';
import type { InputSource } from '../input/input';

/** Gamepad "Options / Start" button index (standard mapping) for the menu toggle. */
const PAD_MENU_BUTTON = 9;

function pushHud(state: RenderState, source: InputSource): void {
  const localId = state.localPlayerId;
  const lp = localId != null ? state.players.find((p) => p.id === localId) ?? null : null;
  const boss = state.boss;
  hudSet({
    active: true,
    classId: lp?.classId ?? null,
    hp: lp?.hp ?? 0,
    maxHp: lp?.maxHp ?? 1,
    state: lp?.state ?? 'dead',
    cooldowns: lp?.cooldowns ?? { basic: 0, a1: 0, a2: 0, a3: 0 },
    casting: (lp?.castTimer ?? 0) > 0,
    inputSource: source,
    bossPresent: !!boss,
    bossName: boss ? getMonster(boss.monsterId).name : '',
    bossHp: boss?.hp ?? 0,
    bossMaxHp: boss?.maxHp ?? 1,
    bossPhase: boss?.phase ?? 'normal',
    teammates: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      classId: p.classId,
      hp: p.hp,
      maxHp: p.maxHp,
      state: p.state,
      isLocal: p.id === localId,
    })),
    reviveProgress:
      lp && lp.state === 'downed' ? Math.min(1, lp.reviveProgress / REVIVE_TIME) : 0,
    downedTimer: lp?.downedTimer ?? 0,
  });
}

const NEUTRAL_BUTTONS = { basic: false, a1: false, a2: false, a3: false, revive: false };

export default function GameView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuOpenRef = useRef(false);
  const paused = useStore((s) => s.paused);

  const setMenu = (open: boolean): void => {
    menuOpenRef.current = open;
    setMenuOpen(open);
    // Host also freezes/unfreezes the shared sim while the menu is up.
    if (open) pauseGame();
    else resumeGame();
  };

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

    const session = useStore.getState().session;

    // Esc toggles the pause menu — but if the Controls overlay is stacked on
    // top, let it handle Esc (close itself) instead of closing the pause menu.
    const onKey = (e: KeyboardEvent): void => {
      if (e.code === 'Escape') {
        if (useStore.getState().showControls) return;
        e.preventDefault();
        setMenu(!menuOpenRef.current);
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

        // Local player's screen position, for mouse-relative aim.
        const localId = state.localPlayerId;
        const lp = localId != null ? state.players.find((p) => p.id === localId) : null;
        const localScreen = lp
          ? renderer.worldToScreen(lp.pos)
          : { x: container.clientWidth / 2, y: container.clientHeight / 2 };

        const sampled: InputState = input.sample(localScreen);

        // Gamepad Options/Start edge toggles the menu.
        const padMenu = padMenuPressed();
        if (padMenu && !padMenuPrev) setMenu(!menuOpenRef.current);
        padMenuPrev = padMenu;

        seq += 1;
        // Freeze input while our own menu is open OR the host has paused the
        // shared sim (store.paused) — the latter stops a remote client from
        // walking its predicted hero around a frozen arena and rubber-banding
        // on resume.
        const frozen = menuOpenRef.current || useStore.getState().paused;
        const cmd: InputCommand = {
          seq,
          move: frozen ? { x: 0, y: 0 } : sampled.move,
          aim: sampled.aim,
          buttons: frozen ? { ...NEUTRAL_BUTTONS } : sampled.buttons,
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
      {menuOpen ? (
        <PauseMenu onResume={() => setMenu(false)} />
      ) : paused ? (
        <div className="wb-pause-banner" role="status">
          <span>⏸ Host paused the game</span>
        </div>
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
