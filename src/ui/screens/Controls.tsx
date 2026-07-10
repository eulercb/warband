/**
 * Warband — Controls (rebinding) overlay. Each player remaps their own keyboard
 * and gamepad buttons for movement and abilities; bindings persist locally (see
 * input/bindings.ts). Reachable from the main menu and the in-fight pause menu.
 */
import { useEffect, useRef, useState } from 'react';
import { closeControls, playUiSound } from '../state/session';
import { useStore } from '../state/store';
import { useGamepadMenu } from '../../input/useGamepadMenu';
import {
  useBindings,
  MOVE_ACTIONS,
  BUTTON_ACTIONS,
  ACTION_LABELS,
  PAD_SCHEMES,
  PAD_SCHEME_LABELS,
  codeToLabel,
  padIndexToLabel,
  type KeyAction,
  type ButtonAction,
} from '../../input/bindings';

type Capture = { mode: 'key'; action: KeyAction } | { mode: 'pad'; action: ButtonAction } | null;

/** Snapshot of currently-pressed gamepad button indices (any connected pad). */
function pressedPadButtons(): Set<number> {
  const out = new Set<number>();
  try {
    const nav = navigator as Navigator & { getGamepads?: () => (Gamepad | null)[] };
    for (const pad of nav.getGamepads?.() ?? []) {
      if (!pad || !pad.connected) continue;
      pad.buttons.forEach((b, i) => {
        if (b?.pressed) out.add(i);
      });
    }
  } catch {
    /* no gamepad API */
  }
  return out;
}

export default function Controls() {
  const bindings = useBindings((s) => s.bindings);
  const setKey = useBindings((s) => s.setKey);
  const setPad = useBindings((s) => s.setPad);
  const setPadScheme = useBindings((s) => s.setPadScheme);
  const reset = useBindings((s) => s.reset);
  const autofire = useStore((s) => s.autofire);
  const setAutofire = useStore((s) => s.setAutofire);
  const [capture, setCapture] = useState<Capture>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // While a rebind capture is pending, SUSPEND (don't disable) controller nav: the
  // handler stays topmost and swallows the assignment press so it can't leak down
  // to the pause menu / main menu beneath this overlay.
  useGamepadMenu(panelRef, { onBack: closeControls, suspended: capture !== null });

  // Capture a keyboard key for the pending key-rebind.
  useEffect(() => {
    if (capture?.mode !== 'key') return;
    const action = capture.action;
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code !== 'Escape') setKey(action, 0, e.code);
      setCapture(null);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [capture, setKey]);

  // Capture a gamepad button for the pending pad-rebind (poll for a NEW press).
  useEffect(() => {
    if (capture?.mode !== 'pad') return;
    const action = capture.action;
    const baseline = pressedPadButtons();
    let raf = 0;
    const poll = (): void => {
      const now = pressedPadButtons();
      for (const idx of now) {
        if (!baseline.has(idx)) {
          setPad(action, 0, idx);
          setCapture(null);
          return;
        }
      }
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, [capture, setPad]);

  const onClose = (): void => {
    playUiSound('uiClick');
    setCapture(null);
    closeControls();
  };

  // Escape closes the overlay (unless a rebind capture is in progress, where the
  // capture listener consumes Escape as "cancel this rebind" instead).
  useEffect(() => {
    if (capture) return;
    const onEsc = (e: KeyboardEvent): void => {
      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeControls();
      }
    };
    window.addEventListener('keydown', onEsc, { capture: true });
    return () => window.removeEventListener('keydown', onEsc, { capture: true });
  }, [capture]);

  const capturingKey = (a: KeyAction): boolean => capture?.mode === 'key' && capture.action === a;
  const capturingPad = (a: ButtonAction): boolean =>
    capture?.mode === 'pad' && capture.action === a;

  return (
    <div className="wb-overlay" role="dialog" aria-modal="true" aria-label="Controls">
      <div className="wb-panel wb-controls-panel" ref={panelRef}>
        <h2 className="wb-title wb-title-sm">Controls</h2>
        <p className="wb-subtitle">
          Click a button to rebind it, then press the key or gamepad button.
          {capture ? ' Press Esc to cancel.' : ''}
        </p>

        <div className="wb-pad-scheme">
          <span className="wb-field-label">Controller icons</span>
          <div className="wb-pad-scheme-row" role="group" aria-label="Controller icon style">
            {PAD_SCHEMES.map((scheme) => (
              <button
                type="button"
                key={scheme}
                className={`wb-btn wb-btn-chip${bindings.padScheme === scheme ? ' selected' : ''}`}
                onClick={() => {
                  playUiSound('uiClick');
                  setPadScheme(scheme);
                }}
                aria-pressed={bindings.padScheme === scheme}
              >
                {PAD_SCHEME_LABELS[scheme]}
              </button>
            ))}
          </div>
        </div>

        <div className="wb-controls-cols">
          <section className="wb-controls-col">
            <h3 className="wb-section-title">Keyboard</h3>
            <ul className="wb-bind-list">
              {(Object.keys(ACTION_LABELS) as KeyAction[]).map((action) => (
                <li key={action} className="wb-bind-row">
                  <span className="wb-bind-label">{ACTION_LABELS[action]}</span>
                  <button
                    type="button"
                    className={`wb-bind-key${capturingKey(action) ? ' listening' : ''}`}
                    onClick={() => {
                      playUiSound('uiClick');
                      setCapture({ mode: 'key', action });
                    }}
                  >
                    {capturingKey(action) ? 'Press a key…' : codeToLabel(bindings.keys[action][0])}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="wb-controls-col">
            <h3 className="wb-section-title">Controller</h3>
            <p className="wb-controls-note">
              Left stick moves, right stick aims. Rebind the action buttons below.
            </p>
            <ul className="wb-bind-list">
              {BUTTON_ACTIONS.map((action) => (
                <li key={action} className="wb-bind-row">
                  <span className="wb-bind-label">{ACTION_LABELS[action as KeyAction]}</span>
                  <button
                    type="button"
                    className={`wb-bind-key${capturingPad(action) ? ' listening' : ''}`}
                    onClick={() => {
                      playUiSound('uiClick');
                      setCapture({ mode: 'pad', action });
                    }}
                  >
                    {capturingPad(action)
                      ? 'Press a button…'
                      : padIndexToLabel(bindings.pad[action][0])}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
        {/* MOVE_ACTIONS referenced so movement rows stay grouped visually. */}
        <div className="wb-controls-hint" aria-hidden="true">
          Movement keys: {MOVE_ACTIONS.map((a) => codeToLabel(bindings.keys[a][0])).join(' · ')}
        </div>

        <button
          type="button"
          className={`wb-gauntlet-toggle${autofire ? ' on' : ''}`}
          onClick={() => {
            playUiSound('uiClick');
            setAutofire(!autofire);
          }}
          aria-pressed={autofire}
        >
          <span className="wb-gauntlet-check" aria-hidden="true">
            {autofire ? '✓' : ''}
          </span>
          <span className="wb-gauntlet-text">
            <span className="wb-gauntlet-title">Hold to auto-fire</span>
            <span className="wb-gauntlet-sub">
              {autofire
                ? 'Holding an ability button repeats it automatically (fires as soon as it comes off cooldown).'
                : 'Off: tap each ability button to use it. On: hold to keep firing.'}
            </span>
          </span>
        </button>

        <div className="wb-row wb-actions-row">
          <button
            type="button"
            className="wb-btn wb-btn-ghost"
            onClick={() => {
              playUiSound('uiClick');
              reset();
            }}
          >
            Reset to defaults
          </button>
          <button type="button" className="wb-btn wb-btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
