/**
 * Warband — main menu, reimagined as a WALKABLE PLAYGROUND. The moment the app
 * opens you're standing in the arena as your hero: walk around, hit the
 * training dummy, feel the game — then carry your momentum into a real fight
 * by walking onto one of four totems (Host / Join / Change Hero / Controls).
 * The classic buttons remain in the corner panel for mouse-first players,
 * accessibility, and automation.
 */
import { useEffect, useRef, useState } from 'react';
import './styles.css';
import { useStore } from './store';
import { playUiSound, openControls, sfx } from './session';
import { useGamepadMenu } from '../input/useGamepadMenu';
import VolumeControl from './VolumeControl';
import HUD from './HUD';
import { useHudStore } from './hudStore';
import { pushHud } from './hudBridge';
import { Playground } from './playground';
import { Renderer } from '../render/renderer';
import { InputManager } from '../input/input';
import { ARENA_W, ARENA_H } from '../engine/constants';
import { CLASSES, CLASS_IDS } from '../engine/classes';
import type { ClassId, InputCommand, TotemKind } from '../engine/types';

/** Seconds a hero must hold their ground on a totem before it activates. */
const TOTEM_DWELL_S = 0.9;

const TOTEM_VERBS: Record<TotemKind, string> = {
  host: 'Raising your banner…',
  join: 'Answering the call…',
  class: 'Reading your destiny…',
  controls: 'Studying the manual…',
};

