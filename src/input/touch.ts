/**
 * Warband — on-screen TOUCH input (mobile control overlay).
 *
 * A module-level singleton the React overlay (`TouchControls`) writes to and the
 * `InputManager` reads as a third input source alongside keyboard/mouse and
 * gamepad. Keeping it here (not in React state) mirrors how the hot input path
 * reads bindings synchronously every frame, and lets EVERY scene that samples an
 * `InputManager` (the fight, the reward room, the menu playground) get touch
 * controls for free.
 *
 * Buttons are HELD state only (press = true until release) — the host does all
 * edge detection, exactly like the physical devices, so a virtual button can
 * never desync firing.
 */
import type { ButtonState, InputState, Vec2 } from '../engine/core/types';

const move: Vec2 = { x: 0, y: 0 };
const aim: Vec2 = { x: 0, y: 0 };
const buttons: ButtonState = {
  basic: false,
  a1: false,
  a2: false,
  a3: false,
  revive: false,
  sub1: false,
  sub2: false,
  swap: false,
  item: false,
};
let lastActivityMs = 0;

/** True on a touch-capable device (coarse pointer / touch points present). */
export function isTouchCapable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return (
      (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
      ('ontouchstart' in window) ||
      (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches)
    );
  } catch {
    return false;
  }
}

/** Set the movement vector from the left virtual stick (|v| already ≤ 1). */
export function setTouchMove(x: number, y: number): void {
  move.x = x;
  move.y = y;
  if (x !== 0 || y !== 0) lastActivityMs = now();
}

/** Set the aim direction from the right virtual stick (zero = leave aim as-is). */
export function setTouchAim(x: number, y: number): void {
  aim.x = x;
  aim.y = y;
  if (x !== 0 || y !== 0) lastActivityMs = now();
}

/** Set a virtual button's held state. */
export function setTouchButton(slot: keyof ButtonState, held: boolean): void {
  buttons[slot] = held;
  if (held) lastActivityMs = now();
}

/** Clear everything (on overlay unmount / dispose). */
export function resetTouch(): void {
  move.x = move.y = 0;
  aim.x = aim.y = 0;
  buttons.basic = buttons.a1 = buttons.a2 = buttons.a3 = buttons.revive = false;
  buttons.sub1 = buttons.sub2 = buttons.swap = buttons.item = false;
}

export function touchLastActivityMs(): number {
  return lastActivityMs;
}

/** Whether touch is engaged RIGHT NOW (a stick moved or a button held). */
export function touchEngaged(): boolean {
  return (
    move.x !== 0 ||
    move.y !== 0 ||
    aim.x !== 0 ||
    aim.y !== 0 ||
    buttons.basic ||
    buttons.a1 ||
    buttons.a2 ||
    buttons.a3 ||
    buttons.revive ||
    !!buttons.sub1 ||
    !!buttons.sub2 ||
    !!buttons.swap ||
    !!buttons.item
  );
}

/** A fresh `InputState` snapshot of the current touch state (copied, not shared). */
export function sampleTouch(): InputState {
  return {
    move: { x: move.x, y: move.y },
    aim: { x: aim.x, y: aim.y },
    buttons: { ...buttons },
  };
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : 0;
}
