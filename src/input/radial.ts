/**
 * Warband — the multiclass class-radial gesture (item 14).
 *
 * The swap control is tap-vs-hold: a quick tap CYCLES to the next owned class,
 * while HOLDING opens an on-screen radial of owned classes that you release onto
 * to swap directly. That disambiguation lives here (client-side) — never in the
 * host sim — so a hold can't accidentally cycle on the initial button press.
 *
 * This module is pure and device-agnostic: the caller (GameView) feeds it the
 * unified swap-button held state each frame (keyboard/gamepad/touch already
 * merged) plus a pointing direction, and it decides open/closed + what to enact
 * on release. Geometry helpers (`slotAngle`/`hoveredSlot`) place the owned
 * classes evenly around the wheel and map a direction to the highlighted slot.
 */
import type { Vec2 } from '../engine/core/types';

/** Hold the swap button at least this long (ms) to open the radial (else it's a tap). */
export const RADIAL_HOLD_MS = 220;

/** What the gesture wants enacted at the end of a frame. */
export interface SwapGestureFrame {
  /** The radial is open right now (held past the threshold while openable). */
  open: boolean;
  /**
   * The button was released this frame: `cycle` for a quick tap (advance to the
   * next class), `commit` to enact the radial's current selection, or null if
   * nothing was released this frame.
   */
  release: null | 'cycle' | 'commit';
}

/**
 * Tap-vs-hold state machine for the swap button. One instance per local player;
 * drive it once per frame with {@link update}.
 */
export class SwapGesture {
  private held = false;
  private opened = false;
  private pressT = 0;

  /**
   * Advance the gesture one frame.
   *
   * @param now       Monotonic timestamp (ms) — `performance.now()`.
   * @param swapHeld  Unified swap-button held state (all input sources merged).
   * @param canOpen   Whether a radial may be shown now: ≥2 owned classes, the
   *                  hero alive, and the fight not frozen. When false the gesture
   *                  degrades to a plain tap-cycle (no radial).
   */
  update(now: number, swapHeld: boolean, canOpen: boolean): SwapGestureFrame {
    let release: SwapGestureFrame['release'] = null;

    if (swapHeld && !this.held) {
      // Rising edge — begin timing a fresh press.
      this.held = true;
      this.opened = false;
      this.pressT = now;
    } else if (!swapHeld && this.held) {
      // Falling edge — a release resolves to a radial commit or a tap-cycle.
      this.held = false;
      release = this.opened ? 'commit' : 'cycle';
      this.opened = false;
    }

    // Once held past the threshold (and still openable) the radial latches open.
    if (this.held && canOpen && now - this.pressT >= RADIAL_HOLD_MS) {
      this.opened = true;
    }
    // If it stops being openable mid-hold (paused, downed…), drop back to a tap so
    // the eventual release cycles rather than committing a selection you can't see.
    if (this.held && !canOpen) {
      this.opened = false;
    }

    return { open: this.held && this.opened, release };
  }

  /** True while the radial is currently open. */
  get isOpen(): boolean {
    return this.held && this.opened;
  }

  /** Reset to idle (scene teardown / pause) without emitting a release. */
  reset(): void {
    this.held = false;
    this.opened = false;
    this.pressT = 0;
  }
}

/**
 * Screen-space angle (radians) of slot `i` of `n` around the wheel: slot 0 sits
 * at the top (−90°) and the rest march clockwise. Screen space means +y points
 * down, so this matches an aim direction taken straight from pointer/stick input.
 */
export function slotAngle(i: number, n: number): number {
  if (n <= 0) return 0;
  return -Math.PI / 2 + (i / n) * Math.PI * 2;
}

/** Signed smallest difference a−b folded into (−π, π]. */
function angleDelta(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Which wheel slot a pointing direction selects, or −1 when the direction is
 * inside the dead-zone (no selection → releasing there cancels the swap). The
 * caller is expected to pass a direction already scaled so its magnitude means
 * "how far from centre" (0 = centred); `deadzone` is that magnitude threshold.
 */
export function hoveredSlot(dx: number, dy: number, n: number, deadzone = 0.0001): number {
  if (n <= 0) return -1;
  const mag = Math.hypot(dx, dy);
  if (!Number.isFinite(mag) || mag <= deadzone) return -1;
  const ang = Math.atan2(dy, dx);
  let best = -1;
  let bestDiff = Infinity;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(angleDelta(ang, slotAngle(i, n)));
    if (d < bestDiff) {
      bestDiff = d;
      best = i;
    }
  }
  return best;
}

/** Unit-circle offset of slot `i` of `n` (for laying the wheel out in the DOM). */
export function slotOffset(i: number, n: number): Vec2 {
  const a = slotAngle(i, n);
  return { x: Math.cos(a), y: Math.sin(a) };
}
