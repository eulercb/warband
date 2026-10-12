/**
 * Warband — the walkable MUSTER HALL (diegetic lobby). Wraps the classic lobby
 * panel (room code, share link, roster, class picker, bot + host controls — all
 * kept for the coordination they carry) with a walkable scene: your hero stands
 * in the hall, and you ready up by stepping onto the muster rune. If you host,
 * step onto the war-horn to start once the band is ready. The panel's Ready /
 * Start buttons remain as the pointer / keyboard / screen-reader path; both feed
 * the same setReady / startFight, so nothing about networking changes.
 */
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import Lobby from '../screens/Lobby';
import HUD from './HUD';
import TouchControls from './TouchControls';
import MobileMenu from './MobileMenu';
import { useMobileMenu } from './useMobileMenu';
import RoomHelp from './RoomHelp';
import { useRoomGuide } from './useRoomGuide';
import { ROOM_GUIDES } from './roomGuides';
import { nearbyRoomChoice, type RoomFocus } from './roomFocus';
import { useHudStore } from '../state/hudStore';
import { pushHud } from '../state/hudBridge';
import { MusterScene } from '../state/musterScene';
import { computeCanStart, relayMusterTrigger } from './menuTriggers';
import { Renderer } from '../../render/pipeline/renderer';
import { InputManager } from '../../input/input';
import { ARENA_W, ARENA_H, MAX_PLAYERS } from '../../engine/core/constants';

export default function MusterHall() {
  const guide = useRoomGuide('lobby');
  const dismissGuideOnMove = guide.activity;
  const [nearby, setNearby] = useState<RoomFocus | null>(null);
  const menu = useMobileMenu();
  const mobileRef = useRef(menu.mobile);
  useEffect(() => {
    mobileRef.current = menu.mobile;
  }, [menu.mobile]);
  const menuOpenRef = useRef(menu.open);
  useEffect(() => {
    menuOpenRef.current = menu.open;
  }, [menu.open]);
  const showControls = useStore((s) => s.showControls);
  const error = useStore((s) => s.error);
  const roomCode = useStore((s) => s.roomCode);
  const localReady = useStore((s) => s.localReady);

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
        const uiOpen = menuOpenRef.current || store.showControls;

        // Keep the rune/horn + avatar in sync with the shared lobby state.
        scene.setReady(store.localReady);
        scene.setCanStart(computeCanStart(store));
        scene.setPartyFull(store.players.length >= MAX_PLAYERS); // item 1: grey out add-bot effigies
        // Feed the live bot roster so the walkable "your band" removal markers track
        // adds/removes (host-only; the scene ignores this for a client).
        scene.setBots(
          store.players
            .filter((p) => p.isBot)
            .map((p) => ({ peerId: p.peerId, classId: p.classId })),
        );
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
        if (!uiOpen && (sampled.move.x !== 0 || sampled.move.y !== 0)) dismissGuideOnMove();
        seq += 1;
        scene.setInput({
          seq,
          move: uiOpen ? { x: 0, y: 0 } : sampled.move,
          aim: sampled.aim,
          buttons: { basic: false, a1: false, a2: false, a3: false, revive: false },
        });

        renderer.render(state, { compactMenuLabels: mobileRef.current });

        for (const trig of scene.takeTriggers()) relayMusterTrigger(trig);

        if (now - lastHud > 66) {
          lastHud = now;
          setNearby(nearbyRoomChoice(state));
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
  }, [dismissGuideOnMove]);

  return (
    <div
      className={`wb-playground-root wb-muster-hall wb-guided-room${menu.mobile ? ' wb-guided-mobile' : ''}`}
      onPointerDownCapture={guide.pointer}
    >
      <div ref={canvasRef} className="wb-playground-canvas" aria-hidden="true" />
      <HUD />
      {!menu.open && !showControls ? <TouchControls navigationOnly /> : null}
      {menu.mobile && !menu.open ? (
        <div className="wb-mobile-room-status">
          Room {roomCode} · {localReady ? 'Ready' : 'Not ready'}
        </div>
      ) : null}
      <div className="wb-muster-hint" aria-hidden="true">
        Step onto the muster rune to ready up — the war-horn starts the fight.
        {isHost
          ? ' Fill your band with bots — step on a class effigy up top to add that class, then step on a bot marker in your band below to send it home.'
          : ''}
      </div>
      <RoomHelp
        guide={guide}
        steps={ROOM_GUIDES.lobby}
        label="Lobby guide"
        focus={nearby}
        mobile={menu.mobile}
        blocked={menu.open || showControls || Boolean(error)}
      />
      {menu.mobile && !menu.open && error ? (
        <div className="wb-error wb-mobile-error" role="alert">
          {error}
        </div>
      ) : null}
      <MobileMenu {...menu} label="Lobby menu">
        <Lobby />
      </MobileMenu>
    </div>
  );
}
