/**
 * Warband — the walkable MUSTER HALL (diegetic lobby). Wraps the classic lobby
 * panel (room code, share link, roster, class picker, bot + host controls — all
 * kept for the coordination they carry) with a walkable scene: your hero stands
 * in the hall, and you ready up by stepping onto the muster rune. If you host,
 * step onto the war-horn to start once the band is ready. The panel's Ready /
 * Start buttons remain as the pointer / keyboard / screen-reader path; both feed
 * the same setReady / startFight, so nothing about networking changes.
 */
import { useEffect, useRef } from 'react';
import { useStore } from '../state/store';
import { setReady, startFight, playUiSound, addBot } from '../state/session';
import Lobby from '../screens/Lobby';
import HUD from './HUD';
import { useHudStore } from '../state/hudStore';
import { pushHud } from '../state/hudBridge';
import { MusterScene } from '../state/musterScene';
import { Renderer } from '../../render/pipeline/renderer';
import { InputManager } from '../../input/input';
import { ARENA_W, ARENA_H, MAX_PLAYERS } from '../../engine/core/constants';
import type { ClassId } from '../../engine/core/types';
import type { AppState } from '../state/store';

/** Whether the host may start now (no other humans, or all of them are ready). */
function computeCanStart(s: Pick<AppState, 'players' | 'isHost'>): boolean {
  const otherHumans = s.players.filter((p) => !p.isBot && !p.isHost);
  return otherHumans.length === 0 || otherHumans.every((p) => p.ready);
}

export default function MusterHall() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const isHost = useStore((s) => s.isHost);

  useEffect(() => {
    const container = canvasRef.current;
    if (!container) return;

    const st = useStore.getState();
    const scene = new MusterScene(st.localName || 'Hero', st.localClass, st.isHost);

    let renderer: Renderer | null = null;
    let input: InputManager | null = null;
    let raf = 0;
    let disposed = false;
    let seq = 0;
    let lastHud = 0;
    let lastClass = st.localClass;

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
        const store = useStore.getState();
        const uiOpen = store.showControls;

        // Keep the rune/horn + avatar in sync with the shared lobby state.
        scene.setReady(store.localReady);
        scene.setCanStart(computeCanStart(store));
        scene.setPartyFull(store.players.length >= MAX_PLAYERS); // item 1: grey out add-bot effigies
        if (store.localClass !== lastClass) {
          lastClass = store.localClass;
          scene.setClass(store.localClass);
        }

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
          if (trig.kind === 'muster') {
            setReady(!useStore.getState().localReady);
            playUiSound('uiConfirm');
          } else if (trig.kind === 'start') {
            if (computeCanStart(useStore.getState())) startFight();
          } else if (trig.kind === 'addbot' && trig.refId) {
            // item 1: walk onto a class effigy to add a bot of that class.
            if (useStore.getState().players.length < MAX_PLAYERS) {
              addBot(trig.refId as ClassId);
              playUiSound('uiConfirm');
            }
          }
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
    // Mount-once by design (mirrors MainMenu / WarRoom).
  }, []);

  return (
    <div className="wb-playground-root wb-muster-hall">
      <div ref={canvasRef} className="wb-playground-canvas" aria-hidden="true" />
      <HUD />
      <div className="wb-muster-hint" aria-hidden="true">
        Step onto the muster rune to ready up — the war-horn starts the fight.
        {isHost ? ' Walk onto a class effigy to add a bot of that class.' : ''}
      </div>
      <Lobby />
    </div>
  );
}
