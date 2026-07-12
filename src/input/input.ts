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

  constructor(target: HTMLElement) {
    this.keyboard = new KeyboardMouse(target);
  }

  get mouseScreen(): Vec2 {
    return this.keyboard.mouseScreen;
  }

  sample(localScreenPos: Vec2): InputState {
    const now = performance.now();
    const gp = sampleGamepad();
    if (gp && gp.active) {
      this.lastGamepadActiveMs = now;
    }

    const kbActivityMs = this.keyboard.lastActivityMs;

    // "Last-used device wins":
    //  - An actively-used gamepad always takes priority immediately.
    //  - An idle-but-connected gamepad keeps control only while it was the more
    //    recently used device AND within the sticky window; otherwise the
    //    keyboard/mouse reclaims it.
    //  - A pad that has never been active (ts 0) never wins.
    let useGamepad = false;
    if (gp) {
      if (gp.active) {
        useGamepad = true;
      } else if (this.lastGamepadActiveMs > 0) {
        const gamepadFresher = this.lastGamepadActiveMs >= kbActivityMs;
        const gamepadRecent = now - this.lastGamepadActiveMs <= GAMEPAD_STICKY_MS;
        useGamepad = gamepadFresher && gamepadRecent;
      }
    }

    // The on-screen touch overlay wins whenever it is engaged (a stick moved or a
    // button held) or was the most-recently-used source within the sticky window,
    // so a phone player keeps control without the idle keyboard reclaiming it.
    const touchMs = touchLastActivityMs();
    const otherMs = Math.max(useGamepad ? this.lastGamepadActiveMs : 0, kbActivityMs);
    const useTouch =
      touchEngaged() || (touchMs > 0 && touchMs >= otherMs && now - touchMs <= GAMEPAD_STICKY_MS);

    let state: InputState;
    if (useTouch) {
      this.activeSource = 'touch';
      state = sampleTouch();
    } else if (useGamepad && gp) {
      this.activeSource = 'gamepad';
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
      move: { x: mx, y: my },
      aim: { x: ax, y: ay },
      buttons: {
        basic: state.buttons.basic,
        a1: state.buttons.a1,
        a2: state.buttons.a2,
        a3: state.buttons.a3,
        revive: state.buttons.revive,
      },
    };
  }
}

/** Coerce a non-finite number (NaN/Infinity) to 0. */
function safe(n: number): number {
  return Number.isFinite(n) ? n : 0;
}