export function MainMenu() {
  const error = useStore((s) => s.error);
  const setPhase = useStore((s) => s.setPhase);
  const localClass = useStore((s) => s.localClass);
  const setLocalClass = useStore((s) => s.setLocalClass);
  const canvasRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const playgroundRef = useRef<Playground | null>(null);

  const [showPicker, setShowPicker] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  const [dwell, setDwell] = useState<{ kind: TotemKind; frac: number } | null>(null);

  // Gamepad nav drives the class picker when it's open; otherwise the pad
  // belongs to the hero (walk to a totem instead of scrolling a menu).
  useGamepadMenu(pickerRef, { enabled: showPicker, onBack: () => setShowPicker(false) });

  // Refs mirroring transient UI state into the imperative render loop. Written
  // in an effect (not during render) so render stays pure; the RAF loop reads
  // `.current` on the next frame, so a one-commit lag is imperceptible.
  const showPickerRef = useRef(showPicker);
  useEffect(() => {
    showPickerRef.current = showPicker;
  }, [showPicker]);

  useEffect(() => {
    const container = canvasRef.current;
    if (!container) return;

    let renderer: Renderer | null = null;
    let input: InputManager | null = null;
    let raf = 0;
    let disposed = false;
    let seq = 0;
    let lastHud = 0;
    let moved = false;
    let dwellS = 0;
    let armedTotem: string | null = null; // trigger re-arms after stepping off
    let lastDwellFrac = -1; // last frac pushed to React (-1 = none shown)
    let lastNow = 0;

    const st = useStore.getState();
    const playground = new Playground(st.localName || 'Hero', st.localClass);
    playgroundRef.current = playground;

    // Auto-dismiss the opening title after a few seconds even if idle.
    const introTimer = setTimeout(() => setIntroDone(true), 5200);

    const trigger = (kind: TotemKind): void => {
      playUiSound('uiConfirm');
      if (kind === 'host') setPhase('hostSetup');
      else if (kind === 'join') setPhase('join');
      else if (kind === 'class') setShowPicker(true);
      else openControls();
    };

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
        const dt = lastNow === 0 ? 1 / 60 : Math.min(0.1, (now - lastNow) / 1000);
        lastNow = now;

        // Freeze the hero while an overlay (class picker / controls) is up.
        const uiOpen = showPickerRef.current || useStore.getState().showControls;

        const state = playground.frame(now);
        const localId = state.localPlayerId;
        const lp = localId != null ? state.players.find((p) => p.id === localId) : null;
        const localScreen = lp
          ? renderer.worldToScreen(lp.pos)
          : { x: container.clientWidth / 2, y: container.clientHeight / 2 };

        const sampled = input.sample(localScreen);
        if (!moved && (sampled.move.x !== 0 || sampled.move.y !== 0)) {
          moved = true;
          setIntroDone(true);
        }
        seq += 1;
        const cmd: InputCommand = {
          seq,
          move: uiOpen ? { x: 0, y: 0 } : sampled.move,
          aim: sampled.aim,
          buttons: uiOpen
            ? { basic: false, a1: false, a2: false, a3: false, revive: false }
            : sampled.buttons,
          autofire: useStore.getState().autofire,
        };
        playground.setInput(cmd);

        renderer.render(state);
        if (!useStore.getState().muted && state.events.length > 0) {
          sfx.handleEvents(state.events);
        }

        // Totem dwell: stand on a totem to channel its action. A totem that
        // fired stays "armed" until the hero steps OFF it — including while
        // the overlay it opened is up — so closing the class picker doesn't
        // immediately re-channel the totem you're still standing on.
        const active = playground.activeTotem();
        if (!active) {
          dwellS = 0;
          armedTotem = null;
          if (lastDwellFrac >= 0) {
            lastDwellFrac = -1;
            setDwell(null);
          }
        } else if (uiOpen) {
          // Overlay open: freeze the channel but keep the armed state.
          dwellS = 0;
          if (lastDwellFrac >= 0) {
            lastDwellFrac = -1;
            setDwell(null);
          }
        } else if (armedTotem !== active.kind) {
          dwellS += dt;
          const frac = Math.min(1, dwellS / TOTEM_DWELL_S);
          // Throttle React updates: only re-render on visible progress steps.
          if (frac >= 1 || frac - lastDwellFrac >= 0.05 || lastDwellFrac < 0) {
            lastDwellFrac = frac;
            setDwell({ kind: active.kind, frac });
          }
          if (dwellS >= TOTEM_DWELL_S) {
            armedTotem = active.kind; // don't re-fire until they step off
            dwellS = 0;
            lastDwellFrac = -1;
            setDwell(null);
            trigger(active.kind);
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
      clearTimeout(introTimer);
      cancelAnimationFrame(raf);
      input?.dispose();
      renderer?.dispose();
      playgroundRef.current = null;
      useHudStore.getState().resetHud();
    };
    // Mount-once by design: the playground grabs its config from the store and
    // owns its own loop (mirrors GameView's []-dep effect).
  }, [setPhase]);

  const goHost = (): void => {
    playUiSound('uiClick');
    setPhase('hostSetup');
  };
  const goJoin = (): void => {
    playUiSound('uiClick');
    setPhase('join');
  };
  const goControls = (): void => {
    playUiSound('uiClick');
    openControls();
  };
  const pickClass = (id: ClassId): void => {
    playUiSound('uiConfirm');
    setLocalClass(id);
    playgroundRef.current?.setClass(id);
    setShowPicker(false);
  };

  return (
    <div className="wb-playground-root">
      <div ref={canvasRef} className="wb-playground-canvas" />
      <HUD />

      {/* Corner panel: the classic menu, for pointer/keyboard users. */}
      <div className="wb-panel wb-playground-panel" ref={panelRef}>
        <h1 className="wb-title">WARBAND</h1>
        <p className="wb-tagline">Walk to a totem — or just start swinging.</p>
        <div className="wb-menu-actions">
          <button type="button" className="wb-btn wb-btn-primary" onClick={goHost}>
            Host Game
          </button>
          <button type="button" className="wb-btn wb-btn-primary" onClick={goJoin}>
            Join Game
          </button>
        </div>
        <div className="wb-menu-secondary">
          <button type="button" className="wb-btn wb-btn-ghost" onClick={() => setShowPicker(true)}>
            Hero: {CLASSES[localClass].name}
          </button>
          <button type="button" className="wb-btn wb-btn-ghost" onClick={goControls}>
            Controls
          </button>
          <VolumeControl />
        </div>
        {error ? (
          <div className="wb-error" role="alert">
            {error}
          </div>
        ) : null}
      </div>

      {/* Totem channel progress */}
      {dwell && (
        <div className="wb-totem-hint">
          <div className="wb-totem-hint-label">{TOTEM_VERBS[dwell.kind]}</div>
          <div className="wb-totem-hint-track">
            <div className="wb-totem-hint-fill" style={{ width: `${dwell.frac * 100}%` }} />
          </div>
        </div>
      )}

      {/* Opening title: procedural per-letter reveal, dismissed on first step. */}
      {!introDone && (
        <div className="wb-intro" aria-hidden="true">
          <div className="wb-intro-title">
            {'WARBAND'.split('').map((ch, i) => (
              <span key={i} className="wb-intro-letter" style={{ animationDelay: `${i * 90}ms` }}>
                {ch}
              </span>
            ))}
          </div>
          <div className="wb-intro-sub">move to begin — WASD / left stick</div>
        </div>
      )}

      {/* Class picker overlay (from the CHANGE HERO totem or the panel). */}
      {showPicker && (
        <div className="wb-overlay" role="dialog" aria-label="Choose your hero">
          <div className="wb-panel wb-picker-panel" ref={pickerRef}>
            <h2 className="wb-title-sm">Choose your hero</h2>
            <div className="wb-picker-grid">
              {CLASS_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  data-cls={id}
                  className={`wb-card wb-class-card wb-picker-card${id === localClass ? ' selected' : ''}`}
                  onClick={() => pickClass(id)}
                >
                  <span className="wb-card-name">{CLASSES[id].name}</span>
                  <span className="wb-card-role">{CLASSES[id].role}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="wb-btn wb-btn-ghost"
              onClick={() => setShowPicker(false)}
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default MainMenu;
