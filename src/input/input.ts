/**
 * Warband — unified input manager.
 *
 * Merges gamepad and keyboard/mouse into a single `InputState` and implements
 * "last-used device wins" so a player can swap between pad and mouse mid-fight.
 *
 * Guarantees enforced here (see `sanitize`):
 *   - No NaN ever leaves this module.
 *   - `move` magnitude is always within [0, 1].
 *   - `aim` is always a unit vector, or the persisted last aim when the current
 *     sample has none (so the reticle never snaps to center).
 */

import type { InputState, Vec2 } from '../engine/core/types';
import { sampleGamepad } from './gamepad';
import { KeyboardMouse } from './keyboard';
import { BUTTON_ACTIONS } from './bindings';
import { sampleTouch, touchEngaged, touchLastActivityMs } from './touch';

export type InputSource = 'keyboard' | 'gamepad' | 'touch';

/**
 * How long (ms) an idle-but-connected gamepad stays the active source after its
 * last real input before control can fall back to the keyboard/mouse.
 */
const GAMEPAD_STICKY_MS = 2000;

export class InputManager {
  activeSource: InputSource = 'keyboard';

  private readonly keyboard: KeyboardMouse;
  /** Shared reticle direction persisted across devices; defaults to "up". */
  private lastAim: Vec2 = { x: 0, y: -1 };
  private lastGamepadActiveMs = 0;
  private lastKeyboardActivityMs = 0;
  private previousPadState?: InputState;

  constructor(target: HTMLElement) {
    this.keyboard = new KeyboardMouse(target);
  }

  get mouseScreen(): Vec2 {
    return this.keyboard.mouseScreen;
  }

  sample(localScreenPos: Vec2): InputState {
    const now = performance.now();
    const gp = sampleGamepad();
    const kbActivityMs = this.keyboard.lastActivityMs;
    const keyboardChanged = kbActivityMs > this.lastKeyboardActivityMs;
    this.lastKeyboardActivityMs = kbActivityMs;

    // A held button or a stationary stick can sustain control, but only a new
    // press or a stick movement can take it back from another device.
    if (gp?.active && newPadIntent(gp.state, this.previousPadState)) {
      this.previousPadState = gp.state;
      if (!keyboardChanged) this.lastGamepadActiveMs = now;
    } else if (gp && this.previousPadState) {
      // Keep the last meaningful stick positions for slow, deliberate changes.
      // Releases update the baseline so the same direction can be used again.
      this.previousPadState.buttons = gp.state.buttons;
      if (!hasDirection(gp.state.move)) this.previousPadState.move = gp.state.move;
      if (!hasDirection(gp.state.aim)) this.previousPadState.aim = gp.state.aim;
    }
    if (!gp) {
      this.previousPadState = undefined;
      this.lastGamepadActiveMs = 0;
    }

    const useGamepad =
      gp !== null &&
      this.lastGamepadActiveMs > 0 &&
      this.lastGamepadActiveMs > kbActivityMs &&
      (now - this.lastGamepadActiveMs <= GAMEPAD_STICKY_MS ||
        (this.activeSource === 'gamepad' && gp.active));

    const touchMs = touchLastActivityMs();
    const otherMs = Math.max(useGamepad ? this.lastGamepadActiveMs : 0, kbActivityMs);
    const useTouch =
      touchMs >= otherMs && (touchEngaged() || (touchMs > 0 && now - touchMs <= GAMEPAD_STICKY_MS));

    let state: InputState;
    if (useTouch) {
      this.activeSource = 'touch';
      state = sampleTouch();
    } else if (useGamepad && gp) {
      this.activeSource = 'gamepad';
      if (gp.active) this.lastGamepadActiveMs = now;
      state = gp.state;
    } else {
      this.activeSource = 'keyboard';
      state = this.keyboard.sample(localScreenPos);
    }

    return this.sanitize(state);
  }

  dispose(): void {
    this.keyboard.dispose();
  }

  /**
   * Final guard before input leaves the module: strip NaN, keep move magnitude
   * in [0, 1], and substitute the persisted last aim whenever the current aim
   * is zero. Any valid non-zero aim updates `lastAim`, so both devices share a
   * single continuous reticle direction.
   */
  private sanitize(state: InputState): InputState {
    let mx = safe(state.move.x);
    let my = safe(state.move.y);
    const moveLen = Math.hypot(mx, my);
    if (moveLen > 1) {
      mx /= moveLen;
      my /= moveLen;
    }

    let ax = safe(state.aim.x);
    let ay = safe(state.aim.y);
    const aimLen = Math.hypot(ax, ay);
    if (aimLen > 0) {
      // Re-normalize to guarantee a clean unit vector, then remember it.
      ax /= aimLen;
      ay /= aimLen;
      this.lastAim = { x: ax, y: ay };
    } else {
      ax = this.lastAim.x;
      ay = this.lastAim.y;
    }

    return {
      ...(state.pointerDistance !== undefined
        ? { pointerDistance: Math.max(0, safe(state.pointerDistance)) }
        : {}),
      move: { x: mx, y: my },
      aim: { x: ax, y: ay },
      buttons: {
        basic: state.buttons.basic,
        a1: state.buttons.a1,
        a2: state.buttons.a2,
        a3: state.buttons.a3,
        revive: state.buttons.revive,
        sub1: state.buttons.sub1 ?? false,
        sub2: state.buttons.sub2 ?? false,
        swap: state.buttons.swap ?? false,
        item: state.buttons.item ?? false,
      },
    };
  }
}

/** Coerce a non-finite number (NaN/Infinity) to 0. */
function safe(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

function hasDirection(vector: Vec2): boolean {
  return vector.x !== 0 || vector.y !== 0;
}

function stickChanged(next: Vec2, previous: Vec2): boolean {
  if (!hasDirection(next)) return false;
  if (!hasDirection(previous)) return true;
  return Math.hypot(next.x - previous.x, next.y - previous.y) >= 0.18;
}

function newPadIntent(state: InputState, previous: InputState | undefined): boolean {
  if (!previous) return true;
  return (
    stickChanged(state.move, previous.move) ||
    stickChanged(state.aim, previous.aim) ||
    BUTTON_ACTIONS.some((button) => state.buttons[button] && !previous.buttons[button])
  );
}
