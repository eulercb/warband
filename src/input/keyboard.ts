/**
 * Warband — Keyboard + mouse input (fallback used when no gamepad is in play).
 *
 * Produces a unified `InputState`. Buttons are HELD state only; the HOST does
 * edge detection per sim tick — never here.
 *
 * The key→action map is player-configurable (see `input/bindings.ts`); this
 * module reads the live bindings every sample and every keydown. Aim is always
 * the mouse cursor (a unit vector from the local player), and left-mouse always
 * counts as the basic attack regardless of the keyboard `basic` binding.
 */

import type { InputState, Vec2 } from '../engine/types';
import { getBindings, type KeyAction } from './bindings';

/** Whether `code` is currently bound to any action (drives track + preventDefault). */
function isBoundCode(code: string): boolean {
  const keys = getBindings().keys;
  for (const action of Object.keys(keys) as KeyAction[]) {
    if (keys[action].includes(code)) return true;
  }
  return false;
}

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
      if (!isBoundCode(e.code)) return;
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
    const keys = getBindings().keys;
    const down = (action: KeyAction): boolean =>
      keys[action].some((code) => this.held.has(code));

    // --- Movement (bound keys), magnitude clamped to 1 ---
    let mx = 0;
    let my = 0;
    if (down('left')) mx -= 1;
    if (down('right')) mx += 1;
    if (down('up')) my -= 1;
    if (down('down')) my += 1;
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

    // --- Buttons (held state; edges detected host-side). Left mouse always
    // counts as basic, in addition to the bound basic key. ---
    const buttons = {
      basic: this.mouseLeftDown || down('basic'),
      a1: down('a1'),
      a2: down('a2'),
      a3: down('a3'),
      revive: down('revive'),
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
