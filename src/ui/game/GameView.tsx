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
import { useStore } from '../state/store';
import { hudSet, useHudStore } from '../state/hudStore';
import { pushHud } from '../state/hudBridge';
import { sfx, requestPause, swapClass } from '../state/session';
import { radialSet, radialClose } from '../state/radialStore';
import HUD from './HUD';
import TouchControls from './TouchControls';
import ClassRadial from './ClassRadial';
import PauseMenu from './PauseMenu';
import ResumeCountdown from './ResumeCountdown';
import { Renderer } from '../../render/pipeline/renderer';
import { InputManager, type InputSource } from '../../input/input';
import { SwapGesture, hoveredSlot } from '../../input/radial';
import { rawGamepadAim } from '../../input/gamepad';
import { touchSwapAim } from '../../input/touch';
import { ARENA_W, ARENA_H } from '../../engine/core/constants';
import { getMonster } from '../../engine/content/monsters';
import type { ClassId, InputCommand, InputState, Vec2 } from '../../engine/core/types';

/** Gamepad "Options / Start" button index (standard mapping) for the menu toggle. */
const PAD_MENU_BUTTON = 9;

/** How far (px) the cursor must sit from screen-centre to select a radial slot. */
const MOUSE_RADIAL_DEADZONE_PX = 44;

const NEUTRAL_BUTTONS = { basic: false, a1: false, a2: false, a3: false, revive: false };

/**
 * The class-radial pointing direction for the active input source. Returns a
 * vector whose magnitude means "distance from centre" (0 = centred → no
 * selection): the raw right stick on a pad, the Swap-button drag on touch, or the
 * cursor's offset from screen-centre on keyboard/mouse. Deliberately NOT the
 * sanitized reticle aim (which is never zero), so centring can cancel the swap.
 */
function radialDirection(
  source: InputSource,
  mouseScreen: Vec2,
  canvasW: number,
  canvasH: number,
): Vec2 {
  if (source === 'touch') return touchSwapAim();
  if (source === 'gamepad') return rawGamepadAim();
  const dx = mouseScreen.x - canvasW / 2;
  const dy = mouseScreen.y - canvasH / 2;
  const mag = Math.hypot(dx, dy);
  if (!(mag > MOUSE_RADIAL_DEADZONE_PX)) return { x: 0, y: 0 };
  return { x: dx / mag, y: dy / mag };
}

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
    let bannerSeq = 0; // increments per corruption beat (drives the HUD banner)

    // Multiclass class-radial (item 14): tap-vs-hold gesture + the slot the radial
    // is pointing at, remembered so a release can commit the last-hovered class.
    const swapGesture = new SwapGesture();
    let radialHover = -1;
    let radialShown = false; // whether the radial store currently shows the wheel

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
      input = new InputManager(renderer.app.canvas);

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

        // Freeze input while the shared sim is paused OR counting down to resume,
        // so nobody walks a predicted hero around a frozen arena.
        const frozen = isFrozen();

        // --- Multiclass class-radial (item 14): tap-vs-hold on the swap button ---
        // Owned classes / active class / swap gate come from the local player's
        // authoritative view (fresher than the throttled HUD bridge).
        const ownedClasses: ClassId[] = lp?.classes ?? [];
        const canOpenRadial = !frozen && ownedClasses.length >= 2 && lp?.state === 'alive';
        const g = swapGesture.update(now, sampled.buttons.swap ?? false, canOpenRadial);
        if (g.open) {
          const dir = radialDirection(
            input.activeSource,
            input.mouseScreen,
            container.clientWidth,
            container.clientHeight,
          );
          radialHover = hoveredSlot(dir.x, dir.y, ownedClasses.length);
          radialSet({
            open: true,
            options: ownedClasses,
            activeClassId: lp?.classId ?? null,
            hover: radialHover,
            ready: (lp?.swapCd ?? 0) <= 0,
          });
          radialShown = true;
        } else if (radialShown) {
          radialClose();
          radialShown = false;
        }
        // Resolve a release: a quick tap cycles; a radial release swaps to the
        // hovered class (centred = cancel). Host-authoritative resolution either way.
        if (!frozen && g.release === 'cycle' && ownedClasses.length >= 2) {
          swapClass();
        } else if (g.release === 'commit') {
          if (radialHover >= 0 && radialHover < ownedClasses.length) {
            swapClass(ownedClasses[radialHover]);
          }
          radialHover = -1;
        }

        seq += 1;
        // While the radial is open the hero is frozen too (stand still, no attacks,
        // facing held) so choosing a class never fires an ability or wanders off.
        const suppress = frozen || g.open;
        const cmd: InputCommand = {
          seq,
          move: suppress ? { x: 0, y: 0 } : sampled.move,
          aim: g.open ? { x: 0, y: 0 } : sampled.aim,
          buttons: suppress ? { ...NEUTRAL_BUTTONS } : sampled.buttons,
          autofire: suppress ? false : useStore.getState().autofire,
        };
        session?.setLocalInput(cmd);

        renderer.render(state);

        if (!useStore.getState().muted && state.events.length > 0) {
          sfx.handleEvents(state.events);
        }

        // Corruption beats are one-frame events — catch them here every frame
        // (the HUD push below is throttled and could drop one) and raise the
        // transient center-screen banner.
        for (const e of state.events) {
          if (e.t === 'corruption') {
            bannerSeq += 1;
            hudSet({ banner: { text: e.name, good: e.good === true, seq: bannerSeq } });
          } else if (e.t === 'deadlineWarn') {
            // Hardcore deadline warnings + chasm escalation (items 24/21/27) reuse
            // the transient banner instead of a ticking on-screen timer.
            bannerSeq += 1;
            hudSet({ banner: { text: e.text, good: e.good === true, seq: bannerSeq } });
          } else if (e.t === 'fightStart') {
            // Fight-start transition: name the boss the band is about to face.
            bannerSeq += 1;
            const boss = state.bosses[0];
            const name = boss ? getMonster(boss.monsterId).name : 'the boss';
            hudSet({ banner: { text: `${name} — get ready!`, good: true, seq: bannerSeq } });
          } else if (e.t === 'defeat') {
            // Party-wipe transition: a somber close, distinct from the victory banner.
            bannerSeq += 1;
            hudSet({ banner: { text: 'The warband falls', good: false, seq: bannerSeq } });
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
      window.removeEventListener('keydown', onKey);
      input?.dispose();
      renderer?.dispose();
      useHudStore.getState().resetHud();
      radialClose(); // never leave the class radial stranded across a fight teardown
    };
  }, []);

  return (
    <div className="game-root">
      <div ref={containerRef} className="game-canvas" />
      <HUD />
      {/* Mobile twin-stick overlay (renders only on touch-capable devices). Hidden
          while paused so its buttons don't sit over the pause menu. */}
      {!paused ? <TouchControls /> : null}
      {/* Hold-to-open multiclass class radial (item 14); self-hides when closed. */}
      <ClassRadial />
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
