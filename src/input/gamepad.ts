/**
 * Warband — Gamepad input (DualSense-first, standard mapping).
 *
 * Reads the browser Gamepad API and produces a unified `InputState`. Buttons are
 * reported as HELD state only — edge detection (press vs. hold) happens on the
 * HOST per sim tick, never here.
 *
 * Standard mapping reference (https://w3c.github.io/gamepad/#remapping):
 *   axes[0], axes[1] = left stick  -> movement
 *   axes[2], axes[3] = right stick -> aim
 *   buttons[0] = A / Cross    -> basic
 *   buttons[1] = B / Circle   -> a1
 *   buttons[2] = X / Square   -> a2
 *   buttons[3] = Y / Triangle -> a3
 *   buttons[4] = L1  or  buttons[5] = R1 -> revive (either shoulder, held)
 */

import type { InputState, Vec2 } from '../engine/core/types';
import { DEAD_ZONE } from '../engine/core/constants';
import { getBindings } from './bindings';

/**
 * Apply a radial dead-zone to a raw stick vector. Returns a vector whose
 * magnitude is either 0 (inside the dead-zone) or rescaled into (0, 1] so the
 * response starts cleanly at the dead-zone edge with no jump. Never NaN.
 */
function applyDeadzone(x: number, y: number): Vec2 {
  const mag = Math.hypot(x, y);
  if (!Number.isFinite(mag) || mag < DEAD_ZONE) {
    return { x: 0, y: 0 };
  }
  // Rescale [DEAD_ZONE, 1] -> (0, 1] so there's no discontinuity at the edge.
  const scaled = Math.min((mag - DEAD_ZONE) / (1 - DEAD_ZONE), 1);
  return { x: (x / mag) * scaled, y: (y / mag) * scaled };
}

/** First connected pad, or null if none is present. */
function firstConnectedPad(): Gamepad | null {
  const nav = navigator as Navigator & {
    getGamepads?: () => (Gamepad | null)[];
  };
  const pads = nav.getGamepads?.() ?? [];
  for (const pad of pads) {
    if (pad && pad.connected) return pad;
  }
  return null;
}

/**
 * Sample the active gamepad. Returns null when no pad is connected so the
 * InputManager can fall back to keyboard/mouse.
 *
 * `active` is true when the player is currently doing something on the pad
 * (either stick beyond the dead-zone, or any mapped button pressed) — the
 * InputManager uses it to implement "last-used device wins".
 */
export function sampleGamepad(): { state: InputState; connected: boolean; active: boolean } | null {
  const pad = firstConnectedPad();
  if (!pad) return null;

  const axes = pad.axes;
  const rawLx = axes[0] ?? 0;
  const rawLy = axes[1] ?? 0;
  const rawRx = axes[2] ?? 0;
  const rawRy = axes[3] ?? 0;

  // Movement: dead-zoned left stick, magnitude clamped to 1.
  const moveVec = applyDeadzone(rawLx, rawLy);
  let moveLen = Math.hypot(moveVec.x, moveVec.y);
  const move: Vec2 = { x: moveVec.x, y: moveVec.y };
  if (moveLen > 1) {
    move.x /= moveLen;
    move.y /= moveLen;
    moveLen = 1;
  }

  // Aim: unit vector of the right stick. Inside the dead-zone the aim is
  // {0,0} = "no new aim" (the InputManager keeps the last reticle direction).
  const aimVec = applyDeadzone(rawRx, rawRy);
  const aimLen = Math.hypot(aimVec.x, aimVec.y);
  const aim: Vec2 = aimLen > 0 ? { x: aimVec.x / aimLen, y: aimVec.y / aimLen } : { x: 0, y: 0 };

  const pressed = (i: number): boolean => pad.buttons[i]?.pressed === true;
  const anyPressed = (indices: number[]): boolean => indices.some(pressed);
  // Action buttons are player-configurable; sticks stay fixed (left=move,
  // right=aim). See input/bindings.ts.
  const padB = getBindings().pad;
  const buttons = {
    basic: anyPressed(padB.basic),
    a1: anyPressed(padB.a1),
    a2: anyPressed(padB.a2),
    a3: anyPressed(padB.a3),
    revive: anyPressed(padB.revive),
    sub1: anyPressed(padB.sub1),
    sub2: anyPressed(padB.sub2),
    swap: anyPressed(padB.swap),
    item: anyPressed(padB.item),
  };

  const anyButton =
    buttons.basic ||
    buttons.a1 ||
    buttons.a2 ||
    buttons.a3 ||
    buttons.revive ||
    buttons.sub1 ||
    buttons.sub2 ||
    buttons.swap ||
    buttons.item;
  const active = moveLen > 0 || aimLen > 0 || anyButton;

  const state: InputState = { move, aim, buttons };
  return { state, connected: true, active };
}

/**
 * Raw right-stick aim (dead-zoned), for the class-radial's pointing direction.
 * Unlike the InputManager's sanitized aim — which persists the last reticle
 * heading so it is never zero — this returns {0,0} inside the dead-zone, so
 * "centred = no selection" is detectable while choosing a class to swap to.
 */
export function rawGamepadAim(): Vec2 {
  const pad = firstConnectedPad();
  if (!pad) return { x: 0, y: 0 };
  return applyDeadzone(pad.axes[2] ?? 0, pad.axes[3] ?? 0);
}

/**
 * Fire a standard "dual-rumble" haptic effect on the first connected pad.
 * Fully feature-detected and wrapped in try/catch: browsers/pads without the
 * Gamepad haptics extension simply do nothing. DualSense adaptive triggers are
 * not exposed to the browser, so this is standard rumble only.
 */
export function rumble(intensity = 0.5, durationMs = 120): void {
  try {
    const pad = firstConnectedPad();
    if (!pad) return;

    const actuator = (
      pad as Gamepad & {
        vibrationActuator?: {
          playEffect?: (type: string, params: Record<string, number>) => Promise<unknown>;
        };
      }
    ).vibrationActuator;

    const magnitude = Math.max(0, Math.min(1, intensity));
    void actuator?.playEffect?.('dual-rumble', {
      duration: Math.max(0, durationMs),
      strongMagnitude: magnitude,
      weakMagnitude: magnitude,
    });
  } catch {
    // Haptics unsupported on this pad/browser — silently ignore.
  }
}
