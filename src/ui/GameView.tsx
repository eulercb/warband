/**
 * Warband — GameView. Mounts the PixiJS canvas (imperative, outside React's
 * render cycle), runs the input + render loop each animation frame, feeds input
 * upstream via the NetSession, and bridges a throttled HUD slice to React.
 */
import { useEffect, useRef } from 'react';
import { useStore } from './store';
import { hudSet, useHudStore } from './hudStore';
import { sfx } from './session';
import HUD from './HUD';
import { Renderer } from '../render/renderer';
import { InputManager } from '../input/input';
import { getMonster } from '../engine/monsters';
import { ARENA_W, ARENA_H, REVIVE_TIME } from '../engine/constants';
import type { InputCommand, InputState, RenderState } from '../engine/types';

function pushHud(state: RenderState): void {
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

export default function GameView() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: Renderer | null = null;
    let input: InputManager | null = null;
    let raf = 0;
    let disposed = false;
    let seq = 0;
    let lastHud = 0;

    const session = useStore.getState().session;

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
        seq += 1;
        const cmd: InputCommand = {
          seq,
          move: sampled.move,
          aim: sampled.aim,
          buttons: sampled.buttons,
        };
        session?.setLocalInput(cmd);

        renderer.render(state);

        if (!useStore.getState().muted && state.events.length > 0) {
          sfx.handleEvents(state.events);
        }

        if (now - lastHud > 66) {
          lastHud = now;
          pushHud(state);
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
  }, []);

  return (
    <div className="game-root">
      <div ref={containerRef} className="game-canvas" />
      <HUD />
    </div>
  );
}
