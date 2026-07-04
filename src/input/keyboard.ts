/**
 * Warband — Keyboard + mouse input (fallback used when no gamepad is in play).
 *
 * Produces a unified `InputState`. Buttons are HELD state only; the HOST does
 * edge detection per sim tick — never here.
 *
 * FINAL BUTTON MAPPING
 * --------------------------------------------------------------------------
 *   Move   : W / A / S / D   or   Arrow keys        (normalized, |move| <= 1)
 *   Aim    : mouse cursor (unit vector from the local player to the cursor)
 *   basic  : LEFT MOUSE CLICK   or   SPACE
 *   a1     : Q                  (alias: 1)
 *   a2     : E                  (alias: 2)
 *   a3     : R                  (alias: 3)
 *   revive : F                  (hold)
 * --------------------------------------------------------------------------
 */

import type { InputState, Vec2 } from '../engine/types';

/**
 * Every keyboard `KeyboardEvent.code` we care about. Used both to filter which
 * keys we track and which keys we `preventDefault()` (so Space/Arrows don't
 * scroll the page) without swallowing browser shortcuts like F5.
 */
const RELEVANT_CODES: ReadonlySet<string> = new Set<string>([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'KeyQ', 'KeyE', 'KeyR', 'KeyF',
  'Digit1', 'Digit2', 'Digit3',
]);

export class KeyboardMouse {
  /** Latest mouse position in CSS px relative to the target element. */
  mouseScreen: Vec2 = { x: 0, y: 0 };
  /** performance.now() timestamp of the last keyboard/mouse activity. */
  lastActivityMs = 0;

  private readonly target: HTMLElement;
  private readonly held = new Set<string>();
  private mouseLeftDown = false;
  /** Last non-degenerate aim; default points "up" so the reticle has a heading. */
  private lastAim: Vec2 = { x: 0, y: -1 };

  // Bound handlers are retained so dispose() removes exactly what it added.
  private readonly onKeyDown: (e: KeyboardEvent) => void;
  private readonly onKeyUp: (e: KeyboardEvent) => void;
  private readonly onMouseMove: (e: MouseEvent) => void;
  private readonly onMouseDown: (e: MouseEvent) => void;
  private readonly onMouseUp: (e: MouseEvent) => void;
  private readonly onContextMenu: (e: MouseEvent) => void;

  constructor(target: HTMLElement) {
    this.target = target;

    this.onKeyDown = (e) => {
      if (!RELEVANT_CODES.has(e.code)) return;
      this.held.add(e.code);
      this.lastActivityMs = performance.now();
      e.preventDefault(); // stop Space/Arrows from scrolling the page
    };

    this.onKeyUp = (e) => {
      if (this.held.delete(e.code)) {
        this.lastActivityMs = performance.now();
      }
    };

    this.onMouseMove = (e) => {
      const rect = this.target.getBoundingClientRect();
      this.mouseScreen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      this.lastActivityMs = performance.now();
    };

    this.onMouseDown = (e) => {
      if (e.button === 0) this.mouseLeftDown = true;
      this.lastActivityMs = performance.now();
      // Prevent text selection while dragging across the game surface.
      e.preventDefault();
    };

    this.onMouseUp = (e) => {
      if (e.button === 0) this.mouseLeftDown = false;
      this.lastActivityMs = performance.now();
    };

    this.onContextMenu = (e) => {
      e.preventDefault(); // no browser context menu on right-click
    };

    // Key events on `window` so they fire without the target holding focus.
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    // Mouse-up on `window` so a release outside the target still clears state.
    window.addEventListener('mouseup', this.onMouseUp);
    target.addEventListener('mousemove', this.onMouseMove);
    target.addEventListener('mousedown', this.onMouseDown);
    target.addEventListener('contextmenu', this.onContextMenu);
  }

  /**
   * Build the current `InputState`. `localScreenPos` is the local player's
   * on-screen position (CSS px, same frame of reference as `mouseScreen`) used
   * to derive the aim direction.
   */
  sample(localScreenPos: Vec2): InputState {
    // --- Movement (WASD + arrows), magnitude clamped to 1 ---
    let mx = 0;
    let my = 0;
    if (this.held.has('KeyA') || this.held.has('ArrowLeft')) mx -= 1;
    if (this.held.has('KeyD') || this.held.has('ArrowRight')) mx += 1;
    if (this.held.has('KeyW') || this.held.has('ArrowUp')) my -= 1;
    if (this.held.has('KeyS') || this.held.has('ArrowDown')) my += 1;
    const moveLen = Math.hypot(mx, my);
    if (moveLen > 1) {
      mx /= moveLen;
      my /= moveLen;
    }
    const move: Vec2 = { x: mx, y: my };

    // --- Aim: unit vector from the local player to the cursor ---
    const dx = this.mouseScreen.x - localScreenPos.x;
    const dy = this.mouseScreen.y - localScreenPos.y;
    const dist = Math.hypot(dx, dy);
    let aim: Vec2;
    if (dist > 0 && Number.isFinite(dist)) {
      aim = { x: dx / dist, y: dy / dist };
      this.lastAim = { x: aim.x, y: aim.y };
    } else {
      // Cursor sits exactly on the player — keep the previous aim direction.
      aim = { x: this.lastAim.x, y: this.lastAim.y };
    }

    // --- Buttons (held state; edges detected host-side) ---
    const buttons = {
      basic: this.mouseLeftDown || this.held.has('Space'),
      a1: this.held.has('KeyQ') || this.held.has('Digit1'),
      a2: this.held.has('KeyE') || this.held.has('Digit2'),
      a3: this.held.has('KeyR') || this.held.has('Digit3'),
      revive: this.held.has('KeyF'),
    };

    return { move, aim, buttons };
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.target.removeEventListener('mousemove', this.onMouseMove);
    this.target.removeEventListener('mousedown', this.onMouseDown);
    this.target.removeEventListener('contextmenu', this.onContextMenu);
    this.held.clear();
    this.mouseLeftDown = false;
  }
}
